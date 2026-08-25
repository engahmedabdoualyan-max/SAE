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
