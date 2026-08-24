/**
 * @file Scenario management panel: save / load / fork / delete scenarios via
 * {@link ScenarioManager}, browse saved versions with timestamps, and diff any
 * two scenarios side by side.
 *
 * @example
 * import { initScenarioPanel } from './sim-engine/integration/scenarioPanel.js';
 * const panel = initScenarioPanel('scenario-panel', bridge);
 * // later: panel.destroy();
 */

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

/** "2026-08-24T12:34:56.789Z" → "2026-08-24 12:34". */
export function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Build the scenario management panel inside `containerId`.
 *
 * @param {string} containerId Host element id (existing children replaced).
 * @param {import('./simBridge.js').SimBridge} simBridge Initialised bridge.
 * @param {Object} [opts]
 * @param {()=>void} [opts.onChange] Extra refresh hook (e.g. re-render lists elsewhere).
 * @returns {{refresh: Function, destroy: Function}} Handle.
 * @throws {Error} Missing container or bridge.
 */
export function initScenarioPanel(containerId, simBridge, opts = {}) {
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`initScenarioPanel: no element with id "${containerId}"`);
  if (!simBridge) throw new Error('initScenarioPanel: simBridge required');

  host.innerHTML = '';

  const nameInput = el('input', {
    type: 'text',
    placeholder: 'Scenario name…',
    class: 'flex-1 min-w-[120px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500',
  });

  const saveBtn = el('button', { class: BTN_PRIMARY }, 'Save');
  const forkBtn = el('button', { class: BTN_SECONDARY, title: 'Fork selected scenario' }, 'Fork');
  const loadBtn = el('button', { class: BTN_SECONDARY }, 'Load');
  const deleteBtn = el('button', { class: BTN_DANGER, title: 'Delete selected scenario' }, 'Delete');

  const listSelect = el('select', { size: '6', class: SELECT_CLS + ' h-32' });
  const diffA = el('select', { class: SELECT_CLS });
  const diffB = el('select', { class: SELECT_CLS });
  const compareBtn = el('button', { class: BTN_SECONDARY }, 'Compare A ↔ B');
  const diffOutput = el('div', { class: 'mt-2 text-xs overflow-x-auto' });
  const statusLine = el('div', { class: 'text-[11px] mt-1 min-h-[16px] text-slate-400' });

  const currentBadgeName = el('span', { class: 'font-semibold text-sky-300' }, simBridge.scenarioName ?? 'untitled');

  host.appendChild(el('div', { class: 'mb-2 flex items-center gap-2 flex-wrap' },
    el('i', { class: 'fas fa-folder-open text-sky-400' }),
    el('span', { class: 'text-sm font-bold text-slate-200' }, 'Current: '), currentBadgeName));

  host.appendChild(el('div', { class: 'flex gap-2 mb-3 flex-wrap' }, nameInput, saveBtn));

  host.appendChild(el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400 mb-1' }, 'Saved scenarios'));
  host.appendChild(listSelect);
  host.appendChild(el('div', { class: 'flex gap-2 mt-2 flex-wrap' }, loadBtn, forkBtn, deleteBtn));

  host.appendChild(el('div', { class: 'text-[10px] uppercase tracking-wide text-slate-400 mt-4 mb-1' }, 'Diff view'));
  host.appendChild(el('div', { class: 'grid grid-cols-2 gap-2 mb-2' }, diffA, diffB));
  host.appendChild(compareBtn);
  host.appendChild(diffOutput);
  host.appendChild(statusLine);

  function notify(text, isError = false) {
    statusLine.textContent = text ?? '';
    statusLine.className = `text-[11px] mt-1 min-h-[16px] ${isError ? 'text-red-400' : 'text-emerald-400'}`;
    if (text) setTimeout(() => { statusLine.textContent = ''; statusLine.className = 'text-[11px] mt-1 min-h-[16px] text-slate-400'; }, 4000);
  }

  function selectedId() {
    return listSelect.selectedOptions?.[0]?.getAttribute('data-id') ?? null;
  }

  function fillSelect(sel) {
    sel.innerHTML = '';
    for (const item of simBridge.listScenarios()) {
      const opt = el('option', { value: item.id },
        `${item.name} · v${item.version}${item.forkedFrom ? ' (fork)' : ''}`);
      opt.setAttribute('data-id', item.id);
      sel.appendChild(opt);
    }
  }

  function renderList() {
    listSelect.innerHTML = '';
    const items = simBridge.listScenarios();
    if (items.length === 0) {
      listSelect.appendChild(el('option', { disabled: 'true' }, 'No saved scenarios yet'));
    }
    for (const item of items) {
      const label = ` ${item.edges}e/${item.nodes}n`;
      const opt = el('option', { value: item.id }, `${item.name} · v${item.version}${item.forkedFrom ? ' ⑂' : ''} · ${formatTimestamp(item.updatedAt)}${label}`);
      opt.setAttribute('data-id', item.id);
      opt.setAttribute('title', `id: ${item.id}\nforked from: ${item.forkedFrom ?? '—'}`);
      listSelect.appendChild(opt);
    }
    fillSelect(diffA);
    fillSelect(diffB);
    if (diffB.options.length > 1) diffB.selectedIndex = 1;
  }

  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || `Scenario ${new Date().toLocaleString()}`;
    try {
      const record = simBridge.saveScenario(name);
      simBridge.scenarioName = record.name;
      currentBadgeName.textContent = record.name;
      nameInput.value = '';
      renderList();
      opts.onChange?.();
      notify(`Saved "${record.name}" (${record.id})`);
    } catch (err) {
      notify(String(err.message ?? err), true);
    }
  });

  loadBtn.addEventListener('click', async () => {
    const id = selectedId();
    if (!id) return notify('Select a scenario first', true);
    try {
      const record = await simBridge.loadScenario(id);
      simBridge.scenarioName = record.name;
      currentBadgeName.textContent = record.name;
      opts.onChange?.();
      notify(`Loaded "${record.name}"`);
    } catch (err) {
      notify(String(err.message ?? err), true);
    }
  });

  forkBtn.addEventListener('click', () => {
    const id = selectedId();
    if (!id) return notify('Select a scenario to fork', true);
    try {
      const fork = simBridge.forkScenario(id);
      renderList();
      opts.onChange?.();
      notify(`Forked as "${fork.name}" (${fork.id})`);
    } catch (err) {
      notify(String(err.message ?? err), true);
    }
  });

  deleteBtn.addEventListener('click', () => {
    const id = selectedId();
    if (!id) return notify('Select a scenario to delete', true);
    simBridge.deleteScenario(id);
    renderList();
    diffOutput.innerHTML = '';
    opts.onChange?.();
    notify('Deleted');
  });

  compareBtn.addEventListener('click', () => {
    const aId = diffA.selectedOptions?.[0]?.getAttribute('data-id');
    const bId = diffB.selectedOptions?.[0]?.getAttribute('data-id');
    if (!aId || !bId) return notify('Pick two scenarios to compare', true);
    try {
      const d = simBridge.diffScenarios(aId, bId);
      diffOutput.innerHTML = '';
      diffOutput.appendChild(renderDiffTable(d, aId, bId));
    } catch (err) {
      notify(String(err.message ?? err), true);
    }
  });

  function renderDiffTable(d, aId, bId) {
    const table = el('table', { class: 'w-full text-left border-collapse' });
    table.appendChild(el('thead', {},
      el('tr', { class: 'text-slate-400 border-b border-slate-700' },
        el('th', { class: 'py-1 pr-2' }, 'key'),
        el('th', { class: 'py-1 pr-2' }, aId.slice(0, 18)),
        el('th', { class: 'py-1 pr-2' }, bId.slice(0, 18)))));
    const tbody = el('tbody');
    const rows = [];
    for (const [k, [va, vb]] of Object.entries(d.changed)) {
      rows.push([k, JSON.stringify(va), JSON.stringify(vb), 'changed']);
    }
    for (const [k, v] of Object.entries(d.added)) rows.push([k, '∅', JSON.stringify(v), 'added']);
    for (const [k, v] of Object.entries(d.removed)) rows.push([k, JSON.stringify(v), '∅', 'removed']);
    if (rows.length === 0) {
      tbody.appendChild(el('tr', {},
        el('td', { colspan: '4', class: 'py-2 text-emerald-400' }, 'Scenarios are identical ✓')));
    }
    for (const [k, va, vb, kind] of rows) {
      const color = kind === 'removed' ? 'text-red-400' : kind === 'added' ? 'text-emerald-400' : 'text-amber-300';
      tbody.appendChild(el('tr', { class: 'border-b border-slate-800/60 align-top' },
        el('td', { class: `py-1 pr-2 font-mono ${color}` }, k),
        el('td', { class: 'py-1 pr-2 font-mono text-slate-300 max-w-[140px] break-all' }, va),
        el('td', { class: 'py-1 pr-2 font-mono text-slate-300 max-w-[140px] break-all' }, vb)));
    }
    table.appendChild(tbody);
    return table;
  }

  renderList();

  return {
    refresh: renderList,
    destroy() { host.innerHTML = ''; },
  };
}

const BTN_PRIMARY = 'px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold';
const BTN_SECONDARY = 'px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm';
const BTN_DANGER = 'px-3 py-1.5 rounded-lg bg-red-900/70 hover:bg-red-800 text-red-200 text-sm';
const SELECT_CLS = 'bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 w-full';

export default initScenarioPanel;
