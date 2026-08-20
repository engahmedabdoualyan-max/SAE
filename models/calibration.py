"""
Core mathematical mappings for micro-simulation calibration.

This module provides the mathematical foundations for translating behavioral
vehicle profiles into platform-specific parameters for:
  - PTV VISSIM  (Wiedemann 99 psycho-physical car-following model)
  - SUMO        (Krauss car-following model + SBahn / SL2015 lane-changing)
  - Aimsun Next (Microscopic behavioral model parameters)

Key Mathematical Relationships
==============================

1. Wiedemann 99 Safe Distance
------------------------------
The Wiedemann 99 psycho-physical model defines five behavioral regions
in the gap-acceleration space.  The dynamic safe distance is:

    d_safe(speed) = CC0 + v * OP0 * OP1
                    + [ v * (v - v_l) / (2 * sqrt(CC5 * CC6)) ] * OP1

  - CC0  : static minimum gap at standstill  [m]
  - v    : current vehicle speed             [m/s]
  - OP0  : reaction / following time          [s]
  - OP1  : multiplicative safety factor        [-]  (0–1)
  - CC5  : maximum acceleration               [m/s²]
  - CC6  : comfortable maximum deceleration   [m/s²]

The braking-distance term v²/(2·√(CC5·CC6)) comes from the kinematic
relation  s = v²/(2a)  with the combined acceleration-deceleration
characteristic √(CC5·CC6).

Egyptian adaptation:
  - OP0 ≈ 0.7–0.9 s   (short reaction, aggressive gap acceptance)
  - OP1 ≈ 0.3–0.5     (low safety margin)
  - CC7 / CC6 ratio  > 1.5 (decisive braking well below comfortable)

SAE Level 4 adaptation:
  - OP0 ≈ 0.3–0.5 s   (CACC / V2X platoons)
  - OP1 ≈ 0.9         (high safety margin)
  - sigma ≈ 0.01      (near-perfect driver model)

2. SUMO Krauss Safe Gap
-----------------------
SUMO's default car-following model (Krauss, 1998) computes the safe
gap as:

    s_star = minGap + v * tau
             - v * (v_l - v_f) / (2 * sqrt(a * b))

  - minGap   : minimum gap at standstill      [m]
  - tau      : reaction time                    [s]
  - v        : follower speed                   [m/s]
  - v_l      : leader speed                     [m/s]
  - v_f      : follower speed                   [m/s]
  - a        : maximum acceleration             [m/s²]
  - b        : comfortable deceleration         [m/s²]

The relative-speed term (v_l - v_f) reduces the gap when the leader
is slower (closing) and increases it when the leader is faster.

3. Lane-Changing (SBahn / SL2015 in SUMO)
------------------------------------------
SUMO's sublane model (SL2015) uses:

    lcCooperative  : cooperation factor (0–1)
    lcAssertive    : maximum lateral speed [m/s]
    lcSpeedAdd     : bonus speed for lane change

Wiedemann 99 maps:
    OP15 (lane-change probability) → lcCooperative
    OP6  (slowdown threshold)      → lcAssertive

4. Wiedemann → SUMO Parameter Mapping
-------------------------------------
The mapping is direct because both models share the same kinematic
foundation:

    minGap   ← CC8 (= min_spacing)
    tau      ← OP0
    sigma    ← (1 - OP1)   # low safety → high imperfection
    accel    ← CC5
    decel    ← CC6
    maxDecel ← CC7

Egyptian driving:  sigma_high (0.8–1.0), tau_low (0.7–1.0)
AV driving:         sigma_low (0.0–0.2), tau_low (0.3–0.5)

Author: SAE Calibration Hub
"""

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional, List


# ──────────────────────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────────────────────

class Platform(Enum):
    """Supported micro-simulation platforms."""
    VISSIM = "PTV VISSIM"
    SUMO = "SUMO"
    AIMSUN = "Aimsun Next"


