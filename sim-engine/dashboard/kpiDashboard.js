/**
 * @file Results dashboard: KPI cards, Chart.js visualisations, network speed
 * heatmaps, scenario comparisons and before/after slider views.
 *
 * Expects **Chart.js 4.x** to be loaded globally (`window.Chart`) — the page
 * already includes it. All render functions are defensive: when Chart.js is
 * absent the cards/tables still render and a notice replaces the charts.
 *
 * @example
 * import { renderKPIDashboard, renderHeatmap } from './sim-engine/dashboard/kpiDashboard.js';
 * const { charts } = renderKPIDashboard('kpi-panel', sim.kpis, sim.history);
 * renderHeatmap(document.getElementById('map-canvas'), sim.vehicles, net.getAllEdges());
 */

/* global Chart */

/** LOS letter → brand colour. @type {Record<string,string>} */
const LOS_COLORS = {
  A: '#16a34a', B: '#22c55e', C: '#eab308', D: '#f97316', E: '#ef4444', F: '#b91c1c',
};

/** Continuous green→red ramp for utilisation ratios in [0, 1]. @param {number} r @returns {string} */
function ratioColor(r) {
  if (!Number.isFinite(r)) return '#94a3b8';
  if (r < 0.5) return '#22c55e';
  if (r < 0.7) return '#a3e635';
  if (r < 0.85) return '#eab308';
  if (r <= 1.0) return '#f97316';
  return '#ef4444';
}

/** Speed-ratio colour ramp used by the heatmap legend. */
const HEAT_RAMP = Object.freeze([
  { max: 0.25, color: '#ef4444', label: 'congested (< 25 %)' },
  { max: 0.5, color: '#f97316', label: 'heavy (< 50 %)' },
  { max: 0.75, color: '#eab308', label: 'moderate (< 75 %)' },
  { max: Infinity, color: '#22c55e', label: 'free flow' },
]);

/** @param {number} r Speed/speedLimit ratio. @returns {string} hex colour */
function heatColor(r) {
  if (!Number.isFinite(r)) return '#94a3b8';
  for (const band of HEAT_RAMP) if (r < band.max) return band.color;
  return '#94a3b8';
}

/** Resolve a container by id, throwing a helpful error. @param {string} containerId @returns {HTMLElement} */
function ensureContainer(containerId) {
  if (typeof document === 'undefined') {
    throw new Error('dashboard: requires a DOM environment');
  }
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`dashboard: no element with id "${containerId}"`);
  return el;
}

/** Destroy charts previously registered on a container (prevents Canvas leaks). */
function destroyCharts(container) {
  const prev = /** @type {any} */ (container)._saeCharts;
  if (Array.isArray(prev)) for (const c of prev) c.destroy?.();
  /** @type {any} */ (container)._saeCharts = [];
}

/** Register a chart for later cleanup. @param {HTMLElement} c @param {any} chart */
function registerChart(c, chart) {
  if (chart) /** @type {any} */(c)._saeCharts.push(chart);
}

/** @returns {boolean} Chart.js availability */
function hasChart() {
  return typeof Chart !== 'undefined' && typeof Chart === 'function';
}

/** Chart-not-loaded placeholder node. @returns {HTMLElement} */
function chartMissingNote() {
  const div = document.createElement('div');
  div.style.cssText =
    'height:100%;display:flex;align-items:center;justify-content:center;' +
    'color:#64748b;font-size:12px;border:1px dashed #cbd5e1;border-radius:8px;';
  div.textContent = 'Chart.js is not loaded — charts unavailable.';
  return div;
}

/** Fixed-height wrapper so Chart.js `maintainAspectRatio:false` behaves. @param {number|string} h @returns {HTMLElement} */
function chartBox(height = 220) {
  const box = document.createElement('div');
  box.style.cssText = `position:relative;height:${typeof height === 'number' ? `${height}px` : height};width:100%;`;
  return box;
}

/** Number formatting helper. @param {number|null|undefined} v @param {number} [d=1] @returns {string} */
function fmt(v, d = 1) {
  return Number.isFinite(v) ? Number(v).toFixed(d) : '—';
}

