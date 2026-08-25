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
