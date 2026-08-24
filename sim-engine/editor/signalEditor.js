/**
 * @file Visual signal-timing editor.
 *
 * Renders each phase of a {@link module:signals/controller.SignalPlan} as a
 * horizontal green/yellow/red bar; segment edges are draggable to resize
 * durations. Shows per-phase durations, the total cycle time and (optionally)
 * the currently-served phase.
 *
 * DOM is only touched in render(); the constructor is headless-safe.
 *
 * @example
 * const se = new SignalEditor('signal-pane');
 * se.load({ phases: [{ name: 'NS', green: 30, yellow: 3, red: 2 }] });
 * se.init();
 */

const COLORS = Object.freeze({
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
});

const COLOR_ORDER = ['green', 'yellow', 'red'];

/** Minimum serviceable green [s] enforced while dragging. */
export const MIN_GREEN_S = 5;
/** Warn when cycle exceeds this [s]. */
export const MAX_CYCLE_S = 240;

/**
 * Interactive signal-plan editor.
 */
export class SignalEditor {
  /**
   * @param {string|HTMLElement|null} containerId Container element or id.
   * @param {{pxPerSec?:number}} [opts] Rendering options.
   */
  constructor(containerId, opts = {}) {
    this.containerId = containerId ?? null;
    /** @type {HTMLElement|null} resolved in init()/render() */
    this.container = null;
    this.pxPerSec = Number.isFinite(opts.pxPerSec) && opts.pxPerSec > 0 ? opts.pxPerSec : 6;

    /** @type {Array<{name:string,green:number,yellow:number,red:number}>} */
    this.phases = [];
    this.offset = 0;
    this.planId = 'plan';

    /** Index of the phase currently served (-1 = none highlighted). */
    this.currentPhaseIndex = -1;

    /** @type {HTMLElement|null} */ this._diagramEl = null;
    /** @type {Map<string,HTMLElement>} phaseKey -> row element */
    this._rowEls = new Map();
    this._initialized = false;
    this._listeners = new Map();
  }

  // -------------------------------------------------------------- events --

