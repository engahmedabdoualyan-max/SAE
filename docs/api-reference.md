# SAE AutoSim Hub — API Reference

Base URL: `http://localhost/api/v1` (through the nginx frontend) or
`http://localhost:8000/api/v1` (direct to the backend container).

Interactive docs: `/docs` (Swagger UI) and `/redoc` on the backend origin.
All timestamps are ISO-8601 UTC.

---

## Authentication

OAuth2 **password flow**. Obtain a token, then send it as
`Authorization: Bearer <token>` (or let Swagger's "Authorize" button do it).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create an account → `201 UserOut` |
| POST | `/auth/login` | — | Exchange credentials for a JWT |
| GET | `/auth/me` | Bearer | Current user profile |

### POST /auth/login

`application/x-www-form-urlencoded` (**not** JSON):

```
username=user@example.com&password=secret123
```

**200**
```json
{ "access_token": "eyJhbGciOi...", "token_type": "bearer" }
```

**401** `{"detail": "Incorrect email or password"}`

---

## Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/` | List projects |
| POST | `/projects/` | Create project → `201` |
| GET | `/projects/{id}` | Fetch one project |
| PUT | `/projects/{id}` | Update project |
| DELETE | `/projects/{id}` | Delete project → `204` |

All require a Bearer token; 404 when the project does not exist or belongs to
another user.

---

## Networks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/networks/upload` | Upload + parse a network file → `201 NetworkOut` |
| GET | `/networks/?project_id={id}` | List networks (optionally per project) |
| GET | `/networks/{id}` | Full network JSON (`nodes`, `edges`) |
| DELETE | `/networks/{id}` | Delete network → `204` |
| POST | `/networks/import/opendrive` | Parse-only preview (not persisted) |

### POST /networks/upload

`multipart/form-data`:

| Field | Type | Notes |
|-------|------|-------|
| `project_id` | int | Owning project |
| `name` | string | 1–255 chars |
| `format` | string | One of `json`, `opendrive`, `sumo`, `osm` |
| `file` | file | Raw UTF-8 text, **max 10 MB** |

Errors: `400` non-UTF-8 content · `404` unknown project ·
`413` file larger than 10 MB.

The stored network uses the engine JSON shape consumed by
`sim-engine/network/graph.js`:

```json
{
  "nodes": [{ "id": "n1", "lat": 30.0444, "lng": 31.2357, "type": "signal" }],
  "edges": [{ "id": "e1", "from": "n1", "to": "n2",
              "lanes": 3, "speedLimit": 27.78 }]
}
```

---

## Scenarios

A scenario pins a named configuration to a network version.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scenarios/` | Create scenario → `201` |
| GET | `/scenarios/` | List scenarios |
| GET | `/scenarios/{id}` | Fetch scenario |
| PUT | `/scenarios/{id}` | Update scenario |
| POST | `/scenarios/{id}/fork` | Fork → `201` new scenario |
| POST | `/scenarios/{id}/diff/{other_id}` | Structural diff of two scenarios |

---

## Simulations

Runs execute asynchronously in a background task.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/simulations/run` | Queue a run → **202** `SimulationOut` |
| GET | `/simulations/` | List simulations |
| GET | `/simulations/{id}` | Poll status/result |
| GET | `/simulations/{id}/trajectories` | Vehicle trajectory dump |
| WS | `/simulations/{id}/stream` | Live status/progress frames until terminal state |

### POST /simulations/run

```json
{ "scenario_id": 42, "config": { "seed": 7, "duration": 3600 } }
```

**202** — body is the queued simulation:
```json
{ "id": 101, "scenario_id": 42, "status": "queued", ... }
```

`status` transitions: `queued → running → completed | failed`.
`404` unknown scenario · `409` scenario has no network attached.

### WS /simulations/{id}/stream

Connect with any WebSocket client; the server pushes one JSON frame per status
change and closes with code `4404` if the simulation id is unknown.

```js
const ws = new WebSocket("ws://localhost/api/v1/simulations/101/stream");
ws.onmessage = (ev) => console.log(JSON.parse(ev.data)); // {status:"running",progress:0.4,...}
```

---

## SUMO worker (internal)

Not an HTTP API — the compose `sumo` service runs
`python -m app.services.sumo_bridge --worker`, an NDJSON loop over stdin/stdout.
Request frames:

```json
{"action": "ping"}
{"action": "run", "payload": {"network": {"nodes": [], "edges": []},
                              "demand": {"flows": []},
                              "config": {"begin": 0, "end": 600, "stepLength": 1.0}}}
{"action": "shutdown"}
```

Responses: `{"ok": true, "timesteps": N, "tripinfo": {...}, "edge_data": {...}}`
or `{"ok": false, "error": "..."}`.

Single-run alternative:
`python -m app.services.sumo_bridge --network net.json --demand demand.json --end 600`.

Requires `sumo` and `netconvert` on PATH — provided in the image by the
`eclipse-sumo` pip package.

---

## Error model & limits

- Errors follow FastAPI convention: `{"detail": "<message>"}`.
- Common codes: `401` missing/expired token · `404` not found ·
  `409` conflict (duplicate name, run without network) · `413` payload > 10 MB ·
  `422` schema validation failure.
- **Rate limiting**: none inside FastAPI. nginx applies `limit_req`
  (30 req/s per IP, burst 60) to `/api/`; tune in `nginx.conf`.

## Client-side integration layer

The browser-side engine bridge lives at `sim-engine/integration/simBridge.js`
(see `docs/getting-started.md`). It talks to Google Maps/canvas directly and to
the backend only through the endpoints above.
