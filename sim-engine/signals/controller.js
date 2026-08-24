/**
 * @file Traffic-signal control: phases, plans, and per-intersection controllers.
 *
 * A {@link SignalPhase} owns one protected movement group with a fixed timeline:
 * green → yellow → red (red typically serves as an all-red clearance interval).
 * A {@link SignalPlan} is a cyclic list of phases plus a coordination offset.
 * A {@link SignalController} runs the plan at one node in either `fixed` or
 * basic `actuated` mode (green is extended while detectors report demand).
 */

export const MOVEMENTS = Object.freeze(['through', 'left', 'right', 'uturn']);

/**
 * One signal phase.
 */
export class SignalPhase {
  /**
   * @param {Object} cfg
   * @param {string} [cfg.id] Phase identifier (defaults to index at plan level).
   * @param {string} [cfg.name] Display name.
   * @param {number} cfg.green Green duration [s] (> 0).
   * @param {number} [cfg.yellow=3] Yellow duration [s] (>= 0).
   * @param {number} [cfg.red=0] Red / all-red clearance duration [s] (>= 0).
   * @param {Record<string,string[]>|null} [cfg.allowedMovements]
   *   Map of approach key -> allowed movements, e.g. `{ north:['through','right'] }`.
   *   The special key `'*'` applies to any approach. `null`/omitted = all movements
   *   on all approaches.
   * @param {number} [cfg.minGreen] Actuated minimum green [s].
   * @param {number} [cfg.maxGreen] Actuated maximum green [s].
   */
  constructor(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new TypeError('SignalPhase: config required');
    const green = Number(cfg.green);
    if (!Number.isFinite(green) || green <= 0) throw new TypeError('SignalPhase: "green" must be > 0');
    const yellow = Number(cfg.yellow ?? 3);
    const red = Number(cfg.red ?? 0);
    if (!Number.isFinite(yellow) || yellow < 0) throw new TypeError('SignalPhase: invalid "yellow"');
    if (!Number.isFinite(red) || red < 0) throw new TypeError('SignalPhase: invalid "red"');

    this.id = cfg.id ?? null;
    this.name = cfg.name ?? cfg.id ?? 'phase';
    this.green = green;
    this.yellow = yellow;
    this.red = red;
    /** @type {Record<string,string[]>|null} */
    this.allowedMovements = cfg.allowedMovements ? structuredCloneCompat(cfg.allowedMovements) : null;
    this.minGreen = Number.isFinite(cfg.minGreen) ? Math.min(cfg.minGreen, green) : undefined;
    this.maxGreen = Number.isFinite(cfg.maxGreen) ? Math.max(cfg.maxGreen, green) : undefined;
  }

  /** Total phase duration [s]. */
  get totalDuration() {
    return this.green + this.yellow + this.red;
  }

  /** Effective actuated min/max green bounds [s]. */
  get actuatedBounds() {
    const minG = this.minGreen ?? Math.min(this.green, 5);
    const maxG = Math.max(this.maxGreen ?? Math.max(this.green, 30), this.green, minG);
    return { minG, maxG };
  }

  /**
   * Whether a movement from an approach is allowed by this phase's plan.
   * @param {string} approach Approach key (e.g. incoming edge id or compass label).
   * @param {string} movement One of {@link MOVEMENTS}.
   * @returns {boolean}
   */
  isAllowed(approach, movement = 'through') {
    if (!this.allowedMovements) return true;
    if (this.allowedMovements['*']?.includes(movement)) return true;
    const list = this.allowedMovements[approach];
    return Array.isArray(list) ? list.includes(movement) : false;
  }

  toJSON() {
    return {
      id: this.id, name: this.name, green: this.green, yellow: this.yellow,
      red: this.red, totalDuration: this.totalDuration,
      allowedMovements: this.allowedMovements,
      minGreen: this.minGreen ?? null, maxGreen: this.maxGreen ?? null,
    };
  }
}

/**
 * Cyclic sequence of phases with a coordination offset.
 */
export class SignalPlan {
  /**
   * @param {Object} cfg
   * @param {string} [cfg.id='plan']
   * @param {(SignalPhase|Object)[]} cfg.phases Non-empty phase list.
   * @param {number} [cfg.offset=0] Cycle offset [s] for coordination.
   */
  constructor(cfg = {}) {
    if (!Array.isArray(cfg.phases) || cfg.phases.length === 0) {
      throw new TypeError('SignalPlan: "phases" must be a non-empty array');
    }
    this.id = cfg.id ?? 'plan';
    /** @type {SignalPhase[]} */
    this.phases = cfg.phases.map((p, i) =>
      p instanceof SignalPhase ? p : new SignalPhase({ id: `phase-${i}`, ...p })
    );
    // Guarantee unique ids.
    this.phases.forEach((p, i) => { if (p.id == null) p.id = `phase-${i}`; });
    this.offset = Number.isFinite(cfg.offset) && cfg.offset >= 0 ? cfg.offset : 0;
  }

