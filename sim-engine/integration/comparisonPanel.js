/**
 * @file comparisonPanel.js — Side-by-side KPI comparison of saved scenarios.
 * Exposes window.SAE_ComparisonPanel.init(containerId) / window.initComparisonPanel(containerId).
 * Reads scenarios from localStorage('sae-scenarios') and uses
 * window.SAE_Compare (CorridorCompare class) for best/worst detection when
 * present, falling back to local higher/lower heuristics per metric.
 */
(function () {
  'use strict';

  var PANEL_ID = 'sae-comparison-panel';
  var MAX_PICKS = 3;

  /* Metrics: `better` = direction of the winning value. */
  var METRICS = [
    { key: 'mpr', label: 'MPR', unit: '%', better: 'high' },
    { key: 'avgSpeed', label: 'Avg Speed', unit: ' m/s', better: 'high' },
    { key: 'delay', label: 'Delay', unit: ' s', better: 'low' },
    { key: 'queue', label: 'Max Queue', unit: ' veh', better: 'low' }
  ];

  /* ── Data helpers ────────────────────────────────────────── */

  function getScenarios() {
    try {
      var arr = JSON.parse(localStorage.getItem('sae-scenarios') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      return [];
    }
  }

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /**
   * Determine the winning scenario ids for one metric across the picks.
   * Prefers window.SAE_Compare (CorridorCompare.compareMetric) when available.
   * @returns {Array<string>} ids with the best value (ties included).
   */
  function bestIdsFor(picks, metric) {
    var entries = [];
    picks.forEach(function (s) {
      var v = num(s[metric.key]);
      if (v !== null) entries.push({ id: String(s.id), value: v });
    });
    if (entries.length === 0) return [];

    if (window.SAE_Compare && typeof window.SAE_Compare === 'function') {
      try {
        var cc = new window.SAE_Compare();
        picks.forEach(function (s) {
          cc.addCorridor(String(s.id), { mpr: s.mpr, avgSpeed: s.avgSpeed, delay: s.delay, queue: s.queue, los: s.los });
        });
        var bag = {};
        entries.forEach(function (e) { bag[e.id] = e.value; });
        var res = cc.compareMetric(metric.key === 'mpr' ? 'mpr' : metric.key, bag);
        if (res && res.best != null) {
          var bestVal = num(bag[res.best]);
          return entries.filter(function (e) { return e.value === bestVal; }).map(function (e) { return e.id; });
        }
      } catch (err) { /* fall through to local heuristic */ }
    }

    var target = entries[0].value;
    entries.forEach(function (e) {
      if (metric.better === 'high' ? e.value > target : e.value < target) target = e.value;
    });
    return entries.filter(function (e) { return e.value === target; }).map(function (e) { return e.id; });
  }

  /* ── Render helpers ──────────────────────────────────────── */

  function optionHTML(s, selectedId) {
    var safeName = escapeHtml(s.name);
    return '<option value="' + escapeHtml(s.id) + '"' + (String(s.id) === String(selectedId || '') ? ' selected' : '') + '>' +
      safeName + '</option>';
  }

  function emptyStateHTML() {
    return '<div class="text-center py-10 bg-slate-800 rounded-xl border border-dashed border-slate-600">' +
      '<i class="fas fa-chart-bar text-slate-500 text-3xl mb-3"></i>' +
      '<p class="text-sm font-semibold text-slate-300 mb-1">Not enough scenarios to compare</p>' +
      '<p class="text-xs text-slate-400">Save at least two scenarios above, then come back to compare their KPIs side by side.</p>' +
      '</div>';
  }

  function selectorHTML(scenarios, previousPicks) {
    var html = '<div class="flex flex-wrap items-end gap-3 mb-6">';
    for (var i = 0; i < MAX_PICKS; i++) {
      var prev = previousPicks && previousPicks[i];
      html += '<div class="flex-1 min-w-[160px]">' +
        '<label class="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Scenario ' + (i + 1) + '</label>' +
        '<select data-compare-slot="' + i + '" class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white">' +
        '<option value="">— none —</option>';
      scenarios.forEach(function (s) { html += optionHTML(s, prev); });
      html += '</select></div>';
    }
    html += '<button type="button" data-compare-run class="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold transition-colors">' +
      '<i class="fas fa-balance-scale mr-2"></i>Compare</button>' +
      '</div>';
    return html;
  }

  function cardHTML(s, wins) {
    var dateStr = '-';
    if (s.createdAt) {
      var d = new Date(s.createdAt);
      if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString();
    }
    var rows = '';
    METRICS.forEach(function (m) {
      var v = num(s[m.key]);
      var valueStr = v === null ? '-' : v + m.unit;
      var isWinner = wins[m.key] && wins[m.key].indexOf(String(s.id)) !== -1;
      rows += '<div class="flex items-center justify-between px-2 py-1.5 rounded ' +
        (isWinner ? 'bg-emerald-500/10 border border-emerald-600' : 'bg-slate-900') + '">' +
        '<span class="text-xs text-slate-400">' + m.label + '</span>' +
        '<span class="text-sm font-semibold ' + (isWinner ? 'text-emerald-400' : 'text-white') + '">' + valueStr +
        (isWinner ? ' <i class="fas fa-trophy text-[10px]" title="best"></i>' : '') + '</span></div>';
    });
    var safeName = escapeHtml(s.name);
    return '<div class="flex-1 min-w-[180px] max-w-xs bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">' +
      '<h4 class="font-semibold text-sm text-white truncate" title="' + safeName + '">' + safeName + '</h4>' +
      '<p class="text-[10px] text-slate-400">' + dateStr + ' | Mode: ' + (s.simMode || 'simple') + '</p>' +
      rows + '</div>';
  }

  function resultsHTML(picks) {
    var wins = {};
    METRICS.forEach(function (m) { wins[m.key] = bestIdsFor(picks, m); });
    var html = '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">';
    picks.forEach(function (s) { html += cardHTML(s, wins); });
    html += '</div>';
    html += '<p class="mt-3 text-[10px] text-slate-500"><i class="fas fa-info-circle mr-1"></i>' +
      'Green cells mark the better value per metric (higher MPR / speed, lower delay / queue).</p>';
    return html;
  }

  /* ── Panel construction ──────────────────────────────────── */

  function initComparisonPanel(containerId) {
    var parent = document.getElementById(containerId);
    if (!parent) return null;

    // Idempotent: never render two panels.
    var previous = document.getElementById(PANEL_ID);
    if (previous && previous.parentNode) previous.parentNode.removeChild(previous);

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('data-sae-comparison-panel', '');
    panel.className = 'mt-8';

    function refresh() {
      var scenarios = getScenarios();
      if (scenarios.length < 2) {
        panel.innerHTML = '<h3 class="font-semibold text-sm text-slate-300 mb-4">' +
          '<i class="fas fa-balance-scale text-indigo-400 mr-2"></i>Scenario Comparison</h3>' +
          emptyStateHTML();
        return;
      }
      // Keep previously chosen slots stable across re-renders.
      var previousPicks = [];
      panel.querySelectorAll('[data-compare-slot]').forEach(function (sel) {
        previousPicks.push(sel.value);
      });
      panel.innerHTML = '<h3 class="font-semibold text-sm text-slate-300 mb-4">' +
        '<i class="fas fa-balance-scale text-indigo-400 mr-2"></i>Scenario Comparison</h3>' +
        selectorHTML(scenarios, previousPicks) +
        '<div data-compare-results><div class="text-center text-slate-500 text-sm py-6">Pick scenarios and press Compare</div></div>';
    }

    panel.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-compare-run]') : null;
      if (!btn) return;
      var slots = panel.querySelectorAll('[data-compare-slot]');
      var chosen = {};
      var picks = [];
      Array.prototype.forEach.call(slots, function (sel) {
        var id = sel.value;
        if (!id || chosen[id]) return;
        chosen[id] = true;
        var match = getScenarios().filter(function (s) { return String(s.id) === id; })[0];
        if (match) picks.push(match);
      });
      var out = panel.querySelector('[data-compare-results]');
      if (!out) return;
      out.innerHTML = picks.length >= 2
        ? resultsHTML(picks)
        : '<div class="text-center text-yellow-400 text-sm py-6"><i class="fas fa-exclamation-circle mr-1"></i>Select at least two different scenarios to compare.</div>';
    });

    parent.appendChild(panel);
    refresh();
    return panel;
  }

  /* ── Exports ─────────────────────────────────────────────── */

  window.SAE_ComparisonPanel = {
    init: initComparisonPanel,
    refresh: function (containerId) { initComparisonPanel(containerId); }
  };
  window.initComparisonPanel = initComparisonPanel;

})();
