"""SQLAlchemy engine, session factory, declarative base and DB dependency."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def _build_engine(url: str):
    if url.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        # StaticPool: one shared connection so every thread (uvicorn workers,
        # TestClient portals) sees the same schema — critical for :memory:.
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            pool_pre_ping=True,
        )
    return create_engine(url, pool_pre_ping=True)


engine = _build_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base class for all ORM models."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a database session (always closed)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Imported lazily to avoid circular imports."""
    from app.models import network, project, scenario, simulation, user  # noqa: F401

    Base.metadata.create_all(bind=engine)
