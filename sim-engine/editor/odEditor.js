/**
 * @file Origin–Destination matrix editor.
 *
 * Renders an interactive table (rows = origins, columns = destinations,
 * cells = demand [veh/h] with optional per-cell vehicle type) plus CSV
 * import/export and basic validation.
 *
 * DOM is only touched in render(); the constructor is headless-safe.
 *
 * @example
 * const od = new ODEditor('od-pane');
 * od.setNetwork(network);
 * od.load([{ from: 'A', to: 'C', flow: 600, type: 'sedan' }]);
 */

const DEFAULT_TYPE = 'sedan';
/** Vehicle types offered in per-cell dropdowns. */
export const VEHICLE_TYPES = Object.freeze([
  'sedan', 'bus', 'truck', 'motorcycle', 'tuktuk', 'bicycle', 'av',
]);

/**
 * Interactive OD-matrix editor.
 */
export class ODEditor {
  /**
   * @param {string|HTMLElement|null} containerId Container element or id.
   * @param {{types?:string[]}} [opts]
   */
  constructor(containerId, opts = {}) {
    this.containerId = containerId ?? null;
    /** @type {HTMLElement|null} resolved in init()/render() */
    this.container = null;

    /** Ordered origin node ids. @type {string[]} */
    this.origins = [];
    /** Ordered destination node ids. @type {string[]} */
    this.destinations = [];
    /** Cell storage: `${from}->${to}` -> {flow:number,type:string}. */
    this.cells = new Map();
    /** Node ids offered by the row/column dropdowns. @type {string[]} */
    this.availableNodes = [];

    this.types = opts.types ?? [...VEHICLE_TYPES];
    this._initialized = false;
    this._listeners = new Map();
  }

  // -------------------------------------------------------------- events --

  /**
   * Subscribe to editor events (`'change' | 'cell-changed' | 'row-added' |
   * 'column-added' | 'imported' | 'validation'`).
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
        console.error(`[odEditor] listener error (${event}):`, err);
      }
    }
  }

  // ---------------------------------------------------------------- setup --

  /**
   * Resolve the container and render. Safe to call repeatedly.
   * @returns {ODEditor} this
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

  /**
   * Provide the network whose nodes populate the origin/destination dropdowns.
   * @param {Object|{nodes:Object[]}} network Network instance or JSON.
   * @returns {ODEditor} this
   */
  setNetwork(network) {
    let nodes = null;
    if (network && typeof network.getAllNodes === 'function') nodes = network.getAllNodes();
    else if (network && Array.isArray(network.nodes)) nodes = network.nodes;
    else throw new TypeError('setNetwork: expected a Network or {nodes[]}');
    this.availableNodes = nodes.map((n) => n.id);
    this.render();
    return this;
  }

  // -------------------------------------------------------------- model ---

  _key(from, to) {
    return `${from}->${to}`;
  }

  /**
   * Load an OD matrix (replaces current contents).
   * @param {Array<{from:string,to:string,flow:number,type?:string}>} odMatrix
   * @returns {ODEditor} this
   */
  load(odMatrix) {
    if (!Array.isArray(odMatrix)) throw new TypeError('load: OD array required');
    this.origins = [];
    this.destinations = [];
    this.cells.clear();
    for (const entry of odMatrix) {
      if (!entry || !entry.from || !entry.to) continue;
      if (!this.origins.includes(entry.from)) this.origins.push(entry.from);
      if (!this.destinations.includes(entry.to)) this.destinations.push(entry.to);
      this.setDemand(entry.from, entry.to, entry.flow, entry.type);
    }
    this.render();
    this._emit('change', this.getMatrix());
    return this;
  }

  /**
   * Snapshot the edited matrix.
   * @returns {Array<{from:string,to:string,flow:number,type:string}>}
   */
  getMatrix() {
    const out = [];
    for (const from of this.origins) {
      for (const to of this.destinations) {
        const cell = this.cells.get(this._key(from, to));
        if (cell && cell.flow > 0) out.push({ from, to, flow: cell.flow, type: cell.type });
      }
    }
    return out;
  }

  /** Total demand across all non-zero cells [veh/h]. */
  totalDemand() {
    let sum = 0;
    for (const cell of this.cells.values()) sum += cell.flow || 0;
    return sum;
  }

