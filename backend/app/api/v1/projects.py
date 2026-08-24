"""Projects CRUD endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import CurrentUser
from app.core.database import get_db
from app.models.project import Project

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


def _get_owned_project(db: Session, current_user: dict[str, Any], project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("/", response_model=list[ProjectOut])
def list_projects(db: DbSession, current_user: CurrentUser) -> list[Project]:
    stmt = select(Project).where(Project.user_id == current_user["id"]).order_by(Project.id.desc())
    return list(db.scalars(stmt).all())


@router.post("/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: DbSession, current_user: CurrentUser) -> Project:
    project = Project(
        name=payload.name.strip(),
        description=payload.description,
        user_id=current_user["id"],
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: DbSession, current_user: CurrentUser) -> Project:
    return _get_owned_project(db, current_user, project_id)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int, payload: ProjectUpdate, db: DbSession, current_user: CurrentUser
) -> Project:
    project = _get_owned_project(db, current_user, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: DbSession, current_user: CurrentUser) -> None:
    project = _get_owned_project(db, current_user, project_id)
    db.delete(project)
    db.commit()