class VehicleType(Enum):
    """Vehicle / fleet categories."""
    MICROBUS = "Egyptian Microbus"
    MLAIKY = "Mlaiky (Passenger Car)"
    NAQL = "Naql (Heavy Truck)"
    AV_L1_2 = "AV SAE Level 1-2 (Partial)"
    AV_L3 = "AV SAE Level 3 (Conditional)"
    AV_L4_5 = "AV SAE Level 4-5 (Full / CACC)"


# ──────────────────────────────────────────────────────────────
# Data structures (raw behavioral parameters)
# ──────────────────────────────────────────────────────────────

@dataclass
class Dimensions:
    """Physical vehicle dimensions."""
    length: float   # [m]
    width: float    # [m]


@dataclass
class CarFollowing:
    """
    Raw car-following behavioral parameters.

    These are the *fundamental* parameters from which all platform-specific
    configurations are derived.
    """
    max_accel: float            # [m/s²]  maximum (free-road) acceleration
    comfortable_decel: float     # [m/s²]  comfortable maximum deceleration
    decisive_decel: float        # [m/s²]  emergency / decisive deceleration
    reaction_time: float         # [s]     driver reaction time / following time
    min_spacing: float           # [m]     gap at standstill (bumpers)
    standstill_accel: float      # [m/s²]  start-up acceleration from standstill
    multiplicative_safety: float  # [-]    safety factor applied to dynamic gap (0–1)
    sigma: float                 # [-]    driver imperfection / randomness (0–1)
    desired_speed: float         # [m/s]  desired / free-flow speed


@dataclass
class GapAcceptance:
    """
    Psycho-physical gap-acceptance region boundaries.

    These define the Wiedemann 99 behavioral regions:
      - Safe region      : [CC0, CC1]  → driver perceives gap as safe
      - Following region  : [CC2, CC3]  → driver adjusts to leader
      - Braking region    : [0,  CC4]   → emergency deceleration
    """
    safe_start: float       # CC0  [m]  — start of safe region (= min spacing)
    safe_end: float         # CC1  [m]  — end of safe region (speed-dependent)
    follow_start: float     # CC2  [m]  — start of following region
    follow_end: float       # CC3  [m]  — end of following region
    brake_start: float      # CC4  [m]  — start of braking region


@dataclass
class LaneChanging:
    """Lateral / lane-changing behavioral parameters."""
    probability: float          # OP15 / lcCooperative  (0–1 or 0–100)
    right_threshold: float     # OP4  — threshold for right-lane forcing
    gap_detection_time: float  # OP8  [s] — time horizon for gap assessment
    slowdown_prob: float       # OP13 [prob] — prob. to slow in safe region
    brake_prob: float          # OP14 [prob] — prob. to slow in following region
    brake_at_standstill_prob: float  # OP9
    standstill_duration: float  # OP10 [s] — dwell time at standstill
    min_change_dist: float     # minimum distance for safe lane change [m]


@dataclass
class DwellTime:
    """
    Egyptian-specific dwell-time calibration (Microbus frequent stops).

    The Egyptian microbus frequently stops roadside for passenger
    loading/unloading.  Dwell times follow an exponential or log-normal
    distribution calibrated to Ring-Road observations.
    """
    mean_duration: float       # [s]  mean dwell time
    std_dev: float             # [s]  standard deviation
    stop_frequency: float      # [stops/km]  stops per kilometre
    distribution: str          # 'exponential' | 'lognormal'


