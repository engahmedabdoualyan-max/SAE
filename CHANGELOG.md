# Changelog

All notable changes to SAE AutoSim Hub.

## 2026.2 — Hybrid Simulation Platform

### Added
- **IDM micro-simulation engine** (46 ES modules): car-following, MOBIL lane
  changes, signal control, OD demand, Web-Worker loop, KPI collector
  (73/73 assertions).
- **Multimodal models**: social-force pedestrians, bus dwell times, cyclists.
- **Advanced analysis**: COPERT V emissions, FHWA TNM noise, SSAM-style
  safety surrogates, EV energy, V2X penetration impact — rendered live from
  simulation state.
- **Interactive network editor** on Google Maps with OpenDRIVE / SUMO /
  GeoJSON import and export in all four formats.
- **Calibration wizard**: GEH/RMSE/R² grid search over IDM parameters with
  one-click apply-to-engine.
- **Simulation Lab**: scenario templates (bottleneck, lane closure, uphill,
  signalized arterial, three-signal green wave), live IDM parameter sliders,
  heavy-vehicle fleet-mix control, seeded deterministic restarts, loop
  detectors with true harmonic-mean speeds and flow sparklines, time–space
  diagram and fundamental q–k diagram.
- **Network Runner**: one-click IDM micro-simulation directly on the edited
  or imported network graph — k-penalized shortest-path route sets per OD
  pair with multinomial-logit split over free-flow travel times (route
  choice), canvas rendering of true edge geometry with vehicle trails,
  signal-aware travel, live KPIs (active vehicles, network speed, completed
  trips, LOS letter) and pause/reset controls.
- **Development Plan (خطة التطوير) page** under the Research & Development
  section — the factory's brain: monthly targets per department (sales,
  plants, quality, logistics) with per-KPI current vs M1–M3 values, progress
  bars, Chart.js target-trajectory line chart per department, a task board
  translating each KPI into per-department monthly deltas, inline edit mode
  (add/remove KPI, adjust targets) persisted to `localStorage`, reset-to-
  template, and CSV export. Fully translated across all 9 languages with a
  reusable `dp_*` i18n key set and a `window.t` translation helper exposed to
  ES modules.
- **Actuals tracking in the Development Plan**: record the real M1–M3 values
  per KPI via a dedicated "Record actuals" edit mode; every month is marked
  ✓ achieved / ✗ behind against its target (respecting direction — sales grow
  upward, mixer turnaround shrinks), an "On target" summary block shows
  `met/recorded`, the trajectory chart overlays white square actuals on the
  coloured target lines, and the task board gains an actual column. CSV export
  now carries `A1–A3` and an `ontrack` column. Old saved plans migrate
  automatically.
- **E2E suite grown to 64 checks**: Phase 2f covers the Development Plan end
  to end — template seeding (5000 → 5500), KPI cards, Chart.js, edit/save/
  reset roundtrip, CSV export, actuals recording with on/off-target verdicts
  and reset-to-template — on top of the original 53.
- **Engine-driven calibration**: the wizard's grid search now runs the real
  simulation per candidate (12 seeded runs) and scores GEH against loop
  detector flows normalized per lane — replacing a mocked search.
- **Cloud Simulation panel**: editor network → FastAPI → netconvert →
  headless SUMO → trip KPIs streamed over WebSocket, with PDF report and
  trajectory JSON downloads from the results panel.
- **Scenario manager** with fork/diff versioning; VISSIM `.inpx` exporter;
  academic citation generator (APA/IEEE/BibTeX/Harvard/Chicago).
- **FastAPI backend** (23 modules): JWT auth, projects/networks/scenarios/
  simulations CRUD, WebSocket progress, calibration service, PDF reports,
  Docker Compose stack (nginx + backend + Postgres + SUMO).
- **9-language UI** including full RTL Arabic for every section.
- CI: engine tests (Node 18/20/22 matrix), backend pytest suite, HTML checks.

### Fixed
- `computeConflictAnalysis` was called but never defined — broke the whole
  MPR update cascade; implemented with SSAM heuristics.
- Advanced sim spawned zero vehicles (`const FLEET` is not a `window` prop).
- Language switch rendered raw i18n keys for missing entries; EN fallback +
  complete AR translations appended.
- Network upload rejected the engine's `{lat,lng}` dialect (500); a
  normalizer now accepts both node/edge dialects.
- SUMO inside slim images crashed on missing `libX11`; runtime libs added.
- SUMO failures aborted cloud runs; graceful builtin-engine fallback added.
- netconvert interpreted lon/lat degrees as metres, collapsing networks to
  5 m edges; local equirectangular projection to metres applied first.
- nginx healthcheck failed (container `localhost` = `::1`); IPv6 listen.

## 2026.1 — Static dashboard

- Initial single-page research dashboard: fleet matrices, corridor case
  studies, canvas traffic animation, 9-language i18n skeleton.
