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

  function updateAdvKPIs(data) {
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

  /* ── Network Editor Manager ─────────────────────────────── */
  window.SAE_NetworkEditor = {
    _tool: 'select',
    _nodes: [],
    _edges: [],
    _undoStack: [],
    _redoStack: [],

    selectTool: function (tool) {
      this._tool = tool;
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
      var reader = new FileReader();
      var self = this;
      reader.onload = function (e) {
        var content = e.target.result;
        var ext = file.name.split('.').pop().toLowerCase();
        try {
          var data;
          if (ext === 'json' || ext === 'geojson') {
            data = JSON.parse(content);
            if (data.nodes) {
              self._nodes = data.nodes;
              self._edges = data.edges || [];
            }
          }
          self._updateStats();
          self._showToast('Imported ' + file.name);
        } catch (err) {
          self._showToast('Import error: ' + err.message);
        }
      };
      reader.readAsText(file);
    },

    exportAs: function (format) {
      var data = JSON.stringify({ nodes: this._nodes, edges: this._edges }, null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'network.' + (format === 'json' ? 'json' : format);
      a.click();
      URL.revokeObjectURL(url);
    },

    undo: function () {
      if (this._undoStack.length === 0) return;
      this._redoStack.push({ nodes: this._nodes.slice(), edges: this._edges.slice() });
      var state = this._undoStack.pop();
      this._nodes = state.nodes;
      this._edges = state.edges;
      this._updateStats();
    },

    redo: function () {
      if (this._redoStack.length === 0) return;
      this._undoStack.push({ nodes: this._nodes.slice(), edges: this._edges.slice() });
      var state = this._redoStack.pop();
      this._nodes = state.nodes;
      this._edges = state.edges;
      this._updateStats();
    },

    _updateStats: function () {
      var el;
      el = document.getElementById('ne-node-count');
      if (el) el.textContent = this._nodes.length;
      el = document.getElementById('ne-edge-count');
      if (el) el.textContent = this._edges.length;
      el = document.getElementById('ne-lane-count');
      if (el) el.textContent = this._edges.reduce(function (a, e) { return a + (e.lanes || 3); }, 0);
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
        alert('Please upload a CSV file first');
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
      if (window.SAE_Sim && window.SAE_Sim._lastParams) {
        /* apply to next simulation run */
      }
    }
  };

  /* ── Analysis Manager ───────────────────────────────────── */
  window.SAE_Analysis = {
    showTab: function (tab) {
      document.querySelectorAll('.aa-panel').forEach(function (p) { p.classList.add('hidden'); });
      document.querySelectorAll('.aa-tab-btn').forEach(function (b) {
        b.classList.remove('active-tab', 'bg-indigo-600');
      });
      var panel = document.getElementById('aa-' + tab);
      if (panel) panel.classList.remove('hidden');
      var btn = document.querySelector('[data-tab="' + tab + '"]');
      if (btn) btn.classList.add('active-tab', 'bg-indigo-600');
    },

    renderEmissions: function (results) {
      var el = document.getElementById('aa-emissions');
      if (!el || !results) return;
      el.innerHTML =
        '<h3 class="font-semibold text-sm mb-3"><i class="fas fa-smog text-orange-400 mr-2"></i>Emissions Analysis (COPERT V)</h3>' +
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">' +
        '  <div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center"><div class="text-lg font-bold text-orange-400">' + (results.co2 || 0).toFixed(0) + '</div><div class="text-[10px] text-slate-400">CO₂ (g/km)</div></div>' +
        '  <div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center"><div class="text-lg font-bold text-yellow-400">' + (results.nox || 0).toFixed(2) + '</div><div class="text-[10px] text-slate-400">NOx (g/km)</div></div>' +
        '  <div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center"><div class="text-lg font-bold text-red-400">' + (results.pm || 0).toFixed(3) + '</div><div class="text-[10px] text-slate-400">PM (g/km)</div></div>' +
        '  <div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center"><div class="text-lg font-bold text-slate-300">' + (results.co || 0).toFixed(2) + '</div><div class="text-[10px] text-slate-400">CO (g/km)</div></div>' +
        '</div>';
    },

    renderNoise: function (results) {
      var el = document.getElementById('aa-noise');
      if (!el || !results) return;
      el.innerHTML =
        '<h3 class="font-semibold text-sm mb-3"><i class="fas fa-volume-up text-yellow-400 mr-2"></i>Noise Analysis (FHWA TNM)</h3>' +
        '<div class="grid grid-cols-2 md:grid-cols-3 gap-3">' +
        '  <div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center"><div class="text-lg font-bold text-yellow-400">' + (results.avgLevel || 0).toFixed(1) + '</div><div class="text-[10px] text-slate-400">Avg L_eq dB(A)</div></div>' +
        '  <div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center"><div class="text-lg font-bold text-orange-400">' + (results.peakLevel || 0).toFixed(1) + '</div><div class="text-[10px] text-slate-400">Peak dB(A)</div></div>' +
        '  <div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center"><div class="text-lg font-bold text-emerald-400">' + (results.compliance || 0) + '%</div><div class="text-[10px] text-slate-400">Below 70 dB(A)</div></div>' +
        '</div>';
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

  /* ── Reports Manager ────────────────────────────────────── */
  window.SAE_Reports = {
    generatePDF: function () {
      if (typeof jsPDF === 'undefined') {
        alert('jsPDF not loaded. Add <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script> to your page.');
        return;
      }
      var doc = new jspdf.jsPDF();
      doc.setFontSize(20);
      doc.text('SAE AutoSim Hub — Simulation Report', 20, 20);
      doc.setFontSize(12);
      doc.text('Generated: ' + new Date().toLocaleString(), 20, 30);
      doc.text('MPR: ' + (window.mprValue || 30) + '%', 20, 38);
      doc.text('Mode: ' + simMode, 20, 46);
      doc.save('SAE_Report_' + Date.now() + '.pdf');
    },

    generateBibTeX: function () {
      var bib = '@misc{sae_autosim_hub_2026,\n  title        = {SAE AutoSim Hub: Pre-calibrated Vehicle Fleets},\n  author       = {{SAE AutoSim Hub}},\n  year         = {2026},\n  url          = {https://sae.fimtosoft.com},\n  note         = {Accessed: ' + new Date().toISOString().slice(0, 10) + '}\n}';
      navigator.clipboard.writeText(bib).then(function () {
        alert('BibTeX copied to clipboard!');
      }).catch(function () {
        var ta = document.createElement('textarea');
        ta.value = bib;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('BibTeX copied!');
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
      alert('SUMO export — build a network first using the Network Editor.');
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
