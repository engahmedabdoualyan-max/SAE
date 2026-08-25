/**
 * @file newSections.js — Generates HTML for new advanced sections.
 * Injected into index.html before the footer.
 */
(function () {
  'use strict';

  function createNetworkEditorSection() {
    return '' +
    '<section id="network-editor" class="case-view py-16 bg-slate-800 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="ne_title">Network Editor</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="ne_desc">Draw roads, junctions, and signals on the map. Import OpenDRIVE, SUMO, or GeoJSON networks.</p>' +
    '    </div>' +
    '    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">' +
    '      <div class="lg:col-span-1">' +
    '        <div class="bg-slate-900 rounded-xl p-4 border border-slate-700 space-y-3">' +
    '          <h3 class="font-semibold text-sm text-slate-300" data-key="ne_tools">Tools</h3>' +
    '          <div class="flex flex-wrap gap-2">' +
    '            <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.selectTool(\'select\')" class="ne-tool-btn px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold transition-all active-tool"><i class="fas fa-mouse-pointer mr-1"></i>Select</button>' +
    '            <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.selectTool(\'road\')" class="ne-tool-btn px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold transition-all"><i class="fas fa-road mr-1"></i>Road</button>' +
    '            <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.selectTool(\'junction\')" class="ne-tool-btn px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold transition-all"><i class="fas fa-project-diagram mr-1"></i>Junction</button>' +
    '            <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.selectTool(\'signal\')" class="ne-tool-btn px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold transition-all"><i class="fas fa-traffic-light mr-1"></i>Signal</button>' +
    '            <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.selectTool(\'delete\')" class="ne-tool-btn px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-semibold transition-all"><i class="fas fa-trash mr-1"></i>Delete</button>' +
    '          </div>' +
    '          <div class="border-t border-slate-700 pt-3 space-y-2">' +
    '            <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.undo()" class="w-full px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs"><i class="fas fa-undo mr-1"></i>Undo (Ctrl+Z)</button>' +
    '            <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.redo()" class="w-full px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs"><i class="fas fa-redo mr-1"></i>Redo (Ctrl+Shift+Z)</button>' +
    '          </div>' +
    '          <div class="border-t border-slate-700 pt-3 space-y-2">' +
    '            <h4 class="text-xs text-slate-400" data-key="ne_import">Import</h4>' +
    '            <input type="file" id="ne-import-file" accept=".osm,.xodr,.net.xml,.geojson,.json" class="hidden" onchange="SAE_NetworkEditor && SAE_NetworkEditor.importFile(this.files[0])">' +
    '            <button onclick="document.getElementById(\'ne-import-file\').click()" class="w-full px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-xs"><i class="fas fa-upload mr-1"></i><i class="fas fa-upload mr-1"></i>Import OSM / SUMO / xodr</button>' +
    '            <h4 class="text-xs text-slate-400 mt-2" data-key="ne_export">Export</h4>' +
    '            <div class="grid grid-cols-2 gap-1">' +
    '              <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.exportAs(\'json\')" class="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[10px]">JSON</button>' +
    '              <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.exportAs(\'opendrive\')" class="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[10px]">OpenDRIVE</button>' +
    '              <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.exportAs(\'sumo\')" class="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[10px]">SUMO</button>' +
    '              <button onclick="SAE_NetworkEditor && SAE_NetworkEditor.exportAs(\'geojson\')" class="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[10px]">GeoJSON</button>' +
    '            </div>' +
    '          </div>' +
    '          <div id="ne-stats" class="border-t border-slate-700 pt-3 text-xs text-slate-400 space-y-1">' +
    '            <div>Nodes: <span id="ne-node-count" class="text-white font-semibold">0</span></div>' +
    '            <div>Edges: <span id="ne-edge-count" class="text-white font-semibold">0</span></div>' +
    '            <div>Lanes: <span id="ne-lane-count" class="text-white font-semibold">0</span></div>' +
    '          </div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="lg:col-span-3">' +
    '        <div id="ne-map" class="bg-slate-700 rounded-xl border border-slate-600" style="height:500px;"></div>' +
    '        <div id="ne-properties" class="hidden mt-4 bg-slate-900 rounded-xl p-4 border border-slate-700">' +
    '          <h3 class="font-semibold text-sm text-slate-300 mb-3">Properties</h3>' +
    '          <div id="ne-props-content" class="space-y-2 text-xs"></div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  function createSignalEditorSection() {
    return '' +
    '<section id="signal-editor" class="case-view py-16 bg-slate-900 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="se_title">Signal Timing Editor</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="se_desc">Design and optimize traffic signal phase plans with visual drag-to-edit phase diagrams.</p>' +
    '    </div>' +
    '    <div class="max-w-4xl mx-auto">' +
    '      <div class="bg-slate-800 rounded-xl p-6 border border-slate-700">' +
    '        <div class="flex justify-between items-center mb-4">' +
    '          <div class="flex gap-2">' +
    '            <button onclick="SAE_SignalEditor && SAE_SignalEditor.addPhase()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-semibold"><i class="fas fa-plus mr-1"></i>Add Phase</button>' +
    '            <button onclick="SAE_SignalEditor && SAE_SignalEditor.removePhase()" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-semibold"><i class="fas fa-minus mr-1"></i>Remove Phase</button>' +
    '          </div>' +
    '          <div class="text-xs text-slate-400">Cycle: <span id="se-cycle-time" class="text-white font-semibold">90s</span></div>' +
    '        </div>' +
    '        <div id="se-phase-diagram" class="space-y-3"></div>' +
    '        <div class="mt-4 grid grid-cols-3 gap-4 text-xs text-slate-400">' +
    '          <div class="flex items-center gap-2"><span class="w-3 h-3 bg-emerald-500 rounded"></span> Green</div>' +
    '          <div class="flex items-center gap-2"><span class="w-3 h-3 bg-yellow-500 rounded"></span> Yellow</div>' +
    '          <div class="flex items-center gap-2"><span class="w-3 h-3 bg-red-500 rounded"></span> Red</div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  function createCalibrationSection() {
    return '' +
    '<section id="calibration-section" class="case-view py-16 bg-slate-800 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="cal_title">Calibration Wizard</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="cal_desc">Upload field data (CSV) and auto-calibrate IDM parameters to match observed traffic counts.</p>' +
    '    </div>' +
    '    <div class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">' +
    '      <div class="bg-slate-900 rounded-xl p-6 border border-slate-700">' +
    '        <h3 class="font-semibold text-sm mb-3" data-key="cal_upload">Upload Field Data</h3>' +
    '        <p class="text-xs text-slate-400 mb-3">CSV format: edgeId, observedFlow (veh/hr)</p>' +
    '        <input type="file" id="cal-csv-upload" accept=".csv" class="hidden" onchange="SAE_Calibration && SAE_Calibration.uploadCSV(this.files[0])">' +
    '        <button onclick="document.getElementById(\'cal-csv-upload\').click()" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold"><i class="fas fa-file-csv mr-2"></i>Choose CSV File</button>' +
    '        <div id="cal-upload-status" class="mt-3 text-xs text-slate-400"></div>' +
    '        <div class="mt-4">' +
    '          <button onclick="SAE_Calibration && SAE_Calibration.run()" class="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"><i class="fas fa-play mr-2"></i>Run Calibration</button>' +
    '        </div>' +
    '        <div id="cal-progress" class="hidden mt-4">' +
    '          <div class="w-full bg-slate-700 rounded-full h-2 overflow-hidden">' +
    '            <div id="cal-progress-bar" class="h-full bg-emerald-500 transition-all" style="width:0%"></div>' +
    '          </div>' +
    '          <div id="cal-progress-text" class="text-xs text-slate-400 mt-1">Running...</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="bg-slate-900 rounded-xl p-6 border border-slate-700">' +
    '        <h3 class="font-semibold text-sm mb-3" data-key="cal_results">Calibration Results</h3>' +
    '        <div id="cal-results" class="space-y-3">' +
    '          <div class="text-center text-slate-500 text-sm py-8">Upload data and run calibration to see results</div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  function createAdvancedAnalysisSection() {
    return '' +
    '<section id="advanced-analysis" class="case-view py-16 bg-slate-900 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="aa_title">Advanced Analysis</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="aa_desc">Emissions, noise, safety, energy, and V2X analysis with field-data calibration.</p>' +
    '    </div>' +
    '    <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">' +
    '      <button onclick="SAE_Analysis && SAE_Analysis.showTab(\'emissions\')" class="aa-tab-btn px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all active-tab" data-tab="emissions"><i class="fas fa-smog text-orange-400 text-xl mb-1"></i><div class="text-xs font-semibold">Emissions</div></button>' +
    '      <button onclick="SAE_Analysis && SAE_Analysis.showTab(\'noise\')" class="aa-tab-btn px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all" data-tab="noise"><i class="fas fa-volume-up text-yellow-400 text-xl mb-1"></i><div class="text-xs font-semibold">Noise</div></button>' +
    '      <button onclick="SAE_Analysis && SAE_Analysis.showTab(\'safety\')" class="aa-tab-btn px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all" data-tab="safety"><i class="fas fa-shield-alt text-red-400 text-xl mb-1"></i><div class="text-xs font-semibold">Safety</div></button>' +
    '      <button onclick="SAE_Analysis && SAE_Analysis.showTab(\'energy\')" class="aa-tab-btn px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all" data-tab="energy"><i class="fas fa-bolt text-cyan-400 text-xl mb-1"></i><div class="text-xs font-semibold">Energy</div></button>' +
    '      <button onclick="SAE_Analysis && SAE_Analysis.showTab(\'v2x\')" class="aa-tab-btn px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all" data-tab="v2x"><i class="fas fa-wifi text-purple-400 text-xl mb-1"></i><div class="text-xs font-semibold">V2X</div></button>' +
    '    </div>' +
    '    <div id="aa-content" class="max-w-4xl mx-auto bg-slate-800 rounded-xl p-6 border border-slate-700">' +
    '      <div id="aa-emissions" class="aa-panel"><div class="text-center text-slate-500 py-8">Run a simulation first to see emissions analysis</div></div>' +
    '      <div id="aa-noise" class="aa-panel hidden"><div class="text-center text-slate-500 py-8">Run a simulation first to see noise analysis</div></div>' +
    '      <div id="aa-safety" class="aa-panel hidden"><div class="text-center text-slate-500 py-8">Run a simulation first to see safety analysis</div></div>' +
    '      <div id="aa-energy" class="aa-panel hidden"><div class="text-center text-slate-500 py-8">Run a simulation first to see energy analysis</div></div>' +
    '      <div id="aa-v2x" class="aa-panel hidden"><div class="text-center text-slate-500 py-8">Run a simulation first to see V2X analysis</div></div>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  function createScenarioManagerSection() {
    return '' +
    '<section id="scenario-manager" class="case-view py-16 bg-slate-800 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="sm_title">Scenario Manager</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="sm_desc">Save, load, fork, and compare simulation scenarios with full versioning.</p>' +
    '    </div>' +
    '    <div class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">' +
    '      <div class="bg-slate-900 rounded-xl p-6 border border-slate-700">' +
    '        <h3 class="font-semibold text-sm mb-3">Save Scenario</h3>' +
    '        <input id="sm-name" type="text" placeholder="Scenario name" class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm mb-3">' +
    '        <button onclick="SAE_Scenarios && SAE_Scenarios.save()" class="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"><i class="fas fa-save mr-2"></i>Save</button>' +
    '      </div>' +
    '      <div class="md:col-span-2 bg-slate-900 rounded-xl p-6 border border-slate-700">' +
    '        <h3 class="font-semibold text-sm mb-3">Saved Scenarios</h3>' +
    '        <div id="sm-list" class="space-y-2 max-h-64 overflow-y-auto">' +
    '          <div class="text-center text-slate-500 text-sm py-4">No saved scenarios</div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  function createReportsSection() {
    return '' +
    '<section id="reports-section" class="case-view py-16 bg-slate-900 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="rp_title">Reports & Export</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="rp_desc">Generate PDF reports with methodology, results, and calibration data.</p>' +
    '    </div>' +
    '    <div class="max-w-2xl mx-auto bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">' +
    '      <button onclick="SAE_Reports && SAE_Reports.generatePDF()" class="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-file-pdf"></i>Generate PDF Report</button>' +
    '      <button onclick="SAE_Reports && SAE_Reports.generateBibTeX()" class="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-quote-right"></i>Copy BibTeX Citation</button>' +
    '      <button onclick="SAE_Reports && SAE_Reports.exportCSV()" class="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-file-csv"></i>Export KPIs as CSV</button>' +
    '      <button onclick="SAE_Reports && SAE_Reports.exportSUMO()" class="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-download"></i>Export SUMO Package</button>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  function createCloudSection() {
    return '' +
    '<section id="cloud-run" class="case-view py-16 bg-slate-800 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="cl_title">Cloud Simulation</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="cl_desc">Run your network on the server-side SUMO engine. Streams live progress over WebSocket and returns real trip KPIs.</p>' +
    '    </div>' +
    '    <div class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">' +
    '      <div class="bg-slate-900 rounded-xl p-6 border border-slate-700 space-y-4">' +
    '        <h3 class="font-semibold text-sm">1 · Connect</h3>' +
    '          <input id="cl-email" type="email" value="demo@sae.local" placeholder="email" class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm">' +
    '        <input id="cl-pass" type="password" value="demo1234" placeholder="password" class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm">' +
    '        <div class="grid grid-cols-3 gap-2">' +
    '          <button onclick="SAE_Cloud && SAE_Cloud.login()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold col-span-2"><i class="fas fa-plug mr-1"></i>Login</button>' +
    '          <button onclick="SAE_Cloud && SAE_Cloud.signup()" title="Create account with the email/password above" class="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm font-semibold">Sign up</button>' +
    '        </div>' +
    '        <h3 class="font-semibold text-sm pt-2">2 · Launch</h3>' +
    '        <div class="flex items-center gap-2 text-xs text-slate-400">' +
    '          <label for="cl-duration">Duration</label>' +
    '          <input id="cl-duration" type="number" min="60" max="3600" step="60" value="300" class="w-24 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-xs"> s' +
    '        </div>' +
    '        <button onclick="SAE_Cloud && SAE_Cloud.run()" class="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"><i class="fas fa-cloud-upload-alt mr-2"></i>Run in Cloud</button>' +
    '        <div id="cl-status" class="text-xs text-slate-400"></div>' +
    '      </div>' +
    '      <div class="bg-slate-900 rounded-xl p-6 border border-slate-700">' +
    '        <h3 class="font-semibold text-sm mb-3">Pipeline & Results</h3>' +
    '        <div id="cl-steps" class="space-y-1.5 text-xs mb-4"></div>' +
    '        <div class="w-full bg-slate-700 rounded-full h-2 overflow-hidden mb-4">' +
    '          <div id="cl-progress" class="h-full bg-emerald-500 transition-all" style="width:0%"></div>' +
    '        </div>' +
    '        <div id="cl-results"><div class="text-center text-slate-500 text-sm py-6">No cloud run yet</div></div>' +
    '        <div class="mt-5 pt-4 border-t border-slate-700">' +
    '          <div class="flex items-center justify-between mb-2">' +
    '            <h4 class="font-semibold text-xs text-slate-300"><i class="fas fa-history mr-1 text-cyan-400"></i>Past runs</h4>' +
    '            <button onclick="SAE_Cloud && SAE_Cloud.loadHistory()" class="text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">Refresh</button>' +
    '          </div>' +
    '          <div id="cl-history" class="space-y-1.5 max-h-48 overflow-y-auto text-xs">' +
    '            <div class="text-center text-slate-500 py-3">Login to see your run history</div>' +
    '          </div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  function createLabSection() {
    return '' +
    '<section id="sim-lab" class="py-16 bg-slate-900 text-white">' +
    '  <div class="container mx-auto px-4">' +
    '    <div class="text-center mb-10">' +
    '      <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="lab_title">Simulation Lab</h2>' +
    '      <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="lab_desc">Scenario templates, live driver-parameter sliders, loop detectors, time-space diagram and the fundamental flow-density diagram.</p>' +
    '    </div>' +
    '    <div class="max-w-5xl mx-auto space-y-6">' +
    '      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
    '        <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">' +
    '          <h3 class="font-semibold text-sm mb-3"><i class="fas fa-layer-group text-cyan-400 mr-2"></i>Scenario Templates</h3>' +
    '          <select id="lab-template" class="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm mb-3">' +
    '            <option value="">— select template —</option>' +
    '            <option value="ring">Ring Road baseline (free flow)</option>' +
    '            <option value="bottleneck">On-ramp bottleneck</option>' +
    '            <option value="lane_closure">Lane closure / work zone</option>' +
    '            <option value="uphill">Uphill gradient (+3.5%)</option>' +
    '            <option value="signal_arterial">Signalized arterial</option>' +
    '            <option value="green_wave">Green wave (3 coordinated signals)</option>' +
    '          </select>' +
    '          <div class="grid grid-cols-3 gap-2">' +
    '            <button onclick="SAE_Lab && SAE_Lab.loadTemplate()" class="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-semibold"><i class="fas fa-play mr-1"></i>Run</button>' +
    '            <button onclick="SAE_Lab && SAE_Lab.restart()" title="Same seed → identical run" class="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm font-semibold"><i class="fas fa-redo mr-1"></i>Restart</button>' +
    '            <button onclick="SAE_Lab && SAE_Lab.snapshot()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold" aria-label="Download canvas snapshot as PNG"><i class="fas fa-camera mr-1"></i>PNG</button>' +
    '          </div>' +
    '          <div class="grid grid-cols-2 gap-2 mt-2">' +
    '            <button onclick="SAE_Lab && SAE_Lab.copyShareLink()" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold" aria-label="Copy shareable lab link"><i class="fas fa-link mr-1"></i>Share link</button>' +
    '            <label class="px-3 py-1.5 bg-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer select-none">' +
    '              <input type="checkbox" id="lab-adaptive" onchange="SAE_Lab && SAE_Lab.setAdaptive(this.checked)" class="accent-emerald-500">' +
    '              Adaptive signals' +
    '            </label>' +
    '          </div>' +
    '          <div id="lab-detectors" class="grid grid-cols-2 gap-3 mt-4"></div>' +
    '          <div id="lab-sparks" class="grid grid-cols-2 gap-3 mt-3">' +
    '            <canvas id="lab-spark-1" width="200" height="46" class="w-full rounded bg-slate-950"></canvas>' +
    '            <canvas id="lab-spark-2" width="200" height="46" class="w-full rounded bg-slate-950"></canvas>' +
    '          </div>' +
    '        </div>' +
    '        <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">' +
    '          <h3 class="font-semibold text-sm mb-3"><i class="fas fa-sliders-h text-emerald-400 mr-2"></i>Live IDM Parameters</h3>' +
    '          <div id="lab-sliders" class="space-y-3 text-xs"></div>' +
    '          <div class="mt-4 pt-3 border-t border-slate-700">' +
    '            <div class="flex items-center gap-3 text-xs">' +
    '              <span class="w-44 text-slate-400">Heavy vehicles — % of human fleet</span>' +
    '              <input id="lab-sl-heavy" type="range" min="0" max="45" step="5" value="20" class="flex-1 accent-emerald-500">' +
    '              <span id="lab-val-heavy" class="w-10 text-right font-mono text-emerald-400">20</span>' +
    '            </div>' +
    '          </div>' +
    '          <button onclick="SAE_Lab && SAE_Lab.applySliders()" class="mt-3 w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"><i class="fas fa-bolt mr-2"></i>Apply Live</button>' +
    '        </div>' +
    '      </div>' +
    '      <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">' +
    '        <h3 class="font-semibold text-sm mb-3"><i class="fas fa-chart-area text-purple-400 mr-2"></i>Time–Space Diagram <span class="text-[10px] text-slate-400">(position vs time, colored by speed)</span></h3>' +
    '        <canvas id="lab-ts" width="880" height="240" class="w-full rounded-lg bg-slate-950" role="img" aria-label="Time-space trajectory diagram: vehicle position over time colored by speed"></canvas>' +
    '      </div>' +
    '      <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">' +
    '        <h3 class="font-semibold text-sm mb-3"><i class="fas fa-wave-square text-orange-400 mr-2"></i>Fundamental Diagram <span class="text-[10px] text-slate-400">q = k·v (flow vs density)</span></h3>' +
    '        <canvas id="lab-fd" width="880" height="220" class="w-full rounded-lg bg-slate-950" role="img" aria-label="Fundamental diagram: traffic flow versus density scatter"></canvas>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</section>';
  }

  window.SAE_Sections = {
    createNetworkEditorSection: createNetworkEditorSection,
    createSignalEditorSection: createSignalEditorSection,
    createCalibrationSection: createCalibrationSection,
    createAdvancedAnalysisSection: createAdvancedAnalysisSection,
    createScenarioManagerSection: createScenarioManagerSection,
    createReportsSection: createReportsSection,
    createCloudSection: createCloudSection,
    createLabSection: createLabSection,
    injectAll: function () {
      var footer = document.querySelector('footer');
      if (!footer) return;
      var html = '';
      html += createNetworkEditorSection();
      html += createSignalEditorSection();
      html += createCalibrationSection();
      html += createAdvancedAnalysisSection();
      html += createScenarioManagerSection();
      html += createCloudSection();
      html += createReportsSection();
      footer.insertAdjacentHTML('beforebegin', html);

      /* The Lab drives the live #sim canvas — it must sit in the MAIN view,
         directly after the simulation section (not inside the case stack). */
      var lab = createLabSection();
      var simSec = document.getElementById('sim');
      if (simSec && simSec.parentElement) {
        simSec.insertAdjacentHTML('afterend', lab);
      } else {
        footer.insertAdjacentHTML('beforebegin', lab);
      }
    }
  };

})();
