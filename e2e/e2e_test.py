#!/usr/bin/env python3
"""End-to-end regression suite for SAE AutoSim Hub.

Runs a real Chromium browser against a live stack (docker compose) and
verifies the three critical journeys:

  P1  Page integrity      — all advanced sections injected, nav bar present,
                            zero application console errors.
  P2  In-browser IDM sim  — advanced mode spawns vehicles, KPI cards fill,
                            physics-backed analysis tabs populate.
  P3  Cloud SUMO pipeline — draw network → login → upload → scenario →
                            queued run → WebSocket progress → real SUMO KPIs.

Environment:
    BASE_URL   target origin            (default http://localhost)
    CLOUD_USER demo account email       (default demo@sae.local)
    CLOUD_PASS demo account password    (default demo1234)

Artifacts: screenshots of each phase land in e2e/artifacts/.
Exit code 0 only when every phase passes.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost").rstrip("/")
CLOUD_USER = os.environ.get("CLOUD_USER", "demo@sae.local")
CLOUD_PASS = os.environ.get("CLOUD_PASS", "demo1234")
CHROMIUM_PATH = os.environ.get("CHROMIUM_PATH", "").strip() or None
ARTIFACTS = Path(__file__).parent / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

SECTIONS = [
    "network-editor", "signal-editor", "calibration-section",
    "advanced-analysis", "scenario-manager", "cloud-run", "reports-section",
]


class Result:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        self.checks += 1
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}" + (f" — {detail}" if detail and not ok else ""))
        if not ok:
            self.failures.append(name)


def app_errors(errors: list[str]) -> list[str]:
    """Filter third-party noise (cloudflare beacon + bare net failures)."""
    out = []
    for e in errors:
        low = e.lower()
        if "cloudflareinsights" in low:
            continue
        if "net::err_failed" in low:
            continue  # bare resource-load noise from blocked beacons
        out.append(e)
    return out


def phase1_page(page, res: Result) -> None:
    print("── Phase 1: page integrity")
    resp = page.goto(BASE_URL + "/", wait_until="domcontentloaded", timeout=60_000)
    res.check("HTTP 200", bool(resp and resp.status == 200), f"got {resp.status if resp else '?'}")
    page.wait_for_timeout(2500)

    missing = [s for s in SECTIONS if not page.evaluate(f"!!document.getElementById('{s}')")]
    res.check("all advanced sections injected", not missing, f"missing: {missing}")

    nav_btns = page.evaluate("() => document.querySelectorAll('.sae-subnav-btn').length")
    res.check("sub-navigation bar rendered", nav_btns >= len(SECTIONS), f"buttons={nav_btns}")


def phase2_local_sim(page, res: Result) -> None:
    print("── Phase 2: in-browser IDM simulation")
    page.evaluate("() => { document.getElementById('sim-mode-toggle')?.click(); }")
    page.wait_for_timeout(200)
    page.evaluate("() => window.runAdvancedSim && window.runAdvancedSim()")
    page.wait_for_timeout(100)
    tick = page.evaluate("() => { try { window.SAE_Sim.tick(240); return 'ok'; } catch (e) { return 'ERR:' + e.message } }")
    res.check("deterministic tick executed", tick == "ok", tick)

    kpis = page.evaluate("""() => ({
        vehs: parseInt(document.getElementById('adv-vehs')?.textContent || '0', 10),
        speed: parseFloat(document.getElementById('adv-speed')?.textContent || '0'),
        los: document.getElementById('adv-los')?.textContent,
    })""")
    res.check("vehicles spawned", kpis["vehs"] > 0, str(kpis))
    res.check("avg speed > 0", kpis["speed"] > 0, str(kpis))
    res.check("LOS letter assigned", kpis["los"] in list("ABCDEF"), str(kpis))

    co2 = page.evaluate("""() => {
        window.SAE_Analysis.showTab('emissions');
        const m = document.getElementById('aa-emissions').innerText.match(/(\\d+)CO₂/i);
        return m ? parseInt(m[1], 10) : 0;
    }""")
    res.check("emissions analysis populated (CO₂ > 0)", co2 > 0, f"co2={co2}")
    page.screenshot(path=str(ARTIFACTS / "phase2_sim.png"))


def phase2b_lab(page, res: Result) -> None:
    print("── Phase 2b: simulation lab")
    loaded = page.evaluate("""() => {
        const sel = document.getElementById('lab-template');
        if (!sel) return 'no-section';
        sel.value = 'signal_arterial';
        const cfg = window.SAE_Lab.loadTemplate();
        window.SAE_Sim.tick(400);
        return { cfg: !!cfg, phase: window.SAE_Sim.getSignalPhase(),
                 dets: window.SAE_Sim.getDetectorStats(),
                 ts: window.SAE_Sim.getTSData().length,
                 fd: window.SAE_Sim.getFDData().length };
    }""")
    res.check("template applied with active signal", bool(loaded.get("cfg")) and loaded.get("phase") in ("green", "yellow", "red"), str(loaded)[:120])
    dets = loaded.get("dets", [])
    res.check("loop detectors produced bins", len(dets) == 2 and all(d["bins"] > 0 for d in dets), str(dets)[:100])
    res.check("harmonic-mean speeds plausible (≥5 km/h)", all(d["hmean"] >= 5 for d in dets), str([d["hmean"] for d in dets]))
    res.check("time-space recorder streaming", loaded.get("ts", 0) > 3, f"frames={loaded.get('ts')}")
    res.check("fundamental diagram sampling", loaded.get("fd", 0) > 10, f"pts={loaded.get('fd')}")

    slider = page.evaluate("""() => {
        document.getElementById('lab-sl-v0').value = 12;
        document.getElementById('lab-val-v0').textContent = '12';
        window.SAE_Lab.applySliders();
        const vs = window.SAE_Sim.getVehicles();
        return { appliedMaxV0: Math.max(...vs.map(v => v.idm.v0)) };
    }""")
    res.check("live IDM slider reaches engine", slider["appliedMaxV0"] <= 12.001, str(slider))
    page.evaluate("() => window.SAE_Lab._tick()")
    painted = page.evaluate("""() => {
        const c = document.getElementById('lab-ts');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 396) if (d[i] > 0) n++;
        return n;
    }""")
    res.check("time-space canvas painted", painted > 50, f"samples={painted}")


def phase2c_determinism_mix_calib(page, res: Result) -> None:
    print("── Phase 2c: determinism · green wave · fleet mix · real calibration")

    det = page.evaluate("""() => {
        window.SAE_Sim.restart(777);
        window.SAE_Sim.tick(250);
        const a = window.SAE_Sim.getVehicles().length;
        window.SAE_Sim.restart(777);
        window.SAE_Sim.tick(250);
        return { a, b: window.SAE_Sim.getVehicles().length };
    }""")
    res.check("seeded restart is deterministic", det["a"] == det["b"] and det["a"] > 0, str(det))

    gw = page.evaluate("""() => {
        document.getElementById('lab-template').value = 'green_wave';
        const cfg = window.SAE_Lab.loadTemplate();
        window.SAE_Sim.tick(300);
        const seen = new Set();
        for (let i = 0; i < 300; i++) {
            window.SAE_Sim.tick(3);
            (window.SAE_Sim.getSignalPhase() || '').split(',').forEach(p => seen.add(p));
        }
        return { n: cfg ? cfg.signals : 0, phases: [...seen].filter(Boolean) };
    }""")
    res.check("green wave runs ≥3 coordinated signals", gw["n"] >= 3, str(gw))
    res.check("coordinated signals cycle phases", len(gw["phases"]) >= 2, str(gw["phases"]))

    mix = page.evaluate("""() => {
        document.getElementById('lab-template').value = 'ring';
        window.SAE_Lab.loadTemplate();
        document.getElementById('lab-sl-heavy').value = '45';
        document.getElementById('lab-val-heavy').textContent = '45';
        window.SAE_Lab.setHeavy(45);
        window.SAE_Sim.restart(9001);
        window.SAE_Sim.tick(700);
        return window.SAE_Sim.getSpawnMix();
    }""")
    res.check("heavy-mix slider reaches ~45% of spawned human fleet (±15)",
              mix["human"] > 50 and 30 <= mix["heavyPct"] <= 60, str(mix))

    page.evaluate("""() => {
        SAE_Calibration._data = [{edgeId: 'D1', observedFlow: 850}];
        SAE_Calibration.run();
    }""")
    geh = None
    for _ in range(40):
        page.wait_for_timeout(500)
        if page.evaluate("() => !!document.querySelector('#cal-results button')"):
            import re
            txt = page.evaluate("() => document.getElementById('cal-results').innerText")
            m = re.search(r"GEH Score\s*([\d.]+)", txt)
            geh = float(m.group(1)) if m else None
            break
    res.check("engine-driven calibration completes with finite GEH",
              geh is not None and 0 < geh < 200, f"geh={geh}")
    page.evaluate("() => SAE_Calibration.applyParams()")
    stored = page.evaluate("() => !!(window.__saeIdmOverrides && window.__saeIdmOverrides.v0)")
    res.check("calibration Apply persists IDM overrides", stored)

    spark = page.evaluate("""() => {
        window.SAE_Sim.loadTemplate('signal_arterial');
        window.SAE_Sim.tick(600);
        window.SAE_Lab._tick();
        const c = document.getElementById('lab-spark-1');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 40) if (d[i] > 0) n++;
        return n;
    }""")
    res.check("detector sparkline painted", spark > 50, f"samples={spark}")


def phase2d_osm_share_adaptive(page, res: Result) -> None:
    print("── Phase 2d: OSM import · share link · adaptive signals · snapshot")

    osm = page.evaluate("""async () => {
        const ed = window.__saeRealEditor;
        if (!ed) return 'no-editor';
        const txt = await fetch('/assets/fixtures/mini.osm').then(r => r.text());
        const net = await ed.import(txt, 'osm');
        const j = net.toJSON ? net.toJSON() : net;
        return { nodes: (j.nodes || []).length, edges: (j.edges || []).length,
                 names: [...new Set((j.edges || []).map(e => e.name))].filter(Boolean) };
    }""")
    res.check("OSM fixture imports through editor", isinstance(osm, dict) and osm.get("nodes", 0) >= 4 and osm.get("edges", 0) >= 3, str(osm)[:140])
    res.check("OSM way names preserved ('Ring Road')",
              isinstance(osm, dict) and "Ring Road" in (osm.get("names") or []), str(osm.get("names"))[:80])

    adaptive = page.evaluate("""() => {
        const run = (adaptive) => {
            window.SAE_Sim.setSignalAdaptive(adaptive);
            window.SAE_Sim.restart(4242);
            let red = 0;
            for (let i = 0; i < 900; i++) {
                if ((window.SAE_Sim.getSignalPhase() || '').includes('red')) red++;
                window.SAE_Sim.tick(1);
            }
            const st = window.SAE_Sim.getDetectorStats() || [];
            const rate = st.length
                ? st.reduce((a, d) => a + (d.totalRateVehH || 0), 0) / st.length
                : 0;
            return { red, rate: Math.round(rate) };
        };
        const fixed = run(false);
        const adap = run(true);
        return { fixed, adap };
    }""")
    res.check("adaptive signals keep throughput (≥90%, non-inferior)",
              adaptive["adap"]["rate"] >= adaptive["fixed"]["rate"] * 0.90,
              str(adaptive))
    res.check("adaptive mode actually alters signal timing",
              adaptive["adap"]["red"] != adaptive["fixed"]["red"], str(adaptive))

    share = page.evaluate("""() => {
        document.getElementById('lab-sl-v0').value = 13.5;
        document.getElementById('lab-val-v0').textContent = '13.5';
        document.getElementById('lab-sl-heavy').value = '35';
        document.getElementById('lab-val-heavy').textContent = '35';
        document.getElementById('lab-adaptive').checked = true;
        const h1 = window.SAE_Lab.buildShareHash();
        // scramble state, then re-apply from hash
        document.getElementById('lab-sl-v0').value = 30;
        document.getElementById('lab-adaptive').checked = false;
        window.SAE_Lab.applyShareHash(h1);
        return {
            v0: parseFloat(document.getElementById('lab-sl-v0').value),
            hv: document.getElementById('lab-val-heavy').textContent,
            ad: document.getElementById('lab-adaptive').checked,
            engineV0: Math.max(...window.SAE_Sim.getVehicles().map(v => v.idm.v0)),
        };
    }""")
    res.check("share-hash roundtrip restores lab state",
              abs(share["v0"] - 13.5) < 0.01 and share["hv"] == "35"
              and share["ad"] is True and share["engineV0"] <= 13.51, str(share))

    try:
        with page.expect_download(timeout=15000) as dl_info:
            page.evaluate("() => window.SAE_Lab.snapshot()")
        fname = dl_info.value.suggested_filename
        res.check("canvas snapshot downloads PNG", fname.endswith(".png"), fname)
    except Exception as exc:  # noqa: BLE001
        res.check("canvas snapshot downloads PNG", False, repr(exc)[:120])


def phase3_cloud_sumo(page, res: Result) -> None:
    print("── Phase 3: cloud SUMO pipeline")
    # Draw a deterministic network through the real editor API.
    drawn = page.evaluate("""() => {
        const ed = window.__saeRealEditor;
        if (!ed) return 'no-editor';
        try {
            ed.addJunction({lat: 30.0444, lng: 31.2357});
            ed.addJunction({lat: 30.0500, lng: 31.2430});
            ed.addJunction({lat: 30.0560, lng: 31.2500});
            ed.addRoad({lat: 30.0444, lng: 31.2357}, {lat: 30.0500, lng: 31.2430}, {lanes: 3, speedLimit: 22});
            ed.addRoad({lat: 30.0500, lng: 31.2430}, {lat: 30.0560, lng: 31.2500}, {lanes: 2, speedLimit: 20});
            return 'ok';
        } catch (e) { return 'ERR:' + e.message }
    }""")
    res.check("editor network drawn", drawn == "ok", drawn)

    logged = page.evaluate("() => window.SAE_Cloud.login()")
    page.wait_for_timeout(800)
    auth_state = page.evaluate("() => document.getElementById('cl-status')?.textContent || ''")
    res.check("cloud login authenticated", "Authenticated" in auth_state, auth_state)

    page.evaluate("""() => {
        document.getElementById('cl-duration').value = 180;
        window.SAE_Cloud.run();
    }""")

    steps_text, results_text = "", ""
    deadline = time.time() + 120
    while time.time() < deadline:
        page.wait_for_timeout(1000)
        steps_text = page.evaluate(
            "() => [...document.querySelectorAll('#cl-steps div')].map(d => d.textContent.trim()).join(',')")
        done = page.evaluate("() => !!document.querySelector('#cl-results table')")
        if done:
            results_text = page.evaluate("() => document.getElementById('cl-results').innerText.replace(/\\n/g, ' ')")
            break

    res.check("pipeline reached results table", bool(results_text),
              f"last steps: {steps_text}")
    res.check("all seven steps succeeded",
              all(marker in steps_text for marker in ["✓ auth", "✓ project", "✓ network",
                                                      "✓ scenario", "✓ queued", "✓ stream", "✓ results"]),
              steps_text)
    engine_sumo = "enginesumo" in results_text.replace(" ", "").lower()
    res.check("executed by real SUMO engine", engine_sumo, results_text[:160])

    def num(key: str) -> float:
        import re
        pattern = r"(?<![a-z_])" + key + r"([\d.]+)"
        m = re.search(pattern, results_text.replace(" ", ""))
        return float(m.group(1)) if m else 0.0

    arrived = int(num("arrived_vehicles"))
    route_m = num("avg_route_length_m")
    res.check("vehicles arrived at destination", arrived >= 1, f"arrived={arrived}")
    res.check("trips have substantive length (≥200 m)", route_m >= 200, f"route={route_m} m")
    progress = page.evaluate("() => document.getElementById('cl-progress')?.style.width || ''")
    res.check("progress reached 100%", progress.strip() == "100%", progress)

    # Post-run artifacts: PDF report + trajectories downloads wired to sim id.
    btns = page.evaluate("""() => ({
        pdf: !!document.querySelector('#cl-results button[onclick*="report"]'),
        traj: !!document.querySelector('#cl-results button[onclick*="trajectories"]'),
    })""")
    res.check("download action buttons rendered", btns["pdf"] and btns["traj"], str(btns))
    try:
        with page.expect_download(timeout=15000) as dl_info:
            page.evaluate("() => window.SAE_Cloud.download('report')")
        fname = dl_info.value.suggested_filename
        res.check("PDF report downloads", fname.endswith(".pdf"), fname)
    except Exception as exc:  # noqa: BLE001
        res.check("PDF report downloads", False, repr(exc)[:120])
    duration_s = num("duration_s")
    res.check("FCD timestamps fixed (duration_s ≈ horizon)", 100 <= duration_s <= 200,
              f"duration_s={duration_s}")
    page.screenshot(path=str(ARTIFACTS / "phase3_cloud.png"))


def main() -> int:
    res = Result()
    with sync_playwright() as p:
        launch_kwargs: dict = {"args": ["--no-sandbox"]}
        if CHROMIUM_PATH:
            launch_kwargs["executable_path"] = CHROMIUM_PATH
        try:
            browser = p.chromium.launch(**launch_kwargs)
        except Exception:
            # Fall back to any full-chromium build present in the cache.
            import glob
            candidates = sorted(glob.glob(os.path.expanduser(
                "~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
            if not candidates:
                raise
            browser = p.chromium.launch(executable_path=candidates[-1], **launch_kwargs)
        ctx = browser.new_context(service_workers="block")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        try:
            phase1_page(page, res)
            phase2_local_sim(page, res)
            phase2b_lab(page, res)
            phase2c_determinism_mix_calib(page, res)
            phase2d_osm_share_adaptive(page, res)
            phase3_cloud_sumo(page, res)
        except Exception as exc:  # noqa: BLE001 — report and screenshot
            res.check("suite completed without crash", False, repr(exc)[:300])
            try:
                page.screenshot(path=str(ARTIFACTS / "crash.png"))
            except Exception:  # noqa: BLE001
                pass
        finally:
            real_errors = app_errors(errors)
            res.check("zero application console errors", not real_errors,
                      "; ".join(real_errors[:3]))
            browser.close()

    print(f"\n════════ {res.checks - len(res.failures)}/{res.checks} checks passed ════════")
    if res.failures:
        print("FAILED:", ", ".join(res.failures))
        return 1
    print("E2E SUITE GREEN ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
