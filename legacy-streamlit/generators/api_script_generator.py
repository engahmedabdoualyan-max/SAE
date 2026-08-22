"""
Dynamic conflict-resolution script generator.

Generates a platform-agnostic Python script that monitors vehicle
trajectories in real time and applies speed / lane overrides when
a collision conflict is detected.

Conflict Detection Mathematics
==============================

Time-To-Collision (TTC):
    TTC = Δs / Δv

    where:
      Δs = gap between follower and leader  [m]
      Δv = closing speed (v_follower - v_leader)  [m/s]

    If TTC < threshold (e.g., 1.5 s), the system intervenes.

Post-Encroachment Time (PET):
    PET = (s_follower + L_follower - s_leader) / (v_leader)

    Measures the time between two vehicles passing a conflict point.

Safe Intervention Logic:
    1. If TTC < TTC_threshold AND Δv > 0 (closing):
       - Compute required deceleration:
           a_required = v² / (2 * d_remaining)
       - If a_required > comfortable_decel:
           → Apply emergency deceleration override

    2. If an AV is involved:
       - Apply CACC spacing (tighten or relax based on V2X data)
       - If cut-in detected: trigger defensive mode
           d_safe = d_min + v * T_cacc * safety_factor
           where safety_factor increases by defensive_factor

    3. For lane-change conflicts:
       - Check PET at conflict point
       - If PET < 2.0s: deny lane change or force merge speed adjustment
"""

from models.calibration import VehicleProfile
from typing import List, Tuple, Dict, Any
from enum import Enum
import math


class ConflictStrategy(Enum):
    """Conflict resolution strategies."""
    DECELERATION = "speed_adjust"
    LANE_CHANGE = "lane_override"
    CACC_PLATOON = "cacc_platoon"
    DEFENSIVE = "defensive_mode"


def _get_vehicle_info(profile: VehicleProfile) -> Dict[str, Any]:
    """Extract key parameters for conflict resolution scripts."""
    cf = profile.car_following
    return {
        "name": profile.name,
        "sae_level": profile.sae_level,
        "max_accel": cf.max_accel,
        "comfortable_decel": cf.comfortable_decel,
        "decisive_decel": cf.decisive_decel,
        "reaction_time": cf.reaction_time,
        "min_spacing": cf.min_spacing,
        "multiplicative_safety": cf.multiplicative_safety,
        "sigma": cf.sigma,
        "desired_speed": cf.desired_speed,
        "cacc_headway": getattr(profile, 'cacc_headway', None),
        "defensive_factor": getattr(profile, 'defensive_factor', None),
        "min_gap": cf.min_spacing,
        "is_av": profile.sae_level >= 1,
        "is_cacc": profile.sae_level >= 4,
        "dwell_mean": profile.dwell.mean_duration if profile.dwell else 0,
    }


def generate_conflict_script(
    egyptian_profiles: List[VehicleProfile],
    av_profiles: List[Tuple[VehicleProfile, float]],
    mpr: float,
    platform: str = "SUMO",
) -> str:
    """
    Generate a Python script that uses the simulation API to detect
    and resolve collision conflicts in real time.

    Parameters
    ----------
    egyptian_profiles : Egyptian vehicle profiles
    av_profiles       : AV profiles with proportions
    mpr               : AV market penetration rate
    platform          : "SUMO", "VISSIM", or "AIMSUN"

    Returns
    -------
    Python script string.
    """
    all_profiles: List[VehicleProfile] = list(egyptian_profiles)
    all_profiles.extend(p for p, _ in av_profiles)
    vehicle_infos = [_get_vehicle_info(p) for p in all_profiles]

    if platform == "SUMO":
        return _generate_sumo_traci_script(vehicle_infos, mpr)
    elif platform == "VISSIM":
        return _generate_vissim_com_script(vehicle_infos, mpr)
    elif platform == "AIMSUN":
        return _generate_aimsun_api_script(vehicle_infos, mpr)
    else:
        return _generate_generic_script(vehicle_infos, mpr)


# ──────────────────────────────────────────────────────────────
# SUMO TraCI Script
# ──────────────────────────────────────────────────────────────

