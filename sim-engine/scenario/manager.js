/**
 * @file Scenario persistence, forking and diffing on top of `localStorage`.
 *
 * A *scenario* captures everything needed to reproduce a simulation run:
 *
 * ```
 * {
 *   id: 'ring-road-3f2a',          // stable unique key
 *   name: 'Ring Road PM Peak',
 *   description: '',
 *   version: 1,                    // bumped by fork()
 *   forkedFrom: null | '<id>',
 *   network: { nodes:[…], edges:[…] },   // Network.toJSON() payload
 *   config: { … },                 // simulation parameters (dt, seed, IDM overrides…)
 *   createdAt: ISO string,
 *   updatedAt: ISO string,
 * }
 * ```
 *
 * All scenarios live under the single storage key `'sae-scenarios'` as a JSON
 * array. When `localStorage` is unavailable (Node tests, SSR) an in-memory
 * shim keeps the API functional for the lifetime of the manager instance.
 *
 * @example
 * import { ScenarioManager } from './sim-engine/scenario/manager.js';
 * const mgr = new ScenarioManager();
 * const sc = mgr.create('PM peak', net.toJSON(), { dt: 1, seed: 42 });
 * mgr.save(sc);
 * const copy = mgr.fork(sc.id, 'PM peak + cycle 90s');
 * mgr.diff(sc.id, copy.id);  // { changed:{…}, added:{}, removed:{} }
 */

const STORAGE_KEY = 'sae-scenarios';

/**
 * @typedef {Object} Scenario
 * @property {string} id Unique identifier.
 * @property {string} name Human-readable name.
 * @property {string} description Free-form notes.
 * @property {number} version Incremented on every fork.
 * @property {string|null} forkedFrom Id of the parent scenario.
 * @property {{nodes:Object[], edges:Object[]}} network Serialised network.
 * @property {Record<string, any>} config Simulation configuration/parameters.
 * @property {string} createdAt ISO timestamp.
 * @property {string} updatedAt ISO timestamp.
 */
export const SCENARIO_STORAGE_KEY = STORAGE_KEY;

/** Minimal unique-id generator (timestamp + random suffix). @returns {string} */
function uid(prefix = 'sc') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** Slugify a name for readable ids. @param {string} s @returns {string} */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Deep clone via structuredClone when available, JSON as fallback. @template T @param {T} v @returns {T} */
function deepClone(v) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(v); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(v ?? null));
}

/**
 * Flatten a nested plain-object into dot-separated keys (arrays are leaves).
 * Used by {@link ScenarioManager#diff}.
 * @param {any} obj @param {string} [prefix] @param {Record<string, any>} [out]
 * @returns {Record<string, any>}
 */
function flatten(obj, prefix = '', out = {}) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/**
 * Persistent scenario store.
 */
export class ScenarioManager {
  /**
   * @param {Object} [opts]
   * @param {Storage|null} [opts.storage] Inject a custom storage backend
   *   (defaults to `globalThis.localStorage`, falling back to memory).
   */
  constructor(opts = {}) {
    this._external = opts.storage ?? null;
    /** In-memory fallback used when no real Storage exists. @type {Map<string,string>} */
    this._memoryStore = new Map();
    /** True when writes go to memory only (not persisted). */
    this.ephemeral = !this._storageAvailable();

    if (this.ephemeral) {
      console.warn('ScenarioManager: localStorage unavailable — scenarios will not persist');
    }
  }

  /** @returns {boolean} whether a working Storage backend is present. */
  _storageAvailable() {
    if (this._external) return true;
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch {
      return false; // SecurityError in privacy modes
    }
  }

  /** Raw get. @param {string} key @returns {string|null} */
  _get(key) {
    if (this._external) return this._external.getItem(key);
    if (!this.ephemeral) return localStorage.getItem(key);
    return this._memoryStore.get(key) ?? null;
  }

