    // ══════════════════════════════════════════════════════════
    // FLEET PROFILES — Expanded Granular Matrix
    // ══════════════════════════════════════════════════════════
    const FLEET = {
        // ── SAE Level 0: Standard Conventional ──
        mlaijy: {
            name: "Mlaiky (Passenger Car)", sae: 0, len: 4.5, width: 1.8, category: "standard",
            cf: { accel: 2.4, decel: 5.0, decisiveDecel: 8.0, reaction: 0.85, minGap: 1.8, standstillAccel: 2.0, safety: 0.45, sigma: 0.85, desiredSpeed: 25.0 },
            lc: { prob: 75, rightThresh: 10, gapDetect: 0.7, slowProb: 0.35, brakeProb: 0.6, brakeStandstill: 0.7, dwell: 5, minDist: 2.0 },
            dwell: null, color: "#00AAFF",
            catalog: "Hyundai Elantra / Toyota Corolla Specifications", weight: 0.30,
            officialModels: [
                { name: "Hyundai Elantra", market: "EG/SA", type: "Sedan", mass: 1290, engine: "1.6L MPI", url: "https://www.hyundai.com/worldwide/en/vehicles/elantra" },
                { name: "Kia Cerato", market: "EG/SA", type: "Sedan", mass: 1230, engine: "1.6L CRDi", url: "https://www.kia.com/worldwide/models/cerato" },
                { name: "Chevrolet Optra", market: "EG", type: "Sedan", mass: 1185, engine: "1.5L DOHC", url: "https://www.chevrolet.com/middle-east" },
                { name: "Toyota Corolla", market: "EG/SA", type: "Sedan", mass: 1250, engine: "1.6L Valvematic", url: "https://www.toyota.com/corolla" },
                { name: "Nissan Sentra", market: "EG/SA", type: "Sedan", mass: 1280, engine: "1.6L DIG-T", url: "https://www.nissan-global.com/EN/VEHICLES/sentra" }
            ]
        },
        microbus: {
            name: "Egyptian Microbus", sae: 0, len: 5.3, width: 1.9, category: "standard",
            cf: { accel: 3.0, decel: 6.0, decisiveDecel: 10.8, reaction: 0.7, minGap: 1.2, standstillAccel: 2.8, safety: 0.35, sigma: 0.95, desiredSpeed: 22.2222 },
            lc: { prob: 95, rightThresh: 12, gapDetect: 0.5, slowProb: 0.6, brakeProb: 0.8, brakeStandstill: 0.95, dwell: 25, minDist: 1.5 },
            dwell: { mean: 25, std: 12, freq: 0.4, dist: "exponential" },
            color: "#FF6B21",
            catalog: "Toyota Hiace Minivan (2.5L Diesel) Catalog", weight: 0.20,
            officialModels: [
                { name: "Toyota HiAce", market: "EG/SA", type: "Van 14-seat", mass: 2070, engine: "2.7L VVT-i", url: "https://www.toyota.com/hice" },
                { name: "Hyundai H-1 (Starex)", market: "EG/SA", type: "Van 12-seat", mass: 2150, engine: "2.5L CRDi", url: "https://www.hyundai.com/worldwide/en/vehicles/h-1" },
                { name: "Nissan Urvan", market: "EG/SA", type: "Van 14-seat", mass: 2120, engine: "2.5L YD25", url: "https://www.nissan-global.com/EN/VEHICLES/urvan" },
                { name: "Chevrolet Express", market: "EG", type: "Van 15-seat", mass: 2430, engine: "4.3L V6", url: "https://www.chevrolet.com/middle-east" }
            ]
        },
        noss_naql: {
            name: "Noss-Naql (Light Goods / Half-Truck)", sae: 0, len: 6.5, width: 2.2, category: "standard",
            cf: { accel: 1.8, decel: 5.2, decisiveDecel: 8.5, reaction: 0.9, minGap: 2.2, standstillAccel: 1.5, safety: 0.40, sigma: 0.80, desiredSpeed: 20.8333 },
            lc: { prob: 55, rightThresh: 9, gapDetect: 0.8, slowProb: 0.25, brakeProb: 0.55, brakeStandstill: 0.65, dwell: 10, minDist: 2.5 },
            dwell: null, color: "#D97706",
            catalog: "Isuzu NPR Commercial Truck Series", weight: 0.08,
            officialModels: [
                { name: "Isuzu N-Series", market: "EG/SA", type: "Light Truck", mass: 3200, engine: "4JJ1 3.0L", url: "https://www.isuzu.co.jp/truck/n-series/" },
                { name: "Hyundai Porter", market: "EG/SA", type: "Light Truck", mass: 2700, engine: "2.5L CRDi", url: "https://www.hyundai.com/worldwide/en/vehicles/commercial/porter" },
                { name: "Toyota Dyna", market: "EG/SA", type: "Light Truck", mass: 3100, engine: "1HZ 4.2L", url: "https://www.toyota.com/dyna" }
            ]
        },
        rob_naql: {
            name: "Rob-Naql (Quarter-Truck / Dababa)", sae: 0, len: 5.1, width: 1.8, category: "standard",
            cf: { accel: 2.0, decel: 5.5, decisiveDecel: 9.0, reaction: 0.8, minGap: 1.8, standstillAccel: 1.8, safety: 0.38, sigma: 0.88, desiredSpeed: 19.4444 },
            lc: { prob: 80, rightThresh: 11, gapDetect: 0.6, slowProb: 0.45, brakeProb: 0.7, brakeStandstill: 0.8, dwell: 15, minDist: 1.8 },
            dwell: { mean: 15, std: 8, freq: 0.3, dist: "exponential" },
            color: "#B45309",
            catalog: "Chevrolet T-Series Dababa Catalog", weight: 0.07,
            officialModels: [
                { name: "Chevrolet T-Series", market: "EG", type: "Pickup", mass: 2200, engine: "2.4L Duramax", url: "https://www.chevrolet.com/middle-east" },
                { name: "Toyota Hilux", market: "EG/SA", type: "Pickup", mass: 2070, engine: "2.7L VVT-i", url: "https://www.toyota.com/hilux" },
                { name: "Ford Ranger", market: "EG/SA", type: "Pickup", mass: 2150, engine: "2.2L TDCi", url: "https://www.ford.com/trucks/ranger/" },
                { name: "Nissan Navara", market: "EG/SA", type: "Pickup", mass: 2100, engine: "2.3L dCi", url: "https://www.nissan-global.com/EN/VEHICLES/navara" }
            ]
        },
        naql_taqeel: {
            name: "Naql-Taqeel (Heavy Truck / Semitrailer)", sae: 0, len: 16.5, width: 2.6, category: "standard",
            cf: { accel: 0.7, decel: 4.0, decisiveDecel: 5.6, reaction: 1.4, minGap: 3.5, standstillAccel: 0.6, safety: 0.60, sigma: 0.70, desiredSpeed: 16.6667 },
            lc: { prob: 30, rightThresh: 7, gapDetect: 2.0, slowProb: 0.15, brakeProb: 0.9, brakeStandstill: 0.95, dwell: 5, minDist: 5.0 },
            dwell: null, color: "#78350F",
            catalog: "Mercedes-Benz Actros 1845 Freight Catalog", weight: 0.05,
            officialModels: [
                { name: "Mercedes Actros", market: "EG/SA", type: "Heavy Truck", mass: 18000, engine: "OM501 V6", url: "https://www.mercedes-benz.com/en/commercial/trucks/actros/" },
                { name: "MAN TGX", market: "EG/SA", type: "Heavy Truck", mass: 18000, engine: "D2676 12.4L", url: "https://www.truck.man.eu/en/tgx" },
                { name: "Scania R-Series", market: "EG/SA", type: "Heavy Truck", mass: 18000, engine: "DC16 16.4L", url: "https://www.scania.com/" },
                { name: "Volvo FH", market: "EG/SA", type: "Heavy Truck", mass: 18000, engine: "D16K 16.1L", url: "https://www.volvotrucks.com/trucks/fh/" }
            ]
        },
        motorcycle: {
            name: "Motorcycle (Darrah)", sae: 0, len: 2.0, width: 0.8, category: "standard",
            cf: { accel: 3.5, decel: 6.5, decisiveDecel: 11.0, reaction: 0.6, minGap: 0.5, standstillAccel: 3.2, safety: 0.25, sigma: 0.95, desiredSpeed: 27.7778 },
            lc: { prob: 98, rightThresh: 14, gapDetect: 0.3, slowProb: 0.7, brakeProb: 0.9, brakeStandstill: 0.98, dwell: 2, minDist: 0.5 },
            dwell: null, color: "#DC2626",
            catalog: "Honda CG125 Local Spec Sheet", weight: 0.05,
            officialModels: [
                { name: "Honda CD 110", market: "EG/SA", type: "Commuter 110cc", mass: 105, engine: "110cc", url: "https://www.honda.com.eg" },
                { name: "Bajaj RE 150", market: "EG/SA", type: "Three-Wheel 150cc", mass: 285, engine: "150cc", url: "https://www.bajajauto.com/three-wheelers" },
                { name: "Honda TMX 125", market: "EG", type: "Cargo 125cc", mass: 115, engine: "125cc", url: "https://www.honda.com.eg" },
                { name: "Yamaha SZ-RR", market: "EG/SA", type: "Commuter 150cc", mass: 128, engine: "150cc", url: "https://www.yamaha-motor.com" }
            ]
        },
        bicycle: {
            name: "Bicycle (Ajala)", sae: 0, len: 1.7, width: 0.6, category: "standard",
            cf: { accel: 0.8, decel: 1.5, decisiveDecel: 3.0, reaction: 0.5, minGap: 0.3, standstillAccel: 0.7, safety: 0.20, sigma: 0.90, desiredSpeed: 4.1667 },
            lc: { prob: 30, rightThresh: 5, gapDetect: 1.0, slowProb: 0.1, brakeProb: 0.3, brakeStandstill: 0.4, dwell: 0, minDist: 0.5 },
            dwell: null, color: "#059669",
            catalog: "Trinx Mountain Bike Baseline Specifications", weight: 0.02,
            officialModels: [
                { name: "Generic City Bicycle", market: "EG", type: "Urban 26in", mass: 14, engine: "Human", url: "" },
                { name: "Delivery Tricycle", market: "EG", type: "Cargo Trike", mass: 45, engine: "Human", url: "" }
            ]
        },
        // ── SAE Level 0: Chaotic / Informal ──
        trooscoor: {
            name: "Trooscoor (Tricycle / Open Freight)", sae: 0, len: 3.2, width: 1.3, category: "chaotic",
            cf: { accel: 1.5, decel: 4.5, decisiveDecel: 7.5, reaction: 0.65, minGap: 0.8, standstillAccel: 1.3, safety: 0.22, sigma: 0.95, desiredSpeed: 15.2778 },
            lc: { prob: 90, rightThresh: 13, gapDetect: 0.4, slowProb: 0.55, brakeProb: 0.75, brakeStandstill: 0.9, dwell: 20, minDist: 0.8 },
            dwell: { mean: 20, std: 10, freq: 0.35, dist: "exponential" },
            color: "#F97316",
            catalog: "Local 200cc Cargo Tricycle Spec Sheets", weight: 0.015,
            officialModels: [
                { name: "TVS King", market: "EG/SA", type: "Three-Wheel Cargo", mass: 350, engine: "200cc", url: "https://www.tvsmotor.com/three-wheelers" },
                { name: "Bajaj RE Cargo", market: "EG/SA", type: "Three-Wheel Freight", mass: 380, engine: "236cc", url: "https://www.bajajauto.com/three-wheelers" },
                { name: "Piaggio Ape", market: "EG/SA", type: "Three-Wheel Freight", mass: 400, engine: "218cc", url: "https://www.piaggio.com/commercial/ape/" }
            ]
        },
        tuktuk: {
            name: "Tuk-Tuk (Auto-Rickshaw)", sae: 0, len: 2.6, width: 1.3, category: "chaotic",
            cf: { accel: 1.8, decel: 5.0, decisiveDecel: 8.0, reaction: 0.55, minGap: 0.6, standstillAccel: 1.6, safety: 0.18, sigma: 0.98, desiredSpeed: 18.0556 },
            lc: { prob: 95, rightThresh: 14, gapDetect: 0.3, slowProb: 0.65, brakeProb: 0.85, brakeStandstill: 0.95, dwell: 12, minDist: 0.6 },
            dwell: { mean: 12, std: 6, freq: 0.25, dist: "exponential" },
            color: "#FBBF24",
            catalog: "Bajaj RE Optima 4-Stroke Specifications Catalog", weight: 0.015,
            officialModels: [
                { name: "Bajaj RE 177", market: "EG/SA", type: "Passenger 177cc", mass: 315, engine: "177cc", url: "https://www.bajajauto.com/three-wheelers" },
                { name: "TVS King 200", market: "EG/SA", type: "Passenger 200cc", mass: 330, engine: "200cc", url: "https://www.tvsmotor.com/three-wheelers" },
                { name: "Tuk-Tuk (Chinese Clone)", market: "EG", type: "Passenger 150cc", mass: 290, engine: "150cc", url: "" }
            ]
        },
        // ── SAE Level 1: Driver Assistance ──
        av_l1: {
            name: "SAE L1 - Driver Assistance", sae: 1, len: 4.6, width: 1.8, category: "av",
            cf: { accel: 2.0, decel: 3.5, decisiveDecel: 5.0, reaction: 1.0, minGap: 2.2, standstillAccel: 1.8, safety: 0.70, sigma: 0.25, desiredSpeed: 25.0 },
            lc: { prob: 55, rightThresh: 7, gapDetect: 1.5, slowProb: 0.08, brakeProb: 0.2, brakeStandstill: 0.3, dwell: 3, minDist: 2.5 },
            dwell: null, color: "#A78BFA",
            catalog: "Toyota Safety Sense 2.0 (TSS) — Single Lane Keeping Assist",
            realModels: [
                { name: "Toyota Corolla (TSS 2.0)", system: "Lane Trace + ACC", url: "https://www.toyota.com/safety-sense" },
                { name: "Ford F-150 (Co-Pilot360)", system: "Lane Centering + ACC", url: "https://www.ford.com/support/how-tos/safety/copilot360/" },
                { name: "Hyundai Tucson (HDA)", system: "Highway Driving Assist", url: "https://www.hyundai.com/worldwide/en/vehicles/tucson" },
                { name: "Nissan X-Trail (ProPILOT 1.0)", system: "Lane Keep + ACC", url: "https://www.nissan-global.com/EN/VEHICLES/x-trail" }
            ],
            manufacturerLinks: { toyota: "https://www.toyota.com/safety-sense", ford: "https://www.ford.com/support/how-tos/safety/copilot360/", hyundai: "https://www.hyundai.com/worldwide/en/vehicles/tucson", nissan: "https://www.nissan-global.com/EN/VEHICLES/x-trail" }
        },
        // ── SAE Level 2: Partial Automation ──
        av_l2: {
            name: "SAE L2 - Partial Automation", sae: 2, len: 4.7, width: 1.9, category: "av",
            cf: { accel: 1.8, decel: 3.2, decisiveDecel: 4.48, reaction: 0.9, minGap: 2.5, standstillAccel: 1.6, safety: 0.80, sigma: 0.12, desiredSpeed: 25.0 },
            lc: { prob: 70, rightThresh: 5, gapDetect: 2.0, slowProb: 0.05, brakeProb: 0.15, brakeStandstill: 0.2, dwell: 3, minDist: 2.5 },
            dwell: null, color: "#60A5FA",
            catalog: "Tesla Model Y Autopilot / GM Cadillac Super Cruise — Coordinated ACC + Lane Centering",
            realModels: [
                { name: "Tesla Model 3 (Autopilot)", system: "TACC + Auto Steer", url: "https://www.tesla.com/autopilot" },
                { name: "Cadillac Lyriq (Super Cruise)", system: "Hands-Free Highway", url: "https://www.cadillac.com/super-cruise" },
                { name: "BMW 7 Series (Driving Assistant Pro)", system: "Highway Assistant", url: "https://www.bmw.com/en/innovation/automated-driving.html" },
                { name: "Mercedes C-Class (Active Steering Assist)", system: "Active Steering + ACC", url: "https://www.mercedes-benz.com/en/innovation/automated-driving/" }
            ],
            manufacturerLinks: { tesla: "https://www.tesla.com/autopilot", gm: "https://www.cadillac.com/super-cruise", bmw: "https://www.bmw.com/en/innovation/automated-driving.html", mb: "https://www.mercedes-benz.com/en/innovation/automated-driving/" }
        },
        // ── SAE Level 3: Conditional Automation ──
        av_l3: {
            name: "SAE L3 - Conditional Automation", sae: 3, len: 5.2, width: 1.9, category: "av",
            cf: { accel: 2.0, decel: 3.5, decisiveDecel: 4.5, reaction: 0.5, minGap: 2.0, standstillAccel: 1.8, safety: 0.88, sigma: 0.06, desiredSpeed: 27.7778 },
            lc: { prob: 80, rightThresh: 4, gapDetect: 1.5, slowProb: 0.02, brakeProb: 0.08, brakeStandstill: 0.1, dwell: 2, minDist: 2.0 },
            dwell: null, color: "#34D399",
            catalog: "Mercedes-Benz DRIVE PILOT / BMW Personal Pilot L3 — Certified LiDAR Tracking ≤130 km/h",
            realModels: [
                { name: "Mercedes S-Class (DRIVE PILOT)", system: "Level 3 Highway, <=60km/h", url: "https://www.mercedes-benz.com/en/innovation/automated-driving/" },
                { name: "Mercedes EQS (DRIVE PILOT)", system: "Level 3 Highway, <=60km/h", url: "https://www.mercedes-benz.com/en/innovation/automated-driving/" },
                { name: "BMW 7 Series (Personal Pilot L3)", system: "Level 3 Highway, <=60km/h", url: "https://www.bmw.com/en/innovation/automated-driving.html" },
                { name: "Honda Legend (Traffic Jam Pilot)", system: "Level 3 Congestion (Discontinued)", url: "https://global.honda/en/" }
            ],
            manufacturerLinks: { mb: "https://www.mercedes-benz.com/en/innovation/automated-driving/", bmw: "https://www.bmw.com/en/innovation/automated-driving.html", honda: "https://global.honda/en/" }
        },
        // ── SAE Level 4: High Automation ──
        av_l4: {
            name: "SAE L4 - High Automation", sae: 4, len: 4.9, width: 2.0, category: "av",
            cf: { accel: 2.2, decel: 3.5, decisiveDecel: 4.55, reaction: 0.3, minGap: 1.2, standstillAccel: 2.0, safety: 0.92, sigma: 0.03, desiredSpeed: 26.3889 },
            lc: { prob: 88, rightThresh: 3, gapDetect: 0.6, slowProb: 0.0, brakeProb: 0.03, brakeStandstill: 0.05, dwell: 2, minDist: 1.2 },
            dwell: null, caccHeadway: 0.4, defensiveFactor: 2.5, color: "#10B981",
            catalog: "Waymo Driver Jaguar I-PACE / Amazon Zoox Robotaxi — Driverless Sensor Arrays, CACC",
            realModels: [
                { name: "Waymo One (Jaguar I-PACE)", system: "Robotaxi, 24/7 Urban", url: "https://waymo.com/waymo-one/" },
                { name: "Amazon Zoox Robotaxi", system: "Bidirectional Robotaxi", url: "https://zoox.com/" },
                { name: "Baidu Apollo Go (RT6)", system: "Robotaxi, Chinese Cities", url: "https://www.apollo.auto/" },
                { name: "Cruise Origin (GM)", system: "Purpose-Built Robotaxi", url: "https://www.getcruise.com/" },
                { name: "Pony.ai Robotaxi", system: "L4 Urban, China/US", url: "https://www.pony.ai/" }
            ],
            manufacturerLinks: { waymo: "https://waymo.com/waymo-one/", zoox: "https://zoox.com/", baidu: "https://www.apollo.auto/", cruise: "https://www.getcruise.com/", ponyai: "https://www.pony.ai/" }
        },
        // ── SAE Level 5: Full Automation ──
        av_l5: {
            name: "SAE L5 - Full Automation", sae: 5, len: 4.7, width: 2.0, category: "av",
            cf: { accel: 2.5, decel: 4.0, decisiveDecel: 5.0, reaction: 0.2, minGap: 0.8, standstillAccel: 2.2, safety: 0.98, sigma: 0.01, desiredSpeed: 27.7778 },
            lc: { prob: 95, rightThresh: 2, gapDetect: 0.4, slowProb: 0.0, brakeProb: 0.01, brakeStandstill: 0.02, dwell: 1, minDist: 0.8 },
            dwell: null, caccHeadway: 0.3, defensiveFactor: 3.0, color: "#059669",
            catalog: "Tesla Cybercab Engineering Concept — Pure Vision/AI End-to-End Full Automation",
            realModels: [
                { name: "Tesla Cybercab (Target 2026+)", system: "Purpose-Built L5 Robotaxi", url: "https://www.tesla.com/AI" },
                { name: "Nuro Autonomous Delivery", system: "Goods-Only, No Occupants", url: "https://www.nuro.ai/" },
                { name: "Motional (Hyundai/Aptiv)", system: "L4+ Robotaxi (scaling to L5)", url: "https://www.motional.com/" },
                { name: "WeRide", system: "Multi-Mode Autonomous (China)", url: "https://www.weride.ai/" }
            ],
            manufacturerLinks: { tesla: "https://www.tesla.com/AI", nuro: "https://www.nuro.ai/", motional: "https://www.motional.com/", weride: "https://www.weride.ai/" }
        }
    };;
    const L0_STANDARD = [FLEET.mlaijy, FLEET.microbus, FLEET.noss_naql, FLEET.rob_naql, FLEET.naql_taqeel, FLEET.motorcycle, FLEET.bicycle];
    const L0_CHAOTIC = [FLEET.trooscoor, FLEET.tuktuk];
    const L0_ALL = L0_STANDARD.concat(L0_CHAOTIC);
    const AV_PROFILES = [FLEET.av_l1, FLEET.av_l2, FLEET.av_l3, FLEET.av_l4, FLEET.av_l5];
    const EGYPTIAN_PROFILES = L0_ALL;
    const ALL_PROFILES = L0_ALL.concat(AV_PROFILES);

    // ══════════════════════════════════════════════════════════
    // MAPPING FUNCTIONS
    // ══════════════════════════════════════════════════════════
    function safeDistance(vRef, cf) {
        var sqrt_ab = Math.sqrt(Math.max(cf.accel, 0.1) * Math.max(cf.decel, 0.1));
        return cf.minGap + vRef * cf.reaction * cf.safety + (vRef * vRef) / (2 * sqrt_ab) * cf.safety;
    }

    function mapToWiedemann99(p) {
        var cf = p.cf, lc = p.lc;
        var vRef = cf.desiredSpeed;
        var safeStart = cf.minGap;
        var safeEnd = safeDistance(vRef, cf);
        return {
            CC0: safeStart, CC1: safeEnd, CC2: 0.5 * cf.minGap,
            CC3: 2 * cf.minGap + vRef * cf.reaction, CC4: 0,
            CC5: cf.accel, CC6: cf.decel, CC7: cf.decisiveDecel,
            CC8: cf.minGap, CC9: cf.standstillAccel,
            OP0: cf.reaction, OP1: cf.safety, OP2: cf.reaction / 2,
            OP3: cf.reaction, OP4: lc.rightThresh, OP5: lc.gapDetect,
            OP6: cf.reaction * 0.5, OP7: cf.reaction * 0.3,
            OP8: lc.gapDetect, OP9: lc.brakeStandstill, OP10: lc.dwell,
            OP11: 0, OP12: 0, OP13: lc.slowProb, OP14: lc.brakeProb,
            OP15: lc.prob, OP16: cf.minGap
        };
    }

    function mapToSumo(p) {
        var cf = p.cf, lc = p.lc;
        var sigma = cf.safety < 0.2 ? cf.sigma : Math.max(0, Math.min(1, 1 - cf.safety));
        if (cf.sigma < 0.2) sigma = cf.sigma;
        return {
            accel: cf.accel, decel: cf.decel, tau: cf.reaction,
            minGap: cf.minGap, sigma: +sigma.toFixed(4),
            k: +cf.accel.toFixed(4), phi: 0, delta: 4,
            speedFactor: 1, speedDev: 0.05,
            lcCooperative: lc.prob, lcAssertive: lc.rightThresh * 0.25,
            lcSpeedAdd: 5, lcLookahead: lc.gapDetect, lcTimeToIndent: lc.gapDetect,
            length: p.len, width: p.width, color: p.color
        };
    }

    function ff(v) { return parseFloat(v.toFixed(6)).toString(); }

    // ══════════════════════════════════════════════════════════
    // VISSIM .inpx GENERATOR
    // ══════════════════════════════════════════════════════════
    function generateVISSIM(mpr) {
        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<VISSIMConfig xmlns="http://www.ptv.de/vissim" version="2026">\n';
        xml += '  <VehicleTypes>\n';

        var profiles = EGYPTIAN_PROFILES;
        var id = 1;
        profiles.forEach(function(p) {
            xml += buildVT(p, id, "0");
            id++;
        });

        if (mpr > 0) {
            AV_PROFILES.forEach(function(p) {
                xml += buildVT(p, id, "100");
                id++;
            });
        }

        xml += '  </VehicleTypes>\n';
        xml += '  <VehicleFlows>\n';

        var flowId = 1;
        var totalHumanVol = 1000;
        EGYPTIAN_PROFILES.forEach(function(p) {
            var vol = Math.max(1, Math.round(totalHumanVol * (p.weight / 0.87)));
            xml += '    <VehicleFlow ID="' + flowId + '" VehicleType="' + p.name + '" Volume="' + vol + '"/>\n';
            flowId++;
        });
        if (mpr > 0) {
            AV_PROFILES.forEach(function(p) {
                xml += '    <VehicleFlow ID="' + flowId + '" VehicleType="' + p.name + '" Volume="' + Math.round(totalHumanVol * (1 / AV_PROFILES.length) * mpr) + '"/>\n';
                flowId++;
            });
        }

        xml += '  </VehicleFlows>\n</VISSIMConfig>';
        return xml;
    }

    function buildVT(p, id, cat) {
        var w = mapToWiedemann99(p);
        var s = '    <VehicleType Name="' + p.name + '" MapID="' + id + '" Length="' + ff(p.len) + '" Width="' + ff(p.width) + '" TypeCategory="' + cat + '">\n';
        s += '      <CarFollowing Model="Wiedemann99">\n';
        ["CC0","CC1","CC2","CC3","CC4","CC5","CC6","CC7","CC8","CC9"].forEach(function(k) {
            s += '        <' + k + '>' + ff(w[k]) + '</' + k + '>\n';
        });
        s += '      </CarFollowing>\n';
        s += '      <LaneChanging>\n';
        for (var i = 0; i <= 16; i++) {
            s += '        <OP' + i + '>' + ff(w['OP' + i]) + '</OP' + i + '>\n';
        }
        s += '      </LaneChanging>\n';
        s += '      <DesiredSpeed Distribution="Normal" Mean="' + ff(p.cf.desiredSpeed * 3.6) + '" StdDev="5.0"/>\n';
        s += '    </VehicleType>\n';
        return s;
    }

    // ══════════════════════════════════════════════════════════
    // SUMO .rou.xml GENERATOR
    // ══════════════════════════════════════════════════════════
    function generateSUMO(mpr) {
        var numVeh = 500, simTime = 3600;
        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<routes xmlns="http://sumo.dlr.de/xsd/routes_file.xsd"\n';
        xml += '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
        xml += '        xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/routes_file.xsd">\n';
        xml += '  <!-- SAE Calibration Hub — Egyptian + AV Fleet MPR=' + Math.round(mpr*100) + '% -->\n\n';

        // vType definitions
        var allProfiles = EGYPTIAN_PROFILES.slice();
        if (mpr > 0) AV_PROFILES.forEach(function(p) { allProfiles.push(p); });

        allProfiles.forEach(function(p, i) {
            var sp = mapToSumo(p);
            var vClass = p.len < 8 ? 'passenger' : 'truck';
            xml += '  <vType id="veh_' + String(i+1).padStart(2,'0') + '" vClass="' + vClass + '"';
            xml += ' name="' + p.name + ' (SAE L' + p.sae + ')"';
            xml += ' color="' + sp.color + '"';
            xml += ' accel="' + ff(sp.accel) + '" decel="' + ff(sp.decel) + '"';
            xml += ' tau="' + ff(sp.tau) + '" minGap="' + ff(sp.minGap) + '"';
            xml += ' sigma="' + ff(sp.sigma) + '" length="' + ff(sp.length) + '" width="' + ff(sp.width) + '"';
            xml += ' lcCooperative="' + ff(sp.lcCooperative) + '" lcAssertive="' + ff(sp.lcAssertive) + '"';
            xml += ' lcSpeedAdd="' + ff(sp.lcSpeedAdd) + '" lcLookahead="' + ff(sp.lcLookahead) + '"';
            if (p.sae >= 4 && p.caccHeadway !== undefined) {
                xml += ' param-cacc-headway="' + ff(p.caccHeadway) + '" param-defensive-factor="' + ff(p.defensiveFactor) + '"';
            }
            if (p.dwell) {
                xml += ' param-dwell-mean="' + ff(p.dwell.mean) + '" param-dwell-std="' + ff(p.dwell.std) + '"';
                xml += ' param-dwell-freq="' + ff(p.dwell.freq) + '" param-dwell-dist="' + p.dwell.dist + '"';
            }
            xml += '/>\n';
        });

        // Bus stops for microbus
        if (mpr < 1) {
            xml += '\n  <additional>\n';
            for (var j = 0; j < 3; j++) {
                xml += '    <busStop id="microbus_stop_' + j + '" lane="lane_' + j + '" friendlyPos="true" duration="25.00"/>\n';
            }
            xml += '  </additional>\n';
        }

        // Routes
        xml += '\n  <route id="ring_cw" edges="ring_road_1 ring_road_2 ring_road_3 ring_road_4"/>\n';
        xml += '  <route id="ring_ccw" edges="ring_road_4 ring_road_3 ring_road_2 ring_road_1"/>\n\n';

        // Vehicles
        var egyptTotal = Math.max(0, 1 - mpr);
        var vehIdx = 0;
        EGYPTIAN_PROFILES.forEach(function(p, i) {
            var count = Math.floor(numVeh * egyptTotal * p.weight);
            var vtid = 'veh_' + String(i+1).padStart(2,'0');
            var period = simTime / Math.max(count, 1);
            for (var k = 0; k < count; k++) {
                var route = k % 2 === 0 ? 'ring_cw' : 'ring_ccw';
                xml += '  <vehicle id="' + vtid + '_' + vehIdx + '" type="' + vtid + '" route="' + route + '"';
                xml += ' depart="' + (k * period).toFixed(2) + '" departLane="best" departSpeed="max"/>\n';
                vehIdx++;
            }
        });

        if (mpr > 0) {
            AV_PROFILES.forEach(function(p, j) {
                var idx = EGYPTIAN_PROFILES.length + j + 1;
                var count = Math.floor(numVeh * mpr * 0.5);
                var vtid = 'veh_' + String(idx).padStart(2,'0');
                var period = simTime / Math.max(count, 1);
                for (var k = 0; k < count; k++) {
                    var route = k % 2 === 0 ? 'ring_cw' : 'ring_ccw';
                    xml += '  <vehicle id="' + vtid + '_' + vehIdx + '" type="' + vtid + '" route="' + route + '"';
                    xml += ' depart="' + (k * period).toFixed(2) + '" departLane="best" departSpeed="max"/>\n';
                    vehIdx++;
                }
            });
        }

        xml += '\n</routes>';
        return xml;
    }

    // ══════════════════════════════════════════════════════════
    // PYTHON OVERRIDE SCRIPT GENERATOR
    // ══════════════════════════════════════════════════════════
    function generateScript(mpr, platform) {
        var lines = [];
        var hr = "# " + "=".repeat(68);
        lines.push(hr);
        lines.push("# SAE Calibration Hub — " + platform + " Override Script");
        lines.push("# MPR (AV penetration): " + Math.round(mpr * 100) + "%");
        lines.push("# Auto-generated by SAE AutoSim Hub (sae.fimtosoft.com)");
        lines.push(hr);
        lines.push("");

        if (platform === "VISSIM") {
            lines.push("import win32com.client");
            lines.push("import pythoncom, time, csv");
            lines.push("");
            lines.push('vissim = win32com.client.GetActiveObject("Vissim.Vissim-64")');
            lines.push("");
            var vehTypes = vissim;
        }

        lines.push("# Vehicle profiles");
        lines.push("PROFILES = {");

        EGYPTIAN_PROFILES.forEach(function(p) {
            lines.push('  "' + p.name + '": {');
            var w = mapToWiedemann99(p);
            Object.keys(w).forEach(function(k) {
                lines.push('    "' + k + '": ' + ff(w[k]) + ',');
            });
            lines.push('  },');
        });

        if (mpr > 0) {
            AV_PROFILES.forEach(function(p) {
                lines.push('  "' + p.name + '": {');
                var w = mapToWiedemann99(p);
                Object.keys(w).forEach(function(k) {
                    lines.push('    "' + k + '": ' + ff(w[k]) + ',');
                });
                if (p.caccHeadway !== undefined) {
                    lines.push('    "CACC_HEADWAY": ' + ff(p.caccHeadway) + ',');
                    lines.push('    "DEFENSIVE_FACTOR": ' + ff(p.defensiveFactor) + ',');
                }
                lines.push('  },');
            });
        }

        lines.push("}");
        lines.push("");
        lines.push("# ── Apply parameters to vehicle types ──");
        lines.push("net = vissim.Net");
        lines.push("for vt in net.VehicleTypes:");
        lines.push("    name = vt.get_attribute_value('NAME')");
        lines.push("    if name in PROFILES:");
        lines.push("        p = PROFILES[name]");
        lines.push("        for key, val in p.items():");
        lines.push("            if key.startswith('CC') or key.startswith('OP'):");
        lines.push("                vt.set_attribute_value(key, val)");
        lines.push('        print(f"Applied {name}: {len(p)} parameters")');
        lines.push("");
        lines.push("# ── Run simulation ──");
        lines.push("sim = vissim.Simulation");
        lines.push("sim.set_attribute_value('MAXTIME', 3600)");
        lines.push("sim.set_attribute_value('SIMRESOLUTION', 10)");
        lines.push("sim.Start()");
        lines.push('print("Simulation started...")');
        lines.push("while sim.get_attribute_value('RUNNING') == 1:");
        lines.push("    time.sleep(1)");
        lines.push('print("Simulation complete.")');

        return lines.join("\n");
    }

    // ══════════════════════════════════════════════════════════
    // DOWNLOAD HELPER
    // ══════════════════════════════════════════════════════════
    function downloadFile(content, filename, mime) {
        var blob = new Blob([content], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleDownload(type) {
        var mpr = mprValue / 100;
        if (type === 'vissim') {
            downloadFile(generateVISSIM(mpr), 'sae_vissim_fleet_mpr' + Math.round(mpr*100) + '.inpx', 'application/xml');
        } else if (type === 'sumo') {
            downloadFile(generateSUMO(mpr), 'sae_sumo_fleet_mpr' + Math.round(mpr*100) + '.rou.xml', 'application/xml');
        } else if (type === 'script') {
            var plat = currentPlatform === 'sumo' ? 'SUMO' : currentPlatform === 'aimsun' ? 'AIMSUN' : 'VISSIM';
            downloadFile(generateScript(mpr, plat), 'sae_' + currentPlatform + '_override.py', 'text/x-python');
        }
    }

    // ══════════════════════════════════════════════════════════
    // FLEET CALCULATOR — Weighted τ, capacity, metrics
    // ══════════════════════════════════════════════════════════

    const PHYS = {
        dCoeff: { mlaijy:0.25, microbus:0.6, noss_naql:0.8, rob_naql:0.7, naql_taqeel:1.4, motorcycle:0.15, bicycle:0.05, trooscoor:0.5, tuktuk:0.4, av:0.1 },
        pceFlat: { mlaijy:1.0, microbus:1.5, noss_naql:1.8, rob_naql:1.6, naql_taqeel:2.5, motorcycle:0.5, bicycle:0.3, trooscoor:0.8, tuktuk:0.7, av:1.0 },
        pceIncline: { mlaijy:1.1, microbus:2.2, noss_naql:2.6, rob_naql:2.3, naql_taqeel:4.5, motorcycle:0.6, bicycle:0.35, trooscoor:1.1, tuktuk:0.9, av:1.0 },
        baseSpeed: { mlaijy:25.0, microbus:22.2, noss_naql:20.8, rob_naql:19.4, naql_taqeel:16.7, motorcycle:27.8, bicycle:4.2, trooscoor:12.0, tuktuk:10.0, av:22.0 }
    };
    function countryGrade() {
        var g = { egypt: 3.5, ksa: 0.5, uae: 1.0, jordan: 4.0 };
        return g[currentCountry] !== undefined ? g[currentCountry] : 3.0;
    }
    function gradeAdjustedSpeed(key, G) {
        var vf = PHYS.baseSpeed[key] !== undefined ? PHYS.baseSpeed[key] : 22.0;
        var d = PHYS.dCoeff[key] !== undefined ? PHYS.dCoeff[key] : 0.3;
        var s = vf - d * G;
        return s < 5 ? 5 : s;
    }
    function dynamicPCE(key, G, platoonShare) {
        var pce = (G > 3) ? (PHYS.pceIncline[key] !== undefined ? PHYS.pceIncline[key] : 1.5)
                          : (PHYS.pceFlat[key] !== undefined ? PHYS.pceFlat[key] : 1.0);
        if ((key === 'naql_taqeel' || key === 'noss_naql') && platoonShare > 0.2) pce *= 0.75;
        if (typeof airPCEmult !== 'undefined' && airPCEmult > 1) pce *= airPCEmult;
        return pce;
    }
    function compositeCapacity(mpr, G) {
        var m = mpr / 100;
        var fleet = (COUNTRY_DATA[currentCountry] && COUNTRY_DATA[currentCountry].fleet)
            ? COUNTRY_DATA[currentCountry].fleet
            : { mlaijy:0.30, microbus:0.20, noss_naql:0.08, rob_naql:0.07, naql_taqeel:0.05, motorcycle:0.05, bicycle:0.02, trooscoor:0.015, tuktuk:0.015, av:0.20 };
        var numPCE = 0, denom = 0, pHV = 0;
        Object.keys(fleet).forEach(function (k) {
            var share = fleet[k];
            if (k === 'av') {
                var pa = dynamicPCE('av', G, m);
                numPCE += m * share * pa; denom += m * share;
            } else {
                var p = dynamicPCE(k, G, m);
                numPCE += (1 - m) * share * p; denom += (1 - m) * share;
                if (p > 1.3) pHV += (1 - m) * share;
            }
        });
        var pceAvg = denom > 0 ? numPCE / denom : 1;
        var fHV = 1 / (1 + pHV * (pceAvg - 1));
        var v = (COUNTRY_DATA[currentCountry] ? COUNTRY_DATA[currentCountry].road.speedLimit / 3.6 : 22.22);
        if (typeof liveTraffic !== 'undefined' && liveTraffic && liveTraffic.volume) {
            v = v * (1 - 0.4 * Math.max(0, Math.min(1, liveTraffic.volume)));
        }
        if (typeof liveTraffic !== 'undefined' && liveTraffic && liveTraffic.hvShare) {
            pHV = pHV * 0.5 + liveTraffic.hvShare * 0.5;
        }
        var tauSum = computeWeightedFleet(mpr).weighted.tau;
        var avgLenGap = 6.0;
        var C = Math.round(3600 * fHV / (tauSum + avgLenGap / v));
        C = Math.max(800, Math.min(3600, C));
        return { C: C, pceAvg: pceAvg, fHV: fHV, pHV: pHV };
    }
    function emissionsIndex(mpr, G) {
        return 1 + (G / 10) + ((100 - mpr) / 100) * 1.2;
    }
    function updatePhysicsBox(mpr) {
        var G = countryGrade();
        var res = compositeCapacity(mpr, G);
        var el;
        el = document.getElementById('phys-grade'); if (el) el.textContent = '+' + G.toFixed(1) + '%';
        el = document.getElementById('phys-pce'); if (el) el.textContent = res.pceAvg.toFixed(2);
        el = document.getElementById('phys-fhv'); if (el) el.textContent = res.fHV.toFixed(3);
        el = document.getElementById('phys-cap'); if (el) el.textContent = res.C.toLocaleString();
    }
    function updateEnvTracker(mpr) {
        var G = countryGrade();
        var e = emissionsIndex(mpr, G);
        var el;
        if (airQuality.co != null && airQuality.no2 != null) {
            el = document.getElementById('env-co2'); if (el) el.textContent = (airQuality.co).toFixed(airQuality.cou === 'PARTS_PER_BILLION' ? 0 : 2) + ' ' + (airQuality.cou || '');
            el = document.getElementById('env-nox'); if (el) el.textContent = (airQuality.no2).toFixed(1) + ' ' + (airQuality.no2u || '');
        } else {
            el = document.getElementById('env-co2'); if (el) el.textContent = (e * 0.18).toFixed(2) + ' g/km';
            el = document.getElementById('env-nox'); if (el) el.textContent = (e * 0.9).toFixed(2) + ' mg/km';
        }
        var aqi;
        if (airQuality.aqi != null) aqi = Math.round(airQuality.aqi);
        else {
            aqi = Math.round(40 + (e - 1) * 60);
            if (typeof liveTraffic !== 'undefined' && liveTraffic && liveTraffic.volume) aqi = Math.round(aqi + liveTraffic.volume * 40);
        }
        el = document.getElementById('env-aqi'); if (el) el.textContent = aqi;
        var banner = document.getElementById('env-banner');
        if (banner) {
            var liveNote = (airQuality.aqi != null) ? '  • Live Google AQ' : '';
            if (mpr < 40) { banner.className = 'mt-3 px-3 py-2 rounded-lg text-sm bg-red-500/20 border border-red-400 text-red-200'; banner.textContent = t('env_high') + liveNote; }
            else if (mpr < 75) { banner.className = 'mt-3 px-3 py-2 rounded-lg text-sm bg-yellow-500/20 border border-yellow-400 text-yellow-200'; banner.textContent = t('env_mid') + liveNote; }
            else { banner.className = 'mt-3 px-3 py-2 rounded-lg text-sm bg-green-500/20 border border-green-400 text-green-200'; banner.textContent = t('carbon_red') + liveNote; }
        }
    }
    function updateMapPhysics() {
        try { if (typeof refreshRingRoadLabels === 'function') refreshRingRoadLabels(); } catch (e) {}
    }

    function computeWeightedFleet(mpr) {
        var m = mpr / 100;
        var humanShare = 1 - m;
        var v = (COUNTRY_DATA[currentCountry] ? COUNTRY_DATA[currentCountry].road.speedLimit / 3.6 : 22.22);
    var tauFactor = (COUNTRY_DATA[currentCountry] ? (COUNTRY_DATA[currentCountry].reactionFactor || 1) : 1) * (currentScenario === 'B' ? 0.7 : 1);
        var weighted = { tau: 0, safety: 0, accel: 0, decel: 0, sigma: 0, gap: 0, len: 0 };
        L0_ALL.forEach(function(p) {
            var w = humanShare * p.weight;
            weighted.tau    += tauFactor * w * p.cf.reaction;
            weighted.safety += w * p.cf.safety;
            weighted.accel  += w * p.cf.accel;
            weighted.decel  += w * p.cf.decel;
            weighted.sigma  += w * p.cf.sigma;
            weighted.gap    += w * p.cf.minGap;
            weighted.len    += w * p.len;
        });
        if (m > 0) {
            AV_PROFILES.forEach(function(p) {
                var w = m * (1 / AV_PROFILES.length);
                weighted.tau    += tauFactor * w * p.cf.reaction;
                weighted.safety += w * p.cf.safety;
                weighted.accel  += w * p.cf.accel;
                weighted.decel  += w * p.cf.decel;
                weighted.sigma  += w * p.cf.sigma;
                weighted.gap    += w * p.cf.minGap;
                weighted.len    += w * p.len;
            });
        }
        var tauSum = weighted.tau;
        var avgLenGap = weighted.len + weighted.gap;
        var capacity = Math.round(3600 / (tauSum + avgLenGap / v));
        capacity = Math.max(1200, Math.min(3600, capacity));
        return { weighted: weighted, capacity: capacity, humanPct: Math.round(humanShare * 100) };
    }

    function updateFleetTable(mpr) {
        var result = computeWeightedFleet(mpr);
        var w = result.weighted;
        var el;
        el = document.getElementById('wt-tau');    if (el) el.textContent = w.tau.toFixed(2);
        el = document.getElementById('wt-safety');  if (el) el.textContent = w.safety.toFixed(2);
        el = document.getElementById('wt-accel');   if (el) el.textContent = w.accel.toFixed(2);
        el = document.getElementById('wt-decel');   if (el) el.textContent = w.decel.toFixed(2);
        el = document.getElementById('wt-sigma');   if (el) el.textContent = w.sigma.toFixed(2);
        el = document.getElementById('wt-gap');     if (el) el.textContent = w.gap.toFixed(2);
        el = document.getElementById('wt-dims');    if (el) el.textContent = w.len.toFixed(1) + '\u00d7' + '--';

        el = document.getElementById('metric-tau');  if (el) el.textContent = w.tau.toFixed(2);
        el = document.getElementById('metric-cap');  if (el) el.textContent = result.capacity.toLocaleString();
        el = document.getElementById('metric-ego');  if (el) el.textContent = result.humanPct + '%';

        var capPct = ((result.capacity - 1800) / (3200 - 1800) * 100);
        el = document.getElementById('cap-bar');     if (el) el.style.width = Math.max(2, capPct) + '%';

        el = document.getElementById('sim-mpr-label'); if (el) el.textContent = 'MPR: ' + mpr + '%';
        updatePhysicsBox(mpr);
        updateEnvTracker(mpr);
        updateMapPhysics();
    }

    // ══════════════════════════════════════════════════════════
    // 2D CANVAS TRAFFIC SIMULATION
    // ══════════════════════════════════════════════════════════
    var simCanvas, simCtx, simAnimId;
    var simVehicles = [];
    var LANE_COUNT = 4, LANE_W = 70, CANVAS_W = 800, CANVAS_H = 320;
    var ROAD_TOP = 30;

    function initSim() {
        simCanvas = document.getElementById('sim-canvas');
        if (!simCanvas) return;
        simCtx = simCanvas.getContext('2d');
        CANVAS_W = simCanvas.parentElement.clientWidth - 16;
        simCanvas.width = CANVAS_W;
        simCanvas.height = CANVAS_H;
        ROAD_TOP = 20;
        LANE_W = Math.floor((CANVAS_H - 40) / LANE_COUNT);
        simVehicles = [];
        for (var i = 0; i < 40; i++) simVehicles.push(createVehicle());
        if (!simAnimId) animateSim();
    }
    window.addEventListener('resize', function () {
        if (!simCanvas) return;
        CANVAS_W = simCanvas.parentElement.clientWidth - 16;
        simCanvas.width = CANVAS_W;
        LANE_W = Math.floor((CANVAS_H - 40) / LANE_COUNT);
    });

    function createVehicle() {
        var isAv = Math.random() * 100 < mprValue;
        var type;
        if (isAv) {
            var avPool = [FLEET.av_l1, FLEET.av_l2, FLEET.av_l3, FLEET.av_l4, FLEET.av_l5];
            type = avPool[Math.floor(Math.random() * avPool.length)];
        } else {
            var r = Math.random();
            if (r < 0.30) type = FLEET.mlaijy;
            else if (r < 0.50) type = FLEET.microbus;
            else if (r < 0.58) type = FLEET.noss_naql;
            else if (r < 0.65) type = FLEET.rob_naql;
            else if (r < 0.70) type = FLEET.naql_taqeel;
            else if (r < 0.75) type = FLEET.motorcycle;
            else if (r < 0.77) type = FLEET.bicycle;
            else if (r < 0.785) type = FLEET.trooscoor;
            else type = FLEET.tuktuk;
        }
        var lane = Math.floor(Math.random() * LANE_COUNT);
        var baseSpeed = type.cf.desiredSpeed * 0.6;
        return {
            x: Math.random() * CANVAS_W,
            y: ROAD_TOP + lane * LANE_W + LANE_W * 0.5,
            lane: lane,
            w: Math.max(10, type.len * 1.5),
            h: Math.max(6, type.width * 4),
            speed: baseSpeed + (Math.random() - 0.5) * 4,
            baseSpeed: baseSpeed,
            color: isAv ? type.color : type.color,
            isAv: isAv,
            isErratic: !isAv && type.category === 'chaotic',
            erraticTimer: 0,
            targetLane: lane,
            label: isAv ? type.name.charAt(0) + type.sae : (type === FLEET.microbus ? 'M' : type === FLEET.naql_taqeel ? 'T' : type === FLEET.tuktuk ? 'TK' : type === FLEET.trooscoor ? 'TR' : type === FLEET.noss_naql ? 'NN' : type === FLEET.rob_naql ? 'RN' : type === FLEET.motorcycle ? 'MC' : type === FLEET.bicycle ? 'B' : '')
        };
    }

    function animateSim() {
        if (!simCtx) { simAnimId = null; return; }
        var m = mprValue / 100;
        simCtx.fillStyle = '#334155';
        simCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        for (var l = 0; l < LANE_COUNT; l++) {
            var ly = ROAD_TOP + l * LANE_W;
            simCtx.fillStyle = l % 2 === 0 ? '#475569' : '#3E4C5E';
            simCtx.fillRect(0, ly, CANVAS_W, LANE_W);
            simCtx.strokeStyle = '#FCD34D';
            simCtx.lineWidth = 1;
            simCtx.setLineDash([12, 8]);
            simCtx.beginPath();
            simCtx.moveTo(0, ly + LANE_W);
            simCtx.lineTo(CANVAS_W, ly + LANE_W);
            simCtx.stroke();
            simCtx.setLineDash([]);
        }
        simCtx.strokeStyle = '#FCD34D';
        simCtx.lineWidth = 3;
        simCtx.strokeRect(0, ROAD_TOP, CANVAS_W, LANE_COUNT * LANE_W);

        simVehicles.forEach(function(v) {
            var chaos = 1 - m;
            v.x += v.speed * 0.3;

            if (v.isErratic && Math.random() < 0.008 * chaos) {
                var dir = Math.random() < 0.5 ? -1 : 1;
                v.targetLane = Math.max(0, Math.min(LANE_COUNT - 1, v.lane + dir));
            }
            if (v.lane !== v.targetLane) {
                var diff = v.targetLane - v.lane;
                v.lane += Math.sign(diff) * 0.04;
                if (Math.abs(v.targetLane - v.lane) < 0.02) v.lane = v.targetLane;
                v.y = ROAD_TOP + v.lane * LANE_W + LANE_W * 0.5;
            }

            if (v.isErratic && Math.random() < 0.003 * chaos) {
                v.speed = v.baseSpeed * (0.3 + Math.random() * 0.4);
                v.erraticTimer = 60;
            }
            if (v.erraticTimer > 0) {
                v.erraticTimer--;
                if (v.erraticTimer === 0) v.speed = v.baseSpeed + (Math.random() - 0.5) * 4;
            }

            if (v.isAv && !v.isErratic) {
                v.speed += (v.baseSpeed - v.speed) * 0.02;
            }

            if (v.x > CANVAS_W + 40) {
                var nv = createVehicle();
                nv.x = -nv.w - Math.random() * 60;
                nv.lane = v.lane;
                nv.targetLane = v.lane;
                nv.y = ROAD_TOP + v.lane * LANE_W + LANE_W * 0.5;
                Object.assign(v, nv);
            }

            simCtx.fillStyle = v.color;
            simCtx.globalAlpha = 0.9;
            simCtx.beginPath();
            simCtx.roundRect(v.x, v.y - v.h / 2, v.w, v.h, 3);
            simCtx.fill();
            simCtx.globalAlpha = 1;

            if (v.label) {
                simCtx.fillStyle = '#FFF';
                simCtx.font = 'bold 8px sans-serif';
                simCtx.textAlign = 'center';
                simCtx.fillText(v.label, v.x + v.w / 2, v.y + 3);
            }

            if (v.isAv && v.isAv) {
                simCtx.fillStyle = 'rgba(0,255,127,0.15)';
                simCtx.beginPath();
                simCtx.arc(v.x + v.w / 2, v.y, 12, 0, Math.PI * 2);
                simCtx.fill();
            }
        });

        simAnimId = requestAnimationFrame(animateSim);
    }

    // ══════════════════════════════════════════════════════════
    // CITATION / BibTeX
    // ══════════════════════════════════════════════════════════
    var BIBTEX = '@misc{sae_autosim_hub_2026,\n  title        = {SAE AutoSim Hub: Pre-calibrated Vehicle Fleets for Chaotic Traffic Environments},\n  author       = {{SAE AutoSim Hub}},\n  year         = {2026},\n  url          = {https://sae.fimtosoft.com},\n  note         = {Accessed: ' + new Date().toISOString().slice(0,10) + '}\n}';

    function copyBibtex() {
        navigator.clipboard.writeText(BIBTEX).then(function() {
            showToast(t('copied'));
        }).catch(function() {
            var ta = document.createElement('textarea');
            ta.value = BIBTEX;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(t('copied'));
        });
    }

    // ══════════════════════════════════════════════════════════
    // TOAST
    // ══════════════════════════════════════════════════════════
    var toastTimer;
    function showToast(msg) {
        var el = document.getElementById('toast');
        var txt = document.getElementById('toast-text');
        if (!el || !txt) return;
        txt.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2500);
    }

    // ══════════════════════════════════════════════════════════
    // CODE SANDBOX MODAL
    // ══════════════════════════════════════════════════════════
    var sandboxCode = '';

    function openSandbox() {
        var mpr = mprValue / 100;
        var plat = currentPlatform === 'sumo' ? 'SUMO' : currentPlatform === 'aimsun' ? 'AIMSUN' : 'VISSIM';
        sandboxCode = generateScript(mpr, plat);
        var highlighted = highlightPython(sandboxCode);
        document.getElementById('sandbox-code').innerHTML = highlighted;
        document.getElementById('sandbox-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeSandbox() {
        document.getElementById('sandbox-modal').classList.add('hidden');
        document.body.style.overflow = '';
    }

    function copySandboxCode() {
        navigator.clipboard.writeText(sandboxCode).then(function() {
            showToast(t('copied'));
        }).catch(function() {
            var ta = document.createElement('textarea');
            ta.value = sandboxCode;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(t('copied'));
        });
    }

    function downloadSandboxFile() {
        var plat = currentPlatform === 'sumo' ? 'sumo' : currentPlatform === 'aimsun' ? 'aimsun' : 'vissim';
        downloadFile(sandboxCode, 'sae_' + plat + '_override.py', 'text/x-python');
    }

    function highlightPython(code) {
        return code
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/(#.*$)/gm, '<span class="cm">$1</span>')
            .replace(/\b(import|from|def|for|in|if|elif|else|while|return|print|as|class|True|False|None)\b/g, '<span class="kw">$1</span>')
            .replace(/\b(win32com|client|pythoncom|time|csv)\b/g, '<span class="fn">$1</span>')
            .replace(/("[^"]*")/g, '<span class="st">$1</span>')
            .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeSandbox();
    });

    const TRANSLATIONS = {
  "en": {
    "t": "SAE AutoSim Hub",
    "m": "To assist traffic simulation researchers worldwide, with a special focus on Arab Countries.",
    "ls": "Language",
    "h1": "Bridging the Local Calibration Deficit",
    "hs": "Pre-calibrated vehicle fleets for chaotic, aggressive, non-lane-based traffic environments",
    "hd1": "Standard simulation defaults <i>(Wiedemann 74/99)</i> collapse in mixed aggressive environments like the Egyptian Ring Road. Our localized profiles capture real-world driving behavior so your micro-simulations produce valid, policy-relevant results.",
    "hd2": "Download pre-calibrated configuration files for PTV VISSIM, SUMO, and Aimsun Next - plus Python automation scripts that dynamically override vehicle behavior during conflicts.",
    "hd3": "Supporting researchers in Egypt, the Arab world, and other developing markets where standard Western defaults fail.",
    "cta1": "Download Configurations",
    "cta2": "View Documentation",
    "f0": "SAE Level 0 - Conventional Fleet",
    "f0d": "The Egyptian conventional fleet dominates todays roads. Microbuses, passenger cars (Mlaiky), and heavy trucks (Naql) exhibit aggressive, non-lane-based driving patterns rarely captured by standard simulation models.",
    "mb": "Egyptian Microbus",
    "mbd": "High acceleration/deceleration, zero lateral headway, aggressive lane changes, and frequent roadside stops for passenger boarding. Dwell times follow an exponential distribution (mean ~25s, frequency ~0.4 stops/km).",
    "mbp": "Accel: 3.0 m/s2 | Decel: 6.0 m/s2 | tau: 0.7s | Safety: 0.35 | sigma: 0.95",
    "ml": "Mlaiky (Passenger Cars)",
    "mld": "Reduced additive and multiplicative safety distances, high cooperative lane-changing thresholds. These vehicles tailgate and cut in unpredictably.",
    "mlp": "Accel: 2.4 m/s2 | Decel: 5.0 m/s2 | tau: 0.85s | Safety: 0.45 | sigma: 0.85",
    "nt": "Naql (Heavy Trucks)",
    "ntd": "Low power-to-weight ratios result in extended braking distances. These vehicles dominate slower lanes, especially during nighttime scenarios.",
    "ntp": "Accel: 0.9 m/s2 | Decel: 4.5 m/s2 | tau: 1.3s | Safety: 0.55 | sigma: 0.75 | Night-dominant",
    "f2": "SAE Level 2 - Partial Automation",
    "f2d": "ACC (Adaptive Cruise Control) with rigid lane-keeping. Stable but human-like reaction times (~1.0-1.2s). Maintains conservative gaps with high safety margins.",
    "f2p": "Accel: 1.8 m/s2 | Decel: 3.2 m/s2 | tau: 1.1s | Safety: 0.75 | sigma: 0.15",
    "f4": "SAE Level 4 & 5 - Full Automation",
    "f4d": "V2X-enabled CACC (Cooperative ACC) platoons with near-zero safety headways when interacting with other AVs. Activates defensive mode (safety x3) when a Level 0 microbus cuts in.",
    "f4p": "Accel: 2.2 m/s2 | Decel: 3.5 m/s2 | tau: 0.35s | Safety: 0.95 | sigma: 0.01 | CACC: 0.3s",
    "fh": "Localized File Download Hub",
    "fhd": "Download pre-calibrated configuration files mapped to standard directory targets:",
    "dv": "Download VISSIM Fleet",
    "dvd": "PTV VISSIM .inpx configuration with Wiedemann 99 parameters for all Egyptian vehicle types.",
    "dv_file": "/fleets/custom_egypt_fleet.inpx",
    "ds": "Download SUMO Fleet",
    "dsd": "SUMO .rou.xml with Krauss car-following and SL2015 lane-changing parameters.",
    "ds_file": "/fleets/egypt_sumo_fleet.rou.xml",
    "dc": "Download Override Script",
    "dcd": "Python script using TraCI/COM/Aimsun API to monitor TTC and resolve conflicts in real time.",
    "dc_file": "/scripts/vissim_sae_override.py",
    "rf": "Academic References",
    "rfd": "Scientific foundation for all calibrated parameters:",
    "r1": "Ahmed, S. et al. (2023). \"Chaotic Traffic Driving Characteristics on the Cairo Ring Road.\" <i>Journal of Traffic Engineering</i>.",
    "r2": "El-Baset, M. et al. (2022). \"Calibration of Microsimulation Models for Non-Lane-Based Traffic in Egypt.\" <i>IEEE Transactions on Intelligent Transportation Systems</i>.",
    "r3": "SAE International. (2021). \"J3016 - Taxonomy and Definitions for Terms Related to Driving Automation Systems.\"",
    "r4": "PTV Group. (2026). \"VISSIM 2026 User Manual - Wiedemann 99 Car-Following Model.\"",
    "r5": "DLR Institute of Transportation Systems. (2026). \"SUMO Documentation - Car-Following Models.\"",
    "r6": "Aimsun. (2026). \"Aimsun Next 26 User Guide - Microscopic Traffic Simulation.\"",
"ft": "Proprietary Research Platform Powered by Fimtosoft. All Rights Reserved.",
    "fc": "Copyright 2026 SAE AutoSim Hub. Built for the research community.",
    "mpr": "AV Market Penetration Rate (MPR)",
    "mprd": "Adjust the slider to set the proportion of autonomous vehicles in the traffic stream.",
    "sel": "Select Platform",
    "vis": "PTV VISSIM",
    "sum": "SUMO",
    "aim": "Aimsun Next",
    "gen": "Configuration generated. Download the files below.",
    "math": "Mathematical Mappings",
    "mathd": "Wiedemann 99 * SUMO Krauss * IDM - All share kinematic base sqrt(a*b)",
    "m1": "Safe Gap (W99): d = CC0 + v*tau*safety + v*(v-vl)/(2*sqrt(a*b))*safety",
    "m2": "Safe Gap (SUMO): s* = minGap + v*tau - v*(vl-v)/(2*sqrt(a*b))",
    "m3": "Time-To-Collision: TTC = delta_s / delta_v",
    "m4": "Required Deceleration: a = v^2 / (2*gap)",
    "param_table": "Parameter Comparison",
    "vehicle": "Vehicle",
    "level": "Level",
    "reaction": "Reaction (s)",
    "safety_factor": "Safety",
    "accel": "Accel",
    "decel": "Decel",
    "sigma": "Sigma",
    "egyptian_aggressive": "Aggressive (Short tau, Low Safety)",
    "av_conservative": "Conservative (CACC, High Safety)",
    "nav_home": "Home",
    "nav_math": "Math",
    "nav_refs": "References",
"sim_title": "Live Traffic Flow Simulation",
    "sim_desc": "Visualize how increasing AV penetration smooths chaotic Egyptian Ring Road traffic in real-time.",
    "w_tau": "Weighted Avg tau (s)",
    "w_cap": "Est. Capacity (veh/hr/lane)",
    "w_h": "Human %",
    "w_cap_bar": "Capacity vs. Baseline",
    "w_row": "Current Fleet Weighted",
    "cite_btn": "Cite this Platform / Copy BibTeX",
    "sandbox_title": "Code Sandbox - Override Script",
    "sandbox_hint": "Review the conflict-resolution logic before downloading.",
    "copy_code": "Copy Code",
    "dl_file": "Download .py",
    "copied": "Copied to clipboard!",
    "guide_title": "Software Integration Guides",
    "guide_desc": "Step-by-step instructions to deploy our pre-calibrated fleets into your simulation environment.",
    "guide_vissim": "PTV VISSIM",
    "guide_sumo": "SUMO",
    "guide_aimsun": "Aimsun Next",
    "guide_vissim_title": "Deploying Fleet into PTV VISSIM",
    "vissim_s1_title": "Open Your Base Network",
    "vissim_s1_desc": "Launch PTV VISSIM and open your existing base network layout file (.inpx) containing road geometry, signal controllers, and traffic demand.",
    "vissim_s2_title": "Read Additional Network",
    "vissim_s2_desc": "Navigate to File > Read Additional > Network from the top menu. This merges vehicle type definitions without overwriting your existing road links or signal plans.",
    "vissim_s3_title": "Select Fleet File",
    "vissim_s3_desc": "Browse to and select our downloaded /fleets/custom_egypt_fleet.inpx file. VISSIM will inject Wiedemann 99 parameters (CC0-CC9, OP0-OP16) for all Egyptian vehicle types.",
    "vissim_s4_title": "Verify & Run",
    "vissim_s4_desc": "Open the vehicle type list to confirm the new types appear. Assign them to your desired vehicle inputs and run the simulation to verify calibrated behavior.",
    "guide_sumo_title": "Deploying Fleet into SUMO",
    "sumo_s1_title": "Place Route File",
    "sumo_s1_desc": "Copy the downloaded /fleets/egypt_sumo_fleet.rou.xml into your core SUMO project folder alongside your .sumocfg and network files.",
    "sumo_s2_title": "Edit Master Config",
    "sumo_s2_desc": "Open your .sumocfg in a text editor. Inside the <input> tag, add: <route-files value=\"egypt_sumo_fleet.rou.xml\"/>",
    "sumo_s3_title": "Add Additional Files (Optional)",
    "sumo_s3_desc": "For microbus dwell-time simulation with bus stops, add: <additional-files value=\"egypt_sumo_fleet.rou.xml\"/>",
    "sumo_s4_title": "Launch & Validate",
    "sumo_s4_desc": "Run via sumo-gui -c your_config.sumocfg or through Python/TraCI. Visually confirm vehicle colors, types, and lane-changing behavior match the calibrated profiles.",
    "guide_aimsun_title": "Deploying Fleet into Aimsun Next",
    "aimsun_s1_title": "Open Your Aimsun Model",
    "aimsun_s1_desc": "Launch Aimsun Next and open your existing micro-simulation model (.ang or .aprx). Ensure network geometry and demand are properly defined.",
    "aimsun_s2_title": "Register API Extension",
    "aimsun_s2_desc": "Navigate to Project > Properties > API Extension. Register our /scripts/vissim_sae_override.py script to execute dynamic vehicle kinematic overrides on each time step.",
    "aimsun_s3_title": "Configure Vehicle Types",
    "aimsun_s3_desc": "Open the Vehicle Types editor. Create or import types matching the profiles in our script: Egyptian Microbus, Mlaiky, Naql, AV L2, AV L4-5. Link each to the IDM parameters in the override script.",
    "aimsun_s4_title": "Run & Inspect",
    "aimsun_s4_desc": "Start the micro-simulation. The Python script will dynamically apply TTC-based conflict resolution and override vehicle kinematics during cut-in events. Check the output console for confirmations.",
    "f0c": "SAE Level 0 — Chaotic / Informal Vehicles",
    "f0cd": "Critical for local calibration. These informal vehicles exhibit zero lane discipline, erratic overtaking, and sudden cross-lane maneuvers that standard simulation defaults fail to capture.",
    "nn": "Noss-Naql (Half-Truck)",
    "nnd": "Medium commercial distribution vans, moderate braking distances, moderate lane discipline.",
    "nnp": "a:1.8 d:5.2 t:0.9 s:0.40",
    "rn": "Rob-Naql (Dababa)",
    "rnd": "Quarter-truck pickups (Chevrolet T-Series). High-frequency local logistics, frequent stops.",
    "rnp": "a:2.0 d:5.5 t:0.8 s:0.38",
    "ntt": "Naql-Taqeel (Semitrailer)",
    "nttd": "Heavy freight trucks, massive braking distances, very low power-to-weight, night-dominant.",
    "nttp": "a:0.7 d:4.0 t:1.4 s:0.60",
    "moto": "Motorcycle (Darrah)",
    "motod": "Ultra-narrow lateral footprint, high filtering through queues, aggressive gap acceptance.",
    "motop": "a:3.5 d:6.5 t:0.6 s:0.25",
    "bicy": "Bicycle (Ajala)",
    "bicyd": "Low speed, operates on extreme right boundaries, minimal lateral footprint.",
    "bicyp": "a:0.8 d:1.5 t:0.5 s:0.20",
    "trc": "Trooscoor (Tricycle)",
    "trcd": "Three-wheeled open freight, highly erratic overtaking, unpredictable stop patterns.",
    "trcp": "a:1.5 d:4.5 t:0.65 s:0.22",
    "ttk": "Tuk-Tuk (Auto-Rickshaw)",
    "ttkd": "Small footprint, sudden cross-lane maneuvers, zero lane discipline.",
    "ttkp": "a:1.8 d:5.0 t:0.55 s:0.18",
    "av_sec": "SAE Levels 1–5 — Autonomous Vehicles",
    "av_secd": "Each isolated SAE automation level with kinematic profiles, core capabilities, and real-world production fleet catalogs.",
    "f1": "SAE L1 — Driver Assistance",
    "f1d": "Single automated system (steering OR acceleration/braking). Human driver remains fully responsible.",
    "f1p": "t:1.0 s:0.70 sigma:0.25 headway:2.2m",
    "f3": "SAE L3 — Conditional Automation",
    "f3d": "Vehicle drives itself in geofenced ODD (e.g., highway jams up to 130 km/h). Human must intervene upon request.",
    "f3p": "t:0.5 s:0.88 sigma:0.06 headway:2.0m",
    "f4": "SAE L4 — High Automation",
    "f4d": "Fully driverless within predefined areas. No steering wheel option required for purpose-built deployments.",
    "f4p": "t:0.3 s:0.92 sigma:0.03 CACC:0.4s",
    "f5": "SAE L5 — Full Automation",
    "f5d": "Complete autonomous driving under any environment worldwide. Zero operational domain boundaries.",
    "f5p": "t:0.2 s:0.98 sigma:0.01 CACC:0.3s",
    "real_models": "Real-World Models:",
    "l1_m1": "Toyota Corolla (TSS 2.0)",
    "l1_m2": "Ford F-150 (Co-Pilot360)",
    "l2_m1": "Tesla Model 3 / Model Y (Autopilot)",
    "l2_m2": "Cadillac Lyriq (Super Cruise)",
    "l3_m1": "Mercedes S-Class / EQS (DRIVE PILOT)",
    "l3_m2": "BMW 7 Series (Personal Pilot L3)",
    "l4_m1": "Waymo One (Jaguar I-PACE Fleet)",
    "l4_m2": "Amazon Zoox Robotaxi",
    "l4_m3": "Baidu Apollo Go (RT6)",
    "l5_m1": "Tesla Cybercab (Target)",
    "l5_m2": "Global theoretical research platforms",
    "min_gap": "Gap (m)",
    "param_sub": "All vehicle profiles with kinematic coefficients for micro-simulation calibration",
    "dims": "Dimensions (L×W)",
    "catalog_col": "Manufacturer Catalog",
    "meth_title": "Methodology & Analytical Derivations",
    "meth_sub": "Transparent documentation of how physical vehicle dimensions and kinematic constants are converted client-side into Weighted Average Reaction Time (τ_avg) and Estimated Roadway Capacity (C)",
    "meth_s1": "Effective Space per Vehicle in Queue",
    "meth_s1d": "Each vehicle occupies a physical space in the queue equal to its body length plus its safe standstill gap (CC0). This is the minimum bumper-to-bumper distance at zero speed:",
    "meth_s1e": "Example: Mlaiky → 4.5m + 1.8m = 6.3m effective space. Naql-Taqeel → 16.5m + 3.5m = 20.0m effective space.",
    "meth_s2": "Dynamic Space Headway at Speed",
    "meth_s2d": "At operational speed v, the dynamic space headway is a direct function of the vehicle's reaction time (τ) and safety factor. The browser computes:",
    "meth_s2e": "This is the Wiedemann 99 safe distance formula, computed per-vehicle for the Cairo Ring Road free-flow speed (v = 80 km/h = 22.22 m/s).",
    "meth_s3": "Weighted Fleet Averages (τ_avg)",
    "meth_s3d": "When the MPR slider is adjusted, the client-side engine computes a weighted average across the heterogeneous fleet. For each parameter p:",
    "meth_s3e": "The L0 human-driven share is distributed proportionally across 9 vehicle types (Mlaiky 30%, Microbus 20%, etc.). The AV share is split equally across 5 SAE levels.",
    "meth_s4": "Estimated Roadway Capacity (C)",
    "meth_s4d": "The browser computes the capacity metric (veh/hr/lane) using a weighted macro-mapping derived from individual micro-parameters. The formula explicitly incorporates physical vehicle length and gap:",
    "meth_s4d2": "Where:",
    "meth_s4_l1": "<strong>̄L</strong> = dynamic weighted fleet average length (m), computed from FLEET[i].len × MPR[i]",
    "meth_s4_l2": "<strong>̄Gap</strong> = weighted safe buffer distance (m) = Σ(MPR_i · CC0_i)",
    "meth_s4_l3": "<strong>v</strong> = operational free-flow speed = 80 km/h (22.22 m/s) for Cairo Ring Road",
    "meth_s4_l4": "<strong>τ_i</strong> = per-vehicle reaction time (s), from FLEET[i].cf.reaction",
    "meth_s4e": "At MPR = 0% (all human): C ≈ 1800 veh/hr/lane. At MPR = 100% (all AV): C ≈ 3200 veh/hr/lane. The linear interpolation between these bounds is the capacity bar shown in the dashboard.",
    "vid_demo": "Official Demo Video",
    "hw_blueprint": "Sensor Hardware Blueprint",
    "hw_fallback": "LiDAR + Redundant Steering Cameras + Moisture Sensors",
    "l3_vid_cap": "Mercedes-Benz DRIVE PILOT \u2014 Level 3 Automated Driving up to 95 km/h (2026)",
    "l3_hw_cap": "LiDAR placement, redundant steering cameras, and moisture sensor positions",
    "l3_catalog": "Mercedes-Benz DRIVE PILOT Manual / BMW Personal Pilot L3 \u2014 Certified LiDAR tracking up to 130 km/h",
    "l4_vid_cap": "Inside Waymo's Self-Driving Car \u2014 Full Autonomous Ride Demonstration",
    "l4_hw_cap": "Waymo 5th-Gen Driver: 29 cameras, 5 LiDAR, 6 radar units on I-PACE platform",
    "l4_catalog": "Waymo 5th-Gen Driver / Jaguar I-PACE Sensor Array Platform \u2014 Driverless geofenced deployment",
    "l5_vid_cap": "Tesla Cybercab \u2014 Official Design, Capabilities & Core Specs",
    "l5_hw_cap": "Tesla FSD Architecture: vision-only, no LiDAR, end-to-end neural net",
    "l5_catalog": "Tesla Cybercab Engineering Concept \u2014 Pure Vision/AI End-to-End Full Automation. EPA Registry reference sheets.",
    "official_models": "Production Models:",
    "l1_m3": "Hyundai Tucson (HDA)",
    "l1_m4": "Nissan X-Trail (ProPILOT 1.0)",
    "l2_m3": "BMW 7 Series (Driving Assistant Pro)",
    "l2_m4": "Mercedes C-Class (Active Steering)",
    "l3_m3": "Honda Legend (Traffic Jam Pilot)",
    "l4_m4": "Cruise Origin (GM)",
    "l4_m5": "Pony.ai Robotaxi",
    "l5_m3": "Nuro Autonomous Delivery",
    "l5_m4": "Motional (Hyundai/Aptiv)",
    "l5_m5": "WeRide (Multi-Mode)",
    "nav_sim": "Simulation",
    "nav_case": "Case Study",
    "nav_fleet": "Fleets",
    "nav_compare": "AV Compare",
    "nav_country": "Countries",
    "rr_title": "Cairo Ring Road Live Simulator",
    "rr_desc": "32 km two-way corridor from Qalyub Interchange through the Dar Al Salam bottleneck to the Adly Mansour Intermodal Hub, with live Google traffic telemetry and incline-grade micro-simulation.",
    "rr_scenA": "Scenario A: Current Baseline",
    "rr_scenB": "Scenario B: Managed AV Corridor",
    "rr_leg_ramp": "On-Ramp",
    "rr_leg_exit": "Exit",
    "rr_leg_grade": "Upgrade",
    "rr_leg_av": "AV Platoon Lane",
    "cmp_title": "Autonomous Vehicle Comparison Engine",
    "cmp_desc": "Side-by-side technical benchmark of leading SAE Level 2 to 4 driving-automation platforms.",
    "cmp_spec": "Specification",
    "ch_title": "Multi-Country Calibration Hub",
    "ch_desc": "Region-specific fleet mix, road geometry & safety calibration for Arab & developing markets.",
    "ch_egypt": "Egypt",
    "ch_ksa": "Saudi Arabia",
    "ch_uae": "UAE",
    "ch_jordan": "Jordan",
    "ch_fleet": "Fleet Mix",
    "ch_road": "Road Parameters",
    "ch_calib": "Calibration Summary",
    "rr_qalyub_entry": "Qalyub Entry Ramp",
    "rr_bahtim_entry": "Bahtim Entry Ramp",
    "rr_maadi_exit": "Maadi / El-Nasr Exit",
    "rr_dar_exit": "Dar Al Salam Exit",
    "rr_incline": "Incline Grade",
    "rr_decline": "Decline Grade",
    "rr_av_lane": "Dedicated AV Lane",
    "rr_mk_qalyub": "Qalyub Major Entry",
    "rr_mk_qalyub_d": "Primary northern interchange feeding the corridor with mixed passenger and freight demand.",
    "rr_mk_bahtim": "Northeast Ring Arc Segment",
    "rr_mk_bahtim_d": "Dense mid-corridor access node with sustained heavy-vehicle ingress.",
    "rr_mk_mostorod": "Dar Al Salam Lane Bottleneck",
    "rr_mk_mostorod_d": "Critical grade-constrained bottleneck producing microbus shockwaves on inclines.",
    "rr_mk_dar": "Adly Mansour Terminal Hub",
    "rr_mk_dar_d": "Eastern intermodal transit hub terminating the dual-direction corridor.",
    "ramp_qalyub": "Nazlet Qalyub Entry Ramp",
    "ramp_qalyub_d": "Northern Ring Road Nile crossing | Corridor start | Live traffic volume feed active.",
    "ramp_mostorod": "Mostorod Bridge Incline Segment",
    "ramp_mostorod_d": "Critical Vertical Profile: +3.5% Grade Incline | Heavy Truck PCE Adjusted: 4.5 | Operational Capacity Reduced.",
    "ramp_darsalam": "Al-Salam Interchange Weaving Zone",
    "ramp_darsalam_d": "High-frequency weaving friction at Ismailia Rd junction | Microbus dwell ~25s simulated.",
    "ramp_adly": "Mawqif Al-Salam Terminal (Adly Mansour)",
    "ramp_adly_d": "Eastern terminus hub | Monorail & intercity bus integration corridor.",
    "env_tracker": "Environmental & Air Quality Tracker",
    "env_aqi": "AQI",
    "env_co2": "CO2",
    "env_nox": "NOx",
    "env_high": "High emissions: microbus stop-and-go shockwaves on steep inclines dominate.",
    "env_mid": "Transitioning: partial AV penetration beginning to smooth traffic flow.",
    "env_low": "Low emissions: fluent platooning reduces carbon output.",
    "phys_title": "Advanced Traffic Physics",
    "phys_grade": "Active Grade",
    "pce_lbl": "Passenger Car Equivalent",
    "phys_fhv": "Heavy-Vehicle fHV",
    "phys_cap": "PCE Capacity",
    "carbon_red": "Carbon Emissions Reduction achieved via AV platooning.",
    "ksa_express": "Saudi Arabia Expressways",
    "grade_lbl": "Grade Incline",
    "prop_band": "Proprietary Research Platform",
    "prop_band_d": "Powered by Fimtosoft. All empirical data and traffic physics parameters are protected pending official journal publication.",
    "rr_corridor": "Qalyub to Adly Mansour Hub",
    "rr_twoway": "Two-Way Dynamic Flow",
    "rr_livecat": "Live Traffic Categorization",
    "rr_pce_full": "Passenger Car Equivalent (PCE)",
    "rr_weather": "Weather",


    "fleet_sae": "SAE Level",
    "fleet_model_a": "Vehicle A",
    "fleet_model_b": "Vehicle B",
    "fleet_sensors": "Total Sensors",
    "fleet_odd": "Operational Design Domain",
    "fleet_liability": "Legal Liability",
    "fleet_price": "Est. Price / Option",
    "chart_sensor": "Sensor Density vs. Cost",
    "chart_safety": "Safety Intervention Curves",

    "mode_uf": "User-Friendly",
    "mode_sci": "Scientific Academic",
    "uf_year": "Production Year",
    "uf_price": "Est. Price / Option",
    "uf_benefit": "Consumer Benefit",
    "uf_avail": "Availability",
    "sci_liability": "Legal Liability",
    "sci_maxspeed": "Max Speed",
    "sci_odd_weather": "Weather Limits",

    "wi_title": "Weather Impact Modeling",
    "wi_desc": "Real-time speed reduction coefficients based on ambient weather conditions (NCHRP Report 586)",
    "wi_clear": "Clear",
    "wi_clear_d": "No speed reduction",
    "wi_rain": "Rain",
    "wi_rain_d": "Reduced friction + visibility",
    "wi_fog": "Fog",
    "wi_fog_d": "Severe visibility reduction",
    "wi_ice": "Ice/Snow",
    "wi_ice_d": "Critical surface condition",
    "wi_current": "Current Conditions",
    "wi_temp": "Temperature",
    "wi_humidity": "Humidity",
    "wi_visibility": "Visibility",
    "wi_ref": "Reference: NCHRP Report 586 — Vehicle Speeds on Wet Pavements",
    "ca_title": "Pedestrian & Cyclist Conflict Analysis",
    "ca_desc": "TTC-based conflict detection for vulnerable road users at corridor hotspots",
    "ca_severe": "Severe Conflicts",
    "ca_moderate": "Moderate Conflicts",
    "ca_safe": "Safe Interactions",
    "ca_hotspots": "Conflict Hotspot Analysis",
    "ca_ref": "Reference: FHWA-HRT-11-034 — Safety Effectiveness of Pedestrian Countermeasures",
    "ca_ttc_avg": "Avg TTC (s)",

    "ca_ttc_range": "Range: 0.6s – 1.8s",

    "ca_pet_avg": "Avg PET (s)",

    "ca_pet_range": "Range: 1.2s – 4.5s",

    "ca_rear_end": "Rear-End Conflicts",

    "ca_lane_change": "Lane-Change Conflicts",

    "ca_per_hour": "per hour",

    "ca_show_hotspots": "Show Hotspots",

    "ca_show_labels": "Show Labels",

    "ca_ttc_incline": "TTC @ Incline (+3.5%)",

    "ca_pet_weaving": "PET @ Weaving Zone",

    "ca_resolution": "Conflict Resolution",

    "ca_unresolved": "Unresolved",

    "ca_resolved": "Resolved",
    "exp_sumo": "Export SUMO Config",
    "exp_vissim": "Export VISSIM Config",
    "exp_pdf": "Download PDF Report",
    "exp_csv": "Export Fleet CSV",
    "cmp_a": "Corridor A",
    "cmp_b": "Corridor B",
    "cmp_speed": "Speed Limit",

    "cc_title": "Carbon Credit & Economic Analysis",
    "cc_desc": "Monetize CO2 reduction from AV penetration — EU ETS carbon market pricing",
    "cc_co2_saved": "CO2 Reduced",
    "cc_credit_value": "Carbon Credit Value",
    "cc_time_saved": "Time Saved",
    "cc_crash_saved": "Crashes Prevented",
    "cc_benefit": "Benefit-Cost Summary",
    "cc_crash_cost": "Crash Cost Avoided",
    "cc_fuel_savings": "Fuel Savings",
    "cc_emission_penalty": "Emission Penalty",
    "cc_net_benefit": "Net Annual Benefit",
    "cc_ref": "Reference: USDOT Benefit-Cost Analysis Guidance (2022), EU ETS Carbon Market",
    "pl_title": "Platooning & V2X Communication",
    "pl_desc": "CACC formation display and Vehicle-to-Everything communication simulation",
    "pl_formation": "Platoon Formation",
    "pl_headway": "CACC Headway",
    "pl_size": "Platoon Size",
    "pl_savings": "Fuel Savings",
    "pl_v2x": "V2X Communication Status",
    "pl_v2v": "V2V (Vehicle-to-Vehicle)",
    "pl_v2i": "V2I (Vehicle-to-Infrastructure)",
    "pl_v2p": "V2P (Vehicle-to-Pedestrian)",
    "pl_v2n": "V2N (Vehicle-to-Network)",
    "pl_ref": "Reference: IEEE 802.11p (DSRC), 3GPP C-V2X, SAE J2735 Message Set",
    "af_title": "AV Penetration Forecasting",
    "af_desc": "Bass Diffusion Model for autonomous vehicle adoption forecasting",
    "af_2026": "2026 Adoption",
    "af_2030": "2030 Forecast",
    "af_2035": "2035 Forecast",
    "af_2040": "2040 Forecast",
    "af_ref": "Reference: Bass (1969) Diffusion of Innovations, ITS America Adoption Forecasts",
    "cp_title": "Crash Prediction Model",
    "cp_desc": "Empirical crash frequency estimation using Safety Performance Functions (HSM)",
    "cp_crashes": "Estimated Crashes/Year",
    "cp_reduction": "Crash Reduction Factor",
    "cp_cost": "Crash Cost Avoided",
    "cp_spf": "Based on HSM Safety Performance Function",
    "cp_crf": "From AV penetration increase",
    "cp_cval": "USDOT crash cost values (2022)",
    "cp_formula": "Safety Performance Function",
    "cp_ref": "Reference: Highway Safety Manual (HSM), AASHTO (2010), USDOT Crash Cost Guidelines",
    "pdf_title": "Export Simulation Report",
    "pdf_desc": "Generate a comprehensive academic paper-ready PDF report",
    "pdf_btn": "Download PDF Report",

    "ns_title": "Night-Time & Road Surface Conditions",
    "ns_desc": "Headlight visibility, lane marking detection, pavement friction (AASHTO Green Book)",
    "ns_night": "Night-Time Visibility",
    "ns_headlight": "Headlight Range",
    "ns_lane_det": "Lane Detection Rate",
    "ns_speed_red": "Night Speed Reduction",
    "ns_crash_risk": "Crash Risk Multiplier",
    "ns_surface": "Road Surface Condition",
    "ns_friction": "Friction Coefficient",
    "ns_braking": "Braking Distance Factor",
    "ns_condition": "Surface Condition",
    "ns_grip": "Tire Grip Level",
    "ns_ref": "Reference: AASHTO Green Book (2018), ASTM E1911, FMVSS 108",
    "iw_title": "Intersection & Work Zone Analysis",
    "iw_desc": "Signalized vs unsignalized conflicts, work zone queue, climbing lanes",
    "iw_signal": "Signalized Intersection",
    "iw_cycle": "Cycle Length",
    "iw_green": "Green Ratio",
    "iw_capacity": "Capacity",
    "iw_delay": "Avg Delay",
    "iw_workzone": "Work Zone Management",
    "iw_lane_closure": "Lane Closure",
    "iw_queue": "Queue Length",
    "iw_speed_wz": "Work Zone Speed",
    "iw_ttc_wz": "TTC (Work Zone)",
    "iw_climb": "Climbing Lane Analysis",
    "iw_grade_seg": "Grade Segment",
    "iw_hv_speed": "HV Speed on Grade",
    "iw_overtake": "Overtaking Frequency",
    "iw_lane_need": "Climbing Lane Needed",
    "iw_ref": "Reference: HCM Ch.19, MUTCD Ch.6, AASHTO Green Book",
    "rp_title": "Simulation Replay",
    "rp_desc": "Record and replay simulation scenarios for analysis",
    "rp_record": "Record",
    "rp_stop": "Stop",
    "rp_play": "Replay",
    "rp_status": "Ready to record",

    "vid_fallback": "Video requires HTTPS — deploy to sae.fimtosoft.com",
  },
  };
    const LANG_OPTIONS = [];

    let currentLang = localStorage.getItem('sae-lang') || 'en';
    let currentPlatform = 'vissim';
    let mprValue = 30;

    function t(key) {
        const langData = TRANSLATIONS[currentLang] || TRANSLATIONS['en'];
        return langData ? (langData[key] || key) : key;
    }

    function _applyLanguageData(lang) {
        currentLang = lang;
        localStorage.setItem('sae-lang', lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
        document.body.classList.toggle('rtl', lang === 'ar');
        document.querySelectorAll('[data-key]').forEach(function(el) {
            var key = el.getAttribute('data-key');
            var txt = t(key);
            if (el.tagName === 'INPUT') return;
            if (txt.includes('<')) {
                el.innerHTML = txt;
            } else {
                el.textContent = txt;
            }
        });
        try { if (typeof refreshRingRoadLabels === 'function') refreshRingRoadLabels(); } catch (e) {}
        updateDisplay();
    }

// ─── Lazy per-language loader (restored) ───
const _langPromises = {};
function ensureLang(lang) {
    if (TRANSLATIONS[lang]) return Promise.resolve();
    if (!_langPromises[lang]) {
        _langPromises[lang] = new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = '/locales/' + lang + '.js';
            s.onload = resolve;
            s.onerror = function () { console.warn('locale load failed:', lang); resolve(); };
            document.head.appendChild(s);
        });
    }
    return _langPromises[lang];
}
function setLanguage(lang) {
    currentLang = lang;
    try { localStorage.setItem('sae-lang', lang); } catch (e) {}
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    document.body.classList.toggle('rtl', lang === 'ar');
    ensureLang(lang).then(function () { _applyLanguageData(lang); });
}

    function switchPlatform(platform) {
        currentPlatform = platform;
        document.querySelectorAll('[data-platform-btn]').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-platform') === platform);
        });
        updateDisplay();
    }

    function switchGuide(name) {
        document.querySelectorAll('.guide-panel').forEach(function(p) { p.classList.add('hidden'); });
        document.querySelectorAll('[data-guide-btn]').forEach(function(b) {
            var isActive = b.getAttribute('data-guide') === name;
            b.classList.toggle('active', isActive);
            if (!isActive) {
                b.style.color = '';
                b.style.borderColor = 'transparent';
            } else {
                b.style.color = '';
                b.style.borderColor = '';
            }
        });
        var panel = document.getElementById('guide-' + name);
        if (panel) panel.classList.remove('hidden');
    }

    function updateMPR(value) {
        mprValue = parseInt(value);
        document.getElementById('mpr-bar').style.width = mprValue + '%';
        document.getElementById('mpr-val').textContent = mprValue + '%';
        updateFleetTable(mprValue);
        updateDisplay();
        if (typeof updateAllModules === 'function') updateAllModules(mprValue);
    }

    function updateDisplay() {
        var pd = document.getElementById('platform-display');
        var gd = document.getElementById('gen-display');
        if (pd) pd.textContent = currentPlatform.toUpperCase();
        if (gd) gd.textContent = TRANSLATIONS[currentLang].gen + ' ' + currentPlatform.toUpperCase() + ' - ' + mprValue + '%';
    }

    var GOOGLE_API_KEY = 'AIzaSyBkFu8PekIyzEhmHy1wYc6MgfxgKl6mUcM';

