/**
 * @file exportPanel.js — Grid of export cards for the "Reports & Export" section.
 * Exposes window.SAE_ExportPanel.init(containerId) / window.initExportPanel(containerId).
 * Delegates to window.SAE_Reports handlers where available (generatePDF,
 * generateBibTeX, exportCSV, exportSUMO); remaining formats download a JSON
 * snapshot of the current scenarios from localStorage('sae-scenarios').
 */
(function () {
  'use strict';

  var PANEL_ID = 'sae-export-panel';

  /* ── Helpers ─────────────────────────────────────────────── */

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function getScenarios() {
    try {
      var arr = JSON.parse(localStorage.getItem('sae-scenarios') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      return [];
    }
  }

  function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  function statePayload(label) {
    return JSON.stringify({
      label: label,
      exportedAt: new Date().toISOString(),
      source: "localStorage:'sae-scenarios'",
      count: getScenarios().length,
      scenarios: getScenarios()
    }, null, 2);
  }

  function exportStateJSON(prefix, filenameSuffix) {
    downloadText(prefix + '_' + stamp() + '.' + filenameSuffix + '.json', statePayload(prefix), 'application/json');
  }

  function callReports(method, fallbackPrefix) {
    var reports = window.SAE_Reports;
    if (reports && typeof reports[method] === 'function') {
      reports[method]();
    } else {
      exportStateJSON(fallbackPrefix || method, 'fallback');
    }
  }

  function scenariosAsGeoJSON() {
    var features = getScenarios().map(function (s) {
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {
          id: s.id,
          name: s.name,
          mpr: s.mpr,
          simMode: s.simMode,
          createdAt: s.createdAt
        }
      };
    });
    return JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2);
  }

  /* ── Card catalogue ──────────────────────────────────────── */

  var CARDS = [
    { key: 'sumo', icon: 'fa-road', tone: 'text-emerald-400', name: 'SUMO Package',
      desc: '.sumocfg + routed network ready for the Eclipse SUMO simulator.',
      run: function () { callReports('exportSUMO', 'SAE_SUMO_package'); } },
    { key: 'vissim', icon: 'fa-traffic-light', tone: 'text-orange-400', name: 'VISSIM .inpx',
      desc: 'PTV VISSIM network placeholder from the saved scenario state.',
      run: function () { exportStateJSON('SAE_VISSIM_export', 'inpx'); } },
    { key: 'opendrive', icon: 'fa-draw-polygon', tone: 'text-cyan-400', name: 'OpenDRIVE .xodr',
      desc: 'ASAM OpenDRIVE road-network description from current state.',
      run: function () { exportStateJSON('SAE_OpenDRIVE_export', 'xodr'); } },
    { key: 'geojson', icon: 'fa-map-marked-alt', tone: 'text-blue-400', name: 'GeoJSON',
      desc: 'Scenario set as a GeoJSON FeatureCollection for GIS tools.',
      run: function () {
        downloadText('SAE_scenarios_' + stamp() + '.geojson', scenariosAsGeoJSON(), 'application/geo+json');
      } },
    { key: 'csv', icon: 'fa-file-csv', tone: 'text-yellow-400', name: 'CSV KPIs',
      desc: 'Headline KPI table (MPR, mode, timestamp) as spreadsheet CSV.',
      run: function () { callReports('exportCSV', 'SAE_KPIs'); } },
    { key: 'pdf', icon: 'fa-file-pdf', tone: 'text-red-400', name: 'PDF Report',
      desc: 'Formatted simulation report with methodology and results.',
      run: function () { callReports('generatePDF', 'SAE_Report'); } },
    { key: 'bibtex', icon: 'fa-quote-right', tone: 'text-purple-400', name: 'BibTeX',
      desc: 'Citation entry for academic use of the AutoSim Hub results.',
      run: function () { callReports('generateBibTeX', 'SAE_citation'); } },
    { key: 'scenario', icon: 'fa-code', tone: 'text-indigo-400', name: 'JSON Scenario',
      desc: 'Raw scenario store snapshot from localStorage sae-scenarios.',
      run: function () { exportStateJSON('SAE_scenarios', 'state'); } }
  ];

  /* ── Panel construction ──────────────────────────────────── */

  function cardHTML(card) {
    return '<div class="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-2 hover:border-indigo-500 transition-colors">' +
      '<div class="flex items-center gap-2">' +
      '<i class="fas ' + card.icon + ' ' + card.tone + ' text-xl"></i>' +
      '<span class="font-semibold text-sm text-white">' + card.name + '</span>' +
      '</div>' +
      '<p class="text-xs text-slate-400 flex-1">' + card.desc + '</p>' +
      '<button type="button" data-export="' + card.key + '" class="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-semibold transition-colors">' +
      '<i class="fas fa-download mr-1"></i>Download</button>' +
      '</div>';
  }

  function handleExport(key) {
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i].key === key) { CARDS[i].run(); return; }
    }
  }

  function initExportPanel(containerId) {
    var parent = document.getElementById(containerId);
    if (!parent) return null;

    // Idempotent: never render two panels.
    var previous = document.getElementById(PANEL_ID);
    if (previous && previous.parentNode) previous.parentNode.removeChild(previous);

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('data-sae-export-panel', '');
    panel.className = 'mt-8 max-w-4xl mx-auto';

    var html = '<h3 class="font-semibold text-sm text-slate-300 mb-4">' +
      '<i class="fas fa-file-export text-indigo-400 mr-2"></i>Export Formats</h3>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">';
    CARDS.forEach(function (card) { html += cardHTML(card); });
    html += '</div>';
    panel.innerHTML = html;

    panel.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-export]') : null;
      if (btn) handleExport(btn.getAttribute('data-export'));
    });

    parent.appendChild(panel);
    return panel;
  }

  /* ── Exports ─────────────────────────────────────────────── */

  window.SAE_ExportPanel = {
    init: initExportPanel,
    downloadText: downloadText
  };
  window.initExportPanel = initExportPanel;

})();
