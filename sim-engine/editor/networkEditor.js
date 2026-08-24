/**
 * @file Interactive road-network editor.
 *
 * Layered on top of any map provider exposing one of:
 *  - Google Maps (`google.maps.Map`) — polylines/circles/markers,
 *  - Leaflet (`L.map`)               — polylines/circles/markers,
 *  - `null`                          — headless model-only mode (geometry is
 *    tracked internally; nothing is drawn).
 *
 * DOM is only touched inside {@link NetworkEditor#init}; the constructor is
 * safe to call in non-browser environments (e.g. unit tests).
 *
 * @example
 * const editor = createNetworkEditor('editor-pane', map);
 * editor.init();
 * await editor.addRoad({lat:30.05,lat2...});
 */

import { Network, haversineM } from '../network/graph.js';
import { exportGeoJSON, exportOpenDRIVE, exportSUMO, importGeoJSON, parseOpenDRIVE, parseSUMONetwork } from '../io/networkIO.js';

const DEFAULT_ROAD_CONFIG = Object.freeze({
  name: '',
  lanes: 1,
  speedLimit: 13.9, // m/s
  bidirectional: true,
});

/** Toolbar tool identifiers. */
export const TOOLS = Object.freeze(['select', 'road', 'junction', 'signal', 'delete']);

/** Default signal plan used by the Signal tool. */
export const DEFAULT_SIGNAL_PLAN = () => ({
  id: 'plan',
  offset: 0,
  phases: [
    { name: 'NS green', green: 30, yellow: 3, red: 2 },
    { name: 'EW green', green: 25, yellow: 3, red: 2 },
  ],
});

/** Inline SVG traffic-light glyph (no external assets, no emoji). */
const SIGNAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24" viewBox="0 0 16 24">
<rect x="1" y="1" width="14" height="22" rx="3" fill="#111827" stroke="#e5e7eb"/>
<circle cx="8" cy="6" r="3" fill="#ef4444"/>
<circle cx="8" cy="12" r="3" fill="#f59e0b"/>
<circle cx="8" cy="18" r="3" fill="#22c55e"/>
</svg>`;
const SIGNAL_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(SIGNAL_SVG)}`;

/**
 * Visual styles per map adapter.
 */
const STYLE = {
  road: { strokeColor: '#38bdf8', strokeOpacity: 0.95, strokeWeight: 4 },
  roadSelected: { strokeColor: '#f59e0b', strokeOpacity: 1, strokeWeight: 6 },
  junction: { fillColor: '#fbbf24', fillOpacity: 0.9, strokeColor: '#92400e', strokeWeight: 2 },
  junctionSelected: { fillColor: '#f59e0b', fillOpacity: 1, strokeColor: '#fff7ed', strokeWeight: 3 },
};

let _seq = 0;

/**
 * The network editor controller.
 */
export class NetworkEditor {
  /**
   * @param {string|HTMLElement|null} containerId Container element (or its id).
   *   May be null for fully headless usage (programmatic API only).
   * @param {Object|null} [mapInstance] Google Maps or Leaflet map instance.
   */
  constructor(containerId, mapInstance = null) {
    /** @type {HTMLElement|null} resolved lazily in init() */
    this.container = null;
    this.containerId = containerId ?? null;
    this.map = mapInstance ?? null;
    this.adapter = this._detectAdapter();

    /** @type {Map<string,Object>} junction records */
    this._junctions = new Map();
    /** @type {Map<string,Object>} road records */
    this._roads = new Map();
    /** @type {Map<string,Object>} junctionId -> normalized signal plan */
    this._signals = new Map();

    /** Rendered layer handles keyed by element id. @type {Map<string,any[]>} */
    this._layers = new Map();
    /** Loose-endpoint dedup index: "lat,lng" -> generated node id. */
    this._pointNodeIndex = new Map();
    this._pointCounter = 0;
    /** Currently selected element id. */
    this.selectedId = null;
    /** Current toolbar tool. */
    this.tool = 'select';
    /** Pending first-click point while drawing a road. */
    this._pendingPoint = null;
    /** Max snap distance to junctions when connecting roads [m]. */
    this.snapDistanceM = 15;

    // Undo / redo (snapshot stack).
    /** @type {string[]} */ this._undoStack = [];
    /** @type {string[]} */ this._redoStack = [];
    this._maxHistory = 100;

    this.exportFormat = 'json';
    /** @type {Map<string,Function>} unsubscribe hooks */
    this._unbinders = new Map();

    this._listeners = new Map();
    _seq += 1;
  }

  // -------------------------------------------------------------- events --

  /**
   * Subscribe to an editor event
   * (`'element-added' | 'element-deleted' | 'element-selected' |
   *   'selection-cleared' | 'tool-changed' | 'network-changed' | 'error'`).
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
        console.error(`[networkEditor] listener error (${event}):`, err);
      }
    }
  }

  // ---------------------------------------------------------------- setup --

  /** @returns {'google'|'leaflet'|'none'} detected rendering adapter. */
  _detectAdapter() {
    if (typeof google !== 'undefined' && google?.maps?.Polyline && this.map
      && typeof this.map.addListener === 'function') return 'google';
    if (typeof L !== 'undefined' && this.map && typeof this.map.addLayer === 'function'
      && typeof this.map.on === 'function') return 'leaflet';
    return 'none';
  }

