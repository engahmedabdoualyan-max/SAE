"""Scenario ORM model (parameter set attached to a network, forkable)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    network_id: Mapped[int] = mapped_column(
        ForeignKey("networks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # IDM parameters, demand definition, signal timings, ...
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True, index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    network = relationship("Network", back_populates="scenarios")
    simulations = relationship("Simulation", back_populates="scenario", cascade="all, delete-orphan")

    # Self-referential relationship for scenario forking
    parent = relationship("Scenario", remote_side=[id], back_populates="children")
    children = relationship("Scenario", back_populates="parent", lazy="selectin")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Scenario id={self.id} name={self.name!r} v{self.version}>"