  /** Full cycle length [s]. */
  get cycleLength() {
    return this.phases.reduce((s, p) => s + p.totalDuration, 0);
  }

  toJSON() {
    return { id: this.id, offset: this.offset, cycleLength: this.cycleLength, phases: this.phases.map((p) => p.toJSON()) };
  }
}

/**
 * Controller driving the signals at one intersection.
 */
export class SignalController {
  /**
   * @param {string} nodeId Intersection node this controller belongs to.
   * @param {SignalPlan|Object} plan Plan instance or plain config.
   * @param {Object} [opts]
   * @param {'fixed'|'actuated'} [opts.mode='fixed']
   */
  constructor(nodeId, plan, opts = {}) {
    if (typeof nodeId !== 'string' || nodeId.length === 0) throw new TypeError('SignalController: nodeId required');
    this.nodeId = nodeId;
    this.plan = plan instanceof SignalPlan ? plan : new SignalPlan(plan);
    this.mode = opts.mode === 'actuated' ? 'actuated' : 'fixed';
    if (this.plan.cycleLength <= 0) throw new Error(`SignalController@${nodeId}: empty cycle`);

    /** @type {Record<string,number>} approach -> detected vehicle count */
    this.detectors = {};
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.elapsed = 0;
    /**
     * Effective green-end time [s] of the CURRENT phase on the phase-local
     * timeline. Actuated controllers raise this (up to maxGreen) while
     * detectors report demand; yellow/red are anchored to it.
     * @type {number|null}
     */
    this._greenEnd = null;
    this._initGreenEnd();
    if (this.plan.offset > 0) {
      this._fastForward(this.plan.offset);
      this._initGreenEnd(); // re-anchor after jumping into the cycle
    }
  }

  /** (Re)initialise the green-end anchor for the active phase/mode. */
  _initGreenEnd() {
    if (this.mode !== 'actuated') { this._greenEnd = null; return; }
    const phase = this.plan.phases[this.phaseIndex];
    const { minG, maxG } = phase.actuatedBounds;
    // An offset may drop us mid-green: never shrink below the elapsed time.
    this._greenEnd = Math.max(minG, Math.min(Math.max(this.phaseElapsed, minG), maxG));
  }

  // ------------------------------------------------------------- detectors --

  /**
   * Merge detector counts (used by actuated logic and KPI reporting).
   * @param {Record<string,number>} counts approach -> vehicle count (>= 0).
   */
  updateDetectors(counts = {}) {
    for (const [k, v] of Object.entries(counts)) {
      const n = Number(v);
      this.detectors[k] = Number.isFinite(n) && n > 0 ? n : 0;
    }
  }

  /** Clear all detector readings. */
  clearDetectors() {
    this.detectors = {};
  }

  _approachesOf(phase) {
    if (!phase.allowedMovements) return Object.keys(this.detectors);
    return Object.keys(phase.allowedMovements).filter((k) => k !== '*');
  }

  _demandOn(phase) {
    let approaches = this._approachesOf(phase);
    if (approaches.length === 0) approaches = Object.keys(this.detectors);
    return approaches.some((a) => (this.detectors[a] ?? 0) > 0);
  }

  // ------------------------------------------------------------------ time --

