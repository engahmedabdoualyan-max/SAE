"""Smoke tests for the SAE AutoSim Hub API (run by CI and locally).

Covers: health probe, root info payload, OpenAPI surface size, and the
OAuth2 password-flow login with the seeded demo account.
"""

from __future__ import annotations

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
