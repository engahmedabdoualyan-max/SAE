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
- **Capacity planner (حاسبة القدرة)** inside the Development Plan: turns the
  monthly concrete target into an everyday operational task for every
  department — plants (required daily output with buffer, per-station
  utilisation bars), logistics (mixer trips/day, cycle time from turnaround,
  mixers needed per shift), quality (samples/month), and sales (revenue est.).
  Assumptions (working days, mixer load, shift hours, load/unload, buffer %,
  price/m³, sampling interval) are editable and persisted to `localStorage`;
  the planner re-computes live for any M1–M3 month.
- **PMP roadmap (قائد الخطة)** in the Development Plan, following Earned Value
  Management: input the current state (الوضع الحالي), the goal to reach
  (هدف الوصول), the time-to-reach (زمن الوصول) and a phase count — the page
  distributes the journey into equal phases with interpolated planned-end
  values and syncs them into the concrete KPI so the chart, task board and
  capacity planner all follow. A **smart advisor brain** panel reports the
  required monthly rate, monthly growth %, SPI (schedule performance index),
  variance % and an on-track / behind verdict. After each phase a live
  **evaluation form** records the achieved actual + real month + notes; the
  phase closes, the next one activates, and a **re-baseline** action re-
  projects the remaining phases from the achieved value to the goal — the
  classic PMP "plan, evaluate, correct" loop. (المراحل تتوزع المهام وتُقيَّم
  وتُعدَّل الخطة بعد كل مرحلة)
- **Advisor console with trend forecast & corrective action** in the roadmap:
  when a phase closes behind plan (SPI < 1) the brain computes an EVM-style
  **EAC** (estimated completion = horizon/SPI), the forecast milestone miss in
  months, and a concrete corrective recommendation — raise the monthly pace to
  `X` or extend the horizon to `Y` months. A **"today's job for every
  department"** feed reuses the capacity model for the *active phase's* target,
  printing daily output, rev. est., mixers and samples required right now. A
  **management report** export (text file) summarises plan, phases, SPI/variance
  and every phase review for sign-off.
- **E2E suite grown to 80 checks**: Phase 2f now also verifies the active-phase
  daily task feed, the behind-plan EAC trend forecast + corrective advice, the
  management-report export (SPI + phases), and a final reset restoring the clean
  plan.
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