  /**
   * Advance the controller by `dt` seconds.
   * @param {number} dt Time step [s] (> 0).
   * @returns {{nodeId:string, mode:string, phaseIndex:number, phaseId:string,
   *   state:'green'|'yellow'|'red', timeIntoPhase:number, timeRemaining:number,
   *   cycleTimeElapsed:number, allowedMovements:(Record<string,string[]>|null),
   *   detectors:Record<string,number>}} Current signal state.
   * @throws {RangeError} on invalid dt.
   */
  tick(dt) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      throw new RangeError(`SignalController.tick: dt must be > 0, got ${dt}`);
    }
    let remaining = dt;
    let guard = 0; // safety against pathological configs
    while (remaining > 1e-9 && guard++ < 10000) {
      const phase = this.plan.phases[this.phaseIndex];
      const local = this.phaseElapsed;

      if (this.mode === 'actuated') {
        const { minG, maxG } = phase.actuatedBounds;
        const limit = this._greenEnd ?? minG;
        const demand = this._demandOn(phase);
        const inGreen = local < limit || (demand && local < maxG);

        if (inGreen) {
          // Green is being served; it may be extended while demand exists.
          let boundary;
          if (local < minG) boundary = minG;
          else if (demand) boundary = maxG;
          else boundary = limit;
          const adv = Math.min(boundary - local, remaining);
          this.phaseElapsed += adv;
          this.elapsed += adv;
          remaining -= adv;
          if (boundary > limit) this._greenEnd = Math.min(boundary, maxG);
        } else {
          // Past the (possibly extended) green window: yellow + red clearance.
          const total = limit + phase.yellow + phase.red;
          const adv = Math.max(0, Math.min(total - local, remaining));
          this.phaseElapsed += adv;
          this.elapsed += adv;
          remaining -= adv;
          if (this.phaseElapsed >= total - 1e-9) {
            this.phaseIndex = (this.phaseIndex + 1) % this.plan.phases.length;
            this.phaseElapsed = 0;
            this._initGreenEnd();
          }
        }
      } else {
        const total = phase.totalDuration;
        const adv = Math.min(total - this.phaseElapsed, remaining);
        this.phaseElapsed += adv;
        this.elapsed += adv;
        remaining -= adv;
        if (this.phaseElapsed >= total - 1e-9) {
          this.phaseIndex = (this.phaseIndex + 1) % this.plan.phases.length;
          this.phaseElapsed = 0;
        }
      }
    }
    return this.getState();
  }

  /**
   * Snapshot of the current state.
   * @returns {Object} see {@link SignalController#tick}.
   */
  getState() {
    const phase = this.plan.phases[this.phaseIndex];
    const local = this.phaseElapsed;
    const greenEnd = this.mode === 'actuated'
      ? (this._greenEnd ?? phase.actuatedBounds.minG)
      : phase.green;
    let state, timeRemaining;
    if (local < greenEnd) {
      state = 'green';
      timeRemaining = greenEnd - local;
    } else if (local < greenEnd + phase.yellow) {
      state = 'yellow';
      timeRemaining = greenEnd + phase.yellow - local;
    } else {
      state = 'red';
      timeRemaining = greenEnd + phase.yellow + phase.red - local;
    }
    return {
      nodeId: this.nodeId,
      mode: this.mode,
      phaseIndex: this.phaseIndex,
      phaseId: phase.id,
      state,
      timeIntoPhase: local,
      timeRemaining,
      cycleTimeElapsed: this.elapsed,
      allowedMovements: phase.allowedMovements,
      detectors: { ...this.detectors },
    };
  }

  /**
   * Is the given movement currently served with a green?
   * @param {string} approach Incoming edge/approach key.
   * @param {string} [movement='through']
   * @returns {boolean}
   */
  isGreen(approach, movement = 'through') {
    const st = this.getState();
    return st.state === 'green' && this.plan.phases[this.phaseIndex].isAllowed(approach, movement);
  }

  /**
   * Is the movement permitted right now (any non-red state AND allowed)?
   * @param {string} approach @param {string} [movement='through'] @returns {boolean}
   */
  allows(approach, movement = 'through') {
    const st = this.getState();
    if (st.state === 'red') return false;
    return this.plan.phases[this.phaseIndex].isAllowed(approach, movement);
  }

  /** Restart from cycle beginning and re-apply the coordination offset. */
  reset() {
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.elapsed = 0;
    this.clearDetectors();
    this._initGreenEnd();
    if (this.plan.offset > 0) {
      this._fastForward(this.plan.offset);
      this._initGreenEnd();
    }
  }

  /** Jump ahead ignoring actuation (used for offsets / reset). */
  _fastForward(seconds) {
    let remaining = seconds % this.plan.cycleLength;
    while (remaining > 1e-9) {
      const total = this.plan.phases[this.phaseIndex].totalDuration;
      const adv = Math.min(total - this.phaseElapsed, remaining);
      this.phaseElapsed += adv;
      this.elapsed += adv;
      remaining -= adv;
      if (this.phaseElapsed >= total - 1e-9) {
        this.phaseIndex = (this.phaseIndex + 1) % this.plan.phases.length;
        this.phaseElapsed = 0;
      }
    }
  }

  toJSON() {
    return { ...this.getState(), cycleLength: this.plan.cycleLength };
  }
}

// Small helper to avoid relying on newer structuredClone everywhere.
function structuredCloneCompat(obj) {
  return JSON.parse(JSON.stringify(obj));
}
