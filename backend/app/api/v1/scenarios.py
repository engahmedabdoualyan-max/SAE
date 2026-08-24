"""Scenarios CRUD + fork/diff endpoints."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import CurrentUser
from app.core.database import get_db
from app.models.network import Network
from app.models.scenario import Scenario

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


class ScenarioCreate(BaseModel):
    network_id: int
    name: str = Field(min_length=1, max_length=255)
    params: dict[str, Any] = Field(default_factory=dict)


class ScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    params: dict[str, Any] | None = None


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    network_id: int
    name: str
    params: dict[str, Any]
    parent_id: int | None
    version: int
    created_at: object


class ForkRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class DiffResult(BaseModel):
    added: dict[str, Any]
    removed: dict[str, Any]
    changed: dict[str, dict[str, Any]]
    unchanged_count: int
    are_identical: bool


def _flatten(mapping: Mapping[str, Any], prefix: str = "") -> dict[str, Any]:
    flat: dict[str, Any] = {}
    for key, value in mapping.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, Mapping):
            flat.update(_flatten(value, path))
        else:
            flat[path] = value
    return flat


def _get_scenario(db: Session, scenario_id: int) -> Scenario:
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    return scenario


@router.post("/", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(payload: ScenarioCreate, db: DbSession, current_user: CurrentUser) -> Scenario:
    network = db.get(Network, payload.network_id)
    if network is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found")

    scenario = Scenario(
        network_id=payload.network_id,
        name=payload.name.strip(),
        params=deepcopy(payload.params),
        version=1,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.get("/", response_model=list[ScenarioOut])
def list_scenarios(db: DbSession, current_user: CurrentUser, network_id: int | None = None):
    stmt = select(Scenario).order_by(Scenario.id.desc())
    if network_id is not None:
        stmt = stmt.where(Scenario.network_id == network_id)
    return list(db.scalars(stmt).all())


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(scenario_id: int, db: DbSession, current_user: CurrentUser) -> Scenario:
    return _get_scenario(db, scenario_id)


@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int, payload: ScenarioUpdate, db: DbSession, current_user: CurrentUser
) -> Scenario:
    scenario = _get_scenario(db, scenario_id)
    if payload.name is not None:
        scenario.name = payload.name.strip()
    if payload.params is not None:
        scenario.params = deepcopy(payload.params)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.post("/{scenario_id}/fork", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def fork_scenario(
    scenario_id: int, db: DbSession, current_user: CurrentUser, payload: ForkRequest | None = None
) -> Scenario:
    source = _get_scenario(db, scenario_id)
    forked = Scenario(
        network_id=source.network_id,
        name=(payload.name if payload and payload.name else f"{source.name} (fork)").strip(),
        params=deepcopy(source.params),
        parent_id=source.id,
        version=source.version + 1,
    )
    db.add(forked)
    db.commit()
    db.refresh(forked)
    return forked


@router.post("/{scenario_id}/diff/{other_id}", response_model=DiffResult)
def diff_scenarios(
    scenario_id: int, other_id: int, db: DbSession, current_user: CurrentUser
) -> DiffResult:
    base = _flatten(_get_scenario(db, scenario_id).params or {})
    other = _flatten(_get_scenario(db, other_id).params or {})

    added = {k: v for k, v in other.items() if k not in base}
    removed = {k: v for k, v in base.items() if k not in other}
    changed = {
        k: {"from": base[k], "to": other[k]}
        for k in base.keys() & other.keys()
        if base[k] != other[k]
    }
    unchanged = sum(1 for k in base.keys() & other.keys() if base[k] == other[k])

    return DiffResult(
        added=added,
        removed=removed,
        changed=changed,
        unchanged_count=unchanged,
        are_identical=not (added or removed or changed),
    )
