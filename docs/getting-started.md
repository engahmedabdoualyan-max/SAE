# SAE AutoSim Hub — Getting Started

From zero to a running microsimulation in ~5 minutes.

## 1. Prerequisites

- Docker + Docker Compose **or** Node.js 18+ and Python 3.11 for local dev.
- A Google Maps JavaScript API key (only for the map view; the canvas
  fallback works without one).

## 2. Run the full stack (Docker)

```bash
docker compose up --build
```

Services started:

| Service | URL | Purpose |
|---------|-----|---------|
| frontend | http://localhost | nginx SPA + `/api` reverse proxy |
| backend | http://localhost:8000/docs | FastAPI + Swagger UI |
| db | localhost:5432 | PostgreSQL 16 (`sae`/`sae_secret`, db `sae_hub`) |
| sumo | — | NDJSON worker on stdin/stdout (used by backend jobs) |

Stop with `Ctrl-C`, wipe data with `docker compose down -v`.

## 3. Local development

Frontend (any static server):

```bash
python3 -m http.server 8080        # then open http://localhost:8080
```

Backend:

```bash
cd backend
pip install -r requirements.txt    # includes eclipse-sumo binaries
uvicorn app.main:app --reload --port 8000
```

The engine integration modules are plain ES modules — import them directly:

```js
import { SimBridge } from './sim-engine/integration/simBridge.js';
```

## 4. Wire the simulation into your page

```html
<div id="sim-controls"></div>   <!-- play/pause, speed, KPI cards -->
<div id="scenario-panel"></div> <!-- save/load/fork/diff scenarios -->
<div id="import-panel"></div>   <!-- OpenDRIVE / SUMO / GeoJSON import & export -->
<div id="calibration-panel"></div>
<div id="dashboard-panel"></div>
<div id="ringroad-map" style="height:480px"></div> <!-- Google Maps host -->
<canvas id="sim-canvas"></canvas>
```

```js
import { SimBridge } from './sim-engine/integration/simBridge.js';
import { initSimControls } from './sim-engine/integration/uiControls.js';
import { initScenarioPanel } from './sim-engine/integration/scenarioPanel.js';
import { initImportPanel } from './sim-engine/integration/importPanel.js';
import { initCalibrationPanel } from './sim-engine/integration/calibrationPanel.js';
import { initDashboardPanel } from './sim-engine/integration/dashboardPanel.js';

const bridge = new SimBridge({ googleMapsApiKey: 'YOUR_KEY' });
await bridge.initMap();

// Build a ring-road network from the bundled corridor presets,
// generate demand from the FLEET profiles, and start stepping:
await bridge.startSimulation();

initSimControls('sim-controls', bridge, { blackspots: window.BLACKSPOTS ?? [] });
const panel = initScenarioPanel('scenario-panel', bridge);
initImportPanel('import-panel', bridge);
initCalibrationPanel('calibration-panel', bridge);
initDashboardPanel('dashboard-panel', bridge);

// Persist / restore named scenarios (localStorage-backed):
bridge.saveScenario('Baseline AM peak');
panel.refresh();
```

### Playback controls

- **Play/Pause** – starts the engine on first press; toggles afterwards.
- **Speed slider** – 0.5× to 10× real time (manual stepping clock).
- **Reset** – back to `t=0` with an empty network.

## 5. Import an existing network

Open the import panel and pick a file:

- `.xodr` — OpenDRIVE
- `*.net.xml` — SUMO network
- `.geojson` — LineString features
- `.json` — engine-native dump

Press *Import & Preview* to inspect node/edge counts, then *Use in
Simulation* to make it active. Export buttons cover JSON, SUMO, OpenDRIVE,
GeoJSON and VISSIM `.inpx`.

## 6. Calibrate against field data

Prepare a CSV with two columns:

```csv
edgeId,observedFlow
e1,1450
e2,980
```

Upload it in the calibration panel and press **Run Calibration**. The grid
search scores each IDM parameter set by GEH; acceptance is
mean GEH < 5, ≥ 85 % of detectors under 5, R² ≥ 0.7. Press **Apply to Engine**
to use the winning `{v0, T, a, b}` on the next run.

## 7. Compare runs & export reports

- **Set Baseline** on the dashboard snapshots current KPIs.
- Rerun with different parameters → Δ% table flags better/worse metrics.
- **Export PDF** produces a full report (scenario info, KPI tables, charts)
  via jsPDF.

## 8. Backend API quick tour

```bash
# Register + login
curl -X POST http://localhost/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"secret123"}'

TOKEN=$(curl -s -X POST http://localhost/api/v1/auth/login \
  -d 'username=me@example.com&password=secret123' | jq -r .access_token)

# Upload a SUMO network
curl -X POST http://localhost/api/v1/networks/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F project_id=1 -F name="Ring road" -F format=sumo -F file=@network.net.xml

# Queue a background simulation for scenario 42
curl -X POST http://localhost/api/v1/simulations/run \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"scenario_id":42,"config":{"seed":7}}'
```

Full endpoint list: [`docs/api-reference.md`](api-reference.md).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Map area blank | Missing Google Maps key — bridge falls back to canvas rendering |
| `SUMO binary not found` | Install `eclipse-sumo` (`pip install eclipse-sumo`) or set `SUMO_HOME` |
| Play button does nothing | Check browser console; the engine needs at least 2 nodes / 1 edge |
| Calibration hangs on big grids | Reduce the grid via `opts.grid` when initialising the panel |
| Port 80 busy | Change the mapping in `docker-compose.yml` (e.g. `"8080:80"`) |
