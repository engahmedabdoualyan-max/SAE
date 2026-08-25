/**
 * @file labPanel.js — Simulation Lab controller.
 *
 * Wires scenario templates, live IDM parameter sliders, loop-detector cards,
 * and the two classic traffic-engineering visualizations (time–space diagram
 * and fundamental flow–density diagram) to the in-browser engine exposed by
 * window.SAE_Sim (fullIntegration.js).
 */
(function () {
  'use strict';

  var SLIDERS = [
    { key: 'v0', label: 'Desired speed v₀ (m/s)', min: 8, max: 40, step: 0.5, def: 25 },
    { key: 'T', label: 'Safe headway T (s)', min: 0.5, max: 2.5, step: 0.05, def: 1.4 },
    { key: 'a', label: 'Max acceleration a (m/s²)', min: 0.5, max: 3.5, step: 0.1, def: 1.6 },
    { key: 'b', label: 'Comfortable decel b (m/s²)', min: 1, max: 4.5, step: 0.1, def: 2.2 }
  ];

  function $(id) { return document.getElementById(id); }

  /* ── sliders ── */
  function buildSliders() {
    var box = $('lab-sliders');
    if (!box || box.dataset.built) return;
    var html = '';
    SLIDERS.forEach(function (s) {
      html += '<div class="flex items-center gap-3">' +
        '<span class="w-44 text-slate-400">' + s.label + '</span>' +
        '<input id="lab-sl-' + s.key + '" type="range" min="' + s.min +
        '" max="' + s.max + '" step="' + s.step + '" value="' + s.def +
        '" class="flex-1 accent-emerald-500">' +
        '<span id="lab-val-' + s.key + '" class="w-10 text-right font-mono text-emerald-400">' + s.def + '</span>' +
        '</div>';
    });
    box.innerHTML = html;
    box.dataset.built = '1';
    SLIDERS.forEach(function (s) {
      var inp = $('lab-sl-' + s.key);
      if (inp) {
        inp.addEventListener('input', function () {
          $('lab-val-' + s.key).textContent = inp.value;
        });
      }
    });
  }

  /* ── detector cards + sparklines ── */
  function renderDetectors() {
    var box = $('lab-detectors');
    if (!box) return;
    var stats = (window.SAE_Sim && window.SAE_Sim.getDetectorStats()) || [];
    if (!stats.length) {
      box.innerHTML = '<div class="col-span-2 text-center text-slate-500 text-xs py-2">Run a template to activate detectors</div>';
      return;
    }
    box.innerHTML = stats.map(function (d) {
      return '<div class="p-3 bg-slate-900 rounded-lg border border-slate-600 text-center">' +
        '<div class="text-[10px] text-slate-400">Loop D' + d.id + ' (last 10 s bin)</div>' +
        '<div class="text-lg font-bold text-cyan-400">' + d.flow + '</div>' +
        '<div class="text-[10px] text-slate-400">veh/h · ' + d.hmean + ' km/h h.mean</div></div>';
    }).join('');
  }

  function drawSparklines() {
    var stats = (window.SAE_Sim && window.SAE_Sim.getDetectorStats()) || [];
    for (var i = 0; i < stats.length; i++) {
      var cv = $('lab-spark-' + (i + 1));
      if (!cv) continue;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, cv.width, cv.height);
      var hist = stats[i].hist || [];
      if (hist.length < 2) continue;
      var fMax = Math.max.apply(null, hist.map(function (h) { return h.flow; })) || 1;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var k = 0; k < hist.length; k++) {
        var x = 4 + (k / (hist.length - 1)) * (cv.width - 8);
        var y = cv.height - 5 - (hist[k].flow / fMax) * (cv.height - 12);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('D' + (i + 1) + ' flow/10s', 4, 10);
    }
  }

  /* ── time–space diagram ── */
  function drawTS() {
    var cv = $('lab-ts');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, W, H);

    var frames = (window.SAE_Sim && window.SAE_Sim.getTSData()) || [];
    if (frames.length < 2) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Run a template — trajectories stream here', W / 2, H / 2);
      return;
    }
    /* x scale from canvas-space px (engine units) → diagram width */
    var maxX = 1;
    frames.forEach(function (fr) {
      fr.forEach(function (p) { if (p[0] > maxX) maxX = p[0]; });
    });
    for (var f = 0; f < frames.length; f++) {
      var y = H - 8 - (f / (frames.length - 1)) * (H - 24); /* newest at bottom */
      var fr = frames[f];
      for (var i = 0; i < fr.length; i++) {
        var x = 8 + (fr[i][0] / maxX) * (W - 16);
        var ratio = Math.min(1, fr[i][2] / 30); /* speed ratio vs ~30 m/s */
        var rC = Math.round(239 * (1 - ratio) + 34 * ratio);
        var gC = Math.round(68 * ratio + 68);
        ctx.fillStyle = 'rgba(' + rC + ',' + gC + ',' + Math.round(80 + 60 * (1 - ratio)) + ',0.85)';
        ctx.fillRect(x - 1, y - 1, 2.5, 2.5);
      }
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('t ↑ older', 8, 14);
    ctx.textAlign = 'right';
    ctx.fillText('x →', W - 8, H - 6);
  }

  /* ── fundamental diagram ── */
  function drawFD() {
    var cv = $('lab-fd');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, W, H);

    var pts = (window.SAE_Sim && window.SAE_Sim.getFDData()) || [];
    if (pts.length < 5) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sampling q–k pairs while the template runs…', W / 2, H / 2);
      return;
    }
    var kMax = 10, qMax = 100;
    pts.forEach(function (p) {
      if (p.k > kMax) kMax = p.k;
      if (p.q > qMax) qMax = p.q;
    });
    /* axes */
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(36, 8); ctx.lineTo(36, H - 22); ctx.lineTo(W - 10, H - 22);
    ctx.stroke();
    pts.forEach(function (pt) {
      var x = 36 + (pt.k / kMax) * (W - 52);
      var y = H - 22 - (pt.q / qMax) * (H - 34);
      ctx.fillStyle = 'rgba(251,146,60,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('k (veh/km)', W - 70, H - 8);
    ctx.save();
    ctx.translate(12, 60); ctx.rotate(-Math.PI / 2);
    ctx.fillText('q (veh/h)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.fillText('max ' + qMax + ' veh/h', W - 12, 16);
  }

  /* ── public API ── */
  window.SAE_Lab = {
    loadTemplate: function () {
      if (!window.SAE_Sim) return;
      var sel = $('lab-template');
      var name = sel ? sel.value : '';
      if (!name) return;

      var canvas = document.getElementById('sim-canvas');
      if (canvas) {
        var fleet = (typeof FLEET !== 'undefined' && FLEET) || window.FLEET || {};
        var corridors = (typeof CORRIDORS !== 'undefined' && CORRIDORS) || window.CORRIDORS || {};
        var mpr = window.mprValue !== undefined ? window.mprValue : 30;
        window.SAE_Sim.init(canvas, fleet, corridors, mpr,
          window.__saeUpdateAdvKPIs || window.__saeLabKpiHook || null);
        window.SAE_Sim.start();
      }
      var cfg = window.SAE_Sim.loadTemplate(name);
      buildSliders();
      renderDetectors();

      /* auto-scroll to sim so users watch the template take effect */
      var sec = document.getElementById('sim');
      if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth' });
      return cfg;
    },

    applySliders: function () {
      if (!window.SAE_Sim) return;
      var ov = {};
      SLIDERS.forEach(function (s) {
        var inp = $('lab-sl-' + s.key);
        if (inp) ov[s.key] = parseFloat(inp.value);
      });
      window.SAE_Sim.applyIDM(ov);
    },

    setHeavy: function (pct) {
      if (!window.SAE_Sim) return;
      window.SAE_Sim.setFleetMix(parseFloat(pct));
    },

    restart: function () {
      if (!window.SAE_Sim) return;
      window.SAE_Sim.restart(); /* same seed → identical run */
      window.SAE_Sim.start();
      renderDetectors();
      drawSparklines();
    },

    _tick: function () {
      renderDetectors();
      drawSparklines();
      drawTS();
      drawFD();
    }
  };

  /* heavy-share slider wiring */
  function wireHeavySlider() {
    var inp = $('lab-sl-heavy');
    if (!inp || inp.dataset.wired) return;
    inp.dataset.wired = '1';
    inp.addEventListener('input', function () {
      $('lab-val-heavy').textContent = inp.value;
      window.SAE_Lab.setHeavy(parseFloat(inp.value));
    });
  }

  /* throttled repaint of lab visuals (~6 fps) */
  setInterval(function () {
    var sec = document.getElementById('sim-lab');
    if (sec && window.SAE_Lab) {
      wireHeavySlider();
      window.SAE_Lab._tick();
    }
  }, 160);

})();
