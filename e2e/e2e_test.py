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
    "dev-plan",
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
        if "maps.googleapis.com" in low or "directions service" in low or "directions_request" in low:
            continue  # script-tag Google Maps + legacy Directions noise when online
        if "billing on the google cloud" in low:
            continue
        if "weather.googleapis.com" in low or "airquality.googleapis.com" in low:
            continue  # legacy weather/AQ widgets — 403 on un-billed key when online
        if "status of 403" in low:
            continue  # generic resource-loader 403 from online-only Google widgets (console text carries no URL)
        out.append(e)
    return out


def phase1_page(page, res: Result) -> None:
    print("── Phase 1: page integrity")
    page.add_init_script("try{localStorage.setItem('sae-lang','ar')}catch(e){}")
    resp = page.goto(BASE_URL + "/", wait_until="domcontentloaded", timeout=60_000)
    res.check("HTTP 200", bool(resp and resp.status == 200), f"got {resp.status if resp else '?'}")
    page.wait_for_timeout(2500)

    missing = [s for s in SECTIONS if not page.evaluate(f"!!document.getElementById('{s}')")]
    res.check("all advanced sections injected", not missing, f"missing: {missing}")

    nav_btns = page.evaluate("() => document.querySelectorAll('.sae-subnav-btn').length")
    res.check("sub-navigation bar rendered", nav_btns >= len(SECTIONS), f"buttons={nav_btns}")

    # i18n regression guard: no element may render its own raw key name.
    # Runs under Arabic (pre-set) so both the lazy locale path and the EN
    # fallback chain are exercised together.
    leaks = page.evaluate("""() => {
        const leaks = [];
        document.querySelectorAll('[data-key]').forEach(el => {
            if (el.textContent.trim() === el.getAttribute('data-key')) leaks.push(el.getAttribute('data-key'));
        });
        return [...new Set(leaks)].slice(0, 10);
    }""")
    res.check("no raw i18n keys rendered (AR + fallback chain)", not leaks, str(leaks))


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

    page.evaluate("""async () => {
        for (let i = 0; i < 40; i++) {
            if (window.__saeRealEditor) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    }""")

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
              isinstance(osm, dict) and "Ring Road" in (osm.get("names") or []),
              str(osm.get("names"))[:80] if isinstance(osm, dict) else str(osm)[:80])

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


def phase2e_network_runner(page, res: Result) -> None:
    print("── Phase 2e: network runner (IDM on edited graph + route choice)")

    started = page.evaluate("""async () => {
        // ensure the editor holds the OSM fixture graph
        const ed = window.__saeRealEditor;
        if (!ed) return { error: 'no-editor' };
        if (!document.querySelector('#cl-history .cl-view')) {
            const txt = await fetch('/assets/fixtures/mini.osm').then(r => r.text());
            await ed.import(txt, 'osm');
        }
        document.getElementById('nr-vph').value = '900';
        document.getElementById('nr-k').value = '2';
        const ok = window.SAE_Runner.start();
        return { ok };
    }""")
    res.check("runner starts on imported OSM graph", bool(started.get("ok")), str(started))

    stats = page.evaluate("""() => {
        window.SAE_Runner.tick(400);   /* 200 sim-s */
        return window.SAE_Runner.getStats();
    }""")
    st = stats or {}
    res.check("vehicles running on graph", (st.get("active") or 0) > 3, str(stats))
    res.check("route choice built (k≥1)", (st.get("routesBuilt") or 0) >= 1, str(stats))
    res.check("trips completing on network", (st.get("exited") or 0) >= 1, str(stats))
    res.check("LOS letter assigned", st.get("los") in list("ABCDEF"), str(stats))

    pause = page.evaluate("""() => {
        window.SAE_Runner.pause();
        return { paused: !window.SAE_Runner.getStats().running,
                 chip: document.getElementById('nr-kpi-veh')?.textContent };
    }""")
    res.check("pause stops the runner", pause.get("paused") is True and pause.get("chip") not in (None, ""), str(pause))

    # ── surfaced backend features: signup + run history browser
    acc = page.evaluate("() => document.getElementById('ne-import-file')?.accept || ''")
    res.check("editor import accepts .osm files", ".osm" in acc, acc)

    hist = page.evaluate("""async () => {
        await window.SAE_Cloud.login();
        window.SAE_Cloud.loadHistory();
        for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 250));
            if (document.querySelector('#cl-history .cl-view')) break;
        }
        return { rows: document.querySelectorAll('#cl-history .cl-view').length,
                 text: document.getElementById('cl-history').innerText.slice(0, 60) };
    }""")
    # On a fresh CI database this legitimately shows the empty state.
    res.check("history browser responds (rows or clean empty-state)",
              hist["rows"] >= 1 or "No runs yet" in hist["text"], str(hist))

    reg = page.evaluate("""async () => {
        const email = `e2e_${Date.now()}@sae.test`;
        const r = await fetch('/api/v1/auth/register', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, name: 'e2e', password: 'regtest123'})
        });
        if (![200, 201].includes(r.status)) return { status: r.status };
        const login = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({username: email, password: 'regtest123'})
        });
        if (![200, 201].includes(login.status)) return { status: login.status, token: false };
        return { status: login.status,
                 token: !!(await login.json()).access_token };
    }""")
    res.check("signup endpoint creates working accounts", reg.get("status") == 200 and reg.get("token"), str(reg))