def _generate_sumo_traci_script(vehicle_infos: List[Dict], mpr: float) -> str:
    """Generate SUMO TraCI conflict-resolution script."""

    lines = []
    lines.append("#" * 72)
    lines.append("# SUMO TraCI — Real-Time Conflict Detection & Resolution")
    lines.append("#")
    lines.append("# Monitors vehicle trajectories and intervenes when")
    lines.append("# Time-To-Collision (TTC) drops below a safety threshold.")
    lines.append("#")
    lines.append(f"# AV Market Penetration Rate: {mpr*100:.0f}%")
    lines.append("#")
    lines.append("# Conflict Detection Formula:")
    lines.append("#   TTC = Δs / Δv")
    lines.append("#   where Δs = gap [m], Δv = closing speed [m/s]")
    lines.append("#   Intervention threshold: TTC < TTC_THRESHOLD")
    lines.append("#")
    lines.append("# Safe Deceleration Override:")
    lines.append("#   a_required = v² / (2 * d_remaining)")
    lines.append("#   Applied when a_required > comfortable_decel")
    lines.append("#")
    lines.append("# Requires: SUMO + python-traCI")
    lines.append("# Usage: sumo -c config.sumocfg --python-script conflict_resolution.py")
    lines.append("#" * 72)
    lines.append("")
    lines.append("import traci")
    lines.append("import math")
    lines.append("import random")
    lines.append("import sys")
    lines.append("")
    lines.append("# ── Configuration Constants ──")
    lines.append("TTC_THRESHOLD = 1.5        # [s] Time-to-collision trigger")
    lines.append("PET_THRESHOLD = 2.0        # [s] Post-encroachment time for lane conflicts")
    lines.append("EMERGENCY_DEC_RATE = 0.8   # fraction of max decel for override")
    lines.append("CACC_HEADWAY = 0.3         # [s] CACC time gap for AV platoons")
    lines.append("DEFENSIVE_FACTOR = 3.0     # safety boost when cut off by Level 0")
    lines.append("")
    lines.append("# ── Vehicle Type Parameters ──")
    lines.append("# Derived from Wiedemann 99 / SUMO mapping:")
    lines.append("#   safe_gap = minGap + v*tau - v*(v_l-v_f)/(2*sqrt(a*b))")
    lines.append("")

    # Emit per-vehicle-type parameter dictionaries
    for i, vi in enumerate(vehicle_infos, start=1):
        lines.append(f"# {vi['name']} (SAE L{vi['sae_level']})")
        lines.append(f"VEH_{i} = {{\n" +
                      f"    'id': {i},\n" +
                      f"    'max_accel': {vi['max_accel']},\n" +
                      f"    'comfortable_decel': {vi['comfortable_decel']},\n" +
                      f"    'decisive_decel': {vi['decisive_decel']},\n" +
                      f"    'reaction_time': {vi['reaction_time']},\n" +
                      f"    'min_gap': {vi['min_gap']},\n" +
                      f"    'safety_factor': {vi['multiplicative_safety']},\n" +
                      f"    'sigma': {vi['sigma']},\n" +
                      f"    'desired_speed': {vi['desired_speed']},\n" +
                      f"    'is_av': {vi['is_av']},\n" +
                      f"    'is_cacc': {vi['is_cacc']},\n" +
                      f"    'cacc_headway': {vi.get('cacc_headway', 0.3) if vi.get('cacc_headway') else 'None'},\n" +
                      f"    'defensive_factor': {vi.get('defensive_factor', 3.0) if vi.get('defensive_factor') else 'None'},\n" +
                      f"}}")
        lines.append("")

    lines.append("# Vehicle type database (loaded from calibration)")
    lines.append("VEHICLE_TYPES = {")

    for i, vi in enumerate(vehicle_infos, start=1):
        lines.append(f"    '{vi['name']}': VEH_{i},")
    lines.append("}")
    lines.append("")

    # ── Core mathematical functions ──
    lines.append("#" + "=" * 70)
    lines.append("# Core Mathematical Functions")
    lines.append("#" + "=" * 70)
    lines.append("")

    lines.append("def safe_gap_sumo(v_follower, v_leader, params):")
    lines.append("    \"\"\"")
    lines.append("    SUMO Krauss safe gap formula:")
    lines.append("        s_star = minGap + v * tau - v * (v_l - v_f) / (2 * sqrt(a * b))")
    lines.append("    \"\"\"")
    lines.append("    v = v_follower")
    lines.append("    v_l = v_leader")
    lines.append("    delta_v = v - v_l  # positive = closing")
    lines.append("    sqrt_ab = math.sqrt(max(params['max_accel'], 0.1) * max(params['comfortable_decel'], 0.1))")
    lines.append("    s_star = params['min_gap'] + v * params['reaction_time'] * params['safety_factor']")
    lines.append("    s_star -= (v * delta_v) / (2.0 * sqrt_ab)")
    lines.append("    return max(params['min_gap'], s_star)")
    lines.append("")

    lines.append("def safe_distance_wiedemann(v, params, v_leader=None):")
    lines.append("    \"\"\"")
    lines.append("    Wiedemann 99 dynamic safe distance:")
    lines.append("        d_safe = CC0 + v * OP0 * OP1 + [v^2 / (2 * sqrt(CC5 * CC6))] * OP1")
    lines.append("    \"\"\"")
    lines.append("    sqrt_ab = math.sqrt(max(params['max_accel'], 0.1) * max(params['comfortable_decel'], 0.1))")
    lines.append("    static = params['min_gap']")
    lines.append("    reaction = v * params['reaction_time'] * params['safety_factor']")
    lines.append("    braking = (v ** 2) / (2.0 * sqrt_ab) * params['safety_factor']")
    lines.append("    closing = 0.0")
    lines.append("    if v_leader is not None:")
    lines.append("        v_rel = v - v_leader")
    lines.append("        closing = (v * v_rel) / (2.0 * sqrt_ab)")
    lines.append("    return static + reaction + braking - closing")
    lines.append("")

    lines.append("def compute_ttc(gap, v_follower, v_leader):")
    lines.append("    \"\"\"Time-To-Collision [s] = gap / closing_speed.\"\"\"")
    lines.append("    delta_v = v_follower - v_leader")
    lines.append("    if delta_v <= 0.1:  # not closing")
    lines.append("        return float('inf')")
    lines.append("    return gap / delta_v")
    lines.append("")

    lines.append("def compute_pet(pos_f, pos_l, length_f, v_leader):")
    lines.append("    \"\"\"Post-Enroachment Time [s] for lane-change conflicts.\"\"\"")
    lines.append("    if v_leader <= 0.1:")
    lines.append("        return float('inf')")
    lines.append("    return (pos_f - pos_l + length_f) / v_leader")
    lines.append("")

    lines.append("def required_deceleration(v_follower, gap, comfortable_decel):")
    lines.append("    \"\"\"")
    lines.append("    Minimum deceleration to avoid collision within gap:")
    lines.append("        a_required = v^2 / (2 * gap)")
    lines.append("    Derived from kinematic equation: v_f^2 = v_i^2 + 2*a*s, with v_f = 0")
    lines.append("    \"\"\"")
    lines.append("    if gap <= 0.01:")
    lines.append("        return comfortable_decel * 2  # emergency")
    lines.append("    return (v_follower ** 2) / (2.0 * gap)")
    lines.append("")

    lines.append("def get_vehicle_params(vtype_id):")
    lines.append("    \"\"\"Look up behavioral parameters for a vehicle type ID.\"\"\"")
    lines.append("    vtype_name = traci.vehicle.getTypeID(vtype_id)")
    lines.append("    params = VEHICLE_TYPES.get(vtype_name)")
    lines.append("    if params is None:")
    lines.append("        # Default conservative parameters")
    lines.append("        params = VEHICLE_TYPES['SAE Level 4-5 (CACC / V2X)']")
    lines.append("    return params")
    lines.append("")

    # ── Main conflict detection & resolution ──
    lines.append("#" + "=" * 70)
    lines.append("# Conflict Detection & Resolution")
    lines.append("#" + "=" * 70)
    lines.append("")

    lines.append("def detect_and_resolve_conflicts():")
    lines.append("    \"\"\"")
    lines.append("    Main loop: detect potential collisions and apply overrides.")
    lines.append("")
    lines.append("    Strategy:")
    lines.append("      1. For each vehicle, find the leader (closest vehicle ahead).")
    lines.append("      2. Compute TTC = gap / closing_speed.")
    lines.append("      3. If TTC < TTC_THRESHOLD, apply deceleration override.")
    lines.append("      4. If AV is involved, use CACC spacing for tight platooning.")
    lines.append("      5. If AV is cut off by Level-0 vehicle, trigger defensive mode.")
    lines.append("    \"\"\"")
    lines.append("    vehicle_ids = traci.vehicle.getIDList()")
    lines.append("")
    lines.append("    for vid in vehicle_ids:")
    lines.append("        try:")
    lines.append("            # Get vehicle data")
    lines.append("            v = traci.vehicle.getSpeed(vid)")
    lines.append("            lane = traci.vehicle.getLaneID(vid)")
    lines.append("            position = traci.vehicle.getMinExpectedPosition(vid)")
    lines.append("            length = traci.vehicle.getLength(vid)")
    lines.append("            vtype_id = traci.vehicle.getTypeID(vid)")
    lines.append("            params = get_vehicle_params(vtype_id)")
    lines.append("")
    lines.append("            # Find leading vehicle on same lane")
    lines.append("            leader_info = traci.vehicle.getLeader(vid, 50)")
    lines.append("            if leader_info is None:")
    lines.append("                continue")
    lines.append("")
    lines.append("            leader_id, gap = leader_info")
    lines.append("            gap = max(gap - length, 0.0)  # bumper-to-bumper gap")
    lines.append("            v_leader = traci.vehicle.getSpeed(leader_id)")
    lines.append("")
    lines.append("            # ── Compute Time-To-Collision ──")
    lines.append("            ttc = compute_ttc(gap, v, v_leader)")
    lines.append("            closing_speed = v - v_leader")
    lines.append("")
    lines.append("            # ── Compute Safe Gap ──")
    lines.append("            safe_gap = safe_gap_sumo(v, v_leader, params)")
    lines.append("")
    lines.append("            # ── AV Defensive Mode (cut-off by Level 0) ──")
    lines.append("            if params['is_cacc'] and closing_speed > 5.0:")
    lines.append("                # An aggressive vehicle is closing fast")
    lines.append("                # Increase safety factor (defensive mode)")
    lines.append("                defensive_gap = safe_gap * params['defensive_factor']")
    lines.append("                if gap < defensive_gap:")
    lines.append("                    # Trigger defensive response")
    lines.append("                    # Reduce speed target to maintain safe gap")
    lines.append("                    target_speed = v_leader - 2.0  # leave buffer")
    lines.append("                    traci.vehicle.setSpeed(vid, max(v_leader - 3.0, 0.0))")
    lines.append("                    traci.vehicle.setColor(vid, (255, 0, 0))  # red = defensive")
    lines.append("                    continue")
    lines.append("")
    lines.append("            # ── CACC Platooning (AV-AV interaction) ──")
    lines.append("            if params['is_cacc']:")
    lines.append("                leader_vtype = traci.vehicle.getTypeID(leader_id)")
    lines.append("                leader_params = get_vehicle_params(leader_vtype)")
    lines.append("                if leader_params['is_cacc']:")
    lines.append("                    # Tight CACC gap: v * T_cacc")
    lines.append("                    cacc_gap = v * CACC_HEADWAY + params['min_gap']")
    lines.append("                    if gap < cacc_gap:")
    lines.append("                        # Platooning: smooth deceleration")
    lines.append("                        traci.vehicle.setSpeed(vid, v_leader)")
    lines.append("                    continue")
    lines.append("")
    lines.append("            # ── Standard Conflict Resolution ──")
    lines.append("            if ttc < TTC_THRESHOLD and closing_speed > 0:")
    lines.append("                # Conflict detected — apply override")
    lines.append("                a_req = required_deceleration(v, gap, params['comfortable_decel'])")
    lines.append("")
    lines.append("                if a_req > params['comfortable_decel'] * 0.8:")
    lines.append("                    # Emergency deceleration")
    lines.append("                    # Formula: v_new = sqrt(v^2 - 2 * a_decel * dt)")
    lines.append("                    # But TraCI can only set target speed, so we compute:")
    lines.append("                    # v_target = sqrt(v^2 - 2 * a_override * dt)")
    lines.append("                    # where dt = TTC (time until collision)")
    lines.append("                    dt = max(ttc, 0.1)")
    lines.append("                    a_override = min(")
    lines.append("                        a_req,")
    lines.append("                        params['decisive_decel']")
    lines.append("                    )")
    lines.append("                    v_target = math.sqrt(max(0, v**2 - 2 * a_override * dt))")
    lines.append("")
    lines.append("                    # Apply override (cap to comfortable deceleration)")
    lines.append("                    cap = params['comfortable_decel'] * EMERGENCY_DEC_RATE")
    lines.append("                    if v_target < v - cap * dt:")
    lines.append("                        v_target = v - cap * dt  # smooth deceleration")
    lines.append("")
    lines.append("                    traci.vehicle.setSpeed(vid, v_target)")
    lines.append("                    traci.vehicle.setSpeedMode(vid, 0b011000)  # ignore speed limits, follow leader")
    lines.append("                    traci.vehicle.setColor(vid, (255, 165, 0))  # orange = intervened")
    lines.append("")
    lines.append("        except traci.exceptions.TraCIException:")
    lines.append("            continue")
    lines.append("")

    lines.append("def resolve_lane_conflict(vid, target_lane, target_position):")
    lines.append("    \"\"\"Resolve lateral conflicts during lane changes.\"\"\"")
    lines.append("    # Compute PET at conflict point")
    lines.append("    target_leader = traci.vehicle.getLeader(vid, 0)")
    lines.append("    if target_leader is None:")
    lines.append("        return True  # safe to change")
    lines.append("")
    lines.append("    leader_pos = traci.vehicle.getPosition(target_leader)")
    lines.append("    leader_length = traci.vehicle.getLength(target_leader)")
    lines.append("    v_leader = traci.vehicle.getSpeed(target_leader)")
    lines.append("")
    lines.append("    pet = compute_pet(target_position, leader_pos, leader_length, v_leader)")
    lines.append("    if pet < PET_THRESHOLD:")
    lines.append("        # Conflict: force speed reduction before lane change")
    lines.append("        traci.vehicle.setSpeed(vid, v_leader * 0.8)")
    lines.append("        return False  # deny lane change")
    lines.append("    return True  # safe to proceed")
    lines.append("")

    # ── Main ──
    lines.append("#" + "=" * 70)
    lines.append("# Main Simulation Loop")
    lines.append("#" + "=" * 70)
    lines.append("")
    lines.append("def run():")
    lines.append("    \"\"\"Main entry point called by SUMO simulation step.\"\"\"")
    lines.append("    step = 0")
    lines.append("    while traci.isMinStartValueReached() and traci.simulation.getMinExpectedNumber() > 0:")
    lines.append("        traci.simulationStep()")
    lines.append("        detect_and_resolve_conflicts()")
    lines.append("        step += 1")
    lines.append("")
    lines.append("    traci.close()")
    lines.append("    print(f'Conflict resolution complete after {step} steps.')")
    lines.append("")

    lines.append("# ── Microbus dwell time override ──")
    lines.append("def simulate_dwell_times():")
    lines.append("    \"\"\"Override microbus dwell times at stop locations.\"\"\"")
    lines.append("    for vid in traci.vehicle.getIDList():")
    lines.append("        vtype = traci.vehicle.getTypeID(vid)")
    lines.append("        if 'Microbus' in vtype:")
    lines.append("            pos = traci.vehicle.getPosition(vid)")
    lines.append("            # Near stop zone (x < 50m on ring road)")
    lines.append("            if pos[0] < 50 and random.random() < 0.001:")
    lines.append("                dwell_time = random.expovariate(1.0 / 25.0)  # mean 25s")
    lines.append("                traci.vehicle.setSpeed(vid, 0.0)")
    lines.append("                traci.vehicle.setStop(")
    lines.append("                    stopID='microbus_stop',")
    lines.append("                    duration=dwell_time")
    lines.append("                )")
    lines.append("")

    lines.append("")
    lines.append("if __name__ == \"__main__\":")
    lines.append("    traci.start([\"sumo-gui\", \"-c\", \"ring_road.sumocfg\"])")
    lines.append("    run()")

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# VISSIM COM Script
# ──────────────────────────────────────────────────────────────

