"""Simulation ORM model (run status, config, KPI results, trajectories)."""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SimulationStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Simulation(Base):
    __tablename__ = "simulations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[SimulationStatus] = mapped_column(
        Enum(
            SimulationStatus,
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=SimulationStatus.QUEUED,
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    # Aggregated KPIs (avg speed, throughput, GEH after calibration, ...)
    results: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Vehicle trajectories: {"timesteps": [{"time": ..., "vehicles": [...]}]}
    trajectory_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    scenario = relationship("Scenario", back_populates="simulations")

    @property
    def is_terminal(self) -> bool:
        return self.status in (SimulationStatus.COMPLETED, SimulationStatus.FAILED)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Simulation id={self.id} status={self.status.value}>"
