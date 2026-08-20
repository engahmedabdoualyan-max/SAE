"""SAE Calibration Hub — Streamlit Web Application
===============================================

A research-assistant platform for calibrating micro-simulation
models of Egyptian vehicle fleets interacting with autonomous
vehicles on the Cairo Ring Road.

Author: SAE Calibration Hub
"""

import copy
import math
from typing import List, Tuple

import pandas as pd
import streamlit as st

from models.calibration import (
    VehicleProfile,
    VehicleType,
    Platform,
    compute_gap_acceptance,
    safe_distance_wiedemann,
    safe_distance_sumo,
)
from models.egyptian_fleet import (
    EGYPTIAN_MICROBUS,
    EGYPTIAN_MLAIKY,
    EGYPTIAN_NAQL,
    EGYPTIAN_FLEET,
)
from models.autonomous_fleet import (
    AV_LEVEL_1_2,
    AV_LEVEL_3,
    AV_LEVEL_4_5,
    AV_FLEET_MAP,
)

from generators.vissim_generator import generate_vissim_config, generate_vissim_com_script
from generators.sumo_generator import generate_sumo_config, generate_sumo_additional_file
from generators.aimsun_generator import generate_aimsun_script
from generators.api_script_generator import generate_conflict_script


st.set_page_config(
    page_title="SAE Calibration Hub",
    page_icon="🚗",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""<style>
    h1 { color: #1E3A8A; border-bottom: 3px solid #1E3A8A; padding-bottom: 0.3em; }
    h2 { color: #1E40AF; margin-top: 1.5em; }
    h3 { color: #3730A3; }
    .metric-card { background: #F0F9FF; padding: 1em; border-radius: 8px; border-left: 4px solid #0EA5E9; }
    .stDownloadButton button { width: 100%; }
    code { background: #1e1e1e; color: #d4d4d4; padding: 2px 6px; border-radius: 3px; }
</style>""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════
# Parameter Adjustment Helpers
# ══════════════════════════════════════════════════════════════

def apply_egyptian_overrides(
    profile: VehicleProfile,
    rt_mult: float = 1.0,
    safety_mult: float = 1.0,
    aggressiveness: float = 1.0,
    lane_change_mult: float = 1.0,
    dwell_mult: float = 1.0,
) -> VehicleProfile:
    """Return a deep copy of *profile* with Egyptian driving-style
    parameters adjusted by user-supplied multipliers.

    Multiplicative adjustments preserve relative differences between
    vehicle types (e.g., microbus remains more aggressive than mlaiky).
    """
    p = copy.deepcopy(profile)
    cf = p.car_following
    lc = p.lane_changing

    cf.reaction_time = max(0.3, cf.reaction_time * rt_mult)
    cf.multiplicative_safety = max(0.05, min(0.95, cf.multiplicative_safety * safety_mult))
    cf.max_accel *= aggressiveness
    cf.comfortable_decel *= aggressiveness
    cf.decisive_decel *= aggressiveness
    cf.standstill_accel *= aggressiveness
    cf.sigma = min(1.0, cf.sigma * (0.5 + aggressiveness))

    lc.probability = max(10.0, min(100.0, lc.probability * lane_change_mult))
    lc.gap_detection_time = max(0.3, cf.reaction_time)
    lc.slowdown_prob = min(1.0, lc.slowdown_prob * aggressiveness)
    lc.brake_prob = min(1.0, lc.brake_prob * aggressiveness)

    if p.dwell:
        p.dwell.mean_duration *= dwell_mult
        p.dwell.std_dev *= dwell_mult

    return p


def apply_av_overrides(
    profile: VehicleProfile,
    rt_mult: float = 1.0,
    safety_mult: float = 1.0,
    cacc_mult: float = 1.0,
    defensive_mult: float = 1.0,
) -> VehicleProfile:
    """Return a deep copy of *profile* with AV parameters adjusted."""
    p = copy.deepcopy(profile)
    cf = p.car_following

    cf.reaction_time = max(0.1, cf.reaction_time * rt_mult)
    cf.multiplicative_safety = max(0.5, min(0.99, cf.multiplicative_safety * safety_mult))

    if hasattr(p, "cacc_headway") and p.cacc_headway is not None:
        p.cacc_headway = max(0.1, p.cacc_headway * cacc_mult)

    if hasattr(p, "defensive_factor") and p.defensive_factor is not None:
        p.defensive_factor = max(1.0, p.defensive_factor * defensive_mult)

    return p


# ══════════════════════════════════════════════════════════════
# Sidebar Configuration
# ══════════════════════════════════════════════════════════════

def sidebar_config() -> dict:
    """Build the sidebar configuration widgets."""
    st.sidebar.markdown("# 🚗 SAE Calibration Hub")
    st.sidebar.markdown("---")

    platform = st.sidebar.selectbox(
        "Micro-Simulation Platform",
        options=[p.value for p in Platform],
        index=0,
        help="Select the simulation software to generate configuration for.",
    )
    platform_enum = Platform(platform)

    st.sidebar.markdown("---")

    mpr_pct = st.sidebar.slider(
        "AV Market Penetration Rate (MPR)",
        min_value=0, max_value=100, value=30, step=5,
        help="Percentage of autonomous vehicles in the traffic stream. "
             "0% = all conventional Egyptian fleet; 100% = all AVs.",
    )
    mpr = mpr_pct / 100.0

    st.sidebar.markdown("---")
    st.sidebar.markdown("### 🚙 Egyptian Conventional Fleet (SAE L0)")
    egyptian_selection = {
        "microbus": st.sidebar.checkbox("Microbus (Aggressive)", value=True,
            help="High accel/decel, frequent stops, erratic lane changes"),
        "mlaijy": st.sidebar.checkbox("Mlaiky (Passenger Car)", value=True,
            help="Reduced safety distances, cooperative lane changes"),
        "naql": st.sidebar.checkbox("Naql (Heavy Truck)", value=True,
            help="Low power-to-weight, long braking, night-dominant"),
    }

    if not any(egyptian_selection.values()) and mpr < 1.0:
        st.sidebar.warning("⚠️ Select at least one Egyptian vehicle type.")

    st.sidebar.markdown("---")

    if mpr > 0:
        st.sidebar.markdown("### 🤖 Autonomous Vehicle Fleet (SAE L1-5)")
        av_level = st.sidebar.selectbox(
            "AV Automation Level",
            options=["SAE L1-2 (Partial / ACC)", "SAE L3 (Conditional)",
                     "SAE L4-5 (Full / CACC / V2X)"],
            index=2,
        )
    else:
        av_level = None

    st.sidebar.markdown("---")

    # ── Egyptian Driving Style ──
    with st.sidebar.expander("🔧 Egyptian Driving Style", expanded=False):
        rt_mult = st.slider("Reaction Time Multiplier", 0.5, 2.0, 1.0, 0.05)
        safety_mult = st.slider("Safety Margin Multiplier", 0.3, 1.5, 1.0, 0.05)
        aggressiveness = st.slider("Aggressiveness Multiplier", 0.5, 2.0, 1.0, 0.05)
        lane_change_mult = st.slider("Lane-Change Frequency", 0.3, 2.0, 1.0, 0.05)
        if egyptian_selection["microbus"]:
            dwell_mult = st.slider("Microbus Dwell Time", 0.5, 3.0, 1.0, 0.1)
        else:
            dwell_mult = 1.0

    # ── AV Settings ──
    if mpr > 0:
        with st.sidebar.expander("🔧 AV Settings", expanded=False):
            av_rt = st.slider("AV Reaction Time", 0.5, 2.0, 1.0, 0.05)
            av_safety = st.slider("AV Safety Margin", 0.7, 1.3, 1.0, 0.05)
            if av_level == "SAE L4-5 (Full / CACC / V2X)":
                cacc_mult = st.slider("CACC Headway Multiplier", 0.5, 2.0, 1.0, 0.05)
                defensive_mult = st.slider("Defensive Factor", 1.0, 5.0, 1.0, 0.1)
            else:
                cacc_mult = 1.0
                defensive_mult = 1.0
    else:
        av_rt = av_safety = cacc_mult = defensive_mult = 1.0

    return {
        "platform": platform_enum,
        "mpr": mpr,
        "egyptian_selection": egyptian_selection,
        "av_level": av_level,
        "egyptian_overrides": {
            "rt_mult": rt_mult, "safety_mult": safety_mult,
            "aggressiveness": aggressiveness, "lane_change_mult": lane_change_mult,
            "dwell_mult": dwell_mult,
        },
        "av_overrides": {
            "rt_mult": av_rt, "safety_mult": av_safety,
            "cacc_mult": cacc_mult, "defensive_mult": defensive_mult,
        },
    }


# ══════════════════════════════════════════════════════════════
# Fleet Builder
# ══════════════════════════════════════════════════════════════

def build_fleet(cfg: dict):
    """Build fleet composition based on user configuration."""
    ov = cfg["egyptian_overrides"]
    av_ov = cfg["av_overrides"]

    egyptian_profiles: List[VehicleProfile] = []
    if cfg["egyptian_selection"]["microbus"]:
        egyptian_profiles.append(apply_egyptian_overrides(EGYPTIAN_MICROBUS, **ov))
    if cfg["egyptian_selection"]["mlaijy"]:
        egyptian_profiles.append(apply_egyptian_overrides(EGYPTIAN_MLAIKY, **ov))
    if cfg["egyptian_selection"]["naql"]:
        egyptian_profiles.append(apply_egyptian_overrides(EGYPTIAN_NAQL, **ov))

    av_profiles: List[Tuple[VehicleProfile, float]] = []
    if cfg["mpr"] > 0 and cfg["av_level"] is not None:
        level_map = {
            "SAE L1-2 (Partial / ACC)": "l1_2",
            "SAE L3 (Conditional)": "l3",
            "SAE L4-5 (Full / CACC / V2X)": "l4_5",
        }
        av_key = level_map.get(cfg["av_level"], "l4_5")
        base_av = AV_FLEET_MAP[av_key]
        av = apply_av_overrides(base_av, **av_ov)
        av_profiles.append((av, 1.0))

    return egyptian_profiles, av_profiles


# ══════════════════════════════════════════════════════════════
# Fleet Composition Table
# ══════════════════════════════════════════════════════════════

def render_fleet_summary(egyptian_profiles, av_profiles, mpr):
    """Display a summary table of the fleet composition."""
    rows = []
    egyptian_total = 1.0 - mpr

    selected_types = {ep.vehicle_type for ep in egyptian_profiles}
    total_base = sum(p for bp, p in EGYPTIAN_FLEET if bp.vehicle_type in selected_types)

    for profile in egyptian_profiles:
        base_prop = 0.20
        for base_p, prop in EGYPTIAN_FLEET:
            if base_p.vehicle_type == profile.vehicle_type:
                base_prop = prop
                break
        norm_prop = base_prop / total_base if total_base > 0 else base_prop
        fleet_prop = norm_prop * egyptian_total

        rows.append({
            "Vehicle Type": profile.name,
            "SAE Level": f"L{profile.sae_level}",
            "Share": f"{fleet_prop*100:.1f}%",
            "τ [s]": f"{profile.car_following.reaction_time:.2f}",
            "Safety": f"{profile.car_following.multiplicative_safety:.2f}",
            "Accel [m/s²]": f"{profile.car_following.max_accel:.1f}",
            "σ": f"{profile.car_following.sigma:.2f}",
            "Color": profile.color,
        })

    for profile, prop in av_profiles:
        fleet_prop = prop * mpr
        rows.append({
            "Vehicle Type": profile.name,
            "SAE Level": f"L{profile.sae_level}",
            "Share": f"{fleet_prop*100:.1f}%",
            "τ [s]": f"{profile.car_following.reaction_time:.2f}",
            "Safety": f"{profile.car_following.multiplicative_safety:.2f}",
            "Accel [m/s²]": f"{profile.car_following.max_accel:.1f}",
            "σ": f"{profile.car_following.sigma:.2f}",
            "Color": profile.color,
        })

    df = pd.DataFrame(rows)
    st.dataframe(df, use_container_width=True, hide_index=True)

    # Metrics cards
    col1, col2, col3 = st.columns(3)
    col1.metric("Egyptian Fleet", f"{(1-mpr)*100:.0f}%",
                f"{len(egyptian_profiles)} types")
    col2.metric("AV Fleet", f"{mpr*100:.0f}%",
                f"{len(av_profiles)} types")
    col3.metric("Total Vehicle Types", str(len(egyptian_profiles) + len(av_profiles)))
    return df


# ══════════════════════════════════════════════════════════════
# Mathematical Documentation
# ══════════════════════════════════════════════════════════════

def render_math_docs():
    """Display the core mathematical mappings."""
    with st.expander("📐 Mathematical Mappings (Wiedemann 99 / SUMO / IDM)"):
        st.markdown("""
### Core Safety-Distance Formulas

**1. Wiedemann 99 (PTV VISSIM)**
```
d_safe = CC0 + v·τ·safety + [v² / (2·√(a·b))]·safety
```
  - CC0   — static minimum gap at standstill
  - v     — follower speed
  - τ     — reaction / following time (OP0)
  - safety — multiplicative safety factor (OP1)
  - a     — max acceleration (CC5)
  - b     — comfortable deceleration (CC6)

**2. SUMO Krauss**
```
s_star = minGap + v·τ - v·(v_l - v_f) / (2·√(a·b))
```
Mathematically equivalent to Wiedemann 99 with the relative-speed
term handled explicitly.

**3. Aimsun IDM**
```
s = s0 + v·T - (v·(v_l - v_f)) / (2·√(a·b))
```
Same kinematic foundation as above.

**4. Time-To-Collision (TTC)**
```
TTC = Δs / Δv
```
  - Δs = gap between vehicles
  - Δv = closing speed (v_follower - v_leader)
  - Intervention when TTC < 1.5s

**5. Required Emergency Deceleration**
```
a_req = v² / (2·gap)
```
Derived from v_f² = v_i² + 2·a·s with v_f = 0.
""")

        col_a, col_b = st.columns(2)
        with col_a:
            st.markdown("""
#### Egyptian SAE L0 (Aggressive)
| Parameter  | Microbus | Mlaiky | Naql |
|------------|----------|--------|------|
| τ (s)      | 0.70     | 0.85   | 1.30 |
| Safety     | 0.35     | 0.45   | 0.55 |
| σ          | 0.95     | 0.85   | 0.75 |
| a_max      | 3.0      | 2.4    | 0.9  |

**Key adaptations:**
- Short τ → tailgating behavior
- Low safety → aggressive gap acceptance
- High σ → unpredictable speed changes
- Microbus: frequent dwell stops (exponential, mean ≈ 25s)
""")
        with col_b:
            st.markdown("""
#### AV SAE L4-5 (CACC / V2X)
| Parameter  | Level 1-2 | Level 3 | Level 4-5 |
|------------|-----------|---------|-----------|
| τ (s)      | 1.1       | 0.8     | 0.35      |
| Safety     | 0.75      | 0.85    | 0.95      |
| σ          | 0.15      | 0.10    | 0.01      |
| CACC head  | —         | —       | 0.30s     |

**Key adaptations:**
- CACC τ ≈ 0.3s (vs human 1.0s) → tight platoons
- V2X → near-zero static gap
- Defensive mode: when cut off by L0, safety factor ×3
""")


# ══════════════════════════════════════════════════════════════
# Main App
# ══════════════════════════════════════════════════════════════

def main():
    cfg = sidebar_config()

    # Header
    st.title("🚗 SAE Calibration Hub")
    st.markdown("""
    **Micro-Simulation Calibration Web Hub for Autonomous & Conventional Fleets in Egypt**
    
    Solving the *Local Calibration Deficit* by providing pre-calibrated vehicle
    fleet models and behavioral profiles customized for Egyptian roads
    (Cairo Ring Road). Supports **PTV VISSIM**, **SUMO**, and **Aimsun Next**.
    """)

    # Build fleet
    egyptian_profiles, av_profiles = build_fleet(cfg)
    mpr = cfg["mpr"]
    platform = cfg["platform"]

    if not egyptian_profiles and not av_profiles:
        st.warning("⚠️ No vehicles selected. Please enable at least one vehicle type in the sidebar.")
        st.stop()

    # ── Fleet Composition ──
    st.header("Fleet Composition")
    render_fleet_summary(egyptian_profiles, av_profiles, mpr)

    # ── Mathematical Documentation ──
    render_math_docs()

    # ── Generate Configuration ──
    st.header("Generated Configuration Files")
    st.markdown(f"**Platform:** {platform.value}  |  **MPR:** {mpr*100:.0f}%  |  "
                f"**Egyptian types:** {len(egyptian_profiles)}  |  **AV types:** {len(av_profiles)}")

    # Generate platform-specific config
    config_content, config_ext, config_mime = _generate_config(
        platform, egyptian_profiles, av_profiles, mpr
    )

    # ── Tabs ──
    tab1_name = "Configuration File"
    tab2_name = "Conflict Resolution Script"

    tab1, tab2 = st.tabs([f"📄 {tab1_name}", f"🛡️ {tab2_name}"])

    with tab1:
        st.subheader(f"{platform.value} Configuration")
        st.markdown(f"File format: `{config_ext}`")

        if platform == Platform.SUMO:
            st.markdown("*Contains vehicle type definitions with Krauss car-following "
                        "and SL2015 lane-changing parameters, plus route definitions.*")
            st.code(config_content, language="xml", line_number_start=1)
            st.download_button(
                label="💾 Download SUMO .rou.xml",
                data=config_content.encode("utf-8"),
                file_name=f"egypt_calibration_{mpr*100:.0f}mpr.rou.xml",
                mime="application/xml",
            )
            st.markdown("---")
            st.markdown("*Additional parameters file (.add.xml):*")
            additional = generate_sumo_additional_file(egyptian_profiles, av_profiles, mpr)
            st.code(additional, language="xml")
            st.download_button(
                label="💾 Download SUMO .add.xml",
                data=additional.encode("utf-8"),
                file_name=f"egypt_calibration_{mpr*100:.0f}mpr.add.xml",
                mime="application/xml",
            )
        elif platform == Platform.VISSIM:
            st.markdown("*VISSIM INPX-compatible configuration with Wiedemann 99 "
                        "car-following and lane-changing parameters.*")
            st.code(config_content, language="xml", line_number_start=1)
            st.download_button(
                label="💾 Download INPX Config (.xml)",
                data=config_content.encode("utf-8"),
                file_name=f"vissim_config_{mpr*100:.0f}mpr.xml",
                mime="application/xml",
            )
            st.markdown("---")
            com_script = generate_vissim_com_script(
                egyptian_profiles, av_profiles, mpr,
                network_path="ring_road.inpx",
            )
            st.markdown("*Python COM API script to set parameters dynamically:*")
            st.download_button(
                label="💾 Download VISSIM COM Script (.py)",
                data=com_script.encode("utf-8"),
                file_name=f"vissim_com_{mpr*100:.0f}mpr.py",
                mime="text/x-python",
            )
        elif platform == Platform.AIMSUN:
            st.markdown("*Aimsun Next API script configuring IDM + MOBIL parameters.*")
            st.code(config_content, language="python", line_number_start=1)
            st.download_button(
                label="💾 Download Aimsun Script (.py)",
                data=config_content.encode("utf-8"),
                file_name=f"aimsun_config_{mpr*100:.0f}mpr.py",
                mime="text/x-python",
            )

    with tab2:
        st.subheader("Real-Time Conflict Detection & Resolution")
        st.markdown("""
        This script monitors Time-To-Collision (TTC) and Post-Encroachment Time
        (PET) in real time. When a collision risk is detected, it applies
        speed overrides or lane-change denial to prevent conflicts.

        **Conflict detection formula:**
        ```
        TTC = gap / (v_follower - v_leader)
        a_req = v² / (2 * gap)
        v_target = sqrt(v² - 2 * a_req * TTC)
        ```

        For AVs in **defensive mode** (when cut off by Level-0 vehicles):
        - Safety factor is multiplied by the defensive factor
        - CACC platooning is temporarily suspended
        """)

        api_script = generate_conflict_script(
            egyptian_profiles, av_profiles, mpr,
            platform=platform.value.split()[0] if platform == Platform.SUMO else
                      "VISSIM" if platform == Platform.VISSIM else "AIMSUN"
        )

        st.code(api_script, language="python", line_number_start=1)
        st.download_button(
            label="💾 Download Conflict Resolution Script (.py)",
            data=api_script.encode("utf-8"),
            file_name=f"conflict_resolution_{platform.value.lower().split()[0]}"
                    f"_{mpr*100:.0f}mpr.py",
            mime="text/x-python",
        )

    # ── Footer ──
    st.markdown("---")
    st.markdown("""
    *Built by SAE Calibration Hub. For research use only. Based on
    field-calibrated parameters from Cairo Ring Road observations.
    Cite: Ahmed et al. (2023), El-Baset et al. (2022).*
    """)


def _generate_config(platform, egyptian_profiles, av_profiles, mpr):
    """Dispatch to the correct generator and return (content, ext, mime)."""
    if platform == Platform.VISSIM:
        content = generate_vissim_config(egyptian_profiles, av_profiles, mpr)
        return content, ".xml", "application/xml"
    elif platform == Platform.SUMO:
        content = generate_sumo_config(egyptian_profiles, av_profiles, mpr)
        return content, ".rou.xml", "application/xml"
    elif platform == Platform.AIMSUN:
        content = generate_aimsun_script(egyptian_profiles, av_profiles, mpr)
        return content, ".py", "text/x-python"
    return "", ".txt", "text/plain"


if __name__ == "__main__":
    main()

# Entry point for Streamlit Community Cloud / serverless deployments
app = main
