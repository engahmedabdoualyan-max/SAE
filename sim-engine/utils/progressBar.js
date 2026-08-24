/**
 * @file Simulation progress UI widget.
 *
 * Renders a self-contained progress component (step counter, animated bar,
 * ETA, live KPI readout) into a container and returns a small controller:
 *
 * ```
 * ┌──────────────────────────────────────────────────────────┐
 * │ Simulating…  step 420 / 3600 (12%)         ETA 00:04:31  │
 * │ ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░            │
 * │ Speed 42.1 km/h · Flow 1180 veh/h · Vehicles 236         │
 * └──────────────────────────────────────────────────────────┘
 * ```
 *
 * The ETA is estimated from a rolling window of recent `update()` calls, so it
 * stays accurate even when step cost varies with vehicle count.
 *
 * @example
 * import { createProgressBar } from './sim-engine/utils/progressBar.js';
 * const bar = createProgressBar('sim-progress');
 * sim.on('kpi-update', (k) => bar.update(sim.stepCount, totalSteps, k));
 * // on error:  bar.error('Network file could not be parsed');
 * // on finish: bar.complete();
 */

import { formatTime } from './units.js';

/** Rolling samples kept for the ETA estimate. @type {number} */
const ETA_WINDOW = 20;

/**
 * Create (or replace) a progress bar inside `containerId`.
 *
 * @param {string} containerId DOM id of the host element. Any previous
 *   `.sae-progress` child is replaced, so repeated calls are safe.
 * @param {Object} [opts]
 * @param {string} [opts.title='Simulating…'] Label shown before completion.
 * @param {string[]} [opts.kpiKeys] KPI fields surfaced in the readout line,
 *   in order (first three found are shown). Defaults to speed/flow/density.
 * @returns {ProgressHandle} Controller: `{ update, complete, error, el, destroy }`.
 * @throws {Error} When no DOM is available or the container id is missing.
 */
export function createProgressBar(containerId, opts = {}) {
  if (typeof document === 'undefined') {
    throw new Error('createProgressBar: requires a DOM (browser or jsdom environment)');
  }
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`createProgressBar: no element with id "${containerId}"`);

  const title = opts.title ?? 'Simulating…';
  const kpiKeys = opts.kpiKeys ?? ['avgSpeed', 'flow', 'density', 'vehicleCount'];

  // ------------------------------------------------------------- markup ---
  host.querySelectorAll(':scope > .sae-progress').forEach((n) => n.remove());

  const root = document.createElement('div');
  root.className = 'sae-progress';
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.setAttribute('aria-valuenow', '0');
  root.style.cssText = [
    'font-family: ui-sans-serif, system-ui, sans-serif',
    'background:#0f172a', 'color:#e2e8f0',
    'border:1px solid #1e293b', 'border-radius:10px',
    'padding:12px 16px', 'margin:8px 0',
    'user-select:none', 'line-height:1.45',
  ].join(';');

  const headRow = document.createElement('div');
  headRow.style.cssText = 'display:flex;justify-content:space-between;gap:12px;font-size:13px;';

  const labelEl = document.createElement('span');
  labelEl.textContent = `${title} — waiting for first step`;
  const etaEl = document.createElement('span');
  etaEl.style.cssText = 'color:#94a3b8;font-variant-numeric:tabular-nums;';
  etaEl.textContent = '';
  headRow.append(labelEl, etaEl);

  const track = document.createElement('div');
  track.style.cssText =
    'height:10px;border-radius:999px;background:#1e293b;overflow:hidden;margin:8px 0 6px;';
  const fill = document.createElement('div');
  fill.style.cssText =
    'height:100%;width:0%;border-radius:999px;background:#38bdf8;' +
    'transition:width 120ms linear, background-color 200ms;';
  track.appendChild(fill);

  const kpiEl = document.createElement('div');
  kpiEl.style.cssText = 'font-size:12px;color:#94a3b8;min-height:15px;white-space:nowrap;' +
    'overflow:hidden;text-overflow:ellipsis;';
  kpiEl.textContent = '';

  root.append(headRow, track, kpiEl);
  host.appendChild(root);

  // ------------------------------------------------------------- state ----
  /** @type {{t:number, step:number}[]} */ const samples = [];
  let lastStep = -1;
  let finished = false;

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function setBarColor(color) { fill.style.backgroundColor = color; }

  function renderKpis(kpis) {
    if (!kpis || typeof kpis !== 'object') { kpiEl.textContent = ''; return; }
    const parts = [];
    for (const key of kpiKeys) {
      if (parts.length >= 3) break;
      const v = kpis[key];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const unit = key === 'avgSpeed' ? ' km/h'
        : key === 'flow' ? ' veh/h'
        : key === 'density' ? ' veh/km'
        : key === 'avgDelay' || key === 'avgDelayPerKm' ? ' s'
        : key === 'totalTravelTime' ? ' s'
        : '';
      const dec = Math.abs(v) >= 100 ? 0 : 1;
      parts.push(`${key} ${v.toFixed(dec)}${unit}`);
    }
    kpiEl.textContent = parts.join('  ·  ');
  }

  /**
   * Rolling-average pace → ETA string for the remaining steps.
   * @param {number} step @param {number} total @returns {string}
   */
  function computeEta(step, total) {
    if (samples.length < 2) return '';
    const first = samples[0];
    const elapsedMs = now() - first.t;
    const stepsDone = step - first.step;
    if (elapsedMs <= 0 || stepsDone <= 0) return '';
    const msPerStep = elapsedMs / stepsDone;
    const remaining = Math.max(0, total - step);
    return `ETA ${formatTime((msPerStep * remaining) / 1000)}`;
  }

  // --------------------------------------------------------- controller ---
  /**
   * @typedef {Object} ProgressHandle
   * @property {(step:number,total:number,kpis?:Object)=>void} update Advance to `step` of `total` and refresh KPIs/ETA.
   * @property {()=>void} complete Mark as finished (100 %, green).
   * @property {(msg:string)=>void} error Show an error state with a message.
   * @property {HTMLElement} el Root element.
   * @property {()=>void} destroy Remove the widget from the DOM.
   */
  return {
    el: root,

    update(step, total, kpis) {
      if (finished) return;
      if (!Number.isFinite(step) || !Number.isFinite(total) || total <= 0) return;

      const s = Math.max(0, Math.min(total, step));
      if (s !== lastStep) {
        lastStep = s;
        samples.push({ t: now(), step: s });
        if (samples.length > ETA_WINDOW) samples.shift();
      }

      const pct = Math.min(100, (s / total) * 100);
      fill.style.width = `${pct}%`;
      root.setAttribute('aria-valuenow', String(Math.round(pct)));
      labelEl.textContent = `${title} — step ${Math.round(s)} / ${Math.round(total)} (${pct.toFixed(0)}%)`;
      etaEl.textContent = pct >= 100 ? '' : computeEta(s, total);
      renderKpis(kpis);
    },

    complete() {
      finished = true;
      fill.style.width = '100%';
      setBarColor('#22c55e');
      labelEl.textContent = 'Simulation complete ✓';
      etaEl.textContent = '';
      kpiEl.textContent = '';
      root.setAttribute('aria-valuenow', '100');
    },

    error(msg) {
      finished = true;
      setBarColor('#ef4444');
      labelEl.textContent = `Simulation failed — ${String(msg ?? 'unknown error')}`;
      etaEl.textContent = '';
      kpiEl.textContent = '';
    },

    destroy() {
      root.remove();
    },
  };
}
