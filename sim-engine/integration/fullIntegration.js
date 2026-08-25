/**
 * @file fullIntegration.js — Script-tag compatible bridge between the existing
 * SAE AutoSim Hub UI (app.js globals: FLEET, CORRIDORS, TYPE_SPEED, BLACKSPOTS)
 * and the IDM micro-simulation engine.
 *
 * Loads via <script> tag (no ES modules). Exposes window.SAE_Sim namespace.
 *
 * Usage:
 *   SAE_Sim.init(canvas, fleetObj, corridorsObj, mprValue);
 *   SAE_Sim.start();
 *   SAE_Sim.pause();
 *   SAE_Sim.reset();
 */
(function () {
  'use strict';

  /* ── helpers ────────────────────────────────────────────── */
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ── FLEET → IDM mapping ────────────────────────────────── */
  function fleetToIDM(cf) {
    return {
      v0: cf.desiredSpeed || 25,
      s0: cf.minGap || 2.0,
      T: cf.reaction || 1.5,
      a: cf.accel || 1.4,
      b: cf.decel || 2.0,
      delta: 4
    };
  }

  /* ── Network builder from CORRIDORS ─────────────────────── */
  function buildNetwork(corridors) {
    var nodes = [];
    var edges = [];
    var nodeMap = {};
    var edgeId = 0;

    Object.keys(corridors).forEach(function (key) {
      var cor = corridors[key];
      if (!cor || !cor.markers || !cor.markers.length) return;

      var prevNodeId = null;
      cor.markers.forEach(function (mk, i) {
        var nid = key + '_n' + i;
        if (!nodeMap[nid]) {
          nodeMap[nid] = true;
          nodes.push({
            id: nid,
            lat: mk.lat || mk[0] || 30.0444,
            lng: mk.lng || mk[1] || 31.2357,
            type: i === 0 ? 'entry' : i === cor.markers.length - 1 ? 'exit' : 'junction'
          });
        }
        if (prevNodeId) {
          edges.push({
            id: 'e_' + edgeId++,
            from: prevNodeId,
            to: nid,
            lanes: cor.lanes || 3,
            speedLimit: cor.speedLimit || 27.78,
            length: cor.segmentLength || 500,
            name: cor.name || key
          });
          /* reverse direction */
          edges.push({
            id: 'e_' + edgeId++,
            from: nid,
            to: prevNodeId,
            lanes: cor.lanes || 3,
            speedLimit: cor.speedLimit || 27.78,
            length: cor.segmentLength || 500,
            name: (cor.name || key) + '_rev'
          });
        }
        prevNodeId = nid;
      });
    });

    if (nodes.length === 0) {
      /* fallback: simple straight-line network */
      nodes = [
        { id: 'A', lat: 30.0444, lng: 31.2357, type: 'entry' },
        { id: 'B', lat: 30.0500, lng: 31.2400, type: 'junction' },
        { id: 'C', lat: 30.0560, lng: 31.2450, type: 'junction' },
        { id: 'D', lat: 30.0620, lng: 31.2500, type: 'exit' }
      ];
      edges = [
        { id: 'e0', from: 'A', to: 'B', lanes: 3, speedLimit: 27.78, length: 800, name: 'Main' },
        { id: 'e1', from: 'B', to: 'C', lanes: 3, speedLimit: 27.78, length: 800, name: 'Main' },
        { id: 'e2', from: 'C', to: 'D', lanes: 3, speedLimit: 27.78, length: 800, name: 'Main' },
        { id: 'e3', from: 'B', to: 'A', lanes: 3, speedLimit: 27.78, length: 800, name: 'Main_rev' },
        { id: 'e4', from: 'C', to: 'B', lanes: 3, speedLimit: 27.78, length: 800, name: 'Main_rev' },
        { id: 'e5', from: 'D', to: 'C', lanes: 3, speedLimit: 27.78, length: 800, name: 'Main_rev' }
      ];
    }

    return { nodes: nodes, edges: edges };
  }

  /* ── Demand builder from FLEET ──────────────────────────── */
  function buildDemand(fleet, network, mprValue) {
    var demands = [];
    var entryNodes = network.nodes.filter(function (n) { return n.type === 'entry'; });
    var exitNodes = network.nodes.filter(function (n) { return n.type === 'exit'; });
    if (entryNodes.length === 0) entryNodes = network.nodes.slice(0, 1);
    if (exitNodes.length === 0) exitNodes = network.nodes.slice(-1);

    var flowPerPair = 240; /* veh/hr per OD pair */
    var totalVehicles = 60;

    Object.keys(fleet).forEach(function (key) {
      var v = fleet[key];
      if (!v || !v.cf) return;
      var idm = fleetToIDM(v.cf);
      entryNodes.forEach(function (en) {
        exitNodes.forEach(function (xn) {
          if (en.id === xn.id) return;
          var count = Math.round(totalVehicles * (v.weight || 0.1) / entryNodes.length);
          for (var i = 0; i < count; i++) {
            demands.push({
              origin: en.id,
              dest: xn.id,
              departTime: Math.random() * 300,
              vehicleType: key,
              idm: idm
            });
          }
        });
      });
    });
    return demands;
  }

  /* ── Simple IDM on main thread (no worker needed) ───────── */
  function createMainSim(canvas, fleet, corridors, mprValue, onKPI, idmOverrides) {
    var overrides = idmOverrides || null;
    var ctx = canvas.getContext('2d');
    var W = canvas.width = canvas.parentElement.clientWidth - 16;
    var H = canvas.height = 320;
    var LANE_COUNT = 4;
    var LANE_W = Math.floor((H - 40) / LANE_COUNT);
    var ROAD_TOP = 20;
    var RUNNING = false;
    var paused = false;
    var stepCount = 0;
    var vehicles = [];
    var speedHistory = [];
    var animId = null;
    var dt = 0.045; /* ~60fps → real-time seconds per frame */
    var simSpeed = 1;
    var mpr = (mprValue || 30) / 100;
    var trailsOn = true;
    var TRAIL_LEN = 12, TRAIL_ALPHA = 0.25;

    /* ── Simulation Lab state: signals, detectors, TS/FD recorders ── */
    var PX_M = 0.5;                       /* canvas px → metres */
    var labSignals = [];                  /* [{xFrac,g,y,r,offset,t,phase}] */
    var labSlowZone = null;               /* {x0,x1 (frac), factor} */
    var labDemandRate = 1;                /* spawn multiplier */
    var labV0Factor = 1;                  /* free-speed multiplier */
    var detectors = [];                   /* loop detectors */
    var fdSamples = [];                   /* fundamental-diagram points */
    var tsFrames = [];                    /* time-space snapshots */
    var frameInTick = 0;

    var network = buildNetwork(corridors);
    var demand = buildDemand(fleet, network, mprValue);

    /* ── deterministic RNG (mulberry32) — reproducible restarts ── */
    var labSeed = 20260824;
    var rng = mulberry32(labSeed);

    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /* fleet-mix override: heavy-vehicle share (%) rebalances weights live */
    var HEAVY_KEYS = { naql_taqeel: 1, noss_naql: 1, rob_naql: 1 };
    var labHeavyPct = null; /* null → use FLEET weights as-is */
    var labIdmOverride = null; /* persists across respawn/restart (calibration) */
    var spawnedTypes = {};   /* cumulative mix of generated fleet */

    function currentWeights() {
      if (labHeavyPct == null) return fleetWeights;
      var baseHeavy = 0;
      fleetKeys.forEach(function (k, i) {
        if (HEAVY_KEYS[k]) baseHeavy += fleetWeights[i];
      });
      if (baseHeavy <= 0) return fleetWeights;
      var factor = labHeavyPct / (baseHeavy * 100);
      var w = fleetWeights.map(function (wi, i) {
        return HEAVY_KEYS[fleetKeys[i]] ? wi * factor : wi;
      });
      var tot = w.reduce(function (a, b) { return a + b; }, 0);
      return tot > 0 ? w.map(function (x) { return x / tot; }) : w;
    }

    /* pick fleet type weighted by weight */
    var fleetKeys = Object.keys(fleet).filter(function (k) { return fleet[k] && fleet[k].cf; });
    var fleetWeights = fleetKeys.map(function (k) { return fleet[k].weight || 0.1; });
    var totalWeight = fleetWeights.reduce(function (a, b) { return a + b; }, 0);

    function pickFleetType() {
      var w = currentWeights();
      var tot = w.reduce(function (a, b) { return a + b; }, 0);
      var r = rng() * tot;
      var acc = 0;
      for (var i = 0; i < fleetKeys.length; i++) {
        acc += w[i];
        if (r <= acc) return fleetKeys[i];
      }
      return fleetKeys[0];
    }

    function spawnVehicle() {
      var isAv = rng() < mpr;
      var typeKey;
      if (isAv) {
        var avKeys = ['av_l1', 'av_l2', 'av_l3', 'av_l4', 'av_l5'];
        typeKey = avKeys[Math.floor(rng() * avKeys.length)];
      } else {
        typeKey = pickFleetType();
      }
      var type = fleet[typeKey];
      if (!type) return null;
      var idm = fleetToIDM(type.cf);
      if (overrides) {
        for (var k in overrides) {
          if (Object.prototype.hasOwnProperty.call(overrides, k)) idm[k] = overrides[k];
        }
      }
      if (labIdmOverride) {
        for (var k2 in labIdmOverride) {
          if (Object.prototype.hasOwnProperty.call(labIdmOverride, k2)) idm[k2] = labIdmOverride[k2];
        }
      }
      spawnedTypes[typeKey] = (spawnedTypes[typeKey] || 0) + 1;
      var lane = Math.floor(rng() * LANE_COUNT);

      return {
        x: -20 - rng() * 80,
        lane: lane,
        targetLane: lane,
        hist: [],
        speed: idm.v0 * (0.4 + rng() * 0.3),
        idm: idm,
        type: type,
        typeKey: typeKey,
        isAv: isAv,
        isErratic: !isAv && type.category === 'chaotic',
        erraticTimer: 0,
        w: Math.max(10, type.len * 1.5),
        h: Math.max(6, type.width * 4),
        label: isAv ? type.name.charAt(0) + (type.sae || '') :
               (typeKey === 'microbus' ? 'M' : typeKey === 'naql_taqeel' ? 'T' :
                typeKey === 'tuktuk' ? 'TK' : typeKey === 'trooscoor' ? 'TR' :
                typeKey === 'noss_naql' ? 'NN' : typeKey === 'rob_naql' ? 'RN' :
                typeKey === 'motorcycle' ? 'MC' : typeKey === 'bicycle' ? 'B' : '')
      };
    }

    function findLeader(v, allVehicles) {
      var bestDist = Infinity;
      var bestSpeed = v.idm.v0;
      for (var i = 0; i < allVehicles.length; i++) {
        var other = allVehicles[i];
        if (other === v) continue;
        if (Math.abs(other.lane - v.lane) > 0.6) continue;
        var gap = other.x - v.x - other.w;
        if (gap > 0 && gap < bestDist) {
          bestDist = gap;
          bestSpeed = other.speed;
        }
      }
      return { gap: bestDist, speed: bestSpeed };
    }

    /* IDM acceleration */
    function idmAccel(v, s, dv) {
      var p = v.idm;
      var v0 = p.v0, s0 = p.s0, T = p.T, a = p.a, b = p.b;
      var desiredGap = s0 + Math.max(0, v.speed * T + v.speed * dv / (2 * Math.sqrt(a * b)));
      var freeTerm = Math.pow(v.speed / v0, 4);
      var interactTerm = Math.pow(desiredGap / Math.max(s, 0.1), 2);
      return a * (1 - freeTerm - interactTerm);
    }

    function step() {
      stepCount++;
      var simDt = dt * simSpeed;
      var t = stepCount * simDt;
      frameInTick++;

      /* ── signal controllers tick (multi-signal / green wave) ── */
      var sigPhases = [];
      for (var si = 0; si < labSignals.length; si++) {
        var sg = labSignals[si];
        sg.t += simDt;
        var cyc = (sg.g || 0) + (sg.y || 0) + (sg.r || 0);
        var ph = 'green';
        if (cyc > 0) {
          var tt = (((sg.t + sg.offset) % cyc) + cyc) % cyc;
          ph = tt < sg.g ? 'green' : tt < sg.g + sg.y ? 'yellow' : 'red';
        }
        sg.phase = ph;
        sigPhases.push(ph);
      }

      /* spawn (template demand rate) */
      if (vehicles.length < 50 && rng() < 0.15 * labDemandRate) {
        var nv = spawnVehicle();
        if (nv) vehicles.push(nv);
      }

      /* update each vehicle */
      var prevX = new Array(vehicles.length);
      function nearestRedAhead(x) {
        for (var q = 0; q < labSignals.length; q++) {
          var sgn = labSignals[q];
          if (sgn.phase === 'green') continue;
          var sxq = sgn.xFrac * W;
          if (sxq > x) return sxq;
        }
        return null;
      }
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        prevX[i] = v.x;
        var leaderInfo = findLeader(v, vehicles);
        var acc = idmAccel(v, leaderInfo.gap, v.speed - leaderInfo.speed);

        /* slow-zone (lane-closure / grade templates) */
        if (labSlowZone && v.x > labSlowZone.x0 * W && v.x < labSlowZone.x1 * W) {
          acc = Math.min(acc, (v.idm.v0 * labSlowZone.factor - v.speed) * 0.35);
        }

        /* signal stop-bar: brake comfortably when red/yellow ahead */
        var sigX = nearestRedAhead(v.x);
        if (sigX !== null) {
          var dStop = sigX - v.x;
          if (dStop > 2 && dStop < 150) {
            var aReq = (v.speed * v.speed) / (2 * Math.max(dStop - 3, 1));
            acc = Math.min(acc, -(aReq * 1.15));
          }
          if (dStop <= 3 && v.speed < 0.4) v.speed = 0;
        }

        /* erratic behavior */
        if (v.isErratic && rng() < 0.008 * (1 - mpr)) {
          var dir = rng() < 0.5 ? -1 : 1;
          v.targetLane = clamp(v.lane + dir, 0, LANE_COUNT - 1);
        }
        if (v.isErratic && rng() < 0.003 * (1 - mpr)) {
          v.speed = v.idm.v0 * (0.3 + rng() * 0.4);
          v.erraticTimer = 60;
        }
        if (v.erraticTimer > 0) {
          v.erraticTimer--;
          if (v.erraticTimer === 0) v.speed = v.idm.v0 + (rng() - 0.5) * 4;
        }

        /* AV speed smoothing */
        if (v.isAv && !v.isErratic) {
          v.speed += (v.idm.v0 - v.speed) * 0.02;
        }

        /* integrate */
        v.speed = clamp(v.speed + acc * simDt * 10, 0, v.idm.v0 * labV0Factor * 1.2);
        v.x += v.speed * 0.3 * simSpeed;

        /* loop-detector crossings (indices still aligned here) */
        for (var d = 0; d < detectors.length; d++) {
          var detD = detectors[d];
          var dx = detD.xFrac * W;
          if (prevX[i] < dx && v.x >= dx && prevX[i] !== v.x) {
            var vClamp = Math.max(v.speed, 0.5);
            detD.count++;
            detD.n++;
            detD.total++;
            detD.sumSpeed += vClamp;
            detD.sumInv += 1 / vClamp;   /* for true harmonic mean */
          }
        }

        /* trail history */
        if (trailsOn) {
          if (!v.hist) v.hist = [];
          v.hist.push([v.x, v.lane]);
          if (v.hist.length > TRAIL_LEN) v.hist.shift();
        }

        /* lane change */
        if (v.lane !== v.targetLane) {
          var diff = v.targetLane - v.lane;
          v.lane += Math.sign(diff) * 0.04;
          if (Math.abs(v.targetLane - v.lane) < 0.02) v.lane = v.targetLane;
        }
      }

      /* remove off-screen */
      vehicles = vehicles.filter(function (v) { return v.x < W + 60; });

      /* ── detector bin rollover ── */
      for (var d = 0; d < detectors.length; d++) {
        var det = detectors[d];
        det.tAcc += simDt;
        det.time += simDt;
        if (det.tAcc >= 10) {
          det.hist.push({
            flow: Math.round(det.count * (3600 / det.tAcc)),
            hmean: det.n > 0 ? Math.round((det.n / det.sumInv) * 3.6 * 10) / 10 : 0
          });
          if (det.hist.length > 24) det.hist.shift();
          det.count = 0; det.n = 0; det.sumSpeed = 0; det.sumInv = 0; det.tAcc = 0;
        }
      }

      /* ── fundamental-diagram sampling (every ~15 frames) ── */
      if (frameInTick % 15 === 0 && vehicles.length > 0) {
        var sumS = 0;
        for (var f2 = 0; f2 < vehicles.length; f2++) sumS += vehicles[f2].speed;
        var kmh = (sumS / vehicles.length) * 3.6;
        var densityKm = vehicles.length / ((LANE_COUNT * W * PX_M) / 1000);
        fdSamples.push({ k: Math.round(densityKm * 10) / 10, q: Math.round(densityKm * kmh) });
        if (fdSamples.length > 360) fdSamples.shift();
      }

      /* ── time-space recorder (every ~12 frames) ── */
      if (frameInTick % 12 === 0) {
        var snap = [];
        for (var s3 = 0; s3 < vehicles.length; s3++) {
          snap.push([Math.round(vehicles[s3].x), vehicles[s3].lane,
                     Math.round(vehicles[s3].speed * 10) / 10]);
        }
        tsFrames.push(snap);
        if (tsFrames.length > 130) tsFrames.shift();
      }

      /* KPIs */
      if (vehicles.length > 0) {
        var totalSpeed = 0;
        var maxQ = 0;
        for (var j = 0; j < vehicles.length; j++) {
          totalSpeed += vehicles[j].speed;
          var q = findLeader(vehicles[j], vehicles);
          if (q.gap < 20) maxQ = Math.max(maxQ, 20 - q.gap);
        }
        var avgSpd = (totalSpeed / vehicles.length) * 3.6; /* m/s → km/h */
        speedHistory.push(avgSpd);
        if (speedHistory.length > 120) speedHistory.shift();

        var vc = clamp(vehicles.length / (LANE_COUNT * 20), 0, 1);
        var delay = vehicles.length > 5 ? (1 - avgSpd / (30 * 3.6)) * 5 : 0;
        var los = avgSpd > 25 * 3.6 ? 'A' : avgSpd > 20 * 3.6 ? 'B' : avgSpd > 15 * 3.6 ? 'C' : avgSpd > 10 * 3.6 ? 'D' : avgSpd > 5 * 3.6 ? 'E' : 'F';

        if (onKPI) {
          onKPI({
            los: los,
            avgSpeed: Math.round(avgSpd),
            vc: vc.toFixed(2),
            delay: delay.toFixed(1),
            queue: Math.round(maxQ),
            vehicleCount: vehicles.length,
            step: stepCount,
            time: Math.round(t)
          });
        }
      }
    }

    function drawRoad() {
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, W, H);

      for (var l = 0; l < LANE_COUNT; l++) {
        var ly = ROAD_TOP + l * LANE_W;
        ctx.fillStyle = l % 2 === 0 ? '#475569' : '#3E4C5E';
        ctx.fillRect(0, ly, W, LANE_W);
        ctx.strokeStyle = '#FCD34D';
        ctx.lineWidth = 1;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(0, ly + LANE_W);
        ctx.lineTo(W, ly + LANE_W);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = '#FCD34D';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, ROAD_TOP, W, LANE_COUNT * LANE_W);

      /* stop-bars + signal heads */
      for (var sd = 0; sd < labSignals.length; sd++) {
        var sig = labSignals[sd];
        var sx = sig.xFrac * W;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sx - 3, ROAD_TOP, 6, LANE_COUNT * LANE_W);
        var col = sig.phase === 'green' ? '#22c55e'
                : sig.phase === 'yellow' ? '#eab308' : '#ef4444';
        ctx.fillStyle = col;
        for (var sl = 0; sl < LANE_COUNT; sl++) {
          ctx.beginPath();
          ctx.arc(sx, ROAD_TOP + sl * LANE_W + LANE_W * 0.5, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawTrails() {
      if (!trailsOn) return;
      ctx.lineWidth = 2;
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        var h = v.hist;
        if (!h || h.length < 3) continue;
        for (var k = 1; k < h.length; k++) {
          ctx.globalAlpha = TRAIL_ALPHA * (k / h.length);
          ctx.strokeStyle = v.type.color || '#00AAFF';
          ctx.beginPath();
          ctx.moveTo(h[k - 1][0], ROAD_TOP + h[k - 1][1] * LANE_W + LANE_W * 0.5);
          ctx.lineTo(h[k][0], ROAD_TOP + h[k][1] * LANE_W + LANE_W * 0.5);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawVehicles() {
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        var vy = ROAD_TOP + v.lane * LANE_W + LANE_W * 0.5;

        ctx.fillStyle = v.type.color || '#00AAFF';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.roundRect(v.x, vy - v.h / 2, v.w, v.h, 3);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (v.label) {
          ctx.fillStyle = '#FFF';
          ctx.font = 'bold 8px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(v.label, v.x + v.w / 2, vy + 3);
        }

        if (v.isAv) {
          ctx.fillStyle = 'rgba(0,255,127,0.15)';
          ctx.beginPath();
          ctx.arc(v.x + v.w / 2, vy, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawSpeedChart() {
      if (speedHistory.length < 2) return;
      var chartH = 50;
      var chartY = H - chartH - 5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(5, chartY, W - 10, chartH);
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var i = 0; i < speedHistory.length; i++) {
        var x = 5 + (i / (speedHistory.length - 1)) * (W - 10);
        var y = chartY + chartH - (speedHistory[i] / 120) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#94A3B8';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Speed (km/h)', 8, chartY - 3);
    }

    function loop() {
      if (!RUNNING || paused) { animId = null; return; }
      step();
      drawRoad();
      drawTrails();
      drawVehicles();
      drawSpeedChart();
      animId = requestAnimationFrame(loop);
    }

    return {
      start: function () { RUNNING = true; paused = false; if (!animId) loop(); },
      pause: function () { paused = true; },
      resume: function () { if (RUNNING) { paused = false; if (!animId) loop(); } },
      /** Advance n frames synchronously (deterministic tests, throttled rAF). */
      tick: function (n) {
        RUNNING = true; paused = false;
        n = Math.max(1, Math.min(3600, n | 0));
        for (var i = 0; i < n; i++) { step(); }
        drawRoad(); drawTrails(); drawVehicles(); drawSpeedChart();
      },
      setTrails: function (on) { trailsOn = !!on; },

      /* ── Simulation Lab API ── */
      applyIDM: function (ov) {
        if (!ov) return;
        labIdmOverride = labIdmOverride || {};
        ['v0', 'T', 'a', 'b'].forEach(function (k) {
          var val = parseFloat(ov[k]);
          if (!isFinite(val) || val <= 0) return;
          labIdmOverride[k] = val;
          for (var i = 0; i < vehicles.length; i++) vehicles[i].idm[k] = val;
        });
      },
      loadTemplate: function (name) {
        labSignals = []; labSlowZone = null;
        labDemandRate = 1; labV0Factor = 1;
        if (name === 'bottleneck') {
          labDemandRate = 1.7;
          labSlowZone = { x0: 0.55, x1: 0.8, factor: 0.45 };
        } else if (name === 'lane_closure') {
          labDemandRate = 1.5;
          labSlowZone = { x0: 0.6, x1: 0.85, factor: 0.3 };
        } else if (name === 'uphill') {
          labV0Factor = 0.65; labDemandRate = 0.85;
        } else if (name === 'signal_arterial') {
          labSignals = [{ xFrac: 0.62, g: 22, y: 3, r: 18, offset: 0, t: 0, phase: 'green' }];
          labDemandRate = 1.2;
        } else if (name === 'green_wave') {
          labSignals = [
            { xFrac: 0.30, g: 18, y: 3, r: 12, offset: 0, t: 0, phase: 'green' },
            { xFrac: 0.55, g: 18, y: 3, r: 12, offset: -6, t: -6, phase: 'green' },
            { xFrac: 0.80, g: 18, y: 3, r: 12, offset: -12, t: -12, phase: 'green' }
          ];
          labDemandRate = 1.25;
        }
        detectors = [
          { xFrac: 0.33, count: 0, n: 0, sumSpeed: 0, sumInv: 0, tAcc: 0,
            total: 0, time: 0, hist: [] },
          { xFrac: 0.66, count: 0, n: 0, sumSpeed: 0, sumInv: 0, tAcc: 0,
            total: 0, time: 0, hist: [] }
        ];
        fdSamples = []; tsFrames = [];
        return { signals: labSignals.length, slowZone: !!labSlowZone,
                 demandRate: labDemandRate, v0Factor: labV0Factor };
      },
      getDetectorStats: function () {
        return detectors.map(function (d, i) {
          var last = d.hist[d.hist.length - 1] || { flow: 0, hmean: 0 };
          return { id: i + 1, flow: last.flow, hmean: last.hmean,
                   bins: d.hist.length,
                   hist: d.hist.map(function (h) {
                     return { flow: h.flow, hmean: h.hmean };
                   }),
                   totalRateVehH: d.time > 0 ? Math.round(d.total * 3600 / d.time) : 0 };
        });
      },
      getFDData: function () { return fdSamples.slice(); },
      getTSData: function () { return tsFrames.slice(); },
      getSignalPhase: function () {
        return labSignals.map(function (x) { return x.phase; }).join(',') || null;
      },

      setFleetMix: function (heavyPct) {
        labHeavyPct = (heavyPct == null) ? null : Math.max(0, Math.min(60, heavyPct));
      },
      restart: function (seed) {
        vehicles = [];
        speedHistory = [];
        stepCount = 0; frameInTick = 0;
        labSeed = (typeof seed === 'number') ? seed | 0 : labSeed;
        rng = mulberry32(labSeed);
        detectors.forEach(function (d) { d.count = 0; d.n = 0; d.sumSpeed = 0; d.sumInv = 0; d.tAcc = 0; d.total = 0; d.time = 0; d.hist = []; });
        fdSamples = []; tsFrames = [];
        spawnedTypes = {};
        drawRoad();
      },
      getSpawnMix: function () {
        var human = 0, heavy = 0;
        Object.keys(spawnedTypes).forEach(function (k) {
          if (k.indexOf('av_') === 0) return;
          human += spawnedTypes[k];
          if (HEAVY_KEYS[k]) heavy += spawnedTypes[k];
        });
        return { human: human, heavy: heavy,
                 heavyPct: human > 0 ? Math.round(100 * heavy / human) : 0 };
      },
      getSeed: function () { return labSeed; },
      getLaneCount: function () { return LANE_COUNT; },
      reset: function () {
        RUNNING = false;
        paused = false;
        vehicles = [];
        speedHistory = [];
        stepCount = 0;
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        drawRoad();
        if (onKPI) onKPI({ los: '-', avgSpeed: 0, vc: '0', delay: '0', queue: 0, vehicleCount: 0, step: 0, time: 0 });
      },
      setSpeed: function (s) { simSpeed = s; },
      setMPR: function (m) { mpr = m / 100; },
      getVehicles: function () { return vehicles; },
      getKPIs: function () {
        var totalSpeed = 0;
        vehicles.forEach(function (v) { totalSpeed += v.speed; });
        return {
          avgSpeed: vehicles.length > 0 ? (totalSpeed / vehicles.length) * 3.6 : 0,
          vehicleCount: vehicles.length,
          step: stepCount
        };
      },
      destroy: function () {
        RUNNING = false;
        if (animId) { cancelAnimationFrame(animId); animId = null; }
      }
    };
  }

  /* ── Public API ─────────────────────────────────────────── */
  var simInstance = null;

  window.SAE_Sim = {
    version: '1.0.0',
    buildNetwork: buildNetwork,
    buildDemand: buildDemand,
    fleetToIDM: fleetToIDM,

    init: function (canvas, fleet, corridors, mprValue, onKPI, idmOverrides) {
      if (simInstance) simInstance.destroy();
      simInstance = createMainSim(canvas, fleet, corridors, mprValue, onKPI,
        idmOverrides || window.__saeIdmOverrides || null);
      return simInstance;
    },

    start: function () { if (simInstance) simInstance.start(); },
    pause: function () { if (simInstance) simInstance.pause(); },
    resume: function () { if (simInstance) simInstance.resume(); },
    tick: function (n) { if (simInstance && simInstance.tick) simInstance.tick(n); },
    setTrails: function (on) { if (simInstance && simInstance.setTrails) simInstance.setTrails(on); },
    applyIDM: function (ov) { if (simInstance && simInstance.applyIDM) simInstance.applyIDM(ov); },
    loadTemplate: function (n) { return simInstance && simInstance.loadTemplate ? simInstance.loadTemplate(n) : null; },
    getDetectorStats: function () { return simInstance ? simInstance.getDetectorStats() : []; },
    getFDData: function () { return simInstance ? simInstance.getFDData() : []; },
    getTSData: function () { return simInstance ? simInstance.getTSData() : []; },
    getSignalPhase: function () { return simInstance ? simInstance.getSignalPhase() : null; },
    setFleetMix: function (p) { if (simInstance && simInstance.setFleetMix) simInstance.setFleetMix(p); },
    restart: function (seed) { if (simInstance && simInstance.restart) simInstance.restart(seed); },
    getSeed: function () { return simInstance ? simInstance.getSeed() : null; },
    getLaneCount: function () { return simInstance ? simInstance.getLaneCount() : 4; },
    getSpawnMix: function () { return simInstance && simInstance.getSpawnMix ? simInstance.getSpawnMix() : { human: 0, heavy: 0, heavyPct: 0 }; },
    reset: function () { if (simInstance) simInstance.reset(); },
    setSpeed: function (s) { if (simInstance) simInstance.setSpeed(s); },
    setMPR: function (m) { if (simInstance) simInstance.setMPR(m); },
    getVehicles: function () { return simInstance ? simInstance.getVehicles() : []; },
    getKPIs: function () { return simInstance ? simInstance.getKPIs() : {}; },

    isRunning: function () { return simInstance !== null; }
  };

})();
