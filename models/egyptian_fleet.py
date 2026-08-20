"""
Egyptian Conventional Fleet — SAE Level 0 baseline.

All values are calibrated for Cairo Ring Road traffic conditions
based on field observations and literature review (Ahmed et al. 2023;
El-Baset et al. 2022; SAE J3216 Level Classification).

Behavioral characteristics of Egyptian driving (Level 0):
  - Aggressive acceleration / late, hard braking
  - Short reaction times but poor gap judgment
  - Frequent unsignalled lane changes (no yielding)
  - Zero lateral headway / aggressive cut-ins
  - High variability (sigma ≈ 0.8–1.0)
  - Frequent unplanned stops (microbus dwell time)
"""

from models.calibration import (
    VehicleProfile,
    Dimensions,
    CarFollowing,
    LaneChanging,
    DwellTime,
    VehicleType,
    compute_gap_acceptance,
    safe_distance_wiedemann,
)

import math

# ──────────────────────────────────────────────────────────────
# Egyptian Microbus (SAE Level 0 — Aggressive Baseline)
# ──────────────────────────────────────────────────────────────

def _build_microbus(reaction_time: float = 0.7,
                    safety_factor: float = 0.35,
                    max_accel: float = 3.0,
                    decel: float = 6.0,
                    sigma: float = 0.95) -> VehicleProfile:
    """
    Factory for an Egyptian microbus profile with overridable parameters
    (used by the web app sliders).
    """
    cf = CarFollowing(
        max_accel=max_accel,            # High acceleration (aggressive start)
        comfortable_decel=decel,         # Hard comfortable braking
        decisive_decel=decel * 1.8,      # Emergency braking
        reaction_time=reaction_time,     # Short reaction time
        min_spacing=1.2,                 # Very close bumper-to-bumper
        standstill_accel=2.8,            # Quick start from standstill
        multiplicative_safety=safety_factor,  # Low safety margin
        sigma=sigma,                    # Highly erratic / unpredictable
        desired_speed=80 * 1000 / 3600,   # ~22.2 m/s (common Ring Road speed)
    )

    lc = LaneChanging(
        probability=95.0,                # Very aggressive lane changes
        right_threshold=12.0,            # Force right-lane changes easily
        gap_detection_time=0.5,          # Short lookahead
        slowdown_prob=0.6,               # Often slows unpredictably
        brake_prob=0.8,                  # Frequent hard braking
        brake_at_standstill_prob=0.95,   # Likely to brake at standstill
        standstill_duration=25.0,        # Mean dwell time ~25 s
        min_change_dist=1.5,             # Can change lanes in tight gaps
    )

    g = cf  # shorthand
    ga = compute_gap_acceptance(g, g.desired_speed)

    dwell = DwellTime(
        mean_duration=25.0,
        std_dev=12.0,
        stop_frequency=0.4,              # ~0.4 stops per km
        distribution="exponential",
    )

    return VehicleProfile(
        name="Egyptian Microbus",
        sae_level=0,
        vehicle_type=VehicleType.MICROBUS,
        dimensions=Dimensions(length=6.2, width=2.0),
        car_following=g,
        lane_changing=lc,
        dwell=dwell,
        night_dominant=False,
        color="#FF6B21",  # Orange-red
    )


def _build_mlaijy(reaction_time: float = 0.85,
                  safety_factor: float = 0.45,
                  max_accel: float = 2.4,
                  decel: float = 5.0,
                  sigma: float = 0.85) -> VehicleProfile:
    """
    Factory for an Egyptian passenger car (Mlaiky) profile.
    """
    cf = CarFollowing(
        max_accel=max_accel,
        comfortable_decel=decel,
        decisive_decel=decel * 1.6,
        reaction_time=reaction_time,
        min_spacing=1.8,                 # Reduced safety distance
        standstill_accel=2.0,
        multiplicative_safety=safety_factor,  # Low safety margin
        sigma=sigma,
        desired_speed=90 * 1000 / 3600,   # ~25 m/s
    )

    lc = LaneChanging(
        probability=75.0,
        right_threshold=10.0,
        gap_detection_time=0.7,
        slowdown_prob=0.35,
        brake_prob=0.6,
        brake_at_standstill_prob=0.7,
        standstill_duration=5.0,         # Shorter stops
        min_change_dist=2.0,
    )

    ga = compute_gap_acceptance(cf, cf.desired_speed)

    return VehicleProfile(
        name="Mlaiky (Passenger Car)",
        sae_level=0,
        vehicle_type=VehicleType.MLAIKY,
        dimensions=Dimensions(length=4.4, width=1.8),
        car_following=cf,
        lane_changing=lc,
        dwell=None,
        night_dominant=False,
        color="#00AAFF",  # Blue
    )


