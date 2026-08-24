/**
 * @file Dashboard panel: live KPI dashboard + heatmap (throttled), completion
 * summary, baseline-vs-current comparison table, and one-click PDF export via
 * the report generator.
 *
 * @example
 * import { initDashboardPanel } from './sim-engine/integration/dashboardPanel.js';
 * const panel = initDashboardPanel('dashboard-panel', bridge);
 * // later: panel.destroy();
 */

import { renderKPIDashboard } from '../dashboard/kpiDashboard.js';
import {
  computeKPIs,
  LOS_THRESHOLDS,
} from '../kpi/collector.js';
import { generateReport } from '../dashboard/reportGenerator.js';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Default live-refresh interval [ms]. */
const REFRESH_MS = 1000;

/**
 * Build the dashboard panel inside `containerId`.
 *
 * @param {string} containerId Host element id (children replaced).
 * @param {import('./simBridge.js').SimBridge} simBridge Initialised bridge.
 * @param {Object} [opts]
 * @param {number} [opts.refreshMs=REFRESH_MS] Live refresh interval; 0 disables.
 * @param {HTMLElement|string} [opts.mapHost] Element (or id) under which edge heat polylines are drawn.
 *   Pass null to disable the live heatmap overlay.
 * @returns {{setBaseline: Function, clearBaseline: Function, showSummary: Function,
 *            destroy: Function}} Handle.
 * @throws {Error} Missing container or bridge.
 */
