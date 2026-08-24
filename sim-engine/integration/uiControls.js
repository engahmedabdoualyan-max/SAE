/**
 * @file Simulation control panel: play/pause/reset, speed slider, clock,
 * step counter, headline KPI cards and a speed sparkline (last 60 steps).
 *
 * Zero dependencies — the sparkline is drawn on a plain 2D canvas so it works
 * even when Chart.js fails to load.
 *
 * @example
 * import { initSimControls } from './sim-engine/integration/uiControls.js';
 * const controls = initSimControls('sim-controls', bridge);
 * // later: controls.destroy();
 */

const KPI_CARD_DEFS = [
  { key: 'speed', label: 'Avg Speed', unit: 'km/h', decimals: 1 },
  { key: 'los', label: 'LOS', unit: '', decimals: 0 },
  { key: 'vc', label: 'V/C', unit: '', decimals: 2 },
  { key: 'delay', label: 'Delay', unit: 's/km', decimals: 1 },
  { key: 'queue', label: 'Max Queue', unit: 'veh', decimals: 0 },
  { key: 'crashes', label: 'Est. Crashes', unit: '/M veh·km', decimals: 2 },
];

/** Baseline crash rate per million vehicle-km (urban arterial, mixed traffic). */
const BASE_CRASH_RATE = 0.55;
/** Extra risk weight for chaotic vehicle types in mixed traffic. */
const CHAOTIC_TYPES = new Set(['tuktuk', 'motorcycle', 'bicycle']);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Heuristic crash estimate from current KPIs + fleet mix.
 * rate = BASE × (1 + 1.5·chaoticShare) × (1 − avgBlackspotImprovement/2)
 */
export function estimateCrashes(kpis, demandMix = {}, blackspots = []) {
  const distanceKm = kpis?.totalDistanceKm ?? 0;
  if (!(distanceKm > 0)) return 0;
  let chaoticShare = 0;
  let total = 0;
  for (const [type, share] of Object.entries(demandMix)) {
    total += share;
    if (CHAOTIC_TYPES.has(type)) chaoticShare += share;
  }
  if (total > 0) chaoticShare /= total;
  let impSum = 0;
  let impCount = 0;
  for (const b of blackspots) {
    if (Number.isFinite(b?.imp)) { impSum += b.imp; impCount += 1; }
  }
  const avgImp = impCount > 0 ? impSum / impCount : -0.66;
  return (distanceKm / 1e6) * BASE_CRASH_RATE * (1 + 1.5 * chaoticShare) * (1 - avgImp / 2);
}

/**
 * Build the simulation control panel inside `containerId`.
 *
 * @param {string} containerId Host element id (existing children are replaced).
 * @param {import('./simBridge.js').SimBridge} simBridge Initialised bridge.
 * @param {Object} [opts]
 * @param {Array<{en?:string,n?:string,imp:number}>} [opts.blackspots] BLACKSPOTS data for the crash heuristic.
 * @param {number} [opts.sparkWidth=220] @param {number} [opts.sparkHeight=64]
 * @returns {{destroy: Function, updateNow: Function, elements: Object}} Handle.
 * @throws {Error} When the container or bridge is missing.
 */