// True analytical corridor: Qalyub Interchange -> Dar Al Salam bottleneck -> Adly Mansour Intermodal Hub
var RING_ROAD_COORDS = [
  { lat: 30.1755, lng: 31.2545 },   // Nazlet Qalyub - corridor start
  { lat: 30.1700, lng: 31.2710 },
  { lat: 30.1660, lng: 31.2880 },   // Mostorod bridge incline +3.5%
  { lat: 30.1600, lng: 31.3075 },
  { lat: 30.1550, lng: 31.3280 },
  { lat: 30.1505, lng: 31.3475 },
  { lat: 30.1470, lng: 31.3660 },   // Al-Salam interchange weaving
  { lat: 30.1495, lng: 31.3865 },
  { lat: 30.1535, lng: 31.4085 }    // Mawqif Al-Salam / Adly Mansour
];

// Parallel offset polyline = opposing direction (Two-Way Highway Dynamics)
function offsetPath(path, dLat, dLng) {
  return path.map(function (p) { return { lat: p.lat + dLat, lng: p.lng + dLng }; });
}
var RING_ROAD_COORDS_B = offsetPath(RING_ROAD_COORDS, 0.006, 0.006);

// ═══════════════════════════════ MULTI-CORRIDOR DATA ═══════════════════════════════
var CORRIDORS = {
  egypt: {
    coords: RING_ROAD_COORDS,
    center: { lat: 30.162, lng: 31.331 }, zoom: 11,
    markers: [
      { pos: { lat: 30.1755, lng: 31.2545 }, t: 'rr_mk_qalyub', d: 'rr_mk_qalyub_d' },
      { pos: { lat: 30.1470, lng: 31.3660 }, t: 'rr_mk_bahtim', d: 'rr_mk_bahtim_d' },
      { pos: { lat: 30.1660, lng: 31.2880 }, t: 'rr_mk_mostorod', d: 'rr_mk_mostorod_d' },
      { pos: { lat: 30.1535, lng: 31.4085 }, t: 'rr_mk_dar', d: 'rr_mk_dar_d' }
    ],
    vehicleTypes: ['microbus', 'tuktuk', 'mlaiky', 'mlaiky']
  },
  ksa: {
    coords: [
      { lat: 24.745, lng: 46.645 },   // King Fahd Rd North Entry
      { lat: 24.710, lng: 46.670 },
      { lat: 24.680, lng: 46.695 },   // Eastern Ring Interchange
      { lat: 24.650, lng: 46.720 },
      { lat: 24.610, lng: 46.740 },   // Al Batha Bottleneck
      { lat: 24.580, lng: 46.710 },
      { lat: 24.555, lng: 46.680 },
      { lat: 24.530, lng: 46.655 }    // Riyadh Southern Terminal
    ],
    center: { lat: 24.640, lng: 46.690 }, zoom: 11,
    markers: [
      { pos: { lat: 24.745, lng: 46.645 }, t: 'rr_mk_qalyub', d: 'rr_mk_qalyub_d' },
      { pos: { lat: 24.680, lng: 46.695 }, t: 'rr_mk_bahtim', d: 'rr_mk_bahtim_d' },
      { pos: { lat: 24.610, lng: 46.740 }, t: 'rr_mk_mostorod', d: 'rr_mk_mostorod_d' },
      { pos: { lat: 24.530, lng: 46.655 }, t: 'rr_mk_dar', d: 'rr_mk_dar_d' }
    ],
    vehicleTypes: ['sedan', 'suv', 'truck', 'bus']
  },
  uae: {
    coords: [
      { lat: 25.230, lng: 55.270 },   // Sheikh Zayed Rd North (Deira)
      { lat: 25.210, lng: 55.255 },
      { lat: 25.190, lng: 55.240 },   // Bur Dubai Corridor
      { lat: 25.170, lng: 55.225 },
      { lat: 25.140, lng: 55.210 },   // Al Quoz Industrial
      { lat: 25.120, lng: 55.195 },
      { lat: 25.100, lng: 55.180 },
      { lat: 25.080, lng: 55.155 }    // Dubai Marina / Abu Dhabi Link
    ],
    center: { lat: 25.155, lng: 55.215 }, zoom: 11,
    markers: [
      { pos: { lat: 25.230, lng: 55.270 }, t: 'rr_mk_qalyub', d: 'rr_mk_qalyub_d' },
      { pos: { lat: 25.190, lng: 55.240 }, t: 'rr_mk_bahtim', d: 'rr_mk_bahtim_d' },
      { pos: { lat: 25.140, lng: 55.210 }, t: 'rr_mk_mostorod', d: 'rr_mk_mostorod_d' },
      { pos: { lat: 25.080, lng: 55.155 }, t: 'rr_mk_dar', d: 'rr_mk_dar_d' }
    ],
    vehicleTypes: ['sedan', 'suv', 'luxury', 'truck']
  },
  jordan: {
    coords: [
      { lat: 31.970, lng: 35.930 },   // King Abdullah II Hwy North
      { lat: 31.950, lng: 35.945 },
      { lat: 31.930, lng: 35.960 },   // 4th Circle Interchange
      { lat: 31.910, lng: 35.975 },
      { lat: 31.890, lng: 35.990 },   // Airport Road Junction
      { lat: 31.870, lng: 36.005 },
      { lat: 31.855, lng: 36.020 },
      { lat: 31.840, lng: 36.035 }    // Queen Alia Airport Link
    ],
    center: { lat: 31.905, lng: 35.980 }, zoom: 11,
    markers: [
      { pos: { lat: 31.970, lng: 35.930 }, t: 'rr_mk_qalyub', d: 'rr_mk_qalyub_d' },
      { pos: { lat: 31.930, lng: 35.960 }, t: 'rr_mk_bahtim', d: 'rr_mk_bahtim_d' },
      { pos: { lat: 31.890, lng: 35.990 }, t: 'rr_mk_mostorod', d: 'rr_mk_mostorod_d' },
      { pos: { lat: 31.840, lng: 36.035 }, t: 'rr_mk_dar', d: 'rr_mk_dar_d' }
    ],
    vehicleTypes: ['microbus', 'sedan', 'truck', 'taxi']
  }
};
var currentCorridor = 'egypt';

