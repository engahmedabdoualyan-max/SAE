/**
 * @file PDF report generation with jsPDF (loaded globally by the page) and a
 * BibTeX citation builder.
 *
 * Report sections, in order:
 *  1. Title page — scenario name, date, author, engine version
 *  2. Executive Summary — headline KPIs + calibration verdict
 *  3. Methodology — models used, parameters, reproducibility notes
 *  4. Network Map — schematic node/edge plot from network coordinates
 *  5. Results Table — headline KPIs + most congested edges
 *  6. KPI Charts — gauge bars + speed/time trace from history
 *  7. Calibration Report — best-fit IDM params, GEH/RMSE/R² per detector
 *  8. Conclusion — auto-generated findings & recommendations
 *
 * The bundled `jspdf-autotable` plugin is used for tables when present; a
 * built-in fallback renderer keeps the report working without it.
 *
 * @example
 * import { generateReport, generateBibTeX } from './sim-engine/dashboard/reportGenerator.js';
 * const { doc, fileName } = generateReport(scenario, net, results, calibration);
 */

/** Resolve the jsPDF constructor across UMD/global builds. @returns {any} @throws {Error} when absent */
function getJsPDF() {
  if (typeof window !== 'undefined' && window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (typeof jsPDF !== 'undefined') return jsPDF; // classic global build
  throw new Error(
    'generateReport: jsPDF is not loaded. Include https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js'
  );
}

const APP_NAME = 'SAE AutoSim Hub';
const ENGINE_VERSION = 'sim-engine 1.0.0';

// Page geometry (A4 portrait, points).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Brand palette. */
const C = Object.freeze({
  ink: '#0f172a',
  slate: '#475569',
  muted: '#94a3b8',
  line: '#cbd5e1',
  primary: '#0369a1',
  accent: '#f59e0b',
  good: '#16a34a',
  bad: '#dc2626',
});

/** Slugify for file names / BibTeX keys. @param {string} s @returns {string} */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'scenario';
}

/** Safe number formatting for report text. @param {number|undefined|null} v @param {number} [d=1] @returns {string} */
function fmt(v, d = 1) {
  return Number.isFinite(v) ? Number(v).toFixed(d) : 'n/a';
}

/** Normalise a Network instance or JSON payload to `{nodes[], edges[]}`. @returns {{nodes:any[], edges:any[]}|null} */
function normaliseNetwork(network) {
  if (!network) return null;
  if (typeof network.toJSON === 'function') {
    const j = network.toJSON();
    return {
      nodes: (j.nodes ?? []).map((n) => ({
        ...n,
        shape: network.getEdge?.(n.id)?.shape,
      })),
      edges: (j.edges ?? []).map((e) => ({
        ...e,
        shape: network.getEdge?.(e.id)?.shape,
      })),
    };
  }
  if (Array.isArray(network.nodes) && Array.isArray(network.edges)) {
    return { nodes: network.nodes, edges: network.edges };
  }
  return null;
}

/**
 * Generate the full PDF report.
 *
 * @param {Object} scenario Scenario record (see `scenario/manager.js`):
 *   `{ name?, description?, author?, config?, createdAt? }` — all optional but
 *   recommended.
 * @param {Network|{nodes:Object[],edges:Object[]}|null} network Network under study.
 * @param {Object} results Simulation results: any of
 *   `{ summary?, kpis?, history?, vehiclesSpawned? }`. `summary.lastKpis`,
 *   plain KPI fields on `results`, or `results.kpis` are all probed.
 * @param {Object|null} [calibration] Output of {@link calibrateNetwork}
 *   (`{ bestParams, metrics }`) — section skipped when null.
 * @param {Object} [opts]
 * @param {boolean} [opts.save=true] Trigger the browser download automatically.
 * @param {string} [opts.fileName] Override output file name.
 * @returns {{doc: any, fileName: string, pages: number}}
 * @throws {Error} When jsPDF is unavailable.
 */
