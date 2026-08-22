"""
Autonomous Vehicle Fleet — SAE Levels 1 through 5.

Covers the spectrum from partial automation (L1/L2) to full automation
with CACC platooning (L4/L5).

Behavioral characteristics:
  L1–2: ACC + rigid lane-keeping, human-like reaction (~1.0–1.2 s)
  L3:   Conditional automation, hands-off but cautious
  L4–5: Full automation, CACC/V2X, near-zero gaps with platoon,
        defensive when cut off by Level-0 vehicles
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
# SAE Level 1-2: Partial Automation (ACC + Lane Keeping)
# ──────────────────────────────────────────────────────────────

def _build_av_l1_2(
    reaction_time: float = 1.1,
    safety_factor: float = 0.75,
    max_accel: float = 1.8,
    decel: float = 3.2,
    sigma: float = 0.15) -> VehicleProfile:
    """
    SAE Level 1-2: Adaptive Cruise Control + rigid lane keeping.

    - Reaction time: 1.0–1.2 s (human-like, slightly faster than avg. human)
    - Conservative gaps (high safety factor)
    - Smooth acceleration / deceleration for passenger comfort
    - Stable lane keeping but not aggressive
    """
    cf = CarFollowing(
        max_accel=max_accel,              # Smooth, comfortable acceleration
        comfortable_decel=decel,            # Comfortable, early braking
        decisive_decel=decel * 1.4,         # Emergency brake available
        reaction_time=reaction_time,       # Slightly faster than human avg.
        min_spacing=2.5,                    # Conservative standstill gap
        standstill_accel=1.6,
        multiplicative_safety=safety_factor,  # High safety margin
        sigma=sigma,                        # Low randomness (automated)
        desired_speed=85 * 1000 / 3600,     # ~23.6 m/s
    )

    lc = LaneChanging(
        probability=50.0,                  # Cautious lane changes
        right_threshold=6.0,               # Moderate right-lane forcing
        gap_detection_time=2.0,            # Good lookahead (sensors)
        slowdown_prob=0.1,                 # Rare unplanned slowdown
        brake_prob=0.3,
        brake_at_standstill_prob=0.4,
        standstill_duration=5.0,
        min_change_dist=3.0,
    )

    return VehicleProfile(
        name="AV SAE Level 1-2 (ACC)",
        sae_level=2,
        vehicle_type=VehicleType.AV_L1_2,
        dimensions=Dimensions(length=4.8, width=1.9),
        car_following=cf,
        lane_changing=lc,
        dwell=None,
        night_dominant=False,
        color="#FFD700",  # Gold
    )


# ──────────────────────────────────────────────────────────────
# SAE Level 3: Conditional Automation
# ──────────────────────────────────────────────────────────────

def _build_av_l3(
    reaction_time: float = 0.8,
    safety_factor: float = 0.85,
    max_accel: float = 1.5,
    decel: float = 3.0,
    sigma: float = 0.10) -> VehicleProfile:
    """
    SAE Level 3: Conditional automation.

    - Very cautious, large gaps
    - Quick reaction when takeover required
    - Minimal driver imperfection
    """
    cf = CarFollowing(
        max_accel=max_accel,
        comfortable_decel=decel,
        decisive_decel=decel * 1.5,
        reaction_time=reaction_time,
        min_spacing=3.0,
        standstill_accel=1.4,
        multiplicative_safety=safety_factor,
        sigma=sigma,
        desired_speed=85 * 1000 / 3600,
    )

    lc = LaneChanging(
        probability=40.0,
        right_threshold=4.0,
        gap_detection_time=2.5,
        slowdown_prob=0.05,
        brake_prob=0.15,
        brake_at_standstill_prob=0.2,
        standstill_duration=3.0,
        min_change_dist=3.5,
    )

    return VehicleProfile(
        name="AV SAE Level 3 (Conditional)",
        sae_level=3,
        vehicle_type=VehicleType.AV_L3,
        dimensions=Dimensions(length=4.8, width=1.9),
        car_following=cf,
        lane_changing=lc,
        dwell=None,
        night_dominant=False,
        color="#9370DB",  # Purple
    )


# ──────────────────────────────────────────────────────────────
# SAE Level 4-5: Full Automation with CACC / V2X Platooning
# ──────────────────────────────────────────────────────────────

def _build_av_l4_5(
    reaction_time: float = 0.35,    # CACC reaction — near-instantaneous
    safety_factor: float = 0.95,     # Very high safety margin
    max_accel: float = 2.2,          # Smooth but responsive
    decel: float = 3.5,              # Comfortable braking
    sigma: float = 0.01,            # Near-perfect
    cacc_headway: float = 0.3,      # seconds (V2X / CACC)
    defensive_factor: float = 3.0) -> VehicleProfile:
    """
    SAE Level 4-5: Full automation with CACC platooning.

    CACC (Cooperative Adaptive Cruise Control) uses V2X communication
    to achieve near-zero safety gaps:

        gap = v * T_cacc + offset
        T_cacc ≈ 0.2–0.5 s   (vs. human T ≈ 1.0–1.5 s)

    Defensive mode: when a Level-0 vehicle (e.g. Egyptian microbus)
    cuts in abruptly, the AV increases its safety factor and reaction
    time dynamically (defensive_factor multiplier).

    The Wiedemann 99 safe-distance formula becomes:

        d_safe = CC0 + v * T_cacc * safety
                 + [v² / (2·√(CC5·CC6))] * safety

    With T_cacc = 0.3 s and safety = 0.95, the gap is dramatically
    smaller than for human drivers but the safety margin is higher
    due to perfect reaction and braking capability.
    """
    cf = CarFollowing(
        max_accel=max_accel,
        comfortable_decel=decel,
        decisive_decel=decel * 1.3,
        reaction_time=reaction_time,       # CACC time
        min_spacing=1.0,                   # Near-zero static gap
        standstill_accel=2.0,
        multiplicative_safety=safety_factor,
        sigma=sigma,
        desired_speed=95 * 1000 / 3600,     # ~26.4 m/s
    )

    lc = LaneChanging(
        probability=90.0,                  # Efficient, proactive
        right_threshold=3.0,
        gap_detection_time=0.5,            # Fast sensor fusion
        slowdown_prob=0.0,
        brake_prob=0.05,
        brake_at_standstill_prob=0.1,
        standstill_duration=2.0,
        min_change_dist=1.0,               # Can change in tight spaces
    )

    profile = VehicleProfile(
        name="AV SAE Level 4-5 (CACC / V2X)",
        sae_level=5,
        vehicle_type=VehicleType.AV_L4_5,
        dimensions=Dimensions(length=4.9, width=1.9),
        car_following=cf,
        lane_changing=lc,
        dwell=None,
        night_dominant=False,
        color="#00FF7F",  # Spring green
    )

    # Attach extra CACC / defensive attributes for the API script generator
    profile.cacc_headway = cacc_headway           # type: ignore[attr-defined]
    profile.defensive_factor = defensive_factor   # type: ignore[attr-defined]

    return profile


# ──────────────────────────────────────────────────────────────
# Pre-calibrated AV fleet instances
# ──────────────────────────────────────────────────────────────

AV_LEVEL_1_2 = _build_av_l1_2()
AV_LEVEL_3 = _build_av_l3()
AV_LEVEL_4_5 = _build_av_l4_5()

# Default AV fleet (mixed levels 2 and 4-5)
AV_FLEET = [
    (AV_LEVEL_1_2, 0.5),   # 50 % L1-2 (transition fleet)
    (AV_LEVEL_4_5, 0.5),   # 50 % L4-5 (future fleet)
]

AV_FLEET_MAP = {
    "l1_2": AV_LEVEL_1_2,
    "l3":   AV_LEVEL_3,
    "l4_5": AV_LEVEL_4_5,
}


def get_av_fleet(av_mpr: float, av_level: str = "l4_5") -> list:
    """
    Return AV profiles for the given market penetration rate.

    Parameters
    ----------
    av_mpr : float   — proportion of AVs (0.0–1.0)
    av_level : str   — which AV level to use ('l1_2', 'l3', 'l4_5')
    """
    if av_mpr <= 0.0:
        return []

    av_map = AV_FLEET_MAP
    selected_av = av_map.get(av_level, AV_LEVEL_4_5)

    # If MPR > 50%, mix L1-2 and L4-5 to represent mixed automation fleet
    if av_level == "l4_5" and av_mpr > 0.5:
        l12_share = (1.0 - av_mpr) * 0.5 / 0.5  # portion that's still L1-2
        return [
            (AV_LEVEL_1_2, l12_share),
            (AV_LEVEL_4_5, 1.0 - l12_share),
        ]

    return [(selected_av, 1.0)]