  /**
   * Build the toolbar + properties panel and bind map/keyboard interaction.
   * Safe to call once; subsequent calls are no-ops.
   * @returns {NetworkEditor} this
   */
  init() {
    if (this.container) return this;
    this.container = this._resolveContainer(this.containerId);
    this.adapter = this._detectAdapter();

    if (this.container) {
      this._buildUI(this.container);
      this._bindKeyboard();
    }
    this._bindMapClick();

    if (this.adapter === 'none' && (this._roads.size > 0 || this._junctions.size > 0)) {
      console.info('[networkEditor] no compatible map detected — running model-only');
    }
    this.setTool(this.tool);
    return this;
  }

  _resolveContainer(containerId) {
    if (!containerId) return null;
    if (typeof containerId === 'object' && containerId.appendChild) return containerId;
    if (typeof document === 'undefined') return null;
    return document.getElementById(containerId);
  }

  _buildUI(container) {
    container.classList?.add('sae-net-editor');
    const bar = document.createElement('div');
    bar.className = 'sae-net-editor-toolbar';
    bar.style.cssText = [
      'position:absolute', 'top:10px', 'left:10px', 'z-index:1000',
      'display:flex', 'gap:4px', 'flex-wrap:wrap',
      'background:#0f172ae6', 'border:1px solid #33415580', 'border-radius:8px',
      'padding:6px', 'font-family:system-ui,sans-serif', 'font-size:12px',
    ].join(';');

    const buttons = [
      ['select', 'Select', 'Pick and edit elements'],
      ['road', 'Road', 'Click twice to draw a road'],
      ['junction', 'Junction', 'Click to place an intersection'],
      ['signal', 'Signal', 'Click a junction to attach a signal'],
      ['delete', 'Delete', 'Click an element to remove it'],
      ['sep', '|', ''],
      ['undo', 'Undo', 'Ctrl+Z'],
      ['redo', 'Redo', 'Ctrl+Shift+Z'],
      ['sep', '|', ''],
      ['import', 'Import', 'Load network file'],
      ['export', 'Export', 'Download network'],
    ];

    this._buttons = {};
    for (const [tool, label, title] of buttons) {
      if (tool === 'sep') {
        const sep = document.createElement('span');
        sep.textContent = label;
        sep.style.color = '#475569';
        bar.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.title = title;
      btn.dataset.tool = tool;
      btn.style.cssText = [
        'background:#1e293b', 'color:#e2e8f0', 'border:1px solid #334155',
        'border-radius:6px', 'padding:4px 10px', 'cursor:pointer', 'min-width:32px',
      ].join(';');
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (tool === 'undo') this.undo();
        else if (tool === 'redo') this.redo();
        else if (tool === 'import') this._triggerImportDialog();
        else if (tool === 'export') this._downloadExport();
        else this.setTool(tool);
      });
      this._buttons[tool] = btn;
      bar.appendChild(btn);
    }

    this._status = document.createElement('div');
    this._status.className = 'sae-net-editor-status';
    this._status.setAttribute('role', 'status');
    this._status.style.cssText = 'position:absolute;top:52px;left:10px;z-index:1000;color:#cbd5e1;'
      + 'background:#0f172acc;border-radius:6px;padding:2px 8px;font:11px system-ui,sans-serif';

    this._panel = document.createElement('div');
    this._panel.className = 'sae-net-editor-properties';
    this._panel.setAttribute('aria-label', 'Element properties');
    this._panel.style.cssText = 'position:absolute;top:76px;left:10px;z-index:1000;width:220px;display:none;'
      + 'background:#0f172aee;color:#e2e8f0;border:1px solid #33415580;border-radius:8px;padding:10px;'
      + 'font:12px system-ui,sans-serif';

    // Hidden file input backing the Import button.
    this._fileInput = document.createElement('input');
    this._fileInput.type = 'file';
    this._fileInput.accept = '.json,.geojson,.xodr,.xml,.net.xml';
    this._fileInput.style.display = 'none';
    this._fileInput.addEventListener('change', async () => {
      const file = this._fileInput.files?.[0];
      if (file) {
        try {
          await this.import(file);
          this._setStatus(`Imported ${file.name}`);
        } catch (err) {
          this._emit('error', err);
          this._setStatus(`Import failed: ${err.message}`);
        }
      }
      this._fileInput.value = '';
    });

