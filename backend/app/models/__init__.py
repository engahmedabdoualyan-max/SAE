"""SQLAlchemy models.

Importing every model module here guarantees that all mappers (including
string-based relationships such as Project.owner -> "User") are registered
before any query runs, regardless of which router a caller touches first.
"""

from app.models.user import User  # noqa: F401
from app.models.project import Project  # noqa: F401
from app.models.network import Network  # noqa: F401
from app.models.scenario import Scenario  # noqa: F401
from app.models.simulation import Simulation, SimulationStatus  # noqa: F401

__all__ = [
    "User",
    "Project",
    "Network",
    "Scenario",
    "Simulation",
    "SimulationStatus",
]
