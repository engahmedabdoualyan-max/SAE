"""Simulation endpoints: run, list, get, WebSocket stream, trajectories,
calibration and PDF report download."""

from __future__ import annotations

import asyncio
import logging
import math
import random
import shutil
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import CurrentUser
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.models.network import Network
from app.models.project import Project
from app.models.scenario import Scenario
from app.models.simulation import Simulation, SimulationStatus
from app.services import calibration as calibration_service
from app.services import report as report_service
from app.services.sumo_bridge import SUMOBridge, SUMOBridgeError

logger = logging.getLogger(__name__)

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]

TERMINAL_STATUSES = {SimulationStatus.COMPLETED, SimulationStatus.FAILED}


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class SimulationRunRequest(BaseModel):
    scenario_id: int
    config: dict[str, Any] = Field(default_factory=dict)


class SimulationSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scenario_id: int
    status: SimulationStatus
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None


class SimulationOut(SimulationSummaryOut):
    config: dict[str, Any]
    results: dict[str, Any] | None


class TrajectoryOut(BaseModel):
    simulation_id: int
    frame_count: int
    timesteps: Any


class FieldObservation(BaseModel):
    edge_id: str
    count: float = Field(ge=0)
    speed: float | None = None


class CalibrationRequest(BaseModel):
    field_data: list[FieldObservation] = Field(min_length=1)
    config: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Simulation engine helpers
# --------------------------------------------------------------------------- #