  /**
   * Add an origin row.
   * @param {string} [nodeId] Node to use; auto-named when omitted.
   * @returns {{id:string}} The new origin id.
   */
  addRow(nodeId) {
    const id = nodeId ?? `origin-${this.origins.length + 1}`;
    if (!this.origins.includes(id)) this.origins.push(id);
    this.render();
    this._emit('row-added', id);
    return { id };
  }

  /**
   * Add a destination column.
   * @param {string} [nodeId]
   * @returns {{id:string}}
   */
  addColumn(nodeId) {
    const id = nodeId ?? `destination-${this.destinations.length + 1}`;
    if (!this.destinations.includes(id)) this.destinations.push(id);
    this.render();
    this._emit('column-added', id);
    return { id };
  }

  /**
   * Remove an origin row.
   * @param {number|string} indexOrId Row index or origin id.
   * @returns {boolean}
   */
  removeRow(indexOrId) {
    const idx = typeof indexOrId === 'number'
      ? indexOrId
      : this.origins.indexOf(indexOrId);
    if (idx < 0 || idx >= this.origins.length) return false;
    const [gone] = this.origins.splice(idx, 1);
    for (const to of this.destinations) this.cells.delete(this._key(gone, to));
    this.render();
    return true;
  }

  /**
   * Remove a destination column.
   * @param {number|string} indexOrId Column index or destination id.
   * @returns {boolean}
   */
  removeColumn(indexOrId) {
    const idx = typeof indexOrId === 'number'
      ? indexOrId
      : this.destinations.indexOf(indexOrId);
    if (idx < 0 || idx >= this.destinations.length) return false;
    const [gone] = this.destinations.splice(idx, 1);
    for (const from of this.origins) this.cells.delete(this._key(from, gone));
    this.render();
    return true;
  }

  /**
   * Update one cell.
   * @param {string} from Origin node id.
   * @param {string} to Destination node id.
   * @param {number} flow Demand [veh/h]; 0 clears the cell.
   * @param {string} [type='sedan']
   * @throws {TypeError} Non-numeric or negative flow.
   */
  setDemand(from, to, flow, type = DEFAULT_TYPE) {
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new TypeError('setDemand: from/to ids required');
    }
    const f = Number(flow);
    if (!Number.isFinite(f)) throw new TypeError(`setDemand: flow must be numeric, got "${flow}"`);
    if (f < 0) throw new RangeError('setDemand: flow must be >= 0');

    if (!this.origins.includes(from)) this.origins.push(from);
    if (!this.destinations.includes(to)) this.destinations.push(to);

    if (f === 0) this.cells.delete(this._key(from, to));
    else this.cells.set(this._key(from, to), { flow: Math.round(f * 100) / 100, type });

