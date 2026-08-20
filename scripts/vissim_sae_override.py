########################################################################
# PTV VISSIM COM API — Real-Time Conflict Detection & Resolution
#
# Uses Wiedemann 99 parameters for conflict detection.
# Safe distance: d_safe = CC8 + v * OP0 * OP1 + [v^2 / (2 * sqrt(CC5*CC6))] * OP1
#
# AV MPR: 0%
#
# Requires: Python for VISSIM (pywin32)
########################################################################

import win32com.client
import math
import random

# ── Configuration ──
TTC_THRESHOLD = 1.5     # Time-to-collision trigger [s]
CACC_HEADWAY = 0.3      # CACC gap for AV platoons [s]
DEFENSIVE_FACTOR = 3.0  # Safety boost for AV when cut off

# ── Vehicle Parameters (Wiedemann 99) ──
VEH_1 = {
    'name': 'Egyptian Microbus',
    'sae_level': 0,
    'CC5': 3.0,
    'CC6': 6.0,
    'CC7': 10.8,
    'CC8': 1.2,
    'CC9': 0.3500,
    'OP0': 0.7,
    'OP1': 0.35,
    'is_cacc': False,
    'cacc_headway': None,
}

VEH_2 = {
    'name': 'Mlaiky (Passenger Car)',
    'sae_level': 0,
    'CC5': 2.4,
    'CC6': 5.0,
    'CC7': 8.0,
    'CC8': 1.8,
    'CC9': 0.4250,
    'OP0': 0.85,
    'OP1': 0.45,
    'is_cacc': False,
    'cacc_headway': None,
}

VEH_3 = {
    'name': 'Naql (Heavy Truck)',
    'sae_level': 0,
    'CC5': 0.9,
    'CC6': 4.5,
    'CC7': 6.3,
    'CC8': 3.0,
    'CC9': 0.6500,
    'OP0': 1.3,
    'OP1': 0.55,
    'is_cacc': False,
    'cacc_headway': None,
}

VEHICLE_DB = {
    vt_1: VEH_1,
    vt_2: VEH_2,
    vt_3: VEH_3,
}

def w99_safe_distance(speed, params, v_leader=None):
    """Wiedemann 99 safe distance formula."""
    cc5 = params['CC5']
    cc6 = params['CC6']
    cc8 = params['CC8']
    op0 = params['OP0']  # reaction time
    op1 = params['OP1']  # safety factor
    sqrt_ab = math.sqrt(max(cc5, 0.1) * max(cc6, 0.1))
    static = cc8
    reaction = speed * op0 * op1
    braking = (speed ** 2) / (2.0 * sqrt_ab) * op1
    closing = 0.0
    if v_leader is not None:
        v_rel = speed - v_leader
        closing = (speed * v_rel) / (2.0 * sqrt_ab)
    return static + reaction + braking - closing

def compute_ttc(gap, v_follower, v_leader):
    delta_v = v_follower - v_leader
    if delta_v <= 0.1:
        return float('inf')
    return gap / delta_v

def required_deceleration(v, gap):
    """a = v^2 / (2 * gap)"""
    if gap <= 0.01:
        return 8.0  # emergency
    return (v ** 2) / (2.0 * gap)

def run_conflict_resolution():
    """Run conflict detection loop for the current simulation step."""
    vehicles = vissim.Simulation.Vehicles
    for i in range(1, vehicles.Count + 1):
        try:
            veh = vehicles.ItemByIndex(i - 1)
            vid = veh.AttValue('ID')
            vtype_key = int(veh.AttValue('Type'))
            v_speed = veh.AttValue('Speed')
            front_dist = veh.AttValue('FrontGap')
            leader_speed = veh.AttValue('SpeedLeader')

            if vtype_key not in VEHICLE_DB:
                continue
            params = VEHICLE_DB[vtype_key]

            gap = front_dist  # Vissim reports front gap directly
            ttc = compute_ttc(gap, v_speed, leader_speed)

            # CACC Platooning
            if params['is_cacc'] and params.get('cacc_headway'):
                leader_type = int(vissim.Vehicles.ItemByKey(leader_speed).AttValue('Type'))
                if leader_type in VEHICLE_DB and VEHICLE_DB[leader_type].get('is_cacc'):
                    cacc_gap = v_speed * CACC_HEADWAY + params['CC8']
                    if gap < cacc_gap:
                        # Tight platoon: no intervention needed
                        continue

            # Standard conflict detection
            safe = w99_safe_distance(v_speed, params, leader_speed)
            if gap < safe or ttc < TTC_THRESHOLD:
                a_req = required_deceleration(v_speed, gap)
                if a_req > params['CC6'] * 0.8:
                    # Apply deceleration override
                    v_target = math.sqrt(max(0.0, v_speed**2 - 2 * a_req * ttc))
                    veh.SetAttValue('SpeedOverride', v_target)
                    veh.SetAttValue('Color', '(255,165,0)')

        except Exception:
            continue

    return True

# Run at each simulation step
# In VISSIM: assign to a 'Decision Maker' or run via DLL callback
# Or call: vissim.Simulation.RunSingleStep() in a loop
print('VISSIM conflict resolution module loaded.')
print('Call run_conflict_resolution() at each simulation step.')