    container.style.position ||= 'relative';
    container.append(bar, this._status, this._panel, this._fileInput);
    this._setStatus('Ready — pick a tool');
  }

  _setStatus(text) {
    if (this._status) this._status.textContent = text;
  }

  _setActiveButton(tool) {
    if (!this._buttons) return;
    for (const [key, btn] of Object.entries(this._buttons)) {
      if (key === 'undo' || key === 'redo' || key === 'import' || key === 'export') continue;
      const active = key === tool;
      btn.style.background = active ? '#0284c7' : '#1e293b';
      btn.style.borderColor = active ? '#38bdf8' : '#334155';
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  _bindKeyboard() {
    const handler = (ev) => {
      const t = ev.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
        || t.isContentEditable);
      if (typing) return;

      const key = ev.key;
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && key.toLowerCase() === 'z') {
        ev.preventDefault();
        this.undo();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && key.toLowerCase() === 'z') {
        ev.preventDefault();
        this.redo();
      } else if (ev.ctrlKey || ev.metaKey) {
        /* let other shortcuts through */
      } else if (key === 'Delete' || key === 'Backspace') {
        if (this.selectedId) {
          ev.preventDefault();
          this.deleteElement(this.selectedId);
        }
      } else if (key === 'Escape') {
        this.cancelPending();
      }
    };
    document.addEventListener('keydown', handler);
    this._unbinders.set('keydown', () => document.removeEventListener('keydown', handler));
  }

  _bindMapClick() {
    if (!this.map) return;
    const onClick = (mapEvent) => {
      const ll = this._toLatLng(mapEvent);
      if (!ll) return;
      this._handleMapClick(ll);
    };

    if (this.adapter === 'google') {
      const listener = this.map.addListener('click', onClick);
      this._unbinders.set('map-click', () => google.maps.event.removeListener(listener));
    } else if (this.adapter === 'leaflet') {
      this.map.on('click', onClick);
      this._unbinders.set('map-click', () => this.map.off('click', onClick));
    }
  }

  /** Normalize a Google/Leaflet/map event into {lat,lng}. */
  _toLatLng(obj) {
    if (!obj) return null;
    if (typeof obj.lat === 'function' && typeof obj.lng === 'function') {
      return { lat: obj.lat(), lng: obj.lng() };
    }
    const src = obj.latlng ?? obj.latLng ?? obj.latlngObj ?? obj;
    if (src && Number.isFinite(src.lat) && Number.isFinite(src.lng)) {
      return { lat: src.lat, lng: src.lng };
    }
    if (src && typeof src.lat === 'function') return this._toLatLng(src);
    if (typeof obj.lat === 'number' && typeof obj.lng === 'number') return { lat: obj.lat, lng: obj.lng };
    return null;
  }

  // ------------------------------------------------------------ tools ------

  /**
   * Activate a toolbar tool.
   * @param {'select'|'road'|'junction'|'signal'|'delete'} tool
   * @returns {NetworkEditor} this
   */
  setTool(tool) {
    if (!TOOLS.includes(tool)) throw new TypeError(`setTool: unknown tool "${tool}"`);
    this.tool = tool;
    this.cancelPending();
    this._setActiveButton(tool);
    this._setStatus({
      select: 'Select: click an element to inspect it',
      road: 'Road: click to start, click again to finish',
      junction: 'Junction: click to place an intersection',
      signal: 'Signal: click a junction to attach a signal plan',
      delete: 'Delete: click an element to remove it',
    }[tool]);
    this._emit('tool-changed', tool);
    return this;
  }

  /** Cancel an in-progress drawing operation. */
  cancelPending() {
    if (this._pendingPoint) {
      this._removeLayers('__pending__');
      this._pendingPoint = null;
      this._setStatus(`${this.tool}: cancelled`);
    }
  }

  _handleMapClick(ll) {
    switch (this.tool) {
      case 'select': {
        const hit = this.hitTest(ll);
        if (hit) this.selectElement(hit);
        else this._clearSelection();
        break;
      }
      case 'road':
        if (!this._pendingPoint) {
          this._pendingPoint = ll;
          this._drawPendingMarker(ll);
          this._setStatus('Road: click the end point (Esc to cancel)');
        } else {
          const from = this._pendingPoint;
          this._pendingPoint = null;
          this._removeLayers('__pending__');
          this.addRoad(from, ll);
        }
        break;
      case 'junction':
        this.addJunction(ll);
        break;
      case 'signal': {
        const jct = this._nearestJunction(ll, 40);
        if (jct) this.addSignal(jct.id);
        else this._setStatus('Signal: no junction within 40 m');
        break;
      }
      case 'delete': {
        const hit = this.hitTest(ll);
        if (hit) this.deleteElement(hit);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Find the element closest to a point (within tolerance).
   * @param {{lat:number,lng:number}} ll
   * @param {number} [toleranceM=20]
   * @returns {string|null} Element id ('road-*' | 'jct-*').
   */
  hitTest(ll, toleranceM = 20) {
    let bestId = null;
    let bestDist = toleranceM;
    for (const jct of this._junctions.values()) {
      const d = haversineM(ll.lat, ll.lng, jct.lat, jct.lng);
      if (d < bestDist) {
        bestDist = d;
        bestId = jct.id;
      }
    }
    for (const road of this._roads.values()) {
      const pts = this._roadEndpoints(road);
      const d = Math.min(
        haversineM(ll.lat, ll.lng, pts.a.lat, pts.a.lng),
        haversineM(ll.lat, ll.lng, pts.b.lat, pts.b.lng),
        pointSegmentDistanceM(ll, pts.a, pts.b),
      );
      if (d < bestDist) {
        bestDist = d;
        bestId = road.id;
      }
    }
    return bestId;
  }

  // ------------------------------------------------------------- editing --

  /**
   * Add a road segment between two geographic points.
   *
   * Endpoints within {@link NetworkEditor#snapDistanceM} of an existing
   * junction snap to that junction instead of creating a loose endpoint.
   *
   * @param {{lat:number,lng:number}} fromLatLng Start point.
   * @param {{lat:number,lng:number}} toLatLng End point.
   * @param {Partial<typeof DEFAULT_ROAD_CONFIG>} [config]
   * @returns {{id:string}} The created road record.
   */
  addRoad(fromLatLng, toLatLng, config = {}) {
    const a = this._toLatLng(fromLatLng);
    const b = this._toLatLng(toLatLng);
    if (!a || !b) throw new TypeError('addRoad: valid {lat,lng} points required');

    this.pushHistory();
    const cfg = { ...DEFAULT_ROAD_CONFIG, ...config };
    const lengthM = haversineM(a.lat, a.lng, b.lat, b.lng);
    if (lengthM < 1) {
      this._undoStack.pop();
      throw new RangeError('addRoad: road must be longer than 1 m');
    }

    const road = {
      id: `road-${++_seq}`,
      a: this._resolveEndpoint(a),
      b: this._resolveEndpoint(b),
      config: cfg,
    };
    this._roads.set(road.id, road);
    this._drawRoad(road);
    this._emit('element-added', road);
    this._emit('network-changed', null);
    this._setStatus(`Added ${cfg.name || 'road'} (${Math.round(lengthM)} m)`);
    return { id: road.id };
  }

  /**
   * Add an intersection node.
   * @param {{lat:number,lng:number}} latlng
   * @param {{name?:string,type?:string}} [config]
   * @returns {{id:string}}
   */
  addJunction(latlng, config = {}) {
    const ll = this._toLatLng(latlng);
    if (!ll) throw new TypeError('addJunction: valid {lat,lng} required');
    this.pushHistory();
    const jct = {
      id: `jct-${++_seq}`,
      lat: ll.lat,
      lng: ll.lng,
      type: config.type ?? 'intersection',
      name: config.name ?? '',
    };
    this._junctions.set(jct.id, jct);
    this._drawJunction(jct);
    this._emit('element-added', jct);
    this._emit('network-changed', null);
    this._setStatus(`Added junction ${jct.id}`);
    return { id: jct.id };
  }

  /**
   * Attach (or replace) a signal plan at a junction.
   *
   * Accepts a {@link import('../signals/controller.js').SignalPlan} instance,
   * its plain config `{phases:[...]}`, or nothing for a sensible default.
   *
   * @param {string} junctionId
   * @param {Object|null} [signalPlan]
   * @returns {{id:string,junctionId:string}} Signal handle (id == junctionId).
   */
  addSignal(junctionId, signalPlan = null) {
    const jct = this._junctions.get(junctionId);
    if (!jct) throw new Error(`addSignal: unknown junction "${junctionId}"`);
    this.pushHistory();
    const plan = normalizeSignalPlan(signalPlan ?? DEFAULT_SIGNAL_PLAN());
    this._signals.set(junctionId, plan);
    this._drawSignal(jct);
    this._emit('element-added', { id: junctionId, kind: 'signal', junctionId });
    this._emit('network-changed', null);
    this._setStatus(`Signal attached at ${jct.name || junctionId}`);
    return { id: junctionId, junctionId };
  }

  /**
   * Update one editable attribute of a selected element.
   * @param {string} id @param {string} key @param {any} value
   * @returns {boolean} true when applied.
   */
  updateElementProperty(id, key, value) {
    if (!id) return false;
    if (id.startsWith('road-')) {
      const road = this._roads.get(id);
      if (!road) return false;
      this.pushHistory();
      if (key === 'lanes') road.config.lanes = Math.max(1, Number(value) || 1);
      else if (key === 'speedLimitKmh') road.config.speedLimit = Math.max(1, Number(value) / 3.6);
      else if (key === 'bidirectional') road.config.bidirectional = Boolean(value);
      else road.config[key] = value;
      this._redrawRoad(road);
      this._emit('network-changed', null);
      return true;
    }
    if (id.startsWith('jct-')) {
      const jct = this._junctions.get(id);
      if (!jct) return false;
      this.pushHistory();
      if (key === 'name') jct.name = String(value);
      else if (key === 'type') jct.type = String(value);
      else if (key === 'lat') jct.lat = Number(value);
      else if (key === 'lng') jct.lng = Number(value);
      this._redrawJunction(jct);
      this._emit('network-changed', null);
      return true;
    }
    if (this._signals.has(id) && key === 'offset') {
      const plan = this._signals.get(id);
      this.pushHistory();
      plan.offset = Math.max(0, Number(value) || 0);
      return true;
    }
    return false;
  }

  /**
   * Highlight an element and populate the properties panel.
   * @param {string} id
   * @returns {NetworkEditor} this
   */
  selectElement(id) {
    if (this.selectedId === id) return this;
    this._applySelectionStyle(this.selectedId, false);
    this.selectedId = id;
    const rec = id ? (this._roads.get(id) ?? this._junctions.get(id)) : null;
    if (!rec) {
      this._clearSelection();
      return this;
    }
    this._applySelectionStyle(id, true);
    this._showProperties(rec);
    this._emit('element-selected', rec);
    this._setStatus(`Selected ${id}`);
    return this;
  }

  _clearSelection() {
    if (this.selectedId) this._applySelectionStyle(this.selectedId, false);
    this.selectedId = null;
    if (this._panel) this._panel.style.display = 'none';
    this._emit('selection-cleared', null);
  }

  /**
   * Remove an element. Deleting a junction cascades to connected roads and its
   * signal (single undo step).
   * @param {string} id
   * @returns {boolean} true when something was removed.
   */
  deleteElement(id) {
    if (!id) return false;
    if (this._roads.has(id)) {
      this.pushHistory();
      this._removeLayers(id);
      this._roads.delete(id);
      this._afterDeletion(id);
      return true;
    }
    if (this._junctions.has(id)) {
      this.pushHistory();
      const connected = [...this._roads.values()]
        .filter((r) => r.a.junctionId === id || r.b.junctionId === id)
        .map((r) => r.id);
      this._removeLayers(id);
      this._junctions.delete(id);
      if (this._signals.has(id)) {
        this._signals.delete(id);
        this._removeLayers(`sig-${id}`);
      }
      for (const rid of connected) {
        this._removeLayers(rid);
        this._roads.delete(rid);
      }
      this._afterDeletion(id);
      return true;
    }
    return false;
  }

  _afterDeletion(id) {
    if (this.selectedId === id) this._clearSelection();
    this._emit('element-deleted', id);
    this._emit('network-changed', null);
    this._setStatus(`Deleted ${id}`);
  }

  // ------------------------------------------------------- undo / redo ----

  /** Snapshot the current model before a mutation. */
  pushHistory() {
    this._undoStack.push(JSON.stringify(this.serialize()));
    if (this._undoStack.length > this._maxHistory) this._undoStack.shift();
    this._redoStack.length = 0;
  }

  /** Restore the previous state. @returns {boolean} whether anything happened. */
  undo() {
    if (this._undoStack.length === 0) return false;
    this._redoStack.push(JSON.stringify(this.serialize()));
    const snapshot = this._undoStack.pop();
    this._restoreState(JSON.parse(snapshot));
    this._setStatus('Undone');
    return true;
  }

  /** Re-apply the last undone change. @returns {boolean} */
  redo() {
    if (this._redoStack.length === 0) return false;
    this._undoStack.push(JSON.stringify(this.serialize()));
    const snapshot = this._redoStack.pop();
    this._restoreState(JSON.parse(snapshot));
    this._setStatus('Redone');
    return true;
  }

  // ------------------------------------------------------------ geometry --

  /** Resolve a clicked point into a road-endpoint descriptor (snapping). */
  _resolveEndpoint(ll) {
    const jct = this._nearestJunction(ll, this.snapDistanceM);
    return jct ? { junctionId: jct.id } : { lat: ll.lat, lng: ll.lng };
  }

  _nearestJunction(ll, toleranceM) {
    let best = null;
    let bestD = toleranceM;
    for (const jct of this._junctions.values()) {
      const d = haversineM(ll.lat, ll.lng, jct.lat, jct.lng);
      if (d <= bestD) {
        bestD = d;
        best = jct;
      }
    }
    return best;
  }

  /** Concrete lat/lng of both ends of a road record. */
  _roadEndpoints(road) {
    const resolve = (end) => {
      if (end.junctionId) {
        const jct = this._junctions.get(end.junctionId);
        if (jct) return { lat: jct.lat, lng: jct.lng };
      }
      return { lat: end.lat, lng: end.lng };
    };
    return { a: resolve(road.a), b: resolve(road.b) };
  }

  // ------------------------------------------------------------- drawing --

  _drawPendingMarker(ll) {
    if (this.adapter === 'google') {
      const marker = new google.maps.Circle({
        map: this.map,
        center: ll,
        radius: 5,
        fillColor: '#f59e0b',
        fillOpacity: 1,
        strokeWeight: 0,
      });
      this._layers.set('__pending__', [marker]);
    } else if (this.adapter === 'leaflet') {
      const marker = L.circleMarker([ll.lat, ll.lng], { radius: 5, color: '#f59e0b', fillOpacity: 1 }).addTo(this.map);
      this._layers.set('__pending__', [marker]);
    }
  }

  _drawRoad(road) {
    const { a, b } = this._roadEndpoints(road);
    if (this.adapter === 'google') {
      const line = new google.maps.Polyline({
        map: this.map,
        path: [a, b],
        ...STYLE.road,
        clickable: true,
      });
      line.addListener('click', (ev) => {
        ev.stop?.();
        this._handleElementClick(road.id);
      });
      this._layers.set(road.id, [line]);
    } else if (this.adapter === 'leaflet') {
      const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: STYLE.road.strokeColor,
        opacity: STYLE.road.strokeOpacity,
        weight: STYLE.road.strokeWeight,
      }).addTo(this.map);
      line.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        this._handleElementClick(road.id);
      });
      this._layers.set(road.id, [line]);
    }
  }

  _redrawRoad(road) {
    this._removeLayers(road.id);
    this._drawRoad(road);
    if (this.selectedId === road.id) this._applySelectionStyle(road.id, true);
  }

  _drawJunction(jct) {
    if (this.adapter === 'google') {
      const circle = new google.maps.Circle({
        map: this.map,
        center: { lat: jct.lat, lng: jct.lng },
        radius: 8,
        ...STYLE.junction,
        clickable: true,
      });
      circle.addListener('click', (ev) => {
        ev.stop?.();
        this._handleElementClick(jct.id);
      });
      this._layers.set(jct.id, [circle]);
    } else if (this.adapter === 'leaflet') {
      const circle = L.circleMarker([jct.lat, jct.lng], {
        radius: 7,
        color: STYLE.junction.strokeColor,
        fillColor: STYLE.junction.fillColor,
        fillOpacity: STYLE.junction.fillOpacity,
        weight: 2,
      }).addTo(this.map);
      circle.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        this._handleElementClick(jct.id);
      });
      this._layers.set(jct.id, [circle]);
    }
  }

  _redrawJunction(jct) {
    this._removeLayers(jct.id);
    this._drawJunction(jct);
    if (this.selectedId === jct.id) this._applySelectionStyle(jct.id, true);
  }

  _drawSignal(jct) {
    const layerKey = `sig-${jct.id}`;
    this._removeLayers(layerKey);
    if (this.adapter === 'google') {
      const marker = new google.maps.Marker({
        map: this.map,
        position: { lat: jct.lat, lng: jct.lng },
        icon: { url: SIGNAL_ICON_URL, scaledSize: new google.maps.Size(16, 24) },
        title: `Signal at ${jct.name || jct.id}`,
        zIndex: 500,
        clickable: true,
      });
      marker.addListener('click', () => this.selectElement(jct.id));
      this._layers.set(layerKey, [marker]);
    } else if (this.adapter === 'leaflet') {
      const icon = L.divIcon({
        className: '',
        html: SIGNAL_SVG.replace('<svg ', '<svg style="width:16px;height:24px" '),
        iconSize: [16, 24],
        iconAnchor: [8, 12],
      });
      const marker = L.marker([jct.lat, jct.lng], { icon, interactive: true }).addTo(this.map);
      marker.on('click', () => this.selectElement(jct.id));
      this._layers.set(layerKey, [marker]);
    }
  }

  _handleElementClick(id) {
    switch (this.tool) {
      case 'select':
      case 'road':
        this.selectElement(id);
        break;
      case 'delete':
        this.deleteElement(id);
        break;
      case 'signal':
        if (id.startsWith('jct-')) this.addSignal(id);
        break;
      default:
        this.selectElement(id);
    }
  }

  _removeLayers(key) {
    const layers = this._layers.get(key);
    if (!layers) return;
    for (const layer of layers) {
      try {
        if (this.adapter === 'google') layer.setMap(null);
        else if (this.adapter === 'leaflet') this.map.removeLayer(layer);
      } catch (err) {
        console.warn('[networkEditor] layer removal failed:', err);
      }
    }
    this._layers.delete(key);
  }

  _applySelectionStyle(id, selected) {
    if (!id) return;
    const layers = this._layers.get(id.startsWith('jct-') ? id : id) ?? [];
    const style = id.startsWith('road-')
      ? (selected ? STYLE.roadSelected : STYLE.road)
      : (selected ? STYLE.junctionSelected : STYLE.junction);
    for (const layer of layers) {
      try {
        if (this.adapter === 'google' && typeof layer.setOptions === 'function') {
          layer.setOptions(style);
          if (selected) layer.set('zIndex', 900);
        } else if (this.adapter === 'leaflet' && typeof layer.setStyle === 'function') {
          layer.setStyle(selected
            ? { color: '#f59e0b', weight: 6, fillColor: '#f59e0b' }
            : { color: STYLE.road.strokeColor, weight: STYLE.road.strokeWeight, fillColor: STYLE.junction.fillColor });
        }
      } catch { /* markers ignore restyle */ }
    }
  }

  // ------------------------------------------------------ properties UI ---

  _showProperties(record) {
    if (!this._panel) return;
    const panel = this._panel;
    panel.innerHTML = '';
    panel.style.display = 'block';

    const title = document.createElement('h4');
    title.textContent = record.id.startsWith('road-') ? `Road ${record.id}` : `Junction ${record.id}`;
    title.style.margin = '0 0 8px';
    panel.appendChild(title);

    const fields = [];
    if (record.id.startsWith('road-')) {
      fields.push(['Name', 'name', record.config.name ?? '', 'text']);
      fields.push(['Lanes', 'lanes', record.config.lanes, 'number']);
      fields.push(['Speed limit (km/h)', 'speedLimitKmh', Math.round((record.config.speedLimit ?? 13.9) * 3.6), 'number']);
      fields.push(['Two-way', 'bidirectional', Boolean(record.config.bidirectional), 'checkbox']);
    } else {
      fields.push(['Name', 'name', record.name ?? '', 'text']);
      fields.push(['Latitude', 'lat', Number(record.lat.toFixed(7)), 'number']);
      fields.push(['Longitude', 'lng', Number(record.lng.toFixed(7)), 'number']);
    }

    for (const [label, key, value, type] of fields) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:4px 0;gap:8px';
      const span = document.createElement('span');
      span.textContent = label;
      const input = document.createElement('input');
      input.type = type;
      input.value = value;
      if (type === 'checkbox') input.checked = Boolean(value);
      input.style.cssText = 'width:110px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 4px';
      input.addEventListener('change', () => {
        const val = type === 'checkbox' ? input.checked : input.value;
        this.updateElementProperty(record.id, key, val);
      });
      row.append(span, input);
      panel.appendChild(row);
    }

    if (this._signals.has(record.id)) {
      const sigInfo = document.createElement('p');
      const plan = this._signals.get(record.id);
      const cycle = plan.phases.reduce((s, p) => s + p.green + p.yellow + p.red, 0);
      sigInfo.textContent = `Signal: ${plan.phases.length} phases, ${cycle}s cycle`;
      sigInfo.style.marginTop = '8px';
      panel.appendChild(sigInfo);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'margin-top:8px;background:#334155;color:#e2e8f0;border:0;border-radius:4px;padding:4px 10px;cursor:pointer';
    close.addEventListener('click', () => this._clearSelection());
    panel.appendChild(close);
  }

  // -------------------------------------------------------- persistence ---

  /** Serializable snapshot of the editor model. @returns {Object} */
  serialize() {
    return {
      version: 1,
      junctions: [...this._junctions.values()],
      roads: [...this._roads.values()].map((r) => ({ ...r })),
      signals: Object.fromEntries(this._signals),
    };
  }

  /** Rebuild the model + visuals from a snapshot. @private */
  _restoreState(state) {
    for (const key of [...this._layers.keys()]) this._removeLayers(key);
    this._junctions = new Map((state.junctions ?? []).map((j) => [j.id, { ...j }]));
    this._roads = new Map((state.roads ?? []).map((r) => [r.id, { ...r }]));
    this._signals = new Map(Object.entries(state.signals ?? {}));
    this._clearSelection();
    this._redrawAll();
    this._emit('network-changed', null);
  }

  _redrawAll() {
    for (const jct of this._junctions.values()) this._drawJunction(jct);
    for (const road of this._roads.values()) this._drawRoad(road);
    for (const junctionId of this._signals.keys()) {
      const jct = this._junctions.get(junctionId);
      if (jct) this._drawSignal(jct);
    }
  }

  /** Clear everything (no history entry). */
  clear() {
    for (const key of [...this._layers.keys()]) this._removeLayers(key);
    this._junctions.clear();
    this._roads.clear();
    this._signals.clear();
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._pointNodeIndex = new Map();
    this._pointCounter = 0;
    this._clearSelection();
    this._emit('network-changed', null);
  }

  /**
   * Build the simulation-ready {@link Network}.
   *
   * Loose road endpoints become auto-generated `pt-*` nodes. Signal plans are
   * attached to the returned network under the `signalPlans` property
   * (`Map<nodeId, plan>`), ready for `Simulator.loadSignals`.
   *
   * @returns {Network}
   */
  getNetwork() {
    const net = new Network('editor-network');
    /** @type {Map<string,{lat:number,lng:number}>} nodeId -> coords */
    const coords = new Map();

    const ensureNode = (end, fallback) => {
      if (end.junctionId && this._junctions.has(end.junctionId)) {
        const jct = this._junctions.get(end.junctionId);
        if (!net.nodes.has(jct.id)) {
          net.addNode(jct.id, jct.lat, jct.lng, jct.type ?? 'intersection');
          coords.set(jct.id, { lat: jct.lat, lng: jct.lng });
        }
        return jct.id;
      }
      // Snap loose points onto coincident junctions so connectivity holds.
      const snapped = this._nearestJunction(fallback, this.snapDistanceM);
      if (snapped) {
        if (!net.nodes.has(snapped.id)) {
          net.addNode(snapped.id, snapped.lat, snapped.lng, snapped.type ?? 'intersection');
          coords.set(snapped.id, { lat: snapped.lat, lng: snapped.lng });
        }
        return snapped.id;
      }
      const key = `${fallback.lat.toFixed(7)},${fallback.lng.toFixed(7)}`;
      let nodeId = this._pointNodeIndex?.get(key);
      if (!nodeId || !net.nodes.has(nodeId)) {
        nodeId = `pt-${(this._pointCounter = (this._pointCounter ?? 0) + 1)}`;
        net.addNode(nodeId, fallback.lat, fallback.lng, 'entry');
        (this._pointNodeIndex ??= new Map()).set(key, nodeId);
        coords.set(nodeId, fallback);
      }
      return nodeId;
    };

    for (const road of this._roads.values()) {
      const { a, b } = this._roadEndpoints(road);
      const fromId = ensureNode(road.a, a);
      const toId = ensureNode(road.b, b);
      if (fromId === toId) continue;
      const cfg = road.config ?? {};
      net.addEdge({
        id: road.id,
        from: fromId,
        to: toId,
        lanes: Math.max(1, Number(cfg.lanes) || 1),
        speedLimit: Number.isFinite(cfg.speedLimit) ? cfg.speedLimit : 13.9,
        length: Math.max(1, haversineM(a.lat, a.lng, b.lat, b.lng)),
        name: cfg.name ?? '',
        bidirectional: Boolean(cfg.bidirectional),
      });
    }

    net.signalPlans = new Map(this._signals);
    return net;
  }

  /**
   * Load an existing network into the editor (replaces current contents).
   * @param {Network|{nodes:Object[],edges:Object[],signalPlans?:Map|Object}} networkOrJson
   * @returns {NetworkEditor} this
   */
  loadNetwork(networkOrJson) {
    const data = networkOrJson instanceof Network
      ? networkOrJson.toJSON()
      : networkOrJson;
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      throw new TypeError('loadNetwork: expected Network or {nodes[],edges[]}');
    }

    this.clear();

    const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
    const junctionIds = new Set();

    for (const n of data.nodes) {
      if (Number.isFinite(n.lat) && Number.isFinite(n.lng)) {
        const isEndpointOnly = n.type === 'entry' || n.type === 'exit';
        const degree = data.edges.filter((e) => e.from === n.id || e.to === n.id).length;
        if (!isEndpointOnly || degree >= 2) {
          const jct = {
            id: `jct-${++_seq}`,
            lat: n.lat,
            lng: n.lng,
            type: n.type ?? 'intersection',
            name: '',
            sourceNodeId: n.id,
          };
          this._junctions.set(jct.id, jct);
          junctionIds.add(n.id);
        }
      }
    }

    // Map original node ids -> junction ids for reuse across roads.
    const origToJct = new Map();
    for (const jct of this._junctions.values()) origToJct.set(jct.sourceNodeId, jct.id);

    const seenPairs = new Set();
    for (const e of data.edges) {
      const pairKey = `${e.from}->${e.to}`;
      const revKey = `${e.to}->${e.from}`;
      const isReverse = seenPairs.has(revKey) && !seenPairs.has(pairKey);
      seenPairs.add(pairKey);

      const aNode = nodeById.get(e.from);
      const bNode = nodeById.get(e.to);
      const road = {
        id: isReverse ? `${e.id}-rev-${++_seq}` : `road-${++_seq}`,
        a: junctionIds.has(e.from) ? { junctionId: origToJct.get(e.from) } : { lat: aNode?.lat ?? 0, lng: aNode?.lng ?? 0 },
        b: junctionIds.has(e.to) ? { junctionId: origToJct.get(e.to) } : { lat: bNode?.lat ?? 0, lng: bNode?.lng ?? 0 },
        config: {
          name: e.name ?? '',
          lanes: typeof e.lanes === 'number' ? e.lanes : e.laneCount ?? 1,
          speedLimit: e.speedLimit ?? 13.9,
          bidirectional: isReverse ? false : data.edges.some((o) => o.from === e.to && o.to === e.from),
        },
      };
      this._roads.set(road.id, road);
    }

    const plans = data.signalPlans
      ?? (networkOrJson.signalPlans instanceof Map
        ? Object.fromEntries(networkOrJson.signalPlans)
        : undefined);
    if (plans) {
      for (const [origNodeId, plan] of Object.entries(plans)) {
        const jctId = origToJct.get(origNodeId);
        if (jctId) this._signals.set(jctId, normalizeSignalPlan(plan));
      }
    }

    this._redrawAll();
    this._emit('network-changed', null);
    return this;
  }

  /**
   * Export the edited network.
   * @param {'json'|'geojson'|'opendrive'|'sumo'} [format] Defaults to
   *   {@link NetworkEditor#exportFormat}.
   * @returns {string} Serialized document.
   */
  export(format = this.exportFormat) {
    const net = this.getNetwork();
    switch (String(format).toLowerCase()) {
      case 'geojson':
        return JSON.stringify(exportGeoJSON(net), null, 2);
      case 'opendrive':
      case 'xodr':
        return exportOpenDRIVE(net);
      case 'sumo':
        return exportSUMO(net);
      case 'json':
        return JSON.stringify(this.serialize(), null, 2);
      default:
        throw new Error(`export: unknown format "${format}"`);
    }
  }

  /**
   * Import a network document and replace the editor contents.
   *
   * @param {string|{text:Function}|File|Blob|Object} file File contents, a
   *   Blob/File (browser), or an already-parsed GeoJSON/JSON object.
   * @param {'json'|'geojson'|'opendrive'|'sumo'} [format] Detected when omitted.
   * @returns {Promise<Network>} The imported network.
   */
  async import(file, format) {
    let content = file;
    if (file && typeof file.text === 'function') content = await file.text();
    if (typeof content === 'string') {
      const fmt = (format ?? sniffFormatSafe(content)).toLowerCase();
      let net;
      if (fmt === 'geojson') net = importGeoJSON(content);
      else if (fmt === 'opendrive' || fmt === 'xodr') net = parseOpenDRIVE(content);
      else if (fmt === 'sumo') net = parseSUMONetwork(content);
      else net = Network.fromJSON(JSON.parse(content));
      this.loadNetwork(net);
      this._undoStack.length = 0;
      this._redoStack.length = 0;
      return net;
    }

    // Parsed input (JSON object or FeatureCollection).
    const obj = file;
    if (obj?.type === 'FeatureCollection') {
      const net = importGeoJSON(obj);
      this.loadNetwork(net);
      return net;
    }
    const net = obj instanceof Network ? obj : Network.fromJSON(obj);
    this.loadNetwork(net);
    return net;
  }

  /** All attached signal plans keyed by junction id. @returns {Object} */
  getSignalPlans() {
    return Object.fromEntries(this._signals);
  }

  /** Detach DOM listeners and remove UI. Keeps the model intact. */
  destroy() {
    for (const unbind of this._unbinders.values()) {
      try {
        unbind();
      } catch { /* noop */ }
    }
    this._unbinders.clear();
    if (this.container) {
      this.container.querySelectorAll('.sae-net-editor-toolbar,.sae-net-editor-status,.sae-net-editor-properties')
        ?.forEach?.((el) => el.remove());
      const fi = this.container.querySelector('input[type=file][accept]');
      if (fi) fi.remove();
    }
    this.container = null;
  }

  _triggerImportDialog() {
    this._fileInput?.click();
  }

  _downloadExport() {
    const formats = { json: '.json', geojson: '.geojson', opendrive: '.xodr', sumo: '.net.xml' };
    try {
      const blob = new Blob([this.export()], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `network${formats[this.exportFormat] ?? '.json'}`;
      a.click();
      URL.revokeObjectURL(a.href);
      this._setStatus(`Exported ${this.exportFormat}`);
    } catch (err) {
      this._emit('error', err);
    }
  }
}