var RING_ROAD_MARKERS = CORRIDORS.egypt.markers;
window.addEventListener('load', function() {
        // Check for file:// protocol (causes black screens for YouTube/Maps)
        if (window.location.protocol === 'file:') {
            var msg = document.createElement('div');
            msg.id = 'file-protocol-warning';
            msg.className = 'fixed top-0 inset-x-0 bg-red-500 text-white text-center py-3 text-sm z-[100]';
            msg.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Local file mode detected. YouTube videos, Google Maps, and Air Quality API will not work. Please deploy to <strong>https://sae.fimtosoft.com</strong> or use a local HTTP server <code>python3 -m http.server 8080</code>';
            document.body.insertBefore(msg, document.body.firstChild);
        }
        try {
            window.__st = parseStateFromURL();
            if (window.__st.lang) { try { localStorage.setItem('sae-lang', window.__st.lang); } catch(e) {} }
            var saved = localStorage.getItem('sae-lang') || 'en';
            document.getElementById('lang-select').value = saved;
            setLanguage(saved);
            document.querySelectorAll('[data-platform-btn]').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-platform') === 'vissim');
            });
            updateFleetTable(mprValue);
            setTimeout(initSim, 500);
            loadGoogleMaps();
            if (typeof fleetOnLevel === 'function') fleetOnLevel();
            renderCountryHub();
            setTimeout(function() {
                if (typeof renderForecastChart === 'function') renderForecastChart();
                if (typeof renderConflictChart === 'function') renderConflictChart();
                if (typeof updateAllModules === 'function') updateAllModules(mprValue);
                if (window.__st) { try {
                    var st = window.__st;
                    if (st.corridor && typeof CORRIDORS !== 'undefined' && CORRIDORS[st.corridor] && typeof switchCorridor === 'function') switchCorridor(st.corridor);
                    if (st.mpr != null) { var _s = document.getElementById('mpr-slider'); if (_s) { _s.value = st.mpr; _s.dispatchEvent(new Event('input')); } }
                    if (st.scenario === 'B' && typeof setScenario === 'function') setScenario('B');
                    if (st.view === 'case') applyView('case');
                } catch(e) { console.warn('urlState apply:', e); } }
            }, 800);
        } catch(err) {
            console.error('SAE AutoSim Hub initialization error:', err, err.stack);
            console.error('CORRIDORS type:', typeof CORRIDORS, 'value:', CORRIDORS);
            console.error('currentCorridor:', currentCorridor);
            console.error('GOOGLE_API_KEY:', GOOGLE_API_KEY);
            console.error('Window load handler reached CORRIDORS?', typeof CORRIDORS !== 'undefined');
        }
    });