export function initSimControls(containerId, simBridge, opts = {}) {
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`initSimControls: no element with id "${containerId}"`);
  if (!simBridge) throw new Error('initSimControls: simBridge required');

  host.innerHTML = '';
  Object.assign(host.style, { display: 'block' });

  // -- row 1: transport controls -------------------------------------------
  const playBtn = el('button', {
    class: 'px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold',
    title: 'Play / Pause',
  }, '▶ Play');
  const resetBtn = el('button', {
    class: 'px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold',
    title: 'Reset to t=0',
  }, '⟲ Reset');
  const modeBadge = el('span', {
    class: 'text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 uppercase tracking-wide',
    title: 'Engine execution mode',
  }, simBridge.mode ?? 'idle');

  const speedSlider = el('input', {
    type: 'range', min: '0.5', max: '10', step: '0.5', value: String(simBridge.speed ?? 1),
    class: 'w-28 accent-sky-500 align-middle',
    title: 'Playback speed',
  });
  const speedLabel = el('span', { class: 'text-xs text-slate-300 w-9 inline-block' }, `${simBridge.speed ?? 1}×`);

  const timeDisplay = el('span', { class: 'font-mono text-sm text-slate-100' }, '0:00');
  const stepDisplay = el('span', { class: 'font-mono text-sm text-slate-400' }, '#0');
  const vehDisplay = el('span', { class: 'font-mono text-sm text-slate-400' }, '0 veh');

  const row1 = el('div', { class: 'flex items-center gap-3 flex-wrap mb-3' },
    playBtn, resetBtn,
    el('label', { class: 'flex items-center gap-2 text-xs text-slate-400' }, 'Speed', speedSlider, speedLabel),
    el('span', { class: 'ml-auto flex items-center gap-3' },
      el('span', { class: 'text-[10px] uppercase text-slate-500' }, 'Time'), timeDisplay,
      el('span', { class: 'text-[10px] uppercase text-slate-500 ml-2' }, 'Step'), stepDisplay,
      vehDisplay, modeBadge));

  // -- row 2: KPI cards ------------------------------------------------------
  const cardEls = {};
  const cardNodes = KPI_CARD_DEFS.map((def) => {
    const value = el('div', { class: 'text-lg font-bold text-slate-50 font-mono' }, '—');
    const unit = def.unit ? el('span', { class: 'text-[10px] text-slate-400 ml-1' }, def.unit) : null;
    const body = el('div', { class: 'flex items-baseline' }, value);
    if (unit) body.appendChild(unit);
    const card = el('div', { class: 'bg-slate-800/80 rounded-lg px-3 py-2 border border-slate-700 min-w-[92px]' },
      el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400 mb-0.5' }, def.label), body);
    cardEls[def.key] = value;
    return card;
  });
  const row2 = el('div', { class: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3' }, ...cardNodes);

  // -- row 3: sparkline -------------------------------------------------------
  const W = opts.sparkWidth ?? 220;
  const H = opts.sparkHeight ?? 64;
  const spark = /** @type {HTMLCanvasElement} */ (el('canvas', { width: String(W), height: String(H), class: 'rounded bg-slate-900 border border-slate-700' }));
  const row3 = el('div', { class: 'flex items-center gap-3' },
    el('div', {},
      el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400 mb-1' }, 'Speed — last 60 steps'),
      spark),
    (() => {
      const legend = el('div', { class: 'text-[11px] text-slate-400 leading-5' });
      legend.appendChild(el('div', {}, 'max: ', el('span', { class: 'font-mono text-slate-200', id: `${containerId}-spark-max` }, '—')));
      legend.appendChild(el('div', {}, 'min: ', el('span', { class: 'font-mono text-slate-200', id: `${containerId}-spark-min` }, '—')));
      return legend;
    })());

  host.appendChild(row1);
  host.appendChild(row2);
  host.appendChild(row3);

  // ---------------------------------------------------------------- logic --
  let playing = false;

  function setPlayingUI(isPlaying) {
    playing = isPlaying;
    playBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
    playBtn.className = `px-3 py-1.5 rounded-lg text-white text-sm font-semibold ${isPlaying
      ? 'bg-amber-600 hover:bg-amber-500'
      : 'bg-emerald-600 hover:bg-emerald-500'}`;
  }

  playBtn.addEventListener('click', async () => {
    try {
      if (!simBridge.ready) {
        await simBridge.startSimulation({ speed: Number(speedSlider.value) });
        setPlayingUI(true);
      } else if (playing || (!simBridge.running && !simBridge.paused && simBridge.stepCount === 0)) {
        if (simBridge.paused || simBridge.stepCount > 0) simBridge.ensureRunning();
        else await simBridge.startSimulation();
        setPlayingUI(true);
      } else if (simBridge.paused) {
        simBridge.resumeSimulation();
        setPlayingUI(true);
      } else {
        simBridge.pauseSimulation();
        setPlayingUI(false);
      }
      modeBadge.textContent = simBridge.mode ?? 'idle';
    } catch (err) {
      console.error('[uiControls] play/pause failed:', err);
    }
  });

  resetBtn.addEventListener('click', async () => {
    try {
      await simBridge.resetSimulation();
      setPlayingUI(false);
      updateNow();
    } catch (err) {
      console.error('[uiControls] reset failed:', err);
    }
  });

  speedSlider.addEventListener('input', () => {
    const v = Number(speedSlider.value);
    simBridge.setSpeed(v);
    speedLabel.textContent = `${v}×`;
  });

  // ------------------------------------------------------------- rendering --
  const losColors = { A: '#16a34a', B: '#22c55e', C: '#eab308', D: '#f97316', E: '#ef4444', F: '#b91c1c' };

  function drawSparkline(history) {
    const ctx = spark.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, W, H);

    const series = history.slice(-60).map((h) => h.avgSpeed).filter(Number.isFinite);
    const maxSpan = document.getElementById(`${containerId}-spark-max`);
    const minSpan = document.getElementById(`${containerId}-spark-min`);
    if (series.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '10px monospace';
      ctx.fillText('no data yet', 8, H / 2);
      if (maxSpan) maxSpan.textContent = '—';
      if (minSpan) minSpan.textContent = '—';
      return;
    }
    const max = Math.max(...series, 1);
    const min = Math.min(...series);
    if (maxSpan) maxSpan.textContent = `${max.toFixed(1)} km/h`;
    if (minSpan) minSpan.textContent = `${min.toFixed(1)} km/h`;

    const pad = 6;
    const xStep = series.length > 1 ? (W - pad * 2) / (series.length - 1) : 0;
    const yFor = (v) => H - pad - ((v - Math.min(min, 0)) / (max - Math.min(min, 0) || 1)) * (H - pad * 2);

    ctx.strokeStyle = '#334155';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad, yFor(max)); ctx.lineTo(W - pad, yFor(max)); ctx.stroke();
    ctx.setLineDash([]);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(56,189,248,.55)');
    grad.addColorStop(1, 'rgba(56,189,248,.05)');
    ctx.beginPath();
    ctx.moveTo(pad, H - pad);
    series.forEach((v, i) => ctx.lineTo(pad + i * xStep, yFor(v)));
    ctx.lineTo(pad + (series.length - 1) * xStep, H - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    series.forEach((v, i) => (i === 0 ? ctx.moveTo(pad, yFor(v)) : ctx.lineTo(pad + i * xStep, yFor(v))));
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function updateNow() {
    const kpis = simBridge.getKPIs() ?? {};
    cardEls.speed.textContent = Number.isFinite(kpis.avgSpeed) ? kpis.avgSpeed.toFixed(1) : '—';
    if (Number.isFinite(kpis.avgSpeed)) cardEls.speed.style.color = losColors[kpis.los] ?? '#f8fafc';
    cardEls.los.textContent = kpis.los ?? '—';
    if (kpis.los) cardEls.los.style.color = losColors[kpis.los] ?? '#f8fafc';
    cardEls.vc.textContent = Number.isFinite(kpis.vcRatio) ? kpis.vcRatio.toFixed(2) : '—';
    cardEls.delay.textContent = Number.isFinite(kpis.avgDelayPerKm) ? kpis.avgDelayPerKm.toFixed(1) : '—';
    cardEls.queue.textContent = Number.isFinite(kpis.maxQueue) ? String(Math.round(kpis.maxQueue)) : '—';
    cardEls.crashes.textContent = estimateCrashes(
      { totalDistanceKm: simBridge.lastSummary?.totalDistanceKm ?? kpis.totalDistanceKm ?? 0 },
      simBridge.demandMix,
      opts.blackspots ?? [],
    ).toFixed(2);

    timeDisplay.textContent = fmtTime(simBridge.simTime);
    stepDisplay.textContent = `#${simBridge.stepCount}`;
    vehDisplay.textContent = `${simBridge.positions.length} veh`;
    drawSparkline(simBridge.getHistory());
  }

  const unsubscribe = simBridge.onStep(() => updateNow());

  return {
    destroy() {
      unsubscribe();
      host.innerHTML = '';
    },
    updateNow,
    elements: { playBtn, resetBtn, speedSlider, timeDisplay, stepDisplay, spark },
  };
}

export default initSimControls;
