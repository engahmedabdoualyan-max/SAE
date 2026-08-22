"""
PTV VISSIM configuration generator.

Generates two artifacts:
  1. An INPX-compatible XML vehicle-type configuration
  2. A Python COM API script that applies Wiedemann 99 parameters

Wiedemann 99 psycho-physical car-following model:
  The model partitions the (gap, accel) plane into five regions
  defined by the CC0–CC4 boundaries.  Within each region the driver
  exhibits different behavior:

    Region 1 (Free):      gap > CC1  → accelerate to desired speed
    Region 2 (Safe):      CC0 < gap < CC1 → maintain current behavior
    Region 3 (Following): CC2 < gap < CC3 → synchronize with leader
    Region 4 (Braking):   gap < CC4   → emergency deceleration

  The acceleration in the following region is:

      a = CC5 * (1 - (v/v0)^1)  when gap > CC1  (free accel)
      a = -CC6 * (1 - gap/CC3)  when CC2 < gap < CC3
      a = -CC7                 when gap <= CC4

  where v0 is the desired speed and CC5–CC7 control accel/decel.
"""

import xml.etree.ElementTree as ET
import xml.dom.minidom

from models.calibration import VehicleProfile, FleetComposition
from models.egyptian_fleet import EGYPTIAN_FLEET
from models.autonomous_fleet import AV_FLEET
from typing import List, Tuple


def _format_float(val: float, width: int = 6) -> str:
    """Format a float for INPX output."""
    return f"{val:.{width}f}".rstrip("0").rstrip(".")


def _build_vehicle_type_element(vt: ET.Element, profile: VehicleProfile) -> ET.Element:
    """
    Add VISSIM vehicle-type behavior parameters (Wiedemann 99)
    as child elements of the given <VehicleType> element.
    """
    cf = profile.car_following
    lc = profile.lane_changing
    w99 = profile.to_wiedemann99()

    # Car-following parameters (CC0–CC9)
    cf_elem = ET.SubElement(vt, "CarFollowing")
    cf_elem.set("Model", "Wiedemann99")
    for key in ["CC0", "CC1", "CC2", "CC3", "CC4", "CC5", "CC6", "CC7", "CC8", "CC9"]:
        param = ET.SubElement(cf_elem, key)
        param.text = _format_float(w99[key])

    # Lateral / lane-changing parameters (OP0–OP16)
    lc_elem = ET.SubElement(vt, "LaneChanging")
    for key in ["OP0", "OP1", "OP2", "OP3", "OP4", "OP5", "OP6", "OP7",
                "OP8", "OP9", "OP10", "OP11", "OP12", "OP13", "OP14",
                "OP15", "OP16"]:
        param = ET.SubElement(lc_elem, key)
        param.text = _format_float(w99[key])

    # Desired speed distribution
    speed_elem = ET.SubElement(vt, "DesiredSpeed")
    speed_elem.set("Distribution", "Normal")
    speed_elem.set("Mean", _format_float(cf.desired_speed * 3.6))  # km/h
    speed_elem.set("StdDev", "5.0")

    return vt