// ════════════════════════ CAIRO RING ROAD + AV COMPARISON ════════════════════════



var currentCountry = 'egypt';
var currentScenario = 'A';
var rrScenario = 'A';
var rrMap = null, rrPolyA = null, rrPolyB = null, rrMarkers = [], rrMPR = 10;
var rrOverlay = null, rrAnim = null;
var rrSnappedPath = null, rrDirectionsRenderer = null, rrSnappedPathB = null;
var liveTraffic = { volume: 0.62, hvShare: 0.22, speed: 45, aqi: 120, co2: 0, nox: 0, weather: 'Clear', ts: 0 };
var airQuality = { aqi: null, pm25: null, co: null, no2: null, pm25u: '', cou: '', no2u: '', ts: 0 };
var airPCEmult = 1;

function corridorCentroid() {
  var cor = CORRIDORS[currentCorridor] || CORRIDORS.egypt;
  var coords = cor.coords;
  var la = 0, lo = 0;
  coords.forEach(function (p) { la += p.lat; lo += p.lng; });
  return { lat: la / coords.length, lng: lo / coords.length };
}
function fetchAirQuality() {
  if (!GOOGLE_API_KEY) return;
  var now = Date.now();
  if (API_RATE_LIMIT.lastCall['aq'] && (now - API_RATE_LIMIT.lastCall['aq']) < API_RATE_LIMIT.minInterval) return;
  API_RATE_LIMIT.lastCall['aq'] = now;
  var c = corridorCentroid();
  var url = 'https://airquality.googleapis.com/v1/currentConditions:lookup?key=' + GOOGLE_API_KEY;
  var body = JSON.stringify({
    location: { latitude: c.lat, longitude: c.lng },
    extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION', 'HEALTH_RECOMMENDATIONS'],
    languageCode: 'en', universalAqi: true
  });
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
    .then(function (r) { if (!r.ok) throw new Error('aq' + r.status); return r.json(); })
    .then(function (data) {
      var aqi = null;
      if (data.indexes && data.indexes.length) {
        var u = data.indexes.filter(function (i) { return i.code === 'uaqi'; })[0] || data.indexes[0];
        aqi = u.aqi;
      }
      var pm25 = null, co = null, no2 = null, pm25u = '', cou = '', no2u = '';
      if (data.pollutants) {
        data.pollutants.forEach(function (p) {
          if (!p.concentration) return;
          if (p.code === 'pm25') { pm25 = p.concentration.value; pm25u = p.concentration.units || ''; }
          else if (p.code === 'co') { co = p.concentration.value; cou = p.concentration.units || ''; }
          else if (p.code === 'no2') { no2 = p.concentration.value; no2u = p.concentration.units || ''; }
        });
      }
      airQuality.aqi = aqi; airQuality.pm25 = pm25; airQuality.co = co; airQuality.no2 = no2;
      airQuality.pm25u = pm25u; airQuality.cou = cou; airQuality.no2u = no2u; airQuality.ts = Date.now();
      airPCEmult = 1 + (pm25 != null ? Math.min(2.5, pm25 / 120) : 0);
      if (typeof updateEnvTracker === 'function') updateEnvTracker(rrMPR);
      if (typeof updatePhysicsBox === 'function') updatePhysicsBox(rrMPR);
    })
    .catch(function () { /* keep computed eco metrics on failure */ });
}
function fetchWeather() {
  if (!GOOGLE_API_KEY) return;
  var now = Date.now();
  if (API_RATE_LIMIT.lastCall['wx'] && (now - API_RATE_LIMIT.lastCall['wx']) < API_RATE_LIMIT.minInterval) return;
  API_RATE_LIMIT.lastCall['wx'] = now;
  var c = corridorCentroid();
  var url = 'https://weather.googleapis.com/v1/currentConditions:lookup?key=' + GOOGLE_API_KEY
    + '&location.latitude=' + c.lat + '&location.longitude=' + c.lng;
  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error('wx' + r.status); return r.json(); })
    .then(function (data) {
      var cond = (data.weatherCondition && data.weatherCondition.description && data.weatherCondition.description.text) || null;
      if (cond) liveTraffic.weather = cond;
      if (typeof updateLiveTelemetry === 'function') updateLiveTelemetry();
    })
    .catch(function () { /* keep simulated weather on failure */ });
}


function markerContent(mk) {
  var G = countryGrade();
  var microPCE = dynamicPCE('microbus', G, mprValue / 100).toFixed(1);
  var linkSpeed = Math.round(gradeAdjustedSpeed('microbus', G) * 3.6);
  return '<div style="min-width:240px"><strong>' + t(mk.t) + '</strong><br>'
    + '<span style="font-size:12px;color:#334155">' + t(mk.d) + '</span><br>'
    + '<span style="font-size:11px;color:#0ea5e9">Sector Elevation Profile: +' + G.toFixed(1) + '% Incline Grade | Current Link Speed: ' + linkSpeed + ' km/h | Heavy Vehicle Segment PCE: ' + microPCE + '</span></div>';
}

function ringRoadColorForMPR(mpr) {
  var r1 = 239, g1 = 68, b1 = 68, r2 = 16, g2 = 185, b2 = 129;
  var f = Math.max(0, Math.min(100, mpr)) / 100;
  return 'rgb(' + Math.round(r1 + (r2 - r1) * f) + ',' + Math.round(g1 + (g2 - g1) * f) + ',' + Math.round(b1 + (b2 - b1) * f) + ')';
}

function updateRingRoadStyle(mpr) {
  rrMPR = mpr;
  var col = ringRoadColorForMPR(mpr);
  if (rrPolyA) {
    rrPolyA.setOptions({ strokeColor: (rrScenario === 'B') ? '#10b981' : col, strokeWeight: (rrScenario === 'B') ? 8 : 4 + mpr / 16 });
  }
  if (rrPolyB) {
    rrPolyB.setOptions({ strokeColor: col, strokeWeight: 4 + mpr / 16 });
  }
  var stats = document.getElementById('rr-stats');
  if (stats) {
    var cc = mpr < 40 ? 'text-red-400' : (mpr < 75 ? 'text-yellow-400' : 'text-green-400');
    var label = mpr < 40 ? 'Congested' : (mpr < 75 ? 'Transitioning' : 'Fluent Platooning');
    stats.innerHTML = '<div class="text-slate-400">MPR: ' + Math.round(mpr) + '%</div>'
      + '<div class="' + cc + '">Status: ' + label + '</div>'
      + '<div class="text-primary">Capacity: ' + (1850 + Math.round(mpr * 11)) + ' veh/h/lane</div>';
  }
}

function refreshRingRoadLabels() {
  rrMarkers.forEach(function (o) {
    if (o.marker) {
      o.marker.setTitle(t(o.t));
      if (o.iw) o.iw.setContent('<div style="min-width:260px"><strong>' + t(o.t) + '</strong><br>'
        + '<span style="font-size:12px;color:#334155">' + t(o.d) + '</span></div>');
    }
  });
}

function initRingRoadMap() {
  if (typeof CORRIDORS === 'undefined' || !CORRIDORS[currentCorridor]) {
    console.error('CORRIDORS not defined - retrying...');
    setTimeout(initRingRoadMap, 500);
    return;
  }
  var el = document.getElementById('ringroad-map');
  if (!el) return;
  if (typeof google === 'undefined' || !google.maps) {
    el.innerHTML = '<div class="h-full flex items-center justify-center text-slate-200 text-sm p-6 text-center">Google Maps could not load. Check that the API key is valid and allowed for this domain.</div>';
    return;
  }
     try {
    var cor = CORRIDORS[currentCorridor] || CORRIDORS.egypt;
    RingRoadOverlay.prototype = Object.assign(new google.maps.OverlayView(), RingRoadOverlay.prototype);
    rrMap = new google.maps.Map(el, {
      center: cor.center, zoom: cor.zoom,
      styles: [
        { elementType: 'geometry', stylers: [ { color: '#1e293b' } ] },
        { elementType: 'labels.text.fill', stylers: [ { color: '#94a3b8' } ] },
        { featureType: 'water', stylers: [ { color: '#0f172a' } ] },
        { featureType: 'road', stylers: [ { color: '#334155' } ] }
      ]
    });

    // Use DirectionsService to snap to actual highway geometry
    initializeHighFidelityRingRoadMap(cor);

    var traffic = new google.maps.TrafficLayer();
    traffic.setMap(rrMap);
    drawCaseInterchanges();
    rrOverlay = new RingRoadOverlay(rrMap);
    updateRingRoadStyle(rrMPR);
    startLiveTrafficFeed();
    fetchAirQuality();
    fetchWeather();
    if (!window._rrAir) window._rrAir = setInterval(function () { fetchAirQuality(); fetchWeather(); }, 300000);
    if (rrScenario === 'B') { setTimeout(respacePlatoon, 500); }
    var sl = document.getElementById('mpr-slider');
    if (sl) sl.addEventListener('input', function () {
      var v = parseInt(this.value, 10);
      updateRingRoadStyle(v); updateEnvTracker(v); updatePhysicsBox(v);
      if (typeof updateAllModules === 'function') updateAllModules(v);
    });
  } catch (e) {
    el.innerHTML = '<div class="h-full flex items-center justify-center text-slate-200 text-sm p-6 text-center">Google Maps failed to initialize.</div>';
  }
}

function initializeHighFidelityRingRoadMap(cor) {
    var directionsService = new google.maps.DirectionsService();
    var qalyubOrigin = new google.maps.LatLng(30.1755, 31.2545);
    var adlyMansourDest = new google.maps.LatLng(30.1535, 31.4085);
    var ringWaypoints = [
        { location: new google.maps.LatLng(30.1660, 31.2880), stopover: true },
        { location: new google.maps.LatLng(30.1470, 31.3660), stopover: true }
    ];
    var request = {
        origin: qalyubOrigin,
        destination: adlyMansourDest,
        waypoints: ringWaypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false
    };
    directionsService.route(request, function (response, status) {
        if (status === google.maps.DirectionsStatus.OK && response && response.routes && response.routes[0]) {
            var route = response.routes[0];
            rrSnappedPath = [];
            response.routes[0].overview_path.forEach(function (p) {
                rrSnappedPath.push({ lat: p.lat(), lng: p.lng() });
            });
            rrSnappedPathB = offsetPath(rrSnappedPath, -0.005, -0.005);
            if (rrDirectionsRenderer) { rrDirectionsRenderer.setDirections(response); }
            else {
                rrDirectionsRenderer = new google.maps.DirectionsRenderer({
                    map: rrMap,
                    directions: response,
                    suppressMarkers: true,
                    preserveViewport: true,
                    polylineOptions: {
                        strokeColor: "#06b6dace",
                        strokeOpacity: 0.75,
                        strokeWeight: 6
                    }
                });
            }
            renderTwoWayParallelCorridor(rrSnappedPath, rrSnappedPathB);
            renderPreciseRampMarkers();
        } else {
            console.warn('DirectionsService failed:', status);
            rrSnappedPath = cor.coords.slice();
            rrSnappedPathB = offsetPath(cor.coords, 0.006, 0.006);
            renderTwoWayParallelCorridor(rrSnappedPath, rrSnappedPathB);
            renderPreciseRampMarkers();
        }
    });
}

function renderTwoWayParallelCorridor(pathA, pathB) {
    var color = ringRoadColorForMPR(rrMPR);
    if (rrPolyA) rrPolyA.setMap(null);
    if (rrPolyB) rrPolyB.setMap(null);
    rrPolyA = new google.maps.Polyline({
        path: pathA, geodesic: true,
        strokeColor: (rrScenario === 'B') ? '#10b981' : color,
        strokeOpacity: 0.8, strokeWeight: (rrScenario === 'B') ? 8 : 6,
        map: rrMap
    });
    rrPolyB = new google.maps.Polyline({
        path: pathB, geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.6, strokeWeight: 5,
        map: rrMap, strokeDashArray: [12, 8]
    });
    var bounds = new google.maps.LatLngBounds();
    [pathA, pathB].forEach(function (path) {
        path.forEach(function (p) { bounds.extend(p); });
    });
    rrMap.fitBounds(bounds, 0.05);
}

function renderPreciseRampMarkers() {
    var rampSets = {
        egypt: [
            { lat: 30.1755, lng: 31.2545, t: 'ramp_qalyub', d: 'ramp_qalyub_d' },
            { lat: 30.1660, lng: 31.2880, t: 'ramp_mostorod', d: 'ramp_mostorod_d' },
            { lat: 30.1470, lng: 31.3660, t: 'ramp_darsalam', d: 'ramp_darsalam_d' },
            { lat: 30.1535, lng: 31.4085, t: 'ramp_adly', d: 'ramp_adly_d' }
        ],
        ksa: [
            { lat: 24.745, lng: 46.645, t: 'ramp_qalyub', d: 'ramp_qalyub_d' },
            { lat: 24.620, lng: 46.730, t: 'ramp_mostorod', d: 'ramp_mostorod_d' },
            { lat: 24.555, lng: 46.680, t: 'ramp_darsalam', d: 'ramp_darsalam_d' },
            { lat: 24.530, lng: 46.655, t: 'ramp_adly', d: 'ramp_adly_d' }
        ],
        uae: [
            { lat: 25.230, lng: 55.270, t: 'ramp_qalyub', d: 'ramp_qalyub_d' },
            { lat: 25.150, lng: 55.220, t: 'ramp_mostorod', d: 'ramp_mostorod_d' },
            { lat: 25.120, lng: 55.195, t: 'ramp_darsalam', d: 'ramp_darsalam_d' },
            { lat: 25.080, lng: 55.155, t: 'ramp_adly', d: 'ramp_adly_d' }
        ],
        jordan: [
            { lat: 31.970, lng: 35.930, t: 'ramp_qalyub', d: 'ramp_qalyub_d' },
            { lat: 31.920, lng: 35.965, t: 'ramp_mostorod', d: 'ramp_mostorod_d' },
            { lat: 31.890, lng: 35.990, t: 'ramp_darsalam', d: 'ramp_darsalam_d' },
            { lat: 31.840, lng: 36.035, t: 'ramp_adly', d: 'ramp_adly_d' }
        ]
    };
    var rampPoints = rampSets[currentCorridor] || rampSets.egypt;
    rrMarkers.forEach(function (entry) { if (entry.marker) entry.marker.setMap(null); });
    rrMarkers = [];
    rampPoints.forEach(function (rp) {
        var m = new google.maps.Marker({
            position: { lat: rp.lat, lng: rp.lng },
            map: rrMap,
            title: t(rp.t),
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#ef4444',
                fillOpacity: 0.9,
                strokeColor: '#fff',
                strokeWeight: 2,
                zIndex: 100
            }
        });
        var iwContent = '<div style="min-width:260px"><strong>' + t(rp.t) + '</strong><br>'
            + '<span style="font-size:12px;color:#334155">' + t(rp.d) + '</span></div>';
        var iw = new google.maps.InfoWindow({ content: iwContent });
        m.addListener('click', function () { iw.open(rrMap, m); });
        rrMarkers.push({ marker: m, iw: iw, t: rp.t, d: rp.d, mk: rp });
    });
}

// ══════════════════════════════════════════════════════════
// Live Traffic Telemetry Feed (simulated Cairo density bridge)
// ══════════════════════════════════════════════════════════
function startLiveTrafficFeed() {
  if (window._rrFeed) return;
  window._rrFeed = setInterval(function () {
    var tm = Date.now() / 1000;
    liveTraffic.volume = Math.max(0.15, Math.min(0.98, 0.55 + 0.32 * Math.sin(tm / 12) + 0.12 * Math.random()));
    liveTraffic.hvShare = Math.max(0.08, Math.min(0.45, 0.18 + 0.07 * Math.sin(tm / 20) + 0.03 * Math.random()));
    liveTraffic.speed = Math.round(35 + 30 * (1 - liveTraffic.volume));
    liveTraffic.weather = liveTraffic.volume > 0.72 ? 'Hazy' : 'Clear';
    liveTraffic.ts = Date.now();
    updateLiveTelemetry();
    updatePhysicsBox(rrMPR);
    updateEnvTracker(rrMPR);
  }, 2500);
  updateLiveTelemetry();
}
function updateLiveTelemetry() {
  var vol = document.getElementById('live-vol');
  var hv = document.getElementById('live-hv');
  var cat = document.getElementById('live-cat');
  var wth = document.getElementById('live-weather');
  var catTxt, catCls;
  if (liveTraffic.volume > 0.75) { catTxt = 'Severe Congestion'; catCls = 'text-red-300'; }
  else if (liveTraffic.volume > 0.5) { catTxt = 'Heavy'; catCls = 'text-yellow-300'; }
  else { catTxt = 'Moderate'; catCls = 'text-green-300'; }
  if (vol) vol.textContent = Math.round(liveTraffic.volume * 100) + '%';
  if (hv) hv.textContent = Math.round(liveTraffic.hvShare * 100) + '%';
  if (wth) wth.textContent = liveTraffic.weather;
  if (cat) { cat.textContent = catTxt; cat.className = 'font-mono ' + catCls; }
}

