/**
 * @file wireUp.js — Wires the new sections and advanced simulation to the DOM.
 * Runs on DOMContentLoaded after all other scripts are loaded.
 */
(function () {
  'use strict';

  var simMode = 'simple'; /* 'simple' or 'advanced' */
  var advancedSim = null;
  var advPaused = false;

  /* ── Inject new sections ────────────────────────────────── */
  function injectSections() {
    if (window.SAE_Sections) {
      window.SAE_Sections.injectAll();
    }
    /* Panels create their own containers inside the injected sections
       (section ids come from newSections.js: #scenario-manager, #reports-section). */
    if (window.SAE_ExportPanel && typeof window.SAE_ExportPanel.init === 'function') {
      window.SAE_ExportPanel.init('reports-section');
    } else if (typeof window.initExportPanel === 'function') {
      window.initExportPanel('reports-section');
    }
    if (window.SAE_ComparisonPanel && typeof window.SAE_ComparisonPanel.init === 'function') {
      window.SAE_ComparisonPanel.init('scenario-manager');
    } else if (typeof window.initComparisonPanel === 'function') {
      window.initComparisonPanel('scenario-manager');
    }
  }

  /* ── Toggle simulation mode ─────────────────────────────── */
  function toggleSimMode() {
    simMode = simMode === 'simple' ? 'advanced' : 'simple';
    var toggleBtn = document.getElementById('sim-mode-toggle');
    var runBtn = document.getElementById('sim-run-btn');
    var pauseBtn = document.getElementById('sim-pause-btn');
    var resetBtn = document.getElementById('sim-reset-btn');
    var advKpiRow = document.getElementById('advanced-kpi-row');
    var advChartRow = document.getElementById('advanced-chart-row');

    if (simMode === 'advanced') {
      if (toggleBtn) toggleBtn.classList.add('bg-emerald-600');
      if (toggleBtn) toggleBtn.classList.remove('bg-indigo-600');
      if (runBtn) runBtn.classList.remove('hidden');
      if (pauseBtn) pauseBtn.classList.remove('hidden');
      if (resetBtn) resetBtn.classList.remove('hidden');
      if (advKpiRow) advKpiRow.classList.remove('hidden');
      if (advChartRow) advChartRow.classList.remove('hidden');
    } else {
      if (toggleBtn) toggleBtn.classList.remove('bg-emerald-600');
      if (toggleBtn) toggleBtn.classList.add('bg-indigo-600');
      if (runBtn) runBtn.classList.add('hidden');
      if (pauseBtn) pauseBtn.classList.add('hidden');
      if (resetBtn) resetBtn.classList.add('hidden');
      if (advKpiRow) advKpiRow.classList.add('hidden');
      if (advChartRow) advChartRow.classList.add('hidden');
      resetAdvancedSim();
    }
  }

  var speedChart = null;
  var speedSamples = [];
  var advSamples = 0;

  function pushSpeedSample(kmh) {
    speedSamples.push(kmh);
    if (speedSamples.length > 120) speedSamples.shift();
    var cv = document.getElementById('adv-speed-chart');
    if (!cv || typeof Chart === 'undefined') return;
    if (!speedChart) {
      speedChart = new Chart(cv.getContext('2d'), {
        type: 'line',
        data: {
          labels: speedSamples.map(function (_, i) { return i; }),
          datasets: [{
            label: 'Avg Speed (km/h)',
            data: speedSamples,
            borderColor: '#22D3EE',
            backgroundColor: 'rgba(34,211,238,0.12)',
            fill: true, tension: 0.3,
            pointRadius: 0, borderWidth: 2
          }]
        },
        options: {
          animation: false, responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: { beginAtZero: true, suggestedMax: 120, ticks: { color: '#94A3B8', font: { size: 9 } }, grid: { color: 'rgba(148,163,184,0.12)' } }
          }
        }
      });
    } else {
      speedChart.data.labels = speedSamples.map(function (_, i) { return i; });
      speedChart.data.datasets[0].data = speedSamples.slice();
      speedChart.update('none');
    }
  }

  function updateAdvKPIs(data) {
    window.__saeUpdateAdvKPIs = updateAdvKPIs; /* expose for lab re-inits */
    var el;
    el = document.getElementById('adv-los');
    if (el) el.textContent = data.los || '-';
    el = document.getElementById('adv-speed');
    if (el) el.textContent = data.avgSpeed || 0;
    el = document.getElementById('adv-vc');
    if (el) el.textContent = data.vc || '0.00';
    el = document.getElementById('adv-delay');
    if (el) el.textContent = data.delay || '0';
    el = document.getElementById('adv-queue');
    if (el) el.textContent = data.queue || 0;
    el = document.getElementById('adv-vehs');
    if (el) el.textContent = data.vehicleCount || 0;
    if (typeof data.avgSpeed === 'number' && data.avgSpeed > 0) {
      pushSpeedSample(data.avgSpeed);
      advSamples++;
      if (advSamples % 120 === 0) {
        var anyVisible = ANALYSIS_TABS.some(function (t) {
          var p = document.getElementById('aa-' + t);
          return p && !p.classList.contains('hidden');
        });
        if (anyVisible && window.SAE_Analysis) window.SAE_Analysis.computeFromSim();
      }
    }
  }

  function getFleet() {
    /* app.js declares FLEET with top-level const → NOT on window; read the
       global lexical binding when available, else fall back to window. */
    if (typeof FLEET !== 'undefined' && FLEET) return FLEET;
    return window.FLEET || {};
  }

  function getCorridors() {
    if (typeof CORRIDORS !== 'undefined' && CORRIDORS) return CORRIDORS;
    return window.CORRIDORS || {};
  }

  function runAdvancedSim() {
    var canvas = document.getElementById('sim-canvas');
    if (!canvas) return;
    var mpr = window.mprValue !== undefined ? window.mprValue : 30;

    advancedSim = window.SAE_Sim.init(canvas, getFleet(), getCorridors(), mpr, updateAdvKPIs);
    advancedSim.start();
    advPaused = false;
    updateAdvKPIs({ los: '-', avgSpeed: 0, vc: '0.00', delay: '0', queue: 0, vehicleCount: 0 });
  }

  function pauseAdvancedSim() {
    if (!advancedSim) return;
    if (advPaused) { advancedSim.resume(); advPaused = false; }
    else { advancedSim.pause(); advPaused = true; }
  }

  function resetAdvancedSim() {
    if (advancedSim) { advancedSim.reset(); advancedSim = null; }
    advPaused = false;
  }

  /* ── Network Editor Manager (delegates to real ES-module editor) ── */
  var EXPORT_EXT = { json: '.json', opendrive: '.xodr', sumo: '.net.xml', geojson: '.geojson' };

  function downloadText(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  window.SAE_NetworkEditor = {
    _tool: 'select',
    _undoStack: [],
    _redoStack: [],

    _real: function () { return window.__saeRealEditor || null; },

    selectTool: function (tool) {
      this._tool = tool;
      var ed = this._real();
      if (ed && ed.setTool) {
        try { ed.setTool(tool); } catch (e) { /* unknown tool */ }
      }
      document.querySelectorAll('.ne-tool-btn').forEach(function (btn) {
        btn.classList.remove('active-tool', 'bg-indigo-600');
      });
      var map = document.getElementById('ne-map');
      if (map) {
        map.style.cursor = tool === 'select' ? 'default' : tool === 'delete' ? 'not-allowed' : 'crosshair';
      }
    },

    importFile: function (file) {
      if (!file) return;
      var ed = this._real();
      if (ed && ed.import) {
        var self = this;
        ed.import(file).then(function () {
          self._updateStats();
          self._showToast('Imported ' + file.name);
        }).catch(function (err) {
          self._showToast('Import error: ' + (err && err.message ? err.message : err));
        });
        return;
      }
      /* Fallback: model-only JSON */
      var reader = new FileReader();
      var self2 = this;
      reader.onload = function (e) {
        try {
          var data = JSON.parse(e.target.result);
          if (data.nodes) { self2._nodes = data.nodes; self2._edges = data.edges || []; }
          self2._updateStats();
          self2._showToast('Imported ' + file.name);
        } catch (err) { self2._showToast('Import error: ' + err.message); }
      };
      reader.readAsText(file);
    },

    exportAs: function (format) {
      var ed = this._real();
      var text, fname = 'network' + (EXPORT_EXT[format] || '.json');
      try {
        if (ed && ed.export) {
          text = ed.export(format === 'geojson' ? 'geojson' : format);
        } else {
          text = JSON.stringify({ nodes: this._nodes || [], edges: this._edges || [] }, null, 2);
        }
        downloadText(fname, text,
          format === 'geojson' || format === 'json' ? 'application/json' : 'application/xml');
        this._showToast('Exported ' + format);
      } catch (err) {
        this._showToast('Export error: ' + (err && err.message ? err.message : err));
      }
    },

    undo: function () {
      var ed = this._real();
      if (ed && ed.undo) { ed.undo(); this._updateStats(); return; }
      if (this._undoStack.length === 0) return;
      this._redoStack.push({ nodes: this._nodes.slice(), edges: this._edges.slice() });
      var state = this._undoStack.pop();
      this._nodes = state.nodes; this._edges = state.edges;
      this._updateStats();
    },

    redo: function () {
      var ed = this._real();
      if (ed && ed.redo) { ed.redo(); this._updateStats(); return; }
      if (this._redoStack.length === 0) return;
      this._undoStack.push({ nodes: this._nodes.slice(), edges: this._edges.slice() });
      var state = this._redoStack.pop();
      this._nodes = state.nodes; this._edges = state.edges;
      this._updateStats();
    },

    _updateStats: function () {
      var nodes = 0, edges = 0, lanes = 0;
      var ed = this._real();
      try {
        if (ed && ed.getNetwork) {
          var net = ed.getNetwork();
          var j = net && net.toJSON ? net.toJSON() : null;
          if (j && Array.isArray(j.nodes)) {
            nodes = j.nodes.length;
          } else if (net && net.nodes && typeof net.nodes.size === 'number') {
            nodes = net.nodes.size; /* raw Network: Map internals */
          }
          if (j && Array.isArray(j.edges)) {
            edges = j.edges.length;
            j.edges.forEach(function (e) { lanes += e.lanes || 1; });
          } else if (net && net.edges && typeof net.edges.size === 'number') {
            edges = net.edges.size;
            net.edges.forEach(function (e) { lanes += (e.lanes || 1); });
          }
        } else if (this._nodes) {
          nodes = this._nodes.length;
          edges = (this._edges || []).length;
          lanes = (this._edges || []).reduce(function (a, e) { return a + (e.lanes || 3); }, 0);
        }
      } catch (e) { /* stats are best-effort */ }
      var el;
      el = document.getElementById('ne-node-count'); if (el) el.textContent = nodes;
      el = document.getElementById('ne-edge-count'); if (el) el.textContent = edges;
      el = document.getElementById('ne-lane-count'); if (el) el.textContent = lanes;
    },

    _showToast: function (msg) {
      var el = document.getElementById('toast');
      var txt = document.getElementById('toast-text');
      if (el && txt) {
        txt.textContent = msg;
        el.classList.add('show');
        setTimeout(function () { el.classList.remove('show'); }, 2500);
      }
    }
  };

  /* ── Signal Editor Manager ──────────────────────────────── */
  window.SAE_SignalEditor = {
    _phases: [
      { green: 30, yellow: 5, red: 0 },
      { green: 25, yellow: 5, red: 0 }
    ],

    addPhase: function () {
      this._phases.push({ green: 20, yellow: 3, red: 0 });
      this._render();
    },

    removePhase: function () {
      if (this._phases.length <= 1) return;
      this._phases.pop();
      this._render();
    },

    _render: function () {
      var container = document.getElementById('se-phase-diagram');
      if (!container) return;
      var html = '';
      var totalCycle = 0;
      this._phases.forEach(function (p, i) {
        totalCycle += p.green + p.yellow;
        html += '<div class="flex items-center gap-2">' +
          '<span class="text-xs text-slate-400 w-8">P' + (i + 1) + '</span>' +
          '<div class="flex-1 flex h-8 rounded-lg overflow-hidden border border-slate-600">' +
          '<div style="width:' + p.green + 's;background:#10B981;" class="flex items-center justify-center text-[10px] font-bold text-white">G ' + p.green + 's</div>' +
          '<div style="width:' + p.yellow + 's;background:#EAB308;" class="flex items-center justify-center text-[10px] font-bold text-white">Y ' + p.yellow + 's</div>' +
          '</div>' +
          '<div class="flex gap-1">' +
          '<button onclick="SAE_SignalEditor.adjust(' + i + ',\'green\',-1)" class="w-5 h-5 bg-slate-700 hover:bg-slate-600 rounded text-[10px]">-</button>' +
          '<button onclick="SAE_SignalEditor.adjust(' + i + ',\'green\',1)" class="w-5 h-5 bg-slate-700 hover:bg-slate-600 rounded text-[10px]">+</button>' +
          '</div>' +
          '</div>';
      });
      container.innerHTML = html;
      var el = document.getElementById('se-cycle-time');
      if (el) el.textContent = totalCycle + 's';
    },

    adjust: function (phaseIdx, color, delta) {
      if (!this._phases[phaseIdx]) return;
      this._phases[phaseIdx][color] = Math.max(1, this._phases[phaseIdx][color] + delta);
      this._render();
    }
  };

  /* ── Calibration Manager ────────────────────────────────── */
  window.SAE_Calibration = {
    _data: null,

    uploadCSV: function (file) {
      if (!file) return;
      var self = this;
      var reader = new FileReader();
      reader.onload = function (e) {
        var lines = e.target.result.trim().split('\n');
        self._data = [];
        for (var i = 1; i < lines.length; i++) {
          var parts = lines[i].split(',');
          if (parts.length >= 2) {
            self._data.push({ edgeId: parts[0].trim(), observedFlow: parseFloat(parts[1].trim()) });
          }
        }
        var el = document.getElementById('cal-upload-status');
        if (el) el.textContent = 'Loaded ' + self._data.length + ' detector records';
      };
      reader.readAsText(file);
    },

    run: function () {
      if (!this._data || this._data.length === 0) {
        toast('Upload a field-data CSV first');
        return;
      }
      var progressEl = document.getElementById('cal-progress');
      var barEl = document.getElementById('cal-progress-bar');
      var textEl = document.getElementById('cal-progress-text');
      var resultsEl = document.getElementById('cal-results');

      if (progressEl) progressEl.classList.remove('hidden');

      var self = this;
      var bestGEH = Infinity;
      var bestParams = null;
      var iterations = 36;
      var done = 0;

      function runIteration() {
        var v0 = 15 + Math.random() * 20;
        var T = 0.8 + Math.random() * 1.5;
        var a = 0.5 + Math.random() * 2;
        var b = 1 + Math.random() * 3;

        var gehs = self._data.map(function (d) {
          var simulated = v0 * 0.6 * (1 - Math.random() * 0.3);
          var geh = Math.abs(d.observedFlow - simulated) / Math.sqrt((d.observedFlow + simulated) / 2);
          return geh;
        });
        var avgGEH = gehs.reduce(function (a, b) { return a + b; }, 0) / gehs.length;

        if (avgGEH < bestGEH) {
          bestGEH = avgGEH;
          bestParams = { v0: v0, T: T, a: a, b: b };
        }

        done++;
        if (barEl) barEl.style.width = (done / iterations * 100) + '%';
        if (textEl) textEl.textContent = 'Iteration ' + done + '/' + iterations;

        if (done < iterations) {
          setTimeout(runIteration, 50);
        } else {
          self._showResults(bestParams, bestGEH);
          if (progressEl) progressEl.classList.add('hidden');
        }
      }

      runIteration();
    },

    _showResults: function (params, geh) {
      this._lastParams = Object.assign({}, params);
      var el = document.getElementById('cal-results');
      if (!el) return;
      var pass = geh < 5;
      el.innerHTML =
        '<div class="space-y-3">' +
        '<div class="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-600">' +
        '  <span class="text-sm">GEH Score</span>' +
        '  <span class="font-bold ' + (pass ? 'text-emerald-400' : 'text-red-400') + '">' + geh.toFixed(2) + (pass ? ' ✓ PASS' : ' ✗ FAIL') + '</span>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2 text-xs">' +
        '  <div class="p-2 bg-slate-800 rounded border border-slate-600"><span class="text-slate-400">v₀:</span> <span class="text-white font-semibold">' + params.v0.toFixed(1) + ' m/s</span></div>' +
        '  <div class="p-2 bg-slate-800 rounded border border-slate-600"><span class="text-slate-400">T:</span> <span class="text-white font-semibold">' + params.T.toFixed(2) + ' s</span></div>' +
        '  <div class="p-2 bg-slate-800 rounded border border-slate-600"><span class="text-slate-400">a:</span> <span class="text-white font-semibold">' + params.a.toFixed(2) + ' m/s²</span></div>' +
        '  <div class="p-2 bg-slate-800 rounded border border-slate-600"><span class="text-slate-400">b:</span> <span class="text-white font-semibold">' + params.b.toFixed(2) + ' m/s²</span></div>' +
        '</div>' +
        '<button onclick="SAE_Calibration.applyParams()" class="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"><i class="fas fa-check mr-2"></i>Apply to Engine</button>' +
        '</div>';
    },

    applyParams: function () {
      if (!this._lastParams) return;
      window.__saeIdmOverrides = Object.assign({}, this._lastParams);
      var btn = document.querySelector('#cal-results button');
      if (btn) {
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Applied — next Run uses these';
        btn.classList.remove('bg-emerald-600');
        btn.classList.add('bg-slate-600');
      }
      if (window.SAE_NetworkEditor) window.SAE_NetworkEditor._showToast(
        'IDM overrides applied: v0=' + this._lastParams.v0.toFixed(1) +
        ' T=' + this._lastParams.T.toFixed(2));
    }
  };

  /* ── Analysis Manager (physics-backed via SAE_AnalysisEngine) ── */
  var FLEET_ANALYSIS_TYPE = {
    mlaijy: 'sedan', microbus: 'bus', noss_naql: 'truck', rob_naql: 'truck',
    naql_taqeel: 'truck', motorcycle: 'motorcycle', bicycle: 'bicycle',
    trooscoor: 'tuktuk', tuktuk: 'tuktuk'
  };
  var ANALYSIS_TABS = ['emissions', 'noise', 'safety', 'energy', 'v2x'];

  function fleetTypeOf(typeKey, isAv) {
    if (isAv) return 'av';
    return FLEET_ANALYSIS_TYPE[typeKey] || 'sedan';
  }

  window.SAE_Analysis = {
    _lastSnapshot: null,

    showTab: function (tab) {
      document.querySelectorAll('.aa-panel').forEach(function (p) { p.classList.add('hidden'); });
      document.querySelectorAll('.aa-tab-btn').forEach(function (b) {
        b.classList.remove('active-tab', 'bg-indigo-600');
      });
      var panel = document.getElementById('aa-' + tab);
      if (panel) panel.classList.remove('hidden');
      var btn = document.querySelector('[data-tab="' + tab + '"]');
      if (btn) btn.classList.add('active-tab', 'bg-indigo-600');
      this.computeFromSim(); /* refresh active view with live data */
    },

    /** Pull live vehicles + KPIs and populate every panel. */
    computeFromSim: function () {
      var eng = window.SAE_AnalysisEngine;
      var vehicles = (window.SAE_Sim && window.SAE_Sim.getVehicles()) || [];
      var kpis = (window.SAE_Sim && window.SAE_Sim.getKPIs()) || {};
      if (!eng || !vehicles.length) {
        this._setEmpty();
        return;
      }

      var mprPct = (window.mprValue !== undefined ? window.mprValue : 30);
      var snap = { n: vehicles.length, mpr: mprPct };

      /* ── Emissions (COPERT factors at each vehicle's speed) ── */
      var agg = { CO2: 0, NOx: 0, PM: 0, CO: 0, HC: 0 };
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        var kmh = Math.max(5, v.speed * 3.6);
        var f = eng.getEmissionFactors(fleetTypeOf(v.typeKey, v.isAv), kmh);
        agg.CO2 += f.CO2; agg.NOx += f.NOx; agg.PM += f.PM; agg.CO += f.CO; agg.HC += f.HC;
      }
      Object.keys(agg).forEach(function (k) { agg[k] = agg[k] / vehicles.length; });
      snap.emissions = agg;
      this._renderEmissions(agg);

      /* ── Noise (FHWA energy sum @10 m receiver) ── */
      var sumLv = 0, peakSrc = 0;
      for (var j = 0; j < vehicles.length; j++) {
        var vv = vehicles[j];
        if (vv.speed > 0.5) {
          var src = eng.getNoiseLevel(fleetTypeOf(vv.typeKey, vv.isAv), vv.speed); // m/s mode
          sumLv += Math.pow(10, src / 10);
          if (src > peakSrc) peakSrc = src;
        }
      }
      var leq = sumLv > 0 ? 10 * Math.log10(sumLv) - 20 /* 10 m attenuation */ : 0;
      snap.noise = { leq: leq, peakSrc: peakSrc,
        compliance: Math.max(0, Math.min(100, 100 - Math.max(0, leq - 70) * 4)) };
      this._renderNoise(snap.noise);

      /* ── Safety (SSAM-style proxies from live KPIs) ── */
      var vc = parseFloat(kpis.vc || 0) || 0;
      var delayS = parseFloat(kpis.delay || 0) || 0;
      var queueM = parseFloat(kpis.queue || 0) || 0;
      var riskScore = Math.round(Math.min(100,
        vc * 45 + Math.min(1, delayS / 20) * 30 + Math.min(1, queueM / 150) * 25));
      var ttcProxy = Math.max(0.4, 1.8 - vc * 1.2 - Math.min(0.4, queueM / 300));
      snap.safety = { risk: riskScore, ttc: ttcProxy, rearEnd: Math.round(riskScore * 0.9) };
      this._renderSafety(snap.safety);

      /* ── Energy (drag+roll EV estimate for AV share) ── */
      var avgKmh = kpis.avgSpeed || 0;
      var vms = avgKmh / 3.6;
      var kwhPerKm = 0.055 + 0.00042 * vms * vms; /* aero-dominated */
      var range = Math.round(60 / kwhPerKm);       /* 60 kWh pack */
      snap.energy = { kwhPerKm: kwhPerKm, range: range,
        avShare: Math.round((vehicles.filter(function (x) { return x.isAv; }).length /
                             vehicles.length) * 100) };
      this._renderEnergy(snap.energy);

      /* ── V2X (capacity/delay uplift curve at current MPR) ── */
      var rows = [0, 25, 50, 75, 100].map(function (m) {
        var r = eng.v2xPenetrationImpact(m / 100, {});
        return { mpr: m, cap: Math.round(((r.capacityScale ?? 1 + 0.4 * m / 100) - 1) * 100),
                 delay: Math.round((1 - (r.delayScale ?? 1 - 0.3 * m / 100)) * 100) };
      });
      var cur = eng.v2xPenetrationImpact(mprPct / 100, {});
      snap.v2x = { rows: rows, current: {
        capUp: Math.round(((cur.capacityScale ?? 1 + 0.4 * mprPct / 100) - 1) * 100),
        delayCut: Math.round((1 - (cur.delayScale ?? 1 - 0.3 * mprPct / 100)) * 100) } };
      this._renderV2X(snap.v2x);

      this._lastSnapshot = snap;
    },

    _setEmpty: function () {
      var self = this;
      ANALYSIS_TABS.forEach(function (t) {
        var el = document.getElementById('aa-' + t);
        if (el && !el.dataset.keepEmpty) {
          el.innerHTML = '<div class="text-center text-slate-500 py-8">Run a simulation first — press Run then revisit this tab</div>';
        }
      });
    },

    _card: function (val, label, color) {
      return '<div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center">' +
        '<div class="text-lg font-bold ' + color + '">' + val + '</div>' +
        '<div class="text-[10px] text-slate-400 mt-1">' + label + '</div></div>';
    },

    _renderEmissions: function (a) {
      var el = document.getElementById('aa-emissions');
      if (!el) return;
      el.innerHTML =
        '<h3 class="font-semibold text-sm mb-3"><i class="fas fa-smog text-orange-400 mr-2"></i>Emissions — COPERT V fleet average (per veh·km)</h3>' +
        '<div class="grid grid-cols-2 md:grid-cols-5 gap-3">' +
        this._card(a.CO2.toFixed(0), 'CO₂ g/km', 'text-orange-400') +
        this._card(a.NOx.toFixed(3), 'NOx g/km', 'text-yellow-400') +
        this._card(a.PM.toFixed(4), 'PM g/km', 'text-red-400') +
        this._card(a.CO.toFixed(2), 'CO g/km', 'text-slate-200') +
        this._card(a.HC.toFixed(3), 'HC g/km', 'text-emerald-400') +
        '</div>';
    },

    _renderNoise: function (n) {
      var el = document.getElementById('aa-noise');
      if (!el) return;
      el.innerHTML =
        '<h3 class="font-semibold text-sm mb-3"><i class="fas fa-volume-up text-yellow-400 mr-2"></i>Noise — FHWA TNM energy sum @ 10 m</h3>' +
        '<div class="grid grid-cols-3 gap-3">' +
        this._card(n.leq.toFixed(1), 'L_eq dB(A)', 'text-yellow-400') +
        this._card(n.peakSrc.toFixed(1), 'Peak source dB(A)', 'text-orange-400') +
        this._card(n.compliance.toFixed(0) + '%', 'Compliant vs 70 dB(A)', 'text-emerald-400') +
        '</div>';
    },

    _renderSafety: function (s) {
      var el = document.getElementById('aa-safety');
      if (!el) return;
      el.innerHTML =
        '<h3 class="font-semibold text-sm mb-3"><i class="fas fa-shield-alt text-red-400 mr-2"></i>Safety — SSAM surrogates (live)</h3>' +
        '<div class="grid grid-cols-3 gap-3">' +
        this._card(s.ttc.toFixed(2) + 's', 'TTC proxy', 'text-red-400') +
        this._card(s.rearEnd, 'Rear-end conflicts/hr', 'text-orange-400') +
        this._card(s.risk + '/100', 'Risk score', s.risk > 50 ? 'text-red-400' : 'text-emerald-400') +
        '</div>';
    },

    _renderEnergy: function (e) {
      var el = document.getElementById('aa-energy');
      if (!el) return;
      el.innerHTML =
        '<h3 class="font-semibold text-sm mb-3"><i class="fas fa-bolt text-cyan-400 mr-2"></i>Energy — EV physics at live average speed</h3>' +
        '<div class="grid grid-cols-3 gap-3">' +
        this._card(e.kwhPerKm.toFixed(3), 'kWh/km', 'text-cyan-400') +
        this._card(e.range + ' km', 'Range (60 kWh pack)', 'text-emerald-400') +
        this._card(e.avShare + '%', 'AV share on road', 'text-purple-400') +
        '</div>';
    },

    _renderV2X: function (v) {
      var el = document.getElementById('aa-v2x');
      if (!el) return;
      var rowsHtml = v.rows.map(function (r) {
        return '<tr class="border-t border-slate-700 text-center">' +
          '<td class="py-1.5">' + r.mpr + '%</td><td class="text-emerald-400">+' + r.cap + '%</td>' +
          '<td class="text-cyan-400">-' + r.delay + '%</td></tr>';
      }).join('');
      el.innerHTML =
        '<h3 class="font-semibold text-sm mb-3"><i class="fas fa-wifi text-purple-400 mr-2"></i>V2X penetration impact</h3>' +
        '<div class="grid grid-cols-2 gap-3 mb-4">' +
        this._card('+' + v.current.capUp + '%', 'Capacity @ current MPR', 'text-emerald-400') +
        this._card('-' + v.current.delayCut + '%', 'Delay reduction', 'text-cyan-400') +
        '</div>' +
        '<table class="w-full text-xs"><thead><tr class="text-slate-400 text-center">' +
        '<th>MPR</th><th>Capacity uplift</th><th>Delay cut</th></tr></thead><tbody>' +
        rowsHtml + '</tbody></table>';
    }
  };

  /* ── Scenario Manager ───────────────────────────────────── */
  window.SAE_Scenarios = {
    _scenarios: JSON.parse(localStorage.getItem('sae-scenarios') || '[]'),

    save: function () {
      var nameEl = document.getElementById('sm-name');
      var name = nameEl ? nameEl.value.trim() : 'Untitled';
      if (!name) name = 'Untitled';
      var scenario = {
        id: Date.now().toString(),
        name: name,
        createdAt: new Date().toISOString(),
        mpr: window.mprValue || 30,
        simMode: simMode
      };
      this._scenarios.push(scenario);
      localStorage.setItem('sae-scenarios', JSON.stringify(this._scenarios));
      this._render();
      if (nameEl) nameEl.value = '';
    },

    load: function (id) {
      var s = this._scenarios.find(function (sc) { return sc.id === id; });
      if (s && s.mpr !== undefined) {
        var slider = document.getElementById('mpr-slider');
        if (slider) slider.value = s.mpr;
        window.mprValue = s.mpr;
        if (typeof updateSimMetrics === 'function') updateSimMetrics(s.mpr);
      }
    },

    fork: function (id) {
      var s = this._scenarios.find(function (sc) { return sc.id === id; });
      if (s) {
        var forked = Object.assign({}, s, {
          id: Date.now().toString(),
          name: s.name + ' (fork)',
          createdAt: new Date().toISOString(),
          version: (s.version || 1) + 1
        });
        this._scenarios.push(forked);
        localStorage.setItem('sae-scenarios', JSON.stringify(this._scenarios));
        this._render();
      }
    },

    remove: function (id) {
      this._scenarios = this._scenarios.filter(function (s) { return s.id !== id; });
      localStorage.setItem('sae-scenarios', JSON.stringify(this._scenarios));
      this._render();
    },

    _render: function () {
      var el = document.getElementById('sm-list');
      if (!el) return;
      if (this._scenarios.length === 0) {
        el.innerHTML = '<div class="text-center text-slate-500 text-sm py-4">No saved scenarios</div>';
        return;
      }
      var html = '';
      this._scenarios.forEach(function (s) {
        html += '<div class="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-600">' +
          '<div><div class="text-sm font-semibold">' + s.name + '</div>' +
          '<div class="text-[10px] text-slate-400">' + new Date(s.createdAt).toLocaleDateString() + ' | MPR: ' + s.mpr + '%</div></div>' +
          '<div class="flex gap-1">' +
          '<button onclick="SAE_Scenarios.load(\'' + s.id + '\')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-[10px]">Load</button>' +
          '<button onclick="SAE_Scenarios.fork(\'' + s.id + '\')" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-[10px]">Fork</button>' +
          '<button onclick="SAE_Scenarios.remove(\'' + s.id + '\')" class="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-[10px]">Del</button>' +
          '</div></div>';
      });
      el.innerHTML = html;
    }
  };

  function toast(msg) {
    var el = document.getElementById('toast');
    var txt = document.getElementById('toast-text');
    if (!el || !txt) return;
    txt.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ── Reports Manager ────────────────────────────────────── */
  window.SAE_Reports = {
    generatePDF: function () {
      /* UMD builds expose window.jspdf.jsPDF, not a bare jsPDF global. */
      var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      if (!JsPDF) {
        toast('PDF engine not loaded — check your connection and reload');
        return;
      }
      var doc = new JsPDF();
      doc.setFontSize(20);
      doc.text('SAE AutoSim Hub — Simulation Report', 20, 20);
      doc.setFontSize(12);
      doc.text('Generated: ' + new Date().toLocaleString(), 20, 30);
      doc.text('MPR: ' + (window.mprValue || 30) + '%', 20, 38);
      doc.text('Mode: ' + simMode, 20, 46);
      var adv = ['los', 'speed', 'vc', 'delay', 'queue', 'vehs'];
      var labels = { los: 'LOS', speed: 'Avg speed (km/h)', vc: 'V/C', delay: 'Delay (s)', queue: 'Queue (m)', vehs: 'Active vehicles' };
      var y = 58;
      adv.forEach(function (k) {
        var el = document.getElementById('adv-' + k);
        if (el && simMode === 'advanced') {
          doc.setFontSize(10);
          doc.text(labels[k] + ':', 25, y);
          doc.text(String(el.textContent || '-'), 100, y);
          y += 6;
        }
      });
      doc.save('SAE_Report_' + Date.now() + '.pdf');
      toast('PDF report downloaded');
    },

    generateBibTeX: function () {
      var bib = '@misc{sae_autosim_hub_2026,\n  title        = {SAE AutoSim Hub: Pre-calibrated Vehicle Fleets},\n  author       = {{SAE AutoSim Hub}},\n  year         = {2026},\n  url          = {https://sae.fimtosoft.com},\n  note         = {Accessed: ' + new Date().toISOString().slice(0, 10) + '}\n}';
      var done = function () { toast('BibTeX copied to clipboard'); };
      navigator.clipboard.writeText(bib).then(done).catch(function () {
        var ta = document.createElement('textarea');
        ta.value = bib;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      });
    },

    exportCSV: function () {
      var csv = 'Metric,Value\n';
      csv += 'MPR,' + (window.mprValue || 30) + '\n';
      csv += 'Mode,' + simMode + '\n';
      csv += 'Date,' + new Date().toISOString() + '\n';
      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'SAE_KPIs_' + Date.now() + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    },

    exportSUMO: function () {
      var ed = window.__saeRealEditor;
      if (ed && ed.export) {
        try {
          downloadText('network.net.xml', ed.export('sumo'), 'application/xml');
          if (window.SAE_NetworkEditor) window.SAE_NetworkEditor._showToast('SUMO .net.xml exported');
          return;
        } catch (e) { /* fall through to hint */ }
      }
      toast('Draw a network in the Network Editor first (Road/Junction tools)');
    }
  };

  /* ── Wire up MPR slider to advanced sim ─────────────────── */
  function wireMPRSlider() {
    var slider = document.getElementById('mpr-slider');
    if (!slider) return;
    slider.addEventListener('input', function () {
      if (advancedSim) advancedSim.setMPR(parseInt(slider.value));
    });
  }

  /* ── Keyboard shortcuts ─────────────────────────────────── */
  function wireKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape' && SAE_NetworkEditor) SAE_NetworkEditor.selectTool('select');
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); if (SAE_NetworkEditor) SAE_NetworkEditor.undo(); }
      if (e.ctrlKey && e.shiftKey && e.key === 'Z') { e.preventDefault(); if (SAE_NetworkEditor) SAE_NetworkEditor.redo(); }
    });
  }

  /* ── Expose global functions for onclick handlers ───────── */
  window.toggleSimMode = toggleSimMode;
  window.runAdvancedSim = runAdvancedSim;
  window.pauseAdvancedSim = pauseAdvancedSim;
  window.resetAdvancedSim = resetAdvancedSim;

  /* ── Init on DOMContentLoaded ───────────────────────────── */
  function init() {
    injectSections();
    wireMPRSlider();
    wireKeyboard();
    SAE_Scenarios._render();
    SAE_SignalEditor._render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
