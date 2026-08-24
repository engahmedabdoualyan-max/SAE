/**
 * @file Web Worker facade for the Simulator.
 *
 * Instantiate as a MODULE worker (it uses ES imports):
 *
 *   const worker = new Worker('sim-engine/worker.js', { type: 'module' });
 *   worker.postMessage({ type: 'init', config: { dt: 1 } });
 *   worker.postMessage({ type: 'load-network', data: netJSON });
 *   worker.postMessage({ type: 'load-demand', data: routedDemand });
 *   worker.postMessage({ type: 'run', numSteps: 600, dt: 1 });
 *
 * Inbound messages:
 *   { type:'init',          config }
 *   { type:'load-network',  data }        // Network.toJSON() shape
 *   { type:'load-signals',  data }        // controller configs (optional)
 *   { type:'load-demand',   data }        // routed demand array
 *   { type:'run',           numSteps, dt? }
 *   { type:'pause' } { type:'resume' } { type:'reset' }
 *   { type:'step-once',     dt? }
 *
 * Outbound messages:
 *   { type:'ready'|'network-loaded'|'demand-loaded'|'signals-loaded',
 *     data }, { type:'step', data:{ step,time,vehicleCount,kpis,vehicles? } },
 *   { type:'complete', data:{ summary } },
 *   { type:'reset-complete' }, { type:'error', message }
 */

import { Simulator } from './simulator.js';
import { Network } from './network/graph.js';

const inWorker = typeof self !== 'undefined' && typeof self.postMessage === 'function';

/** @type {Simulator|null} */
let sim = null;
let running = false;
let paused = false;
/** Resolve function for the current pause gate promise. */
let resumeGate = null;
/** Outbox used when imported outside a real Worker (testing / Node). */
const outbox = [];

function post(msg) {
  if (inWorker) self.postMessage(msg);
  else outbox.push(msg);
}

function waitWhilePaused() {
  if (!paused) return Promise.resolve();
  return new Promise((resolve) => { resumeGate = resolve; });
}

/**
 * Chunked run loop; yields to the event loop so pause/reset messages are
 * processed mid-run.
 */
async function runLoop(numSteps, dt) {
  running = true;
  const CHUNK = 25;
  let done = 0;
  try {
    while (done < numSteps) {
      await waitWhilePaused();
      if (!sim || !running) return;
      const n = Math.min(CHUNK, numSteps - done);
      for (let i = 0; i < n; i++) sim.step(dt);
      done += n;
      post({
        type: 'step',
        data: {
          step: sim.stepCount,
          time: sim.time,
          vehicleCount: sim.vehicles.length,
          kpis: sim.kpis,
        },
      });
      await new Promise((r) => setTimeout(r, 0));
    }
    post({ type: 'complete', data: { summary: sim ? sim.summary() : null } });
  } finally {
    running = false;
  }
}

/**
 * Central message handler. Exported so the module is testable outside a Worker.
 * @param {{data:Object}} event
 */
export async function handleMessage(event) {
  const msg = event?.data ?? {};
  try {
    switch (msg.type) {
      case 'init': {
        sim = new Simulator(msg.config ?? {});
        paused = false;
        running = false;
        post({ type: 'ready', data: { dt: sim.config.dt } });
        break;
      }

      case 'load-network': {
        requireInit();
        sim.loadNetwork(Network.fromJSON(msg.data));
        post({ type: 'network-loaded', data: { nodes: sim.network.nodes.size, edges: sim.network.edges.size } });
        break;
      }

      case 'load-signals': {
        requireInit();
        sim.loadSignals(msg.data ?? []);
        post({ type: 'signals-loaded', data: { count: sim.signals.size } });
        break;
      }

      case 'load-demand': {
        requireInit();
        sim.loadDemand(msg.data ?? []);
        post({ type: 'demand-loaded', data: { items: sim.demand.length } });
        break;
      }

      case 'run': {
        requireInit();
        if (running) return; // already running
        paused = false;
        const numSteps = Math.max(0, msg.numSteps | 0);
        const dt = Number.isFinite(msg.dt) && msg.dt > 0 ? msg.dt : sim.config.dt;
        await runLoop(numSteps, dt);
        break;
      }

      case 'step-once': {
        requireInit();
        const dt = Number.isFinite(msg.dt) && msg.dt > 0 ? msg.dt : sim.config.dt;
        sim.step(dt);
        post({
          type: 'step',
          data: {
            step: sim.stepCount,
            time: sim.time,
            vehicleCount: sim.vehicles.length,
            kpis: sim.kpis,
            vehicles: sim.vehicles.map((v) => v.toJSON()),
          },
        });
        break;
      }

      case 'pause': {
        paused = true;
        if (sim) sim.pause();
        break;
      }

      case 'resume': {
        paused = false;
        if (resumeGate) { const r = resumeGate; resumeGate = null; r(); }
        if (sim) sim.resume();
        break;
      }

      case 'reset': {
        requireInit();
        running = false; // stop any loop after current chunk
        paused = false;
        if (resumeGate) { const r = resumeGate; resumeGate = null; r(); }
        sim.reset();
        post({ type: 'reset-complete', data: { time: 0, step: 0 } });
        break;
      }

      default:
        post({ type: 'error', message: `worker: unknown message type "${msg.type}"` });
    }
  } catch (err) {
    post({ type: 'error', message: String(err?.message ?? err) });
  }
}

function requireInit() {
  if (!sim) throw new Error('worker: not initialized — send {type:"init"} first');
}

if (inWorker) {
  self.onmessage = handleMessage;
}

/** Collected outbound messages when NOT running inside a real Worker. */
export function drainOutbox() {
  return outbox.splice(0, outbox.length);
}