  /** Raw set. @param {string} key @param {string} value */
  _set(key, value) {
    if (this._external) { this._external.setItem(key, value); return; }
    if (!this.ephemeral) { localStorage.setItem(key, value); return; }
    this._memoryStore.set(key, value);
  }

  /**
   * Read + validate the full scenario array from storage.
   * Corrupt payloads are quarantined under `${STORAGE_KEY}-corrupt` and reset.
   * @returns {Scenario[]}
   */
  _readAll() {
    let raw = null;
    try {
      raw = this._get(STORAGE_KEY);
    } catch (err) {
      console.warn('ScenarioManager: storage read failed', err);
      return [];
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new TypeError('payload is not an array');
      return parsed.filter((s) => s && typeof s.id === 'string');
    } catch (err) {
      try { this._set(`${STORAGE_KEY}-corrupt`, raw); } catch { /* ignore */ }
      console.error('ScenarioManager: corrupt scenario store reset —', err.message);
      return [];
    }
  }

  /**
   * Persist the full array (sorted by updatedAt desc for stable listing).
   * @param {Scenario[]} all
   */
  _writeAll(all) {
    const sorted = [...all].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    try {
      this._set(STORAGE_KEY, JSON.stringify(sorted));
    } catch (err) {
      const quota = err && (err.name === 'QuotaExceededError' || err.code === 22);
      throw new Error(quota
        ? 'ScenarioManager: storage quota exceeded — delete old scenarios or shrink networks'
        : `ScenarioManager: failed to persist scenarios — ${err?.message ?? err}`);
    }
  }

  // --------------------------------------------------------------- CRUD ----

  /**
   * Create (but do not yet save) a new scenario object.
   *
   * @param {string} name Display name (used for id slugging too).
   * @param {Network|{nodes:Object[],edges:Object[]}|null} network Network
   *   instance (serialised via `toJSON()`) or an already-serialised payload.
   * @param {Record<string, any>} [config] Simulation parameters.
   * @param {string} [description] Optional notes.
   * @returns {Scenario}
   * @throws {TypeError} When `name` is empty or network payload lacks nodes/edges.
   */
  create(name, network, config = {}, description = '') {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new TypeError('ScenarioManager.create: name must be a non-empty string');
    }
    let netJson = null;
    if (network && typeof network.toJSON === 'function') netJson = network.toJSON();
    else if (network && Array.isArray(network.nodes) && Array.isArray(network.edges)) {
      netJson = deepClone({ nodes: [], edges: [], ...network });
    } else if (network != null) {
      throw new TypeError('ScenarioManager.create: network must be a Network instance or {nodes[], edges[]}');
    }

