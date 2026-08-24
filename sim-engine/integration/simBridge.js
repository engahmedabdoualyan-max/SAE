/**
 * @file SimBridge — glue between the SAE AutoSim Hub UI (Google Maps + Canvas,
 * FLEET / CORRIDORS / TYPE_SPEED / BLACKSPOTS globals in `assets/app.js`) and
 * the microsimulation engine in `sim-engine/`.
 *
 * Responsibilities:
 *  - build a {@link Network} graph from the CORRIDORS polyline data
 *  - build an OD demand matrix from FLEET profile weights + corridor types
 *  - drive the engine inside a MODULE Web Worker (main-thread fallback when
 *    workers are unavailable, e.g. `file://` or strict CSP)
 *  - render live vehicle positions as Google Maps markers (canvas fallback)
 *  - colour corridor polylines by simulated speed ("heatmap")
 *  - export scenarios to SUMO (.net.xml + .rou.xml) and PTV VISSIM (.inpx)
 *  - persist/load scenarios through {@link ScenarioManager} (localStorage)
 *
 * @example
 * import { SimBridge } from './sim-engine/integration/simBridge.js';
 * const bridge = new SimBridge({
 *   mapElementId: 'ringroad-map',
 *   canvasElementId: 'sim-canvas',
 *   fleetProfiles: window.FLEET,          // assets/app.js global
 *   corridors: window.CORRIDORS,          // assets/app.js global
 *   blackspots: window.BLACKSPOTS,
 * });
 * await bridge.initMap();
 * await bridge.startSimulation({ dt: 1, speed: 2 });
 */

import { Network } from '../network/graph.js';
import { ScenarioManager } from '../scenario/manager.js';
import { exportSUMO, exportOpenDRIVE, exportGeoJSON } from '../io/networkIO.js';
import { generateDemand, routeDemand } from '../demand/odMatrix.js';
import { mpsToKmh } from '../utils/units.js';

/** Fleet profile key → engine vehicle type (`TYPE_SPECS` in models/vehicle.js). */
export const FLEET_TYPE_MAP = Object.freeze({
  mlaijy: 'sedan',
  sedan: 'sedan',
  taxi: 'sedan',
  suv: 'sedan',
  luxury: 'sedan',
  microbus: 'bus',
  bus: 'bus',
  noss_naql: 'truck',
  rob_naql: 'truck',
  naql_taqeel: 'truck',
  truck: 'truck',
  motorcycle: 'motorcycle',
  bicycle: 'bicycle',
  trooscoor: 'tuktuk',
  tuktuk: 'tuktuk',
  av_l1: 'av',
  av_l2: 'av',
  av_l3: 'av',
  av_l4: 'av',
  av_l5: 'av',
  av: 'av',
});

const DEFAULT_CONFIG = Object.freeze({
  mapElementId: 'ringroad-map',
  canvasElementId: 'sim-canvas',
  defaultCenter: { lat: 30.0444, lng: 31.2357 }, // Cairo
  defaultZoom: 11,
  highwaySpeedLimit: 27.78,   // m/s ≈ 100 km/h urban expressway
  lanesPerDirection: 3,
  baseFlowPerPairVph: 240,    // veh/h allocated to each OD pair before fleet split
  vcTarget: 0.75,             // fraction of lane capacity used by generated demand
  maxRenderedMarkers: 400,
});

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

/** Trigger a browser download for text content. */
export function downloadText(fileName, text, mime = 'text/plain') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Bridge between the existing hub UI and the simulation engine.
 */
export class SimBridge {
  /**
   * @param {Object} [config]
   * @param {string} [config.mapElementId='ringroad-map'] Google Maps host div.
   * @param {string} [config.canvasElementId='sim-canvas'] Canvas fallback host.
   * @param {Object<string,Object>} [config.fleetProfiles] app.js `FLEET` map.
   * @param {Object<string,{coords:Object[],center:Object,zoom:number,vehicleTypes:string[]}>} [config.corridors] app.js `CORRIDORS`.
   * @param {Array<{en?:string,n?:string,frac:number,imp:number}>} [config.blackspots] app.js `BLACKSPOTS`.
   */
  constructor(config = {}) {
    /** @type {Readonly<Object>} merged config */
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mapElementId = this.config.mapElementId;
    this.canvasElementId = this.config.canvasElementId;

    /** @type {google.maps.Map|null} */
    this.map = null;
    /** @type {Network|null} */
    this.network = null;
    /** @type {ScenarioManager} */
    this.scenarioManager = new ScenarioManager();

    /** Active corridor key(s) used to build network/demand. */
    this.corridorKeys = null;
    /** Display name for reports/scenario saves. */
    this.scenarioName = 'untitled';
    /** Latest routed demand items (engine format). */
    this.demandItems = [];
    /** Fleet mix snapshot { engineType: share } used by KPI heuristics. */
    this.demandMix = {};

    /** Simulation parameters for startSimulation(). */
    this.simConfig = { dt: 1, seed: 42, horizonSeconds: 3600 };
    /** UI playback multiplier (0.5 – 10). */
    this.speed = 1;

    this.running = false;
    this.paused = false;
    this.ready = false;

    /** @type {'worker'|'local'|null} */
    this.mode = null;
    this._worker = null;
    this._localSim = null;
    /** @type {Map<string,Function>} one-shot ack resolvers keyed by message type */
    this._ackResolvers = new Map();
    this._stepQueue = [];
    this._completeResolvers = [];
    this._readyPromise = null;

    this.stepCount = 0;
    this.simTime = 0;
    /** @type {Array<Object>} latest vehicle JSON snapshots */
    this.positions = [];
    /** @type {Object|null} latest KPI object */
    this.kpis = null;
    /** @type {Array<Object>} rolling {t,avgSpeed,...} history */
    this.history = [];
    /** @type {Object|null} summary captured on batch completion */
    this.lastSummary = null;

    /** @type {Set<Function>} step listeners */
    this._listeners = new Set();
    /** @type {Set<Function>} completion listeners */
    this._completeListeners = new Set();

    this._raf = null;
    this._acc = 0;
    this._lastTs = 0;
    this._pendingSteps = 0;

    /** @type {Map<string, google.maps.Marker>} vehicle marker pool */
    this._markers = new Map();
    /** @type {Map<string, google.maps.Polyline>} heatmap polylines */
    this._heatPolylines = new Map();
    /** @type {google.maps.Polyline[]} corridor outline polylines */
    this._corridorPolylines = [];
    this._canvasBounds = null;
  }