// ------------------------------------------------------------- main board --

/**
 * Render the full KPI dashboard (cards + four charts) into `containerId`.
 *
 * Cards: average speed, LOS badge, V/C ratio, flow, density, active vehicles,
 * max queue and delay per km.
 * Charts: avg-speed gauge (half doughnut), V/C bars, flow–density trajectory
 * from history, and speed-vs-time line from history.
 *
 * @param {string} containerId Target element id (contents replaced).
 * @param {Object} kpis KPI object as produced by {@link computeKPIs}
 *   (`avgSpeed`, `los`, `vcRatio`, `maxVC`, `flow`, `density`, `vehicleCount`,
 *   `maxQueue`, `avgDelayPerKm`).
 * @param {Array<{t:number,avgSpeed:number,flow:number,density:number}>} [history]
 *   Compact history samples (see `Simulator.history`).
 * @param {Object} [opts]
 * @param {number} [opts.gaugeMaxSpeed=120] Gauge full-scale [km/h].
 * @param {number} [opts.chartHeight=220] Chart height in px.
 * @returns {{container: HTMLElement, cards: HTMLElement[], charts: Record<string, any>}}
 * @throws {Error} When the container does not exist or no DOM is available.
 */
export function renderKPIDashboard(containerId, kpis, history = [], opts = {}) {
  const host = ensureContainer(containerId);
  destroyCharts(host);
  host.innerHTML = '';

  const gaugeMax = Number.isFinite(opts.gaugeMaxSpeed) ? opts.gaugeMaxSpeed : 120;
  const chartH = Number.isFinite(opts.chartHeight) ? opts.chartHeight : 220;

  // -------------------------------------------------------------- cards ---
  const grid = document.createElement('div');
  grid.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px;';

  const los = String(kpis?.los ?? '—');
  const cardsSpec = [
    { label: 'Avg speed', value: `${fmt(kpis?.avgSpeed)} km/h`, color: '#38bdf8' },
    { label: 'LOS', value: los, color: LOS_COLORS[los] ?? '#94a3b8' },
    { label: 'V / C', value: fmt(kpis?.vcRatio, 2), color: ratioColor(kpis?.vcRatio) },
    { label: 'Flow', value: `${fmt(kpis?.flow, 0)} veh/h`, color: '#a78bfa' },
    { label: 'Density', value: `${fmt(kpis?.density)} veh/km`, color: '#f59e0b' },
    { label: 'Vehicles', value: fmt(kpis?.vehicleCount, 0), color: '#34d399' },
    { label: 'Max queue', value: `${fmt(kpis?.maxQueue, 0)} veh`, color: '#fb7185' },
    { label: 'Delay', value: `${fmt(kpis?.avgDelayPerKm)} s/km`, color: '#94a3b8' },
  ];

  const cards = [];
  for (const spec of cardsSpec) {
    const card = document.createElement('div');
    card.style.cssText =
      'background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;';
    card.innerHTML =
      `<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">${spec.label}</div>` +
      `<div style="font-size:20px;font-weight:700;color:${spec.color};margin-top:2px;">${spec.value}</div>`;
    grid.appendChild(card);
    cards.push(card);
  }
  host.appendChild(grid);

  // ------------------------------------------------------------- charts ---
  const chartsGrid = document.createElement('div');
  chartsGrid.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;';
  host.appendChild(chartsGrid);

  /** @type {Record<string, any>} */ const charts = {};

  if (!hasChart()) {
    for (let i = 0; i < 4; i++) {
      const box = chartBox(chartH);
      box.appendChild(chartMissingNote());
      chartsGrid.appendChild(box);
    }
    return { container: host, cards, charts };
  }

  const baseFont = { family: 'ui-sans-serif, system-ui, sans-serif' };

  // 1 — Average-speed half gauge -------------------------------------------
  const speedRatio = Math.max(0, Math.min(1, (kpis?.avgSpeed ?? 0) / gaugeMax));
  const gaugeCanvasBox = chartBox(chartH);
  const gaugeCanvas = document.createElement('canvas');
  gaugeCanvas.setAttribute('role', 'img');
  gaugeCanvas.setAttribute('aria-label', 'Average speed gauge');
  gaugeCanvasBox.appendChild(gaugeCanvas);
  chartsGrid.appendChild(gaugeCanvasBox);

  const centerText = {
    id: 'saeCenterText',
    afterDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.[0]) return;
      const { x, y } = meta.data[0];
      ctx.save();
      ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.fillText(`${fmt(kpis?.avgSpeed)}`, x, y - 4);
      ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('km/h avg', x, y + 14);
      ctx.restore();
    },
  };

  charts.speedGauge = new Chart(gaugeCanvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [speedRatio * gaugeMax, Math.max(0, gaugeMax - speedRatio * gaugeMax)],
        backgroundColor: [
          speedRatio > 0.66 ? '#22c55e' : speedRatio > 0.33 ? '#eab308' : '#ef4444',
          '#e2e8f0',
        ],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
    plugins: [centerText],
  });
  registerChart(host, charts.speedGauge);

  // 2 — V/C bar -------------------------------------------------------------
  const vcBox = chartBox(chartH);
  const vcCanvas = document.createElement('canvas');
  vcCanvas.setAttribute('aria-label', 'Volume over capacity bar chart');
  vcBox.appendChild(vcCanvas);
  chartsGrid.appendChild(vcBox);
  const vcVals = [kpis?.vcRatio ?? 0, kpis?.maxVC ?? 0];
  charts.vcBar = new Chart(vcCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Network V/C', 'Worst edge V/C'],
      datasets: [{
        data: vcVals,
        backgroundColor: vcVals.map((v) => ratioColor(v)),
        borderRadius: 6,
        barThickness: 26,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { min: 0, suggestedMax: Math.max(1.2, ...vcVals), ticks: { font: baseFont } },
        y: { ticks: { font: baseFont } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${Number(c.raw).toFixed(3)}` } },
      },
    },
  });
  registerChart(host, charts.vcBar);

  // 3 — Flow–density diagram -------------------------------------------------
  const fdBox = chartBox(chartH);
  const fdCanvas = document.createElement('canvas');
  fdCanvas.setAttribute('aria-label', 'Flow density diagram');
  fdBox.appendChild(fdCanvas);
  chartsGrid.appendChild(fdBox);
  const pts = (history ?? [])
    .filter((h) => Number.isFinite(h.density) && Number.isFinite(h.flow))
    .map((h) => ({ x: h.density, y: h.flow }));
  charts.flowDensity = new Chart(fdCanvas.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Trajectory',
          data: pts,
          showLine: true,
          pointRadius: 1.5,
          borderWidth: 1.5,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,.15)',
          fill: true,
        },
        {
          label: 'Current',
          data: [{ x: kpis?.density ?? 0, y: kpis?.flow ?? 0 }],
          pointRadius: 6,
          backgroundColor: '#ef4444',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: 'density [veh/km]' }, beginAtZero: true },
        y: { title: { display: true, text: 'flow [veh/h]' }, beginAtZero: true },
      },
      plugins: { legend: { labels: { font: baseFont, boxWidth: 10 } } },
    },
  });
  registerChart(host, charts.flowDensity);

  // 4 — Speed vs time ---------------------------------------------------------
  const stBox = chartBox(chartH);
  const stCanvas = document.createElement('canvas');
  stCanvas.setAttribute('aria-label', 'Average speed over time chart');
  stBox.appendChild(stCanvas);
  chartsGrid.appendChild(stBox);
  const hist = (history ?? []).filter((h) => Number.isFinite(h.t));
  charts.speedTime = new Chart(stCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: hist.map((h) => h.t),
      datasets: [{
        label: 'Avg speed [km/h]',
        data: hist.map((h) => h.avgSpeed),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,.12)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.25,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { title: { display: true, text: 'time [s]' }, ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: true, suggestedMax: gaugeMax },
      },
      plugins: { legend: { labels: { font: baseFont, boxWidth: 10 } } },
    },
  });
  registerChart(host, charts.speedTime);

  return { container: host, cards, charts };
}

// ---------------------------------------------------------------- heatmap --

/**
 * Colour network edges by live average vehicle speed.
 *
 * Supports three rendering backends, auto-detected:
 *  1. **Leaflet** — `window.L` present and `map.addLayer` exists → polylines
 *     in a layer group added to the map.
 *  2. **Google Maps** — `window.google.maps` present → `Polyline` overlays.
 *  3. **Canvas 2D** fallback — pass an `<canvas>`, a `CanvasRenderingContext2D`
 *     or a container element id; edges are drawn with a fitted viewport and a
 *     legend swatch block.
 *
 * Edge coordinates resolve from `edge.shape` ([[lat,lng],…], set by the SUMO /
 * GeoJSON importers) falling back to straight lines between endpoints via
 * `opts.nodes` (`{ [nodeId]: {lat, lng} }`).
 *
 * @param {any} map Leaflet map | Google map | canvas | canvas 2D context | element id.
 * @param {Array<{edgeId:string, speed:number}>} vehicles Active vehicles (m/s).
 * @param {Array<Object>} edges Edge objects (`id`, `speedLimit`, optional `shape`).
 * @param {Object} [opts]
 * @param {Record<string,{lat:number,lng:number}>} [opts.nodes] Endpoint lookup.
 * @param {number} [opts.weight=5] Line width (Leaflet/Google).
 * @returns {{type:string, colorsByEdge:Record<string,string>, speedsByEdge:Record<string,number>, warnings:string[], layerGroup?:any, polylines?:any[], remove?:()=>void}}
 * @throws {TypeError} When no supported backend can be found.
 */
export function renderHeatmap(map, vehicles = [], edges = [], opts = {}) {
  if (map == null) throw new TypeError('renderHeatmap: map target required');

  // Per-edge mean speed from live vehicles [m/s].
  const sums = new Map();
  const counts = new Map();
  for (const v of vehicles) {
    if (!v || typeof v.edgeId !== 'string') continue;
    sums.set(v.edgeId, (sums.get(v.edgeId) ?? 0) + (Number.isFinite(v.speed) ? v.speed : 0));
    counts.set(v.edgeId, (counts.get(v.edgeId) ?? 0) + 1);
  }

  /** @type {Record<string, number>} */ const speedsByEdge = {};
  /** @type {Record<string, string>} */ const colorsByEdge = {};
  const warnings = [];

  const latLngsOf = (edge) => {
    if (Array.isArray(edge.shape) && edge.shape.length >= 2) return edge.shape;
    const nodes = opts.nodes;
    if (nodes) {
      const a = nodes[edge.from];
      const b = nodes[edge.to];
      if (a && b) return [[a.lat, a.lng], [b.lat, b.lng]];
    }
    return null;
  };

  const prepared = [];
  for (const edge of edges) {
    if (!edge || typeof edge.id !== 'string') continue;
    let speedMS;
    if (counts.get(edge.id)) speedMS = sums.get(edge.id) / counts.get(edge.id);
    else if (Number.isFinite(edge.avgSpeedMS)) speedMS = edge.avgSpeedMS;
    else speedMS = NaN;

    const limit = Number.isFinite(edge.speedLimit) && edge.speedLimit > 0 ? edge.speedLimit : 13.9;
    const ratio = Number.isFinite(speedMS) ? speedMS / limit : NaN;
    const color = heatColor(ratio);
    speedsByEdge[edge.id] = Number.isFinite(speedMS)
      ? Math.round(speedMS * 3.6 * 10) / 10
      : NaN;
    colorsByEdge[edge.id] = color;

    const ll = latLngsOf(edge);
    if (!ll) warnings.push(`edge "${edge.id}" has no drawable coordinates`);
    prepared.push({ edge, ll, color, kmh: speedsByEdge[edge.id], lanes: edge.laneCount ?? edge.lanes ?? 1 });
  }

  // --- Leaflet --------------------------------------------------------------
  const Lref = typeof window !== 'undefined' ? /** @type {any} */ (window).L : undefined;
  if (Lref && map && typeof map.addLayer === 'function') {
    const group = Lref.layerGroup();
    for (const { edge, ll, color, kmh } of prepared) {
      if (!ll) continue;
      Lref.polyline(ll, {
        color,
        weight: opts.weight ?? 5,
        opacity: 0.9,
      }).bindTooltip(
        `<b>${edge.id}</b><br>${Number.isFinite(kmh) ? `${kmh} km/h` : 'no data'}`
      ).addTo(group);
    }
    group.addTo(map);
    return { type: 'leaflet', colorsByEdge, speedsByEdge, warnings, layerGroup: group };
  }

  // --- Google Maps ------------------------------------------------------------
  const gmaps = typeof google !== 'undefined' ? google?.maps : undefined;
  if (gmaps && typeof map.setCenter === 'function') {
    const polylines = [];
    for (const { ll, color, weight } of prepared) {
      if (!ll) continue;
      polylines.push(new gmaps.Polyline({
        path: ll.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: color,
        strokeWeight: opts.weight ?? weight,
        strokeOpacity: 0.9,
        map,
      }));
    }
    return {
      type: 'google',
      colorsByEdge,
      speedsByEdge,
      warnings,
      polylines,
      remove() { for (const p of polylines) p.setMap(null); },
    };
  }

  // --- Canvas 2D ---------------------------------------------------------------
  let canvas = null;
  let ctx = null;
  if (typeof CanvasRenderingContext2D !== 'undefined' && map instanceof CanvasRenderingContext2D) {
    ctx = map;
    canvas = map.canvas;
  } else if (typeof HTMLCanvasElement !== 'undefined' && map instanceof HTMLCanvasElement) {
    canvas = map;
    ctx = canvas.getContext('2d');
  } else if (typeof map === 'string') {
    const el = document.getElementById(map);
    if (el instanceof HTMLCanvasElement) { canvas = el; ctx = el.getContext('2d'); }
    else {
      const inner = el?.querySelector('canvas');
      if (inner) { canvas = inner; ctx = inner.getContext('2d'); }
    }
  }
  if (!ctx) {
    throw new TypeError('renderHeatmap: unsupported map target (expected Leaflet, Google Maps or a canvas)');
  }

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Fit bounds over drawable edges.
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const { ll } of prepared) {
    if (!ll) continue;
    for (const [lat, lng] of ll) {
      minX = Math.min(minX, lng); maxX = Math.max(maxX, lng);
      minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
    }
  }
  if (!Number.isFinite(minX)) {
    warnings.push('nothing to draw — no edge had coordinates');
    return { type: 'canvas', colorsByEdge, speedsByEdge, warnings };
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const pad = 20;
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const project = (lat, lng) => [
    pad + (lng - minX) * scale + ((W - pad * 2) - spanX * scale) / 2,
    H - pad - (lat - minY) * scale - ((H - pad * 2) - spanY * scale) / 2,
  ];

  for (const { ll, color, lanes } of prepared) {
    if (!ll) continue;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.min(12, 2.5 + lanes * 1.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ll.forEach(([lat, lng], i) => {
      const [x, y] = project(lat, lng);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (ll.length === 2) { const [x, y] = project(ll[1][0], ll[1][1]); ctx.lineTo(x, y); }
    ctx.stroke();
  }

  // Legend.
  const bx = W - 150;
  const by = 12;
  ctx.fillStyle = 'rgba(15,23,42,.85)';
  ctx.fillRect(bx, by, 138, 18 * HEAT_RAMP.length + 10);
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  HEAT_RAMP.forEach((band, i) => {
    ctx.fillStyle = band.color;
    ctx.fillRect(bx + 8, by + 8 + i * 18, 12, 12);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(band.label, bx + 26, by + 18 + i * 18);
  });

  return { type: 'canvas', colorsByEdge, speedsByEdge, warnings, ctx };
}

// ------------------------------------------------------------- comparison --

/**
 * Side-by-side comparison of two simulation results.
 *
 * Accepts anything carrying numeric KPI fields directly (`sim.kpis`,
 * `computeKPIs()` output, `simulator.summary()` payload…) — fields missing on
 * either side are omitted from the table. Deltas are signed relative changes
 * coloured by whether they are *desirable* (faster & more flow good; delay,
 * density and V/C bad).
 *
 * A radar chart normalises each metric to its max(|A|, |B|) for quick shape
 * comparison across units.
 *
 * @param {string} containerId Target element id.
 * @param {Object} resultsA Baseline results (`.label` names it).
 * @param {Object} resultsB Variant results.
 * @param {Object} [opts]
 * @param {string} [opts.labelA='Scenario A'] Fallback label.
 * @param {string} [opts.labelB='Scenario B'] Fallback label.
 * @returns {{container:HTMLElement, chart:any}}
 */
export function renderComparison(containerId, resultsA, resultsB, opts = {}) {
  const host = ensureContainer(containerId);
  destroyCharts(host);

  const labelA = resultsA?.label ?? opts.labelA ?? 'Scenario A';
  const labelB = resultsB?.label ?? opts.labelB ?? 'Scenario B';

  /** metric key, display name, decimals, positive-is-good flag */
  const METRICS = [
    ['avgSpeed', 'Avg speed (km/h)', 1, true],
    ['flow', 'Flow (veh/h)', 0, true],
    ['vehicleCount', 'Active vehicles', 0, true],
    ['density', 'Density (veh/km)', 1, false],
    ['vcRatio', 'V / C ratio', 3, false],
    ['avgDelayPerKm', 'Delay (s/km)', 1, false],
    ['maxQueue', 'Max queue (veh)', 0, false],
  ].filter(([key]) =>
    Number.isFinite(resultsA?.[key]) || Number.isFinite(resultsB?.[key]));

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;';
  table.innerHTML =
    `<thead><tr style="text-align:left;color:#64748b;">` +
    '<th style="padding:6px 8px;">Metric</th>' +
    `<th style="padding:6px 8px;text-align:right;">${escapeHtml(labelA)}</th>` +
    `<th style="padding:6px 8px;text-align:right;">${escapeHtml(labelB)}</th>` +
    '<th style="padding:6px 8px;text-align:right;">Δ</th></tr></thead>';

  const rows = METRICS.map(([key, name, dec, goodWhenUp]) => {
    const va = resultsA[key];
    const vb = resultsB[key];
    let deltaHtml = '<span style="color:#94a3b8;">—</span>';
    if (Number.isFinite(va) && Number.isFinite(vb)) {
      if (va === 0) {
        deltaHtml = vb === 0 ? '<span style="color:#94a3b8;">±0</span>' : '<span style="color:#16a34a;">new</span>';
      } else {
        const pct = ((vb - va) / Math.abs(va)) * 100;
        const desirable = goodWhenUp ? pct > 0 : pct < 0;
        const neutral = Math.abs(pct) < 0.05;
        const color = neutral ? '#94a3b8' : desirable ? '#16a34a' : '#dc2626';
        const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
        deltaHtml = `<span style="color:${color};font-variant-numeric:tabular-nums;">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
      }
    }
    return (
      `<tr style="border-top:1px solid #e2e8f0;">` +
      `<td style="padding:6px 8px;">${name}</td>` +
      `<td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(va, dec)}</td>` +
      `<td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(vb, dec)}</td>` +
      `<td style="padding:6px 8px;text-align:right;">${deltaHtml}</td></tr>`
    );
  }).join('');
  table.innerHTML += `<tbody>${rows}</tbody>`;
  host.appendChild(table);

  // Radar overview.
  let chart = null;
  if (hasChart() && METRICS.length >= 3) {
    const norm = (results) => METRICS.map(([key]) => {
      const va = Math.abs(resultsA[key] ?? 0);
      const vb = Math.abs(resultsB[key] ?? 0);
      const denom = Math.max(va, vb);
      return denom > 0 ? Math.abs(results?.[key] ?? 0) / denom : 0;
    });
    const box = chartBox(240);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Comparison radar chart');
    box.appendChild(canvas);
    host.appendChild(box);
    chart = new Chart(canvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: METRICS.map(([, name]) => name),
        datasets: [
          { label: labelA, data: norm(resultsA), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.15)', pointRadius: 2 },
          { label: labelB, data: norm(resultsB), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.15)', pointRadius: 2 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { r: { suggestedMin: 0, suggestedMax: 1, ticks: { display: false } } } },
    });
    registerChart(host, chart);
  }

  return { container: host, chart };
}

