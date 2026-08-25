/**
 * @file bootModules.js — ES-module bootstrap for features that ship as modules.
 * Deferred by nature; waits one tick after DOMContentLoaded so that the
 * script-tag integration files (wireUp.js) finish injecting sections first.
 *
 * Wires:
 *  - sticky navigation bar (navigationManager)
 *  - the REAL NetworkEditor (editor/networkEditor.js) into #ne-map,
 *    delegating the sidebar stub handlers to it via window.__saeRealEditor
 */
import { initNavigation } from './navigationManager.js';
import { createNetworkEditor } from '../editor/networkEditor.js';
import { createGraphSimRunner } from './graphSimRunner.js';
import { getEmissionFactors } from '../analysis/emissions.js';
import { getNoiseLevel } from '../analysis/noise.js';
import { v2xPenetrationImpact } from '../analysis/v2x.js';

/** Reuse the app-wide Google Maps script (single load policy). */
function ensureGmaps(cb) {
  if (typeof google !== 'undefined' && google.maps) { cb(); return; }
  const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
  window.__saeNeMapsReady = () => cb();
  if (!existing) {
    const key = (typeof GOOGLE_API_KEY !== 'undefined' && GOOGLE_API_KEY) ||
                window.GOOGLE_API_KEY || '';
    if (!key) { setTimeout(cb, 0); return; } /* headless/model-only mode */
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
            '&callback=__saeNeMapsReady';
    s.async = true;
    document.head.appendChild(s);
  }
  /* Poll-fallback: fires even if the global callback was clobbered. */
  const t0 = Date.now();
  const iv = setInterval(() => {
    const ready = (typeof google !== 'undefined' && google.maps);
    if (ready || Date.now() - t0 > 15000) { clearInterval(iv); cb(); }
  }, 300);
}

const DARK_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1a2b' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] }
];

function initRealNetworkEditor() {
  const host = document.getElementById('ne-map');
  if (!host || window.__saeRealEditor) return;

  /* The editor renders its own floating toolbar; our sidebar is authoritative,
     so hide only its toolbar (keep its status + properties panels). */
  const style = document.createElement('style');
  style.textContent = '.sae-net-editor-toolbar{display:none!important}';
  document.head.appendChild(style);

  ensureGmaps(() => {
    let map = null;
    const el = document.getElementById('ne-map');
    if (!el) return;
    if (typeof google !== 'undefined' && google.maps) {
      map = new google.maps.Map(el, {
        center: { lat: 30.0444, lng: 31.2357 },
        zoom: 12,
        styles: DARK_MAP_STYLES,
        disableDefaultUI: false,
      });
    }
    try {
      const ed = createNetworkEditor('ne-map', map); /* model-only when map=null */
      window.__saeRealEditor = ed;
      if (ed.on) {
        ed.on('network-changed', () => {
          if (window.SAE_NetworkEditor) window.SAE_NetworkEditor._updateStats();
        });
      }
      if (window.SAE_NetworkEditor) window.SAE_NetworkEditor._updateStats();
    } catch (err) {
      console.error('NetworkEditor init failed:', err);
    }
  });
}

  /* Nav buttons must work across the main/case view split: auto-toggle the
     view before scrolling when the target section lives in the other view. */
  function wireNavViewSwitching() {
    if (window.__saeNavViewWired) return;
    window.__saeNavViewWired = true;
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.sae-subnav-btn') : null;
      if (!btn || btn.disabled) return;
      var id = btn.dataset.target;
      var el = id ? document.getElementById(id) : null;
      if (!el) return;
      var isCaseSection = el.classList.contains('case-view');
      var inCaseMode = document.body.classList.contains('view-case');
      if ((isCaseSection && !inCaseMode) || (!isCaseSection && inCaseMode)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof window.setView === 'function') {
          window.setView(isCaseSection ? 'case' : 'main');
        } else {
          document.body.classList.toggle('view-case', isCaseSection);
        }
        setTimeout(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    }, true); /* capture: run before the bar's own smooth-scroll handler */
  }

  function boot() {
  if (window.__saeModulesBooted) return;
  window.__saeModulesBooted = true;

  /* Expose physics-backed analysis functions to the classic-script layer. */
  window.SAE_AnalysisEngine = { getEmissionFactors, getNoiseLevel, v2xPenetrationImpact };

  initNavigation([
    { id: 'hero', label: 'Home' },
    { id: 'sim', label: 'Simulation' },
    { id: 'ringroad', label: 'Ring Road' },
    { id: 'network-editor', label: 'Network Editor' },
    { id: 'network-runner', label: 'Runner' },
    { id: 'signal-editor', label: 'Signals' },
    { id: 'calibration-section', label: 'Calibration' },
    { id: 'advanced-analysis', label: 'Analysis' },
    { id: 'sim-lab', label: 'Lab' },
    { id: 'scenario-manager', label: 'Scenarios' },
    { id: 'cloud-run', label: 'Cloud Run' },
    { id: 'reports-section', label: 'Reports' }
  ]);

  wireNavViewSwitching();
  initRealNetworkEditor();
  initNetworkRunner();
}

