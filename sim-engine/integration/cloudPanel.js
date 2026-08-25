/**
 * @file cloudPanel.js — Cloud Simulation pipeline: auth → project → network
 * upload → scenario → queued run → WebSocket progress → results.
 *
 * Talks to the FastAPI backend through the same origin (/api proxy), so it
 * works identically against the local docker stack and production.
 */
(function () {
  'use strict';

  var API = '/api/v1';
  var state = { token: null, project: null };

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, isError) {
    var el = $('cl-status');
    if (el) {
      el.textContent = msg;
      el.className = 'text-xs mt-1 ' + (isError ? 'text-red-400' : 'text-slate-400');
    }
  }

  function renderStep(name, state_) {
    var box = $('cl-steps');
    if (!box) return;
    if (!box.dataset.steps) box.dataset.steps = JSON.stringify({});
    var steps = JSON.parse(box.dataset.steps);
    steps[name] = state_;
    box.dataset.steps = JSON.stringify(steps);
    var order = ['auth', 'project', 'network', 'scenario', 'queued', 'stream', 'results'];
    box.innerHTML = order.map(function (k) {
      if (!(k in steps)) return '';
      var s = steps[k];
      var icon = s === 'done' ? '✓' : s === 'active' ? '…' : s === 'fail' ? '✗' : '·';
      var color = s === 'done' ? 'text-emerald-400' : s === 'fail' ? 'text-red-400'
        : s === 'active' ? 'text-yellow-300' : 'text-slate-500';
      return '<div class="' + color + '"><span class="font-mono">' + icon +
        '</span> ' + k + '</div>';
    }).join('');
  }

  function setProgress(pct) {
    var el = $('cl-progress');
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function api(method, path, opts, token) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.json) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    return fetch(API + path, {
      method: method, headers: headers,
      body: opts.body, redirect: 'follow',
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var detail = t; try { detail = JSON.parse(t).detail || t; } catch (e) {}
          throw new Error(method + ' ' + path + ' → ' + r.status + ': ' + String(detail).slice(0, 160));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  /* Build a small default arterial when the editor canvas is empty. */
  function fallbackNetwork() {
    var mk = function (id, lat, lng, type) { return { id: id, lat: lat, lng: lng, type: type }; };
    var e = function (i, f, t) {
      return { id: 'E' + i, from: f, to: t, lanes: 3, speedLimit: 22.2,
               length: 600, name: 'Arterial ' + i, bidirectional: true };
    };
    return { nodes: [mk('A', 30.0444, 31.2357, 'entry'),
                     mk('B', 30.0500, 31.2430, 'intersection'),
                     mk('C', 30.0560, 31.2500, 'exit')],
             edges: [e(1, 'A', 'B'), e(1, 'B', 'A'), e(2, 'B', 'C'), e(2, 'C', 'B')] };
  }

  function currentNetworkJson() {
    try {
      var ed = window.__saeRealEditor;
      if (ed && ed.getNetwork) {
        var net = ed.getNetwork();
        var j = net && net.toJSON ? net.toJSON() : null;
        if (j && j.nodes && j.nodes.length >= 2 && j.edges && j.edges.length >= 1) return j;
      }
    } catch (e) { /* fall through */ }
    return fallbackNetwork();
  }

  /* Extract up to `maxRoutes` longest edge-chains so cloud runs get
     substantive multi-edge trips instead of per-edge one-hop noise. */
  function buildRoutes(netJson, maxRoutes) {
    maxRoutes = maxRoutes || 2;
    var adj = {};
    netJson.edges.forEach(function (e) {
      (adj[e.from] = adj[e.from] || []).push(e);
    });
    var used = {};
    var routes = [];

    function dfs(node, prevNode, path, depth) {
      var best = path.slice();
      if (depth >= 12) return best;
      (adj[node] || []).forEach(function (e) {
        if (used[e.id]) return;
        if (e.to === prevNode) return;            /* no U-turn on the same pair */
        if (path.indexOf(e.id) !== -1) return;    /* no edge reuse in-chain */
        var next = path.concat([e.id]);
        var cand = dfs(e.to, node, next, depth + 1);
        if (cand.length > best.length) best = cand;
      });
      return best;
    }

    /* Start from nodes sorted by out-degree desc to favour arterial chains. */
    var starts = netJson.nodes.slice().sort(function (a, b) {
      return ((adj[b.id] || []).length) - ((adj[a.id] || []).length);
    });
    for (var i = 0; i < starts.length && routes.length < maxRoutes; i++) {
      var r = dfs(starts[i].id, null, [], 0);
      if (r.length >= 1 && (r.length > 1 || routes.length === 0)) {
        routes.push(r);
        r.forEach(function (id) { used[id] = true; });
      }
    }
    if (routes.length === 0 && netJson.edges.length) {
      routes.push([netJson.edges[0].id]);
    }
    return routes;
  }

  window.SAE_Cloud = {
    login: function () {
      var email = ($('cl-email') || {}).value || 'demo@sae.local';
      var pass = ($('cl-pass') || {}).value || 'demo1234';
      setStatus('Logging in…');
      renderStep('auth', 'active');
      var body = new URLSearchParams({ username: email, password: pass });
      return fetch(API + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }).then(function (r) {
        if (!r.ok) throw new Error('login failed (' + r.status + ')');
        return r.json();
      }).then(function (j) {
        state.token = j.access_token;
        renderStep('auth', 'done');
        setStatus('Authenticated ✓');
        return true;
      }).catch(function (e) {
        renderStep('auth', 'fail');
        setStatus(e.message, true);
        return false;
      });
    },

    run: function () {
      var self = this;
      var duration = parseInt(($('cl-duration') || {}).value || '300', 10);
      var p = Promise.resolve(state.token ? true : this.login());

      p.then(function (ok) {
        if (!ok) throw new Error('auth required');

        /* project */
        renderStep('project', 'active');
        return api('POST', '/projects/', { json: { name: 'Cloud Run ' + Date.now(), description: '' } }, state.token)
          .then(function (pr) { state.project = pr.id; renderStep('project', 'done'); });

      }).then(function () {
        /* network upload (multipart) */
        renderStep('network', 'active');
        var net = currentNetworkJson();
        var fd = new FormData();
        fd.append('project_id', state.project);
        fd.append('name', 'Editor network');
        fd.append('format', 'json');
        fd.append('file', new Blob([JSON.stringify(net)], { type: 'application/json' }), 'network.json');
        return api('POST', '/networks/upload', { body: fd }, state.token)
          .then(function (nw) { renderStep('network', 'done'); return nw.id; });

      }).then(function (networkId) {
        /* scenario — include explicit OD flows so trips span real chains */
        renderStep('scenario', 'active');
        var params = { simulation: { duration: duration } };
        if (window.__saeIdmOverrides) params.idm = window.__saeIdmOverrides;
        try {
          var netJson = currentNetworkJson();
          var routes = buildRoutes(netJson, 2);
          var vehsPerFlow = Math.max(20, Math.min(150, Math.round(duration / 2.5)));
          params.demand = {
            flows: routes.map(function (r, i) {
              return { id: 'mainline_' + (i + 1), begin: 0,
                       end: Math.round(duration * 0.85),
                       number: vehsPerFlow, route: r };
            })
          };
        } catch (e) { /* server synthesizes uniform flows as fallback */ }
        return api('POST', '/scenarios/', {
          json: { network_id: networkId, name: 'Cloud scenario', params: params },
        }, state.token).then(function (sc) { renderStep('scenario', 'done'); return sc.id; });

      }).then(function (scenarioId) {
        /* queue run */
        renderStep('queued', 'active');
        return api('POST', '/simulations/run', {
          json: { scenario_id: scenarioId, config: { duration: duration } },
        }, state.token).then(function (sim) {
          renderStep('queued', 'done'); renderStep('stream', 'active');
          self._stream(sim.id);
          return sim.id;
        });

      }).catch(function (e) {
        setStatus(e.message, true);
      });
    },

    download: function (kind) {
      var simId = state.lastSimId;
      if (!simId || !state.token) { setStatus('Run a cloud simulation first', true); return; }
      var path = kind === 'report'
        ? API + '/simulations/' + simId + '/report'
        : API + '/simulations/' + simId + '/trajectories';
      fetch(path, { headers: { Authorization: 'Bearer ' + state.token } })
        .then(function (r) {
          if (!r.ok) throw new Error('download failed (' + r.status + ')');
          return kind === 'report' ? r.blob() : r.text();
        })
        .then(function (payload) {
          var blob = payload instanceof Blob
            ? payload
            : new Blob([payload], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = kind === 'report'
            ? 'SAE_simulation_' + simId + '.pdf'
            : 'SAE_trajectories_' + simId + '.json';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        })
        .catch(function (e) { setStatus(e.message, true); });
    },

    _stream: function (simId) {
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var ws = new WebSocket(proto + location.host + API + '/simulations/' + simId + '/stream');
      ws.onmessage = function (ev) {
        var f;
        try { f = JSON.parse(ev.data); } catch (e) { return; }
        if (f.error === 'not_found') { setStatus('simulation not found', true); return; }
        setProgress(Math.round((f.progress || 0) * 100));
        if (f.results) { renderStep('stream', 'done'); renderStep('results', 'done'); self_renderResults(f.results, simId); }
        else if (f.status === 'failed') { renderStep('stream', 'fail'); setStatus(f.error_message || 'run failed', true); }
      };
      ws.onerror = function () { setStatus('WebSocket error', true); };
    },
  };

  function self_renderResults(results, simId) {
    setProgress(100);
    state.lastSimId = simId;
    var el = $('cl-results');
    if (!el) return;
    var rows = '';
    Object.keys(results || {}).sort().forEach(function (k) {
      var v = results[k];
      if (v !== null && typeof v !== 'object') {
        rows += '<tr class="border-t border-slate-700"><td class="py-1 pr-3 text-slate-400">' +
                k + '</td><td class="py-1 font-mono text-emerald-400">' + v + '</td></tr>';
      }
    });
    var actions = simId
      ? '<div class="grid grid-cols-2 gap-2 mt-4">' +
        '<button onclick="SAE_Cloud.download(\'report\')" class="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-semibold"><i class="fas fa-file-pdf mr-1"></i>PDF report</button>' +
        '<button onclick="SAE_Cloud.download(\'trajectories\')" class="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-xs font-semibold"><i class="fas fa-route mr-1"></i>Trajectories</button>' +
        '</div>'
      : '';
    el.innerHTML = '<table class="w-full text-xs"><tbody>' + rows + '</tbody></table>' + actions;
  }

})();