@dataclass
class VehicleProfile:
    """
    Complete behavioral profile for one vehicle type.

    Combines physical dimensions, car-following parameters, gap-acceptance
    boundaries, and lane-changing behavior into a single object that can be
    mapped to any supported simulation platform.
    """
    name: str
    sae_level: int
    vehicle_type: VehicleType
    dimensions: Dimensions
    car_following: CarFollowing
    lane_changing: LaneChanging
    dwell: Optional[DwellTime] = None
    night_dominant: bool = False          # Naql trucks dominate at night
    color: str = "#FFFFFF"                # visualization color

    # ── Platform mapping methods ──

    def to_wiedemann99(self, speed_reference: Optional[float] = None) -> Dict[str, float]:
        """Map to PTV VISSIM Wiedemann 99 CC/OP parameters."""
        return map_to_wiedemann99(self, speed_reference)

    def to_sumo(self) -> Dict[str, Any]:
        """Map to SUMO car-following + lane-changing parameters."""
        return map_to_sumo(self)

    def to_aimsun(self) -> Dict[str, Any]:
        """Map to Aimsun Next behavioral parameters."""
        return map_to_aimsun(self)

    def safe_distance(self, speed: float, v_leader: Optional[float] = None) -> float:
        """
        Compute dynamic safe distance for the given speed.

        Uses the Wiedemann 99 formula:

            d_safe = CC0 + v * OP0 * OP1
                     + [ v^2 / (2 * sqrt(CC5 * CC6)) ] * OP1

        Parameters
        ----------
        speed     : Follower speed [m/s]
        v_leader  : Leader speed [m/s] (if provided, adds closing-term)
        """
        return safe_distance_wiedemann(speed, self.car_following, v_leader, self.car_following.reaction_time)


# ──────────────────────────────────────────────────────────────
# Core Mathematical Functions
# ──────────────────────────────────────────────────────────────

def safe_distance_wiedemann(
    speed: float,
    cf: CarFollowing,
    v_leader: Optional[float] = None,
    reaction_time: Optional[float] = None,
) -> float:
    """
    Wiedemann 99 dynamic safe-distance formula.

        d_safe = CC0 + v * tau * safety
               + [ v * (v - v_leader) / (2 * sqrt(CC5 * CC6)) ] * safety

    The braking-distance term v·(v - v_leader)/(2·√(CC5·CC6)) captures the
    distance needed to decelerate to the leader's speed.  It is zero when
    the leader moves at the same speed (v_leader = v) and grows with the
    closing speed.

    Parameters
    ----------
    speed        : follower speed [m/s]
    cf           : car-following parameters (provides CC0, CC5, CC6, etc.)
    v_leader     : optional leader speed [m/s] — if given, the closing-speed
                   braking term is included; if None, only reaction distance
                   is computed (no leader present)
    reaction_time: override reaction time [s] (defaults to cf.reaction_time)

    Returns
    -------
    Safe distance in metres [m].
    """
    if reaction_time is None:
        reaction_time = cf.reaction_time

    # Static component — minimum gap at standstill
    static_gap = cf.min_spacing                              # CC0 / minGap

    # Reaction-distance component — proportional to speed × reaction × safety
    reaction_distance = speed * reaction_time * cf.multiplicative_safety

    # Dynamic braking-distance component — kinematic term v·(v - v_l)/(2√(a·b)) × safety
    # This correction is only applied when a leader speed is known, because
    # without a leader there is no closing speed to account for.
    sqrt_ab = math.sqrt(max(cf.max_accel, 0.1) * max(cf.comfortable_decel, 0.1))
    dynamic_braking = 0.0
    if v_leader is not None:
        v_rel = speed - v_leader              # positive = closing on leader
        dynamic_braking = (speed * v_rel) / (2.0 * sqrt_ab) * cf.multiplicative_safety

    return static_gap + reaction_distance + dynamic_braking


def safe_distance_sumo(
    speed: float,
    v_leader: float,
    cf: CarFollowing,
) -> float:
    """
    SUMO Krauss safe-gap formula.

        s_star = minGap + v * tau - v * (v_l - v_f) / (2 * sqrt(a * b))

    Parameters
    ----------
    speed    : follower speed [m/s]
    v_leader : leader speed [m/s]
    cf       : car-following parameters

    Returns
    -------
    Safe gap in metres [m].
    """
    sqrt_ab = math.sqrt(max(cf.max_accel, 0.1) * max(cf.comfortable_decel, 0.1))
    v_rel = v_leader - speed                       # > 0 means leader is faster

    return cf.min_spacing + speed * cf.reaction_time - (speed * v_rel) / (2.0 * sqrt_ab)