def _build_naql(reaction_time: float = 1.3,
                safety_factor: float = 0.55,
                max_accel: float = 0.9,   # Low power-to-weight ratio
                decel: float = 4.5,
                sigma: float = 0.75) -> VehicleProfile:
    """
    Factory for an Egyptian heavy truck / semi-trailer (Naql) profile.

    Naql characteristics:
      - Low acceleration due to high mass
      - Long braking distances
      - Dominates slower lanes, especially at night
    """
    cf = CarFollowing(
        max_accel=max_accel,
        comfortable_decel=decel,
        decisive_decel=decel * 1.4,
        reaction_time=reaction_time,     # Slower reaction (fatigue)
        min_spacing=3.0,                 # Long nose = large gap
        standstill_accel=0.8,            # Slow start under load
        multiplicative_safety=safety_factor,
        sigma=sigma,
        desired_speed=70 * 1000 / 3600,   # ~19.4 m/s (lower speed limit)
    )

    lc = LaneChanging(
        probability=40.0,                # Rare lane changes (heavy vehicle)
        right_threshold=8.0,
        gap_detection_time=1.5,          # Long lookahead (slow vehicle)
        slowdown_prob=0.2,
        brake_prob=0.85,                # Must brake early and hard
        brake_at_standstill_prob=0.8,
        standstill_duration=8.0,
        min_change_dist=4.0,             # Large gap needed
    )

    ga = compute_gap_acceptance(cf, cf.desired_speed)

    return VehicleProfile(
        name="Naql (Heavy Truck)",
        sae_level=0,
        vehicle_type=VehicleType.NAQL,
        dimensions=Dimensions(length=10.5, width=2.5),
        car_following=cf,
        lane_changing=lc,
        dwell=None,
        night_dominant=True,             # Dominates nighttime traffic
        color="#8B4513",  # Saddle brown
    )


# ──────────────────────────────────────────────────────────────
# Pre-calibrated fleet instances (default Ring Road values)
# ──────────────────────────────────────────────────────────────

EGYPTIAN_MICROBUS = _build_microbus()
EGYPTIAN_MLAIKY = _build_mlaijy()
EGYPTIAN_NAQL = _build_naql()

# Default Egyptian fleet proportions (based on Ring Road traffic counts)
# Source: Cairo Ring Road traffic study (2023)
EGYPTIAN_FLEET = [
    (EGYPTIAN_MICROBUS, 0.25),   # 25 % microbuses
    (EGYPTIAN_MLAIKY,  0.60),    # 60 % passenger cars
    (EGYPTIAN_NAQL,    0.15),    # 15 % heavy trucks
]

# Convenience: mapping by short key
EGYPTIAN_FLEET_MAP = {
    "microbus": EGYPTIAN_MICROBUS,
    "mlaijy":   EGYPTIAN_MLAIKY,
    "naql":     EGYPTIAN_NAQL,
}


def get_egyptian_fleet(selected: dict) -> list:
    """
    Return the subset of the Egyptian fleet based on user toggles.

    Parameters
    ----------
    selected : dict with keys 'microbus', 'mlaijy', 'naql' → bool
    """
    fleet = []
    if selected.get("microbus", True):
        fleet.append(EGYPTIAN_MICROBUS)
    if selected.get("mlaijy", True):
        fleet.append(EGYPTIAN_MLAIKY)
    if selected.get("naql", True):
        fleet.append(EGYPTIAN_NAQL)
    return fleet
