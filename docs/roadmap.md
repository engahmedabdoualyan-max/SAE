# Roadmap — closing the gap with global platforms

Honest assessment of SAE AutoSim Hub vs PTV VISSIM, Aimsun Next, SUMO
tooling and Treiber's interactive models, after the 2026.2 platform build.
Items are ordered by (impact ÷ effort); ✅ marks what this codebase already
ships today.

## Shipped ✅

- IDM/MOBIL micro-simulation in-browser: templates, green-wave coordination,
  adaptive signal hold, loop detectors (+harmonic speeds, sparklines),
  time–space & fundamental diagrams, fleet-mix control, seeded deterministic
  restarts, vehicle trails
- Physics-backed analysis: COPERT emissions, FHWA noise, SSAM surrogates,
  EV energy, V2X uplift curves — all live from sim state
- Calibration wizard running the *actual* engine per candidate (GEH per lane)
- Network editing on Google Maps; import OpenDRIVE / SUMO / GeoJSON / **OSM**
- Cloud runs: browser network → FastAPI → netconvert → headless SUMO 1.20 →
  WebSocket progress → trip KPIs, PDF report & trajectory JSON downloads
- Scenario versioning (save/fork/diff), VISSIM `.inpx` export, citation
  generator (APA/IEEE/BibTeX/Harvard/Chicago), shareable lab deep-links
- 9 languages incl. RTL Arabic; CI×4 incl. a 34-check Playwright E2E over
  the full docker stack

## Next (highest leverage first)

| # | Capability | Why it matters | Effort | Parity target |
|---|---|---|---|---|
| 1 | **Run local sim on edited graph** — project editor network onto canvas lanes with routing | Turns the editor from "cloud prep" into an instant playground for any imported city | L | SUMO netedit feel |
| 2 | **Dynamic traffic assignment** — 2–3 alternative routes + logit split, travel-time feedback | The defining VISSIM/Aimsun feature we lack entirely | L | Aimsun DTA |
| 3 | **Web Worker offload + 10× scale** — move advanced engine off main thread, 500+ vehicles | Smoothness at city-fraction scale; unblocks #1/#2 | M | all |
| 4 | **Bus routes + TSP** — dwell model (exists) rendered in canvas, signal priority on approach | Multimodal credibility | M | VISSIM PT |
| 5 | **Pseudo-3D view** — perspective camera toggle over existing renderer | Perceived parity with 3D giants at 1% cost | S | visual |
| 6 | **Emission heat-strip overlay** — per-segment NOx coloring on the road during runs | Makes COPERT visible, great for stakeholder demos | S | unique |
| 7 | **RL signal control hook** — expose step/action API matching Flow-project conventions | Research audience acquisition | M | Berkeley Flow |
| 8 | **Collaborative sessions** — CRDT share of scenario state beyond URL hash | Team workflows | L | cloud suites |
| 9 | **HCM intersection module** — standalone signalized/unsignalized LOS worksheets feeding the sim | Consultancy workflow fit | M | HCS/Synchro |
| 10 | **Public REST for lab** — run local-engine sims server-side via the FastAPI fallback engine | Programmatic access without SUMO install | S | APIs |

## Deliberately out of scope

Full 3D meshes, hardware-in-the-loop, proprietary emission models (HBEFA/
PHEM licensed), and pedestrian social-force *rendering* (model exists;
canvas priority stays vehicular).