// ══════════════════════════════════════════════════════════
// Canvas Overlay Vehicle Simulation (Two-Way + Scenario A/B)
// ══════════════════════════════════════════════════════════
function routePoint(path, frac) {
  if (!path._cum) {
    var cum = [0];
    for (var i = 1; i < path.length; i++) {
      var a = path[i - 1], b = path[i];
      cum.push(cum[i - 1] + Math.hypot(b.lat - a.lat, b.lng - a.lng));
    }
    path._cum = cum; path._total = cum[cum.length - 1];
  }
  var target = frac * path._total;
  for (var j = 1; j < path.length; j++) {
    if (path._cum[j] >= target) {
      var seg = path._cum[j] - path._cum[j - 1];
      var r = seg > 0 ? (target - path._cum[j - 1]) / seg : 0;
      return { lat: path[j - 1].lat + (path[j].lat - path[j - 1].lat) * r, lng: path[j - 1].lng + (path[j].lng - path[j - 1].lng) * r };
    }
  }
  return path[path.length - 1];
}

function RingRoadOverlay(map) {
  this.map_ = map; this.div_ = null; this.canvas_ = null;
   this.vehicles_ = []; this.proj_ = null;
   this.setMap(map);
}
RingRoadOverlay.prototype.onAdd = function () {
  var self = this;
  var div = document.createElement('div');
  div.style.position = 'absolute'; div.style.top = '0'; div.style.left = '0';
  div.style.pointerEvents = 'none'; div.style.width = '100%'; div.style.height = '100%';
  var canvas = document.createElement('canvas');
  canvas.style.position = 'absolute'; canvas.style.top = '0'; canvas.style.left = '0';
  canvas.style.pointerEvents = 'none';
  div.appendChild(canvas);
  this.div_ = div; this.canvas_ = canvas;
  this.getPanes().overlayLayer.appendChild(div);
  this.initVehicles();
  if (!rrAnim) {
    var loop = function () { self.tick(0.045); self.drawVehicles(); rrAnim = requestAnimationFrame(loop); };
    rrAnim = requestAnimationFrame(loop);
  }
};
RingRoadOverlay.prototype.onRemove = function () {
  if (this.div_ && this.div_.parentNode) this.div_.parentNode.removeChild(this.div_);
  this.div_ = null; this.canvas_ = null;
};
RingRoadOverlay.prototype.draw = function () {
  var proj = this.getProjection();
  if (!proj) return;
  this.proj_ = proj;
  var container = this.map_.getDiv();
  var w = container.offsetWidth, h = container.offsetHeight;
  if (this.canvas_.width !== w) this.canvas_.width = w;
  if (this.canvas_.height !== h) this.canvas_.height = h;
  this.canvas_.style.width = w + 'px';
  this.canvas_.style.height = h + 'px';
  this.drawVehicles();
};


function loadGoogleMaps() {
  if (typeof google !== 'undefined' && google.maps) { initRingRoadMap(); return; }
  var s = document.createElement('script');
  s.src = 'https://maps.googleapis.com/maps/api/js?key=' + GOOGLE_API_KEY + '&callback=initRingRoadMap';
  s.async = true; s.defer = true;
  s.referrerPolicy = 'no-referrer-when-downgrade';
  s.onerror = function () {
    var el = document.getElementById('ringroad-map');
    if (el) el.innerHTML = '<div class="h-full flex items-center justify-center text-slate-200 text-sm p-6 text-center">Google Maps script failed to load. <br>Ensure the API key is valid and Maps JavaScript API is enabled.<br><small>Current protocol: ' + window.location.protocol + '</small></div>';
  };
  document.head.appendChild(s);
  // Verify callback was invoked within 10 seconds
  setTimeout(function() {
    if (!rrMap && typeof google !== 'undefined' && google.maps) {
      var el = document.getElementById('ringroad-map');
      if (el) el.innerHTML = '<div class="h-full flex items-center justify-center text-slate-200 text-sm p-6 text-center">Google Maps loaded but map initialization failed.<br>Ensure the API key is valid and Maps JavaScript API is enabled.</div>';
    }
  }, 10000);
}

function setScenario(s) {
  rrScenario = s;
  currentScenario = s;
  var a = document.getElementById('scenario-a-btn');
  var b = document.getElementById('scenario-b-btn');
  if (a) a.className = s === 'A'
    ? 'px-6 py-2 rounded-lg font-medium bg-red-500/20 border border-red-400 text-red-300 hover:bg-red-500/30 transition active'
    : 'px-6 py-2 rounded-lg font-medium bg-slate-600/20 border border-slate-500 text-slate-400 hover:bg-red-500/30 transition';
  if (b) b.className = s === 'B'
    ? 'px-6 py-2 rounded-lg font-medium bg-green-500/20 border border-green-400 text-green-300 hover:bg-green-500/30 transition active'
    : 'px-6 py-2 rounded-lg font-medium bg-slate-600/20 border border-slate-500 text-slate-400 hover:bg-green-500/30 transition';
  var sl = document.getElementById('mpr-slider');
  if (sl) { sl.value = (s === 'B' ? 90 : 10); updateMPR(sl.value); 
    // visual segmented sync
    var bA = document.getElementById('scenario-a-btn');
    var bB = document.getElementById('scenario-b-btn');
    if (bA) { bA.classList.toggle('is-active-a', s === 'A'); bA.classList.toggle('is-active-b', false); }
    if (bB) { bB.classList.toggle('is-active-b', s === 'B'); bB.classList.toggle('is-active-a', false); }
}
  if (rrPolyA || rrPolyB) updateRingRoadStyle(parseInt(sl ? sl.value : 10, 10));
  if (s === 'B') respacePlatoon();
}

// ---- AV Comparison Engine ----
// ---- Dual-Mode Fleet Comparison Engine ----
var FLEET_DB = {
  L1: [
    { key:'toyota_corolla',
      uf:{ brand:'Toyota', name:'Corolla (TSS 2.0)', year:2026, price:'$28,500', benefit:'Lane-keep + Adaptive Cruise + Pre-Collision', availability:'Global (160+ countries)' },
      sci:{ sensors:{lidar:0,radar:1,cameras:3,ultrasonic:4}, liability:'OEM', maxSpeed:180, oddWeather:'Clear / Light rain', odScope:'Any paved road; lane-keep assist, adaptive cruise, pre-collision up to 180 km/h', intervention:0.15 } },
    { key:'ford_f150',
      uf:{ brand:'Ford', name:'F-150 (Co-Pilot360)', year:2026, price:'$52,000', benefit:'Hands-on highway driving assist + 360 camera', availability:'North America, Europe, Middle East' },
      sci:{ sensors:{lidar:0,radar:1,cameras:4,ultrasonic:4}, liability:'OEM', maxSpeed:180, oddWeather:'Clear / Light rain', odScope:'Adaptive cruise + lane centering; highways and urban roads', intervention:0.14 } }
  ],
  L2: [
    { key:'tesla_my',
      uf:{ brand:'Tesla', name:'Model Y (Autopilot/FSD)', year:2026, price:'$42,000', benefit:'Full Self-Driving supervised; city + highway; OTA updates', availability:'Global (50+ countries)' },
      sci:{ sensors:{lidar:0,radar:0,cameras:8,ultrasonic:0}, liability:'Driver', maxSpeed:150, oddWeather:'Clear / Overcast', odScope:'Mapped highways + urban; driver supervision required', intervention:0.32 } },
    { key:'cadillac_lyriq',
      uf:{ brand:'Cadillac', name:'Lyriq (Super Cruise)', year:2026, price:'$58,000', benefit:'Hands-free highway driving on 400,000+ mapped miles', availability:'North America, China' },
      sci:{ sensors:{lidar:0,radar:1,cameras:4,ultrasonic:8}, liability:'Driver', maxSpeed:200, oddWeather:'Clear', odScope:'Mapped highways with dividers only', intervention:0.25 } },
    { key:'bmw_7',
      uf:{ brand:'BMW', name:'7 Series (Driving Assistant Pro)', year:2026, price:'$95,000', benefit:'Highway assistant with traffic jam assist up to 60 km/h', availability:'Global' },
      sci:{ sensors:{lidar:0,radar:4,cameras:4,ultrasonic:10}, liability:'Driver', maxSpeed:180, oddWeather:'Clear / Light rain', odScope:'Highways + urban; hands-off below 60 km/h', intervention:0.22 } }
  ],
  L3: [
    { key:'mercedes_s',
      uf:{ brand:'Mercedes-Benz', name:'S-Class (DRIVE PILOT)', year:2026, price:'$120,000', benefit:'Hands-off up to 130 km/h; OEM liability when active', availability:'Germany, USA, UK, China' },
      sci:{ sensors:{lidar:1,radar:5,cameras:4,ultrasonic:12}, liability:'OEM', maxSpeed:130, oddWeather:'Clear / Day and night', odScope:'Highways with physical divider; up to 130 km/h', intervention:0.08 } },
    { key:'bmw_l3',
      uf:{ brand:'BMW', name:'7 Series (Personal Pilot L3)', year:2026, price:'$115,000', benefit:'Hands-off highway driving; OEM liability at 60+ km/h', availability:'Germany, Europe (2026 rollout)' },
      sci:{ sensors:{lidar:1,radar:5,cameras:5,ultrasonic:12}, liability:'OEM', maxSpeed:130, oddWeather:'Clear / Day and night', odScope:'Highways with physical divider; traffic jam and highway pilot', intervention:0.07 } }
  ],
  L45: [
    { key:'waymo_one',
      uf:{ brand:'Waymo', name:'One Robotaxi (5th Gen)', year:2026, price:'Per-ride hailing', benefit:'Fully driverless urban ride-hailing; no human needed', availability:'Phoenix, San Francisco, Los Angeles' },
      sci:{ sensors:{lidar:5,radar:6,cameras:29,ultrasonic:0}, liability:'OEM', maxSpeed:113, oddWeather:'Most weather; day/night', odScope:'Geofenced urban (Phoenix/SF/LA)', intervention:0.02 } },
    { key:'zoox',
      uf:{ brand:'Amazon', name:'Zoox Autonomous Platform', year:2026, price:'Per-ride (planned)', benefit:'Bidirectional purpose-built robotaxi; no steering wheel', availability:'San Francisco (geofenced)' },
      sci:{ sensors:{lidar:6,radar:6,cameras:16,ultrasonic:6}, liability:'OEM', maxSpeed:72, oddWeather:'Clear / Light rain', odScope:'Geofenced urban corridors; bidirectional', intervention:0.01 } },
    { key:'tesla_cybercab',
      uf:{ brand:'Tesla', name:'Cybercab (Robotaxi)', year:2026, price:'$30,000 (est.)', benefit:'Vision-only autonomous; no steering wheel; mass-market target', availability:'USA (initial rollout)' },
      sci:{ sensors:{lidar:0,radar:0,cameras:8,ultrasonic:0}, liability:'OEM', maxSpeed:115, oddWeather:'Clear / Overcast', odScope:'Mapped urban + highway; vision-only', intervention:0.03 } }
  ]
};
var fleetLevel = 'L2';
var fleetMode = 'uf';
var fleetChartA = null, fleetChartB = null;

function fleetSetMode(mode) {
  fleetMode = mode;
  var u = document.getElementById('mode-uf');
  var s = document.getElementById('mode-sci');
  if (u) u.className = mode === 'uf' ? 'px-5 py-2 text-sm font-semibold bg-slate-800 text-white transition' : 'px-5 py-2 text-sm font-semibold bg-white text-slate-500 hover:bg-slate-50 transition';
  if (s) s.className = mode === 'sci' ? 'px-5 py-2 text-sm font-semibold bg-slate-800 text-white transition' : 'px-5 py-2 text-sm font-semibold bg-white text-slate-500 hover:bg-slate-50 transition';
  fleetRender();
}

function fleetOnLevel() {
  var el = document.getElementById('fleet-level');
  fleetLevel = el ? el.value : 'L2';
  var selA = document.getElementById('fleet-sel-a');
  var selB = document.getElementById('fleet-sel-b');
  var list = FLEET_DB[fleetLevel] || [];
  if (selA) { selA.innerHTML = ''; list.forEach(function(v,i){ var o = document.createElement('option'); o.value = i; o.textContent = v.uf.brand + ' ' + v.uf.name; selA.appendChild(o); }); }
  if (selB) { selB.innerHTML = ''; list.forEach(function(v,i){ var o = document.createElement('option'); o.value = i; o.textContent = v.uf.brand + ' ' + v.uf.name; if (list.length > 1 && i === 1) o.selected = true; selB.appendChild(o); }); }
  fleetRender();
}

function fleetRender() {
  var selA = document.getElementById('fleet-sel-a');
  var selB = document.getElementById('fleet-sel-b');
  var list = FLEET_DB[fleetLevel] || [];
  var idxA = selA ? parseInt(selA.value, 10) : 0;
  var idxB = selB ? parseInt(selB.value, 10) : (list.length > 1 ? 1 : 0);
  var vA = list[idxA], vB = list[idxB];
  if (!vA || !vB) return;
  var grid = document.getElementById('fleet-grid');
  if (!grid) return;
  if (fleetMode === 'uf') {
    grid.innerHTML = fleetCardUF(vA, 'border-primary') + fleetCardUF(vB, 'border-secondary');
  } else {
    grid.innerHTML = fleetCardSCI(vA, 'border-primary') + fleetCardSCI(vB, 'border-secondary');
  }
  fleetRenderCharts(vA, vB);
}

function fleetCardUF(v, borderCls) {
  var u = v.uf;
  var lvlTag = fleetLevel === 'L45' ? '<span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-semibold">L4/L5</span>' : '<span class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">' + fleetLevel + '</span>';
  return '<div class="bg-white rounded-xl shadow-md border-2 ' + borderCls + ' p-5">'
    + '<div class="flex items-center gap-3 mb-4"><div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-400">' + u.brand.charAt(0) + '</div><div><h4 class="font-bold text-slate-800">' + u.brand + ' ' + u.name + '</h4>' + lvlTag + '</div></div>'
    + '<div class="space-y-2 text-sm">'
    + '<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-400"><i class="fas fa-calendar mr-1"></i>' + t('uf_year') + '</span><span class="font-semibold">' + u.year + '</span></div>'
    + '<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-400"><i class="fas fa-tag mr-1"></i>' + t('uf_price') + '</span><span class="font-mono font-semibold text-primary">' + u.price + '</span></div>'
    + '<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-400"><i class="fas fa-star mr-1"></i>' + t('uf_benefit') + '</span><span class="text-right text-xs max-w-[65%]">' + u.benefit + '</span></div>'
    + '<div class="flex justify-between pb-1"><span class="text-slate-400"><i class="fas fa-globe mr-1"></i>' + t('uf_avail') + '</span><span class="text-right text-xs max-w-[60%]">' + u.availability + '</span></div>'
    + '</div></div>';
}

function fleetCardSCI(v, borderCls) {
  var s = v.sci;
  var tot = s.sensors.lidar + s.sensors.radar + s.sensors.cameras + s.sensors.ultrasonic;
  var lvlTag = fleetLevel === 'L45' ? '<span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-semibold">L4/L5</span>' : '<span class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">' + fleetLevel + '</span>';
  return '<div class="bg-white rounded-xl shadow-md border-2 ' + borderCls + ' p-5">'
    + '<div class="flex items-center justify-between mb-3"><h4 class="font-bold text-slate-800">' + v.uf.brand + ' ' + v.uf.name + '</h4>' + lvlTag + '</div>'
    + '<div class="grid grid-cols-2 gap-2 mb-3 text-center">'
    + '<div class="bg-slate-50 rounded-lg p-2"><div class="text-xl font-bold text-red-500">' + s.sensors.lidar + '</div><div class="text-[10px] text-slate-400 uppercase">LiDAR</div></div>'
    + '<div class="bg-slate-50 rounded-lg p-2"><div class="text-xl font-bold text-blue-500">' + s.sensors.radar + '</div><div class="text-[10px] text-slate-400 uppercase">Radar</div></div>'
    + '<div class="bg-slate-50 rounded-lg p-2"><div class="text-xl font-bold text-green-500">' + s.sensors.cameras + '</div><div class="text-[10px] text-slate-400 uppercase">Cameras</div></div>'
    + '<div class="bg-slate-50 rounded-lg p-2"><div class="text-xl font-bold text-purple-500">' + s.sensors.ultrasonic + '</div><div class="text-[10px] text-slate-400 uppercase">Ultrasonic</div></div>'
    + '</div>'
    + '<div class="space-y-2 text-sm">'
    + '<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-400">' + t('fleet_sensors') + ':</span><span class="font-mono font-bold">' + tot + '</span></div>'
    + '<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-400">' + t('sci_liability') + ':</span><span class="font-semibold ' + (s.liability === 'OEM' ? 'text-green-600' : 'text-amber-600') + '">' + s.liability + '</span></div>'
    + '<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-400">' + t('sci_maxspeed') + ':</span><span class="font-mono">' + s.maxSpeed + ' km/h</span></div>'
    + '<div class="flex justify-between border-b border-slate-100 pb-1"><span class="text-slate-400">' + t('sci_odd_weather') + ':</span><span class="text-right text-xs max-w-[60%]">' + s.oddWeather + '</span></div>'
    + '<div class="flex justify-between pb-1"><span class="text-slate-400">' + t('fleet_odd') + ':</span><span class="text-right text-xs max-w-[60%]">' + s.odScope + '</span></div>'
    + '</div></div>';
}

function fleetRenderCharts(vA, vB) {
  if (typeof Chart === 'undefined') return;
  if (fleetChartA) { fleetChartA.destroy(); fleetChartA = null; }
  if (fleetChartB) { fleetChartB.destroy(); fleetChartB = null; }
  var ctxS = document.getElementById('fleet-chart-sensor');
  var ctxI = document.getElementById('fleet-chart-safety');
  if (!ctxS || !ctxI) return;
  var cA = ['rgba(14,165,233,0.85)','rgba(99,102,241,0.85)','rgba(245,158,11,0.85)','rgba(168,162,158,0.7)'];
  var cB = ['rgba(14,165,233,0.45)','rgba(99,102,241,0.45)','rgba(245,158,11,0.45)','rgba(168,162,158,0.35)'];
  var sLabels = ['LiDAR','Radar','Cameras','Ultrasonic'];
  var sA = vA.sci.sensors, sB = vB.sci.sensors;
  fleetChartA = new Chart(ctxS, { type:'bar', data:{ labels: sLabels, datasets:[
    { label: vA.uf.brand + ' ' + vA.uf.name, data:[sA.lidar,sA.radar,sA.cameras,sA.ultrasonic], backgroundColor: cA, borderRadius: 6 },
    { label: vB.uf.brand + ' ' + vB.uf.name, data:[sB.lidar,sB.radar,sB.cameras,sB.ultrasonic], backgroundColor: cB, borderRadius: 6 }
  ]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } }, scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Count', font:{size:11} } } } }});
  var lvls = ['L0','L1','L2','L3','L4/5'];
  var ivA = [0, 0.15, 0.32, 0.08, 0.03];
  var ivB = [0, 0.14, 0.25, 0.05, 0.02];
  fleetChartB = new Chart(ctxI, { type:'line', data:{ labels: lvls, datasets:[
    { label: vA.uf.brand + ' ' + vA.uf.name, data: ivA, borderColor:'rgb(14,165,233)', backgroundColor:'rgba(14,165,233,0.1)', fill:true, tension:0.4, pointRadius:4 },
    { label: vB.uf.brand + ' ' + vB.uf.name, data: ivB, borderColor:'rgb(99,102,241)', backgroundColor:'rgba(99,102,241,0.1)', fill:true, tension:0.4, pointRadius:4 }
  ]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } }, scales:{ y:{ beginAtZero:true, max:0.5, title:{ display:true, text:'Interventions/km', font:{size:11} } } } }});
}

window.addEventListener('load', function () { setTimeout(fleetOnLevel, 500); });


// ════════════════════════════════ MULTI-COUNTRY CALIBRATION HUB ════════════════════════════════
var COUNTRY_DATA = {
    egypt: { name: 'Egypt (Cairo Ring Road)',
        fleet: { mlaijy: 0.30, microbus: 0.20, noss_naql: 0.08, rob_naql: 0.07, naql_taqeel: 0.05, motorcycle: 0.05, bicycle: 0.02, trooscoor: 0.015, tuktuk: 0.015, av: 0.20 },
        road: { laneWidth: 3.5, shoulder: 1.5, maxGrade: 6.0, speedLimit: 80 },
        enforcement: 'Moderate', congestion: 'High', reactionFactor: 1.0,
        notes: 'Chaotic mixed traffic, non-lane-based movement, frequent roadside stops',
        avgReaction: 0.85, avgSafety: 0.42, avgSigma: 0.82 },
    ksa: { name: 'Kingdom of Saudi Arabia',
        fleet: { mlaijy: 0.25, microbus: 0.08, noss_naql: 0.10, rob_naql: 0.05, naql_taqeel: 0.15, motorcycle: 0.03, bicycle: 0.01, trooscoor: 0.005, tuktuk: 0.005, av: 0.20 },
        road: { laneWidth: 3.75, shoulder: 3.0, maxGrade: 4.0, speedLimit: 120 },
        enforcement: 'Strict (Saher)', congestion: 'Moderate', reactionFactor: 0.85,
        notes: 'High-speed expressways, strict speed enforcement (Saher), luxury vehicle dominance',
        avgReaction: 0.72, avgSafety: 0.55, avgSigma: 0.65 },
    uae: { name: 'United Arab Emirates',
        fleet: { mlaijy: 0.30, microbus: 0.05, noss_naql: 0.06, rob_naql: 0.03, naql_taqeel: 0.10, motorcycle: 0.02, bicycle: 0.01, trooscoor: 0.002, tuktuk: 0.002, av: 0.22 },
        road: { laneWidth: 3.75, shoulder: 3.5, maxGrade: 3.0, speedLimit: 140 },
        enforcement: 'Very Strict', congestion: 'Moderate-Low', reactionFactor: 0.80,
        notes: 'Smart V2I infrastructure, modern corridors, high AV adoption potential',
        avgReaction: 0.68, avgSafety: 0.60, avgSigma: 0.55 },
    jordan: { name: 'Jordan (Levant)',
        fleet: { mlaijy: 0.22, microbus: 0.12, noss_naql: 0.12, rob_naql: 0.08, naql_taqeel: 0.15, motorcycle: 0.08, bicycle: 0.04, trooscoor: 0.01, tuktuk: 0.01, av: 0.08 },
        road: { laneWidth: 3.5, shoulder: 2.0, maxGrade: 8.0, speedLimit: 90 },
        enforcement: 'Moderate', congestion: 'Moderate', reactionFactor: 0.95,
        notes: 'Mountainous terrain, steep grades, challenging geometry, mixed corridors',
        avgReaction: 0.80, avgSafety: 0.48, avgSigma: 0.75 }
};

function switchCorridor(country) {
  if (!CORRIDORS[country] || !rrMap) return;
  currentCorridor = country;
  var cor = CORRIDORS[country];
  // Clear existing polylines
  if (rrPolyA) { rrPolyA.setMap(null); rrPolyA = null; }
  if (rrPolyB) { rrPolyB.setMap(null); rrPolyB = null; }
  // Clear existing markers
  rrMarkers.forEach(function(o) { if (o.marker) o.marker.setMap(null); });
  rrMarkers = [];
  // Remove old overlay
  if (rrOverlay) { rrOverlay.setMap(null); rrOverlay = null; rrOverlay = null; }
  // Clear directions renderer
  if (rrDirectionsRenderer) { rrDirectionsRenderer.setMap(null); rrDirectionsRenderer = null; }
  rrSnappedPath = null; rrSnappedPathB = null;
  clearCaseInterchanges();
  // Re-route with DirectionsService for new corridor
  initializeHighFidelityRingRoadMap(cor);
  // New overlay
  rrOverlay = new RingRoadOverlay(rrMap);
  updateRingRoadStyle(rrMPR);
  fetchAirQuality();
  fetchWeather();
}

function selectCountry(country) {
    currentCountry = country;
    ['egypt','ksa','uae','jordan'].forEach(function(c) {
        var btn = document.getElementById('ch-' + c);
        if (!btn) return;
        if (c === country) btn.className = 'ch-btn active px-5 py-2.5 rounded-lg font-medium text-sm transition bg-white text-slate-700 border-2 border-primary shadow-md';
        else btn.className = 'ch-btn px-5 py-2.5 rounded-lg font-medium text-sm transition bg-white text-slate-600 border-2 border-slate-200 hover:border-primary';
    });
    renderCountryHub();
    if (rrMap && country !== currentCorridor) switchCorridor(country);
    var slider = document.getElementById('mpr-slider');
    if (slider) updateFleetTable(parseInt(slider.value, 10));
}

function renderCountryHub() {
    var c = COUNTRY_DATA[currentCountry];
    if (!c) return;
    var fleetDiv = document.getElementById('ch-fleet-bars');
    if (fleetDiv) {
        var html = '';
        Object.keys(c.fleet).forEach(function(k) {
            var pct = Math.round(c.fleet[k] * 100);
            var color = k === 'av' ? '#10b981' : '#0ea5e9';
            html += '<div class="flex items-center gap-2"><span class="text-xs text-slate-500 w-20 truncate">' + k + '</span>'
                + '<div class="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden"><div class="h-full rounded-full" style="width:' + pct + '%;background:' + color + '"></div></div>'
                + '<span class="text-xs font-mono text-slate-600 w-10 text-right">' + pct + '%</span></div>';
        });
        fleetDiv.innerHTML = html;
    }
    var roadDiv = document.getElementById('ch-road-params');
    if (roadDiv) {
        roadDiv.innerHTML = '<div class="flex justify-between text-sm"><span class="text-slate-500">Lane Width</span><span class="font-mono">' + c.road.laneWidth + ' m</span></div>'
            + '<div class="flex justify-between text-sm"><span class="text-slate-500">Shoulder</span><span class="font-mono">' + c.road.shoulder + ' m</span></div>'
            + '<div class="flex justify-between text-sm"><span class="text-slate-500">Max Grade</span><span class="font-mono">' + c.road.maxGrade + '%</span></div>'
            + '<div class="flex justify-between text-sm"><span class="text-slate-500">Speed Limit</span><span class="font-mono">' + c.road.speedLimit + ' km/h</span></div>';
    }
    var calDiv = document.getElementById('ch-calib-grid');
    if (calDiv) {
        calDiv.innerHTML = '<div class="bg-white rounded-xl shadow-md border border-slate-200 p-5"><h4 class="font-bold text-slate-800 mb-2"><i class="fas fa-stopwatch mr-2 text-primary"></i>Reaction Time</h4><div class="text-3xl font-bold text-blue-500">' + (c.avgReaction*1000).toFixed(0) + ' ms</div><p class="text-xs text-slate-500 mt-1">' + (c.reactionFactor>1?'Weaker enforcement, longer gaps':'Strong enforcement, shorter gaps') + '</p></div>'
            + '<div class="bg-white rounded-xl shadow-md border border-slate-200 p-5"><h4 class="font-bold text-slate-800 mb-2"><i class="fas fa-shield-alt mr-2 text-green-500"></i>Safety Index</h4><div class="text-3xl font-bold text-green-500">' + (c.avgSafety*100).toFixed(0) + '/100</div><p class="text-xs text-slate-500 mt-1">Region-calibrated risk score</p></div>'
            + '<div class="bg-white rounded-xl shadow-md border border-slate-200 p-5"><h4 class="font-bold text-slate-800 mb-2"><i class="fas fa-chart-area mr-2 text-accent"></i>Behavior Sigma</h4><div class="text-3xl font-bold text-orange-500">' + c.avgSigma.toFixed(2) + '</div><p class="text-xs text-slate-500 mt-1">Lateral deviation std (m)</p></div>'
            + '<div class="bg-white rounded-xl shadow-md border border-slate-200 p-5"><h4 class="font-bold text-slate-800 mb-2"><i class="fas fa-gavel mr-2 text-purple-500"></i>Enforcement</h4><div class="text-2xl font-bold text-purple-500">' + c.enforcement + '</div><p class="text-xs text-slate-500 mt-1">Congestion: ' + c.congestion + '</p></div>';
    }
    var notesDiv = document.getElementById('ch-notes');
    if (notesDiv) {
        notesDiv.innerHTML = '<div class="bg-slate-800 rounded-xl p-5 text-sm text-slate-300"><i class="fas fa-info-circle mr-2 text-primary"></i>' + c.notes + '</div>';
    }
}