def compute_gap_acceptance(cf: CarFollowing, v_ref: float) -> GapAcceptance:
    """
    Compute Wiedemann 99 psycho-physical region boundaries from
    raw car-following parameters.

    The regions are:

    Region 1 — Free (gap > CC1)
               Driver accelerates toward desired speed.

    Region 2 — Safe (CC0 < gap < CC1)
               d_safe is the dynamic threshold:
                   d_safe = CC0 + v * tau * safety + braking_term

    Region 3 — Following (CC2 < gap < CC3)
               Driver adjusts speed to match leader.

    Region 4 — Braking (gap → CC4)
               Emergency deceleration — very small gap.

    Parameters
    ----------
    cf    : car-following parameters
    v_ref : reference speed at which to evaluate [m/s]
            (typically desired_speed or current speed)

    Returns
    -------
    GapAcceptance with CC0–CC4 boundaries.
    """
    # CC0: static minimum gap (= min spacing)
    safe_start = cf.min_spacing

    # CC1: end of safe region = dynamic safe distance at reference speed
    safe_end = safe_distance_wiedemann(v_ref, cf)

    # CC2: start of following region — close proximity (half of min spacing)
    follow_start = 0.5 * cf.min_spacing

    # CC3: end of following region — 2× min spacing + reaction distance
    follow_end = 2.0 * cf.min_spacing + v_ref * cf.reaction_time

    # CC4: start of braking region — emergency (very close to zero)
    brake_start = 0.0

    return GapAcceptance(
        safe_start=safe_start,
        safe_end=safe_end,
        follow_start=follow_start,
        follow_end=follow_end,
        brake_start=brake_start,
    )


# ──────────────────────────────────────────────────────────────
# Platform Mapping Functions
# ──────────────────────────────────────────────────────────────