export function generateReport(scenario = {}, network = null, results = {}, calibration = null, opts = {}) {
  const JsPDF = getJsPDF();
  const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  const scenarioName = scenario?.name ?? 'Untitled scenario';
  const kpis = results?.kpis ?? results?.summary?.lastKpis ?? results ?? {};
  const history = Array.isArray(results?.history) ? results.history : [];
  const netJson = normaliseNetwork(network);

  let y = 0;

  // ------------------------------------------------------------ helpers ----

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_H - MARGIN - 24) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const heading = (text, size = 15) => {
    ensureSpace(46);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(C.primary);
    doc.text(text, MARGIN, y);
    y += 6;
    doc.setDrawColor(C.line);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 14;
  };

  const para = (text, size = 10, color = C.slate) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      ensureSpace(size + 6);
      doc.text(line, MARGIN, y);
      y += size + 4;
    }
    y += 4;
  };

  const bullets = (items) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, CONTENT_W - 16);
      ensureSpace(lines.length * 13 + 6);
      doc.setTextColor(C.accent);
      doc.text('•', MARGIN + 2, y);
      doc.setTextColor(C.slate);
      lines.forEach((line, i) => {
        doc.text(line, MARGIN + 16, y + i * 13);
      });
      y += lines.length * 13 + 4;
    }
    y += 4;
  };

  /** Built-in table renderer (used when autotable is absent). Returns end Y. */
  const drawSimpleTable = (head, body, startY) => {
    const cols = head.length;
    const colW = CONTENT_W / cols;
    const lh = 11;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(MARGIN, startY, CONTENT_W, 18, 'F');
    doc.setTextColor(255, 255, 255);
    head.forEach((h, i) => doc.text(String(h), MARGIN + 4 + i * colW, startY + 12.5));
    let ty = startY + 18;

    doc.setFont('helvetica', 'normal');
    body.forEach((row, rIdx) => {
      const cellLines = row.map((cell) =>
        doc.splitTextToSize(String(cell ?? ''), colW - 8));
      const rowH = Math.max(lh, Math.max(...cellLines.map((l) => l.length)) * lh) + 4;
      if (ty + rowH > PAGE_H - MARGIN - 20) {
        doc.addPage();
        ty = MARGIN;
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(30, 41, 59);
        doc.rect(MARGIN, ty, CONTENT_W, 18, 'F');
        doc.setTextColor(255, 255, 255);
        head.forEach((h, i) => doc.text(String(h), MARGIN + 4 + i * colW, ty + 12.5));
        ty += 18;
        doc.setFont('helvetica', 'normal');
      }
      if (rIdx % 2 === 1) {
        doc.setFillColor(241, 245, 249);
        doc.rect(MARGIN, ty, CONTENT_W, rowH, 'F');
      }
      doc.setTextColor(51, 65, 85);
      cellLines.forEach((lines, cIdx) => {
        lines.forEach((line, li) => {
          doc.text(line, MARGIN + 4 + cIdx * colW, ty + 11 + li * lh);
        });
      });
      ty += rowH;
    });
    return ty;
  };

  const table = (head, body) => {
    ensureSpace(60);
    y += 4;
    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        head: [head],
        body,
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 85] },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 14;
    } else {
      y = drawSimpleTable(head, body, y) + 14;
    }
  };

  // ------------------------------------------------------ 1 · title page ---
  doc.setFillColor(240, 249, 255); // sky-50
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setDrawColor(C.primary);
  doc.setLineWidth(4);
  doc.line(0, 0, PAGE_W, 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(C.ink);
  doc.text(APP_NAME, MARGIN, 200);
  doc.setFontSize(15);
  doc.setTextColor(C.primary);
  doc.text(scenarioName, MARGIN, 232);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(C.slate);
  doc.text('Traffic Microsimulation Study Report', MARGIN, 258);
  doc.setFontSize(9.5);
  doc.text(`Generated ${new Date().toLocaleString()}`, MARGIN, 280);
  if (scenario?.author) doc.text(`Prepared by: ${scenario.author}`, MARGIN, 296);
  if (scenario?.description) {
    const desc = doc.splitTextToSize(scenario.description, CONTENT_W);
    doc.text(desc, MARGIN, 320);
  }
  doc.setTextColor(C.muted);
  doc.text(ENGINE_VERSION, MARGIN, PAGE_H - 60);

  doc.addPage();
  y = MARGIN;

  // --------------------------------------------- 2 · executive summary -----
  heading('1 · Executive Summary', 15);
  bullets([
    `Scenario: ${scenarioName}${scenario?.description ? ` — ${scenario.description}` : ''}`,
    `Network: ${netJson ? `${netJson.nodes.length} nodes, ${netJson.edges.length} directed edges` : 'not provided'}`,
    `Average network speed: ${fmt(kpis.avgSpeed)} km/h · Level of service ${kpis.los ?? 'n/a'}`,
    `Total flow ${fmt(kpis.flow, 0)} veh/h at V/C ${fmt(kpis.vcRatio, 2)} (worst edge V/C ${fmt(kpis.maxVC, 2)})`,
    `Average delay ${fmt(kpis.avgDelayPerKm)} s/km · max queue ${fmt(kpis.maxQueue, 0)} veh · ${fmt(kpis.vehicleCount, 0)} vehicles in network`,
    calibration
      ? `Calibration: mean GEH ${fmt(calibration.metrics?.summary?.meanGEH, 2)} → ${
          validateLite(calibration).passed ? 'PASSED' : 'NOT PASSED'} acceptance criteria`
      : 'Calibration: not performed for this run',
  ]);

  // ---------------------------------------------------- 3 · methodology ----
  heading('2 · Methodology', 15);
  para(
    'Vehicle dynamics follow the Intelligent Driver Model (IDM — Treiber, Hennecke & Helbing 2000) ' +
    'with MOBIL lane-changing decisions; traffic signals run fixed-time or actuated phase plans. ' +
    'The simulation advances in discrete time steps integrating position, speed and acceleration for ' +
    'every vehicle, including cross-edge car-following through junctions.'
  );
  const cfg = scenario?.config ?? {};
  const idm = calibration?.bestParams ?? cfg.idmOverrides ?? null;
  bullets([
    `Time step dt = ${fmt(Number(cfg.dt ?? 1), 2)} s · RNG seed = ${String(cfg.seed ?? 'random')} (Mulberry32, fully reproducible)`,
    `Run horizon: ${fmt(results?.summary?.time ?? cfg.duration ?? history.at(-1)?.t ?? 0, 0)} simulated seconds`,
    idm
      ? `IDM parameters: v₀=${fmt(idm.v0)} m/s · T=${fmt(idm.T, 2)} s · a=${fmt(idm.a, 2)} m/s² · b=${fmt(idm.b, 2)} m/s²`
      : 'IDM parameters: library defaults (v₀=33.3 m/s, T=1.5 s, a=1.4, b=2.0 m/s²)',
    'KPIs computed per collector cadence: space-mean speed, density (q=k·v), flow, V/C, queues, LOS grading.',
    calibration
      ? 'Fit quality measured with the GEH statistic (target < 5), RMSE and coefficient of determination R².'
      : 'Fit-quality statistics available via the calibration wizard (GEH < 5 criterion).',
  ]);

  // ------------------------------------------------------ 4 · network map --
  heading('3 · Network Map (schematic)', 15);
  if (netJson && netJson.nodes.some((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng))) {
    drawNetworkSchematic(doc, () => { ensureSpace(300); y += 4; return y; }, (ny) => { y = ny; }, netJson);
  } else {
    para('No georeferenced network was supplied — schematic map omitted.');
  }

  // --------------------------------------------------- 5 · results table ---
  heading('4 · Results', 15);
  table(
    ['Metric', 'Value'],
    [
      ['Average speed [km/h]', fmt(kpis.avgSpeed)],
      ['Level of service', String(kpis.los ?? 'n/a')],
      ['Flow [veh/h]', fmt(kpis.flow, 0)],
      ['Density [veh/km]', fmt(kpis.density)],
      ['V/C ratio (network)', fmt(kpis.vcRatio, 3)],
      ['V/C ratio (worst edge)', fmt(kpis.maxVC, 3)],
      ['Max queue [veh]', fmt(kpis.maxQueue, 0)],
      ['Avg delay [s/km]', fmt(kpis.avgDelayPerKm)],
      ['Active vehicles', fmt(kpis.vehicleCount, 0)],
      ...(results?.summary
        ? [
            ['Vehicles spawned', fmt(results.summary.spawned ?? results.summary.exited, 0)],
            ['Avg travel time (exited) [s]', fmt(results.summary.avgTravelTimeExited)],
          ]
        : []),
    ]
  );

  // Most congested edges (top 10 by V/C).
  const perEdge = kpis.perEdge ?? {};
  const congested = Object.entries(perEdge)
    .sort((a, b) => (b[1].vc ?? 0) - (a[1].vc ?? 0))
    .slice(0, 10);
  if (congested.length > 0) {
    para('Most congested edges (by V/C):', 10.5, C.ink);
    table(
      ['Edge', 'Speed [km/h]', 'Density [veh/km]', 'Flow [veh/h]', 'V/C', 'Queue'],
      congested.map(([id, e]) => [
        id, fmt(e.speed), fmt(e.density), fmt(e.flow, 0), fmt(e.vc, 3), fmt(e.queue, 0),
      ])
    );
  }

  // ----------------------------------------------------- 6 · kpi charts ----
  heading('5 · KPI Visualisations', 15);
  drawGaugeBars(doc, kpis, () => { ensureSpace(80); y += 6; const yy = y; y += 44; return yy; });
  if (history.length >= 2) {
    drawHistoryTrace(doc, history, () => { ensureSpace(230); y += 8; const yy = y; y += 210; return yy; });
  } else {
    para('History samples unavailable — speed/time trace omitted.');
  }

  // ------------------------------------------------ 7 · calibration --------
  heading('6 · Calibration Report', 15);
  if (calibration?.metrics) {
    const sum = calibration.metrics.summary ?? {};
    const verdict = validateLite(calibration);
    para(
      `Grid search over IDM parameters (v0, T, a, b) evaluated ${calibration.iterations ?? sum.iterations ?? '?'} combinations. ` +
      `Best fit achieved mean GEH ${fmt(sum.meanGEH, 2)}, RMSE ${fmt(sum.rmse, 1)} veh/h${
        sum.rSquared != null ? `, R² ${fmt(sum.rSquared, 3)}` : ''}.`,
      10
    );
    table(
      ['Parameter', 'Best value', 'Unit'],
      [
        ['v0 — desired speed', fmt(calibration.bestParams?.v0), 'm/s'],
        ['T — desired time headway', fmt(calibration.bestParams?.T, 2), 's'],
        ['a — maximum acceleration', fmt(calibration.bestParams?.a, 2), 'm/s²'],
        ['b — comfortable deceleration', fmt(calibration.bestParams?.b, 2), 'm/s²'],
      ]
    );
    const detRows = (calibration.metrics.perDetector ?? []).map((d) => [
      d.edgeId,
      fmt(d.observedFlow, 0),
      fmt(d.simulatedFlow, 0),
      d.geh == null ? 'n/a' : fmt(d.geh, 2),
      d.pctError == null ? 'n/a' : `${fmt(d.pctError)}%`,
      d.passes ? 'PASS' : 'FAIL',
    ]);
    if (detRows.length > 0) {
      table(['Detector (edge)', 'Observed [veh/h]', 'Simulated [veh/h]', 'GEH', 'Error %', 'GEH<5'], detRows);
    }
    para(verdict.passed
      ? 'Verdict: the calibrated model MEETS the standard acceptance criteria (mean GEH < 5, ≥85% of detectors GEH < 5).'
      : `Verdict: the calibrated model DOES NOT meet all acceptance criteria:\n${verdict.details.join('\n')}`,
      10, verdict.passed ? C.good : C.bad);
  } else {
    para('No calibration data supplied — section omitted.');
  }

  // ----------------------------------------------------- 8 · conclusion ----
  heading('7 · Conclusion', 15);
  const conclusions = [];
  conclusions.push(
    (Number(kpis.avgSpeed) > 25)
      ? 'The network operates with free-flow conditions on average during the analysed period.'
      : 'Average speeds indicate significant friction across the network during the analysed period.'
  );
  if (Number(kpis.maxVC) > 1) conclusions.push(`At least one edge exceeds capacity (max V/C ${fmt(kpis.maxVC, 2)}); consider adding lanes, signal retiming or demand management there.`);
  else if (Number(kpis.vcRatio) > 0.85) conclusions.push('The network as a whole approaches saturation (V/C > 0.85); monitor growth scenarios.');
  else conclusions.push('Residual capacity remains across the network (network V/C below 0.85).');
  if (calibration) conclusions.push(validateLite(calibration).passed
    ? 'Model validity is supported by detector-level GEH agreement, so the outputs may be used for operational decisions.'
    : 'Additional calibration effort (wider grid, refined demand matrices, more detectors) is advised before using outputs operationally.');
  conclusions.push('All results derive from a seeded, reproducible simulation and can be regenerated exactly from the stored scenario.');

  bullets(conclusions);
  para(`This report was generated automatically by ${APP_NAME} (${ENGINE_VERSION}).`, 9, C.muted);

  // ----------------------------------------------------------- footers -----
  const nPages = doc.getNumberOfPages();
  for (let p = 1; p <= nPages; p++) {
    doc.setPage(p);
    if (p === 1) continue; // title page has its own footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(C.muted);
    doc.text(APP_NAME, MARGIN, PAGE_H - 28);
    doc.text(`Page ${p} of ${nPages}`, PAGE_W - MARGIN, PAGE_H - 28, { align: 'right' });
    doc.setDrawColor(C.line);
    doc.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = opts.fileName ?? `SAE-report-${slug(scenarioName)}-${stamp}.pdf`;
  if (opts.save !== false) doc.save(fileName);

  return { doc, fileName, pages: nPages };
}

// ---------------------------------------------------------------- helpers --

/** Lightweight pass/fail re-check for embedded use. @param {Object} calibration @returns {{passed:boolean}} */
function validateLite(calibration) {
  const sum = calibration?.metrics?.summary ?? {};
  const meanGEH = sum.meanGEH == null ? NaN : Number(sum.meanGEH);
  const shareRaw = sum.pctGEHunder5;
  const shareNum = shareRaw == null || shareRaw === '' ? NaN : Number(shareRaw);
  const share = Number.isFinite(shareNum) ? (shareNum > 1 ? shareNum / 100 : shareNum) : NaN;
  const passed =
    !(Number.isFinite(meanGEH) && meanGEH >= 5) &&
    !(Number.isFinite(share) && share < 0.85);
  return { passed };
}

/**
 * Draw a schematic map of nodes/edges into a 500×300 box.
 * @param {any} doc @param {()=>number} reserveY Allocates vertical room, returns top Y.
 * @param {(y:number)=>void} setY @param {{nodes:any[],edges:any[]}} netJson
 */
function drawNetworkSchematic(doc, reserveY, setY, netJson) {
  const topY = reserveY();
  const boxW = CONTENT_W;
  const boxH = 290;

  doc.setDrawColor(C.line);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN, topY, boxW, boxH, 6, 6, 'FD');

  const pts = netJson.nodes.filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng));
  if (pts.length === 0) { setY(topY + boxH + 12); return; }

  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const n of pts) {
    minX = Math.min(minX, n.lng); maxX = Math.max(maxX, n.lng);
    minY = Math.min(minY, n.lat); maxY = Math.max(maxY, n.lat);
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const pad = 22;
  const scale = Math.min((boxW - pad * 2) / spanX, (boxH - pad * 2) / spanY);
  const project = (lat, lng) => ({
    x: MARGIN + pad + (lng - minX) * scale + ((boxW - pad * 2) - spanX * scale) / 2,
    yy: topY + boxH - pad - (lat - minY) * scale - ((boxH - pad * 2) - spanY * scale) / 2,
  });

  const nodeById = new Map(netJson.nodes.map((n) => [n.id, n]));

  // Edges first (under the nodes).
  doc.setLineWidth(Math.max(0.6, Math.min(2.4, 1)));
  for (const e of netJson.edges) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b) continue;
    if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) continue;
    if ((a.lat === 0 && a.lng === 0) || (b.lat === 0 && b.lng === 0)) continue;

    const pa = project(a.lat, a.lng);
    const pb = project(b.lat, b.lng);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(Math.min(3, 0.8 + (e.lanes ?? 1) * 0.45));
    doc.line(pa.x, pa.yy, pb.x, pb.yy);
  }

  // Nodes.
  const NODE_FILL = { intersection: [37, 99, 235], entry: [22, 163, 74], exit: [234, 88, 12] };
  for (const n of pts) {
    const p = project(n.lat, n.lng);
    doc.setFillColor(...(NODE_FILL[n.type] ?? NODE_FILL.intersection));
    doc.circle(p.x, p.yy, n.type === 'intersection' ? 2.6 : 2, 'F');
  }

  // Tiny legend.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(C.muted);
  doc.text('● intersection    ● entry    ● exit', MARGIN + 8, topY + boxH - 8);

  setY(topY + boxH + 12);
}

