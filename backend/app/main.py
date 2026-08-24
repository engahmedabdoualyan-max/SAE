"""SAE AutoSim Hub — FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _seed_demo_user() -> None:
    """Mirror the in-memory demo user into the users table (keeps FKs valid)."""
    from app.api.v1.auth import FAKE_USERS_DB, pwd_context  # local import avoids cycles
    from app.models.user import User

    with SessionLocal() as db:
        for email, info in FAKE_USERS_DB.items():
            existing = db.query(User).filter(User.email == email).first()
            if existing is not None:
                continue
            db.add(
                User(
                    email=email,
                    name=info["name"],
                    hashed_password=pwd_context.hash("demo1234"),
                    is_active=True,
                )
            )
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting SAE AutoSim Hub API (database: %s)", settings.DATABASE_URL.split("@")[-1])
    init_db()
    _seed_demo_user()
    yield


app = FastAPI(
    title="SAE AutoSim Hub API",
    description=(
        "Traffic microsimulation hub: networks (JSON / OpenDRIVE / SUMO / OSM), "
        "scenario management forking, SUMO-powered simulations, calibration and PDF reporting."
    ),
    version="1.0.0",
    lifespan=lifespan,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — wide open for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/", tags=["root"])
def root() -> dict[str, object]:
    """Basic API information."""
    return {
        "name": app.title,
        "version": app.version,
        "description": "SAE AutoSim Hub backend",
        "docs": "/docs",
        "openapi": f"{settings.API_V1_PREFIX}/openapi.json",
        "api_prefix": settings.API_V1_PREFIX,
        "endpoints": [
            f"{settings.API_V1_PREFIX}/auth",
            f"{settings.API_V1_PREFIX}/projects",
            f"{settings.API_V1_PREFIX}/networks",
            f"{settings.API_V1_PREFIX}/scenarios",
            f"{settings.API_V1_PREFIX}/simulations",
            "/health",
        ],
    }