def _generate_vissim_com_script(vehicle_infos: List[Dict], mpr: float) -> str:
    """Generate VISSIM COM API conflict-resolution script."""

    lines = []
    lines.append("#" * 72)
    lines.append("# PTV VISSIM COM API — Real-Time Conflict Detection & Resolution")
    lines.append("#")
    lines.append("# Uses Wiedemann 99 parameters for conflict detection.")
    lines.append("# Safe distance: d_safe = CC8 + v * OP0 * OP1 + [v^2 / (2 * sqrt(CC5*CC6))] * OP1")
    lines.append("#")
    lines.append(f"# AV MPR: {mpr*100:.0f}%")
    lines.append("#")
    lines.append("# Requires: Python for VISSIM (pywin32)")
    lines.append("#" * 72)
    lines.append("")
    lines.append("import win32com.client")
    lines.append("import math")
    lines.append("import random")
    lines.append("")
    lines.append("# ── Configuration ──")
    lines.append("TTC_THRESHOLD = 1.5     # Time-to-collision trigger [s]")
    lines.append("CACC_HEADWAY = 0.3      # CACC gap for AV platoons [s]")
    lines.append("DEFENSIVE_FACTOR = 3.0  # Safety boost for AV when cut off")
    lines.append("")
    lines.append("# ── Vehicle Parameters (Wiedemann 99) ──")

    for i, vi in enumerate(vehicle_infos, start=1):
        lines.append(f"VEH_{i} = {{\n" +
                      f"    'name': '{vi['name']}',\n" +
                      f"    'sae_level': {vi['sae_level']},\n" +
                      f"    'CC5': {vi['max_accel']},\n" +
                      f"    'CC6': {vi['comfortable_decel']},\n" +
                      f"    'CC7': {vi['decisive_decel']},\n" +
                      f"    'CC8': {vi['min_gap']},\n" +
                      f"    'CC9': {vi['reaction_time'] / 2:.4f},\n" +
                      f"    'OP0': {vi['reaction_time']},\n" +
                      f"    'OP1': {vi['multiplicative_safety']},\n" +
                      f"    'is_cacc': {vi['is_cacc']},\n" +
                      f"    'cacc_headway': {vi.get('cacc_headway', 0.3) if vi.get('cacc_headway') else 'None'},\n" +
                      f"}}")
        lines.append("")

    lines.append("VEHICLE_DB = {")
    for i, vi in enumerate(vehicle_infos, start=1):
        lines.append(f"    vt_{i}: VEH_{i},")
    lines.append("}")
    lines.append("")

    # ── Helper functions ──
    lines.append("def w99_safe_distance(speed, params, v_leader=None):")
    lines.append("    \"\"\"Wiedemann 99 safe distance formula.\"\"\"")
    lines.append("    cc5 = params['CC5']")
    lines.append("    cc6 = params['CC6']")
    lines.append("    cc8 = params['CC8']")
    lines.append("    op0 = params['OP0']  # reaction time")
    lines.append("    op1 = params['OP1']  # safety factor")
    lines.append("    sqrt_ab = math.sqrt(max(cc5, 0.1) * max(cc6, 0.1))")
    lines.append("    static = cc8")
    lines.append("    reaction = speed * op0 * op1")
    lines.append("    braking = (speed ** 2) / (2.0 * sqrt_ab) * op1")
    lines.append("    closing = 0.0")
    lines.append("    if v_leader is not None:")
    lines.append("        v_rel = speed - v_leader")
    lines.append("        closing = (speed * v_rel) / (2.0 * sqrt_ab)")
    lines.append("    return static + reaction + braking - closing")
    lines.append("")

    lines.append("def compute_ttc(gap, v_follower, v_leader):")
    lines.append("    delta_v = v_follower - v_leader")
    lines.append("    if delta_v <= 0.1:")
    lines.append("        return float('inf')")
    lines.append("    return gap / delta_v")
    lines.append("")

    lines.append("def required_deceleration(v, gap):")
    lines.append("    \"\"\"a = v^2 / (2 * gap)\"\"\"")
    lines.append("    if gap <= 0.01:")
    lines.append("        return 8.0  # emergency")
    lines.append("    return (v ** 2) / (2.0 * gap)")
    lines.append("")

    # ── Main conflict loop ──
    lines.append("def run_conflict_resolution():")
    lines.append("    \"\"\"Run conflict detection loop for the current simulation step.\"\"\"")
    lines.append("    vehicles = vissim.Simulation.Vehicles")
    lines.append("    for i in range(1, vehicles.Count + 1):")
    lines.append("        try:")
    lines.append("            veh = vehicles.ItemByIndex(i - 1)")
    lines.append("            vid = veh.AttValue('ID')")
    lines.append("            vtype_key = int(veh.AttValue('Type'))")
    lines.append("            v_speed = veh.AttValue('Speed')")
    lines.append("            front_dist = veh.AttValue('FrontGap')")
    lines.append("            leader_speed = veh.AttValue('SpeedLeader')")
    lines.append("")
    lines.append("            if vtype_key not in VEHICLE_DB:")
    lines.append("                continue")
    lines.append("            params = VEHICLE_DB[vtype_key]")
    lines.append("")
    lines.append("            gap = front_dist  # Vissim reports front gap directly")
    lines.append("            ttc = compute_ttc(gap, v_speed, leader_speed)")
    lines.append("")
    lines.append("            # CACC Platooning")
    lines.append("            if params['is_cacc'] and params.get('cacc_headway'):")
    lines.append("                leader_type = int(vissim.Vehicles.ItemByKey(leader_speed).AttValue('Type'))")
    lines.append("                if leader_type in VEHICLE_DB and VEHICLE_DB[leader_type].get('is_cacc'):")
    lines.append("                    cacc_gap = v_speed * CACC_HEADWAY + params['CC8']")
    lines.append("                    if gap < cacc_gap:")
    lines.append("                        # Tight platoon: no intervention needed")
    lines.append("                        continue")
    lines.append("")
    lines.append("            # Standard conflict detection")
    lines.append("            safe = w99_safe_distance(v_speed, params, leader_speed)")
    lines.append("            if gap < safe or ttc < TTC_THRESHOLD:")
    lines.append("                a_req = required_deceleration(v_speed, gap)")
    lines.append("                if a_req > params['CC6'] * 0.8:")
    lines.append("                    # Apply deceleration override")
    lines.append("                    v_target = math.sqrt(max(0.0, v_speed**2 - 2 * a_req * ttc))")
    lines.append("                    veh.SetAttValue('SpeedOverride', v_target)")
    lines.append("                    veh.SetAttValue('Color', '(255,165,0)')")
    lines.append("")
    lines.append("        except Exception:")
    lines.append("            continue")
    lines.append("")
    lines.append("    return True")
    lines.append("")
    lines.append("# Run at each simulation step")
    lines.append("# In VISSIM: assign to a 'Decision Maker' or run via DLL callback")
    lines.append("# Or call: vissim.Simulation.RunSingleStep() in a loop")
    lines.append("print('VISSIM conflict resolution module loaded.')")
    lines.append("print('Call run_conflict_resolution() at each simulation step.')")

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# Aimsun API Script
# ──────────────────────────────────────────────────────────────