def map_to_wiedemann99(profile: VehicleProfile, speed_reference: Optional[float] = None) -> Dict[str, float]:
    """
    Map a behavioral profile to PTV VISSIM Wiedemann 99 parameters.

    Parameter correspondence:

    ┌────────┬─────────────────────────────────────────────────────────┐
    │ Symbol │ Meaning                                                 │
    ├────────┼─────────────────────────────────────────────────────────┤
    │ CC0    │ Start of safe region  (= min spacing)                   │
    │ CC1    │ End of safe region    (= dynamic safe distance @ v_ref)  │
    │ CC2    │ Start of following     (= 0.5 × min spacing)             │
    │ CC3    │ End of following       (= 2×min + reaction dist)        │
    │ CC4    │ Start of braking       (= 0, emergency)                  │
    │ CC5    │ Max acceleration                                         │
    │ CC6    │ Comfortable deceleration                                 │
    │ CC7    │ Decisive (emergency) deceleration                          │
    │ CC8    │ Min gap at standstill   (= min spacing)                   │
    │ CC9    │ Standstill acceleration                                   │
    ├────────┼─────────────────────────────────────────────────────────┤
    │ OP0    │ Reaction / following time                                 │
    │ OP1    │ Multiplicative safety factor                              │
    │ OP2    │ Acceleration time   (= tau/2)                            │
    │ OP3    │ Lag time            (= tau)                              │
    │ OP4    │ Right-lane forcing threshold                             │
    │ OP5    │ Gap-detection time                                       │
    │ OP6    │ Slowdown threshold    (= tau × 0.5)                      │
    │ OP7    │ Brake threshold       (= tau × 0.3)                      │
    │ OP8    │ Time-to-gap detection                                      │
    │ OP9    │ Probability to brake at standstill                       │
    │ OP10   │ Dwell time at standstill                                 │
    │ OP11   │ Start time after standstill  (= 0)                        │
    │ OP12   │ Max standstill count  (= 0)                              │
    │ OP13   │ Prob. slow in safe region                                │
    │ OP14   │ Prob. slow in following region                           │
    │ OP15   │ Probability of lane change                               │
    │ OP16   │ Standstill distance   (= min spacing)                    │
    └────────┴─────────────────────────────────────────────────────────┘

    Egyptian adaptation: short tau (OP0), low OP1, high sigma-equivalent.
    AV adaptation: CACC tau, high OP1, low randomness.
    """
    cf = profile.car_following
    lc = profile.lane_changing

    if speed_reference is None:
        speed_reference = cf.desired_speed

    # Compute gap-acceptance boundaries from raw parameters
    ga = compute_gap_acceptance(cf, speed_reference)

    params: Dict[str, float] = {
        # --- CC parameters (car-following psycho-physical model) ---
        'CC0': ga.safe_start,              # [m] Start of safe region
        'CC1': ga.safe_end,               # [m] End of safe region (dynamic)
        'CC2': ga.follow_start,           # [m] Start of following
        'CC3': ga.follow_end,             # [m] End of following
        'CC4': ga.brake_start,            # [m] Braking region start
        'CC5': cf.max_accel,             # [m/s²]
        'CC6': cf.comfortable_decel,     # [m/s²]
        'CC7': cf.decisive_decel,        # [m/s²]
        'CC8': cf.min_spacing,           # [m]
        'CC9': cf.standstill_accel,      # [m/s²]

        # --- OP parameters (lane-change / behavioral thresholds) ---
        'OP0': cf.reaction_time,         # [s] Following time
        'OP1': cf.multiplicative_safety, # [-] Safety factor
        'OP2': cf.reaction_time / 2.0,   # [s] Acceleration time
        'OP3': cf.reaction_time,         # [s] Lag time
        'OP4': lc.right_threshold,       # [%]
        'OP5': lc.gap_detection_time,    # [s]
        'OP6': cf.reaction_time * 0.5,   # [s] Slowdown threshold
        'OP7': cf.reaction_time * 0.3,   # [s] Brake threshold
        'OP8': lc.gap_detection_time,    # [s]
        'OP9': lc.brake_at_standstill_prob,
        'OP10': lc.standstill_duration,  # [s] Dwell time
        'OP11': 0.0,                     # [s]
        'OP12': 0.0,                     # [-]
        'OP13': lc.slowdown_prob,
        'OP14': lc.brake_prob,
        'OP15': lc.probability,          # [%]
        'OP16': cf.min_spacing,          # [m]
    }
    return params


