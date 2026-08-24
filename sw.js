/* SAE AutoSim Hub service worker — v2
 * Bumped from 'sae-v1': adds the sim-engine/integration panel bundle to the
 * precache and gates fetch handling to GET requests only.
 */
const CACHE = 'sae-autosim-v2';
const PRECACHE = [
  '/',
  '/index.html',
  '/assets/app.js',
  '/assets/styles.css',
  '/manifest.json',
  '/icon.svg',
  '/locales/en.js',
  '/sim-engine/integration/calibrationPanel.js',
  '/sim-engine/integration/bootModules.js',
  '/sim-engine/integration/comparisonPanel.js',
  '/sim-engine/integration/dashboardPanel.js',
  '/sim-engine/integration/exportPanel.js',
  '/sim-engine/integration/fullIntegration.js',
  '/sim-engine/integration/importPanel.js',
  '/sim-engine/integration/navigationManager.js',
  '/sim-engine/integration/newSections.js',
  '/sim-engine/integration/scenarioPanel.js',
  '/sim-engine/integration/simBridge.js',
  '/sim-engine/integration/trailRenderer.js',
  '/sim-engine/integration/uiControls.js',
  '/sim-engine/integration/wireUp.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; // never touch POST/PUT/etc.
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    // network-first for HTML (fresh deployments always win)
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
  } else if (url.origin === location.origin) {
    // cache-first with network fallback for local static assets
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }))
    );
  }
  // cross-origin (Google Maps, YouTube, CDNs): pass through untouched
});
