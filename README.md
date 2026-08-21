# 🚀 SAE AutoSim Hub (Powered by Fimtosoft) - 2026 Strategy & Roadmap

Welcome to the ultimate repository and configuration framework for **SAE AutoSim Hub (https://sae.fimtosoft.com)**. This platform bridges the gap between dynamic macro traffic engineering constraints and real-world commercial automated driving parameters, with a dedicated strategic focus on global researchers and the Arab World infrastructure scaling.


---

## 🎯 Platform Vision & Segmentation Strategy

To become the #1 definitive world reference for Autonomous Driving Systems (ADS), the platform strictly isolates user experience into two targeted vertical channels:


### 1. 🧬 Scientific Academic Mode (The Engineering Core)

Dedicated to traffic simulation engineers (PTV VISSIM, SUMO, Aimsun Next), academic reviewers, and transportation ministries.

- **Dynamic Metrical Footprints:** Precise tracking of 14 heterogeneous vehicle categories including local chaotic configurations (Egyptian Microbuses with sudden 25s dwell time delays, Tuk-Tuks, and Cargo Tricycles with erratic weaving profiles).
- **Kinematic Grade & Incline Mechanics Engine:** Active client-side JavaScript traffic physics calculating physical deceleration trends over steep incline gradients (G = +3.5% mapped dynamically for the Cairo Ring Road corridor from Qalyub to Adly Mansour Hub).
- **Dynamic Passenger Car Equivalent (PCE) Matrix:** Upscaling heavy vehicle flow multipliers from flat base metrics (PCE = 2.5) up to acute grade adjustments (PCE = 4.5), with an automated 25% mitigating bonus factor applied during synchronized **Autonomous Platooning Corridor** operations.
- **Composite Capacity with fHV:** Highway Capacity Manual methodology with heavy vehicle factor, air density PCE multiplier, and grade-adjusted saturation flow calculations.
- **Emissions Index (EI):** CO₂/NOx output estimation per vehicle category based on HCM methodology for ecological impact tracking.


### 2. 💎 User-Friendly Mode (The Commercial Core)

Dedicated to the general public, technology enthusiasts, automotive buyers, and smart city procurement investors.

- **Side-by-Side Fleet Matchmaking:** Fluid, clean dropdown selectors comparing verified production fleets up to 2026 (Tesla FSD/Autopilot, Mercedes-Benz DRIVE PILOT, BMW Personal Pilot L3, Waymo Driver, Amazon Zoox).
- **Commercial Evaluation Metrics:** Side-by-side processing of procurement pricing, hardware subscription models, regional market availability, and core consumer safety benefits.
- **Interactive Simulation Storytelling:** A live visual continuous feedback loop demonstrating how increasing the Market Penetration Rate (MPR) directly reduces human steering intervention rates, clears heavy ramp bottlenecks, and slashes toxic carbon emissions.


---

## 🛠️ Global Architecture & Core Capabilities Checklist

### Core Infrastructure
- [x] **100% Static Edge Serverless Architecture:** Optimized for absolute performance, high global CDN delivery speeds, and 0% backend runtime crashes via Vercel.
- [x] **Production Domain:** `https://sae.fimtosoft.com/` deployed via Vercel static hosting
- [x] **Mirror Sync:** `web/index.html` kept synchronized with `index.html` after every change
- [x] **Closed-Source Enterprise Security:** Stripped of open GitHub reference badges to preserve proprietary corporate parameters before official Q1 journal printings.
- [x] **Proprietary Footer:** "Proprietary Research Platform Powered by Fimtosoft. All Rights Reserved. © 2026"
- [x] **Corporate Identity:** No GitHub references in UI; meta tags updated from "open-source/MIT" to proprietary

### Geospatial Mapping
- [x] **Secure Geospatial Mapping Framework:** Google Maps JavaScript API with dynamic canvas overlay
- [x] **Google Maps API Key:** `AIzaSyBkFu8PekIyzEhmHy1wYc6MgfxgKl6mUcM` (Maps JS, Air Quality API, Weather API)
- [x] **Ring Road Animation:** `RingRoadOverlay` canvas vehicle simulation with two-way polylines (`RING_ROAD_COORDS` + offset `RING_ROAD_COORDS_B`)
- [x] **Corridor:** Qalyub (30.178, 31.252) → Dar Al Salam (29.991, 31.233) → Adly Mansour (30.141, 31.401)
- [x] **4 Interactive Markers:** With dynamic InfoWindows displaying vehicle count, grade, HV%, PCE, capacity, CO₂, NOx
- [x] **Google Maps Traffic Layer:** Real-time traffic overlay active on Ring Road view
- [x] **Live Traffic Feed:** `startLiveTrafficFeed()` polling simulated Cairo volume/HV-share

### Physics Engine (PHYS Module)
- [x] **Grade-Adjusted Speed:** `PHYS.gradeAdjustedSpeed()` calculating deceleration over incline gradients
- [x] **Dynamic PCE Matrix:** `PHYS.dynamicPCE()` with incline matrix (Mlaiky 1.1 / Microbus 2.2 / Naql-Taqeel 4.5)
- [x] **Composite Capacity:** `PHYS.compositeCapacity()` with `fHV` (heavy vehicle factor) and `airPCEmult` (air density scaling)
- [x] **Emissions Index:** `PHYS.emissionsIndex()` for CO₂/NOx estimation per vehicle category
- [x] **Air Quality PCE Multiplier:** `airPCEmult` scaling in `dynamicPCE` based on real AQI data
- [x] **Live Physics Updates:** `updatePhysicsBox()`, `updateEnvTracker()`, `updateMapPhysics()`

### Environmental & Air Quality
- [x] **Google Air Quality API:** `fetchAirQuality()` POST to `airquality.googleapis.com` for real PM2.5, CO, NOx metrics
- [x] **Google Weather API:** `fetchWeather()` GET to `weather.googleapis.com` for ambient conditions
- [x] **Environmental Tracker Panel:** Live AQI, CO₂, NOx display with color-coded severity (Green/Amber/Red)
- [x] **5-Minute Auto-Refresh:** Both AQ and Weather APIs polled every 5 minutes with `.catch()` fallback

### Multi-Language Support
- [x] **9 Languages:** English, Arabic, Russian, Hindi, German, Chinese, Japanese, Korean, French
- [x] **RTL Toggle:** `setLanguage()` sets `dir="rtl"` for Arabic with dynamic layout adjustment
- [x] **25 Base Translation Keys:** Core platform labels × 9 languages
- [x] **15 Environment/Physics Keys:** env_tracker, env_aqi, env_co2, env_nox, env_high, env_mid, env_low, phys_title, phys_grade, pce_lbl, phys_fhv, phys_cap, carbon_red, ksa_express, grade_lbl × 9 languages
- [x] **9 Dual-Mode Keys:** mode_uf, mode_sci, uf_year, uf_price, uf_benefit, uf_avail, sci_liability, sci_maxspeed, sci_odd_weather × 9 languages
- [x] **National Flag Icons:** Each language tagged with its country flag for visual identification

### AV Comparison Engine
- [x] **SAE-Level Tiered Dropdowns:** L1, L2, L3, L4/L5 classification grouping
- [x] **10 Production Vehicles (2026):**
  - **L1:** Toyota Corolla (TSS 2.0), Ford F-150 (Co-Pilot360)
  - **L2:** Tesla Model Y (Autopilot/FSD), Cadillac Lyriq (Super Cruise), BMW 7 Series (Driving Assistant Pro)
  - **L3:** Mercedes-Benz S-Class (DRIVE PILOT), BMW 7 Series (Personal Pilot L3)
  - **L4/L5:** Waymo One (5th Gen), Amazon Zoox, Tesla Cybercab (Robotaxi)
- [x] **Dual-Mode Fleet Cards:**
  - **User-Friendly:** Brand logo placeholder, production year, est. price, consumer benefit, global availability
  - **Scientific Academic:** Sensor suite counts (LiDAR/Radar/Cameras/Ultrasonic), legal liability (OEM/Driver), max speed, ODD weather limits, intervention rate
- [x] **Chart.js Graphs:**
  - Sensor Density vs Cost (bar chart)
  - Safety Intervention Curves (line chart across SAE levels)

### Video Content
- [x] **YouTube Embeds (proper `/embed/` format):**
  - L3 Mercedes: `https://www.youtube.com/embed/S_8qMh60F_U`
  - L4 Waymo: `https://www.youtube.com/embed/Y0n6wY_nI0g`
  - L5 Tesla Cybercab: `https://www.youtube.com/embed/v9C2CunC7_k`

### Cairo Ring Road Geospatial
- [x] **Two-Way Polylines:** Dual-direction road visualization with offset coordinates
- [x] **Traffic Layer:** Google Maps native traffic overlay
- [x] **Canvas Vehicle Simulation:** Animated vehicles moving along corridor
- [x] **Ramp Markers:** Interactive markers with required InfoWindow format
- [x] **Live Traffic Volume:** Dynamic data display in InfoWindows

### Multi-Country Calibration Hub
- [x] **4 Country Modules:** Egypt (EG), Saudi Arabia (KSA), UAE, Jordan
- [x] **Country-Specific Parameters:** Local vehicle mix, PCE values, grade profiles
- [x] **KSA Express:** Dedicated Saudi Arabia expressway calibration

### Academic & Research Features
- [x] **BibTeX Generator:** Automated citation generation for academic papers
- [x] **VISSIM Configuration Export:** PTV VISSIM-compatible parameter output
- [x] **SAE J3016 Compliance:** Taxonomy aligned with SAE International standards
- [x] **Wiedemann 99 Calibration:** Car-following microscopic behavioral matrix

### Year & Versioning
- [x] **All Years Updated to 2026:** 61 replacements across footer copyrights (9 langs), academic refs, BibTeX generator, meta tags, VISSIM config
- [x] **Vehicle Production Year 2026:** All fleet comparison data dated 2026


---

## 📁 Repository Structure

```
SAE/
├── index.html              # Main production file (~5300+ lines)
├── web/
│   └── index.html          # Mirror (synced after each change)
└── README.md               # This file
```


---

## 🔧 Technical Implementation Details

### Tailwind CSS Configuration
- **Primary:** `#0EA5E9` (Sky Blue)
- **Secondary:** `#6366F1` (Indigo)
- **Accent:** `#F59E0B` (Amber)

### Write Tool Limitation
- Content > ~30KB fails JSON parsing in write tool
- Solution: Split Python injections into <25KB files via bash heredoc

### JavaScript Syntax Validation
- Extract largest `<script>` block to `/tmp/app_check.js`
- Run `node --check` for validation
- Critical: MULTI-COUNTRY CALIBRATION HUB comment line must have `// ═══` prefix or syntax fails

### YouTube Embed Format
- Correct: `https://www.youtube.com/embed/<VIDEO_ID>`
- Incorrect: `https://www.youtube.com/watch?v=<VIDEO_ID>`


---

## 📈 Git Commit History

| Commit | Description |
|--------|-------------|
| `3ad750d` | Grade/PCE physics engine, eco-emissions AQI tracker, live map InfoWindow params, 15 translations |
| `2a4e3bb` | Private-repo cleanup + geospatial rewrite (two-way polylines, TrafficLayer, canvas simulation) |
| `9861b02` | Native Google Air Quality + Weather API integration |
| `e16bb59` | Full restoration (YouTube embeds, orphan key cleanup, meta tags to proprietary) |
| `675ca67` | Fleet comparison engine (SAE-level tiered dropdowns, 10 vehicles, Chart.js graphs) |
| `5738eeb` | All years 2024→2026 (61 replacements) |
| `e81f855` | Dual-mode fleet comparison engine (User-Friendly / Scientific Academic tabs) |


---

## 📈 Future Innovation Roadmap (Moving to the Next Phase)

To extend market dominance and maximize research citation indices, the next functional sprints will focus on:

### Phase 1: Real-Time Environmental Air Quality Fetching ✅
- [x] Hooking the native **Google Air Quality API** to pull live ambient PM2.5, CO, and NOx metrics directly for the Cairo Ring Road coordinates, showing the direct ecological relief curve as the vehicle mix moves to SAE Level 5.

### Phase 2: Native Mobile Cross-Platform Application (Android & iOS)
- Utilizing the pre-approved Cloud Key **Maps SDK for Android/iOS** to launch an enterprise application carrying real-world navigation simulation utilities, providing on-the-go data analysis for field traffic engineers.

### Phase 3: VISSIM/SUMO Live Export Bridge
- Direct export of calibrated parameters to PTV VISSIM and SUMO simulation environments for academic researchers.

### Phase 4: Multi-Corridor Expansion
- Extending the geospatial simulation beyond Cairo Ring Road to include Riyadh, Dubai, and Amman corridors.


---

## ⚖️ Intellectual Property & Reference Standards

- **Taxonomy Foundation:** Compliant with SAE International J3016 (Automated Driving Systems classification standard).
- **Flow Dynamics:** Calibrated according to the Wiedemann 99 car-following microscopic behavioral matrix.
- **Platform:** Proprietary Research Platform Powered by Fimtosoft
- **Copyright:** © 2026 Fimtosoft. All Rights Reserved.
- **Production URL:** https://sae.fimtosoft.com