/**
 * Horizontal utilisation/gauge bars for avg speed, V/C and LOS.
 * @param {any} doc @param {Object} kpis @param {()=>number} reserveY
 */
function drawGaugeBars(doc, kpis, reserveY) {
  const bars = [
    { label: `Average speed — ${fmt(kpis.avgSpeed)} km/h`, ratio: clamp01((kpis.avgSpeed ?? 0) / 120), color: C.primary },
    { label: `Network V/C — ${fmt(kpis.vcRatio, 2)}`, ratio: clamp01(kpis.vcRatio ?? 0), color: (kpis.vcRatio ?? 0) > 1 ? C.bad : C.accent },
    { label: `Worst-edge V/C — ${fmt(kpis.maxVC, 2)}`, ratio: clamp01(kpis.maxVC ?? 0), color: (kpis.maxVC ?? 0) > 1 ? C.bad : C.accent },
  ];
  for (const bar of bars) {
    const topY = reserveY();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(C.slate);
    doc.text(bar.label, MARGIN, topY + 9);
    // Track
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(MARGIN, topY + 15, CONTENT_W, 12, 6, 6, 'F');
    // Fill
    if (bar.ratio > 0.005) {
      doc.setFillColor(hexToRgb(bar.color));
      doc.roundedRect(MARGIN, topY + 15, Math.max(8, CONTENT_W * bar.ratio), 12, 6, 6, 'F');
    }
  }
}