def _generate_aimsun_api_script(vehicle_infos: List[Dict], mpr: float) -> str:
    """Generate Aimsun Next API conflict-resolution script."""

    lines = []
    lines.append("#" * 72)
    lines.append("# Aimsun Next API — Real-Time Conflict Detection & Resolution")
    lines.append("#")
    lines.append("# Uses IDM (car-following) and MOBIL (lane-changing) parameters")
    lines.append("# for conflict detection and resolution.")
    lines.append("#")
    lines.append(f"# AV MPR: {mpr*100:.0f}%")
    lines.append("# Requires: Aimsun Next Python API")
    lines.append("#" * 72)
    lines.append("")
    lines.append("from PyANGBase import *")
    lines.append("from Aang import *")
    lines.append("from GeoData import *")
    lines.append("import math")
    lines.append("import random")
    lines.append("")
    lines.append("# ── Configuration ──")
    lines.append("TTC_THRESHOLD = 1.5")
    lines.append("CACC_HEADWAY = 0.3")
    lines.append("DEFENSIVE_FACTOR = 3.0")
    lines.append("")

    # Vehicle parameters
    for i, vi in enumerate(vehicle_infos, start=1):
        lines.append(f"VT_{i} = {{\n" +
                      f"    'name': '{vi['name']}',\n" +
                      f"    'sae_level': {vi['sae_level']},\n" +
                      f"    'accel': {vi['max_accel']},\n" +
                      f"    'decel': {vi['comfortable_decel']},\n" +
                      f"    'max_decel': {vi['decisive_decel']},\n" +
                      f"    'reaction_time': {vi['reaction_time']},\n" +
                      f"    'min_gap': {vi['min_gap']},\n" +
                      f"    'safety': {vi['multiplicative_safety']},\n" +
                      f"    'is_cacc': {vi['is_cacc']},\n" +
                      f"}}")
        lines.append("")

    # ── Helper functions ──
    lines.append("def idm_safe_gap(v, v_l, params):")
    lines.append("    \"\"\"IDM safe gap: s0 + v*T - v*(v_l-v_f)/(2*sqrt(a*b))\"\"\"")
    lines.append("    sqrt_ab = math.sqrt(max(params['accel'], 0.1) * max(params['decel'], 0.1))")
    lines.append("    return params['min_gap'] + v * params['reaction_time'] * params['safety'] - (v * (v - v_l)) / (2.0 * sqrt_ab)")
    lines.append("")

    lines.append("def compute_ttc(gap, v_f, v_l):")
    lines.append("    dv = v_f - v_l")
    lines.append("    if dv <= 0.1: return float('inf')")
    lines.append("    return gap / dv")
    lines.append("")

    # ── Main ──
    lines.append("def detect_conflicts(model):")
    lines.append("    \"\"\"Detect and resolve conflicts each simulation step.\"\"\"")
    lines.append("    scenario = model.getScenario()")
    lines.append("    vehicles = scenario.getVehicles()")
    lines.append("")
    lines.append("    for vehicle in vehicles:")
    lines.append("        try:")
    lines.append("            v = vehicle.getSpeed()")
    lines.append("            vtype = vehicle.getType()")
    lines.append("            front = vehicle.getFrontCar()")
    lines.append("            if front is None: continue")
    lines.append("            gap = vehicle.getBackToFrontDistance(front)")
    lines.append("            v_leader = front.getSpeed()")
    lines.append("")
    lines.append("            ttc = compute_ttc(gap, v, v_leader)")
    lines.append("            safe = idm_safe_gap(v, v_leader, params)")
    lines.append("")
    lines.append("            if ttc < TTC_THRESHOLD or gap < safe:")
    lines.append("                # Compute override deceleration")
    lines.append("                # v_target = v - a * dt  where dt = ttc")
    lines.append("                a_override = min(")
    lines.append("                    (v**2) / (2 * max(gap, 0.1)),")
    lines.append("                    params['decel'] * 0.8")
    lines.append("                )")
    lines.append("                v_target = v - a_override * max(ttc, 0.1)")
    lines.append("                vehicle.setSpeed(v_target)")
    lines.append("                vehicle.setColor(AngColor(255, 165, 0))")
    lines.append("        except Exception:")
    lines.append("            continue")
    lines.append("")

    lines.append("# Assign as event handler")
    lines.append("# model.addEventHandler(detect_conflicts)")
    lines.append("print('Aimsun conflict resolution module loaded.')")

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# Generic Fallback
# ──────────────────────────────────────────────────────────────

