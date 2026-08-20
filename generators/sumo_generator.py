"""
SUMO (Simulation of Urban MObility) configuration generator.

Generates a .rou.xml file with:
  - <vType> definitions containing car-following (Krauss) and lane-
    changing (SL2015) parameters
  - <vehicle> definitions with market-penetration-weighted distribution

SUMO Krauss Car-Following Model
================================
The safe gap that the model maintains is:

    s_star = minGap + v · tau - v · (v_l - v_f) / (2 · sqrt(a · b))

  where:
    minGap  — minimum gap at standstill          [m]
    tau     — driver reaction time                 [s]
    v       — follower speed                       [m/s]
    v_l     — leader speed                         [m/s]
    v_f     — follower speed                       [m/s]
    a       — maximum acceleration                  [m/s²]
    b       — maximum comfortable deceleration     [m/s²]

  The kinematic base sqrt(a * b) combines acceleration and deceleration
  into an effective "braking capability" — identical in form to the
  Wiedemann 99 braking distance term v² / (2·sqrt(a·b)).

  Egyptian driving:  tau short (0.7–1.0s), sigma high (0.8–1.0)
  AV platooning:     tau ≈ 0.3s (CACC), sigma ≈ 0

SL2015 Lane-Changing Model
==========================
    lcCooperative   — cooperation factor (0–1)
    lcAssertive     — max lateral speed
    lcSpeedAdd      — bonus speed for lane changes [m/s]
    lcLookAhead     — look-ahead time [s]

  Egyptian: aggressive changes (high lcAssertive, low cooperation)
  AV:       smooth, efficient changes
"""

from models.calibration import VehicleProfile
from models.egyptian_fleet import EGYPTIAN_FLEET
from typing import List, Tuple
import xml.etree.ElementTree as ET
import xml.dom.minidom


def _fmt(val: float) -> str:
    """Format float for SUMO XML (trimmed, 4 decimals)."""
    s = f"{val:.4f}"
    return s