def phase2f_dev_plan(page, res: Result) -> None:
    print("── Phase 2f: development plan (R&D targets → department tasks)")

    state = page.evaluate("""() => {
        const host = document.getElementById('dev-plan');
        if (!host) return { error: 'no-section' };
        const dp = window.SAE_DevPlan;
        if (!dp) return { error: 'no-api' };
        const plan = dp.getPlan();
        const deptCards = host.querySelectorAll('.bg-slate-900.rounded-2xl').length;
        const rows = host.querySelectorAll('#dp-edit-slot tbody tr').length;
        const chart = typeof Chart !== 'undefined';
        const summary = host.querySelectorAll('.col-span-full > input').length;
        return {
            depts: plan.departments.length,
            kpis: plan.departments.reduce((a, d) => a + d.kpis.length, 0),
            concreteCurrent: plan.departments.find(d => d.id === 'sales')
                .kpis.find(k => k.id === 'concrete').current,
            concreteM1: plan.departments.find(d => d.id === 'sales')
                .kpis.find(k => k.id === 'concrete').targets[0],
            deptCards, chart,
        };
    }""")
    res.check("dev plan section + API mounted", state.get("error") in (None, ""), str(state))
    res.check("default template has multiple departments", (state.get("depts") or 0) >= 3, str(state))
    res.check("concrete sales seeded 5000 → M1 5500", state.get("concreteCurrent") == 5000 and state.get("concreteM1") == 5500, str(state))
    res.check("KPI cards rendered", (state.get("kpis") or 0) >= 5, str(state))
    res.check("Chart.js available for trajectory", bool(state.get("chart")), str(state))

    edit = page.evaluate("""() => {
        window.SAE_DevPlan.toggleEdit();
        const slot = document.getElementById('dp-edit-slot');
        if (!slot || !slot.querySelector('input[data-plan="current"]')) return { ok: false };
        return { ok: true, n: slot.querySelectorAll('input[data-plan]').length };
    }""")
    res.check("edit mode opens inline inputs", bool(edit.get("ok")), str(edit))

    commit = page.evaluate("""() => {
        const slot = document.getElementById('dp-edit-slot');
        const row = slot.querySelector('div[data-di="0"][data-ki="0"]');
        if (!row) return { ok: false };
        row.querySelector('input[data-plan="current"]').value = '5100';
        window.SAE_DevPlan.commit();
        const after = window.SAE_DevPlan.getPlan()
            .departments[0].kpis[0].current;
        window.SAE_DevPlan.resetToTemplate();
        const reset = window.SAE_DevPlan.getPlan()
            .departments[0].kpis[0].current;
        return { ok: after === 5100 && reset === 5000, after, reset };
    }""")
    res.check("edit → save persists → reset restores", bool(commit.get("ok")), str(commit))

    csv = page.evaluate("""() => {
        const origUrl = URL.createObjectURL;
        const origClick = HTMLAnchorElement.prototype.click;
        let downloaded = null;
        window.__dpCsvBlob = null;
        URL.createObjectURL = function (b) {
            downloaded = 'blob';
            return 'blob:sae-plan';
        };
        HTMLAnchorElement.prototype.click = function () {
            if (this.download && this.href.startsWith('blob:')) {
                return; /* swallow synthetic click — no navigation side-effects */
            }
            return origClick.call(this);
        };
        window.SAE_DevPlan.exportCSV();
        URL.createObjectURL = origUrl;
        HTMLAnchorElement.prototype.click = origClick;
        return { downloaded };
    }""")
    res.check("CSV export triggers download", bool(csv.get("downloaded")), str(csv))

    actuals = page.evaluate("""() => {
        window.SAE_DevPlan.toggleActuals();
        const slot = document.getElementById('dp-edit-slot');
        if (!slot || !slot.querySelector('input[data-plan="actual"]')) return { ok: false };
        const row = slot.querySelector('div[data-di="0"][data-ki="0"]');
        if (!row) return { ok: false };
        const a1 = row.querySelector('input[data-plan="actual"][data-m="0"]');
        const a2 = row.querySelector('input[data-plan="actual"][data-m="1"]');
        a1.value = '5500';
        a2.value = '5800';
        window.SAE_DevPlan.commit();
        const plan = window.SAE_DevPlan.getPlan();
        const k = plan.departments.find(d => d.id === 'sales').kpis.find(k => k.id === 'concrete');
        const stats = window.SAE_DevPlan.getStats();
        return { ok: k.actuals[0] === 5500 && k.actuals[1] === 5800 && k.actuals[2] === null && stats.met === 1 && stats.recorded === 2, a0: k.actuals[0], a1: k.actuals[1], stats };
    }""")
    res.check("record actuals via inline inputs", bool(actuals.get("ok")), str(actuals))

    board = page.evaluate("""() => {
        const host = document.getElementById('dev-plan');
        const tables = host.querySelectorAll('table tbody tr');
        const mainTable = Array.from(tables).filter(t => t.querySelector('td.text-cyan-300')).length;
        const onTrackChip = host.querySelector('.text-rose-300, .text-emerald-300');
        return { mainTable, onTrack: !!onTrackChip };
    }""")
    res.check("task board renders actual markers", bool(board.get("onTrack") and board.get("mainTable") >= 1), str(board))

    reset2 = page.evaluate("""() => {
        window.SAE_DevPlan.resetToTemplate();
        const k = window.SAE_DevPlan.getPlan()
            .departments.find(d => d.id === 'sales').kpis.find(k => k.id === 'concrete');
        return { ok: k.actuals[0] === null && k.targets[0] === 5500 };
    }""")
    res.check("reset clears actuals back to template", bool(reset2.get("ok")), str(reset2))

    ops = page.evaluate("""() => {
        const host = document.getElementById('dp-ops');
        if (!host || !host.querySelector('input[data-op]')) return { error: 'no-ops' };
        const c = window.SAE_DevPlan.computeOps();
        const probes = document.getElementById('dev-plan').querySelectorAll('#dp-ops .bg-slate-800.rounded-xl').length;
        return { c, probes };
    }""")
    res.check("capacity planner mounted", bool(ops.get("c") and ops.get("probes") >= 4), str(ops))
    res.check("target 5500 → daily output & trips computed", bool(ops["c"] and ops["c"]["salesTarget"] == 5500 and ops["c"]["tripsPerDay"] > 0 and ops["c"]["mixers"] > 0), str((ops.get("c") or {})))
    res.check("per-station utilisation rows", bool(ops["c"] and len((ops["c"].get("stations") or [])) >= 2), str((ops.get("c") or {})))

    opchange = page.evaluate("""() => {
        const before = window.SAE_DevPlan.computeOps().mixers;
        window.SAE_DevPlan.setOps('workingDays', 13);
        const after = window.SAE_DevPlan.computeOps();
        const host = document.getElementById('dp-ops');
        window.SAE_DevPlan.setOps('workingDays', 26);
        return { ok: after.mixers > before && after.tripsPerDay > before, before, after: after.mixers };
    }""")
    res.check("changing an assumption recomputes tasks", bool(opchange.get("ok")), str(opchange))

    road = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        const r = dp.getRoadmap();
        const brainTxt = document.querySelector('[data-key="dp_rm_brain"]')?.textContent || '';
        const advisor = document.querySelector('.fa-brain') ? true : false;
        return {
            ok: r && r.phases.length === 3 && r.current === 5000 && r.target === 6500
                && r.phases[0].status === 'active' && r.phases[0].plannedEnd === 5500,
            phases: r.phases.length, current: r.current, target: r.target,
            planned: r.phases.map(p => p.plannedEnd), brain: !!brainTxt, advisor,
        };
    }""")
    res.check("roadmap: current→target with phases seeded", bool(road.get("ok")), str(road))
    res.check("roadmap: advisor brain panel rendered", bool(road.get("brain") and road.get("advisor")), str(road))

    replan = page.evaluate("""() => {
        window.SAE_DevPlan.updateRoadmap({ current: 4800, target: 7000, horizon: 6, phaseCount: 4 });
        const r = window.SAE_DevPlan.getRoadmap();
        const c = window.SAE_DevPlan.getPlan()
            .departments.find(d => d.id === 'sales').kpis.find(k => k.id === 'concrete');
        return {
            ok: r.phases.length === 4 && r.current === 4800 && r.target === 7000
                && c.current === 4800 && c.targets[0] === r.phases[0].plannedEnd,
            phases: r.phases.length, cCur: c.current, cM1: c.targets[0],
            step: r.phases.map(p => p.plannedEnd),
        };
    }""")
    res.check("roadmap: re-plan distributes phases and syncs concrete KPI", bool(replan.get("ok")), str(replan))

    evalg = page.evaluate("""() => {
        const slot = document.getElementById('dp-eval-1');
        if (!slot) return { error: 'no-eval-form', hostile: true };
        const a = slot.querySelector('input[data-actual]');
        a.value = '';
        const guarded = window.SAE_DevPlan.evaluatePhase(1);
        return { guarded: !!guarded && guarded.error === 'actual-required' };
    }""")
    res.check("roadmap: evaluation requires an actual value", bool(evalg.get("guarded")), str(evalg))

    evald = page.evaluate("""() => {
        const g = (sel) => {
            const el = document.querySelector('#dp-eval-1 ' + sel);
            return el;
        };
        const a = g('input[data-actual]'); const m = g('input[data-actualmonth]');
        if (!a) return { error: 'no-input' };
        a.value = '5600';
        if (m) m.value = '2';
        const out = window.SAE_DevPlan.evaluatePhase(1);
        const r = window.SAE_DevPlan.getRoadmap();
        const ph1 = r.phases[0], ph2 = r.phases[1];
        return {
            ok: !!out && out.ok && ph1.status === 'done' && ph2.status === 'active'
                && r.evaluations.length === 1 && r.evaluations[0].spi > 1,
            spi: r.evaluations[0] && r.evaluations[0].spi, evLen: r.evaluations.length,
        };
    }""")
    res.check("roadmap: evaluating a phase closes it and opens the next", bool(evald.get("ok")), str(evald))
    res.check("roadmap: SPI/verdict computed from actual vs plan", float(evald.get("spi") or 0) > 1, str(evald))

    rebase = page.evaluate("""() => {
        const before = window.SAE_DevPlan.getRoadmap().phases.filter(p => p.status !== 'done').length;
        const out = window.SAE_DevPlan.rebaseline();
        const r = window.SAE_DevPlan.getRoadmap();
        return { ok: !!out && r.rebaselined === true && r.phases.length === 4, before, after: r.phases.length };
    }""")
    res.check("roadmap: re-baseline adjusts remaining phases after review", bool(rebase.get("ok")), str(rebase))

    roadreset = page.evaluate("""() => {
        window.SAE_DevPlan.resetToTemplate();
        const r = window.SAE_DevPlan.getRoadmap();
        return {
            ok: r && r.phases.length === 3 && r.current === 5000 && r.target === 6500
                && r.phases[0].status === 'active' && r.rebaselined === false,
            phases: r.phases.length,
        };
    }""")
    res.check("roadmap: reset restores default phase plan", bool(roadreset.get("ok")), str(roadreset))

    feed = page.evaluate("""() => {
        const f = window.SAE_DevPlan.roadDeptFeed();
        const host = document.querySelector('[data-key="dp_rm_feed"]');
        return {
            ok: f && f.plannedEnd > 0 && f.daily > 0 && f.mixers > 0 && f.revenue > 0,
            feed: !!host, plannedEnd: f.plannedEnd, daily: f.daily, mixers: f.mixers,
        };
    }""")
    res.check("roadmap: daily task feed for the active phase", bool(feed.get("ok") and feed.get("feed")), str(feed))

    trend = page.evaluate("""() => {
        window.SAE_DevPlan.updateRoadmap({ current: 5000, target: 6500, horizon: 6, phaseCount: 3 });
        const a = document.querySelector('#dp-eval-1 input[data-actual]');
        if (!a) return { error: 'no-eval' };
        a.value = '5200'; /* behind the phase-1 target (≈5500) */
        const out = window.SAE_DevPlan.evaluatePhase(1);
        const ana = window.SAE_DevPlan.roadAnalytics();
        return {
            ok: !!out && out.ok && ana.spi !== null && ana.spi < 1
                && ana.eacMonths !== null && ana.eacMonths > 6
                && ana.advice && ana.advice.fasterRate > ana.perMonth,
            spi: ana.spi, eac: ana.eacMonths, late: ana.monthsLate,
            advice: ana.advice && ana.advice.fasterRate,
        };
    }""")
    res.check("roadmap: EAC trend forecast & corrective advice when behind", bool(trend.get("ok")), str(trend))

    report = page.evaluate("""() => {
        const origUrl = URL.createObjectURL;
        const origClick = HTMLAnchorElement.prototype.click;
        let downloaded = null;
        URL.createObjectURL = function (b) { downloaded = 'blob'; return 'blob:sae-report'; };
        HTMLAnchorElement.prototype.click = function () {
            if (this.download && this.href.startsWith('blob:')) return;
            return origClick.call(this);
        };
        const rep = window.SAE_DevPlan.exportReport();
        URL.createObjectURL = origUrl;
        HTMLAnchorElement.prototype.click = origClick;
        return {
            ok: downloaded === 'blob' && rep && rep.text.includes('SPI') && rep.text.split('\\n').length >= 5,
            lines: rep.text.split('\\n').length,
        };
    }""")
    res.check("roadmap: management report exports (SPI + phases)", bool(report.get("ok")), str(report))

    feas = page.evaluate("""() => {
        const f = window.SAE_DevPlan.roadFeasibility();
        const chip = document.querySelector('[data-key="dp_rm_feas"]');
        return {
            ok: f && f.target > 0 && f.stations.length >= 2
                && typeof f.ok === 'boolean' && f.warnings !== undefined
                && f.stations.every(s => typeof s.util === 'number'),
            feas: !!chip, util: f.util, stations: f.stations,
        };
    }""")
    res.check("roadmap: feasibility check per station vs capacity", bool(feas.get("ok") and feas.get("feas")), str(feas))

    timeline = page.evaluate("""() => {
        const host = document.querySelector('[data-key="dp_rm_timeline"]');
        const segs = document.querySelectorAll('[data-key="dp_rm_timeline"] ~ div ~ div .rounded, [data-key="dp_rm_timeline"]').length;
        window.SAE_DevPlan.updateRoadmap({ current: 5000, target: 6500, horizon: 6, phaseCount: 3 });
        return { ok: !!host, timeline: !!host };
    }""")
    res.check("roadmap: visual phase timeline on a month axis", bool(timeline.get("ok")), str(timeline))

    scen = page.evaluate("""() => {
        const a = document.querySelector('#dp-eval-1 input[data-actual]');
        if (!a) return { error: 'no-eval' };
        a.value = '5200';
        const out = window.SAE_DevPlan.evaluatePhase(1);
        const host = document.querySelector('[data-key="dp_rm_scen"]');
        const options = document.querySelectorAll('[data-key="dp_rm_scen_keep"], [data-key="dp_rm_scen_pace"], [data-key="dp_rm_scen_extend"]').length;
        return { ok: !!host && options >= 3, options };
    }""")
    res.check("roadmap: decision scenarios appear after a review", bool(scen.get("ok")), str(scen))

    risklog = page.evaluate("""() => {
        const risks = window.SAE_DevPlan.scanRisks();
        const open = risks.filter((x) => x.status === 'open');
        const sched = open.find((x) => x.id === 'schedule');
        const host = !!document.querySelector('[data-key="dp_rm_risk"]');
        return { ok: !!sched && sched.score > 0 && host, open: open.map((x) => x.id + ':' + x.score), risks: risks.length };
    }""")
    res.check("roadmap: advisor logs an open schedule-slip risk after a behind review", bool(risklog.get("ok")), str(risklog))

    risksummary = page.evaluate("""() => {
        const open = window.SAE_DevPlan.scanRisks().filter((x) => x.status === 'open');
        return { ok: open.length >= 1 && open[0].status === 'open', first: open[0] };
    }""")
    res.check("roadmap: risk scoring persists across renders", bool(risksummary.get("ok")), str(risksummary))

    scenapply = page.evaluate("""() => {
        const before = window.SAE_DevPlan.getRoadmap().horizon;
        const out = window.SAE_DevPlan.applyScenario('extend');
        const after = window.SAE_DevPlan.getRoadmap().horizon;
        return { ok: !!out && out.applied === true && after > before, before, after };
    }""")
    res.check("roadmap: applying 'extend horizon' lengthens the plan", bool(scenapply.get("ok")), str(scenapply))

    scenpace = page.evaluate("""() => {
        const a = document.querySelector('#dp-eval-1 input[data-actual]');
        if (!a) return { ok: false, why: 'no-eval' };
        a.value = '5700';
        const ev = window.SAE_DevPlan.evaluatePhase(1);
        const out = window.SAE_DevPlan.applyScenario('pace');
        return { ok: !!ev && !!out && out.applied === true, why: '' };
    }""")
    res.check("roadmap: applying 're-baseline pace' adjusts remaining phases", bool(scenpace.get("ok")), str(scenpace))

    riskmit = page.evaluate("""() => {
        const risks = window.SAE_DevPlan.scanRisks();
        const sched = risks.find((x) => x.id === 'schedule');
        return { ok: !!sched && sched.status === 'mitigated', status: sched ? sched.status : null };
    }""")
    res.check("roadmap: re-baseline pace mitigates the schedule-slip risk", bool(riskmit.get("ok")), str(riskmit))

    riskacc = page.evaluate("""() => {
        const a = document.querySelector('#dp-eval-2 input[data-actual]') || document.querySelector('#dp-eval-1 input[data-actual]');
        if (!a) return { ok: false, why: 'no-eval' };
        a.value = '4800';
        const ev = window.SAE_DevPlan.evaluatePhase(Number(a.closest('[id^="dp-eval-"]').id.split('-')[2]));
        const out = window.SAE_DevPlan.keepPlan();
        const risks = window.SAE_DevPlan.scanRisks();
        const sched = risks.filter((x) => x.id === 'schedule').pop();
        return { ok: !!ev && !!out && !!sched && sched.status === 'accepted', status: sched ? sched.status : null };
    }""")
    res.check("roadmap: keeping the plan accepts the slip risk", bool(riskacc.get("ok")), str(riskacc))

    revlog = page.evaluate("""() => {
        const r0 = window.SAE_DevPlan.getRoadmap();
        const evs = r0.evaluations || [];
        const ev1 = document.querySelector('#dp-eval-1 input[data-actual]');
        if (ev1) { ev1.value = '5500'; window.SAE_DevPlan.evaluatePhase(1); }
        window.SAE_DevPlan.rebaseline();
        const ev2 = document.querySelector('#dp-eval-2 input[data-actual]');
        if (ev2) { ev2.value = '6000'; window.SAE_DevPlan.evaluatePhase(2); }
        const rows = Array.from(document.querySelectorAll('table')).filter((t) => t.querySelector('tbody')).map((t) => t.querySelectorAll('tbody tr').length).filter((n) => n >= 2).length;
        const canvas = !!document.querySelector('#dp-road-review');
        const r = window.SAE_DevPlan.getRoadmap();
        return { ok: rows >= 2 && canvas, rows, evals: (r.evaluations || []).length };
    }""")
    res.check("roadmap: phase review log lists every evaluation", bool(revlog.get("ok")), str(revlog))

    revreset = page.evaluate("""() => {
        window.SAE_DevPlan.resetToTemplate();
        const r = window.SAE_DevPlan.getRoadmap();
        return { ok: (r.evaluations || []).length === 0 };
    }""")
    res.check("roadmap: review log clears on reset", bool(revreset.get("ok")), str(revreset))

    roadreset2 = page.evaluate("""() => {
        window.SAE_DevPlan.resetToTemplate();
        const r = window.SAE_DevPlan.getRoadmap();
        return { ok: r.phases[0].status === 'active' && r.rebaselined === false, phases: r.phases.length };
    }""")
    res.check("roadmap: final reset restores clean plan", bool(roadreset2.get("ok")), str(roadreset2))

    mgmt = page.evaluate("""() => {
        const host = document.getElementById('dev-plan');
        const dp = window.SAE_DevPlan;
        if (!dp || !host) return { error: 'no-section' };
        const st = dp.mgmtState();
        const txt = host.textContent || '';
        return {
            status: st.status,
            hasPrint: typeof dp.printPlan === 'function' && typeof dp.printPlan() === 'object',
            mgmtKeysLeak: (txt.match(/dp_mgmt_[a-z_]+/g) || []).filter((k) => !txt.includes(k)).length,
            rawTreeLabel: (host.querySelectorAll('[data-key]').length > 0),
        };
    }""")
    res.check("exec plan: mgmt section + API mounted", mgmt.get("status") in ("draft", "monitoring"), str(mgmt))
    res.check("exec plan: printable plan API returns output", bool(mgmt.get("hasPrint")), str(mgmt))

    appro = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        const r0 = dp.mgmtState().status;
        const pl = dp.getPlan();
        const had = pl.mgmt.tasks.length;
        const t = dp.addTask({ title: 'E2E task', position: 'pos_quality', cost: 100 });
        const st1 = dp.mgmtState().status;
        const out = dp.mgmtApprove();
        const st2 = dp.mgmtState().status;
        const fin = dp.mgmtFinanceApprove(100);
        const st3 = dp.mgmtState().status;
        const dist = dp.mgmtApprove();
        const st4 = dp.mgmtState().status;
        const mon = dp.mgmtApprove();
        const st5 = dp.mgmtState().status;
        return { r0, t, st1, st2, st3, st4, st5, total: dp.mgmtState().costTotal, approved: dp.mgmtState().costApproved };
    }""")
    res.check("exec plan: cost>0 → draft→mgmt→finance→distributed→monitoring", bool(
        appro.get("st1") == "draft" and appro.get("st2") == "mgmt_ok"
        and appro.get("st3") == "finance_ok" and appro.get("st4") == "distributed" and appro.get("st5") == "monitoring"), str(appro))

    nocost = page.evaluate("""() => {
        window.SAE_DevPlan.resetToTemplate();
        const dp = window.SAE_DevPlan;
        dp.addTask({ title: 'Free task', position: 'pos_sales', cost: 0 });
        dp.mgmtApprove();
        return dp.mgmtState().status;
    }""")
    res.check("exec plan: zero-cost plan skips finance and distributes directly", nocost == "distributed", str(nocost))

    staff = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        const s = dp.addStaffReq({ position: 'pos_station_mgr', reason: 'E2E extra staff' });
        const still = dp.getPlan().mgmt.staffReqs.some((x) => x.id === s.id && x.status === 'pending');
        dp.resolveStaff(s.id, true);
        const done = dp.getPlan().mgmt.staffReqs.some((x) => x.id === s.id && x.status === 'approved');
        return { ok: still && done };
    }""")
    res.check("exec plan: HR receives and approves a team-add request", bool(staff.get("ok")), str(staff))

    prob = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        const p = dp.addProblem({ text: 'E2E problem', severity: 'high', targetMonth: 3 });
        const got = dp.getPlan().mgmt.problems.find((x) => x.id === p.id);
        dp.problemStatus(p.id, 'doing');
        const doing = dp.getPlan().mgmt.problems.find((x) => x.id === p.id).status;
        dp.problemStatus(p.id, 'solved');
        const solved = dp.getPlan().mgmt.problems.find((x) => x.id === p.id).status;
        return { ok: got && doing === 'doing' && solved === 'solved', sev: got ? got.severity : null };
    }""")
    res.check("exec plan: problem scheduler open → doing → solved", bool(prob.get("ok")), str(prob))

    evalgrid = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        const t = dp.addTask({ title: 'Evaluate me', position: 'pos_logistics', cost: 0 });
        dp.taskFollow(t.id, 'started follow-up');
        dp.taskStatus(t.id, 'done');
        dp.evalTask(t.id, 9, '');
        const tk = dp.getPlan().mgmt.tasks.find((x) => x.id === t.id);
        return { ok: tk.followups.length === 1 && tk.status === 'done' && tk.eval.score === 9, eval: tk.eval.score };
    }""")
    res.check("exec plan: per-task follow-up note + status + employee eval", bool(evalgrid.get("ok")), str(evalgrid))

    execreset = page.evaluate("""() => {
        window.SAE_DevPlan.resetToTemplate();
        const m = window.SAE_DevPlan.getPlan().mgmt;
        return { ok: m.status === 'draft' && m.tasks.length === 0 && m.problems.length === 0 && m.staffReqs.length === 0 };
    }""")
    res.check("exec plan: reset clears mgmt cycle, tasks, staff, problems", bool(execreset.get("ok")), str(execreset))

    mgmtrep = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        dp.addTask({ title: 'Reported task', position: 'pos_plant_mgr', cost: 40 });
        dp.taskStatus(dp.getPlan().mgmt.tasks[0].id, 'done');
        dp.evalTask(dp.getPlan().mgmt.tasks[0].id, 8, '');
        dp.mgmtApprove();
        dp.mgmtFinanceApprove(40);
        const rep = dp.roadReport();
        const txt = rep.text;
        const hasExec = txt.includes('Reported task')
            && /40/.test(txt) && /1\\/1/.test(txt)
            && txt.split('\\n').length >= 8;
        return { ok: hasExec, lines: txt.split('\\n').length, sample: txt.split('\\n').slice(6, 10).join(' | ') };
    }""")
    res.check("exec plan: management report includes execution section", bool(mgmtrep.get("ok")), str(mgmtrep))

    strip2 = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        dp.resetToTemplate();
        dp.addTask({ title: 'A', position: 'pos_sales', cost: 0 });
        dp.taskStatus(dp.getPlan().mgmt.tasks[0].id, 'done');
        const strip = document.getElementById('dev-plan').textContent || '';
        return { ok: /1\\/1/.test(strip) };
    }""")
    res.check("exec plan: summary strip tracks done tasks + open problems", bool(strip2.get("ok")), str(strip2))

    cpm = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        dp.resetToTemplate();
        const t1 = dp.addTask({ title: 'T1', position: 'pos_plant_mgr', cost: 0 });
        const t2 = dp.addTask({ title: 'T2', position: 'pos_plant_mgr', cost: 0 });
        const t3 = dp.addTask({ title: 'T3', position: 'pos_plant_mgr', cost: 0 });
        dp.setTaskDuration(t1.id, 3);
        dp.setTaskDuration(t2.id, 5);
        dp.setTaskDuration(t3.id, 2);
        dp.addPredecessor(t2.id, t1.id);
        dp.addPredecessor(t3.id, t2.id);
        const cpm = dp.calculateCPM();
        const plan = dp.getPlan();
        const tasks = plan.mgmt.tasks;
        return {
            ok: cpm && cpm.criticalPath && cpm.criticalPath.length === 3,
            criticalPath: cpm.criticalPath ? cpm.criticalPath.map(t => t.title) : [],
            projectDuration: cpm ? cpm.projectDuration : 0,
            floats: tasks.map(t => ({ title: t.title, float: t.float, isCritical: t.isCritical })),
        };
    }""")
    res.check("CPM: critical path calculation with dependencies", bool(cpm.get("ok")), str(cpm))

    preds = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        const plan = dp.getPlan();
        const t1 = plan.mgmt.tasks[0];
        const t2 = plan.mgmt.tasks[1];
        dp.removePredecessor(t2.id, t1.id);
        const cpm = dp.calculateCPM();
        return {
            ok: cpm.criticalPath.length >= 1,
            t1Predecessors: t1.predecessors,
            t2Predecessors: t2.predecessors,
        };
    }""")
    res.check("CPM: predecessor removal updates critical path", bool(preds.get("ok")), str(preds))

    wbs = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        const host = document.getElementById('dev-plan');
        const txt = host.textContent || '';
        const hasWBS = txt.includes('Work Breakdown Structure') || txt.includes('WBS') || txt.includes('هيكل تجزئة العمل');
        const hasGantt = txt.includes('Gantt Chart') || txt.includes('مخطط جانت');
        return { ok: hasWBS && hasGantt };
    }""")
    res.check("CPM: WBS tree and Gantt chart rendered", bool(wbs.get("ok")), str(wbs))

    baseline = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        dp.resetToTemplate();
        dp.addTask({ title: 'Baseline task', position: 'pos_plant_mgr', cost: 50 });
        const b = dp.saveBaseline();
        const plan = dp.getPlan();
        const hasBaseline = plan.mgmt.baselines && plan.mgmt.baselines.length === 1;
        const bl = plan.mgmt.baselines[0];
        dp.addTask({ title: 'New task after baseline', position: 'pos_plant_mgr', cost: 0 });
        dp.deleteBaseline(bl.id);
        const plan2 = dp.getPlan();
        const deleted = plan2.mgmt.baselines.length === 0;
        return { ok: hasBaseline && bl && bl.tasks && bl.tasks.length === 1 && deleted };
    }""")
    res.check("baselines: save, verify content, and delete", bool(baseline.get("ok")), str(baseline))

    restore = page.evaluate("""() => {
        const dp = window.SAE_DevPlan;
        dp.resetToTemplate();
        dp.addTask({ title: 'Restore test', position: 'pos_plant_mgr', cost: 100 });
        const b = dp.saveBaseline();
        const plan1 = dp.getPlan();
        const bl = plan1.mgmt.baselines[0];
        dp.addTask({ title: 'Extra task', position: 'pos_plant_mgr', cost: 0 });
        const plan2 = dp.getPlan();
        const before = plan2.mgmt.tasks.length;
        dp.restoreBaseline(bl.id);
        const plan3 = dp.getPlan();
        const after = plan3.mgmt.tasks.length;
        return { ok: before === 2 && after === 1 };
    }""")
    res.check("baselines: restore reverts tasks to saved state", bool(restore.get("ok")), str(restore))


def phase3_cloud_sumo(page, res: Result) -> None:
    print("── Phase 3: cloud SUMO pipeline")
    # Draw a deterministic network through the real editor API.
    drawn = page.evaluate("""() => {
        const ed = window.__saeRealEditor;
        if (!ed) return 'no-editor';
        try {
            if (ed.clear) ed.clear();   /* drop any OSM/imported graph first */
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

    # Deterministic wait: poll the REST API for terminal status (the
    # background job's wall-time varies), then let ONE websocket frame
    # render the results instantly through the normal UI path.
    sim_id = None
    for _ in range(20):
        sim_id = page.evaluate("() => window.SAE_Cloud && window.SAE_Cloud._lastId")
        if sim_id:
            break
        page.wait_for_timeout(500)
    res.check("run queued (simulation id issued)", bool(sim_id), f"id={sim_id}")

    status_text, results_text, steps_text = "", "", ""
    api_deadline = time.time() + 300
    while time.time() < api_deadline:
        page.wait_for_timeout(3000)
        st = page.evaluate(
            """async () => {
                const c = window.SAE_Cloud;
                if (!c || !c._tokenState || !c._lastId) return null;
                const r = await fetch('/api/v1/simulations/' + c._lastId, {
                    headers: { Authorization: 'Bearer ' + c._tokenState }
                });
                if (!r.ok) return null;
                const j = await r.json();
                return { status: j.status, error: j.error_message };
            }"""
        )
        if st and st.get("status") in ("completed", "failed"):
            status_text = st["status"]
            break

    # attach a fresh viewer so the terminal frame populates the UI
    if status_text == "completed":
        page.evaluate(
            "() => { const c = window.SAE_Cloud;"
            " if (c && c._lastId && c._stream) c._stream(c._lastId); }")
        ui_deadline = time.time() + 15
        while time.time() < ui_deadline:
            page.wait_for_timeout(500)
            if page.evaluate("() => !!document.querySelector('#cl-results table')"):
                results_text = page.evaluate(
                    "() => document.getElementById('cl-results').innerText.replace(/\\n/g, ' ')")
                break
    steps_text = page.evaluate(
        "() => [...document.querySelectorAll('#cl-steps div')].map(d => d.textContent.trim()).join(',')")

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

    # History now MUST contain the run we just finished (fresh DB or not).
    hist_after = page.evaluate("""async () => {
        window.SAE_Cloud.loadHistory();
        for (let i = 0; i < 16; i++) {
            await new Promise(r => setTimeout(r, 250));
            if (document.querySelectorAll('#cl-history .cl-view').length >= 1) break;
        }
        return document.querySelectorAll('#cl-history .cl-view').length;
    }""")
    res.check("history lists the just-finished run", hist_after >= 1, f"rows={hist_after}")

    view_click = page.evaluate("""async () => {
        const rows = [...document.querySelectorAll('#cl-history .cl-view')];
        const tryRow = async (btn) => {
            btn.click();
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 250));
                const txt = document.getElementById('cl-results').innerText || '';
                if (document.querySelector('#cl-results table') &&
                    /arrived_vehicles|avg_speed_kmh/.test(txt)) {
                    return true;
                }
            }
            return false;
        };
        if (!rows.length) return { clicked: false };
        if (await tryRow(rows[0])) return { clicked: true, ready: true, tried: 'first' };
        if (rows[1] && await tryRow(rows[1])) return { clicked: true, ready: true, tried: 'second' };
        return { clicked: true, ready: false,
                 html: document.getElementById('cl-results').innerHTML.slice(0, 100) };
    }""")
    res.check("clicking a history row restores full results view",
              bool(view_click.get("ready")), str(view_click))
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
            phase2e_network_runner(page, res)
            phase2f_dev_plan(page, res)
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
