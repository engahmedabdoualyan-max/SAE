"""
Aimsun Next configuration generator.

Generates a Python script that uses the Aimsun Next API to:
  - Set vehicle type behavioral parameters (microscopic model)
  - Configure desired speeds, reaction times, acceleration limits
  - Apply lane-changing behavior overrides
  - Simulate conflict resolution with the Aimsun traffic management API

Aimsun Microscopic Model
========================
Aimsun Next uses a hybrid model combining elements of the Intelligent
Driver Model (IDM) for car-following and the MOBIL model for lane
changing.

IDM safe gap:
    s = s0 + v·T - (v·(v_l - v_f)) / (2·sqrt(a·b)) + 0

    s0  — minimum gap           [m]  (= CC8 / minGap)
    T   — desired time headway  [s]   (= OP0 / tau)
    v   — follower speed        [m/s]
    v_l — leader speed          [m/s]
    a   —max acceleration       [m/s²] (= CC5)
    b   — comfortable deceleration [m/s²] (= CC6)

The structure is mathematically identical to SUMO's Krauss model
and Wiedemann 99's safe-distance calculation.

MOBIL lane-changing:
    The probability of changing lane depends on the acceleration
    improvement and a cooperation parameter.
"""

from models.calibration import VehicleProfile
from models.egyptian_fleet import EGYPTIAN_FLEET
from typing import List, Tuple
import math


