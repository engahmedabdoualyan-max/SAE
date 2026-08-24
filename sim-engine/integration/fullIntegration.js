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
  function createMainSim(canvas, fleet, corridors, mprValue, onKPI) {
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

    var network = buildNetwork(corridors);
    var demand = buildDemand(fleet, network, mprValue);

    /* pick fleet type weighted by weight */
    var fleetKeys = Object.keys(fleet).filter(function (k) { return fleet[k] && fleet[k].cf; });
    var fleetWeights = fleetKeys.map(function (k) { return fleet[k].weight || 0.1; });
    var totalWeight = fleetWeights.reduce(function (a, b) { return a + b; }, 0);

    function pickFleetType() {
      var r = Math.random() * totalWeight;
      var acc = 0;
      for (var i = 0; i < fleetKeys.length; i++) {
        acc += fleetWeights[i];
        if (r <= acc) return fleetKeys[i];
      }
      return fleetKeys[0];
    }

    function spawnVehicle() {
      var isAv = Math.random() < mpr;
      var typeKey;
      if (isAv) {
        var avKeys = ['av_l1', 'av_l2', 'av_l3', 'av_l4', 'av_l5'];
        typeKey = avKeys[Math.floor(Math.random() * avKeys.length)];
      } else {
        typeKey = pickFleetType();
      }
      var type = fleet[typeKey];
      if (!type) return null;
      var idm = fleetToIDM(type.cf);
      var lane = Math.floor(Math.random() * LANE_COUNT);

      return {
        x: -20 - Math.random() * 80,
        lane: lane,
        targetLane: lane,
        speed: idm.v0 * (0.4 + Math.random() * 0.3),
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

      /* spawn */
      if (vehicles.length < 50 && Math.random() < 0.15) {
        var nv = spawnVehicle();
        if (nv) vehicles.push(nv);
      }

      /* update each vehicle */
      var leaderInfo;
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        leaderInfo = findLeader(v, vehicles);
        var acc = idmAccel(v, leaderInfo.gap, v.speed - leaderInfo.speed);

        /* erratic behavior */
        if (v.isErratic && Math.random() < 0.008 * (1 - mpr)) {
          var dir = Math.random() < 0.5 ? -1 : 1;
          v.targetLane = clamp(v.lane + dir, 0, LANE_COUNT - 1);
        }
        if (v.isErratic && Math.random() < 0.003 * (1 - mpr)) {
          v.speed = v.idm.v0 * (0.3 + Math.random() * 0.4);
          v.erraticTimer = 60;
        }
        if (v.erraticTimer > 0) {
          v.erraticTimer--;
          if (v.erraticTimer === 0) v.speed = v.idm.v0 + (Math.random() - 0.5) * 4;
        }

        /* AV speed smoothing */
        if (v.isAv && !v.isErratic) {
          v.speed += (v.idm.v0 - v.speed) * 0.02;
        }

        /* integrate */
        v.speed = clamp(v.speed + acc * simDt * 10, 0, v.idm.v0 * 1.2);
        v.x += v.speed * 0.3 * simSpeed;

        /* lane change */
        if (v.lane !== v.targetLane) {
          var diff = v.targetLane - v.lane;
          v.lane += Math.sign(diff) * 0.04;
          if (Math.abs(v.targetLane - v.lane) < 0.02) v.lane = v.targetLane;
        }
      }

      /* remove off-screen */
      vehicles = vehicles.filter(function (v) { return v.x < W + 60; });

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
        drawRoad(); drawVehicles(); drawSpeedChart();
      },
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

    init: function (canvas, fleet, corridors, mprValue, onKPI) {
      if (simInstance) simInstance.destroy();
      simInstance = createMainSim(canvas, fleet, corridors, mprValue, onKPI);
      return simInstance;
    },

    start: function () { if (simInstance) simInstance.start(); },
    pause: function () { if (simInstance) simInstance.pause(); },
    resume: function () { if (simInstance) simInstance.resume(); },
    tick: function (n) { if (simInstance && simInstance.tick) simInstance.tick(n); },
    reset: function () { if (simInstance) simInstance.reset(); },
    setSpeed: function (s) { if (simInstance) simInstance.setSpeed(s); },
    setMPR: function (m) { if (simInstance) simInstance.setMPR(m); },
    getVehicles: function () { return simInstance ? simInstance.getVehicles() : []; },
    getKPIs: function () { return simInstance ? simInstance.getKPIs() : {}; },

    isRunning: function () { return simInstance !== null; }
  };

})();