    const nowIso = new Date().toISOString();
    return {
      id: `${slugify(name) || 'scenario'}-${uid().split('-')[1]}`,
      name: name.trim(),
      description,
      version: 1,
      forkedFrom: null,
      network: netJson,
      config: deepClone(config),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  /**
   * Insert or update a scenario (matched by `id`); refreshes `updatedAt`.
   * @param {Scenario} scenario
   * @returns {Scenario} The stored (cloned) copy.
   * @throws {TypeError|Error} Invalid input or persistence failure.
   */
  save(scenario) {
    if (!scenario || typeof scenario !== 'object' || typeof scenario.id !== 'string') {
      throw new TypeError('ScenarioManager.save: scenario with string "id" required');
    }
    const all = this._readAll();
    const record = deepClone({
      ...scenario,
      updatedAt: new Date().toISOString(),
    });
    const idx = all.findIndex((s) => s.id === record.id);
    if (idx >= 0) all[idx] = record;
    else all.push(record);
    this._writeAll(all);
    return record;
  }

  /**
   * Load a scenario by id.
   * @param {string} id
   * @returns {Scenario|null} Null when not found.
   */
  load(id) {
    if (typeof id !== 'string') return null;
    const found = this._readAll().find((s) => s.id === id);
    return found ? deepClone(found) : null;
  }

  /**
   * List all stored scenarios (metadata summaries, newest first).
   * @returns {Array<Pick<Scenario,'id'|'name'|'version'|'forkedFrom'|'createdAt'|'updatedAt'> & {edges:number, nodes:number}>}
   */
  list() {
    return this._readAll()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((s) => ({
        id: s.id,
        name: s.name,
        version: s.version ?? 1,
        forkedFrom: s.forkedFrom ?? null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        nodes: s.network?.nodes?.length ?? 0,
        edges: s.network?.edges?.length ?? 0,
      }));
  }

  /**
   * Fork an existing scenario: deep copy with a fresh id, `version + 1` and a
   * `forkedFrom` link. The fork is persisted immediately.
   *
   * @param {string} scenarioId Parent scenario id.
   * @param {string} [newName] Defaults to `"<parent> v<n>"`.
   * @returns {Scenario} The newly created fork.
   * @throws {Error} When the parent id does not exist.
   */
  fork(scenarioId, newName) {
    const parent = this.load(scenarioId);
    if (!parent) throw new Error(`ScenarioManager.fork: scenario "${scenarioId}" not found`);

    const version = (parent.version ?? 1) + 1;
    const nowIso = new Date().toISOString();
    const fork = {
      ...parent,
      id: `${slugify(newName || parent.name) || 'scenario'}-${uid().split('-')[1]}`,
      name: (newName ?? `${parent.name} v${version}`).trim(),
      version,
      forkedFrom: parent.id,
      network: deepClone(parent.network),
      config: deepClone(parent.config),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    return this.save(fork);
  }

  /**
   * Compare two scenarios' `config` parameter trees.
   *
   * Arguments may be scenario objects or ids (ids are resolved via `load()`).
   * Nested configs are flattened to dot-keys (`signals.J1.green`), arrays are
   * compared structurally as leaves.
   *
   * @param {Scenario|string} scenarioA Baseline.
   * @param {Scenario|string} scenarioB Variant.
   * @returns {{changed: Record<string,[any,any]>, added: Record<string,any>, removed: Record<string,any>, unchangedKeys: number}}
   */
  diff(scenarioA, scenarioB) {
    const resolve = (s) => {
      if (s && typeof s === 'object') return s;
      const loaded = this.load(s);
      if (!loaded) throw new Error(`ScenarioManager.diff: scenario "${s}" not found`);
      return loaded;
    };
    const a = resolve(scenarioA);
    const b = resolve(scenarioB);

    const fa = flatten(a.config ?? {});
    const fb = flatten(b.config ?? {});

    /** @type {Record<string,[any,any]>} */ const changed = {};
    /** @type {Record<string,any>} */ const added = {};
    /** @type {Record<string,any>} */ const removed = {};

    for (const key of Object.keys(fa)) {
      if (!(key in fb)) { removed[key] = deepClone(fa[key]); continue; }
      if (!deepEqual(fa[key], fb[key])) changed[key] = [fa[key], fb[key]];
    }
    for (const key of Object.keys(fb)) {
      if (!(key in fa)) added[key] = deepClone(fb[key]);
    }
    return { changed, added, removed, unchangedKeys: Object.keys(fa).filter((k) => k in fb).length - Object.keys(changed).length };
  }

  /**
   * Delete a scenario from storage.
   * @param {string} id
   * @returns {boolean} True when something was deleted.
   */
  delete(id) {
    if (typeof id !== 'string') return false;
    const all = this._readAll();
    const next = all.filter((s) => s.id !== id);
    if (next.length === all.length) return false;
    this._writeAll(next);
    return true;
  }
}

/**
 * Structural equality (objects compared by JSON form — sufficient for config trees).
 * @param {any} x @param {any} y @returns {boolean}
 */
function deepEqual(x, y) {
  if (x === y) return true;
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  try {
    return JSON.stringify(x) === JSON.stringify(y);
  } catch {
    return false;
  }
}