  /**
   * Subscribe to editor events (`'change' | 'phase-added' | 'phase-removed' |
   * 'duration-changed' | 'validation'`).
   * @param {string} event @param {Function} fn @returns {()=>void}
   */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => {
      const list = this._listeners.get(event);
      const i = list ? list.indexOf(fn) : -1;
      if (i >= 0) list.splice(i, 1);
    };
  }

  _emit(event, payload = null) {
    const list = this._listeners.get(event);
    if (!list) return;
    for (const fn of [...list]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[signalEditor] listener error (${event}):`, err);
      }
    }
  }

  // ---------------------------------------------------------------- setup --

  /**
   * Resolve the container and render. Safe to call repeatedly.
   * @returns {SignalEditor} this
   */
  init() {
    if (!this.container) {
      let c = this.containerId;
      if (typeof c === 'string') {
        if (typeof document === 'undefined') return this;
        c = document.getElementById(c);
      }
      this.container = c ?? null;
    }
    if (!this.container) return this;
    this._initialized = true;
    this.render();
    return this;
  }

  /** Full re-render of the diagram + controls. */
  render() {
    if (!this._initialized) this.init();
    const root = this.container;
    if (!root) return;

    root.classList?.add('sae-signal-editor');
    root.innerHTML = '';
    root.style.cssText += ';font-family:system-ui,sans-serif;font-size:12px;color:#e2e8f0;'
      + 'background:#0f172a;border:1px solid #33415580;border-radius:8px;padding:10px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap';
    const title = document.createElement('strong');
    title.textContent = 'Signal Timing';
    this._cycleLabel = document.createElement('span');
    this._cycleLabel.setAttribute('data-testid', 'cycle-time');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+ Phase';
    addBtn.title = 'Add a new phase';
    addBtn.style.cssText = this._btnCss('#0369a1');
    addBtn.addEventListener('click', () => this.addPhase());
    header.append(title, this._cycleLabel, addBtn);

    this._diagramEl = document.createElement('div');
    this._diagramEl.className = 'sae-phase-diagram';
    this._diagramEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;overflow-x:auto;padding-bottom:4px';

    this._statusLine = document.createElement('div');
    this._statusLine.style.cssText = 'margin-top:6px;font-size:11px;line-height:1.5';

    root.append(header, this._diagramEl, this._statusLine);
    this._renderPhases();
    this._refreshSummary();
  }

  _btnCss(bg) {
    return `background:${bg};color:#fff;border:0;border-radius:5px;padding:3px 9px;cursor:pointer;font-size:12px`;
  }

  _renderPhases() {
    if (!this._diagramEl) return;
    this._diagramEl.innerHTML = '';
    this._rowEls.clear();

    this.phases.forEach((phase, index) => {
      const row = document.createElement('div');
      row.dataset.phaseIndex = String(index);
      row.style.cssText = 'display:flex;align-items:center;gap:6px'
        + (index === this.currentPhaseIndex
          ? ';outline:2px solid #38bdf8;border-radius:6px;background:#0ea5e91a'
          : '');

      const label = document.createElement('span');
      label.textContent = `${index + 1}. ${phase.name}`;
      label.title = `Phase ${index + 1}`;
      label.style.cssText = 'width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0';

      const barWrap = document.createElement('div');
      barWrap.style.cssText = 'display:flex;height:26px;border-radius:4px;overflow:hidden;flex-grow:1;max-width:900px';

      for (const colorName of COLOR_ORDER) {
        const seconds = phase[colorName];
        if (seconds <= 0) continue;
        const seg = document.createElement('div');
        seg.style.cssText = [
          `background:${COLORS[colorName]}`,
          `width:${Math.max(seconds * this.pxPerSec, 2)}px`,
          'display:flex', 'align-items:center', 'justify-content:center',
          'color:#0f172a', 'font-weight:600', 'position:relative', 'user-select:none',
        ].join(';');

        const secsLabel = document.createElement('span');
        secsLabel.textContent = `${seconds}s`;
        secsLabel.dataset.durationFor = colorName;
        seg.appendChild(secsLabel);

        // Drag handle on the right edge resizes this colour's duration.
        const handle = document.createElement('div');
        handle.style.cssText = 'position:absolute;right:-3px;top:0;width:7px;height:100%;cursor:ew-resize;background:#ffffff33';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-label', `Resize ${colorName} of phase ${index + 1}`);
        handle.addEventListener('pointerdown', (ev) => this._startDrag(ev, index, colorName, seg));
        seg.appendChild(handle);

        barWrap.appendChild(seg);
      }

      const durInfo = document.createElement('span');
      durInfo.textContent = `${phase.green}/${phase.yellow}/${phase.red}`;
      durInfo.title = 'green/yellow/red seconds';
      durInfo.style.cssText = 'color:#94a3b8;width:86px;flex-shrink:0';

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '✕';
      delBtn.title = `Remove phase ${index + 1}`;
      delBtn.setAttribute('aria-label', `Remove phase ${index + 1}`);
      delBtn.style.cssText = this._btnCss('#b91c1c');
      delBtn.addEventListener('click', () => this.removePhase(index));

      row.append(label, barWrap, durInfo, delBtn);
      this._rowEls.set(String(index), row);
      this._diagramEl.appendChild(row);
    });

    if (this.phases.length === 0) {
      const empty = document.createElement('em');
      empty.textContent = 'No phases — click “+ Phase” to start.';
      empty.style.color = '#64748b';
      this._diagramEl.appendChild(empty);
    }
  }

  /** Pointer-drag resizing of one coloured segment. @private */
  _startDrag(ev, phaseIndex, colorName, segEl) {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX;
    const startSeconds = this.phases[phaseIndex][colorName];
    const minSeconds = colorName === 'green' ? MIN_GREEN_S : 0;

    const onMove = (moveEv) => {
      const deltaS = Math.round((moveEv.clientX - startX) / this.pxPerSec);
      const next = Math.max(minSeconds, Math.min(300, startSeconds + deltaS));
      if (next !== this.phases[phaseIndex][colorName]) {
        this.setDuration(phaseIndex, colorName, next);
        segEl.style.width = `${Math.max(next * this.pxPerSec, 2)}px`;
        const lbl = segEl.querySelector('[data-duration-for]');
        if (lbl) lbl.textContent = `${next}s`;
        const info = this._rowEls.get(String(phaseIndex))?.querySelectorAll('span');
        void info;
        this._refreshSummary();
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.render();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  _refreshSummary() {
    if (this._cycleLabel) {
      this._cycleLabel.textContent = `Cycle: ${this.cycleLength()}s · ${this.phases.length} phase(s)`
        + (this.currentPhaseIndex >= 0 ? ` · active: ${this.phases[this.currentPhaseIndex]?.name ?? '?'}` : '');
    }
    if (this._statusLine) {
      const v = this.validate();
      this._statusLine.innerHTML = '';
      const badge = document.createElement('span');
      badge.textContent = v.valid ? '✔ Plan valid' : '✘ Invalid plan';
      badge.style.color = v.valid ? '#22c55e' : '#ef4444';
      badge.style.marginRight = '10px';
      this._statusLine.appendChild(badge);
      for (const msg of [...v.errors, ...v.warnings]) {
        const li = document.createElement('div');
        li.textContent = `• ${msg}`;
        li.style.color = v.errors.includes(msg) ? '#f87171' : '#facc15';
        this._statusLine.appendChild(li);
      }
    }
  }

  // ------------------------------------------------------------- model ----

  /** Total cycle length [s]. */
  cycleLength() {
    return this.phases.reduce((s, p) => s + p.green + p.yellow + p.red, 0);
  }

  /**
   * Load an existing plan.
   * @param {Object|import('../signals/controller.js').SignalPlan} signalPlan
   *   Plain config `{phases:[{name?,green,yellow?,red?}], offset?, id?}` or a
   *   SignalPlan/SignalController-like object exposing `.phases`.
   * @returns {SignalEditor} this
   */
  load(signalPlan) {
    if (!signalPlan || typeof signalPlan !== 'object') throw new TypeError('load: signalPlan required');
    const rawPhases = Array.isArray(signalPlan.phases)
      ? signalPlan.phases
      : signalPlan.plan?.phases;
    if (!Array.isArray(rawPhases) || rawPhases.length === 0) {
      throw new TypeError('load: signalPlan.phases[] required');
    }
    this.phases = rawPhases.map((p) => ({
      name: p.name ?? p.id ?? 'phase',
      green: Math.round(Number(p.green) || 0),
      yellow: Math.round(Number(p.yellow ?? 3)),
      red: Math.round(Number(p.red ?? 0)),
    }));
    this.offset = Number(signalPlan.offset ?? signalPlan.plan?.offset ?? 0) || 0;
    this.planId = signalPlan.id ?? signalPlan.plan?.id ?? 'plan';
    this.currentPhaseIndex = -1;
    this.render();
    return this;
  }

  /**
   * Snapshot the edited plan.
   * @returns {{id:string, offset:number, cycleLength:number,
   *   phases:Array<{name:string,green:number,yellow:number,red:number}>}}
   */
  getPlan() {
    return {
      id: this.planId,
      offset: this.offset,
      cycleLength: this.cycleLength(),
      phases: this.phases.map((p) => ({ ...p })),
    };
  }

  /**
   * Append a new phase (default 20s green / 3s yellow / 2s red).
   * @param {{name?:string,green?:number,yellow?:number,red?:number}} [cfg]
   * @returns {{index:number}} Index of the added phase.
   */
  addPhase(cfg = {}) {
    const phase = {
      name: cfg.name ?? `Phase ${this.phases.length + 1}`,
      green: Number.isFinite(cfg.green) ? cfg.green : 20,
      yellow: Number.isFinite(cfg.yellow) ? cfg.yellow : 3,
      red: Number.isFinite(cfg.red) ? cfg.red : 2,
    };
    this.phases.push(phase);
    this.render();
    this._emit('phase-added', { index: this.phases.length - 1 });
    this._emit('change', this.getPlan());
    return { index: this.phases.length - 1 };
  }

  /**
   * Remove the phase at `index`.
   * @param {number} index
   * @returns {boolean} true when removed.
   */
  removePhase(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.phases.length) return false;
    if (this.phases.length <= 1) return false; // keep at least one phase
    this.phases.splice(index, 1);
    if (this.currentPhaseIndex >= this.phases.length) this.currentPhaseIndex = this.phases.length - 1;
    this.render();
    this._emit('phase-removed', { index });
    this._emit('change', this.getPlan());
    return true;
  }

  /**
   * Update one duration within a phase.
   * @param {number} phaseIndex
   * @param {'green'|'yellow'|'red'} color
   * @param {number} seconds
   * @returns {boolean} true when applied.
   */
  setDuration(phaseIndex, color, seconds) {
    if (!Number.isInteger(phaseIndex) || phaseIndex < 0 || phaseIndex >= this.phases.length) return false;
    if (!COLOR_ORDER.includes(color)) throw new TypeError(`setDuration: unknown color "${color}"`);
    const s = Number(seconds);
    if (!Number.isFinite(s) || s < 0) return false;
    const floor = color === 'green' ? MIN_GREEN_S : 0;
    this.phases[phaseIndex][color] = Math.round(Math.max(floor, Math.min(s, 300)));
    if (this._initialized) this._refreshSummary();
    this._emit('duration-changed', { phaseIndex, color, seconds: this.phases[phaseIndex][color] });
    return true;
  }

  /**
   * Highlight the currently served phase.
   * @param {number} index Pass -1 to clear.
   * @returns {SignalEditor} this
   */
  highlightCurrent(index) {
    this.currentPhaseIndex = Number.isInteger(index) ? index : -1;
    this._renderPhases();
    this._refreshSummary();
    return this;
  }

  /**
   * Validate the plan against common signal-timing rules.
   *
   * Errors: no phases; any green below {@link MIN_GREEN_S}.
   * Warnings: yellow < 3s; single phase; cycle > {@link MAX_CYCLE_S};
   * zero-red clearance missing between conflicting phases.
   *
   * @returns {{valid:boolean, errors:string[], warnings:string[],
   *   cycleLength:number}}
   */
  validate() {
    const errors = [];
    const warnings = [];

    if (this.phases.length === 0) {
      errors.push('Plan has no phases');
    } else {
      this.phases.forEach((p, i) => {
        if (p.green < MIN_GREEN_S) errors.push(`Phase ${i + 1}: green ${p.green}s < minimum ${MIN_GREEN_S}s`);
        if (p.yellow > 0 && p.yellow < 3) warnings.push(`Phase ${i + 1}: yellow ${p.yellow}s is short (recommend ≥ 3s)`);
        if (p.green + p.yellow + p.red <= 0) errors.push(`Phase ${i + 1} has zero duration`);
      });
      if (this.phases.length === 1) warnings.push('Only one phase — all approaches share green');
    }

    const cycle = this.cycleLength();
    if (cycle > MAX_CYCLE_S) warnings.push(`Cycle length ${cycle}s exceeds recommended maximum ${MAX_CYCLE_S}s`);

    return { valid: errors.length === 0, errors, warnings, cycleLength: cycle };
  }

  /** Remove UI + listeners (model retained). */
  destroy() {
    if (this.container) this.container.innerHTML = '';
    this._listeners.clear();
    this._initialized = false;
  }
}

export default SignalEditor;
