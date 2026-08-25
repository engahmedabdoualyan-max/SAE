# SAE AutoSim Hub

**Hybrid traffic-simulation platform** — an Arabic/English research dashboard
([sae.fimtosoft.com](https://sae.fimtosoft.com)) backed by a real IDM
micro-simulation engine and server-side Eclipse SUMO.

Draw a road network in the browser, simulate it locally with physics-based
car-following, or send it to the cloud SUMO engine and watch progress stream
back over WebSocket.

---

## Architecture

```
┌────────────────────────── Browser ──────────────────────────┐
│  index.html + assets/app.js      (fleet data · i18n · UI)   │
│  sim-engine/integration/*        (bridges & panels)         │
│    ├ fullIntegration.js   → in-browser IDM simulation       │
│    ├ cloudPanel.js        → REST + WebSocket → backend      │
│    └ bootModules.js       → NetworkEditor · nav · analysis  │
└──────────────┬──────────────────────────▲───────────────────┘
               │ /api (nginx proxy)       │ WS progress
┌──────────────▼──────────────────────────┴───────────────────┐
│  FastAPI backend  ·  PostgreSQL  ·  SUMO 1.20 (TraCI/batch) │
│  projects → networks → scenarios → simulations → results    │
└─────────────────────────────────────────────────────────────┘
```

## Feature map

| Area | Highlights |
|---|---|
| **Micro-simulation engine** (`sim-engine/`, 46 modules) | IDM + MOBIL, network graph & Dijkstra routing, fixed/actuated signals, OD demand, Web-Worker loop, LOS/V/C/delay/queue KPIs |
| **Multimodal** | Social-force pedestrians, bus dwell-time model, cyclists |
| **Advanced analysis** | COPERT V emissions, FHWA TNM noise, TTC/PET safety surrogates, EV energy, V2X penetration impact — all computed from live sim state |
| **Network editor** | Draw roads/junctions/signals on Google Maps (model-only fallback), import OpenDRIVE / SUMO / GeoJSON, export all four formats |
| **Calibration** | CSV field-data upload, GEH/RMSE/R² grid-search over IDM params, one-click apply to engine |
| **Cloud runs** | Editor network → FastAPI → netconvert → headless SUMO → trip KPIs via WebSocket |
| **Scenarios** | Save/load/fork/diff with localStorage versioning |
| **Exports** | SUMO package, PTV VISSIM `.inpx`, OpenDRIVE `.xodr`, GeoJSON, CSV, jsPDF reports, APA/IEEE/BibTeX/Harvard/Chicago citations |
| **i18n** | 9 languages (en/ar/de/fr/ru/hi/zh/ja/ko) incl. RTL |

## Quickstart (full stack)

```bash
docker compose up --build
# frontend  → http://localhost
# API docs  → http://localhost:8000/docs  (demo login: demo@sae.local / demo1234)
```

## Development

Static site — serve the repo root with any web server:

```bash
python3 -m http.server 8080
# backend only:
cd backend && uvicorn app.main:app --reload
```

## Tests

```bash
node tests/run-all.js          # engine: 73 assertions across 11 suites
cd backend && pytest tests/ -v # API smoke: health/login/OpenAPI/CRUD
```

CI runs both on every push (Node 18/20/22 matrix) plus HTML validation.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system design
- [`docs/api-reference.md`](docs/api-reference.md) — REST/WebSocket contracts
- [`docs/getting-started.md`](docs/getting-started.md) — walkthroughs

## License

Proprietary — © 2026 SAE AutoSim Hub / Fimtosoft. All rights reserved.
