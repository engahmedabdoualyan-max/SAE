/**
 * @file Import / Export panel: load networks from OpenDRIVE (.xodr), SUMO
 * (.net.xml), GeoJSON or engine JSON, preview network statistics, apply them to
 * the simulation, and export the active network in every supported format.
 *
 * @example
 * import { initImportPanel } from './sim-engine/integration/importPanel.js';
 * const panel = initImportPanel('import-panel', bridge);
 * // later: panel.destroy();
 */

import { Network } from '../network/graph.js';
import { importNetwork, sniffFormat } from '../io/networkIO.js';

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

/** Human-readable file-format descriptors offered in the dropdown. */
export const FORMATS = Object.freeze([
  { value: 'auto', label: 'Auto-detect', accept: '.xodr,.xml,.geojson,.json' },
  { value: 'opendrive', label: 'OpenDRIVE (.xodr)', accept: '.xodr,.xml' },
  { value: 'sumo', label: 'SUMO (.net.xml)', accept: '.net.xml,.xml' },
  { value: 'geojson', label: 'GeoJSON', accept: '.geojson,.json' },
  { value: 'json', label: 'Engine JSON', accept: '.json' },
]);

/**
 * Build the import/export panel inside `containerId`.
 *
 * @param {string} containerId Host element id (children replaced).
 * @param {import('./simBridge.js').SimBridge} simBridge Initialised bridge.
 * @param {Object} [opts]
 * @param {(net:Network)=>void} [opts.onImported] Hook after a successful import/apply.
 * @returns {{importContent: Function, refreshStats: Function, destroy: Function}} Handle.
 * @throws {Error} Missing container or bridge.
 */
