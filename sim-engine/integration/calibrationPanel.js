/**
 * @file Calibration panel: upload field counts (CSV), run the IDM grid-search
 * calibration against the active network, and inspect GEH / RMSE / R² results
 * with pass-fail verdicts and before/after flow comparison bars.
 *
 * Acceptance criteria follow the classic traffic-engineering standard:
 * mean GEH < 5, ≥ 85 % of detectors with GEH < 5, R² ≥ 0.7.
 *
 * @example
 * import { initCalibrationPanel } from './sim-engine/integration/calibrationPanel.js';
 * const panel = initCalibrationPanel('calibration-panel', bridge);
 * // later: panel.destroy();
 */

import {
  calibrateNetwork,
  validateCalibration,
  GEH_PASS_THRESHOLD,
  R2_MIN,
} from '../calibration/wizard.js';

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

/** Parse CSV text into row objects using the header line. */
export function parseCsv(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitLine = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') { quoted = !quoted; continue; }
      if ((ch === ',' || ch === ';' || ch === '\t') && !quoted) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    /** @type {Record<string,string>} */
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

const EDGE_KEYS = ['edgeid', 'edge', 'linkid'];
const FLOW_KEYS = ['observedflow', 'observed', 'flow', 'count', 'observedcount'];

/** Convert CSV rows into wizard-compatible detector records. */
export function csvToFieldData(rows) {
  /** @type {{edgeId:string, observedFlow:number}[]} */
  const out = [];
  for (const row of rows) {
    const edgeKey = EDGE_KEYS.find((k) => k in row && row[k] !== '');
    const flowKey = FLOW_KEYS.find((k) => k in row && row[k] !== '');
    if (!edgeKey || !flowKey) continue;
    const flow = Number(row[flowKey]);
    if (!Number.isFinite(flow)) continue;
    out.push({ edgeId: row[edgeKey], observedFlow: flow });
  }
  return out;
}

/**
 * Build the calibration panel inside `containerId`.
 *
 * @param {string} containerId Host element id (children replaced).
 * @param {import('./simBridge.js').SimBridge} simBridge Initialised bridge
 *   with a network built (`buildNetworkFromCorridors` or an import).
 * @param {Object} [opts]
 * @param {Object<string,number[]>} [opts.grid] Grid axis overrides for calibrateNetwork().
 * @param {number} [opts.runSeconds=300] Simulated horizon per trial [s].
 * @param {(result:Object)=>void} [opts.onComplete] Hook after successful calibration.
 * @returns {{run: Function, destroy: Function, lastResult: () => Object|null}} Handle.
 * @throws {Error} Missing container or bridge.
 */
export function initCalibrationPanel(containerId, simBridge, opts = {}) {
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`initCalibrationPanel: no element with id "${containerId}"`);
  if (!simBridge) throw new Error('initCalibrationPanel: simBridge required');

  host.innerHTML = '';

  const fileInput = el('input', {
    type: 'file',
    accept: '.csv,text/csv',
    class: 'hidden',
  });
  const uploadBtn = el('button', { class: BTN_SECONDARY }, '📁 Upload field CSV');
  const runBtn = el('button', { class: BTN_PRIMARY }, '⚙ Run Calibration');
  const applyBtn = el('button', { class: BTN_SUCCESS + ' hidden' }, '✓ Apply to Engine');
  const fileLabel = el('span', { class: 'text-xs text-slate-400 ml-2' }, 'no file selected');

  const progressBarOuter = el('div', { class: 'w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mt-3 hidden' });
  const progressBarFill = el('div', { class: 'h-full bg-sky-500 rounded-full transition-all', style: { width: '0%' } });
  progressBarOuter.appendChild(progressBarFill);
  const progressText = el('div', { class: 'text-[11px] text-slate-400 mt-1 hidden' }, '');

  const summaryRow = el('div', { class: 'grid grid-cols-3 gap-2 mt-4' });
  const verdictBox = el('div', { class: 'mt-3 text-xs rounded-lg border border-slate-700 bg-slate-900 p-3 hidden' });
  const chartCanvas = /** @type {HTMLCanvasElement} */ (el('canvas', { width: '560', height: '220', class: 'mt-3 w-full hidden rounded-lg bg-slate-900 border border-slate-700' }));
  const detectorTable = el('div', { class: 'mt-3 overflow-x-auto hidden' });

  host.appendChild(el('div', { class: 'mb-2 flex items-center gap-2 flex-wrap' },
    el('i', { class: 'fas fa-bullseye text-amber-400' }),
    el('span', { class: 'text-sm font-bold text-slate-200' }, 'Model Calibration')));

  host.appendChild(el('p', { class: 'text-[11px] text-slate-400 mb-2' },
    `CSV columns: edgeId + observedFlow (veh/h). Criteria: mean GEH < ${GEH_PASS_THRESHOLD}, ≥85% detectors under ${GEH_PASS_THRESHOLD}, R² ≥ ${R2_MIN}.`));

  host.appendChild(el('div', { class: 'flex items-center gap-2 flex-wrap' }, uploadBtn, runBtn, applyBtn, fileLabel));
  host.appendChild(fileInput);
  host.appendChild(progressBarOuter);
  host.appendChild(progressText);
  host.appendChild(summaryRow);
  host.appendChild(verdictBox);
  host.appendChild(chartCanvas);
  host.appendChild(detectorTable);

  let fieldData = [];
  let fileName = '';
  let lastResult = null;

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileName = file.name;
    try {
      const text = await file.text();
      fieldData = csvToFieldData(parseCsv(text));
      fileLabel.textContent = `${fileName}: ${fieldData.length} detectors`;
      if (fieldData.length === 0) {
        setStatus('No usable rows found — need "edgeId" and "observedFlow" columns.', true);
      } else {
        setStatus(`${fieldData.length} detectors loaded from ${fileName}.`);
      }
    } catch (err) {
      setStatus(`Failed to read file: ${err.message ?? err}`, true);
    }
  });

  function setStatus(text, isError = false) {
    progressText.textContent = text ?? '';
    progressText.classList.remove('hidden');
    progressText.style.color = isError ? '#f87171' : '#94a3b8';
  }

  function setProgress(fraction, label) {
    progressBarOuter.classList.remove('hidden');
    progressBarFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    if (label != null) {
      progressText.classList.remove('hidden');
      progressText.textContent = label;
      progressText.style.color = '#94a3b8';
    }
  }

  runBtn.addEventListener('click', () => {
    if (!simBridge.network) {
      return setStatus('Build or import a network first.', true);
    }
    if (fieldData.length === 0) {
      return setStatus('Upload a field-data CSV first.', true);
    }
    setPlayingDisabled(true);
    setProgress(0.02, 'Starting grid search…');

    // Double-rAF lets the browser paint the running state before we block
    // the main thread inside the synchronous grid search.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const result = calibrateNetwork(
          fieldData,
          simBridge.network.toJSON(),
          { seed: simBridge.simConfig?.seed ?? 42 },
          {
            ...(opts.grid ? { grid: opts.grid } : {}),
            runSeconds: opts.runSeconds ?? 300,
            onProgress: ({ index, total }) =>
              setProgress((index + 1) / total, `Trial ${index + 1}/${total}`),
          },
        );
        lastResult = result;
        renderResults(result);
        opts.onComplete?.(result);
      } catch (err) {
        console.error('[calibrationPanel] failed:', err);
        setStatus(String(err.message ?? err), true);
        setProgress(0, 'Failed.');
      } finally {
        setPlayingDisabled(false);
      }
    }));
  });

  function setPlayingDisabled(disabled) {
    runBtn.disabled = disabled;
    runBtn.style.opacity = disabled ? '0.5' : '1';
  }

  applyBtn.addEventListener('click', () => {
    if (!lastResult) return;
    simBridge.applyCalibration(lastResult.bestParams);
    setStatus('Calibrated IDM parameters applied — press Play to rerun.');
  });

  // ------------------------------------------------------------- rendering --
  function metricCard(label, valueText, passed) {
    const color = passed === null ? '#94a3b8' : passed ? '#34d399' : '#f87171';
    return el('div', { class: 'bg-slate-800/80 rounded-lg px-3 py-2 border border-slate-700' },
      el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400' }, label),
      el('div', { class: 'flex items-baseline gap-1' },
        el('span', { class: 'text-xl font-bold font-mono', style: { color } }, valueText),
        passed === null ? el('span') : el('span', { class: 'text-[10px] font-bold uppercase', style: { color } }, passed ? 'PASS' : 'FAIL')));
  }

  function renderResults(result) {
    const sum = result.metrics.summary;
    const r2Available = sum.rSquared != null;

    summaryRow.innerHTML = '';
    summaryRow.appendChild(metricCard('Mean GEH', sum.meanGEH.toFixed(2), sum.meanGEH < GEH_PASS_THRESHOLD));
    summaryRow.appendChild(metricCard('RMSE', sum.rmse.toFixed(1),
      Number.isFinite(sum.rmse) ? sum.pctGEHunder5 >= 0.85 : null));
    summaryRow.appendChild(metricCard('R²', r2Available ? sum.rSquared.toFixed(3) : 'n/a',
      r2Available ? sum.rSquared >= R2_MIN : null));

    const verdict = validateCalibration(result.metrics);
    verdictBox.classList.remove('hidden');
    verdictBox.innerHTML = '';
    verdictBox.appendChild(el('div', { class: 'mb-1' },
      el('span', {
        class: `px-2 py-0.5 rounded text-[11px] font-bold ${verdict.passed ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`,
      }, verdict.passed ? 'CALIBRATION PASSED' : 'CALIBRATION FAILED'),
      el('span', { class: 'ml-2 text-slate-500' },
        `${sum.iterations} trials · seed ${sum.seedUsed} · ${sum.runSeconds}s horizon`)));
    for (const line of verdict.details) {
      const ok = line.startsWith('PASS');
      verdictBox.appendChild(el('div', { class: ok ? 'text-emerald-400' : line.startsWith('FAIL') ? 'text-red-400' : 'text-slate-500' }, line));
    }
    verdictBox.appendChild(el('div', { class: 'mt-2 font-mono text-[11px] text-sky-300' },
      `best params → v0=${fmt(result.bestParams.v0)} m/s · T=${fmt(result.bestParams.T)} s · a=${fmt(result.bestParams.a)} m/s² · b=${fmt(result.bestParams.b)} m/s²`));

    applyBtn.classList.remove('hidden');

    drawComparisonChart(result.metrics.perDetector);
    renderDetectorTable(result.metrics.perDetector);
    setProgress(1, `Done — best of ${sum.iterations} trials.`);
  }

  function fmt(v) {
    return Number.isFinite(v) ? Number(v).toFixed(2) : '?';
  }

  function drawComparisonChart(perDetector) {
    const W = 560;
    const H = 220;
    chartCanvas.classList.remove('hidden');
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, W, H);

    const padL = 44;
    const padB = 30;
    const padT = 14;
    const maxFlow = Math.max(...perDetector.map((d) => Math.max(d.observedFlow, d.simulatedFlow)), 1);
    const n = Math.max(perDetector.length, 1);
    const slotW = (W - padL - 10) / n;

    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - 8, H - padB);
    ctx.stroke();

    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    for (let i = 0; i <= 4; i++) {
      const v = (maxFlow * i) / 4;
      const y = H - padB - (i / 4) * (H - padB - padT);
      ctx.fillText(String(Math.round(v)), 6, y + 3);
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - 8, y); ctx.stroke();
    }

    perDetector.forEach((d, i) => {
      const x0 = padL + i * slotW;
      const barW = Math.min(18, slotW * 0.32);
      const hObs = ((H - padB - padT) * d.observedFlow) / maxFlow;
      const hSim = ((H - padB - padT) * d.simulatedFlow) / maxFlow;
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x0 + slotW * 0.15, H - padB - hObs, barW, hObs);
      ctx.fillStyle = d.passes ? '#38bdf8' : '#f87171';
      ctx.fillRect(x0 + slotW * 0.5, H - padB - hSim, barW, hSim);
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(d.edgeId.length > 10 ? `${d.edgeId.slice(0, 9)}…` : d.edgeId, x0 + slotW / 2, H - padB + 12);
      ctx.textAlign = 'left';
    });

    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(padL + 4, 4, 10, 10);
    ctx.fillStyle = '#64748b'; ctx.fillRect(padL + 90, 4, 10, 10);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('simulated (blue = GEH pass)', padL + 108, 13);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('observed', padL + 18, 13);
  }

  function renderDetectorTable(perDetector) {
    detectorTable.classList.remove('hidden');
    detectorTable.innerHTML = '';
    const table = el('table', { class: 'w-full text-left border-collapse text-xs' });
    table.appendChild(el('thead', {},
      el('tr', { class: 'text-slate-400 border-b border-slate-700' },
        el('th', { class: 'py-1 pr-3' }, 'Edge'),
        el('th', { class: 'py-1 pr-3' }, 'Observed'),
        el('th', { class: 'py-1 pr-3' }, 'Simulated'),
        el('th', { class: 'py-1 pr-3' }, 'Error %'),
        el('th', { class: 'py-1 pr-3' }, 'GEH'),
        el('th', { class: 'py-1' }, 'Status'))));
    const tbody = el('tbody');
    for (const d of perDetector) {
      tbody.appendChild(el('tr', { class: 'border-b border-slate-800/60 font-mono' },
        el('td', { class: 'py-1 pr-3' }, d.edgeId),
        el('td', { class: 'py-1 pr-3' }, String(d.observedFlow)),
        el('td', { class: 'py-1 pr-3' }, String(d.simulatedFlow)),
        el('td', { class: 'py-1 pr-3' }, d.pctError == null ? '—' : `${d.pctError.toFixed(1)}%`),
        el('td', { class: 'py-1 pr-3' }, d.geh == null ? '—' : d.geh.toFixed(2)),
        el('td', { class: `py-1 font-bold ${d.passes ? 'text-emerald-400' : 'text-red-400'}` }, d.passes ? '✓' : '✗')));
    }
    table.appendChild(tbody);
    detectorTable.appendChild(table);
  }

  return {
    run: () => runBtn.click(),
    lastResult: () => lastResult,
    destroy() { host.innerHTML = ''; },
  };
}

const BTN_PRIMARY = 'px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold';
const BTN_SECONDARY = 'px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm';
const BTN_SUCCESS = 'px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold';

export default initCalibrationPanel;