def _generate_generic_script(vehicle_infos: List[Dict], mpr: float) -> str:
    """Generate a platform-agnostic conflict resolution script."""

    lines = []
    lines.append("#" * 72)
    lines.append("# Generic Conflict Resolution — Platform-Agnostic")
    lines.append("#")
    lines.append("# Provides the mathematical framework for TTC-based conflict")
    lines.append("# detection and safe-distance-based resolution.")
    lines.append("#")
    lines.append(f"# AV MPR: {mpr*100:.0f}%")
    lines.append("#" * 72)
    lines.append("")
    lines.append("import math")
    lines.append("")
    lines.append("# ── Mathematical Formulas ──")
    lines.append("# Safe gap (SUMO Krauss / Wiedemann 99):")
    lines.append("#   s_star = minGap + v * tau - v * (v_l - v_f) / (2 * sqrt(a * b))")
    lines.append("#")
    lines.append("# Time-To-Collision:")
    lines.append("#   TTC = gap / (v_f - v_l)")
    lines.append("#")
    lines.append("# Required deceleration:")
    lines.append("#   a_req = v^2 / (2 * gap)")
    lines.append("")

    lines.append("# Vehicle parameters")
    lines.append("VEHICLES = []")
    lines.append("")

    for i, vi in enumerate(vehicle_infos, start=1):
        lines.append(f"VEHICLES.append({{")
        lines.append(f"    'name': '{vi['name']}',")
        lines.append(f"    'sae_level': {vi['sae_level']},")
        lines.append(f"    'accel': {vi['max_accel']},")
        lines.append(f"    'decel': {vi['comfortable_decel']},")
        lines.append(f"    'max_decel': {vi['decisive_decel']},")
        lines.append(f"    'reaction_time': {vi['reaction_time']},")
        lines.append(f"    'min_gap': {vi['min_gap']},")
        lines.append(f"    'safety': {vi['multiplicative_safety']},")
        lines.append(f"    'is_cacc': {vi['is_cacc']},")
        lines.append(f"}})")
        lines.append("")

    lines.append("")
    lines.append("def safe_distance(v, v_leader, veh):")
    lines.append("    \"\"\"Generalized safe distance formula.\"\"\"")
    lines.append("    cf = veh['comfortable_decel'] if 'comfortable_decel' in veh else veh['decel']")
    lines.append("    sqrt_ab = math.sqrt(max(veh['accel'], 0.1) * max(cf, 0.1))")
    lines.append("    delta_v = v - v_leader")
    lines.append("    return (veh['min_gap']")
    lines.append("            + v * veh['reaction_time'] * veh['safety']")
    lines.append("            + (v**2 / (2 * sqrt_ab)) * veh['safety']")
    lines.append("            - (v * delta_v) / (2 * sqrt_ab))")
    lines.append("")
    lines.append("def ttc(gap, v, v_leader):")
    lines.append("    dv = v - v_leader")
    lines.append("    if dv <= 0.1: return float('inf')")
    lines.append("    return gap / dv")
    lines.append("")
    lines.append("# Override template:")
    lines.append("#   if ttc(gap, v, v_l) < 1.5 and gap < safe_distance(v, v_l, params):")
    lines.append("#       a_req = v**2 / (2 * gap)")
    lines.append("#       v_target = sqrt(v**2 - 2 * a_req * ttc(gap, v, v_l))")
    lines.append("#       # Apply: set_speed(vehicle, v_target)")
    lines.append("")
    lines.append("print(f'Loaded {len(VEHICLES)} vehicle profiles. AV MPR={mpr*100:.0f}%')")

    return "\n".join(lines)