// ---------------------------------------------------------- before / after --

/**
 * Before/after comparison with a draggable split slider.
 *
 * Both result panels are rendered fully and overlaid; the top ("after") panel
 * is clipped via `clip-path` controlled by the slider, producing a wipe effect
 * that works without pointer-drag maths and stays keyboard accessible.
 *
 * @param {string} containerId Target element id.
 * @param {Object} before Baseline KPI object.
 * @param {Object} after Variant KPI object.
 * @param {Object} [opts]
 * @param {string} [opts.beforeLabel='BEFORE']
 * @param {string} [opts.afterLabel='AFTER']
 * @param {number} [opts.initialSplit=50] Initial split percentage [0..100].
 * @returns {{container:HTMLElement, setSplit:(pct:number)=>void}}
 */
export function renderBeforeAfter(containerId, before, after, opts = {}) {
  const host = ensureContainer(containerId);
  destroyCharts(host);
  host.innerHTML = '';

  const beforeLabel = opts.beforeLabel ?? 'BEFORE';
  const afterLabel = opts.afterLabel ?? 'AFTER';

  const stage = document.createElement('div');
  stage.style.cssText =
    'position:relative;height:300px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;';

  const panelFor = (kpis, tint, tag) => {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;inset:0;padding:16px;display:grid;' +
      'grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;align-content:start;';

    const badge = document.createElement('div');
    badge.style.cssText = `position:absolute;top:10px;left:12px;z-index:2;background:${tint};color:#fff;` +
      'font-size:10px;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:999px;';
    badge.textContent = tag;
    panel.appendChild(badge);

    const TILES = [
      ['Avg speed', kpis?.avgSpeed, ' km/h', 1],
      ['Flow', kpis?.flow, ' veh/h', 0],
      ['Density', kpis?.density, ' veh/km', 1],
      ['Delay', kpis?.avgDelayPerKm, ' s/km', 1],
      ['Vehicles', kpis?.vehicleCount, '', 0],
      ['LOS', kpis?.los, '', 0],
    ];
    for (const [label, value, unit, dec] of TILES) {
      const tile = document.createElement('div');
      tile.style.cssText = 'margin-top:28px;background:#f8fafc;border:1px solid #e2e8f0;' +
        'border-radius:8px;padding:8px 10px;';
      tile.innerHTML =
        `<div style="font-size:10px;color:#64748b;text-transform:uppercase;">${label}</div>` +
        `<div style="font-size:17px;font-weight:700;color:#0f172a;">${
          typeof value === 'number' ? fmt(value, dec) : escapeHtml(String(value ?? '—'))
        }<span style="font-size:11px;color:#64748b;">${unit}</span></div>`;
      panel.appendChild(tile);
    }
    return panel;
  };

  const beforePanel = panelFor(before, '#6366f1', beforeLabel);
  const afterPanel = panelFor(after, '#f59e0b', afterLabel);

  const applySplit = (pct) => {
    const p = Math.max(0, Math.min(100, pct));
    afterPanel.style.clipPath = `inset(0 0 0 ${p}%)`;
    slider.value = String(p);
  };

  const sliderWrap = document.createElement('div');
  sliderWrap.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:8px;font-size:12px;color:#64748b;';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(opts.initialSplit ?? 50);
  slider.style.cssText = 'flex:1;accent-color:#f59e0b;cursor:ew-resize;';
  slider.setAttribute('aria-label', 'Reveal comparison slider');
  slider.addEventListener('input', () => {
    afterPanel.style.clipPath = `inset(0 0 0 ${slider.value}%)`;
  });
  const leftTag = document.createElement('span');
  leftTag.textContent = beforeLabel;
  const rightTag = document.createElement('span');
  rightTag.textContent = afterLabel;
  sliderWrap.append(leftTag, slider, rightTag);

  stage.append(beforePanel, afterPanel);
  host.append(stage, sliderWrap);
  applySplit(Number(opts.initialSplit ?? 50));

  return { container: host, setSplit: applySplit };
}

/** Escape a string for safe interpolation into innerHTML. @param {string} s @returns {string} */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