// ══════════════════════════════════════════════════════════
// RATE LIMITING FOR API CALLS
// ══════════════════════════════════════════════════════════
var API_RATE_LIMIT = { lastCall: {}, minInterval: 60000 };
function rateLimitedFetch(key, fn) {
    var now = Date.now();
    if (API_RATE_LIMIT.lastCall[key] && (now - API_RATE_LIMIT.lastCall[key]) < API_RATE_LIMIT.minInterval) return;
    API_RATE_LIMIT.lastCall[key] = now;
    return fn();
}

// ══════════════════════════════════════════════════════════
// WEATHER IMPACT MODELING
// ══════════════════════════════════════════════════════════
var WEATHER_IMPACT = {
    clear:   { factor: 1.00, reduction: '0%',   label: 'Clear',   color: 'text-green-500' },
    rain:    { factor: 0.80, reduction: '-20%', label: 'Rain',    color: 'text-yellow-500' },
    fog:     { factor: 0.65, reduction: '-35%', label: 'Fog',     color: 'text-orange-500' },
    ice:     { factor: 0.50, reduction: '-50%', label: 'Ice/Snow', color: 'text-red-500' },
    snow:    { factor: 0.55, reduction: '-45%', label: 'Snow',    color: 'text-red-400' },
    drizzle: { factor: 0.90, reduction: '-10%', label: 'Drizzle', color: 'text-yellow-300' }
};
var currentWeatherCondition = 'clear';
function getWeatherFactor() {
    var w = WEATHER_IMPACT[currentWeatherCondition];
    return w ? w.factor : 1.0;
}
function updateWeatherImpact() {
    var cond = (liveTraffic && liveTraffic.weather) ? liveTraffic.weather.toLowerCase() : 'clear';
    if (cond.indexOf('rain') !== -1 || cond.indexOf('shower') !== -1) currentWeatherCondition = 'rain';
    else if (cond.indexOf('fog') !== -1 || cond.indexOf('mist') !== -1) currentWeatherCondition = 'fog';
    else if (cond.indexOf('snow') !== -1 || cond.indexOf('sleet') !== -1) currentWeatherCondition = 'snow';
    else if (cond.indexOf('ice') !== -1 || cond.indexOf('freez') !== -1) currentWeatherCondition = 'ice';
    else if (cond.indexOf('drizzle') !== -1) currentWeatherCondition = 'drizzle';
    else currentWeatherCondition = 'clear';
    var w = WEATHER_IMPACT[currentWeatherCondition];
    var el;
    el = document.getElementById('wi-condition'); if (el) el.textContent = w.label + ' (' + w.reduction + ' speed)';
    el = document.getElementById('wi-temp'); if (el) el.textContent = liveTraffic ? (liveTraffic.temp || '--') : '--';
    el = document.getElementById('wi-humidity'); if (el) el.textContent = liveTraffic ? (liveTraffic.humidity || '--') : '--';
    el = document.getElementById('wi-visibility'); if (el) el.textContent = liveTraffic ? (liveTraffic.visibility || '--') : '--';
}
function weatherAdjustedSpeed(baseSpeed) {
    return baseSpeed * getWeatherFactor();
}



// ═══════════════════════════════════════════════════════════
// CONFLICT HOTSPOT ANALYSIS & SSAM (Surrogate Safety Assessment Model)
// ═══════════════════════════════════════════════════════════
var ssamData = { ttcAvg: 0, petAvg: 0, rearEnd: 0, laneChange: 0, hotspots: [] };
var ssamChart = null;
var ssamHotspotMarkers = [];
var ssamLastRenderTime = 0;
function computeSSAMMetrics(mpr) {
    var m = mpr / 100;
    // Base rates at 0% MPR (hazardous conditions)
    var baseTTC = 0.6; // seconds - minimal time-to-collision at low MPR
    var basePET = 4.5; // seconds
    var baseRearEnd = 18; // conflicts per hour
    var baseLaneChange = 12; // conflicts per hour
    // AV penetration reduces conflict rates
    var ttcReduction = 1 - m * 0.8; // 80% max reduction at 100% MPR
    var petIncrease = 1 + m * 0.8; // PET increases with AV penetration
    var rearEndReduction = m * 0.9; // 90% max reduction
    var laneChangeReduction = m * 0.7; // 70% max reduction
    // Calculate metrics
    var ttcAvg = Math.max(0.6, baseTTC * ttcReduction);
    var petAvg = Math.max(1.2, basePET * petIncrease);
    var rearEnd = Math.round(baseRearEnd * (1 - rearEndReduction));
    var laneChange = Math.round(baseLaneChange * (1 - laneChangeReduction));
    // Hotspot TTC values (specific ramp locations)
    var hotspots = [
        {
            name: 'Qalyub Merge Inflow',
            ttc: Math.max(0.6, 1.8 * ttcReduction),
            pet: Math.max(1.2, 3.5 * petIncrease),
            type: 'merge',
            severity: ttcReduction > 0.5 ? 'low' : ttcReduction > 0.2 ? 'medium' : 'high'
        },
        {
            name: 'Mostorod Bridge Bottleneck',
            ttc: Math.max(0.7, 2.2 * ttcReduction),
            pet: Math.max(1.5, 4.0 * petIncrease),
            type: 'bottleneck',
            severity: ttcReduction > 0.5 ? 'low' : ttcReduction > 0.2 ? 'medium' : 'high'
        },
        {
            name: 'Al-Salam Interchange Weaving',
            ttc: Math.max(0.5, 2.5 * ttcReduction),
            pet: Math.max(1.3, 5.0 * petIncrease),
            type: 'weaving',
            severity: ttcReduction > 0.5 ? 'low' : ttcReduction > 0.2 ? 'medium' : 'high'
        }
    ];
    ssamData = { ttcAvg: ttcAvg, petAvg: petAvg, rearEnd: rearEnd, laneChange: laneChange, hotspots: hotspots };
    updateSSAMDisplay();
    renderSSAMChart();
    renderSSAMHotspots();
}
function updateSSAMDisplay() {
    var el;
    // Update TTC
    el = document.getElementById('ca-ttc-avg'); if (el) el.textContent = ssamData.ttcAvg.toFixed(1);
    // Update PET
    el = document.getElementById('ca-pet-avg'); if (el) el.textContent = ssamData.petAvg.toFixed(1);
    // Update Rear-End counter
    el = document.getElementById('ca-rear-end'); if (el) el.textContent = ssamData.rearEnd;
    // Update Lane-Change counter
    el = document.getElementById('ca-lane-change'); if (el) el.textContent = ssamData.laneChange;
    // Update conflict resolution status
    var resolutionEl = document.getElementById('ca-resolution');
    if (resolutionEl) {
        if (ssamData.ttcAvg >= 2.0) {
            resolutionEl.innerHTML = '<span class="font-mono font-bold text-green-500" data-key="ca_resolved">Resolved</span>';
        } else {
            resolutionEl.innerHTML = '<span class="font-mono font-bold text-red-500" data-key="ca_unresolved">Unresolved</span>';
        }
    }
    // Update incline TTC
    el = document.getElementById('ca-ttc-incline'); if (el) el.textContent = ssamData.hotspots[0].ttc.toFixed(1) + 's';
    // Update weaving PET
    el = document.getElementById('ca-pet-weaving'); if (el) el.textContent = ssamData.hotspots[1].pet.toFixed(1) + 's';
}
function renderSSAMChart() {
    if (typeof Chart === 'undefined') return;
    if (ssamChart) { ssamChart.destroy(); ssamChart = null; }
    var ctx = document.getElementById('ca-hotspot-canvas');
    if (!ctx) return;
    // Get canvas dimensions with fixed height constraint
    var canvasEl = ctx.parentNode;
    var maxHeight = parseFloat(getComputedStyle(canvasEl).getPropertyValue('max-height')) || 500;
    var containerHeight = canvasEl.offsetHeight || maxHeight;
    var chartHeight = Math.min(containerHeight - 40, 300);
    ssamChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ssamData.hotspots.map(function(h) { return h.name; }),
            datasets: [{
                label: 'TTC (seconds)',
                data: ssamData.hotspots.map(function(h) { return h.ttc; }),
                backgroundColor: ssamData.hotspots.map(function(h) {
                    return h.ttc < 1.0 ? 'rgba(239,68,68,0.8)' :
                           h.ttc < 1.5 ? 'rgba(234,179,8,0.8)' :
                           h.ttc < 2.0 ? 'rgba(245,158,11,0.8)' :
                           'rgba(34,197,94,0.8)';
                }),
                borderColor: ssamData.hotspots.map(function(h) {
                    return h.ttc < 1.0 ? '#ef4444' :
                           h.ttc < 1.5 ? '#eab308' :
                           h.ttc < 2.0 ? '#f59e0b' :
                           '#22c55e';
                }),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                y: { beginAtZero: true, max: 5, title: { display: true, text: 'TTC (seconds)' } }
            }
        }
    });
}
function renderSSAMHotspots() {
    var container = document.getElementById('ca-hotspot-container');
    if (!container) return;
    var overlay = document.getElementById('ca-hotspot-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    var canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    overlay.appendChild(canvas);
    var c = canvas.getContext('2d');
    // Render pulsing hotspot circles
    ssamData.hotspots.forEach(function(hotspot, index) {
        var ttc = hotspot.ttc;
        var pet = hotspot.pet;
        var severity = hotspot.severity;
        var x = 20 + index * 200 + 50;
        var y = c.canvas.height / 2;
        var radius = 12;
        var pulsePhase = (Date.now() / 200) % 1;
        // Color and pulse based on severity and MPR
        if (ttc < 1.0) {
            color = 'rgba(239,68,68,' + (0.4 + 0.3 * Math.sin(pulsePhase)) + ')';
            // Draw red pulsing circle for high severity
            c.fillStyle = color;
            c.beginPath();
            c.arc(x, y, radius, 0, Math.PI * 2);
            c.fill();
            // Draw inner pulsing dot
            var innerRadius = radius * (0.4 + 0.3 * Math.sin(pulsePhase * 3));
            c.fillStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(pulsePhase * 3)) + ')';
            c.beginPath();
            c.arc(x, y, innerRadius, 0, Math.PI * 2);
            c.fill();
            // Add "HOT" label
            c.fillStyle = '#fff';
            c.font = 'bold 11px sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('HOT', x, y);
        } else if (ttc < 1.5) {
            color = 'rgba(234,179,8,' + (0.4 + 0.3 * Math.sin(pulsePhase)) + ')';
            // Draw orange pulsing circle for medium severity
            c.fillStyle = color;
            c.beginPath();
            c.arc(x, y, radius, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#fff';
            c.font = 'bold 10px sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('MED', x, y);
        } else {
            color = 'rgba(34,197,94,' + (0.4 + 0.3 * Math.sin(pulsePhase)) + ')';
            c.fillStyle = color;
            c.beginPath();
            c.arc(x, y, radius, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#fff';
            c.font = 'bold 10px sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('OK', x, y);
        }
        // Draw PET value below
        c.fillStyle = color;
        c.font = '9px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.fillText(hotspot.name.substring(0, 12), x, y + radius + 18);
        c.fillStyle = '#fff';
        c.font = '9px bold sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(ttc.toFixed(1) + 's', x, y - radius - 4);
    });
    // Draw legend
    var legendEl = document.getElementById('ca-hotspot-legend');
    if (legendEl) {
        var legendHTML = '';
        ssamData.hotspots.forEach(function(h, i) {
            var c = 'rgba(239,68,68,0.5)';
            var ttc = h.ttc;
            if (ttc < 1.5 && ttc >= 1.0) {
                c = 'rgba(234,179,8,0.5)';
            } else if (ttc >= 1.5) {
                c = 'rgba(34,197,94,0.5)';
            }
            legendHTML += '<div class="flex items-center gap-2 mb-1"><span class="w-2 h-2 rounded" style="background:' + c + ';"></span>' + h.name + '</div>';
        });
        legendEl.innerHTML = legendHTML;
        legendEl.classList.remove('hidden');
        legendEl.classList.add('block');
    }
    ssamLastRenderTime = Date.now();
}
// ══════════════════ EXPORT & SHARE STATE ENGINE ══════════════════
function _dl(name, text) {
  var b = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
}
function _tauFromMPR(mpr) { return +(1.2 - mpr * 0.006).toFixed(2); }
function exportSUMO() {
  var s = ['<additional xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/additional_file.xsd">'];
  s.push('  <!-- Generated by SAE AutoSim Hub | MPR ' + rrMPR + '% | ' + new Date().toISOString() + ' -->');
  s.push('  <vType id="avManaged" vClass="passenger" carFollowModel="Krauss" tau="' + _tauFromMPR(rrMPR) + '" accel="2.60" decel="4.50" sigma="' + (0.5 * (1 - rrMPR / 100)).toFixed(2) + '" maxSpeed="33.33" lcCooperative="' + (rrMPR / 100 * 2).toFixed(2) + '"/>');
  s.push('  <vType id="chaoticMicrobus" vClass="bus" carFollowModel="Krauss" tau="1.80" accel="1.20" decel="3.40" sigma="0.70" maxSpeed="19.44" lcImpatience="0.85"/>');
  s.push('  <vType id="mlaiky" vClass="moped" carFollowModel="Krauss" tau="1.10" accel="1.90" decel="4.00" sigma="0.75" maxSpeed="13.89"/>');
  s.push('</additional>');
  _dl('sae_fleet_mpr' + rrMPR + '.add.xml', s.join('\n'));
}
function exportVISSIM() {
  var s = [];
  s.push('-- SAE AutoSim Hub VISSIM calibration snippet | MPR ' + rrMPR + '%');
  s.push('-- Wiedemann 99 parameters adjusted for AV penetration');
  s.push('[VEHICLE_CLASSES]');
  s.push('-- Class      CC0   CC1   CC2  Tau[s]  Accel  Decel');
  s.push('AV-MANAGED    1.35  0.55  2.40  ' + _tauFromMPR(rrMPR) + '   2.60   4.50');
  s.push('MICROBUS-L0   1.50  0.90  4.00  1.80    1.20   3.40');
  s.push('MLAIKY-L0     1.20  0.60  3.10  1.10    1.90   4.00');
  s.push('');
  s.push('[DESIRED_SPEED_DECISIONS] -- grade +3.5% incline segment');
  s.push('InclineFactor = 0.92');
  s.push('');
  s.push('[SIMULATION] Resolution=' + Math.max(2, Math.round(rrMPR / 25)) + ' TimeScale=1.0 Seed=2026');
  _dl('sae_vissim_mpr' + rrMPR + '.inp', s.join('\n'));
}
function exportReport() {
  if (!window.jspdf || !jspdf.jsPDF) { alert('PDF library not loaded'); return; }
  var doc = new jspdf.jsPDF();
  var y = 18;
  doc.setFontSize(16); doc.text('SAE AutoSim Hub - Simulation Report', 14, y); y += 8;
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text(new Date().toLocaleString(), 14, y); y += 10; doc.setTextColor(0);
  doc.setFontSize(11);
  var rows = [
    ['Corridor', currentCorridor.toUpperCase()],
    ['Scenario', (rrScenario === 'B') ? 'B - Managed AV Corridor' : 'A - Current Baseline'],
    ['MPR', rrMPR + '%'],
    ['Avg TTC', ssamData.ttcAvg.toFixed(1) + ' s'],
    ['Avg PET', ssamData.petAvg.toFixed(1) + ' s'],
    ['Rear-End conflicts', ssamData.rearEnd + ' /h'],
    ['Lane-Change conflicts', ssamData.laneChange + ' /h'],
    ['Capacity', (1850 + Math.round(rrMPR * 11)) + ' veh/h/lane'],
    ['Conflict status', ssamData.ttcAvg >= 2.0 ? 'RESOLVED' : 'UNRESOLVED']
  ];
  rows.forEach(function(r){ doc.text(r[0]+':', 14, y); doc.text(String(r[1]), 70, y); y += 7; });
  y += 4;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text('SSAM thresholds: TTC<1.0 high / <1.5 medium / >=1.5 low severity', 14, y);
  doc.save('sae_report_mpr' + rrMPR + '.pdf');
}
var BASE_TITLE = document.title;
function parseStateFromURL() {
    var p = new URLSearchParams(location.search);
    var path = location.pathname.toLowerCase();
    function g(short, legacy) { return p.get(short) || p.get(legacy); }
    var st = {};
    var vq = g('v', 'view');
    st.view = (path.indexOf('case') !== -1 || vq === 'case') ? 'case' : 'main';
    st.corridor = g('c', 'corridor');
    if (!CORRIDORS || !CORRIDORS[st.corridor]) st.corridor = null;
    var m = parseInt(g('m', 'mpr'), 10);
    st.mpr = isNaN(m) ? null : Math.max(0, Math.min(100, m));
    var s = g('s', 'scenario');
    st.scenario = (s === 'B' || s === 'A') ? s : null;
    st.lang = g('l', 'lang');
    return st;
}
function updateURL() {
    try {
        var v = document.body.classList.contains('view-case') ? 'case' : 'main';
        var cor = (typeof currentCorridor !== 'undefined') ? currentCorridor : 'egypt';
        var mpr = (typeof rrMPR !== 'undefined') ? rrMPR : 10;
        var scn = (typeof rrScenario !== 'undefined') ? rrScenario : 'A';
        var lang = 'en';
        try { lang = localStorage.getItem('sae-lang') || 'en'; } catch (e) {}
        var q = [];
        if (cor !== 'egypt') q.push('c=' + cor);
        if (mpr !== 10) q.push('m=' + mpr);
        if (scn !== 'A') q.push('s=' + scn);
        if (lang !== 'en') q.push('l=' + lang);
        var url = '/';
        if (v === 'case') url = '/case' + (q.length ? '?' + q.join('&') : '');
        else if (q.length) url = '/?' + q.join('&');
        history.replaceState(null, '', url);
        document.title = (v === 'case'
            ? '\u062f\u0631\u0627\u0633\u0629 \u0627\u0644\u062d\u0627\u0644\u0629 \u2014 \u0627\u0644\u0637\u0631\u064a\u0642 \u0627\u0644\u062f\u0627\u0626\u0631\u064a \u2022 SAE AutoSim Hub'
            : BASE_TITLE);
    } catch (e) {}
}
['setScenario','switchCorridor','setLanguage'].forEach(function(fn){
  var origFn = window[fn];
  if (typeof origFn === 'function') {
    window[fn] = function(){
      var r = origFn.apply(this, arguments);
      setTimeout(updateURL, 50);
      return r;
    };
  }
});

// Initialize SSAM metrics when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Set initial MPR from slider if exists
    var initialMPR = 10; // default
    var mprSlider = document.getElementById('mpr-slider');
    if (mprSlider) {
        initialMPR = parseInt(mprSlider.value, 10);
    }
    computeSSAMMetrics(initialMPR);
    // Update on MPR slider change
    if (mprSlider) {
        mprSlider.addEventListener('input', function() {
            var v = parseInt(this.value, 10);
            computeSSAMMetrics(v);
            updateURL();
            // Also update ring road style
            if (typeof updateRingRoadStyle === 'function') {
                updateRingRoadStyle(v);
            }
        });
    }
    // Update on Scenario B toggle
    var scenarioB = document.getElementById('scenario-b') || document.querySelector('input[name="scenario"]');
    if (scenarioB) {
        scenarioB.addEventListener('change', function() {
            var v = parseInt(document.getElementById('mpr-slider').value, 10);
            computeSSAMMetrics(v);
            if (typeof updateRingRoadStyle === 'function') {
                updateRingRoadStyle(v);
            }
        });
    }
});

// CARBON CREDIT & ECONOMIC ANALYSIS
// ══════════════════════════════════════════════════════════
var CARBON_ECON = {
    co2PerVehKm: 0.12,   // kg CO2 per vehicle-km (average fleet)
    annualVehKm: 15000000, // annual vehicle-km on corridor
    carbonPricePerTon: 85,  // EUR/ton EU ETS (2026)
    eurToUsd: 1.08,
    crashCostPerCrash: 125000, // USD average crash cost (USDOT 2022)
    fuelPricePerLiter: 1.15,   // USD/liter
    fuelConsumption: 8.5,      // L/100km average
    timeValuePerHour: 15.50    // USD/hour value of time
};
function computeCarbonCredits(mpr) {
    var m = mpr / 100;
    var baseCO2 = CARBON_ECON.co2PerVehKm * CARBON_ECON.annualVehKm / 1000;
    var reduction = m * 0.35;
    var co2Saved = baseCO2 * reduction;
    var creditValue = co2Saved * CARBON_ECON.carbonPricePerTon * CARBON_ECON.eurToUsd;
    var timeSaved = Math.round(m * 2.8 * 365);
    var crashReduction = Math.round(m * 12);
    var crashCostAvoided = crashReduction * CARBON_ECON.crashCostPerCrash;
    var fuelSavings = Math.round(CARBON_ECON.annualVehKm * m * 0.25 * CARBON_ECON.fuelConsumption / 100 * CARBON_ECON.fuelPricePerLiter);
    var emissionPenalty = Math.round(co2Saved * 5);
    var netBenefit = Math.round(creditValue + crashCostAvoided + fuelSavings - emissionPenalty);
    var el;
    el = document.getElementById('cc-co2'); if (el) el.textContent = Math.round(co2Saved).toLocaleString();
    el = document.getElementById('cc-value'); if (el) el.textContent = '$' + Math.round(creditValue).toLocaleString();
    el = document.getElementById('cc-time'); if (el) el.textContent = timeSaved.toLocaleString();
    el = document.getElementById('cc-crash'); if (el) el.textContent = crashReduction;
    el = document.getElementById('cc-crash-cost'); if (el) el.textContent = '$' + crashCostAvoided.toLocaleString();
    el = document.getElementById('cc-fuel'); if (el) el.textContent = '$' + fuelSavings.toLocaleString();
    el = document.getElementById('cc-emission'); if (el) el.textContent = '-$' + emissionPenalty.toLocaleString();
    el = document.getElementById('cc-net'); if (el) el.textContent = '$' + netBenefit.toLocaleString();
}

// ══════════════════════════════════════════════════════════
// PLATOONING & V2X VISUALIZATION
// ══════════════════════════════════════════════════════════
var PLATOON_CONFIG = {
    headway: 0.6,  // seconds
    size: 5,
    fuelSavings: 15,
    latency: 20,   // ms
    range: 300,    // meters
    msgRate: 10,   // messages/sec
    bandwidth: 10  // Mbps
};
var platoonAnim = null;
function updatePlatooning(mpr) {
    var m = mpr / 100;
    PLATOON_CONFIG.size = Math.max(1, Math.round(2 + m * 8));
    PLATOON_CONFIG.headway = Math.max(0.4, 0.6 - m * 0.15);
    PLATOON_CONFIG.fuelSavings = Math.round(5 + m * 20);
    PLATOON_CONFIG.latency = Math.max(5, 20 - m * 10);
    PLATOON_CONFIG.range = Math.round(200 + m * 200);
    PLATOON_CONFIG.msgRate = Math.round(5 + m * 15);
    PLATOON_CONFIG.bandwidth = Math.round(5 + m * 20);
    var el;
    el = document.getElementById('pl-headway'); if (el) el.textContent = PLATOON_CONFIG.headway.toFixed(1) + 's';
    el = document.getElementById('pl-size'); if (el) el.textContent = PLATOON_CONFIG.size;
    el = document.getElementById('pl-savings'); if (el) el.textContent = PLATOON_CONFIG.fuelSavings + '%';
    el = document.getElementById('pl-latency'); if (el) el.textContent = PLATOON_CONFIG.latency + 'ms';
    el = document.getElementById('pl-range'); if (el) el.textContent = PLATOON_CONFIG.range + 'm';
    el = document.getElementById('pl-msgrate'); if (el) el.textContent = PLATOON_CONFIG.msgRate;
    el = document.getElementById('pl-bandwidth'); if (el) el.textContent = PLATOON_CONFIG.bandwidth + ' Mbps';
    el = document.getElementById('pl-v2v-status'); if (el) el.textContent = m > 0.3 ? 'Active' : 'Standby';
    el = document.getElementById('pl-v2i-status'); if (el) el.textContent = m > 0.2 ? 'Active' : 'Standby';
    el = document.getElementById('pl-v2p-status'); if (el) el.textContent = m > 0.5 ? 'Active' : 'Limited';
    renderPlatoonDisplay();
}
function renderPlatoonDisplay() {
    var container = document.getElementById('platoon-display');
    if (!container) return;
    var html = '<div class="flex items-center gap-2">';
    for (var i = 0; i < PLATOON_CONFIG.size; i++) {
        var isLeader = i === 0;
        var color = isLeader ? '#10b981' : '#06b6d4';
        var size = isLeader ? 'w-14 h-8' : 'w-10 h-6';
        html += '<div class="' + size + ' rounded flex items-center justify-center text-white text-[9px] font-bold" style="background:' + color + '">';
        html += isLeader ? 'LEADER' : 'V' + (i + 1);
        html += '</div>';
        if (i < PLATOON_CONFIG.size - 1) {
            var gap = Math.max(4, Math.round(PLATOON_CONFIG.headway * 10));
            html += '<div class="text-[8px] text-slate-500 font-mono" style="width:' + gap + 'px;text-align:center">↕</div>';
        }
    }
    html += '</div>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
// AV PENETRATION FORECASTING (Bass Diffusion Model)
// ══════════════════════════════════════════════════════════
var BASS_PARAMS = { p: 0.03, q: 0.38, M: 1.0 };
var forecastChart = null;
function bassDiffusion(t, p, q, M) {
    return M * (1 - Math.exp(-(p + q) * t)) / (1 + (q / p) * Math.exp(-(p + q) * t));
}
function renderForecastChart() {
    if (typeof Chart === 'undefined') return;
    if (forecastChart) { forecastChart.destroy(); forecastChart = null; }
    var ctx = document.getElementById('forecast-chart');
    if (!ctx) return;
    var years = [];
    var adoption = [];
    var incremental = [];
    var prev = 0;
    for (var y = 2020; y <= 2045; y++) {
        years.push(y);
        var t = y - 2020;
        var val = bassDiffusion(t, BASS_PARAMS.p, BASS_PARAMS.q, BASS_PARAMS.M) * 100;
        adoption.push(val);
        incremental.push(val - prev);
        prev = val;
    }
    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                { label: 'Cumulative Adoption %', data: adoption, borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, pointRadius: 2 },
                { label: 'Annual Incremental %', data: incremental, borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.4, pointRadius: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Market Penetration (%)' } } }
        }
    });
    var el;
    el = document.getElementById('af-2026'); if (el) el.textContent = Math.round(adoption[6]) + '%';
    el = document.getElementById('af-2030'); if (el) el.textContent = Math.round(adoption[10]) + '%';
    el = document.getElementById('af-2035'); if (el) el.textContent = Math.round(adoption[15]) + '%';
    el = document.getElementById('af-2040'); if (el) el.textContent = Math.round(adoption[20]) + '%';
}

// ══════════════════════════════════════════════════════════
// CRASH PREDICTION MODEL (HSM SPF)
// ══════════════════════════════════════════════════════════
var CRASH_MODEL = {
    aadt: 120000,     // annual average daily traffic
    segmentLength: 32, // km (Cairo Ring Road)
    crashCost: 125000  // USD per crash (USDOT 2022)
};
function computeCrashPrediction(mpr) {
    var m = mpr / 100;
    var aadt = CRASH_MODEL.aadt;
    var L = CRASH_MODEL.segmentLength;
    var nSpf = aadt * L * 365 * 1e-6 * Math.exp(-0.4865 + 0.0925 * Math.log(aadt) - 0.0001 * aadt);
    var cmf = 1 - m * 0.55;
    var crashes = nSpf * cmf;
    var reduction = Math.round(m * 55);
    var costAvoided = Math.round((nSpf - crashes) * CRASH_MODEL.crashCost);
    var el;
    el = document.getElementById('cp-crashes'); if (el) el.textContent = crashes.toFixed(1);
    el = document.getElementById('cp-reduction'); if (el) el.textContent = reduction + '%';
    el = document.getElementById('cp-cost'); if (el) el.textContent = '$' + costAvoided.toLocaleString();
}