def generate_aimsun_script(
    egyptian_profiles: List[VehicleProfile],
    av_profiles: List[Tuple[VehicleProfile, float]],
    mpr: float,
    scenario_name: str = "RingRoad_EgyptCalibration",
    simulation_time: int = 3600,
) -> str:
    """
    Generate a Python script for Aimsun Next API that configures
    vehicle behavioral parameters.

    Parameters
    ----------
    egyptian_profiles : list of Egyptian vehicle profiles
    av_profiles       : list of (AV profile, proportion) tuples
    mpr               : AV market penetration rate
    scenario_name     : name for the Aimsun scenario
    simulation_time   : [s]

    Returns
    -------
    Python script string using the Aimsun Next API.
    """
    all_profiles: List[VehicleProfile] = list(egyptian_profiles)
    all_profiles.extend(p for p, _ in av_profiles)

    lines = []
    lines.append("#" * 72)
    lines.append("# Aimsun Next API Script — Egyptian Fleet Calibration")
    lines.append("#")
    lines.append("# Configures microscopic model parameters for:"
                 f" AV MPR = {mpr*100:.0f}%")
    lines.append(f"# Scenario: {scenario_name}")
    lines.append(f"# Simulation time: {simulation_time} s")
    lines.append("#")
    lines.append("# Model: IDM (car-following) + MOBIL (lane-changing)")
    lines.append("# Safe gap: s = s0 + v*T - v*(v_l-v_f)/(2*sqrt(a*b))")
    lines.append("#")
    lines.append("# Requires: Aimsun Next with Python API support")
    lines.append("# Run: Script > Execute Script in Aimsun Next GUI")
    lines.append("#" * 72)
    lines.append("")
    lines.append("from PyANGBase import *")
    lines.append("from Aang import *")
    lines.append("from GeoData import *")
    lines.append("import sys")
    lines.append("import math")
    lines.append("import random")
    lines.append("")

    # ── Document the mathematical model ──
    lines.append("#" + "=" * 70)
    lines.append("# Mathematical Model: IDM + MOBIL")
    lines.append("#" + "=" * 70)
    lines.append("#")
    lines.append("# IDM acceleration formula:")
    lines.append("#   a_IDM = a_max * (1 - (v/v0)^4 - (s*(v*T + v*deltaV/(2*sqrt(a*b))) /")
    lines.append("#            (v*(v + deltaV)))^2)")
    lines.append("#")
    lines.append("# Where:")
    lines.append("#   a_max  — maximum acceleration")
    lines.append("#   v0     — desired speed")
    lines.append("#   T      — safe time headway (reaction time)")
    lines.append("#   s      — bump-to-bump gap")
    lines.append("#   s0     — minimum gap")
    lines.append("#   deltaV — relative speed (v_leader - v_follower)")
    lines.append("#   a, b   — acceleration / deceleration parameters")
    lines.append("#")
    lines.append("# MOBIL lane-changing:")
    lines.append("#   The incentive to change lane is based on the acceleration")
    lines.append("#   improvement in the target lane vs. current lane.")
    lines.append("")
    lines.append("")

    # ── Get scenario & model ──
    lines.append("# ── Load scenario ──")
    lines.append("model = Model()")
    lines.append(f"scenario = model.getScenario(\"{scenario_name}\")")
    lines.append(f"model.setSimulationTime({simulation_time})")
    lines.append("")

    # ── Vehicle type definitions ──
    lines.append("# ── Vehicle Type Configuration ──")
    lines.append("# Each vehicle type is configured with IDM + MOBIL parameters")
    lines.append("# derived from the mathematical mapping:")

    for i, profile in enumerate(all_profiles):
        params = profile.to_aimsun()
        cf = profile.car_following
        lc = profile.lane_changing

        lines.append(f"")
        lines.append(f"# --- Vehicle Type {i+1}: {profile.name} ---")
        lines.append(f"# SAE Level: {profile.sae_level}")
        lines.append(f"# Dimensions: {profile.dimensions.length}m x {profile.dimensions.width}m")
        lines.append(f"# Safe gap formula: s0 + v*T - v*(v_l-v_f)/(2*sqrt(a*b))")
        lines.append(f"#   s0={cf.min_spacing:.2f}m, T={cf.reaction_time:.2f}s, "
                      f"a={cf.max_accel:.2f}, b={cf.comfortable_decel:.2f}")
        lines.append(f"#   sqrt(a*b)={math.sqrt(cf.max_accel * cf.comfortable_decel):.2f}")
        lines.append(f"")
        lines.append(f"vt_{i+1} = VehicleType(model)")
        lines.append(f"vt_{i+1}.setName(\"{profile.name}\")")
        lines.append(f"vt_{i+1}.setLength({cf.min_spacing if False else profile.dimensions.length:.2f})")
        lines.append(f"vt_{i+1}.setWidth({profile.dimensions.width:.2f})")
        lines.append(f"vt_{i+1}.setReactionTime({cf.reaction_time:.4f})  # T parameter")
        lines.append(f"vt_{i+1}.setDesiredSpeed({cf.desired_speed:.2f})  # v0 parameter")
        lines.append(f"vt_{i+1}.setMaxAcceleration({cf.max_accel:.4f})  # a_max")
        lines.append(f"vt_{i+1}.setComfortDeceleration({cf.comfortable_decel:.4f})  # b")
        lines.append(f"vt_{i+1}.setMaxDeceleration({cf.decisive_decel:.4f})")
        lines.append(f"vt_{i+1}.setMinGap({cf.min_spacing:.4f})  # s0")
        lines.append(f"vt_{i+1}.setSigma({cf.sigma:.4f})  # stochastic variation")
        lines.append(f"vt_{i+1}.setCooperationFactor({lc.probability / 100.0:.4f})  # MOBIL")
        lines.append(f"vt_{i+1}.setLateralSpeed({lc.right_threshold * 0.1:.4f})  # MOBIL assertive")
        lines.append(f"vt_{i+1}.setLookAheadTime({lc.gap_detection_time:.4f})")
        lines.append("")

    # ── Demand / vehicle distribution ──
    lines.append("# ── Vehicle Demand Setup ──")
    lines.append(f"total_vehicles = 500")
    lines.append(f"egyptian_share = {1.0 - mpr:.4f}")
    lines.append(f"av_share = {mpr:.4f}")
    lines.append("")

    # Egyptian fleet distribution
    egyptian_total_prop = sum(p for _, p in EGYPTIAN_FLEET) if len(all_profiles) > 3 else 1.0
    lines.append("# Egyptian conventional vehicle proportions:")

    for i, profile in enumerate(egyptian_profiles, start=1):
        prop = 1.0 / len(egyptian_profiles)  # equal weight or use EGYPTIAN_FLEET
        lines.append(f"  # {profile.name}: {prop*100:.0f}% of Egyptian fleet")

    lines.append(f"")
    lines.append(f"for i in range(total_vehicles):")
    lines.append(f"    rnd = random.random()")

    # Conditional type assignment
    lines.append(f"    if rnd < egyptian_share:")
    lines.append(f"        # Egyptian conventional vehicle")
    lines.append(f"        egyptian_rnd = random.random()")

    for i, profile in enumerate(egyptian_profiles, start=1):
        threshold = sum(1.0 / len(egyptian_profiles) for _ in egyptian_profiles[:i])
        lines.append(f"        if egyptian_rnd < {threshold:.4f}:")
        lines.append(f"            vehicle_type = vt_{i}")
        lines.append(f"        else:")
    lines.append(f"            vehicle_type = vt_1  # fallback")

    lines.append(f"    else:")
    lines.append(f"        # Autonomous vehicle")
    for j, (profile, prop) in enumerate(av_profiles):
        idx = len(egyptian_profiles) + j + 1
        lines.append(f"        if rnd < egyptian_share + av_share * {prop:.4f}:")
        lines.append(f"            vehicle_type = vt_{idx}")
        if j == 0:
            lines.append(f"        else:")
    lines.append(f"            vehicle_type = vt_{len(egyptian_profiles) + 1}")

    lines.append(f"")
    lines.append(f"    route = scenario.getRandomRoute()")
    lines.append(f"    vehicle = Vehicle(model, vehicle_type, route)")
    lines.append(f"    vehicle.setEntranceTime(i * {simulation_time / 500:.2f})")
    lines.append(f"    scenario.addVehicle(vehicle)")
    lines.append("")

    # ── Dwell time for microbus ──
    has_dwell = any(p.dwell for p in all_profiles)
    if has_dwell:
        mb = next(p for p in all_profiles if p.dwell)
        lines.append("# ── Egyptian Microbus Dwell Time ──")
        lines.append(f"# Frequent roadside stops: mean={mb.dwell.mean_duration}s, "
                      f"freq={mb.dwell.stop_frequency}/km")
        lines.append("def microbus_dwell_hook(vehicle, time):")
        lines.append("    \"\"\"Override called at each simulation step for microbuses.\"\"\"")
        lines.append("    if vehicle.getType().getName().startswith('Microbus'):")
        lines.append("        # Check if near a boarding stop")
        lines.append("        pos = vehicle.getPosition()")
        lines.append("        # Simulate dwell based on probability")
        lines.append("        if random.random() < 0.001:  # 0.1% per step")
        lines.append("            dwell = random.expovariate(1.0 / {})".format(mb.dwell.mean_duration))
        lines.append("            vehicle.setState('waiting', dwell)")
        lines.append("")

    # ── Run simulation ──
    lines.append("# ── Run Simulation ──")
    lines.append("model.startSimulation()")
    lines.append("# Wait for completion")
    lines.append(f"model.simulate({simulation_time})")
    lines.append("")
    lines.append("# ── Output ──")
    lines.append("results = model.getResults()")
    lines.append("print('Simulation complete — Egyptian fleet + AV fleet configured.')")
    lines.append("print(f'AV Market Penetration: {mpr*100:.0f}%')")
    lines.append("")
    lines.append("# Save trajectory data")
    lines.append("model.saveOutputFile(\"aimsun_trajectory_{:.0f}mpr.txt\")".format(mpr * 100))
    lines.append("")
    lines.append("# ── Summary ──")
    lines.append(f"print(f'Vehicle types configured: {len(all_profiles)})")

    # AV defensive mode note
    av_profiles_filtered = [p for p in all_profiles if p.sae_level >= 4]
    if av_profiles_filtered:
        lines.append("# ── AV Defensive Mode ──")
        for p in av_profiles_filtered:
            lines.append(f"# {p.name}: CACC headway={getattr(p, 'cacc_headway', 0.3):.2f}s, "
                          f"defensive factor={getattr(p, 'defensive_factor', 3.0):.1f}x")

    lines.append("")
    lines.append("print('Configuration applied successfully.')")

    return "\n".join(lines)