/* ── Network Runner: IDM on the edited/imported graph ─────────────── */
function initNetworkRunner() {
  const runner = createGraphSimRunner('runner-canvas');
  if (!runner) return;
  let lastNetJSON = null;

  const setStatus = (t) => {
    const el = document.getElementById('nr-status');
    if (el) el.textContent = t;
  };
  const refreshKpis = () => {
    const st = runner.getStats();
    if (!st) return;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set('nr-kpi-veh', st.active);
    set('nr-kpi-speed', st.avgSpeedKmh);
    set('nr-kpi-done', st.exited);
    set('nr-kpi-los', `${st.los} · ${st.routesBuilt}`);
    if (!runner.running && st.time > 0) setStatus(`paused @ t=${Math.round(st.time)}s`);
  };

  window.SAE_Runner = {
    start() {
      try {
        const ed = window.__saeRealEditor;
        const j = ed && ed.getNetwork ? ed.getNetwork().toJSON() : null;
        if (!j || !j.nodes || j.nodes.length < 2) {
          if (window.SAE_NetworkEditor) window.SAE_NetworkEditor._showToast(
            'Draw or import a network first (OSM / SUMO / xodr)');
          return false;
        }
        const sameNet = lastNetJSON &&
          JSON.stringify(j).length === JSON.stringify(lastNetJSON).length;
        const opts = {
          vph: parseInt(document.getElementById('nr-vph')?.value || '900', 10),
          duration: 600,
          kRoutes: parseInt(document.getElementById('nr-k')?.value || '2', 10),
          seed: 42,
        };
        if (!sameNet || !window.__saeRunnerLoaded) {
          runner.load(j, opts);
          lastNetJSON = j;
          window.__saeRunnerLoaded = true;
        }
        runner.run();
        setStatus('running…');
        return true;
      } catch (err) {
        if (window.SAE_NetworkEditor) window.SAE_NetworkEditor._showToast(
          'Runner error: ' + err.message);
        return false;
      }
    },
    pause() { runner.pause(); refreshKpis(); },
    reset() {
      window.__saeRunnerLoaded = false;
      runner.reset(42);
      setStatus('');
      refreshKpis();
    },
    tick(n) { runner.tick(n); refreshKpis(); },
    getStats: () => runner.getStats(),
  };

  setInterval(() => { if (runner && runner.sim) { try { refreshKpis(); } catch (e) { /* noop */ } } }, 400);

  /* deep-link parity: #run=1 boots the runner after editor content exists */
  if (location.hash === '#run=1') setTimeout(() => window.SAE_Runner.start(), 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
} else {
  setTimeout(boot, 0);
}