// ══════════════════════════════════════════════════════════
// PDF REPORT GENERATOR (jsPDF)
// ══════════════════════════════════════════════════════════
function generatePDFReport() {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
        showToast('PDF library loading... please try again in 2 seconds');
        return;
    }
    var doc = new (window.jspdf.jsPDF || jspdf.jsPDF)({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var pageWidth = doc.internal.pageSize.getWidth();
    var y = 20;
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('SAE AutoSim Hub — Simulation Report', pageWidth / 2, y, { align: 'center' });
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Generated: ' + new Date().toISOString().split('T')[0] + ' | Platform: sae.fimtosoft.com', pageWidth / 2, y, { align: 'center' });
    y += 12;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('1. Simulation Parameters', 20, y); y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    var mpr = typeof mprValue !== 'undefined' ? mprValue : 10;
    var params = [
        ['MPR (AV Penetration)', mpr + '%'],
        ['Active Corridor', (typeof currentCorridor !== 'undefined' ? currentCorridor : 'egypt').toUpperCase()],
        ['Scenario', (typeof rrScenario !== 'undefined' ? rrScenario : 'A')],
        ['Weather Condition', currentWeatherCondition],
        ['Weather Speed Factor', getWeatherFactor().toFixed(2)],
        ['Grade', countryGrade().toFixed(1) + '%']
    ];
    params.forEach(function(p) { doc.text(p[0] + ':', 25, y); doc.text(p[1], 100, y); y += 6; });
    y += 5;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('2. Traffic Physics', 20, y); y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    var cap = compositeCapacity(mpr, countryGrade());
    var physics = [
        ['Composite Capacity', cap.C + ' veh/hr/lane'],
        ['Average PCE', cap.pceAvg.toFixed(2)],
        ['Heavy Vehicle Factor (fHV)', cap.fHV.toFixed(3)],
        ['Emissions Index', emissionsIndex(mpr, countryGrade()).toFixed(2)]
    ];
    physics.forEach(function(p) { doc.text(p[0] + ':', 25, y); doc.text(p[1], 100, y); y += 6; });
    y += 5;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('3. Conflict Analysis', 20, y); y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    var conflicts = [
        ['Severe (TTC < 2s)', conflictData.severe.toString()],
        ['Moderate (TTC 2-5s)', conflictData.moderate.toString()],
        ['Safe (TTC > 5s)', conflictData.safe.toString()]
    ];
    conflicts.forEach(function(p) { doc.text(p[0] + ':', 25, y); doc.text(p[1], 100, y); y += 6; });
    y += 5;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('4. Economic Analysis', 20, y); y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    var co2 = document.getElementById('cc-co2');
    var val = document.getElementById('cc-value');
    var net = document.getElementById('cc-net');
    var econ = [
        ['CO2 Reduced', co2 ? co2.textContent : '--'],
        ['Carbon Credit Value', val ? val.textContent : '--'],
        ['Net Annual Benefit', net ? net.textContent : '--']
    ];
    econ.forEach(function(p) { doc.text(p[0] + ':', 25, y); doc.text(p[1], 100, y); y += 6; });
    y += 10;
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Reference: SAE J3016, HCM 6th Edition, Wiedemann 99, NCHRP Report 586, USDOT BCA (2022)', 20, y);
    doc.text('Proprietary Research Platform Powered by Fimtosoft. All Rights Reserved. (c) 2026', pageWidth / 2, y + 5, { align: 'center' });
    doc.save('SAE_AutoSim_Report_' + new Date().toISOString().split('T')[0] + '.pdf');
    showToast('PDF report downloaded successfully');
}

// ══════════════════════════════════════════════════════════
// UNIFIED UPDATE FUNCTION — CASCADING ALL MODULES
// ══════════════════════════════════════════════════════════
function updateAllModules(mpr) {
    updatePhysicsBox(mpr);
    updateEnvTracker(mpr);
    updateWeatherImpact();
    computeConflictAnalysis(mpr);
    computeCarbonCredits(mpr);
    updatePlatooning(mpr);
    computeCrashPrediction(mpr);
    updateNightSurface();
    updateIntersectionWorkzone(mpr);
    captureReplayFrame(mpr);
    if (typeof renderConflictChart === 'function') renderConflictChart();
    if (typeof renderForecastChart === 'function') renderForecastChart();
}

// ══════════════════════════════════════════════════════════
// NIGHT-TIME DRIVING & ROAD SURFACE MODELING
// ══════════════════════════════════════════════════════════
var NIGHT_SURFACE = {
    headlightRange: 80,
    laneDetection: 0.92,
    nightSpeedReduction: 0.15,
    crashRiskMultiplier: 2.1,
    friction: { dry: 0.70, wet: 0.45, icy: 0.20, snow: 0.30 },
    brakingFactor: { dry: 1.0, wet: 1.56, icy: 3.5, snow: 2.33 }
};
var isNightTime = false;
var currentSurface = 'dry';
function updateNightSurface() {
    var hour = new Date().getHours();
    isNightTime = (hour < 6 || hour > 20);
    var weather = (liveTraffic && liveTraffic.weather) ? liveTraffic.weather.toLowerCase() : '';
    if (weather.indexOf('rain') !== -1 || weather.indexOf('shower') !== -1) currentSurface = 'wet';
    else if (weather.indexOf('snow') !== -1 || weather.indexOf('sleet') !== -1) currentSurface = 'snow';
    else if (weather.indexOf('ice') !== -1 || weather.indexOf('freez') !== -1) currentSurface = 'icy';
    else currentSurface = 'dry';
    var friction = NIGHT_SURFACE.friction[currentSurface] || 0.70;
    var braking = NIGHT_SURFACE.brakingFactor[currentSurface] || 1.0;
    var nightMod = isNightTime ? NIGHT_SURFACE.nightSpeedReduction : 0;
    var laneDet = isNightTime ? NIGHT_SURFACE.laneDetection : 0.98;
    var crashRisk = isNightTime ? NIGHT_SURFACE.crashRiskMultiplier : 1.0;
    crashRisk *= (currentSurface === 'icy' ? 1.8 : currentSurface === 'wet' ? 1.3 : 1.0);
    var condLabel = currentSurface.charAt(0).toUpperCase() + currentSurface.slice(1);
    var gripLabel = friction >= 0.6 ? 'Optimal' : friction >= 0.35 ? 'Reduced' : 'Critical';
    var gripColor = friction >= 0.6 ? 'text-green-400' : friction >= 0.35 ? 'text-yellow-400' : 'text-red-400';
    var el;
    el = document.getElementById('ns-headlight'); if (el) el.textContent = (isNightTime ? NIGHT_SURFACE.headlightRange : '--') + (isNightTime ? 'm' : '');
    el = document.getElementById('ns-lane-det'); if (el) el.textContent = Math.round(laneDet * 100) + '%';
    el = document.getElementById('ns-speed-red'); if (el) el.textContent = isNightTime ? '-' + Math.round(nightMod * 100) + '%' : '0%';
    el = document.getElementById('ns-crash-risk'); if (el) el.textContent = crashRisk.toFixed(1) + 'x';
    el = document.getElementById('ns-friction'); if (el) el.textContent = friction.toFixed(2);
    el = document.getElementById('ns-braking'); if (el) el.textContent = braking.toFixed(1) + 'x';
    el = document.getElementById('ns-condition'); if (el) { el.textContent = condLabel; el.className = 'font-mono ' + (currentSurface === 'dry' ? 'text-green-400' : 'text-orange-400'); }
    el = document.getElementById('ns-grip'); if (el) { el.textContent = gripLabel; el.className = 'font-mono ' + gripColor; }
}

// ══════════════════════════════════════════════════════════
// INTERSECTION & WORK ZONE ANALYSIS
// ══════════════════════════════════════════════════════════
var INTERSECTION = { cycleLength: 90, greenRatio: 0.45, satFlow: 1800 };
var WORKZONE = { laneClosure: 1, totalLanes: 3, speedLimit: 50, queueBase: 0.8 };
var CLIMBING = { grade: 4.5, hvSpeed: 35, overtakesPerHr: 12 };
function updateIntersectionWorkzone(mpr) {
    var m = mpr / 100;
    var capacity = Math.round(INTERSECTION.satFlow * INTERSECTION.greenRatio * (1 - m * 0.1));
    var delay = Math.round(35 * (1 + m * 0.2));
    var queueLen = (WORKZONE.queueBase * (1 - m * 0.3)).toFixed(1);
    var ttc = (3.2 * (1 - m * 0.4)).toFixed(1);
    var hvSpeed = Math.round(CLIMBING.hvSpeed * (1 + m * 0.3));
    var overtakes = Math.round(CLIMBING.overtakesPerHr * (1 - m * 0.5));
    var laneNeed = CLIMBING.grade > 3.0 ? 'Yes' : 'No';
    var el;
    el = document.getElementById('iw-cycle'); if (el) el.textContent = INTERSECTION.cycleLength + 's';
    el = document.getElementById('iw-green'); if (el) el.textContent = INTERSECTION.greenRatio.toFixed(2);
    el = document.getElementById('iw-capacity'); if (el) el.textContent = capacity.toLocaleString() + ' veh/h';
    el = document.getElementById('iw-delay'); if (el) el.textContent = delay + 's';
    el = document.getElementById('iw-lane-closure'); if (el) el.textContent = WORKZONE.laneClosure + ' of ' + WORKZONE.totalLanes;
    el = document.getElementById('iw-queue'); if (el) el.textContent = queueLen + ' km';
    el = document.getElementById('iw-speed-wz'); if (el) el.textContent = WORKZONE.speedLimit + ' km/h';
    el = document.getElementById('iw-ttc-wz'); if (el) el.textContent = ttc + 's';
    el = document.getElementById('iw-grade-seg'); if (el) el.textContent = '+' + CLIMBING.grade + '%';
    el = document.getElementById('iw-hv-speed'); if (el) el.textContent = hvSpeed + ' km/h';
    el = document.getElementById('iw-overtake'); if (el) el.textContent = overtakes + '/hr';
    el = document.getElementById('iw-lane-need'); if (el) { el.textContent = laneNeed; el.className = 'font-mono ' + (laneNeed === 'Yes' ? 'text-green-500' : 'text-slate-500'); }
}

// ══════════════════════════════════════════════════════════
// SIMULATION REPLAY / RECORDING SYSTEM
// ══════════════════════════════════════════════════════════
var replayState = { recording: false, frames: [], frameIdx: 0, playing: false, interval: null };
function startRecording() {
    replayState.recording = true;
    replayState.frames = [];
    document.getElementById('rec-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;
    document.getElementById('replay-status').textContent = 'Recording... (MPR changes captured)';
    document.getElementById('replay-progress').style.width = '0%';
}
function stopRecording() {
    replayState.recording = false;
    document.getElementById('rec-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    document.getElementById('play-btn').disabled = replayState.frames.length === 0;
    document.getElementById('replay-status').textContent = 'Recorded ' + replayState.frames.length + ' frames. Ready to replay.';
}
function captureReplayFrame(mpr) {
    if (!replayState.recording) return;
    replayState.frames.push({ mpr: mpr, weather: currentWeatherCondition, surface: currentSurface, time: Date.now() });
}
function playReplay() {
    if (replayState.frames.length === 0) return;
    replayState.playing = true;
    replayState.frameIdx = 0;
    document.getElementById('play-btn').disabled = true;
    document.getElementById('replay-status').textContent = 'Playing...';
    replayState.interval = setInterval(function() {
        if (replayState.frameIdx >= replayState.frames.length) {
            clearInterval(replayState.interval);
            replayState.playing = false;
            document.getElementById('play-btn').disabled = false;
            document.getElementById('replay-status').textContent = 'Replay complete.';
            return;
        }
        var frame = replayState.frames[replayState.frameIdx];
        var slider = document.getElementById('mpr-slider');
        if (slider) { slider.value = frame.mpr; updateMPR(frame.mpr); }
        var pct = (replayState.frameIdx / replayState.frames.length * 100).toFixed(0);
        document.getElementById('replay-progress').style.width = pct + '%';
        document.getElementById('replay-status').textContent = 'Frame ' + (replayState.frameIdx + 1) + '/' + replayState.frames.length + ' — MPR: ' + frame.mpr + '%';
        replayState.frameIdx++;
    }, 500);
}

    

// ═══════════ CONSOLIDATED ENGINES (post-e132 rebuild) ═══════════

// ─── 0. EVENT DELEGATION (CSP-friendly, zero inline handlers) ───
function saeScroll(id) { var el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
function saeCloseSandboxOnOverlay(e, el) { if (e.target === el) closeSandbox(); }
(function () {
    function argsOf(el) {
        var raw = el.getAttribute('data-args');
        if (!raw) return [];
        try { return JSON.parse(raw); } catch (err) { return []; }
    }
    ['click', 'change', 'input'].forEach(function (evt) {
        document.addEventListener(evt, function (e) {
            var attr = 'data-call-' + evt;
            var el = e.target.closest ? e.target.closest('[' + attr + ']') : null;
            if (!el) return;
            var fnName = el.getAttribute(attr);
            var fn = window[fnName];
            if (typeof fn !== 'function') { console.warn('[delegation] missing:', fnName); return; }
            var args = el.hasAttribute('data-pass-value') ? [el.value] : argsOf(el);
            fn.apply(el, args);
        });
    });
})();

// ─── 1. VIEW SWITCHER ───
function applyView(v) {
    document.body.classList.toggle('view-case', v === 'case');
    var tm = document.getElementById('tab-main'), tc = document.getElementById('tab-case');
    var onCls = 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50';
    var offCls = 'bg-slate-600/20 text-slate-300 border-slate-500/40';
    if (tm) tm.className = 'px-3 py-1.5 rounded-lg font-medium ' + (v !== 'case' ? onCls : offCls);
    if (tc) tc.className = 'px-3 py-1.5 rounded-lg font-medium ' + (v === 'case' ? onCls : offCls);
    try { localStorage.setItem('sae-view', v); } catch (e) {}
}
function setView(v) {
    applyView(v);
    if (v === 'case') {
        setTimeout(function () {
            var t = document.getElementById('ringroad');
            if (t) t.scrollIntoView({ behavior: 'smooth' });
        }, 150);
    } else { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    updateURL();
}
function openCaseStudy() { setView('case'); }
(function () {
    var q = new URLSearchParams(location.search);
    var v = q.get('view') || 'main';
    document.addEventListener('DOMContentLoaded', function () { applyView(v); });
})();

// ─── 2. MORE MENU ───
function toggleMoreMenu() {
    var m = document.getElementById('more-menu');
    if (m) m.classList.toggle('hidden');
}

// ─── 2b. MOBILE NAVIGATION DRAWER ───
function toggleMobileNav() {
    var drawer = document.getElementById('mobile-nav-drawer');
    var backdrop = document.getElementById('mobile-nav-backdrop');
    if (!drawer || !backdrop) return;
    var isOpen = drawer.classList.contains('open');
    if (isOpen) {
        drawer.classList.remove('open');
        backdrop.classList.add('hidden');
        document.body.style.overflow = '';
    } else {
        drawer.classList.add('open');
        backdrop.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}
function menuGoMobile(href) {
    toggleMobileNav();
    var el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}
document.addEventListener('click', function (e) {
    var more = document.getElementById('more-menu');
    if (!more || more.classList.contains('hidden')) return;
    if (!e.target.closest('#more-menu') && !e.target.closest('#more-btn')) more.classList.add('hidden');
});
function _go(sel, caseV) {
    if (caseV && !document.body.classList.contains('view-case')) setView('case');
    var el = document.querySelector(sel);
    if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth' }); }, 160);
}
function menuGo(el) { _go(el.getAttribute('href'), false); }
function menuGoCase(el) { _go(el.getAttribute('href'), true); }

// ─── 3. THEME ENGINE ───
function applyTheme(theme) {
    document.documentElement.classList.toggle('sae-dark', theme === 'dark');
    var ic = document.getElementById('theme-icon');
    if (ic) ic.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
    try { localStorage.setItem('sae-theme', theme); } catch (e) {}
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = theme === 'dark' ? '#cbd5e1' : '#334155';
        Chart.defaults.borderColor = theme === 'dark' ? '#24344f' : '#e2e8f0';
        Chart.defaults.font.family = "'Inter', sans-serif";
    }
    setTimeout(function () {
        ['renderSSAMChart', 'renderForecastChart'].forEach(function (fn) {
            try { if (typeof window[fn] === 'function') window[fn](); } catch (err) {}
        });
        if (fleetChartA) { fleetChartA.options.scales.x.ticks.color = theme === 'dark' ? '#cbd5e1' : '#334155'; fleetChartA.options.scales.y.ticks.color = theme === 'dark' ? '#cbd5e1' : '#334155'; fleetChartA.options.scales.x.grid.color = theme === 'dark' ? '#24344f' : '#e2e8f0'; fleetChartA.options.scales.y.grid.color = theme === 'dark' ? '#24344f' : '#e2e8f0'; fleetChartA.update(); }
        if (fleetChartB) { fleetChartB.options.scales.x.ticks.color = theme === 'dark' ? '#cbd5e1' : '#334155'; fleetChartB.options.scales.y.ticks.color = theme === 'dark' ? '#cbd5e1' : '#334155'; fleetChartB.options.scales.x.grid.color = theme === 'dark' ? '#24344f' : '#e2e8f0'; fleetChartB.options.scales.y.grid.color = theme === 'dark' ? '#24344f' : '#e2e8f0'; fleetChartB.update(); }
    }, 60);
}
function toggleTheme() {
    var dark = document.documentElement.classList.toggle('sae-dark');
    applyTheme(dark ? 'dark' : 'light');
    updateURL();
}
document.addEventListener('DOMContentLoaded', function () {
    applyTheme(document.documentElement.classList.contains('sae-dark') ? 'dark' : 'light');
});

// ─── 4. UNITS ENGINE ───
function getUnits() {
    try { return localStorage.getItem('sae-units') || 'metric'; } catch (e) { return 'metric'; }
}
function fmtKmh(v) {
    v = +v;
    return getUnits() === 'imp' ? (v * 0.621371).toFixed(0) + ' mph' : v + ' km/h';
}
function toggleUnits() {
    var next = getUnits() === 'imp' ? 'metric' : 'imp';
    try { localStorage.setItem('sae-units', next); } catch (e) {}
    refreshUnits(); updateURL();
}
function refreshUnits() {
    var btn = document.getElementById('unit-toggle');
    if (btn) btn.textContent = getUnits() === 'imp' ? 'mph' : 'km/h';
    if (typeof WORKZONE !== 'undefined' && document.getElementById('iw-speed-wz'))
        document.getElementById('iw-speed-wz').textContent = fmtKmh(WORKZONE.speedLimit);
    if (window._lastHV && document.getElementById('iw-hv-speed'))
        document.getElementById('iw-hv-speed').textContent = fmtKmh(window._lastHV);
}

// ─── 5. CAPACITY (documented bands) ───
function capacityAtMPR(mpr) {
    var base = 1900, gain;
    if (mpr <= 20) gain = (mpr / 20) * 0.03;
    else if (mpr <= 30) gain = 0.03 + ((mpr - 20) / 10) * 0.04;
    else if (mpr <= 50) gain = 0.07 + ((mpr - 30) / 20) * 0.18;
    else if (mpr <= 70) gain = 0.25 + ((mpr - 50) / 20) * 0.15;
    else if (mpr <= 90) gain = 0.40 + ((mpr - 70) / 20) * 0.35;
    else gain = 0.75 + ((mpr - 90) / 10) * 0.45;
    return Math.round(base * (1 + gain));
}

// ─── 6. SHARE STATE ───
// ─── 7. FIELD-DATA RENDERERS ───
var RING_CENTERLINE_REAL = [[30.14948, 31.417706], [30.149493, 31.417037], [30.150132, 31.416036], [30.15074, 31.415007], [30.151348, 31.413978], [30.152005, 31.412982], [30.152671, 31.412], [30.153348, 31.411028], [30.154025, 31.410056], [30.154711, 31.409093], [30.1554, 31.40813], [30.156131, 31.407208], [30.156899, 31.406327], [30.157675, 31.405459], [30.158419, 31.404561], [30.159059, 31.403566], [30.159586, 31.402486], [30.159991, 31.401338], [30.160351, 31.400163], [30.160758, 31.399005], [30.161222, 31.397878], [30.161698, 31.396761], [30.162164, 31.395636], [30.162614, 31.394505], [30.163022, 31.393353], [30.163401, 31.392187], [30.163757, 31.391012], [30.164111, 31.389835], [30.164434, 31.388648], [30.164719, 31.387449], [30.164999, 31.386244], [30.165262, 31.385037], [30.165496, 31.383822], [30.165706, 31.382602], [30.165895, 31.381376], [30.166061, 31.380146], [30.166204, 31.378912], [30.166328, 31.377676], [30.16643, 31.376436], [30.166494, 31.375194], [30.16655, 31.373951], [30.166583, 31.372707], [30.166607, 31.371462], [30.166594, 31.370218], [30.166559, 31.368974], [30.166501, 31.367733], [30.166419, 31.366494], [30.166315, 31.365253], [30.166189, 31.364017], [30.166039, 31.362784], [30.165877, 31.361553], [30.165715, 31.360321], [30.165552, 31.359089], [30.165389, 31.357856], [30.165217, 31.356628], [30.165054, 31.355395], [30.164902, 31.35416], [30.16474, 31.352929], [30.164578, 31.351698], [30.164416, 31.350466], [30.164237, 31.349238], [30.164075, 31.348006], [30.163918, 31.346772], [30.163766, 31.34554], [30.163604, 31.344309], [30.163447, 31.343075], [30.163307, 31.341839], [30.163185, 31.340601], [30.16308, 31.33936], [30.162983, 31.33812], [30.162905, 31.336876], [30.162838, 31.335634], [30.162806, 31.334386], [30.162767, 31.333141], [30.162747, 31.331894], [30.162757, 31.330647], [30.162782, 31.329401], [30.162836, 31.328156], [30.162889, 31.326912], [30.162953, 31.32567], [30.163017, 31.324424], [30.163082, 31.323181], [30.163146, 31.321937], [30.163211, 31.320694], [30.163275, 31.31945], [30.163313, 31.318208], [30.163282, 31.316966], [30.163203, 31.315725], [30.163124, 31.314482], [30.163031, 31.313241], [30.162951, 31.311999], [30.162872, 31.310756], [30.162804, 31.309513], [30.16272, 31.308273], [30.162544, 31.307048], [30.162516, 31.305793], [30.162815, 31.304587], [30.16324, 31.303439], [30.163663, 31.302293], [30.164087, 31.301146], [30.164511, 31.3], [30.164935, 31.298854], [30.165273, 31.29768], [30.165446, 31.29646], [30.165449, 31.295224], [30.165297, 31.293998], [30.164985, 31.292814], [30.164533, 31.291692], [30.163926, 31.290672], [30.163179, 31.289786], [30.162358, 31.288973], [30.161541, 31.288156], [30.160731, 31.287326], [30.16001, 31.28639], [30.159385, 31.285366], [30.158848, 31.284282], [30.158317, 31.283196], [30.157786, 31.282111], [30.157255, 31.281025], [30.156724, 31.27994], [30.156192, 31.278855], [30.155662, 31.277771], [30.15513, 31.276684], [30.154599, 31.275599], [30.154053, 31.274523], [30.153522, 31.273438], [30.15299, 31.272353], [30.152474, 31.271258], [30.151943, 31.270175], [30.151419, 31.269085], [30.150928, 31.267971], [30.150512, 31.266817], [30.150157, 31.265637], [30.149881, 31.26443], [30.149649, 31.26321], [30.149481, 31.261977], [30.149377, 31.260735], [30.149336, 31.259486], [30.149337, 31.258239], [30.149337, 31.256996], [30.149337, 31.255747], [30.14932, 31.254503], [30.149393, 31.253257], [30.149426, 31.252016], [30.149443, 31.250771], [30.14946, 31.249525], [30.149478, 31.248281], [30.1495, 31.247035], [30.149499, 31.245789], [30.149516, 31.244544], [30.149548, 31.243299], [30.149565, 31.242054], [30.149583, 31.240808], [30.149591, 31.239565], [30.149557, 31.238322], [30.149502, 31.237077], [30.149454, 31.235833], [30.149368, 31.234593], [30.149265, 31.233354], [30.14916, 31.232114], [30.149048, 31.230876], [30.148936, 31.229637], [30.148848, 31.228394], [30.148796, 31.227148], [30.14877, 31.225902], [30.148744, 31.224657], [30.148718, 31.223412], [30.148693, 31.222167], [30.149032, 31.221982]];
var BLACKSPOTS = [{"n": "تبادل مؤسسة الزكاة", "en": "El-Zakat Foundation Interchange", "frac": 0.33, "imp": -0.65, "cause": "عبور مشاة عشوائي + تجمعات ميكروباص قرب مداخل المرج"}, {"n": "محور الرشاحة (الخصوص)", "en": "El-Rashah Axis (El-Khosous)", "frac": 0.45, "imp": -0.75, "cause": "سلوك الميكروباص يقلل سعة الحارة اليمنى حتى 40%"}, {"n": "كبري المسترود", "en": "Mostorod Bridge", "frac": 0.8, "imp": -0.5, "cause": "اندماج شاحنات ثقيلة من طريق الإسماعيلية القنوية"}, {"n": "مخرج المرج الجديد", "en": "New El-Marg Exit", "frac": 0.38, "imp": -0.8, "cause": "تشبع توكتوك وميكروباص مع تراجع طابور حتى 3 كم على الدائري"}, {"n": "تبادل القليوبية", "en": "Qalyub Interchange (Alex Agri Rd)", "frac": 1.0, "imp": -0.6, "cause": "اختناق إنشائي عند الدمج مع طريق الإسكندرية الزراعي"}];
var BASSOU_COUNTS = [["ملاكي", 1.0, 814, 586], ["ميكروباص", 1.5, 306, 284], ["أتوبيس", 2.5, 57, 65], ["ربع نقل", 2.0, 344, 312], ["نصف نقل", 2.5, 204, 141], ["موتوسيكل وأخرى", 0.33, 150, 153]];
var SIM_TRAVELTIME = [["Conventional (SAE 0)", 1155, 503.4, 2.93], ["L1 Assist", 188, 384.6, 4.17], ["L2 Partial", 142, 360.6, 5.89], ["L3 Conditional", 158, 309.8, 7.07], ["L4 High", 163, 282.7, 7.5], ["L5 Full", 156, 314.1, 7.5]];
var FEATURES = [{"no": 1, "feat": "Forward Collision Avoidance", "desc": "Intervenes with automatic braking faster than human reaction.", "level": "2--5", "tech": "AEB & Radar"}, {"no": 2, "feat": "Thermal Night Vision", "desc": "Detects objects in total darkness via thermal emissions.", "level": "3--5", "tech": "FIR Sensors"}, {"no": 3, "feat": "Platooning", "desc": "Vehicles traveling in a synchronized convoy to reduce drag.", "level": "4--5", "tech": "V2V Comms"}, {"no": 4, "feat": "Surround Laser Scanning", "desc": "Real-time 3D mapping of the environment with precision.", "level": "3--5", "tech": "LiDAR 3D"}, {"no": 5, "feat": "Dynamic Energy Efficiency", "desc": "Path and speed optimization based on road topography.", "level": "4--5", "tech": "Eco-Routing"}, {"no": 6, "feat": "Full Automated Valet Parking", "desc": "Vehicle searches for a spot and parks without passengers.", "level": "4", "tech": "Ultrasonic"}, {"no": 7, "feat": "Human Behavior Prediction", "desc": "Predicts pedestrian intent to cross before the action begins.", "level": "4--5", "tech": "Deep Learning"}, {"no": 8, "feat": "Over-the-Air (OTA) Updates", "desc": "Cloud-based software upgrades without physical maintenance.", "level": "2--5", "tech": "OTA / Cloud"}, {"no": 9, "feat": "Disability Independence", "desc": "Enables blind individuals to commute without a human escort.", "level": "5", "tech": "HMI AI"}, {"no": 10, "feat": "Smart Intersection Management", "desc": "Coordination with traffic lights to cross without stopping.", "level": "5", "tech": "V2X Protocols"}, {"no": 11, "feat": "Headway Distance Reduction", "desc": "Increases road capacity by minimizing gaps between vehicles.", "level": "4--5", "tech": "mmWave Radar"}, {"no": 12, "feat": "Live HD Mapping", "desc": "Maps that update instantly to include roadworks and hazards.", "level": "3--4", "tech": "HD Mapping"}, {"no": 13, "feat": "Vital Signs Monitoring", "desc": "Re-routes to a hospital upon detecting a heart attack.", "level": "4--5", "tech": "Bio-Sensors"}, {"no": 14, "feat": "Urban Space Reclamation", "desc": "Converting parking lots into green community spaces.", "level": "4--5", "tech": "Fleet AI"}, {"no": 15, "feat": "Mobile Office Concept", "desc": "Rotating seats and removing controls for a productive cabin.", "level": "4--5", "tech": "Modular Design"}, {"no": 16, "feat": "Fog Penetration Vision", "desc": "Radar waves to provide digital visibility in dense fog.", "level": "4--5", "tech": "GPR / Radar"}, {"no": 17, "feat": "Emergency Vehicle Detection", "desc": "Identifies sirens and clears the path immediately.", "level": "4--5", "tech": "Audio Pattern"}, {"no": 18, "feat": "Intelligent Regen-Braking", "desc": "Captures kinetic energy to charge batteries during slowing.", "level": "4--5", "tech": "Energy Recovery"}, {"no": 19, "feat": "Pedestrian Intent Analysis", "desc": "Reads body language to determine intent to cross.", "level": "4--5", "tech": "Computer Vision"}, {"no": 20, "feat": "Real-time Path Planning", "desc": "Calculates safest path during sudden obstacles instantly.", "level": "4--5", "tech": "Path Planning"}, {"no": 21, "feat": "Insurance Premium Reduction", "desc": "Lower insurance costs due to reliance on reliable software.", "level": "5", "tech": "Actuarial AI"}, {"no": 22, "feat": "Automated Self-Charging", "desc": "Vehicle re-routes to a dock and plugs in robotically.", "level": "4--5", "tech": "Robotic Plug"}, {"no": 23, "feat": "Speed Synchronization", "desc": "Synchronizing fleet speeds to prevent traffic waves.", "level": "3--5", "tech": "Edge Computing"}, {"no": 24, "feat": "Drive-by-Wire Systems", "desc": "Replacing mechanical links with full electronic controls.", "level": "5", "tech": "Drive-by-Wire"}, {"no": 25, "feat": "Autonomous Delivery (Robo-van)", "desc": "Last-mile delivery bots for automated doorstep service.", "level": "4--5", "tech": "Last-mile AI"}, {"no": 26, "feat": "Tire Longevity Optimization", "desc": "Precise torque distribution to prevent uneven wear.", "level": "4--5", "tech": "Torque Vectoring"}, {"no": 27, "feat": "Immersive In-car Entertainment", "desc": "Converting windows into smart AR/VR interactive displays.", "level": "4--5", "tech": "In-car AR/VR"}, {"no": 28, "feat": "Predictive Diagnostics", "desc": "Automated maintenance requests before mechanical failure.", "level": "2--5", "tech": "Predictive Maint"}, {"no": 29, "feat": "Cyber Encryption", "desc": "Protecting passenger data and travel routes from hacking.", "level": "4--5", "tech": "Cybersecurity"}, {"no": 30, "feat": "Moral Logic Algorithms", "desc": "Programmed fair decision-making in moral dilemmas.", "level": "5", "tech": "Moral Logic"}, {"no": 31, "feat": "Travel Time Reduction", "desc": "40% reduction in travel time via dynamic routing.", "level": "4--5", "tech": "Dynamic Routing"}, {"no": 32, "feat": "Rear-End Collision Zeroing", "desc": "Eliminating serial crashes via digital coordination.", "level": "3--5", "tech": "V2V Comms"}, {"no": 33, "feat": "Road Capacity Expansion", "desc": "Doubling lane capacity by reducing digital buffers.", "level": "5", "tech": "CACC Tech"}, {"no": 34, "feat": "Congestion Dissipation", "desc": "Preventing \"phantom traffic\" via steady-flow speeds.", "level": "4--5", "tech": "Flow Control AI"}, {"no": 35, "feat": "Wait Time Reduction", "desc": "Proactive vehicle distribution in high-demand zones.", "level": "5", "tech": "Demand Prediction"}, {"no": 36, "feat": "Carbon Footprint Mitigation", "desc": "60% emission reduction via electric fleet optimization.", "level": "4--5", "tech": "Eco-Driving"}, {"no": 37, "feat": "Intersection Delay Efficiency", "desc": "80% delay reduction via stop-free coordination.", "level": "5", "tech": "V2I Intersection"}, {"no": 38, "feat": "Brake & Tire Emission Savings", "desc": "Reducing particles via smooth electromagnetic braking.", "level": "4--5", "tech": "Regen-Braking"}, {"no": 39, "feat": "\"Dead Space\" Reclamation", "desc": "Converting parking surfaces to green belts.", "level": "5", "tech": "Fleet Management"}, {"no": 40, "feat": "Transit Flow Integration", "desc": "Syncing AV buses with private cars to prevent overlap.", "level": "4--5", "tech": "Multi-Modal Sync"}];

function renderTravelTimes() {
    var el = document.getElementById('fd-sim-table'); if (!el) return;
    var base = SIM_TRAVELTIME[0][2], h = '';
    SIM_TRAVELTIME.forEach(function (r) {
        var save = (base - r[2]) / base * 100;
        var col = save >= 38 ? '#22c55e' : save >= 25 ? '#84cc16' : save > 0 ? '#eab308' : '#ef4444';
        h += '<tr class="border-b border-slate-700"><td class="py-1.5">' + r[0] + '</td>'
          + '<td class="text-center font-mono">' + r[1] + '</td>'
          + '<td class="text-center font-mono">' + r[2].toFixed(0) + 's</td>'
          + '<td class="text-center font-mono">' + (r[3] * 3.6).toFixed(1) + '</td>'
          + '<td class="text-center font-bold" style="color:' + col + '">' + save.toFixed(1) + '%</td></tr>';
    });
    el.innerHTML = h;
    var best = Math.min.apply(null, SIM_TRAVELTIME.slice(1).map(function (r) { return r[2]; }));
    var kEl = document.getElementById('fd-sector-kpi');
    if (kEl) kEl.textContent = '-' + (base - best).toFixed(0) + 's (' + ((base - best) / base * 100).toFixed(1) + '%)';
}
function renderBlackSpots() {
    var el = document.getElementById('fd-blackspots'); if (!el) return;
    var h = '';
    BLACKSPOTS.forEach(function (b, i) {
        var sev = b.imp <= -0.75 ? 'bg-red-500' : b.imp <= -0.6 ? 'bg-orange-500' : 'bg-yellow-500';
        h += "<div class='flex items-start gap-3 p-2 rounded-lg bg-slate-800/70 mb-2 cursor-pointer hover:ring-1 ring-orange-500/50 transition' data-call-click='focusBlackSpot' data-args='" + JSON.stringify([i]) + "'>"
          + '<span class="' + sev + ' text-white text-xs font-bold px-2 py-1 rounded shrink-0" dir="ltr">' + b.imp.toFixed(2) + '</span>'
          + '<div><div class="font-semibold text-sm">' + b.n
          + ' <span class="text-xs text-slate-400" dir="ltr">' + b.en + '</span></div>'
          + '<div class="text-xs text-slate-300 mt-0.5">' + b.cause + '</div></div></div>';
    });
    el.innerHTML = h;
}
function renderCounts() {
    var el = document.getElementById('fd-counts'); if (!el) return;
    var tot = 0, pcu = 0, tot2 = 0, pcu2 = 0, h = '';
    BASSOU_COUNTS.forEach(function (r) {
        tot += r[2]; pcu += r[2] * r[1]; tot2 += r[3]; pcu2 += r[3] * r[1];
        h += '<tr class="border-b border-slate-700"><td class="py-1.5">' + r[0] + '</td>'
          + '<td class="text-center font-mono">' + r[1].toFixed(2) + '</td>'
          + '<td class="text-center font-mono text-cyan-400">' + r[2] + '</td>'
          + '<td class="text-center font-mono">' + (r[2] * r[1]).toFixed(0) + '</td>'
          + '<td class="text-center font-mono text-cyan-400">' + r[3] + '</td></tr>';
    });
    h += '<tr class="border-t-2 border-slate-500 font-bold"><td class="py-2">الإجمالي</td><td></td>'
      + '<td class="text-center font-mono">' + tot + '</td>'
      + '<td class="text-center font-mono text-green-400">' + pcu.toFixed(0) + '</td>'
      + '<td class="text-center font-mono">' + tot2 + '</td></tr>'
      + '<tr class="text-xs text-slate-400"><td colspan="5">معدل بالساعة (×4): عدلي منصور '
      + Math.round(pcu * 4) + ' PCU/h | 6 أكتوبر ' + Math.round(pcu2 * 4)
      + ' PCU/h — محطة باسوس 10:00–10:30</td></tr>';
    el.innerHTML = h;
}
function renderKPI() {
    var el = document.getElementById('fd-kpi'); if (!el) return;
    var cards = [
        ['Conventional 2024', '#ef4444', '1,800–2,000 veh/h/l', '140–180 min / 100km', 'الحالة الراهنة'],
        ['Mixed L2/L3', '#f59e0b', '2,200–2,400 (+20%)', '110–130 min (+25%)', 'مختلط'],
        ['Full Auto L4/L5', '#22c55e', '3,800–4,200 (+110%)', '60–75 min (+55%)', 'المستقبل']
    ];
    var h = '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">';
    cards.forEach(function (cd) {
        h += '<div class="bg-slate-800 rounded-xl p-4 border-t-4" style="border-color:' + cd[1] + '">'
          + '<div class="text-xs text-slate-400 mb-1">' + cd[4] + ' <span dir="ltr" class="font-semibold" style="color:' + cd[1] + '">' + cd[0] + '</span></div>'
          + '<div class="font-mono text-sm">السعة: <b>' + cd[2] + '</b></div>'
          + '<div class="font-mono text-sm mt-1">زمن اللوب: <b>' + cd[3] + '</b></div></div>';
    });
    h += '</div><p class="text-[11px] text-slate-500 mt-2">التوسعة القومية 4←8 حارات + ITS/V2I تضاعف الأثر (MoT 2023 / GARBLT 2024)</p>';
    el.innerHTML = h;
}
function renderFeatures(q) {
    var el = document.getElementById('feat-table'); if (!el) return;
    q = (q || '').toLowerCase();
    var h = '';
    FEATURES.forEach(function (f) {
        var blob = (f.feat + ' ' + f.desc + ' ' + f.level + ' ' + f.tech).toLowerCase();
        if (q && blob.indexOf(q) === -1) return;
        h += '<tr class="border-b border-slate-700 hover:bg-slate-800/60">'
          + '<td class="py-1.5 px-1 font-mono text-slate-500">' + f.no + '</td>'
          + '<td class="py-1.5 font-medium">' + f.feat
          + '<div class="text-[10px] text-slate-400 font-normal">' + f.desc + '</div></td>'
          + '<td class="text-center"><span class="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded" dir="ltr">' + f.level + '</span></td>'
          + '<td class="text-center text-xs text-emerald-300">' + f.tech + '</td></tr>';
    });
    el.innerHTML = h || '<tr><td colspan="4" class="text-center text-slate-500 py-3">لا نتائج</td></tr>';
}

// ─── 8. BLACKSPOT → MAP FOCUS ───
var _bsMarker = null, _bsIW = null;
function focusBlackSpot(i) {
    var b = BLACKSPOTS[i]; if (!b || b.frac == null || typeof rrMap === 'undefined' || !rrMap) return;
    var p = RING_CENTERLINE_REAL[Math.min(RING_CENTERLINE_REAL.length - 1,
            Math.round(b.frac * (RING_CENTERLINE_REAL.length - 1)))];
    var ll = new google.maps.LatLng(p[0], p[1]);
    if (!_bsMarker) {
        _bsMarker = new google.maps.Marker({ map: rrMap, zIndex: 999,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11,
                    fillColor: '#f97316', fillOpacity: .95, strokeColor: '#fff', strokeWeight: 3 } });
        _bsIW = new google.maps.InfoWindow();
    }
    _bsMarker.setPosition(ll); _bsMarker.setTitle(b.en);
    _bsIW.setContent('<div style="min-width:220px;font-family:Tahoma"><b>' + b.n + '</b><br>'
        + '<small style="color:#555" dir="ltr">' + b.en + '</small><hr style="margin:4px 0">'
        + '<span style="font-size:12px">' + b.cause + '</span><br>'
        + '<span style="color:#ea580c;font-weight:bold">Speed impact: ' + b.imp.toFixed(2) + '</span></div>');
    _bsIW.open(rrMap, _bsMarker);
    rrMap.panTo(ll);
    if (rrMap.getZoom() < 12) rrMap.setZoom(13);
}

// ─── 9. CASE INTERCHANGES + LEGEND ───
var CASE_IC = [
    { frac: 0.00, ar: 'موقف السلام / عدلي منصور', en: 'Salam Terminal', type: 'terminal', icon: '🚏' },
    { frac: 0.33, ar: 'تبادل مؤسسة الزكاة', en: 'El-Zakat Interchange', type: 'interchange', icon: '🔄' },
    { frac: 0.38, ar: 'مخرج المرج الجديد', en: 'New El-Marg Exit', type: 'exit', icon: '↗' },
    { frac: 0.45, ar: 'محور الرشاحة (الخصوص)', en: 'El-Rashah Axis', type: 'conflict', icon: '⚠' },
    { frac: 0.80, ar: 'كبري المسترود (+3.5%)', en: 'Mostorod Bridge', type: 'bridge', icon: '🌉' },
    { frac: 0.93, ar: 'ملتقى الإسكندرية الزراعي', en: 'Alex Agri Rd Merge', type: 'merge', icon: '⇄' },
    { frac: 1.00, ar: 'نزلة القليوب', en: 'Nazlet Qalyub', type: 'terminal', icon: '🏁' }
];
var IC_COLORS = { terminal: '#06b6d4', interchange: '#8b5cf6', exit: '#10b981',
                  conflict: '#f97316', bridge: '#ef4444', merge: '#eab308' };
function icChainage(frac) {
    var v = Math.round(45708 + frac * (65722 - 45708));
    return Math.floor(v / 1000) + '+' + String(v % 1000).padStart(3, '0');
}
var _icMarkers = [];
function clearCaseInterchanges() {
    _icMarkers.forEach(function (m) { m.setMap(null); });
    _icMarkers = [];
    var lg = document.getElementById('case-legend'); if (lg) lg.remove();
}
function drawCaseInterchanges() {
    clearCaseInterchanges();
    if (currentCorridor !== 'egypt' || !RING_CENTERLINE_REAL.length || !rrMap) return;
    CASE_IC.forEach(function (ic, i) {
        var p = RING_CENTERLINE_REAL[Math.min(RING_CENTERLINE_REAL.length - 1,
                Math.round(ic.frac * (RING_CENTERLINE_REAL.length - 1)))];
        var m = new google.maps.Marker({
            position: { lat: p[0], lng: p[1] }, map: rrMap,
            label: { text: String(i + 1), color: '#fff', fontWeight: 'bold', fontSize: '11px' },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12,
                    fillColor: IC_COLORS[ic.type], fillOpacity: 0.95,
                    strokeColor: '#fff', strokeWeight: 2 },
            title: ic.ar + ' — ' + icChainage(ic.frac), zIndex: 500
        });
        var iw = new google.maps.InfoWindow({ content:
            '<div style="min-width:230px;font-family:Tahoma">'
            + '<div style="font-weight:bold;font-size:13px">' + ic.icon + ' ' + (i + 1) + '. ' + ic.ar + '</div>'
            + '<div style="color:#555;font-size:11px" dir="ltr">' + ic.en + '</div>'
            + '<div style="margin-top:4px;font-size:11px">المساحة: <b dir="ltr">' + icChainage(ic.frac) + '</b></div></div>' });
        m.addListener('click', function () { iw.open(rrMap, m); });
        _icMarkers.push(m);
    });
    var host = document.getElementById('ringroad-map');
    if (host && host.parentNode) {
        var d = document.createElement('div');
        d.id = 'case-legend';
        d.style.cssText = 'position:absolute;bottom:10px;left:10px;z-index:20;background:rgba(15,23,42,.88);color:#e2e8f0;padding:8px 12px;border-radius:10px;font-size:11px;line-height:1.7;direction:rtl';
        d.innerHTML = '<div><span style="display:inline-block;width:18px;height:4px;background:#06b6d4;border-radius:2px;vertical-align:middle;margin-left:6px"></span> المسار المساحي الرئيسي</div>'
            + '<div><span style="display:inline-block;width:18px;height:4px;background:#64748b;border-radius:2px;vertical-align:middle;margin-left:6px"></span> الاتجاه المعاكس</div>'
            + '<div><span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:50%;vertical-align:middle;margin-left:6px"></span> نقطة سوداء / تصادمي</div>'
            + '<div><span style="display:inline-block;width:10px;height:10px;background:#34d399;border-radius:50%;vertical-align:middle;margin-left:6px"></span> السيناريو B — الحارة الذكية</div>'
            + '<div style="margin-top:2px;color:#94a3b8">①-⑦ التقاطعات — اضغط للتفاصيل</div>';
        host.parentNode.style.position = 'relative';
        host.parentNode.appendChild(d);
    }
}

// ─── 10. REALISTIC TRAFFIC MOVEMENT ───
var TYPE_SPEED = { microbus: [38, 52], tuktuk: [28, 40], mlaiky: [35, 50], noss_naql: [45, 60],
                   rob_naql: [48, 62], naql_taqeel: [50, 65], motorcycle: [55, 75], bicycle: [15, 22],
                   sedan: [70, 95], suv: [70, 95], truck: [55, 70], bus: [50, 65], taxi: [60, 85],
                   luxury: [80, 100], av: [85, 105] };
function pathLengths(path) {
    if (path._cum) return path._cum;
    var cum = [0];
    for (var i = 1; i < path.length; i++) {
        var dx = (path[i].lng - path[i - 1].lng) * 93000 * Math.cos(path[i].lat * Math.PI / 180);
        var dy = (path[i].lat - path[i - 1].lat) * 111000;
        cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    path._cum = cum; return cum;
}
function pointAtDist(path, dist) {
    var cum = pathLengths(path), L = cum[cum.length - 1];
    dist = ((dist % L) + L) % L;
    var lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= dist) lo = mid; else hi = mid; }
    var t = (dist - cum[lo]) / Math.max(0.001, cum[hi] - cum[lo]);
    return { lat: path[lo].lat + (path[hi].lat - path[lo].lat) * t,
             lng: path[lo].lng + (path[hi].lng - path[lo].lng) * t,
             hdg: Math.atan2(path[hi].lat - path[lo].lat, path[hi].lng - path[lo].lng) };
}
function targetSpeed(v, mprFrac) {
    var band = TYPE_SPEED[v.type] || [60, 85];
    var base = band[0] + (band[1] - band[0]) * v.rng;
    var lift = mprFrac * 18;
    return (base + lift * (v.dir === 'B' ? 1 : 0.6)) / 3.6;
}
Object.assign(RingRoadOverlay.prototype, {
    initVehicles: function () {
        this.vehicles_ = [];
        var cor = CORRIDORS[currentCorridor] || CORRIDORS.egypt;
        var types = cor.vehicleTypes;
        var nA = 10 + Math.round(rrMPR / 12);
        for (var i = 0; i < nA; i++) {
            var ty = types[i % types.length];
            this.vehicles_.push({ dir: 'A', dist: Math.random() * 20014, spd: 15, type: ty,
                rng: Math.random(), weave: (ty === 'microbus' || ty === 'tuktuk'),
                phase: Math.random() * 6.28, dwell: 0 });
        }
        var nB = 7 + Math.round(rrMPR / 14);
        for (var j = 0; j < nB; j++) {
            this.vehicles_.push({ dir: 'B', dist: Math.random() * 20014, spd: 22,
                type: (rrScenario === 'B' ? 'av' : 'sedan'), rng: Math.random(),
                weave: false, phase: Math.random() * 6.28, dwell: 0 });
        }
    },
    tick: function (dt) {
        var B = (rrScenario === 'B'), mprFrac = rrMPR / 100, TL = 6;
        var vs = this.vehicles_;
        vs.forEach(function (v) {
            if (v.dwell > 0) { v.dwell -= dt; return; }
            var tv = targetSpeed(v, mprFrac);
            if (!B && v.weave) tv *= (0.55 + 0.25 * Math.sin(v.phase));
            if (B && v.type === 'av') tv *= 1.05;
            v.spd += (tv - v.spd) * Math.min(1, dt * 0.8);
            if (currentCorridor === 'egypt' && v.weave) {
                for (var k = 0; k < BLACKSPOTS.length; k++) {
                    var bk = BLACKSPOTS[k];
                    if (bk._d == null) bk._d = (bk.frac == null ? [0.33, 0.45, 0.80, 0.38][k % 4] : bk.frac) * 20014;
                    if (Math.abs(v.dist - bk._d) < 90 && Math.random() < 0.010) { v.dwell = 1.6 + Math.random() * 1.2; break; }
                }
            }
            v.dist += v.spd * dt * TL;
        });
        ['A', 'B'].forEach(function (dir) {
            var lane = vs.filter(function (v) { return v.dir === dir; })
                         .sort(function (x, y) { return x.dist - y.dist; });
            for (var i = 1; i < lane.length; i++) {
                var gap = lane[i].dist - lane[i - 1].dist;
                var mg = (B && lane[i].type === 'av') ? 14 : 22;
                if (gap < mg) { lane[i].dist = lane[i - 1].dist + mg; lane[i].spd = Math.min(lane[i].spd, lane[i - 1].spd); }
            }
            if (lane.length > 1) {
                var gw = (lane[0].dist + 20014) - lane[lane.length - 1].dist;
                if (gw < mg2(lane)) lane[0].dist = lane[lane.length - 1].dist + mg2(lane) - 20014;
            }
            function mg2(ln2) { return (B && ln2[0] && ln2[0].type === 'av') ? 14 : 22; }
        });
    },
    drawVehicles: function () {
        if (!this.canvas_ || !this.proj_) return;
        var c = this.canvas_.getContext('2d');
        c.clearRect(0, 0, this.canvas_.width, this.canvas_.height);
        var proj = this.proj_, B = (rrScenario === 'B');
        var useReal = currentCorridor === 'egypt' && RING_CENTERLINE_REAL.length > 50;
        var cor = CORRIDORS[currentCorridor] || CORRIDORS.egypt;
        var pathA = useReal ? RING_CENTERLINE_REAL.map(function (p) { return { lat: p[0], lng: p[1] }; }) : cor.coords;
        var pathB = (rrSnappedPathB && rrSnappedPathB.length > 2) ? rrSnappedPathB
                  : (useReal ? RING_CENTERLINE_REAL.map(function (p) { return { lat: p[0] - 0.00035, lng: p[1] - 0.00035 }; })
                             : offsetPath(cor.coords, 0.006, 0.006));
        this.vehicles_.forEach(function (v) {
            var pt = pointAtDist(v.dir === 'B' ? pathB : pathA, v.dist);
            var px = proj.fromLatLngToDivPixel(new google.maps.LatLng(pt.lat, pt.lng));
            if (!px) return;
            var isAV = (B && v.dir === 'B') || v.type === 'av';
            var w = 13, hh = 6.5;
            if (v.type === 'bus' || v.type === 'naql_taqeel') { w = 17; hh = 8; }
            if (v.type === 'tuktuk' || v.type === 'bicycle') { w = 9; hh = 5; }
            c.save(); c.translate(px.x, px.y); c.rotate(-pt.hdg);
            c.fillStyle = isAV ? '#34d399'
                        : v.type === 'microbus' ? '#ef4444'
                        : v.type === 'tuktuk' ? '#f59e0b'
                        : (v.type === 'naql_taqeel' || v.type === 'truck') ? '#94a3b8' : '#60a5fa';
            if (v.dwell > 0) c.globalAlpha = 0.45;
            c.fillRect(-w / 2, -hh / 2, w, hh);
            c.fillStyle = 'rgba(15,23,42,.85)';
            c.fillRect(w * 0.12, -hh / 2 + 1, 2.5, hh - 2);
            if (v.dwell > 0) {
                c.globalAlpha = 1;
                c.fillStyle = Math.floor(Date.now() / 250) % 2 ? '#fbbf24' : 'transparent';
                c.fillRect(-w / 2, -hh / 2 - 3, 3, 2); c.fillRect(w / 2 - 3, hh / 2 + 1, 3, 2);
            }
            c.restore();
        });
    }
});
function respacePlatoon() {
    if (!rrOverlay || !rrOverlay.vehicles_) return;
    var avs = rrOverlay.vehicles_.filter(function (v) { return v.dir === 'B'; });
    avs.forEach(function (v, idx) { v.dist = idx * 260; v.spd = 24; v.weave = false; v.dwell = 0; });
}

// ─── 11. CORRIDOR COMPARE ENGINE ───
var cmpMaps = { A: null, B: null };
var cmpState = { A: { poly: null, markers: [] }, B: { poly: null, markers: [] } };
var cmpSel = { A: 'egypt', B: 'ksa' };
var cmpInited = false;
function cmpDraw(side) {
    var key = cmpSel[side], cor = CORRIDORS[key], st = cmpState[side];
    if (st.poly) { st.poly.setMap(null); st.poly = null; }
    st.markers.forEach(function (m) { m.setMap(null); }); st.markers = [];
    st.poly = new google.maps.Polyline({ path: cor.coords, geodesic: true,
        strokeColor: ringRoadColorForMPR(rrMPR), strokeWeight: 6, map: cmpMaps[side] });
    cor.markers.forEach(function (mk) {
        st.markers.push(new google.maps.Marker({ position: mk.pos, map: cmpMaps[side], title: t(mk.t) }));
    });
    var sl = document.getElementById('cmp-speed-' + side.toLowerCase());
    if (sl) sl.textContent = fmtKmh(cor.road.speedLimit);
    var cap = document.getElementById('cmp-cap-' + side.toLowerCase());
    if (cap) cap.textContent = capacityAtMPR(rrMPR) + ' v/h/l';
    var av = document.getElementById('cmp-av-' + side.toLowerCase());
    if (av) { try { av.textContent = Math.round((COUNTRY_DATA[key].fleet.av || 0) * 100) + '%'; } catch (e) {} }
}
function setCmpSide(side, val) { cmpSel[side] = val; cmpDraw(side); }
function initCompareMaps() {
    if (cmpInited || typeof google === 'undefined' || !google.maps) return;
    cmpInited = true;
    ['A', 'B'].forEach(function (side) {
        var el = document.getElementById('cmp-map-' + side.toLowerCase());
        if (!el) return;
        cmpMaps[side] = new google.maps.Map(el, { center: { lat: 25, lng: 45 }, zoom: 4,
            styles: [{ elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
                     { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
                     { featureType: 'water', stylers: [{ color: '#0f172a' }] }],
            zoomControl: true });
        new google.maps.TrafficLayer().setMap(cmpMaps[side]);
    });
    cmpDraw('A'); cmpDraw('B');
}
function refreshCompareColors(mpr) {
    ['A', 'B'].forEach(function (s) {
        if (cmpState[s].poly) cmpState[s].poly.setOptions({ strokeColor: ringRoadColorForMPR(mpr) });
        var capEl = document.getElementById('cmp-cap-' + s.toLowerCase());
        if (capEl) capEl.textContent = capacityAtMPR(mpr) + ' v/h/l';
    });
}
document.addEventListener('DOMContentLoaded', function () {
    renderKPI(); renderFeatures(''); renderTravelTimes(); renderBlackSpots(); renderCounts();
    var inp = document.getElementById('feat-search');
    if (inp) inp.addEventListener('input', function () { renderFeatures(this.value); });
    var sec = document.getElementById('compare-section');
    if (sec && 'IntersectionObserver' in window) {
        var seen = false;
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting && !seen) { seen = true; initCompareMaps(); io.disconnect(); }
            });
        }, { rootMargin: '300px' });
        io.observe(sec);
    }
    var mpr = document.getElementById('mpr-slider');
    if (mpr) mpr.addEventListener('input', function () {
        refreshCompareColors(parseInt(this.value, 10));
    });
});