def generate_sumo_config(
    egyptian_profiles: List[VehicleProfile],
    av_profiles: List[Tuple[VehicleProfile, float]],
    mpr: float,
    routes: List[dict] = None,
    output_id: str = "ring_road_scenario",
    simulation_time: int = 3600,
    num_vehicles: int = 500,
) -> str:
    """
    Generate a SUMO-compatible .rou.xml file.

    Parameters
    ----------
    egyptian_profiles : Egyptian vehicle profiles (SAE Level 0)
    av_profiles       : list of (AV profile, proportion) tuples
    mpr               : AV market penetration rate (0.0–1.0)
    routes            : list of {'id': str, 'edges': [str]} dicts
    output_id         : prefix for output filenames
    simulation_time   : [s]
    num_vehicles      : total number of vehicles to insert

    Returns
    -------
    String containing the .rou.xml content.
    """
    root = ET.Element("routes")
    root.set("xmlns", "http://sumo.dlr.de/xsd/routes_file.xsd")
    root.set("xmlns:xs", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xs:noNamespaceSchemaLocation", "http://sumo.dlr.de/xsd/routes_file.xsd")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xmlns:xi", "http://www.w3.org/2001/XInclude")

    # ── Vehicle Type Definitions ──
    all_profiles: List[VehicleProfile] = list(egyptian_profiles)
    all_profiles.extend(p for p, _ in av_profiles)

    for i, profile in enumerate(all_profiles, start=1):
        params = profile.to_sumo()
        vtype = ET.SubElement(root, "vType")
        vtype.set("id", f"veh_{i:02d}")
        vtype.set("vClass", "passenger" if profile.dimensions.length < 8 else "truck")
        vtype.set("color", profile.color)
        vtype.set("accel", f"{params['accel']:.4f}")
        vtype.set("decel", f"{params['decel']:.4f}")
        vtype.set("tau", f"{params['tau']:.4f}")
        vtype.set("minGap", f"{params['minGap']:.4f}")
        vtype.set("sigma", f"{params['sigma']:.4f}")
        vtype.set("k", f"{params['k']:.4f}")
        vtype.set("phi", f"{params['phi']:.4f}")
        vtype.set("delta", f"{params['delta']:.4f}")
        vtype.set("speedFactor", f"{params['speedFactor']:.4f}")
        vtype.set("speedDev", f"{params['speedDev']:.4f}")
        vtype.set("length", f"{params['length']:.4f}")
        vtype.set("width", f"{params['width']:.4f}")

        # Lateral / lane-changing parameters (SL2015)
        vtype.set("lcCooperative", f"{params['lcCooperative']:.4f}")
        vtype.set("lcAssertive", f"{params['lcAssertive']:.4f}")
        vtype.set("lcSpeedAdd", f"{params['lcSpeedAdd']:.4f}")
        vtype.set("lcLookahead", f"{params['lcLookahead']:.4f}")
        vtype.set("lcTimeToIndent", f"{params['lcTimeToIndent']:.4f}")

        # Custom parameters for AV / CACC (used by TraCI)
        if profile.sae_level >= 4:
            vtype.set("param-cacc-headway", f"{getattr(profile, 'cacc_headway', 0.3):.4f}")
            vtype.set("param-defensive-factor", f"{getattr(profile, 'defensive_factor', 3.0):.4f}")

        # Egyptian-specific: microbus dwell times
        if profile.dwell and profile.dwell is not None:
            vtype.set("param-dwell-mean", f"{profile.dwell.mean_duration:.4f}")
            vtype.set("param-dwell-std", f"{profile.dwell.std_dev:.4f}")
            vtype.set("param-dwell-freq", f"{profile.dwell.stop_frequency:.4f}")
            vtype.set("param-dwell-dist", profile.dwell.distribution)

        vtype.set("name", f"{profile.name} (SAE L{profile.sae_level})")

    # ── Dwell time stops for Microbus ──
    for profile in all_profiles:
        if profile.vehicle_type.value.startswith("Microbus") and profile.dwell:
            stops = ET.SubElement(root, "additional")
            for j in range(3):  # Define 3 typical stop locations
                stop = ET.SubElement(stops, "busStop")
                stop.set("id", f"microbus_stop_{j}")
                stop.set("lane", f"lane_{j}")
                stop.set("friendlyPos", "true")
                stop.set("duration", f"{profile.dwell.mean_duration:.2f}")
            break

    # ── Routes ──
    if not routes:
        # Default: circular route on Ring Road
        routes = [{"id": "ring_cw", "edges": ["ring_road_1", "ring_road_2",
                   "ring_road_3", "ring_road_4"]},
                  {"id": "ring_ccw", "edges": ["ring_road_4", "ring_road_3",
                   "ring_road_2", "ring_road_1"]}]

    routes_elem = ET.SubElement(root, "routes")
    for r in routes:
        route = ET.SubElement(routes_elem, "route")
        route.set("id", r["id"])
        route.set("edges", " ".join(r["edges"]))

    # ── Vehicle Distribution ──
    # Calculate per-type volumes based on fleet composition
    egyptian_total = max(0.0, 1.0 - mpr)
    total_egyptian_proportion = sum(p for _, p in EGYPTIAN_FLEET) if egyptian_profiles else 1.0
    if total_egyptian_proportion > 0:
        egyptian_weights = [p / total_egyptian_proportion for _, p in EGYPTIAN_FLEET]
    else:
        egyptian_weights = [1.0]

    # Vehicles per type
    vehicle_defs = []

    # Egyptian vehicles
    for i, profile in enumerate(egyptian_profiles, start=1):
        veh_count = int(num_vehicles * egyptian_total * egyptian_weights[i - 1])
        if veh_count > 0:
            vehicle_defs.append({
                "vtype_id": f"veh_{i:02d}",
                "count": veh_count,
                "profile": profile,
            })

    # AV vehicles
    for j, (profile, prop) in enumerate(av_profiles):
        idx = len(egyptian_profiles) + j + 1
        veh_count = int(num_vehicles * mpr * prop)
        if veh_count > 0:
            vehicle_defs.append({
                "vtype_id": f"veh_{idx:02d}",
                "count": veh_count,
                "profile": profile,
            })

    # Insert vehicles
    veh_idx = 0
    period = simulation_time  # seconds

    for vd in vehicle_defs:
        # Distribute vehicles evenly over time
        veh_period = period / vd["count"] if vd["count"] > 0 else period

        for k in range(vd["count"]):
            route_id = routes[0]["id"]  # Default to first route
            if len(routes) > 1 and k % 2 == 1:
                route_id = routes[1]["id"]

            vehicle = ET.SubElement(root, "vehicle")
            vehicle.set("id", f"{vd['vtype_id']}_{veh_idx}")
            vehicle.set("type", vd["vtype_id"])
            vehicle.set("route", route_id)
            vehicle.set("depart", f"{k * veh_period:.2f}")
            vehicle.set("departLane", "best")
            vehicle.set("departSpeed", "max")
            veh_idx += 1

    # ── Configuration header as comment ──
    comment = ET.Comment(
        f"\n"
        f"  SUMO Route Configuration — SAE Calibration Hub\n"
        f"  Egyptian Conventional Fleet + AV Fleet (MPR={mpr*100:.0f}%)\n"
        f"  Total vehicles: {veh_idx}\n"
        f"  Simulation time: {simulation_time}s\n"
        f"  Car-following model: Krauss\n"
        f"  Lane-changing model: SL2015\n"
        f"  Safe gap formula: s_star = minGap + v*tau - v*(v_l-v_f)/(2*sqrt(a*b))\n"
        f"  "
    )
    root.insert(0, comment)

    rough = ET.tostring(root, encoding="unicode")
    dom = xml.dom.minidom.parseString(rough)
    return dom.toprettyxml(indent="  ", encoding="UTF-8").decode("UTF-8")


def generate_sumo_additional_file(
    egyptian_profiles: List[VehicleProfile],
    av_profiles: List[Tuple[VehicleProfile, float]],
    mpr: float,
) -> str:
    """
    Generate a SUMO .add.xml file with:
      - Vehicle type parameter overrides
      - Route constraints
      - Dwell-time stop definitions for Egyptian microbuses

    The .add.xml file supplements the .rou.xml with additional
    parameters that TraCI can access at runtime.
    """
    root = ET.Element("additional")
    root.set("xmlns", "http://sumo.dlr.de/xsd/additional_file.xsd")

    all_profiles: List[VehicleProfile] = list(egyptian_profiles)
    all_profiles.extend(p for p, _ in av_profiles)

    # Vehicle type parameters (for TraCI access)
    for i, profile in enumerate(all_profiles, start=1):
        vtype = ET.SubElement(root, "vehicleType")
        vtype.set("id", f"veh_{i:02d}")
        vtype.set("vClass", "passenger" if profile.dimensions.length < 8 else "truck")

        # Custom parameters
        ET.SubElement(vtype, "param", {
            "key": "sae_level",
            "value": str(profile.sae_level),
        })
        ET.SubElement(vtype, "param", {
            "key": "multiplicative_safety",
            "value": f"{profile.car_following.multiplicative_safety:.4f}",
        })
        ET.SubElement(vtype, "param", {
            "key": "sigma",
            "value": f"{profile.car_following.sigma:.4f}",
        })

        if profile.sae_level >= 4:
            ET.SubElement(vtype, "param", {
                "key": "cacc_headway",
                "value": f"{getattr(profile, 'cacc_headway', 0.3):.4f}",
            })
            ET.SubElement(vtype, "param", {
                "key": "defensive_factor",
                "value": f"{getattr(profile, 'defensive_factor', 3.0):.4f}",
            })

        if profile.dwell:
            ET.SubElement(vtype, "param", {
                "key": "dwell_mean",
                "value": f"{profile.dwell.mean_duration:.4f}",
            })
            ET.SubElement(vtype, "param", {
                "key": "dwell_freq",
                "value": f"{profile.dwell.stop_frequency:.4f}",
            })
            ET.SubElement(vtype, "param", {
                "key": "dwell_dist",
                "value": profile.dwell.distribution,
            })

    # Lanes / edge constraints (Ring Road specific)
    for edge in ["ring_road_1", "ring_road_2", "ring_road_3", "ring_road_4"]:
        lane = ET.SubElement(root, "lane")
        lane.set("id", f"{edge}_0")
        lane.set("speed", "33.33")  # 120 km/h speed limit on Ring Road

        # Egyptian night-time truck lane restriction
        for profile in all_profiles:
            if profile.night_dominant:
                et = ET.SubElement(lane, "restriction")
                et.set("value", "vehicleType")
                et.set("param", "allow")
                et.set("value", "truck")
                break

    rough = ET.tostring(root, encoding="unicode")
    dom = xml.dom.minidom.parseString(rough)
    return dom.toprettyxml(indent="  ", encoding="UTF-8").decode("UTF-8")
