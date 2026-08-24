/**
 * @file bootModules.js — ES-module bootstrap for features that ship as modules.
 * Deferred by nature; waits one tick after DOMContentLoaded so that the
 * script-tag integration files (wireUp.js) finish injecting sections first.
 */
import { initNavigation } from './navigationManager.js';

function boot() {
  if (window.__saeModulesBooted) return;
  window.__saeModulesBooted = true;

  initNavigation([
    { id: 'hero', label: 'Home' },
    { id: 'sim', label: 'Simulation' },
    { id: 'ringroad', label: 'Ring Road' },
    { id: 'network-editor', label: 'Network Editor' },
    { id: 'signal-editor', label: 'Signals' },
    { id: 'calibration-section', label: 'Calibration' },
    { id: 'advanced-analysis', label: 'Analysis' },
    { id: 'scenario-manager', label: 'Scenarios' },
    { id: 'reports-section', label: 'Reports' }
  ]);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
} else {
  setTimeout(boot, 0);
}