def _synthetic_run(
    network_data: dict[str, Any], params: dict[str, Any], config: dict[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Deterministic fallback microsimulation used when SUMO is unavailable."""
    rng = random.Random(int(config.get("seed", 42)))
    duration = float(config.get("duration", 600))
    step = max(0.5, float(config.get("step_length", 1.0)))
    record_every = max(1, int(config.get("record_interval", 5)))
    demand = params.get("demand") if isinstance(params.get("demand"), dict) else {}
    n_vehicles = int(config.get("vehicles") or (demand or {}).get("count") or 80)

    edges = network_data.get("edges") or []
    speeds = [float(e.get("speed", 13.89)) for e in edges if isinstance(e, Mapping)]
    base_speed = float(config.get("base_speed") or (sum(speeds) / len(speeds) if speeds else 13.89))
    idm = params.get("idm") if isinstance(params.get("idm"), dict) else {}
    desired_factor = float(idm.get("speed_factor", 1.0))

    vehicles = [
        {
            "id": f"veh{i}",
            "depart": rng.uniform(0.0, duration * 0.7),
            "edge_idx": rng.randrange(len(edges)) if edges else 0,
            "phase": rng.uniform(0, 2 * math.pi),
            "pos": 0.0,
        }
        for i in range(max(0, n_vehicles))
    ]

    timesteps: list[dict[str, Any]] = []
    edge_speeds: dict[str, list[float]] = {}
    edge_vehicles: dict[str, set[str]] = {}

    t = 0.0
    while t < duration:
        snapshot: list[dict[str, Any]] = []
        record_frame = int(t) % record_every == 0
        for veh in vehicles:
            if t < veh["depart"]:
                continue
            speed = max(
                1.0,
                base_speed
                * desired_factor
                * (0.85 + 0.15 * math.sin(t / 25.0 + veh["phase"]))
                * rng.uniform(0.95, 1.05),
            )
            veh["pos"] += speed * step
            edge_id = (
                str(edges[veh["edge_idx"]].get("id", veh["edge_idx"]))
                if edges
                else f"virtual-{veh['edge_idx']}"
            )
            edge_speeds.setdefault(edge_id, []).append(speed)
            edge_vehicles.setdefault(edge_id, set()).add(str(veh["id"]))
            if record_frame:
                snapshot.append(
                    {
                        "id": veh["id"],
                        "x": round(math.cos(t / 40.0) * veh["pos"], 2),
                        "y": round(math.sin(t / 40.0) * veh["pos"], 2),
                        "speed": round(speed, 3),
                        "pos": round(veh["pos"], 2),
                        "edge": edge_id,
                    }
                )
        if record_frame and snapshot:
            timesteps.append({"time": round(t, 2), "vehicles": snapshot})
        t += step
        if len(timesteps) > 2000:  # safety cap on stored frames
            break

    edge_stats = {
        edge: {
            "mean_speed": round(sum(vals) / len(vals), 3),
            "max_speed": round(max(vals), 3),
            "samples": len(vals),
            "unique_vehicles": len(edge_vehicles[edge]),
        }
        for edge, vals in edge_speeds.items()
    }
    return timesteps, edge_stats


def _compute_kpis(
    timesteps: list[dict[str, Any]],
    edge_stats: dict[str, dict[str, Any]],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    speeds: list[float] = []
    distance_by_vehicle: dict[str, float] = {}
    interval = 1.0
    if len(timesteps) >= 2:
        interval = max(0.01, timesteps[1]["time"] - timesteps[0]["time"])

    for frame in timesteps:
        for veh in frame["vehicles"]:
            speed = float(veh.get("speed", 0.0))
            speeds.append(speed)
            vid = str(veh.get("id"))
            distance_by_vehicle[vid] = distance_by_vehicle.get(vid, 0.0) + speed * interval

    per_edge = {
        edge: {
            "mean_speed_kmh": round(stats["mean_speed"] * 3.6, 2),
            "max_speed_kmh": round(stats.get("max_speed", 0.0) * 3.6, 2),
            "unique_vehicles": stats.get("unique_vehicles", 0),
            "samples": stats.get("samples", 0),
        }
        for edge, stats in sorted(edge_stats.items(), key=lambda kv: kv[1].get("samples", 0), reverse=True)[:20]
    }

    kpis: dict[str, Any] = {
        "vehicles_total": len(distance_by_vehicle),
        "avg_speed_kmh": round((sum(speeds) / len(speeds) * 3.6) if speeds else 0.0, 2),
        "max_speed_kmh": round((max(speeds) * 3.6) if speeds else 0.0, 2),
        "total_distance_km": round(sum(distance_by_vehicle.values()) / 1000.0, 3),
        "duration_s": timesteps[-1]["time"] if timesteps else 0.0,
        "recorded_frames": len(timesteps),
        "edges_monitored": len(edge_stats),
    }
    if extra:
        kpis.update(extra)
    kpis["per_edge"] = per_edge
    return kpis


def run_simulation_job(simulation_id: int) -> None:
    """Background worker: executes the simulation and stores KPIs/trajectories."""
    db = SessionLocal()
    try:
        simulation = db.get(Simulation, simulation_id)
        if simulation is None:
            logger.error("Simulation %s not found; skipping job", simulation_id)
            return

        simulation.status = SimulationStatus.RUNNING
        simulation.started_at = datetime.now(timezone.utc)
        db.commit()

        scenario = simulation.scenario
        network: Network | None = scenario.network if scenario is not None else None
        if network is None:
            raise RuntimeError("Scenario has no associated network")

        net_data = network.data or {}
        params = scenario.params or {}
        sim_config = simulation.config or {}
        merged_config: dict[str, Any] = {**(params.get("simulation") or {}), **sim_config}
        duration = float(merged_config.get("duration", 600))

        trip_summary: dict[str, Any] = {}
        engine_name = "builtin-fallback"
        fallback_reason: str | None = None
        if shutil.which("sumo"):
            bridge: SUMOBridge | None = None
            try:
                bridge = SUMOBridge(workdir=None)
                bridge.start()
                bridge.load_network(net_data)
                bridge.load_routes(params.get("demand") or {}, duration=duration, idm_params=params.get("idm"))
                bridge.run(begin=0.0, end=duration, step_length=float(merged_config.get("step_length", 1.0)))
                timesteps = bridge.get_vehicle_positions(force_refresh=True)
                edge_stats = bridge.get_edge_data()
                trip_summary = bridge.parse_tripinfo(bridge.tripinfo_path)
                engine_name = "sumo"
            except SUMOBridgeError as exc:
                logger.warning("SUMO run failed; falling back to builtin engine: %s", exc)
                fallback_reason = str(exc)
                timesteps, edge_stats = _synthetic_run(net_data, params, merged_config)
            finally:
                if bridge is not None:
                    try:
                        bridge.stop()
                    except Exception:  # noqa: BLE001 - teardown best effort
                        pass
        else:
            timesteps, edge_stats = _synthetic_run(net_data, params, merged_config)

        extra: dict[str, Any] = {"engine": engine_name}
        if fallback_reason:
            extra["fallback_reason"] = fallback_reason
        if trip_summary:
            extra.update(trip_summary)

        simulation.results = _compute_kpis(timesteps, edge_stats, extra)
        simulation.trajectory_data = {"timesteps": timesteps}
        simulation.status = SimulationStatus.COMPLETED
        simulation.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Simulation %s completed via %s", simulation_id, engine_name)

    except Exception as exc:  # noqa: BLE001 - background job must never crash silently
        logger.exception("Simulation %s failed", simulation_id)
        db.rollback()
        failed = db.get(Simulation, simulation_id)
        if failed is not None:
            failed.status = SimulationStatus.FAILED
            failed.error_message = f"{type(exc).__name__}: {exc}"
            failed.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _owned_sim_stmt(db: Session, current_user):
    """Simulation rows reachable through an owned project chain."""
    return (
        select(Simulation)
        .join(Scenario, Simulation.scenario_id == Scenario.id)
        .join(Network, Scenario.network_id == Network.id)
        .join(Project, Network.project_id == Project.id)
        .where(Project.user_id == current_user["id"])
    )


def _get_simulation(db: Session, current_user, simulation_id: int) -> Simulation:
    stmt = _owned_sim_stmt(db, current_user).where(Simulation.id == simulation_id)
    simulation = db.scalars(stmt).first()
    if simulation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation not found")
    return simulation


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post("/run", response_model=SimulationOut, status_code=status.HTTP_202_ACCEPTED)
def queue_simulation(
    payload: SimulationRunRequest,
    background_tasks: BackgroundTasks,
    db: DbSession,
    current_user: CurrentUser,
) -> Simulation:
    """Queue a simulation run for a scenario (executed in the background)."""
    owned = db.scalars(
        select(Scenario.id)
        .join(Network, Scenario.network_id == Network.id)
        .join(Project, Network.project_id == Project.id)
        .where(Scenario.id == payload.scenario_id,
               Project.user_id == current_user["id"])
    ).first()
    if owned is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    scenario = db.get(Scenario, payload.scenario_id)
    if scenario.network_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Scenario has no network attached")

    simulation = Simulation(
        scenario_id=payload.scenario_id,
        status=SimulationStatus.QUEUED,
        config=dict(payload.config),
    )
    db.add(simulation)
    db.commit()
    db.refresh(simulation)

    background_tasks.add_task(run_simulation_job, simulation.id)
    return simulation


@router.get("/", response_model=list[SimulationSummaryOut])
def list_simulations(
    db: DbSession, current_user: CurrentUser, scenario_id: int | None = None
) -> list[Simulation]:
    query = _owned_sim_stmt(db, current_user).order_by(Simulation.id.desc()).limit(200)
    if scenario_id is not None:
        query = query.where(Simulation.scenario_id == scenario_id)
    return list(db.scalars(query).all())


@router.get("/{simulation_id}", response_model=SimulationOut)
def get_simulation(simulation_id: int, db: DbSession, current_user: CurrentUser) -> Simulation:
    return _get_simulation(db, current_user, simulation_id)


@router.get("/{simulation_id}/trajectories", response_model=TrajectoryOut)
def get_trajectories(simulation_id: int, db: DbSession, current_user: CurrentUser) -> TrajectoryOut:
    simulation = _get_simulation(db, current_user, simulation_id)
    if simulation.status != SimulationStatus.COMPLETED or simulation.trajectory_data is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trajectories are not available until the simulation completes successfully",
        )
    timesteps = simulation.trajectory_data.get("timesteps") or []
    return TrajectoryOut(
        simulation_id=simulation.id,
        frame_count=len(timesteps),
        timesteps=timesteps,
    )


@router.websocket("/{simulation_id}/stream")
async def stream_simulation(websocket: WebSocket, simulation_id: int) -> None:
    """WebSocket pushing live status/progress frames until the run terminates."""
    await websocket.accept()
    try:
        while True:
            with SessionLocal() as db:
                simulation = db.get(Simulation, simulation_id)
                if simulation is None:
                    await websocket.send_json({"error": "not_found", "simulation_id": simulation_id})
                    await websocket.close(code=4404)
                    return

                status_value = (
                    simulation.status.value
                    if isinstance(simulation.status, SimulationStatus)
                    else str(simulation.status)
                )
                progress = 1.0 if status_value in ("completed", "failed") else 0.0
                if status_value == "running" and simulation.started_at is not None:
                    configured = float((simulation.config or {}).get("duration") or 600.0)
                    elapsed = (datetime.now(timezone.utc) - simulation.started_at.replace(tzinfo=timezone.utc)).total_seconds()
                    progress = min(0.95, elapsed / max(configured, 1.0))

                frame: dict[str, Any] = {
                    "id": simulation.id,
                    "status": status_value,
                    "progress": round(progress, 3),
                    "started_at": _iso(simulation.started_at),
                    "completed_at": _iso(simulation.completed_at),
                    "error_message": simulation.error_message,
                }
                if status_value in ("completed", "failed"):
                    frame["results"] = simulation.results
                await websocket.send_json(frame)
                terminal = status_value in ("completed", "failed")
            if terminal:
                await websocket.close(code=1000)
                return
            await asyncio.sleep(0.75)
    except WebSocketDisconnect:
        return
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("WebSocket stream for simulation %s ended: %s", simulation_id, exc)
        try:
            await websocket.close(code=1011)
        except Exception:  # noqa: BLE001
            pass


@router.post("/{simulation_id}/calibrate")
def calibrate_simulation(
    simulation_id: int, payload: CalibrationRequest, db: DbSession, current_user: CurrentUser
) -> dict[str, Any]:
    """Calibrate the simulated model against observed field counts."""
    simulation = _get_simulation(db, current_user, simulation_id)
    scenario = simulation.scenario
    network: Network | None = scenario.network if scenario is not None else None
    if network is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Scenario has no network")

    field_data = [
        {"edge_id": obs.edge_id, "count": obs.count, **({"speed": obs.speed} if obs.speed is not None else {})}
        for obs in payload.field_data
    ]
    try:
        result = calibration_service.calibrate(field_data, network.data or {}, payload.config)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    config = dict(simulation.config or {})
    history = list(config.get("calibration_history") or [])
    history.append({"at": datetime.now(timezone.utc).isoformat(), **result})
    config["calibration_history"] = history[-10:]
    simulation.config = config
    db.commit()
    return result


@router.get("/{simulation_id}/report")
def download_report(simulation_id: int, db: DbSession, current_user: CurrentUser) -> Response:
    """Generate and download the PDF report for this simulation."""
    simulation = _get_simulation(db, current_user, simulation_id)
    scenario = simulation.scenario
    network: Network | None = scenario.network if scenario is not None else None

    try:
        pdf_bytes = report_service.generate_pdf(
            simulation_results=simulation.results or {},
            scenario=scenario,
            network=network if network is not None else {},
        )
    except report_service.ReportGenerationError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc

    filename = f"simulation_{simulation.id}_report.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