/**
 * Speed-vs-time polyline chart drawn into a framed box with axes.
 * @param {any} doc @param {Array<{t:number,avgSpeed:number}>} history @param {()=>number} reserveY
 */
function drawHistoryTrace(doc, history, reserveY) {
  const topY = reserveY();
  const boxW = CONTENT_W;
  const boxH = 190;
  const axisL = 34;
  const axisB = 22;

  doc.setDrawColor(C.line);
  doc.setFillColor(255, 255, 255);
  doc.rect(MARGIN, topY, boxW, boxH, 'S');

  const maxT = Math.max(...history.map((h) => h.t), 1);
  const maxV = Math.max(...history.map((h) => h.avgSpeed), 10) * 1.1;

  const px = (t) => MARGIN + axisL + ((boxW - axisL - 10) * t) / maxT;
  const py = (v) => topY + boxH - axisB - ((boxH - axisB - 12) * v) / maxV;

  // Gridlines + ticks.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(C.muted);
  for (let g = 0; g <= 4; g++) {
    const vv = (maxV / 4) * g;
    doc.setDrawColor(241, 245, 249);
    doc.line(MARGIN + axisL, py(vv), MARGIN + boxW - 10, py(vv));
    doc.text(vv.toFixed(0), MARGIN + axisL - 6, py(vv) + 2, { align: 'right' });
  }
  for (let g = 0; g <= 4; g++) {
    const tt = (maxT / 4) * g;
    doc.text(`${Math.round(tt)}s`, px(tt), topY + boxH - 8, { align: 'center' });
  }

  // Trace (downsampled to ≤ 240 segments).
  const step = Math.max(1, Math.ceil(history.length / 240));
  doc.setDrawColor(hexToRgb(C.primary));
  doc.setLineWidth(1.4);
  let prev = null;
  for (let i = 0; i < history.length; i += step) {
    const h = history[i];
    if (!Number.isFinite(h.t) || !Number.isFinite(h.avgSpeed)) continue;
    if (prev) doc.line(px(prev.t), py(prev.avgSpeed), px(h.t), py(h.avgSpeed));
    prev = h;
  }

  doc.setTextColor(C.slate);
  doc.setFontSize(8);
  doc.text('Average network speed over time [km/h vs s]', MARGIN + axisL, topY + 12);
}

