"""Smoke tests for the SAE AutoSim Hub API (run by CI and locally).

Covers: health probe, root info payload, OpenAPI surface size, and the
OAuth2 password-flow login with the seeded demo account.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app

API_PREFIX = "/api/v1"


def test_health_endpoint() -> None:
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert "version" in body


def test_root_endpoint() -> None:
    with TestClient(app) as client:
        resp = client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "SAE AutoSim Hub API"
        assert body["api_prefix"] == API_PREFIX


def test_openapi_has_at_least_10_paths() -> None:
    with TestClient(app) as client:
        resp = client.get(f"{API_PREFIX}/openapi.json")
        assert resp.status_code == 200
        paths = resp.json()["paths"]
        assert len(paths) >= 10, f"expected >=10 OpenAPI paths, got {len(paths)}: {sorted(paths)}"


def test_login_demo_user_returns_access_token() -> None:
    with TestClient(app) as client:
        # /auth/login uses OAuth2PasswordRequestForm => form-encoded, NOT JSON.
        resp = client.post(
            f"{API_PREFIX}/auth/login",
            data={"username": "demo@sae.local", "password": "demo1234"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["access_token"], "access_token must be non-empty"
        assert body["token_type"] == "bearer"

        # Token must authenticate /auth/me.
        me = client.get(
            f"{API_PREFIX}/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
        )
        assert me.status_code == 200, me.text
        assert me.json()["email"] == "demo@sae.local"


def test_login_rejects_bad_credentials() -> None:
    with TestClient(app) as client:
        resp = client.post(
            f"{API_PREFIX}/auth/login",
            data={"username": "demo@sae.local", "password": "wrong-password"},
        )
        assert resp.status_code == 401


def test_multi_tenant_isolation() -> None:
    with TestClient(app) as client:

        """User B must not see or touch user A's projects/networks/scenarios/runs."""
        import random

        suffix = random.randint(1000, 9999)

        def _login(email: str) -> dict:
            r = client.post(f"{API_PREFIX}/auth/login",
                            data={"username": email, "password": "pw123456"})
            assert r.status_code == 200, r.text
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

        def _register(email: str) -> None:
            r = client.post(f"{API_PREFIX}/auth/register",
                            json={"email": email, "name": "iso", "password": "pw123456"})
            assert r.status_code in (200, 201), r.text

        a_email = f"iso_a{suffix}@sae.test"
        b_email = f"iso_b{suffix}@sae.test"
        _register(a_email)
        _register(b_email)
        hdr_a = _login(a_email)
        hdr_b = _login(b_email)

        # A creates the full chain
        proj = client.post(f"{API_PREFIX}/projects/", json={"name": "A proj"},
                           headers=hdr_a).json()
        net_file = {
            "nodes": [{"id": "X", "lat": 30.0, "lng": 31.0, "type": "entry"},
                      {"id": "Y", "lat": 30.01, "lng": 31.01, "type": "exit"}],
            "edges": [{"id": "E1", "from": "X", "to": "Y", "lanes": 2,
                       "speedLimit": 20.0, "length": 900}],
        }
        r = client.post(
            f"{API_PREFIX}/networks/upload",
            data={"project_id": proj["id"], "name": "A net", "format": "json"},
            files={"file": ("net.json", json.dumps(net_file), "application/json")},
            headers=hdr_a,
        )
        assert r.status_code == 201, r.text
        net_id = r.json()["id"]

        scen = client.post(f"{API_PREFIX}/scenarios/",
                           json={"network_id": net_id, "name": "A scen", "params": {}},
                           headers=hdr_a).json()

        run = client.post(f"{API_PREFIX}/simulations/run",
                          json={"scenario_id": scen["id"], "config": {"duration": 60}},
                          headers=hdr_a)
        assert run.status_code == 202, run.text
        sim_id = run.json()["id"]

        # B's lists must be empty
        for path in (f"{API_PREFIX}/projects", f"{API_PREFIX}/networks",
                     f"{API_PREFIX}/scenarios", f"{API_PREFIX}/simulations"):
            r = client.get(path, headers=hdr_b)
            assert r.status_code == 200, path
            body = r.json()
            # paginated lists exclude A's resources entirely
            ids = [row["id"] for row in body]
            assert proj["id"] not in ids or path.endswith("projects"), path
            if path.endswith(("scenarios", "simulations")):
                assert all(row["id"] not in (scen["id"], sim_id) for row in body), path
            if path.endswith("networks"):
                assert net_id not in ids, path

        # B cannot read/touch A's single resources → 404 (no existence leak)
        for path in (f"{API_PREFIX}/networks/{net_id}",
                     f"{API_PREFIX}/scenarios/{scen['id']}",
                     f"{API_PREFIX}/simulations/{sim_id}",
                     f"{API_PREFIX}/simulations/{sim_id}/trajectories",
                     f"{API_PREFIX}/simulations/{sim_id}/report"):
            r = client.get(path, headers=hdr_b)
            assert r.status_code == 404, f"{path} → {r.status_code}"

        # B cannot fork/diff/delete A's scenario
        r = client.post(f"{API_PREFIX}/scenarios/{scen['id']}/fork",
                        json={"name": "steal"}, headers=hdr_b)
        assert r.status_code == 404, r.text

        # B cannot queue a run against A's scenario or network
        r = client.post(f"{API_PREFIX}/simulations/run",
                        json={"scenario_id": scen["id"], "config": {}}, headers=hdr_b)
        assert r.status_code == 404, r.text
        r = client.post(f"{API_PREFIX}/scenarios/",
                        json={"network_id": net_id, "name": "attach theft", "params": {}},
                        headers=hdr_b)
        assert r.status_code == 404, r.text


def test_scenario_create_rejects_foreign_network() -> None:
    with TestClient(app) as client:
        """Creation guard: network_id must belong to the caller."""
        import random
        suffix = random.randint(1000, 9999)

        def _setup(email):
            client.post(f"{API_PREFIX}/auth/register",
                        json={"email": email, "name": "x", "password": "pw123456"})
            r = client.post(f"{API_PREFIX}/auth/login",
                            data={"username": email, "password": "pw123456"})
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

        hdr_a = _setup(f"own_a{suffix}@sae.test")
        hdr_b = _setup(f"own_b{suffix}@sae.test")

        proj = client.post(f"{API_PREFIX}/projects/", json={"name": "p"},
                           headers=hdr_a).json()
        net_file = {"nodes": [{"id": "N1", "lat": 30.0, "lng": 31.0, "type": "entry"}],
                    "edges": []}
        net = client.post(f"{API_PREFIX}/networks/upload",
                          data={"project_id": proj["id"], "name": "n", "format": "json"},
                          files={"file": ("n.json", json.dumps(net_file), "application/json")},
                          headers=hdr_a).json()

        r = client.post(f"{API_PREFIX}/scenarios/",
                        json={"network_id": net["id"], "name": "b tries", "params": {}},
                        headers=hdr_b)
        assert r.status_code == 404, r.text
