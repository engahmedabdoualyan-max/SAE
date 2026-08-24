# SAE AutoSim Hub — Architecture

```
┌───────────────────────────── Browser ─────────────────────────────┐
│                                                                   │
│  index.html                                                       │
│    ├─ assets/app.js .............. legacy UI (fleet, corridors)   │
│    └─ sim-engine/integration/* ... NEW integration layer          │
│         simBridge.js ──── Worker? ──► worker.js ──► Simulator     │
│              │  (fallback: Simulator on main thread)              │
│              ├── uiControls.js ....... play/pause/speed/KPI cards │
│              ├── scenarioPanel.js .... save/fork/diff (localStorage)
│              ├── importPanel.js ...... xodr/net.xml/geojson I/O   │
│              ├── calibrationPanel.js . GEH grid search + verdict  │
│              └── dashboardPanel.js ... live KPIs, Δ%, PDF report  │
│                 (kpiDashboard.js / reportGenerator.js / Chart.js) │
└───────────────▲───────────────────────────────────────────────────┘
                │ /api/v1/* (JSON + WebSocket)
        ┌───────┴────────┐
        │  nginx :80     │  static SPA · gzip · rate limit · WS upgrade
        └───────┬────────┘
                │ proxy_pass
        ┌───────▼────────┐      ┌──────────────┐
        │ FastAPI :8000  │──────│ PostgreSQL16 │  projects/users/networks/
        │ (uvicorn)      │ JDBC-│   pgdata vol │  scenarios/simulations
        └───────┬────────┘ less└──────────────┘
                │ subprocess / NDJSON stdin-stdout
        ┌───────▼────────┐
        │ SUMO worker    │  python -m app.services.sumo_bridge --worker
        │ (sumo+netconvert from eclipse-sumo pip pkg)                │
        └────────────────┘
```

## Frontend

### Engine core (`sim-engine/`)

Framework-free ES modules (`"type": "module"`):

- `network/graph.js` — node/edge graph with haversine edge lengths; the
  canonical network shape (`{nodes:[{id,lat,lng,type}], edges:[{id,from,to,
  lanes,speedLimit}]}`) is shared with the backend.
- `demand/odMatrix.js` — OD entries `{from,to,flow(veh/h),type}` → routed
  departures.
- `models/` — IDM car-following + MOBIL lane-change per vehicle class.
- `signals/controller.js` — fixed-time signal plans.
- `simulator.js` — deterministic stepping loop, KPI collection, summary.
- `worker.js` — Web Worker facade (`load-network`, `run`, `step-once`,
  `pause/resume/reset`) keeping physics off the UI thread.

### Integration layer (`sim-engine/integration/`)

One bridge + five panels, all DOM-injective and side-effect free at import:

| Module | Responsibility |
|--------|----------------|
| `simBridge.js` | Owns map/canvas rendering, worker lifecycle, demand generation from `FLEET` × `CORRIDORS`, scenario persistence, format exports, calibration application |
| `uiControls.js` | Transport controls, 0.5–10× speed clock, headline KPI cards, canvas sparkline |
| `scenarioPanel.js` | CRUD + fork + A/B diff over `ScenarioManager` (localStorage key `sae-scenarios`) |
| `importPanel.js` | Format sniffing/import (OpenDRIVE, SUMO, GeoJSON, engine JSON) + all export formats incl. VISSIM |
| `calibrationPanel.js` | Field-CSV ingestion → IDM grid search → GEH/RMSE/R² pass-fail → apply |
| `dashboardPanel.js` | Throttled live dashboard, baseline Δ% comparison, completion summary, jsPDF export |

Execution modes: the bridge prefers a **Web Worker**; if construction fails it
falls back to a main-thread `Simulator` with identical message semantics. The
UI clock issues `step-once` requests so every frame carries vehicle payloads
for rendering.

## Backend

FastAPI app under `backend/app`:

```
api/v1/    auth (OAuth2 password + JWT) · projects · networks · scenarios · simulations
core/      settings (pydantic-settings), security
models/    SQLAlchemy ORM entities
services/  sumo_bridge.py — JSON→netconvert→sumo pipeline, FCD parsing,
           NDJSON worker CLI for containerised runs
```

Simulation flow: `POST /simulations/run` persists a `queued` row, a background
task flips it to `running`, executes (optionally via the SUMO worker), stores
KPIs, and marks `completed | failed`. Clients poll `GET /simulations/{id}` or
subscribe to `WS /simulations/{id}/stream`.

## Deployment

- **Root `docker-compose.yml`** orchestrates frontend/backend/db/sumo.
- **Root `Dockerfile`** builds an nginx image serving the static site;
  `.dockerignore` keeps node_modules, backend sources and legacy code out of
  the build context.
- **`nginx.conf`** adds gzip, cache headers, security headers, SPA fallback,
  API rate limiting (30 r/s burst 60) and WebSocket upgrade rules for the
  simulation stream.
- The backend image installs `eclipse-sumo` so `sumo`/`netconvert` are on PATH;
  the same image doubles as the long-lived `sumo` worker service.

## Scaling notes

- Backend is stateless apart from Postgres — scale horizontally behind any LB;
  move background jobs from FastAPI `BackgroundTasks` to Celery/RQ workers when
  run volume grows.
- The SUMO worker is a per-request process pool candidate; each `run` job is
  self-contained in its own temp dir, so N replicas can serve N concurrent
  simulations.
- Postgres: single shared volume; use managed Postgres + read replicas for
  analytics-heavy dashboards.
- Static frontend is CDN-friendly (immutable asset caching already configured).

## Security posture

- JWT bearer auth on every data endpoint; bcrypt password hashing.
- nginx sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Uploads are size-capped (10 MB app-level, 16 MB at the proxy) and must be
  UTF-8 text.
- Change `SECRET_KEY` and DB credentials before any real deployment; add TLS
  termination at the proxy or an ingress in production.