def generate_vissim_config(
    egyptian_profiles: List[VehicleProfile],
    av_profiles: List[Tuple[VehicleProfile, float]],
    mpr: float,
    routes: List[dict] = None,
) -> str:
    """
    Generate an INPX-compatible XML configuration file for PTV VISSIM.

    Produces an XML document with:
      - Vehicle type definitions (with Wiedemann 99 CC/OP parameters)
      - Vehicle flows / routes with market-penetration weighting

    Parameters
    ----------
    egyptian_profiles : list of Egyptian vehicle profiles (SAE L0)
    av_profiles       : list of (AV profile, proportion) tuples
    mpr               : autonomous vehicle market penetration rate (0–1)
    routes            : optional route definitions [{'id':..., 'edges':[...]}]

    Returns
    -------
    XML string (INPX-compatible).
    """
    root = ET.Element("VISSIMConfig")
    root.set("xmlns", "http://www.ptv.de/vissim")
    root.set("version", "2024")

    # ── Vehicle Types ──
    vts = ET.SubElement(root, "VehicleTypes")

    for i, profile in enumerate(egyptian_profiles, start=1):
        vt = ET.SubElement(vts, "VehicleType")
        vt.set("Name", profile.name)
        vt.set("MapID", str(i))
        vt.set("Length", _format_float(profile.dimensions.length))
        vt.set("Width", _format_float(profile.dimensions.width))
        vt.set("TypeCategory", "0")  # Conventional
        _build_vehicle_type_element(vt, profile)

    # AV vehicle types (if any)
    for j, (profile, prop) in enumerate(av_profiles):
        vt = ET.SubElement(vts, "VehicleType")
        key = len(egyptian_profiles) + j + 1
        vt.set("Name", profile.name)
        vt.set("MapID", str(key))
        vt.set("Length", _format_float(profile.dimensions.length))
        vt.set("Width", _format_float(profile.dimensions.width))
        vt.set("TypeCategory", "100")  # AV / connected
        _build_vehicle_type_element(vt, profile)

    # ── Routes & Vehicle Flows ──
    if routes:
        routes_elem = ET.SubElement(root, "Routes")
        for r in routes:
            rt = ET.SubElement(routes_elem, "Route")
            rt.set("Name", r["id"])
            rt.set("Edges", ";".join(r["edges"]))

    flows_elem = ET.SubElement(root, "VehicleFlows")
    vehicle_id = 1

    # Egyptian conventional flows
    total_egyptian = 1.0 - mpr
    for profile, _ in EGYPTIAN_FLEET:
        flow = ET.SubElement(flows_elem, "VehicleFlow")
        flow.set("ID", str(vehicle_id))
        flow.set("VehicleType", profile.name)
        # Distribute proportionally within Egyptian fleet
        flow.set("Volume", "1000")
        vehicle_id += 1

    # AV flows
    for profile, prop in av_profiles:
        flow = ET.SubElement(flows_elem, "VehicleFlow")
        flow.set("ID", str(vehicle_id))
        flow.set("VehicleType", profile.name)
        flow.set("Volume", str(round(1000 * prop * mpr)))
        vehicle_id += 1

    # Pretty-print
    rough = ET.tostring(root, encoding="unicode")
    dom = xml.dom.minidom.parseString(rough)
    return dom.toprettyxml(indent="  ", encoding="UTF-8").decode("UTF-8")