/** Normalize any accepted signal-plan shape into plain phases. */
function normalizeSignalPlan(plan) {
  if (!plan) throw new TypeError('normalizeSignalPlan: plan required');
  const phasesRaw = Array.isArray(plan.phases) ? plan.phases
    : (typeof plan.phases === 'object' && plan.phases ? Object.values(plan.phases) : null);
  if (!phasesRaw || phasesRaw.length === 0) throw new TypeError('normalizeSignalPlan: phases[] required');
  const phases = phasesRaw.map((p) => ({
    name: p.name ?? p.id ?? 'phase',
    green: Number(p.green) || 0,
    yellow: Number(p.yellow ?? 3) || 0,
    red: Number(p.red ?? 0) || 0,
    ...(p.allowedMovements ? { allowedMovements: JSON.parse(JSON.stringify(p.allowedMovements)) } : {}),
  }));
  return { id: plan.id ?? 'plan', offset: Number(plan.offset) || 0, phases };
}

/** Distance from point p to segment ab [m] (local flat approximation). */
function pointSegmentDistanceM(p, a, b) {
  const scale = Math.cos((p.lat * Math.PI) / 180);
  const px = p.lng * scale;
  const py = p.lat;
  const ax = a.lng * Math.cos((a.lat * Math.PI) / 180);
  const ay = a.lat;
  const bx = b.lng * Math.cos((b.lat * Math.PI) / 180);
  const by = b.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineM(p.lat, p.lng, a.lat, a.lng);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return haversineM(py, px / scale, cy, cx / scale);
}

function sniffFormatSafe(content) {
  try {
    // Local import avoided at module top-level to keep the facade tidy.
    const head = content.slice(0, 2048).trim();
    if (/^[[{]/.test(head)) {
      const parsed = JSON.parse(content);
      return parsed?.type === 'FeatureCollection' ? 'geojson' : 'json';
    }
    if (/<OpenDRIVE/i.test(head)) return 'opendrive';
    if (/<net[\s>]/i.test(head)) return 'sumo';
    return 'json';
  } catch {
    return 'json';
  }
}

/**
 * Create and initialise a NetworkEditor in one call.
 * @param {string|HTMLElement} containerId @param {Object|null} [mapInstance]
 * @returns {NetworkEditor}
 */
export function createNetworkEditor(containerId, mapInstance = null) {
  const editor = new NetworkEditor(containerId, mapInstance);
  if (containerId) editor.init();
  return editor;
}

export default NetworkEditor;