  // ------------------------------------------------------------------ map --

  /**
   * Initialise the Google Map (Cairo default centre) and the canvas fallback.
   * Safe to call again; returns the existing map instance.
   * @returns {Promise<google.maps.Map|null>}
   */
  async initMap() {
    if (this.map) return this.map;
    const el = typeof document !== 'undefined' ? document.getElementById(this.mapElementId) : null;
    if (el && typeof google !== 'undefined' && google.maps) {
      this.map = new google.maps.Map(el, {
        center: this.config.defaultCenter,
        zoom: this.config.defaultZoom,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
          { featureType: 'water', stylers: [{ color: '#0f172a' }] },
          { featureType: 'road', stylers: [{ color: '#334155' }] },
        ],
      });
    }
    this._prepareCanvas();
    return this.map;
  }

  _prepareCanvas() {
    if (typeof document === 'undefined') return;
    const canvas = document.getElementById(this.canvasElementId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // -------------------------------------------------------------- builders --

  /**
   * Convert CORRIDORS data into an engine {@link Network}.
   *
   * Accepts either the whole CORRIDORS map (`{egypt:{...},ksa:{...}}`), a single
   * corridor object (`{coords:[...]}`), or a corridor name. Each consecutive
   * coordinate pair becomes one bidirectional edge; nodes inherit lat/lng so
   * lengths are computed via haversine automatically.
   *
   * @param {Object|string} corridors CORRIDORS data (see above).
   * @returns {Network} Built graph (also stored on `this.network`).
   * @throws {TypeError|Error} On empty input or unbuildable edges.
   */
  buildNetworkFromCorridors(corridors) {
    const resolved = this._resolveCorridors(corridors ?? this.config.corridors);
    const net = new Network('sae-corridors');

    for (const { key, corridor } of resolved) {
      const coords = Array.isArray(corridor.coords) ? corridor.coords : [];
      if (coords.length < 2) continue;
      const speed = Number.isFinite(corridor.speedLimit)
        ? corridor.speedLimit
        : this.config.highwaySpeedLimit;
      const nodes = [];
      coords.forEach((c, i) => {
        const id = `${key}-n${i}`;
        net.addNode(id, Number(c.lat), Number(c.lng), i === 0 || i === coords.length - 1 ? 'entry' : 'intersection');
        nodes.push(id);
      });
      for (let i = 0; i < nodes.length - 1; i++) {
        net.addEdge({
          id: `${key}-seg${i}`,
          from: nodes[i],
          to: nodes[i + 1],
          lanes: this.config.lanesPerDirection,
          speedLimit: speed,
          bidirectional: true,
          name: `${key} segment ${i + 1}`,
        });
      }
    }

    if (net.edges.size === 0) throw new TypeError('SimBridge.buildNetworkFromCorridors: no corridor coordinates found');
    this.network = net;
    this._canvasBounds = null;
    this._drawCorridorOutline(net);
    return net;
  }

  /**
   * Convert FLEET_PROFILES + corridors into OD-matrix entries.
   *
   * For every corridor each consecutive node pair becomes an OD pair (both
   * directions); the pair's base flow is split across the corridor's
   * `vehicleTypes` proportionally to their FLEET weights.
   *
   * @param {Object<string,Object>} fleetProfiles app.js FLEET map.
   * @param {Object|string} corridors CORRIDORS data.
   * @param {Object} [opts]
   * @param {number} [opts.startTime=0] @param {number} [opts.endTime=3600]
   * @param {number} [opts.spawnRate=1] Global demand multiplier.
   * @param {number|null} [opts.seed] RNG seed for reproducible departures.
   * @returns {Array<{id,origin,dest,departTime,type,route}>} Routed demand
   *   ready for `loadDemand` (requires `buildNetworkFromCorridors` first).
   */
  buildDemandFromFleet(fleetProfiles, corridors, opts = {}) {
    const fleet = fleetProfiles ?? this.config.fleetProfiles ?? {};
    const resolved = this._resolveCorridors(corridors ?? this.config.corridors);
    if (!this.network) this.buildNetworkFromCorridors(corridors);

    const startTime = opts.startTime ?? 0;
    const endTime = opts.endTime ?? this.simConfig.horizonSeconds;
    const spawnRate = Number.isFinite(opts.spawnRate) ? opts.spawnRate : 1;

    /** @type {Array<{from:string,to:string,flow:number,type:string}>} */
    const odMatrix = [];
    const mixAcc = {};
    let totalWeighted = 0;

    for (const { key, corridor } of resolved) {
      const nodeIds = [...this.network.nodes.keys()].filter((n) => n.startsWith(`${key}-n`));
      if (nodeIds.length < 2) continue;
      nodeIds.sort((a, b) => Number(a.split('-n')[1]) - Number(b.split('-n')[1]));

      const typeShares = this._fleetShares(fleet, corridor.vehicleTypes);
      const capacityFlow =
        this.config.lanesPerDirection * 1800 * this.config.vcTarget; // veh/h one direction
      const pairFlow = Math.min(this.config.baseFlowPerPairVph, capacityFlow);

      for (let i = 0; i < nodeIds.length - 1; i++) {
        for (const [from, to] of [[nodeIds[i], nodeIds[i + 1]], [nodeIds[i + 1], nodeIds[i]]]) {
          for (const [engType, share] of Object.entries(typeShares)) {
            if (share <= 0) continue;
            odMatrix.push({ from, to, flow: pairFlow * share, type: engType });
            mixAcc[engType] = (mixAcc[engType] ?? 0) + share;
            totalWeighted += share;
          }
        }
      }
    }

    this.demandMix = Object.fromEntries(
      Object.entries(mixAcc).map(([k, v]) => [k, totalWeighted > 0 ? v / totalWeighted : 0]),
    );

    const rng = this._makeRng(opts.seed ?? this.simConfig.seed);
    const raw = generateDemand(odMatrix, this.network, startTime, endTime, spawnRate, rng);
    const routed = routeDemand(raw, this.network, {
      onError: (id, msg) => console.warn(`[SimBridge] demand "${id}" dropped: ${msg}`),
    });
    this.demandItems = routed;
    return routed;
  }

  /** Normalise fleet weights into per-corridor shares of engine types. */
  _fleetShares(fleet, vehicleTypes) {
    const wanted = Array.isArray(vehicleTypes) && vehicleTypes.length > 0
      ? vehicleTypes
      : Object.keys(fleet);
    const acc = {};
    let sum = 0;
    for (const key of wanted) {
      const profile = fleet[key];
      if (!profile) continue;
      const engType = FLEET_TYPE_MAP[key] ?? 'sedan';
      const w = Number.isFinite(profile.weight) ? profile.weight : 0.05;
      acc[engType] = (acc[engType] ?? 0) + w;
      sum += w;
    }
    if (sum <= 0) return { sedan: 1 };
    for (const k of Object.keys(acc)) acc[k] /= sum;
    return acc;
  }

  /** Resolve corridors argument into [{key,corridor}] pairs. */
  _resolveCorridors(input) {
    const src = input ?? this.config.corridors ?? {};
    if (typeof src === 'string') {
      const c = (this.config.corridors ?? {})[src];
      if (!c) throw new Error(`SimBridge: unknown corridor "${src}"`);
      return [{ key: src, corridor: c }];
    }
    if (Array.isArray(src?.coords)) return [{ key: 'corridor', corridor: src }];
    if (src && typeof src === 'object') {
      return Object.entries(src)
        .filter(([, c]) => c && Array.isArray(c.coords))
        .map(([key, corridor]) => ({ key, corridor }));
    }
    throw new TypeError('SimBridge: corridors must be a CORRIDORS map, a single corridor, or a name');
  }

  _makeRng(seed) {
    if (!Number.isFinite(seed)) return Math.random;
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------ simulation --

  /**
   * Build network/demand (when missing) and start the simulation.
   *
   * Prefers a MODULE Web Worker; transparently falls back to a main-thread
   * Simulator when Worker construction fails.
   *
   * @param {Object} [config]
   * @param {number} [config.dt=1] Time step [s].
   * @param {number} [config.seed=42] RNG seed.
   * @param {number} [config.horizonSeconds=3600] Demand generation horizon.
   * @param {number} [config.spawnRate=1] Demand multiplier.
   * @param {number} [config.speed=1] Initial playback multiplier (0.5–10).
   * @param {boolean} [config.autoPlay=true] Start stepping immediately.
   * @returns {Promise<{mode:'worker'|'local', vehicles:number}>}
   */
  async startSimulation(config = {}) {
    this.simConfig = { ...this.simConfig, ...config };
    if (Number.isFinite(config.speed)) this.setSpeed(config.speed);

    this._stopClock();
    if (this._worker) { this._worker.terminate(); this._worker = null; }
    this._localSim = null;
    for (const [, m] of this._markers) m.setMap(null);
    this._markers.clear();
    this.stepCount = 0;
    this.simTime = 0;
    this.positions = [];
    this.kpis = null;
    this.history = [];
    this.lastSummary = null;

    if (!this.network) this.buildNetworkFromCorridors(this.config.corridors);
    if (!Array.isArray(this.demandItems) || this.demandItems.length === 0) {
      this.buildDemandFromFleet(this.config.fleetProfiles, this.config.corridors);
    }
    if (!this.map) await this.initMap();

    const signals = this._signalConfigs();
    try {
      this._initWorkerEngine({ ...this.simConfig, idmOverrides: this.idmOverrides ?? undefined });
      await this._workerLoad(signals);
      this.mode = 'worker';
    } catch (err) {
      console.warn('[SimBridge] Web Worker unavailable, using main-thread fallback:', err?.message ?? err);
      if (this._worker) { this._worker.terminate(); this._worker = null; }
      await this._initLocalEngine({ ...this.simConfig, idmOverrides: this.idmOverrides ?? undefined }, signals);
      this.mode = 'local';
    }

    this.running = config.autoPlay !== false;
    this.paused = false;
    this.ready = true;
    if (this.running) this._startClock();
    return { mode: this.mode, vehicles: this.positions.length };
  }

  /** Signal plans at intermediate corridor nodes (simple fixed-time). */
  _signalConfigs() {
    if (!this.network) return [];
    const out = [];
    for (const node of this.network.getAllNodes()) {
      if (node.type !== 'intersection') continue;
      out.push({
        nodeId: node.id,
        plan: { phases: [{ green: 30, yellow: 3, red: 27 }] },
      });
    }
    return out.slice(0, 12); // keep the worker payload small
  }

  // -- worker engine -------------------------------------------------------

  _initWorkerEngine(simConfig) {
    if (typeof Worker === 'undefined') throw new Error('Worker unsupported');
    const url = new URL('../worker.js', import.meta.url);
    this._worker = new Worker(url, { type: 'module' });
    this._worker.onerror = (e) => {
      console.error('[SimBridge] worker error:', e.message);
    };
    this._worker.onmessage = (event) => this._onWorkerMessage(event);
    this._readyPromise = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      setTimeout(() => reject(new Error('worker init timeout')), 8000);
    });
    this._post({ type: 'init', config: simConfig });
  }

  _post(msg) {
    if (this._worker) this._worker.postMessage(msg);
  }

  async _workerLoad(signals) {
    await this._readyPromise;
    let p = this._waitFor('network-loaded');
    this._post({ type: 'load-network', data: this.network.toJSON() });
    await p;
    if (signals.length > 0) {
      p = this._waitFor('signals-loaded');
      this._post({ type: 'load-signals', data: signals });
      await p;
    }
    p = this._waitFor('demand-loaded');
    this._post({ type: 'load-demand', data: this.demandItems });
    await p;
  }

  /**
   * Register a one-shot resolver for the next worker ack of `label`.
   * IMPORTANT: post the triggering message right after calling this.
   * @param {string} label @returns {Promise<Object>}
   */
  _waitFor(label) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`SimBridge: ${label} timeout`)), 10000));
    const ack = new Promise((resolve) => {
      this._ackResolvers.set(label, resolve);
    });
    return Promise.race([ack, timeout]);
  }

  _onWorkerMessage(event) {
    const msg = event.data ?? {};
    switch (msg.type) {
      case 'ready':
        this._readyResolve?.(msg.data);
        break;
      case 'network-loaded':
      case 'signals-loaded':
      case 'demand-loaded':
      case 'reset-complete': {
        const resolve = this._ackResolvers.get(msg.type);
        if (resolve) { this._ackResolvers.delete(msg.type); resolve(msg.data); }
        if (msg.type !== 'reset-complete') break;
        this.stepCount = 0;
        this.simTime = 0;
        this.positions = [];
        this.kpis = null;
        this.history = [];
        this.renderVehicles([]);
        this._emitStep();
        break;
      }
      case 'step': {
        this._absorbStep(msg.data);
        this._pendingSteps = Math.max(0, this._pendingSteps - 1);
        const resolver = this._stepQueue.shift();
        if (resolver) resolver(msg.data);
        break;
      }
      case 'complete': {
        this.lastSummary = msg.data?.summary ?? null;
        this.running = false;
        const resolvers = this._completeResolvers.splice(0);
        resolvers.forEach((r) => r(this.lastSummary));
        this._completeListeners.forEach((fn) => { try { fn(this.lastSummary); } catch (e) { console.error(e); } });
        break;
      }
      case 'error':
        console.error('[SimBridge] worker:', msg.message);
        break;
      default:
        break;
    }
  }

  // -- local (main-thread fallback) engine ---------------------------------

  async _initLocalEngine(simConfig, signals) {
    const { Simulator } = await import('../simulator.js');
    this._localSim = new Simulator(simConfig);
    this._localSim.loadNetwork(this.network);
    if (signals.length > 0) this._localSim.loadSignals(signals);
    this._localSim.loadDemand(this.demandItems);
    this._localSim.on('complete', (summary) => {
      this.lastSummary = summary;
      this.running = false;
      this._completeListeners.forEach((fn) => { try { fn(summary); } catch (e) { console.error(e); } });
    });
  }

  // -- stepping clock ------------------------------------------------------

  _startClock() {
    if (this._raf != null) return;
    this._lastTs = performance.now();
    const tick = (ts) => {
      this._raf = requestAnimationFrame(tick);
      if (!this.running || this.paused) { this._lastTs = ts; return; }
      const elapsed = Math.min(0.5, (ts - this._lastTs) / 1000);
      this._lastTs = ts;
      this._acc += elapsed * this.speed;
      const dt = this.simConfig.dt || 1;
      let n = Math.floor(this._acc / dt);
      if (n > 0) {
        this._acc -= n * dt;
        n = Math.min(n, 40); // cap burst size to keep the UI responsive
        this._advance(n);
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopClock() {
    if (this._raf != null) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  _advance(nSteps) {
    if (!this.ready) return;
    if (this.mode === 'worker') {
      for (let i = 0; i < nSteps; i++) {
        this._pendingSteps += 1;
        this._post({ type: 'step-once', dt: this.simConfig.dt });
      }
    } else if (this._localSim) {
      let last = null;
      for (let i = 0; i < nSteps; i++) {
        this._localSim.step(this.simConfig.dt);
        last = {
          step: this._localSim.stepCount,
          time: this._localSim.time,
          vehicleCount: this._localSim.vehicles.length,
          kpis: this._localSim.kpis,
          vehicles: this._localSim.vehicles.map((v) => v.toJSON()),
        };
      }
      if (last) this._absorbStep(last);
      this._emitStep();
    }
  }

  _absorbStep(data) {
    this.stepCount = data.step ?? this.stepCount;
    this.simTime = data.time ?? this.simTime;
    if (data.kpis) {
      this.kpis = data.kpis;
      this.history.push({
        t: Math.round((data.time ?? 0) * 100) / 100,
        count: data.vehicleCount ?? 0,
        avgSpeed: data.kpis.avgSpeed,
        flow: data.kpis.flow,
        density: data.kpis.density,
        los: data.kpis.los,
      });
      if (this.history.length > 10000) this.history.shift();
    }
    if (Array.isArray(data.vehicles)) this.positions = data.vehicles;
    this.renderVehicles(this.positions);
  }

  _emitStep() {
    for (const fn of this._listeners) {
      try { fn({ step: this.stepCount, time: this.simTime, kpis: this.kpis, positions: this.positions }); } 
      catch (err) { console.error('[SimBridge] step listener error:', err); }
    }
  }

  /** Pause the running simulation. */
  pauseSimulation() {
    this.paused = true;
    if (this.mode === 'worker') this._post({ type: 'pause' });
    else this._localSim?.pause();
  }

  /** Resume after pauseSimulation(). */
  resumeSimulation() {
    this.paused = false;
    if (this.mode === 'worker') this._post({ type: 'resume' });
    else this._localSim?.resume();
  }

  /**
   * Stop and reset to time 0 (network/demand stay loaded; press Play to rerun).
   * @returns {Promise<void>}
   */
  async resetSimulation() {
    this.running = false;
    this.paused = false;
    this._acc = 0;
    if (this.mode === 'worker' && this._worker) {
      const done = this._waitFor('reset-complete');
      this._post({ type: 'reset' });
      await done;
    } else {
      this._localSim?.reset();
      this.stepCount = 0;
      this.simTime = 0;
      this.positions = [];
      this.kpis = null;
      this.history = [];
      this.lastSummary = null;
      this.renderVehicles([]);
      this._emitStep();
    }
  }

  /**
   * Ensure the simulation is stepping: starts it when never started, resumes
   * after pause/reset, and restarts the playback clock.
   * @returns {Promise<{mode:'worker'|'local', vehicles:number}>|void}
   */
  ensureRunning() {
    if (!this.ready) return this.startSimulation();
    this.paused = false;
    this.running = true;
    if (this.mode === 'worker') this._post({ type: 'resume' });
    else this._localSim?.resume();
    this._startClock();
  }

  /**
   * Run N steps headless (batch mode) and resolve with the run summary.
   * Useful for calibration-style sweeps where live rendering is unnecessary.
   * @param {number} numSteps @param {number} [dt]
   * @returns {Promise<Object|null>} Simulator.summary()
   */
  runBatch(numSteps, dt = this.simConfig.dt) {
    if (!this.ready) return Promise.reject(new Error('startSimulation() first'));
    if (this.mode === 'worker') {
      this._post({ type: 'run', numSteps, dt });
      return new Promise((resolve) => this._completeResolvers.push(resolve));
    }
    return new Promise((resolve) => {
      this._localSim.run(numSteps, dt);
      const summary = this._localSim.summary();
      this.lastSummary = summary;
      resolve(summary);
    });
  }

  /** Playback multiplier (clamped 0.5–10). @param {number} x */
  setSpeed(x) {
    this.speed = clamp(Number(x) || 1, 0.5, 10);
  }

  /**
   * Register a callback invoked after every rendered step.
   * @param {(state:{step:number,time:number,kpis:Object,positions:Object[]})=>void} cb
   * @returns {()=>void} unsubscribe
   */
  onStep(cb) {
    if (typeof cb !== 'function') throw new TypeError('onStep: callback required');
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  /** Register a callback fired once when a batch/run completes. @param {Function} cb @returns {()=>void} */
  onComplete(cb) {
    if (typeof cb !== 'function') throw new TypeError('onComplete: callback required');
    this._completeListeners.add(cb);
    return () => this._completeListeners.delete(cb);
  }

  /** Latest vehicle position snapshots (Vehicle.toJSON()). @returns {Object[]} */
  getVehiclePositions() {
    return this.positions;
  }

  /** Latest KPI object from the engine (see kpi/collector.js). @returns {Object|null} */
  getKPIs() {
    return this.kpis;
  }

  /** Compact KPI history ({t,avgSpeed,flow,density,los}). @returns {Object[]} */
  getHistory() {
    return this.history;
  }

  /** Replace the active network (also clears demand routes). @param {Network} net */
  setNetwork(net) {
    if (!(net instanceof Network)) throw new TypeError('setNetwork: Network instance required');
    this.network = net;
    this.demandItems = [];
    this.ready = false;
    this._canvasBounds = null;
    this._drawCorridorOutline(net);
  }

  /** Apply calibrated IDM overrides to the next startSimulation(). @param {Object} params subset of {v0,T,a,b,s0,delta} */
  applyCalibration(params) {
    this.idmOverrides = { ...(this.idmOverrides ?? {}), ...(params ?? {}) };
    this.ready = false; // force re-init with new params
  }

  // -------------------------------------------------------------- rendering --

  /** Interpolate a lat/lng point along an edge. */
  _edgePoint(edge, frac) {
    const a = this.network.getNode(edge.from);
    const b = this.network.getNode(edge.to);
    const t = clamp(frac, 0, 1);
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  }

  /**
   * Draw vehicles on the Google Map (markers) and/or the fallback canvas.
   * @param {Object[]} positions Vehicle.toJSON() snapshots from getVehiclePositions().
   */
  renderVehicles(positions = this.positions) {
    if (!this.network) return;
    const useMaps = !!this.map;
    const visible = positions.slice(0, this.config.maxRenderedMarkers);

    if (useMaps) {
      const seen = new Set();
      for (const v of visible) {
        seen.add(v.id);
        const edge = this.network.getEdge(v.edgeId);
        if (!edge) continue;
        const frac = edge.length > 0 ? v.offset / edge.length : 0;
        const pt = this._edgePoint(edge, frac);
        const marker = this._markers.get(v.id);
        const icon = {
          path: google.maps.SymbolPath.CIRCLE,
          scale: v.type === 'truck' || v.type === 'bus' ? 5 : v.type === 'motorcycle' || v.type === 'bicycle' ? 2.5 : 3.5,
          fillColor: v.color || '#38bdf8',
          fillOpacity: 0.95,
          strokeColor: '#0f172a',
          strokeWeight: 1,
        };
        if (marker) {
          marker.setPosition(pt);
          marker.setIcon(icon);
        } else {
          this._markers.set(v.id, new google.maps.Marker({
            map: this.map,
            position: pt,
            title: `${v.type} · ${Math.round(mpsToKmh(v.speed))} km/h`,
            icon,
            zIndex: 50,
          }));
        }
      }
      for (const [id, marker] of this._markers) {
        if (!seen.has(id)) { marker.setMap(null); this._markers.delete(id); }
      }
    }
    this._renderCanvas(visible);
  }

  _computeBounds() {
    if (this._canvasBounds) return this._canvasBounds;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const n of this.network.getAllNodes()) {
      minLat = Math.min(minLat, n.lat); maxLat = Math.max(maxLat, n.lat);
      minLng = Math.min(minLng, n.lng); maxLng = Math.max(maxLng, n.lng);
    }
    this._canvasBounds = { minLat, maxLat, minLng, maxLng };
    return this._canvasBounds;
  }

  _project(lat, lng, canvas) {
    const b = this._computeBounds();
    const pad = 24;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;
    const dLng = Math.max(b.maxLng - b.minLng, 1e-6);
    const dLat = Math.max(b.maxLat - b.minLat, 1e-6);
    const scale = Math.min(w / dLng, h / dLat);
    const x = pad + (lng - b.minLng) * scale + (w - dLng * scale) / 2;
    const y = pad + (b.maxLat - lat) * scale + (h - dLat * scale) / 2;
    return { x, y };
  }

  _renderCanvas(visible) {
    const canvas = typeof document !== 'undefined' ? document.getElementById(this.canvasElementId) : null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const edge of this.network.getAllEdges()) {
      const a = this.network.getNode(edge.from);
      const b = this.network.getNode(edge.to);
      const pa = this._project(a.lat, a.lng, canvas);
      const pb = this._project(b.lat, b.lng, canvas);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.min(6, 1 + edge.laneCount * 0.8);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }

    for (const v of visible) {
      const edge = this.network.getEdge(v.edgeId);
      if (!edge) continue;
      const frac = edge.length > 0 ? v.offset / edge.length : 0;
      const pt = this._edgePoint(edge, frac);
      const p = this._project(pt.lat, pt.lng, canvas);
      ctx.beginPath();
      ctx.arc(p.x, p.y, v.type === 'truck' || v.type === 'bus' ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = v.color || '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /**
   * Colour network edges by average speed ratio (speed / speedLimit).
   *
   * @param {string[]|Object[]} edges Edge ids or Edge-like objects.
   * @param {Object} [kpiData] KPI object containing `perEdge[edgeId].speed`
   *   (km/h) as produced by computeKPIs(). Call without it (or with `null`)
   *   to clear the heatmap.
   */
  renderHeatmap(edges, kpiData) {
    if (!this.network || !this.map) return;
    if (!kpiData) {
      for (const [, line] of this._heatPolylines) line.setMap(null);
      this._heatPolylines.clear();
      return;
    }
    const ids = (edges ?? this.network.getAllEdges()).map((e) =>
      typeof e === 'string' ? e : e.id);
    const seen = new Set();

    for (const id of ids) {
      const edge = this.network.getEdge(id);
      if (!edge) continue;
      seen.add(id);
      const pe = kpiData.perEdge?.[id];
      const ratio = pe && edge.speedLimit > 0
        ? clamp((pe.speed / 3.6) / edge.speedLimit, 0, 1.2)
        : null;
      const color = ratio == null ? '#475569'
        : ratio < 0.25 ? '#ef4444'
        : ratio < 0.5 ? '#f97316'
        : ratio < 0.75 ? '#eab308'
        : '#22c55e';
      const existing = this._heatPolylines.get(id);
      const path = [
        this._edgePoint(edge, 0),
        this._edgePoint(edge, 1),
      ];
      if (existing) {
        existing.setOptions({ strokeColor: color });
      } else {
        this._heatPolylines.set(id, new google.maps.Polyline({
          path,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: Math.min(8, 2 + edge.laneCount),
          zIndex: 20,
          map: this.map,
        }));
      }
    }
    for (const [id, line] of this._heatPolylines) {
      if (!seen.has(id)) { line.setMap(null); this._heatPolylines.delete(id); }
    }
  }

  /** Draw static corridor outlines once (called by buildNetworkFromCorridors). */
  _drawCorridorOutline(net) {
    if (!this.map) return;
    for (const line of this._corridorPolylines) line.setMap(null);
    this._corridorPolylines = [];
    for (const edge of net.getAllEdges()) {
      if (edge.id.endsWith('-r')) continue; // avoid double-drawing two-way roads
      this._corridorPolylines.push(new google.maps.Polyline({
        path: [this._edgePoint(edge, 0), this._edgePoint(edge, 1)],
        strokeColor: '#0369a1',
        strokeOpacity: 0.65,
        strokeWeight: 4,
        zIndex: 10,
        map: this.map,
      }));
    }
    const bounds = new google.maps.LatLngBounds();
    for (const n of net.getAllNodes()) bounds.extend({ lat: n.lat, lng: n.lng });
    if (this._corridorPolylines.length > 0) this.map.fitBounds(bounds, 60);
  }

  // ---------------------------------------------------------------- exports --

  /**
   * Export the current scenario as SUMO XML artifacts.
   * @param {{download?:boolean}} [opts]
   * @returns {{netXml:string, rouXml:string}}
   */
  exportSumo(opts = {}) {
    if (!this.network) throw new Error('exportSumo: no network built');
    const netXml = exportSUMO(this.network);
    const rouXml = this._sumoRouteXml();
    if (opts.download !== false && typeof document !== 'undefined') {
      downloadText('sae_network.net.xml', netXml, 'application/xml');
      downloadText('sae_routes.rou.xml', rouXml, 'application/xml');
    }
    return { netXml, rouXml };
  }

  /** Minimal SUMO route file derived from the current OD demand. */
  _sumoRouteXml() {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<routes>'];
    const types = new Set(Object.keys(this.demandMix));
    if (types.size === 0) types.add('sedan');
    const vclass = { sedan: 'passenger', bus: 'bus', truck: 'truck', motorcycle: 'motorcycle', bicycle: 'bicycle', tuktuk: 'passenger', av: 'passenger' };
    for (const t of types) {
      lines.push(`    <vType id="${esc(t)}" vClass="${vclass[t] ?? 'passenger'}" sigma="0.5"/>`);
    }
    for (const item of this.demandItems.slice(0, 5000)) {
      const route = (item.route ?? []).join(' ');
      lines.push(`    <vehicle id="${esc(item.id)}" type="${esc(item.type)}" depart="${Number(item.departTime).toFixed(2)}"><route edges="${esc(route)}"/></vehicle>`);
    }
    lines.push('</routes>');
    return lines.join('\n');
  }

  /**
   * Export the current scenario as a PTV VISSIM .inpx document (Wiedemann-99
   * flavour consistent with assets/app.js's generator).
   * @param {{download?:boolean}} [opts]
   * @returns {string}
   */
  exportVissim(opts = {}) {
    if (!this.network) throw new Error('exportVissim: no network built');
    const ff = (v) => Number(Number(v ?? 0).toFixed(6)).toString();
    const esc = (s) => escAttr(s);
    const fleet = this.config.fleetProfiles ?? {};
    const xml = [];

    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push('<VISSIMConfig xmlns="http://www.ptv.de/vissim" version="2026">');
    xml.push('  <VehicleTypes>');
    let typeId = 1;
    for (const [key, p] of Object.entries(fleet)) {
      if (!p || !p.cf) continue;
      const cf = p.cf;
      xml.push(`    <VehicleType Name="${esc(p.name ?? key)}" MapID="${typeId++}" Length="${ff(p.len)}" Width="${ff(p.width)}" TypeCategory="${p.category === 'av' ? '100' : '0'}">`);
      xml.push('      <CarFollowing Model="Wiedemann99">');
      const cc = {
        CC0: ff(cf.minGap ?? 1.5),
        CC1: ff(cf.reaction ?? 0.9),
        CC2: ff(4.0),
        CC3: ff(-8.0), CC4: ff(-0.35), CC5: ff(0.35),
        CC6: ff(0.01), CC7: ff(0.25), CC8: ff(cf.accel ?? 1.5), CC9: ff(cf.decel ?? 4.5),
      };
      for (const [k, v] of Object.entries(cc)) xml.push(`        <${k}>${v}</${k}>`);
      xml.push('      </CarFollowing>');
      const lc = p.lc ?? {};
      xml.push('      <LaneChanging>');
      const op = {
        OP1: ff(lc.minDist ?? 2), OP2: ff(2), OP3: ff(Math.round((lc.prob ?? 50) / 10)),
        OP4: ff(0), OP5: ff(1), OP6: ff(0.5), OP7: ff(1), OP8: ff(2),
        OP9: ff(0), OP10: ff(0), OP11: ff(lc.gapDetect ?? 0.7), OP12: ff(0.6),
        OP13: ff(0), OP14: ff(0), OP15: ff(0), OP16: ff(0),
      };
      for (const [k, v] of Object.entries(op)) xml.push(`        <${k}>${v}</${k}>`);
      xml.push('      </LaneChanging>');
      xml.push(`      <DesiredSpeed Distribution="Normal" Mean="${ff((cf.desiredSpeed ?? 13.9) * 3.6)}" StdDev="5.0"/>`);
      xml.push('    </VehicleType>');
    }
    xml.push('  </VehicleTypes>');
    xml.push('  <VehicleFlows>');
    let flowId = 1;
    const shares = this._fleetShares(fleet, null);
    for (const [engType, share] of Object.entries(shares)) {
      const vol = Math.max(1, Math.round(this.config.baseFlowPerPairVph * share));
      xml.push(`    <VehicleFlow ID="${flowId++}" VehicleType="${esc(engType)}" Volume="${vol}"/>`);
    }
    xml.push('  </VehicleFlows>');
    xml.push('  <Links>');
    let linkId = 1;
    const nodeIndex = new Map([...this.network.nodes.keys()].map((id, i) => [id, i + 1]));
    for (const edge of this.network.getAllEdges()) {
      if (edge.id.endsWith('-r')) continue;
      xml.push(`    <Link ID="${linkId++}" Name="${esc(edge.name || edge.id)}" FromNode="${nodeIndex.get(edge.from)}" ToNode="${nodeIndex.get(edge.to)}" NumLanes="${edge.laneCount}" Length="${ff(edge.length)}" Speed="${ff(edge.speedLimit * 3.6)}"/>`);
    }
    xml.push('  </Links>');
    xml.push('</VISSIMConfig>');

    const content = xml.join('\n');
    if (opts.download !== false && typeof document !== 'undefined') {
      downloadText('sae_scenario.inpx', content, 'application/xml');
    }
    return content;
  }

  /** OpenDRIVE export helper (delegates to io/networkIO.exportOpenDRIVE). @returns {string} */
  exportOpenDRIVE(opts = {}) {
    if (!this.network) throw new Error('exportOpenDRIVE: no network built');
    const content = exportOpenDRIVE(this.network);
    if (opts.download !== false && typeof document !== 'undefined') {
      downloadText('sae_network.xodr', content, 'application/xml');
    }
    return content;
  }

  /** GeoJSON export helper. @returns {Object} FeatureCollection */
  exportGeoJSON(opts = {}) {
    if (!this.network) throw new Error('exportGeoJSON: no network built');
    const gj = exportGeoJSON(this.network);
    if (opts.download !== false && typeof document !== 'undefined') {
      downloadText('sae_network.geojson', JSON.stringify(gj, null, 2), 'application/geo+json');
    }
    return gj;
  }

  // --------------------------------------------------------------- scenarios --

  /**
   * Snapshot the current scenario into localStorage via ScenarioManager.
   * @param {string} name Display name.
   * @param {string} [description]
   * @returns {Object} Stored scenario record.
   */
  saveScenario(name, description = '') {
    if (!this.network) throw new Error('saveScenario: nothing to save — build the network first');
    const record = this.scenarioManager.create(name, this.network.toJSON(), {
      sim: this.simConfig,
      speed: this.speed,
      idmOverrides: this.idmOverrides ?? null,
      demandCount: this.demandItems.length,
      demandMix: this.demandMix,
      kpis: this.kpis,
      summary: this.lastSummary,
      corridorKeys: this.corridorKeys,
    }, description);
    return this.scenarioManager.save(record);
  }

  /**
   * Load a scenario by id and rebuild network/demand state from it.
   * @param {string} id
   * @returns {Promise<Object>} The loaded record.
   * @throws {Error} Unknown id.
   */
  async loadScenario(id) {
    const record = this.scenarioManager.load(id);
    if (!record) throw new Error(`loadScenario: scenario "${id}" not found`);
    this.network = Network.fromJSON(record.network);
    this.simConfig = { ...this.simConfig, ...(record.config?.sim ?? {}) };
    this.idmOverrides = record.config?.idmOverrides ?? null;
    this.demandMix = record.config?.demandMix ?? {};
    this.corridorKeys = record.config?.corridorKeys ?? null;
    this.ready = false;
    this._canvasBounds = null;
    if (!this.map) await this.initMap();
    this.buildDemandFromFleet(this.config.fleetProfiles, this.config.corridors, {
      endTime: this.simConfig.horizonSeconds,
    });
    this._drawCorridorOutline(this.network);
    return record;
  }

  /** List saved scenarios (metadata only, newest first). @returns {Object[]} */
  listScenarios() {
    return this.scenarioManager.list();
  }

  /** Fork a saved scenario. @param {string} id @param {string} [newName] @returns {Object} */
  forkScenario(id, newName) {
    return this.scenarioManager.fork(id, newName);
  }

  /** Delete a saved scenario. @param {string} id @returns {boolean} */
  deleteScenario(id) {
    return this.scenarioManager.delete(id);
  }

  /** Diff two saved scenarios (ids or records). @returns {{changed,added,removed,unchangedKeys}} */
  diffScenarios(a, b) {
    return this.scenarioManager.diff(a, b);
  }

  // ---------------------------------------------------------------- cleanup --

  /** Stop everything and release the worker/markers. */
  destroy() {
    this._stopClock();
    this.running = false;
    if (this._worker) { this._worker.terminate(); this._worker = null; }
    this._localSim = null;
    this.ready = false;
    for (const [, m] of this._markers) m.setMap(null);
    this._markers.clear();
    for (const [, l] of this._heatPolylines) l.setMap(null);
    this._heatPolylines.clear();
    for (const l of this._corridorPolylines) l.setMap(null);
    this._corridorPolylines = [];
    this._listeners.clear();
    this._completeListeners.clear();
  }
}

function escAttr(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export default SimBridge;
