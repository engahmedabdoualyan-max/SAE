"""Main API v1 router aggregating all resource routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, networks, projects, scenarios, simulations

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(networks.router, prefix="/networks", tags=["networks"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(simulations.router, prefix="/simulations", tags=["simulations"])