def map_to_sumo(profile: VehicleProfile) -> Dict[str, Any]:
    """
    Map a behavioral profile to SUMO car-following + lane-changing
    parameters (Krauss CF model + SL2015 lane changing).

    Mathematical correspondence:

        SUMO:  s_star = minGap + v·tau - v·(v_l-v_f)/(2·√(a·b))
        Wiedemann: d_safe = CC8 + v·OP0·OP1 + [v²/(2·√(CC5·CC6))]·OP1

    The two formulas share the same kinematic base  v²/(2·√(a·b)) ,
    which arises from combining acceleration (a) and deceleration (b)
    into an effective “braking capability”  √(a·b) .

    Egyptian driving:  tau short, sigma high, minGap small,
    multiplicative safety low → erratic close-following.

    AV platooning:     tau ~ 0.3 s (CACC), sigma ~ 0,
    multiplicative safety high → stable tight platoons.
    """
    cf = profile.car_following
    lc = profile.lane_changing

    # sigma = 1 - safety factor  (low safety → high imperfection)
    # Clamp to [0, 1]
    sigma = max(0.0, min(1.0, 1.0 - cf.multiplicative_safety))

    # For AVs with very low sigma, use their explicit value
    if cf.sigma < 0.2:
        sigma = cf.sigma

    params: Dict[str, Any] = {
        # --- Car-following (Krauss model) ---
        'accel': cf.max_accel,           # [m/s²]
        'decel': cf.comfortable_decel,   # [m/s²]
        'tau': cf.reaction_time,         # [s]
        'minGap': cf.min_spacing,        # [m]
        'sigma': round(sigma, 4),        # [-]  driver imperfection
        'k': round(cf.max_accel, 4),     # acceleration constant
        'phi': 0.0,                       # crash-reducing factor
        'delta': 4.0,                    # acceleration exponent
        'speedFactor': 1.0,              # mean speed factor
        'speedDev': 0.05,                # speed deviation

        # --- Lane changing (SL2015) ---
        'lcCooperative': lc.probability,
        'lcAssertive': lc.right_threshold * 0.25,
        'lcSpeedAdd': 5.0,               # [m/s]
        'lcLookahead': lc.gap_detection_time,  # [s]
        'lcTimeToIndent': lc.gap_detection_time,

        # --- Physical ---
        'length': profile.dimensions.length,   # [m]
        'width': profile.dimensions.width,     # [m]

        # --- Visualization ---
        'color': profile.color,
    }
    return params


def map_to_aimsun(profile: VehicleProfile) -> Dict[str, Any]:
    """
    Map a behavioral profile to Aimsun Next microscopic parameters.

    Aimsun's model uses a hybrid intelligent-driver + lane-changing
    framework.  Key parameters:

        reactionTime       : perception-reaction delay [s]
        desiredSpeed       : target / free-flow speed [m/s]
        accel, decel       : kinematic limits [m/s²]
        cooperation        : lane-change cooperation (0–1)
        gapMinimum         : minimum acceptable gap [m]

    The safe-gap formula in Aimsun's IDM variant:

        s = v·T + sqrt( s0² + v·(s1 + v_l) / 2 )

    where T is reaction time and s0, s1 are model constants.
    """
    cf = profile.car_following
    lc = profile.lane_changing

    params: Dict[str, Any] = {
        'reactionTime': cf.reaction_time,
        'maxAccel': cf.max_accel,
        'comfortableDecel': cf.comfortable_decel,
        'maxDecel': cf.decisive_decel,
        'cooperationFactor': lc.probability,
        'gapMinimum': cf.min_spacing,
        'gapAcceptanceTime': cf.reaction_time * cf.multiplicative_safety,
        'standstillAccel': cf.standstill_accel,
        'desiredSpeed': cf.desired_speed,
        'sigma': cf.sigma,
        'length': profile.dimensions.length,
        'width': profile.dimensions.width,
        'color': profile.color,
    }
    return params


# ──────────────────────────────────────────────────────────────
# Fleet Composition & MPR Mixing
# ──────────────────────────────────────────────────────────────

@dataclass
class FleetComposition:
    """
    Represents the composition of a mixed-traffic scenario.

    A fleet is a list of (profile, proportion) pairs.  The sum of
    proportions should equal 1.0 (100 %).
    """
    profiles: List[VehicleProfile] = field(default_factory=list)
    proportions: List[float] = field(default_factory=list)

    def add(self, profile: VehicleProfile, proportion: float):
        """Add a vehicle type with its market share (0–1)."""
        self.profiles.append(profile)
        self.proportions.append(proportion)

    @property
    def total_proportion(self) -> float:
        return sum(self.proportions)

    def __iter__(self):
        return iter(zip(self.profiles, self.proportions))

    def __len__(self):
        return len(self.profiles)

    def normalize(self):
        """Scale all proportions so they sum to 1.0."""
        total = self.total_proportion
        if total > 0:
            self.proportions = [p / total for p in self.proportions]