def generate_vissim_com_script(
    egyptian_profiles: List[VehicleProfile],
    av_profiles: List[Tuple[VehicleProfile, float]],
    mpr: float,
    network_path: str = "ring_road.inpx",
    sim_duration: int = 3600,
) -> str:
    """
    Generate a Python script that uses the PTV VISSIM COM API to
    programmatically set Wiedemann 99 parameters and run a simulation.

    The script includes:
      - Loading the network
      - Setting car-following parameters (CC0–CC9)
      - Setting lane-changing / behavioral thresholds (OP0–OP16)
      - Setting desired speed distributions
      - Running the simulation
      - Outputting results

    Usage:
        1. Open VISSIM and load your .inpx network
        2. Run this script (requires pywin32)
        3. The script sets parameters and runs the simulation
    """
    lines = []
    lines.append("#" * 72)
    lines.append("# PTV VISSIM COM API Script — Egyptian Fleet Calibration")
    lines.append("#")
    lines.append("# Sets Wiedemann 99 parameters for Egyptian driving behavior")
    lines.append("# and SAE Level 4-5 autonomous vehicles with CACC/V2X.")
    lines.append(f"# MPR (AV penetration): {mpr*100:.0f}%")
    lines.append(f"# Network: {network_path}")
    lines.append(f"# Simulation duration: {sim_duration} s")
    lines.append("#")
    lines.append("# Requires: Python for VISSIM (pywin32)")
    lines.append("# Usage: Run inside VISSIM Python console or via COM automation")
    lines.append("#" * 72)
    lines.append("")
    lines.append("import win32com.client")
    lines.append("import pythoncom")
    lines.append("import time")
    lines.append("import csv")
    lines.append("")
    lines.append("# ── Connect to VISSIM ──")
    lines.append("try:")
    lines.append("    vissim = win32com.client.GetActiveObject(\"Vissim.Vissim-64\")")
    lines.append("    print(\"Connected to running VISSIM instance\")")
    lines.append("except Exception:")
    lines.append("    vissim = win32com.client.Dispatch(\"Vissim.Vissim-64\")")
    lines.append("    vissim.LoadNet(r\"{}\")".format(network_path))
    lines.append("    print(\"Loaded network: {}\")")
    lines.append("")
    lines.append("# ── Wiedemann 99 Parameter Documentation ──")
    lines.append("# CC0: Start of safe region (minimum gap)  [m]")
    lines.append("# CC1: End of safe region (dynamic)        [m]")
    lines.append("# CC2: Start of following region           [m]")
    lines.append("# CC3: End of following region               [m]")
    lines.append("# CC4: Start of braking region             [m]")
    lines.append("# CC5: Maximum acceleration                [m/s²]")
    lines.append("# CC6: Comfortable deceleration            [m/s²]")
    lines.append("# CC7: Emergency deceleration              [m/s²]")
    lines.append("# CC8: Standstill gap                      [m]")
    lines.append("# CC9: Standstill (start-up) acceleration  [m/s²]")
    lines.append("# OP0: Following time (reaction)           [s]")
    lines.append("# OP1: Multiplicative safety factor          [-]")
    lines.append("# OP2: Acceleration time                    [s]")
    lines.append("# OP3: Lag time                             [s]")
    lines.append("# OP4: Right-lane forcing threshold          [%]")
    lines.append("# OP5: Gap detection time                    [s]")
    lines.append("# OP6: Slowdown threshold                    [s]")
    lines.append("# OP7: Brake threshold                       [s]")
    lines.append("# OP8: Time for gap detection                 [s]")
    lines.append("# OP9: Prob. brake at standstill               [-]")
    lines.append("# OP10: Dwell time at standstill              [s]")
    lines.append("# OP11: Standstill start time                  [s]")
    lines.append("# OP12: Max standstill cycles                   [-]")
    lines.append("# OP13: Prob. slow in safe region               [-]")
    lines.append("# OP14: Prob. slow in following region          [-]")
    lines.append("# OP15: Lane-change probability                [%]")
    lines.append("# OP16: Standstill distance                     [m]")
    lines.append("")
    lines.append("")

    # ── Vehicle type definitions ──
    all_profiles: List[VehicleProfile] = list(egyptian_profiles)
    all_profiles.extend(p for p, _ in av_profiles)

    lines.append("# ── Vehicle Type Parameter Mapping ──")
    lines.append("# Each vehicle type is configured with Wiedemann 99 parameters")
    lines.append("# derived from the mathematical model:")
    lines.append("#   d_safe = CC8 + v * OP0 * OP1 + [v² / (2 * sqrt(CC5 * CC6))] * OP1")
    lines.append("")

    for i, profile in enumerate(all_profiles, start=1):
        params = profile.to_wiedemann99()
        lines.append(f"# --- Vehicle Type {i+1}: {profile.name} (SAE L{profile.sae_level}) ---")
        lines.append(f"vt_{i} = vissim.Net.VehicleTypes.ItemByKey({i})")

        for key in ["CC0","CC1","CC2","CC3","CC4","CC5","CC6","CC7","CC8","CC9",
                     "OP0","OP1","OP2","OP3","OP4","OP5","OP6","OP7","OP8",
                     "OP9","OP10","OP11","OP12","OP13","OP14","OP15","OP16"]:
            val = params[key]
            lines.append(f"vt_{i}.SetAttValue(\"{key}\", {val:.4f})")

        # Desired speed
        lines.append(f"vt_{i}.SetAttValue(\"UPARAM1\", {profile.car_following.desired_speed * 3.6:.2f})  # km/h desired speed")
        lines.append("")

    # ── Dwell time simulation for Microbus ──
    has_microbus = any(p.vehicle_type.value.startswith("Microbus") for p in all_profiles)
    if has_microbus:
        mb = next(p for p in all_profiles if p.vehicle_type.value.startswith("Microbus"))
        dwell = mb.dwell
        if dwell:
            lines.append("# ── Egyptian Microbus Dwell Time Simulation ──")
            lines.append("# Frequent roadside stops for passenger loading/unloading")
            lines.append("# Dwell distribution: {} (mean={:.1f}s, std={:.1f}s, freq={:.2f}/km)".format(
                dwell.distribution, dwell.mean_duration, dwell.std_dev, dwell.stop_frequency))
            lines.append("import random")
            lines.append(f"DWELL_MEAN = {dwell.mean_duration}")
            lines.append(f"DWELL_STD = {dwell.std_dev}")
            lines.append(f"STOP_FREQ = {dwell.stop_frequency}")
            lines.append("")
            lines.append("def simulate_microbus_dwell(vehicle_id, distance_traveled):")
            lines.append("    \"\"\"Simulate frequent microbus stops along a route.\"\"\"")
            lines.append("    # Probability of a stop occurrence")
            lines.append("    stop_prob = STOP_FREQ * 0.01  # per 100m interval")
            lines.append("    if random.random() < stop_prob:")
            lines.append("        if DWELL_DISTRIBUTION == 'exponential':")
            lines.append("            dwell_time = random.expovariate(1.0 / DWELL_MEAN)")
            lines.append("        else:")
            lines.append("            dwell_time = max(0, random.gauss(DWELL_MEAN, DWELL_STD))")
            lines.append("        vissim.Vehicles.ItemByKey(vehicle_id).SetAttValue(\"TimeGap\", dwell_time)")
            lines.append("        print(f\"  Microbus {vehicle_id} dwells for {dwell_time:.1f}s\")")
            lines.append("")
            lines.append("DWELL_DISTRIBUTION = \"{}\"".format(dwell.distribution))
            lines.append("")

    # ── Simulation settings ──
    lines.append("# ── Simulation Settings ──")
    lines.append(f"vissim.Simulation.SetAttValue(\"SimPeriod\", {sim_duration})")
    lines.append("vissim.Simulation.SetAttValue(\"Resolution\", 10)")
    lines.append(f"vissim.Simulation.SetAttValue(\"NumRuns\", 1)")
    lines.append("")

    # ── Run simulation ──
    lines.append("# ── Run Simulation ──")
    lines.append("vissim.Simulation.Run()")

    _mpr_pct = f"{mpr * 100:.0f}"
    lines.append("")
    lines.append("# ── Output Results ──")
    lines.append("results = vissim.Output")
    lines.append("# Access travel times, delays, and conflict data")
    lines.append(f'with open("vissim_results_{_mpr_pct}mpr.csv", "w", newline="") as f:')
    lines.append("    writer = csv.writer(f)")
    lines.append("    writer.writerow([\"VehicleType\", \"AvgTravelTime\", \"AvgDelay\", \"AvgSpeed\"])")

    # Per vehicle type results
    for i, profile in enumerate(all_profiles):
        lines.append(f"    # Results for {profile.name}")
        lines.append(f"    vt_{i+1}_tt = vissim.Results[\"TravelTime\"].ItemByKey({i+1}).Value")
        lines.append(f"    vt_{i+1}_delay = vissim.Results[\"Delay\"].ItemByKey({i+1}).Value")
        lines.append(f"    vt_{i+1}_speed = vissim.Results[\"Speed\"].ItemByKey({i+1}).Value")
        lines.append(f"    writer.writerow([\"{profile.name}\", vt_{i+1}_tt, vt_{i+1}_delay, vt_{i+1}_speed])")

    lines.append("")
    lines.append("print(\"Simulation complete. Results saved to vissim_results_{:.0f}mpr.csv\")".format(mpr * 100))
    lines.append("print(\"Egyptian fleet + AV fleet (MPR={:.0f}%) configured successfully.\")".format(mpr * 100))

    return "\n".join(lines)