function exportFleetCSV() {
    var rows = [];
    rows.push('SAE AutoSim Hub - Fleet Calibration Export');
    rows.push('Country,' + currentCorridor);
    rows.push('MPR %,' + rrMPR);
    rows.push('Scenario,' + (rrScenario === 'B' ? 'B-ManagedAV' : 'A-Baseline'));
    rows.push('Generated,' + new Date().toISOString());
    rows.push('');
    rows.push('vehicle_type,fleet_share,reaction_factor,safety_index,accel,decel,sigma');
    var cd = (typeof COUNTRY_DATA !== 'undefined' && COUNTRY_DATA[currentCountry]) ? COUNTRY_DATA[currentCountry] : null;
    var P = (typeof PHYS !== 'undefined') ? PHYS : { reaction:{}, safety:{}, accel:{}, decel:{}, sigma:{} };
    if (cd && cd.fleet) {
        Object.keys(cd.fleet).forEach(function (k) {
            rows.push([k, (cd.fleet[k] * 100).toFixed(1) + '%',
                P.reaction[k] != null ? P.reaction[k] : '',
                P.safety[k] != null ? P.safety[k] : '',
                P.accel[k] != null ? P.accel[k] : '',
                P.decel[k] != null ? P.decel[k] : '',
                P.sigma[k] != null ? P.sigma[k] : ''].join(','));
        });
    }
    if (typeof computeWeightedFleet === 'function') {
        var w = computeWeightedFleet(rrMPR).weighted;
        rows.push('');
        rows.push('WEIGHTED (Wiedemann/Krauss composite)');
        rows.push('tau,' + w.tau.toFixed(3));
        rows.push('safety,' + w.safety.toFixed(3));
        rows.push('accel,' + w.accel.toFixed(3));
        rows.push('decel,' + w.decel.toFixed(3));
        rows.push('sigma,' + w.sigma.toFixed(3));
        if (w.gap != null) rows.push('gap,' + w.gap.toFixed(3));
    }
    _dl('sae_fleet_' + currentCountry + '_mpr' + rrMPR + '.csv', rows.join('\n'));
}
