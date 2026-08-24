"""Network ORM model (road network graph in a JSON-friendly format)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Network(Base):
    __tablename__ = "networks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # One of: json | opendrive | sumo | osm
    format: Mapped[str] = mapped_column(String(32), nullable=False, default="json")
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    # Bounding box as "minx,miny,maxx,maxy"
    bounds: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    project = relationship("Project", back_populates="networks")
    scenarios = relationship("Scenario", back_populates="network", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Network id={self.id} name={self.name!r} format={self.format!r}>"