export function initDashboardPanel(containerId, simBridge, opts = {}) {
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`initDashboardPanel: no element with id "${containerId}"`);
  if (!simBridge) throw new Error('initDashboardPanel: simBridge required');

  host.innerHTML = '';

  // -- header row ------------------------------------------------------------
  const statusDot = el('span', { class: STATUS_IDLE });
  const statusText = el('span', { class: 'text-[11px] text-slate-400' }, 'idle');
  const pdfBtn = el('button', { class: BTN_PRIMARY }, '📄 Export PDF');
  const baselineBtn = el('button', { class: BTN_SECONDARY }, '📌 Set Baseline');
  const compareWrap = el('div', { class: 'mt-3 hidden' });

  host.appendChild(el('div', { class: 'mb-2 flex items-center gap-2 flex-wrap' },
    el('i', { class: 'fas fa-tachometer-alt text-sky-400' }),
    el('span', { class: 'text-sm font-bold text-slate-200' }, 'Simulation Dashboard'),
    el('span', { class: 'ml-auto flex items-center gap-1.5' }, statusDot, statusText),
    baselineBtn, pdfBtn));

  const kpiHost = el('div');
  const summaryBox = el('div', { class: 'hidden mt-3 rounded-lg border border-sky-800/60 bg-slate-900 p-3' });

  host.appendChild(kpiHost);
  host.appendChild(summaryBox);
  host.appendChild(compareWrap);

  let lastRenderedStep = -1;
  let baselineKpis = null;
  let baselineLabel = '';

  function setStatus(cls, text) {
    statusDot.className = cls;
    statusText.textContent = text;
  }

  // ------------------------------------------------------------- rendering --
  function renderLive() {
    const step = simBridge.stepCount;
    if (step === lastRenderedStep && kpiHost.childNodes.length > 0) return;
    lastRenderedStep = step;

    if (simBridge.positions.length === 0 && step === 0) return;

    const kpis = computeKPIs(simBridge.positions, simBridge.network?.getAllEdges() ?? []);
    const history = simBridge.getHistory();
    renderKPIDashboard(kpiHost.id || attachId(kpiHost), kpis, history, { chartHeight: 180 });

    if (simBridge.mode === 'running') setStatus(STATUS_RUN, `live · ${simBridge.simTime.toFixed(0)}s`);
    else if (simBridge.paused) setStatus(STATUS_PAUSE, 'paused');
    else setStatus(STATUS_IDLE, 'stopped');

    compareWrap.innerHTML = '';
    if (baselineKpis) compareWrap.appendChild(renderComparisonTable(kpis));
  }

  function attachId(node) {
    if (!node.id) node.id = `${containerId}-kpi-${Math.random().toString(36).slice(2, 8)}`;
    return node.id;
  }

  /** Δ% table of headline metrics vs the stored baseline run. */
  function renderComparisonTable(current) {
    const rows = [
      ['Avg Speed', 'avgSpeed', 'km/h', false],
      ['V/C Ratio', 'vcRatio', '', false],
      ['Avg Delay / km', 'avgDelayPerKm', 's/km', true],
      ['Max Queue', 'maxQueue', 'veh', true],
      ['Throughput', 'throughputVeh', 'veh/h', false],
      ['Total Distance', 'totalDistanceKm', 'km', false],
    ];
    const table = el('table', { class: 'w-full text-left border-collapse text-xs' });
    table.appendChild(el('thead', {},
      el('tr', { class: 'text-slate-400 border-b border-slate-700' },
        el('th', { class: 'py-1 pr-3' }, 'Metric'),
        el('th', { class: 'py-1 pr-3' }, `Baseline${baselineLabel ? ` (${baselineLabel})` : ''}`),
        el('th', { class: 'py-1 pr-3' }, 'Current'),
        el('th', { class: 'py-1 pr-3' }, 'Δ %'),
        el('th', { class: 'py-1' }, ''))));
    const tbody = el('tbody');
    for (const [label, key, unit, lowerIsBetter] of rows) {
      const b = baselineKpis?.[key];
      const c = current?.[key];
      const hasB = Number.isFinite(b);
      const hasC = Number.isFinite(c);
      let deltaText = '—';
      let deltaColor = 'text-slate-500';
      let arrow = '';
      if (hasB && hasC && b !== 0) {
        const pct = ((c - b) / Math.abs(b)) * 100;
        deltaText = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
        const improved = lowerIsBetter ? pct < -1 : pct > 1;
        const worsened = lowerIsBetter ? pct > 1 : pct < -1;
        arrow = improved ? '▲ better' : worsened ? '▼ worse' : '≈ flat';
        deltaColor = improved ? 'text-emerald-400' : worsened ? 'text-red-400' : 'text-slate-400';
      }
      tbody.appendChild(el('tr', { class: 'border-b border-slate-800/60 font-mono' },
        el('td', { class: 'py-1 pr-3 font-sans text-slate-300' }, label),
        el('td', { class: 'py-1 pr-3' }, hasB ? fmtVal(b, unit) : '—'),
        el('td', { class: 'py-1 pr-3' }, hasC ? fmtVal(c, unit) : '—'),
        el('td', { class: `py-1 pr-3 ${deltaColor}` }, deltaText),
        el('td', { class: `py-1 ${deltaColor}` }, arrow)));
    }
    table.appendChild(tbody);

    return el('div', {},
      el('div', { class: 'flex items-center justify-between mb-1' },
        el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400' }, 'Baseline comparison'),
        (() => {
          const clear = el('button', { class: 'text-[10px] text-red-400 hover:text-red-300 underline' }, 'clear baseline');
          clear.addEventListener('click', () => clearBaseline());
          return clear;
        })()),
      table);
  }

  function fmtVal(v, unit) {
    const num = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
    return unit ? `${num} ${unit}` : num;
  }

  // ------------------------------------------------------------- actions ----
  baselineBtn.addEventListener('click', () => {
    const kpis = computeKPIs(simBridge.positions, simBridge.network?.getAllEdges() ?? []);
    baselineKpis = kpis;
    baselineLabel = `t=${Math.round(simBridge.simTime)}s`;
    compareWrap.innerHTML = '';
    compareWrap.classList.remove('hidden');
    compareWrap.appendChild(el('div', { class: 'text-[11px] text-emerald-400 mb-1' },
      `✓ Baseline captured at t=${Math.round(simBridge.simTime)}s — run another config to compare.`));
    compareWrap.appendChild(renderComparisonTable(kpis));
  });

  function clearBaseline() {
    baselineKpis = null;
    baselineLabel = '';
    compareWrap.classList.add('hidden');
    compareWrap.innerHTML = '';
  }

  pdfBtn.addEventListener('click', () => {
    try {
      const scenario = {
        name: simBridge.scenarioName || 'SAE Simulation',
        description: `Corridor simulation · ${new Date().toLocaleString()} · mode=${simBridge.mode}`,
      };
      const netJson = simBridge.network ? simBridge.network.toJSON() : null;
      const results = {
        summary: simBridge.lastSummary ?? null,
        kpis: simBridge.getKPIs() ?? computeKPIs(simBridge.positions, simBridge.network?.getAllEdges() ?? []),
        history: simBridge.getHistory(),
      };
      const { fileName } = generateReport(scenario, netJson, results, null, { save: true });
      setStatus(STATUS_RUN, `PDF saved: ${fileName}`);
    } catch (err) {
      console.error('[dashboardPanel] PDF export failed:', err);
      statusText.textContent = `PDF failed: ${err.message ?? err}`;
      statusText.className = 'text-[11px] text-red-400';
    }
  });

  // ------------------------------------------------------------- lifecycle --
  function onCompletion(data) {
    showSummary({
      ...data.summary,
      los: data.kpis?.los,
    });
  }
  const offComplete = simBridge.onComplete(onCompletion);

  let timer = null;
  const refreshMs = opts.refreshMs ?? REFRESH_MS;
  if (refreshMs > 0) {
    timer = setInterval(() => {
      try { renderLive(); } catch (err) { console.error('[dashboardPanel] render error:', err); }
    }, refreshMs);
  }

  /**
   * Show the end-of-run summary block.
   * @param {Object} summary Engine summary + derived KPIs.
   */
  function showSummary(summary) {
    summaryBox.classList.remove('hidden');
    summaryBox.innerHTML = '';
    const s = summary ?? {};
    summaryBox.appendChild(el('div', { class: 'text-xs font-bold text-sky-300 mb-2' },
      '✔ Simulation complete'));

    const grid = el('div', { class: 'grid grid-cols-2 sm:grid-cols-4 gap-2' });
    const cells = [
      ['Duration', `${Math.round(s.duration ?? simBridge.simTime)} s`],
      ['Steps', String(s.steps ?? simBridge.stepCount)],
      ['Trips Completed', String(s.completedTrips ?? '—')],
      ['Avg Speed', Number.isFinite(s.avgSpeedKmh) ? `${s.avgSpeedKmh.toFixed(1)} km/h` : '—'],
      ['Total Distance', Number.isFinite(s.totalDistanceKm) ? `${s.totalDistanceKm.toFixed(2)} km` : '—'],
      ['LOS', s.los ?? '—'],
      ['Collisions', String(s.collisions ?? 0)],
      ['Wall Time', Number.isFinite(s.wallMs) ? `${(s.wallMs / 1000).toFixed(2)} s` : '—'],
    ];
    for (const [label, value] of cells) {
      grid.appendChild(el('div', { class: 'bg-slate-800 rounded px-2 py-1.5 border border-slate-700' },
        el('div', { class: 'text-[9px] uppercase tracking-wide text-slate-500' }, label),
        el('div', { class: 'text-sm font-bold font-mono text-slate-100' }, value)));
    }
    summaryBox.appendChild(grid);
  }

  renderLive();

  return {
    setBaseline(kpis, label) {
      baselineKpis = kpis;
      baselineLabel = label ?? 'manual';
      compareWrap.classList.remove('hidden');
      compareWrap.innerHTML = '';
      compareWrap.appendChild(renderComparisonTable(kpis));
    },
    clearBaseline,
    showSummary,
    destroy() {
      if (timer) clearInterval(timer);
      offComplete();
      host.innerHTML = '';
    },
  };
}

const BTN_PRIMARY = 'px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold';
const BTN_SECONDARY = 'px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs';
const STATUS_IDLE = 'inline-block w-2 h-2 rounded-full bg-slate-500';
const STATUS_RUN = 'inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
const STATUS_PAUSE = 'inline-block w-2 h-2 rounded-full bg-amber-400';

export { LOS_THRESHOLDS };
export default initDashboardPanel;
