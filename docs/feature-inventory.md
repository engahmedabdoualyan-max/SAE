# Feature inventory — shipped, surfaced & hidden gold

Answers: "what do we have that the user can't see?" Audit date 2026-08-25.

## ✅ Surfaced to users today

| Capability | Entry point |
|---|---|
| In-browser IDM sim + templates + green wave + adaptive signals | `#sim` → Advanced mode / `#sim-lab` |
| Live sliders (v0/T/a/b), heavy-mix %, restart-with-seed | Lab panel |
| Loop detectors + sparklines, TS & fundamental diagrams | Lab panel |
| Snapshot PNG · Share deep-link (`#lab=`) | Lab panel |
| COPERT/FHWA/SSAM/Energy/V2X analysis from live runs | `#advanced-analysis` |
| Engine-driven GEH calibration (12 real runs) + Apply | `#calibration-section` |
| Network editor on Google Maps; import **OSM/SUMO/OpenDRIVE/GeoJSON** | `#network-editor` |
| Signal timing editor | `#signal-editor` |
| Scenario save/load/fork + A/B compare | `#scenario-manager` |
| Cloud SUMO runs: login/**signup**, history browser, WS progress, results, PDF + trajectories download | `#cloud-run` |
| Exports grid + corridor comparison + reports/citations | `#reports-section`, panels |

## 🗄️ Hidden gold — built, tested, but NOT user-visible

These ES-module panels (~2,600 lines) require a live `SimBridge`
(ES-class bridging Google Maps markers + corridor heat-coloring). They are
fully implemented and syntax-clean but never instantiated on the page:

| File | Lines | What users are missing |
|---|---|---|
| `integration/simBridge.js` | 1,163 | **Vehicles as Google Maps markers**, corridors colored by simulated speed (live heatmap), exports from live state |
| `integration/dashboardPanel.js` | 284 | Results dashboard with baseline Δ% comparison + completion summaries |
| `integration/uiControls.js` | 296 | Crash-rate estimator (`estimateCrashes`) + alt control skin |
| `integration/scenarioPanel.js` | 233 | Richer scenario cards w/ timestamps & diff table |
| `integration/calibrationPanel.js` | 367 | Before/after calibration charts (wireUp now owns the engine-driven flow) |
| `integration/trailRenderer.js` | 214 | Generic fading-trail renderer (canvas trails exist natively) |
| `multimodal/*` engine | ~700 | Pedestrian social-force, bus dwell, cyclists — modelled, tested, no UI surface |
| `dashboard/kpiDashboard.js` | — | Chart.js gauge/comparison components |

**Unlock path (roadmap #11):** build a thin `SimBridgeLite` adapter exposing
the handful of methods these panels call (initMap/getKPIs/getPositions/
on/export*) backed by `SAE_Sim` — one adapter lights up five panels at once.

## Service-worker honesty (v4)

Precache previously listed every integration file including unwired ones;
v4 caches only what ships to users (9 files), so returning visitors don't
download dead bytes.

## Competitive gap summary

See `docs/roadmap.md` for the ranked 10-item list. Top three remaining:
1. Run the local sim **on the edited/imported graph** (not just flat lanes)
2. Dynamic traffic assignment (route choice)
3. Web-Worker scale-up (500+ vehicles)