/** Clamp to [0,1]. @param {number} x @returns {number} */
function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }

/** '#rrggbb' → rgb triplet spread for jsPDF setters. @param {string} hex @returns {[number,number,number]} */
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [51, 65, 85];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

// ----------------------------------------------------------------- BibTeX --

/**
 * Build a BibTeX `@misc` entry citing a scenario/report.
 *
 * @param {Object} scenario Scenario record (`name`, `author`, `createdAt`,
 *   `version`, `id`, `url?`).
 * @returns {string} Formatted BibTeX block.
 *
 * @example
 * generateBibTeX({ name:'Ring Road PM Peak', author:'A. Ahmed', createdAt:'2026-08-24' });
 * // '@misc{ring-road-pm-peak2026, …}'
 */
export function generateBibTeX(scenario = {}) {
  const created = scenario.createdAt instanceof Date
    ? scenario.createdAt
    : new Date(scenario.createdAt ?? Date.now());
  const year = Number.isNaN(created.getTime()) ? new Date().getFullYear() : created.getFullYear();
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = monthNames[created.getMonth()] ?? 'jan';
  const title = scenario.name ?? 'Untitled scenario';

  const key = `${slug(title).replace(/-/g, '')}${year}`;
  const url = scenario.url ?? 'https://sae.fimtosoft.com';

  const fields = [
    `title       = {{{SAE AutoSim Hub: ${escapeBibTeX(title)}}}}`,
    scenario.author ? `author      = {${escapeBibTeX(scenario.author)}}` : `author      = {{SAE AutoSim Hub contributors}}`,
    `year        = {${year}}`,
    `month       = {${month}}`,
    `howpublished= {\\url{${url}}}`,
    `note        = {Traffic microsimulation scenario${scenario.version ? `, version ${scenario.version}` : ''}${
      scenario.id ? ` (id: ${scenario.id})` : ''}. Accessed ${new Date().toISOString().slice(0, 10)}}`,
  ].filter(Boolean);

  return [`@misc{${key},`, ...fields.map((f) => `  ${f}`), '}'].join('\n');
}

/** Escape BibTeX-special characters. @param {string} s @returns {string} */
function escapeBibTeX(s) {
  return String(s).replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
}