export function initImportPanel(containerId, simBridge, opts = {}) {
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`initImportPanel: no element with id "${containerId}"`);
  if (!simBridge) throw new Error('initImportPanel: simBridge required');

  host.innerHTML = '';

  const fmtSelect = el('select', { class: SELECT_CLS + ' mb-2' },
    ...FORMATS.map((f) => el('option', { value: f.value }, f.label)));

  const fileInput = el('input', { type: 'file', class: 'hidden' });
  const uploadBtn = el('button', { class: BTN_SECONDARY }, '📁 Choose file');
  const fileNameLabel = el('span', { class: 'text-xs text-slate-400 ml-2' }, 'no file selected');
  const importBtn = el('button', { class: BTN_PRIMARY + ' mt-2 w-full' }, '⬆ Import & Preview');
  const useBtn = el('button', { class: BTN_SUCCESS + ' mt-2 w-full hidden' }, '✓ Use in Simulation');

  const statsBox = el('div', { class: 'mt-3 hidden rounded-lg border border-slate-700 bg-slate-900 p-3' });
  const errorBox = el('div', { class: 'mt-2 text-xs text-red-400 hidden min-h-[16px]' });

  const exportRow = el('div', { class: 'mt-4' },
    el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400 mb-1' }, 'Export current network'),
    el('div', { class: 'grid grid-cols-2 gap-2' },
      el('button', { class: BTN_GHOST, onClick: () => download('json') }, 'JSON'),
      el('button', { class: BTN_GHOST, onClick: () => download('opendrive') }, 'OpenDRIVE'),
      el('button', { class: BTN_GHOST, onClick: () => download('sumo') }, 'SUMO'),
      el('button', { class: BTN_GHOST, onClick: () => download('geojson') }, 'GeoJSON'),
      el('button', { class: BTN_GHOST + ' col-span-2', onClick: () => download('vissim') }, 'VISSIM (.inpx)')));

  host.appendChild(el('div', { class: 'mb-2 flex items-center gap-2' },
    el('i', { class: 'fas fa-exchange-alt text-purple-400' }),
    el('span', { class: 'text-sm font-bold text-slate-200' }, 'Network I/O')));
  host.appendChild(el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400 mb-1' }, 'Import format'));
  host.appendChild(fmtSelect);
  host.appendChild(el('div', { class: 'flex items-center mt-2 flex-wrap' }, uploadBtn, fileInput, fileNameLabel));
  host.appendChild(importBtn);
  host.appendChild(useBtn);
  host.appendChild(statsBox);
  host.appendChild(errorBox);
  host.appendChild(exportRow);

  let pendingNet = null;
  let pendingName = '';

  function syncAccept() {
    const fmt = FORMATS.find((f) => f.value === fmtSelect.value) ?? FORMATS[0];
    fileInput.setAttribute('accept', fmt.accept);
  }
  syncAccept();
  fmtSelect.addEventListener('change', syncAccept);

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) fileNameLabel.textContent = `${f.name} (${Math.round(f.size / 102.4) / 10} KB)`;
  });

  importBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) return showError('Choose a file first.');
    hideError();
    try {
      const content = await file.text();
      const format = fmtSelect.value === 'auto'
        ? sniffFormat(content)
        : fmtSelect.value;
      pendingNet = importNetwork(content, format);
      pendingName = file.name.replace(/\.[^.]+$/, '');
      renderStats(pendingNet);
      useBtn.classList.remove('hidden');
    } catch (err) {
      console.error('[importPanel] import failed:', err);
      pendingNet = null;
      useBtn.classList.add('hidden');
      statsBox.classList.add('hidden');
      showError(String(err.message ?? err));
    }
  });

  useBtn.addEventListener('click', () => {
    if (!(pendingNet instanceof Network)) return;
    try {
      simBridge.setNetwork(pendingNet);
      simBridge.scenarioName = pendingName || 'imported-network';
      opts.onImported?.(pendingNet);
      showStatsNote(`"${simBridge.scenarioName}" is now the active simulation network.`);
    } catch (err) {
      showError(String(err.message ?? err));
    }
  });

  function showError(msg) {
    errorBox.textContent = msg ?? '';
    errorBox.classList.remove('hidden');
  }
  function hideError() {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }

  function renderStats(net) {
    const edges = net.getAllEdges();
    const lanes = edges.reduce((s, e) => s + e.laneCount, 0);
    const totalKm = net.totalLengthKm();
    const byType = {};
    for (const n of net.getAllNodes()) byType[n.type] = (byType[n.type] ?? 0) + 1;

    statsBox.classList.remove('hidden');
    statsBox.innerHTML = '';
    statsBox.appendChild(el('div', { class: 'text-xs font-bold text-emerald-300 mb-2' }, '✓ Import OK — network statistics'));
    const grid = el('div', { class: 'grid grid-cols-3 gap-2 text-center' });
    grid.appendChild(statCell(net.nodes.size, 'Nodes'));
    grid.appendChild(statCell(edges.length, 'Edges'));
    grid.appendChild(statCell(lanes, 'Lanes'));
    statsBox.appendChild(grid);
    statsBox.appendChild(el('div', { class: 'mt-2 text-[11px] text-slate-400' },
      `Total length ${totalKm.toFixed(2)} km · avg ${(edges.length > 0 ? totalKm * 1000 / edges.length : 0).toFixed(0)} m/edge`,
      el('br'), `Node types: ${Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(', ')}`));
  }

  function statCell(value, label) {
    return el('div', { class: 'bg-slate-800 rounded px-2 py-1.5 border border-slate-700' },
      el('div', { class: 'text-base font-bold font-mono text-sky-300' }, String(value)),
      el('div', { class: 'text-[9px] uppercase tracking-wide text-slate-500' }, label));
  }

  function showStatsNote(text) {
    statsBox.appendChild(el('div', { class: 'mt-1 text-[11px] text-emerald-400' }, text));
  }

  function download(format) {
    if (!simBridge.network) return showError('Nothing to export yet — build or import a network.');
    hideError();
    try {
      switch (format) {
        case 'json':
          simBridge.exportGeoJSON({ download: false }); // warm-up not needed; JSON below
          simBridge.exportSumo({ download: false });
          exportJsonDirect(simBridge.network);
          break;
        case 'opendrive':
          simBridge.exportOpenDRIVE();
          break;
        case 'sumo':
          simBridge.exportSumo();
          break;
        case 'geojson':
          simBridge.exportGeoJSON();
          break;
        case 'vissim':
          simBridge.exportVissim();
          break;
        default:
          throw new Error(`Unknown export format "${format}"`);
      }
    } catch (err) {
      showError(String(err.message ?? err));
    }
  }

  function exportJsonDirect(net) {
    const content = JSON.stringify(net.toJSON(), null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sae_network.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return {
    /** Programmatically import from raw text. @param {string} content @param {string} [format] */
    async importContent(content, format) {
      const fmt = format ?? sniffFormat(content);
      pendingNet = importNetwork(content, fmt);
      renderStats(pendingNet);
      useBtn.classList.remove('hidden');
      return pendingNet;
    },
    refreshStats() {
      if (simBridge.network) renderStats(simBridge.network);
    },
    destroy() { host.innerHTML = ''; },
  };
}

const BTN_PRIMARY = 'px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold';
const BTN_SECONDARY = 'px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm';
const BTN_SUCCESS = 'px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold';
const BTN_GHOST = 'px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium';
const SELECT_CLS = 'bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 w-full';

export default initImportPanel;