    if (this._initialized) {
      this._refreshSummary();
      this._updateCellInput(from, to);
    }
    this._emit('cell-changed', { from, to, flow: f, type });
  }

  /** Convenience read accessor. @param {string} from @param {string} to */
  getDemand(from, to) {
    const cell = this.cells.get(this._key(from, to));
    return cell ? { ...cell } : { flow: 0, type: DEFAULT_TYPE };
  }

  // ----------------------------------------------------------------- CSV --

  /**
   * Import an OD matrix from CSV. Two layouts are accepted:
   *
   * Long format:
   *   `from,to,flow,type`
   *   `A,C,600,sedan`
   *
   * Matrix format (first header cell empty):
   *   `,A,B,C`
   *   `A,0,100,50`
   *   `B,80,0,120`
   *
   * @param {string} csvString
   * @returns {ODEditor} this
   * @throws {TypeError} On malformed input.
   */
  importCSV(csvString) {
    if (typeof csvString !== 'string' || csvString.trim().length === 0) {
      throw new TypeError('importCSV: non-empty CSV string required');
    }
    const rows = parseCsvRows(csvString);
    if (rows.length === 0) throw new TypeError('importCSV: no data rows found');

    const header = rows[0].map((h) => h.trim().toLowerCase());
    if (header.includes('from') && header.includes('to')) {
      // ---- long format ----
      const iFrom = header.indexOf('from');
      const iTo = header.indexOf('to');
      const iFlow = header.indexOf('flow');
      const iType = header.indexOf('type');
      if (iFrom < 0 || iTo < 0 || iFlow < 0) throw new TypeError('importCSV: long format needs from,to,flow columns');
      const entries = [];
      for (let r = 1; r < rows.length; r++) {
        const cells = rows[r];
        if (!cells[iFrom]?.trim()) continue;
        entries.push({
          from: cells[iFrom].trim(),
          to: cells[iTo].trim(),
          flow: Number(String(cells[iFlow]).trim()),
          ...(iType >= 0 && cells[iType] ? { type: cells[iType].trim() } : {}),
        });
      }
      this.load(entries);
      this._emit('imported', { format: 'long', count: entries.length });
      return this;
    }

    // ---- matrix format ----
    const dests = rows[0].slice(1).map((d) => d.trim()).filter(Boolean);
    if (dests.length === 0) throw new TypeError('importCSV: matrix format needs labelled columns');
    const entries = [];
    for (let r = 1; r < rows.length; r++) {
      const label = rows[r][0]?.trim();
      if (!label) continue;
      for (let c = 1; c <= dests.length; c++) {
        const raw = String(rows[r][c] ?? '').trim();
        if (raw === '') continue;
        const flow = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(flow)) continue;
        entries.push({ from: label, to: dests[c - 1], flow });
      }
    }
    this.load(entries);
    this._emit('imported', { format: 'matrix', count: entries.length });
    return this;
  }

  /**
   * Export the current matrix as CSV (matrix layout).
   * @returns {string}
   */
  exportCSV() {
    const lines = [`,${this.destinations.join(',')}`];
    for (const from of this.origins) {
      const row = [from];
      for (const to of this.destinations) {
        const cell = this.cells.get(this._key(from, to));
        row.push(cell ? String(cell.flow) : '0');
      }
      lines.push(row.join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  /**
   * Validate all stored flows.
   *
   * Errors: negative or non-finite flows; unknown vehicle types.
   * Warnings: zero diagonal (same from/to) demands; very high cell flows
   * (> 3600 veh/h suggests a unit mistake).
   *
   * @returns {{valid:boolean, errors:string[], warnings:string[],
   *   totalDemand:number}}
   */
  validate() {
    const errors = [];
    const warnings = [];
    let total = 0;

    for (const [key, cell] of this.cells) {
      const [from, to] = key.split('->');
      if (!Number.isFinite(cell.flow) || cell.flow < 0) {
        errors.push(`${from} → ${to}: invalid flow ${cell.flow}`);
        continue;
      }
      total += cell.flow;
      if (!this.types.includes(cell.type)) warnings.push(`${from} → ${to}: unknown type "${cell.type}"`);
      if (from === to && cell.flow > 0) warnings.push(`${from} → ${to}: intra-zonal demand`);
      if (cell.flow > 3600) warnings.push(`${from} → ${to}: flow ${cell.flow} veh/h looks like a unit error`);
    }
    if (this.cells.size === 0) warnings.push('Matrix is empty');

    return { valid: errors.length === 0, errors, warnings, totalDemand: total };
  }

  // ------------------------------------------------------------- rendering -

  /** Full re-render of the table + controls. */
  render() {
    if (!this._initialized) this.init();
    const root = this.container;
    if (!root) return;

    root.classList?.add('sae-od-editor');
    root.innerHTML = '';
    root.style.cssText += ';font-family:system-ui,sans-serif;font-size:12px;color:#e2e8f0;'
      + 'background:#0f172a;border:1px solid #33415580;border-radius:8px;padding:10px;overflow:auto';

    // --- toolbar ---------------------------------------------------------
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center';

    const addOriginBtn = document.createElement('button');
    addOriginBtn.textContent = '+ Origin';
    addOriginBtn.style.cssText = this._btnCss('#0369a1');
    addOriginBtn.addEventListener('click', () => this.addRow(this._pickNode()));

    const addDestBtn = document.createElement('button');
    addDestBtn.textContent = '+ Destination';
    addDestBtn.style.cssText = this._btnCss('#0369a1');
    addDestBtn.addEventListener('click', () => this.addColumn(this._pickNode()));

    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import CSV';
    importBtn.style.cssText = this._btnCss('#334155');
    importBtn.addEventListener('click', () => this._toggleImportPane());

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export CSV';
    exportBtn.style.cssText = this._btnCss('#334155');
    exportBtn.addEventListener('click', () => {
      if (this._csvOut) this._csvOut.value = this.exportCSV();
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (f) await this.importCSV(await f.text());
      fileInput.value = '';
    });

    toolbar.append(addOriginBtn, addDestBtn, importBtn, exportBtn, fileInput);

    // --- hidden import pane ----------------------------------------------
    const pane = document.createElement('div');
    pane.id = 'sae-od-import-pane';
    pane.style.display = 'none';
    pane.style.marginBottom = '8px';
    const ta = document.createElement('textarea');
    ta.placeholder = 'from,to,flow,type\nA,C,600,sedan';
    ta.style.cssText = 'width:100%;min-height:70px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:6px;font:11px monospace';
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = `${this._btnCss('#059669')};margin-top:4px`;
    applyBtn.addEventListener('click', () => {
      try {
        this.importCSV(ta.value);
        this._setStatus('CSV imported');
      } catch (err) {
        this._setStatus(`Import error: ${err.message}`);
      }
    });
    pane.append(ta, applyBtn);

    // --- table ------------------------------------------------------------
    const table = document.createElement('table');
    table.className = 'sae-od-table';
    table.style.cssText = 'border-collapse:collapse;width:auto';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = 'Origin \\ Dest';
    corner.style.cssText = this._thCss();
    headRow.appendChild(corner);

    this.destinations.forEach((dest, colIdx) => {
      const th = document.createElement('th');
      th.style.cssText = this._thCss();

      if (this.availableNodes.length > 0) {
        const sel = document.createElement('select');
        sel.style.cssText = 'background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px';
        sel.dataset.columnSelect = String(colIdx);
        for (const nodeId of this._optionsFor(dest)) {
          const opt = document.createElement('option');
          opt.value = nodeId;
          opt.textContent = nodeId;
          opt.selected = nodeId === dest;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => this._renameDestination(colIdx, sel.value));
        th.appendChild(sel);
      } else {
        th.textContent = dest;
      }
      const x = document.createElement('span');
      x.textContent = ' ×';
      x.title = 'Remove column';
      x.style.cssText = 'cursor:pointer;color:#f87171';
      x.addEventListener('click', () => this.removeColumn(colIdx));
      th.appendChild(x);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    this.origins.forEach((origin, rowIdx) => {
      const tr = document.createElement('tr');
      tr.dataset.originRow = origin;

      const th = document.createElement('th');
      th.style.cssText = this._thCss();
      if (this.availableNodes.length > 0) {
        const sel = document.createElement('select');
        sel.style.cssText = 'background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px';
        sel.dataset.rowSelect = origin;
        for (const nodeId of this._optionsFor(origin)) {
          const opt = document.createElement('option');
          opt.value = nodeId;
          opt.textContent = nodeId;
          opt.selected = nodeId === origin;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => this._renameOrigin(rowIdx, sel.value));
        th.appendChild(sel);
      } else {
        th.textContent = origin;
      }
      const x = document.createElement('span');
      x.textContent = ' ×';
      x.title = 'Remove row';
      x.style.cssText = 'cursor:pointer;color:#f87171';
      x.addEventListener('click', () => this.removeRow(rowIdx));
      th.appendChild(x);
      tr.appendChild(th);

      for (const dest of this.destinations) {
        tr.appendChild(this._buildCell(origin, dest));
      }
      tbody.appendChild(tr);
    });

    table.append(thead, tbody);

    this._summaryEl = document.createElement('div');
    this._summaryEl.setAttribute('data-testid', 'od-summary');
    this._summaryEl.style.cssText = 'margin-top:8px;font-size:11px;color:#94a3b8';

    root.append(toolbar, pane, table, this._summaryEl);
    this._csvOut = ta;
    this._refreshSummary();
  }

  _thCss() {
    return 'border:1px solid #334155;padding:4px 8px;background:#1e293b;text-align:left;font-weight:600;position:relative';
  }

  _btnCss(bg) {
    return `background:${bg};color:#fff;border:0;border-radius:5px;padding:3px 9px;cursor:pointer;font-size:12px`;
  }

  _optionsFor(current) {
    const opts = this.availableNodes.filter((n) => !this.origins.includes(n) && !this.destinations.includes(n));
    return opts.includes(current) ? opts : [current, ...opts.filter((n) => n !== current)];
  }

  _buildCell(from, to) {
    const td = document.createElement('td');
    td.style.border = '1px solid #334155';
    td.style.padding = '2px';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:2px';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '10';
    const cell = this.cells.get(this._key(from, to));
    input.value = cell ? String(cell.flow) : '';
    input.placeholder = '0';
    input.title = `${from} → ${to}`;
    input.dataset.cellFrom = from;
    input.dataset.cellTo = to;
    input.style.cssText = 'width:74px;background:#0f172a;color:#e2e8f0;border:1px solid #1e293b;border-radius:4px;padding:2px 4px';
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      const flow = raw === '' ? 0 : Number(raw);
      try {
        this.setDemand(from, to, flow, this.getDemand(from, to).type);
      } catch (err) {
        this._setStatus(err.message);
        input.value = '';
      }
    });

    const typeSel = document.createElement('select');
    typeSel.title = 'Vehicle type';
    typeSel.style.cssText = 'background:#1e293b;color:#94a3b8;border:0;border-radius:4px;font-size:10px';
    for (const t of this.types) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t[0].toUpperCase();
      opt.selected = cell ? cell.type === t : t === DEFAULT_TYPE;
      typeSel.appendChild(opt);
    }
    typeSel.addEventListener('change', () => {
      this.setDemand(from, to, this.getDemand(from, to).flow, typeSel.value);
    });

    wrap.append(input, typeSel);
    td.appendChild(wrap);
    return td;
  }

  _updateCellInput(from, to) {
    const esc = (s) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(s)) : String(s));
    const input = this.container?.querySelector(`input[data-cell-from="${esc(from)}"][data-cell-to="${esc(to)}"]`);
    if (input) {
      const cell = this.cells.get(this._key(from, to));
      input.value = cell ? String(cell.flow) : '';
    }
  }

  _renameOrigin(rowIndex, newNodeId) {
    const old = this.origins[rowIndex];
    if (!old || old === newNodeId) return;
    const remapped = new Map();
    for (const [key, cell] of this.cells) {
      const [f, t] = key.split('->');
      remapped.set(this._key(f === old ? newNodeId : f, t), cell);
    }
    this.cells = remapped;
    this.origins[rowIndex] = newNodeId;
    this.render();
  }

  _renameDestination(colIndex, newNodeId) {
    const old = this.destinations[colIndex];
    if (!old || old === newNodeId) return;
    const remapped = new Map();
    for (const [key, cell] of this.cells) {
      const [f, t] = key.split('->');
      remapped.set(this._key(f, t === old ? newNodeId : t), cell);
    }
    this.cells = remapped;
    this.destinations[colIndex] = newNodeId;
    this.render();
  }

  _pickNode() {
    const used = new Set([...this.origins, ...this.destinations]);
    const free = this.availableNodes.find((n) => !used.has(n));
    return free ?? undefined;
  }

  _toggleImportPane() {
    const pane = this.container?.querySelector('#sae-od-import-pane');
    if (pane) pane.style.display = pane.style.display === 'none' ? 'block' : 'none';
  }

  _setStatus(text) {
    if (this._summaryEl) this._summaryEl.dataset.status = text;
  }

  _refreshSummary() {
    if (!this._summaryEl) return;
    const v = this.validate();
    this._summaryEl.textContent =
      `Total demand: ${v.totalDemand} veh/h · ${v.valid ? 'valid' : `invalid (${v.errors.length} errors)`}`
      + (v.warnings.length > 0 ? ` · ${v.warnings.length} warning(s)` : '');
  }

  /** Remove UI + listeners (model retained). */
  destroy() {
    if (this.container) this.container.innerHTML = '';
    this._listeners.clear();
    this._initialized = false;
  }
}

/**
 * Parse CSV text into rows of cells (handles quoted fields with commas,
 * CRLF line endings and stray blank lines).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

export default ODEditor;
