/**
 * @file Safety analysis via Surrogate Safety Measures (SSM):
 *
 * - TTC  — Time-To-Collision: `TTC = −Δx/Δv` while two agents approach.
 * - PET  — Post-Encroachment Time: gap between one agent leaving and the next
 *          entering a shared conflict zone.
 * - DRS  — Deceleration Rate for Safety: hardest braking observed in a
 *          trajectory, judged against a comfort threshold.
 *
 * Trajectory format used throughout:
 *
 *     { id:string, points:[{t:number, x:number, y:number, speed?:number}] }
 */

/** Analysis thresholds and defaults. */
export const SAFETY_DEFAULTS = Object.freeze({
  /** TTC below this [s] counts as a conflict. */
  ttcThresholdS: 3.0,
  /** TTC below this [s] is severe. */
  ttcSevereS: 1.5,
  /** PET below this [s] counts as a conflict. */
  petThresholdS: 5.0,
  /** Conflict-zone radius around a conflict point [m]. */
  conflictZoneRadiusM: 2.0,
  /** Comfortable deceleration threshold for DRS [m/s²]. */
  drsComfortableMps2: 3.4,
});

const EPS = 1e-9;

/* ------------------------------------------------------------- extraction -- */

/**
 * Read position from a trajectory point / vehicle sample.
 * @private
 * @returns {{x:number,y:number}|null}
 */
function posOf(p) {
  if (!p) return null;
  if (Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  const pos = p.position;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return { x: pos.x, y: pos.y };
  return null;
}

/**
 * Read velocity from a vehicle/point sample: explicit vx/vy, velocity object,
 * or heading + scalar speed.
 * @private
 * @returns {{vx:number,vy:number}}
 */
function velOf(p) {
  if (Number.isFinite(p.vx) && Number.isFinite(p.vy)) return { vx: p.vx, vy: p.vy };
  if (p.velocity && Number.isFinite(p.velocity.x)) return { vx: p.velocity.x, vy: p.velocity.y };
  let speed = Number.isFinite(p.speed) ? p.speed : Number.isFinite(p.v) ? p.v : 0;
  // Derive speed from consecutive points when absent.
  if (!Number.isFinite(p.speed) && p.prev && p.prev.t != null && p.t != null && p.t > p.prev.t) {
    const a = posOf(p.prev);
    const b = posOf(p);
    if (a && b) speed = Math.hypot(b.x - a.x, b.y - a.y) / (p.t - p.prev.t);
  }
  if ((p.headingDeg != null || p.headingRad != null || (p.heading && Number.isFinite(p.heading.x)))) {
    let hx; let hy;
    if (p.heading && Number.isFinite(p.heading.x)) ({ x: hx, y: hy } = p.heading);
    else {
      const rad = p.headingRad ?? ((p.headingDeg ?? 0) * Math.PI) / 180;
      hx = Math.cos(rad); hy = Math.sin(rad);
    }
    const m = Math.hypot(hx, hy);
    return m > EPS ? { vx: (hx / m) * speed, vy: (hy / m) * speed } : { vx: 0, vy: 0 };
  }
  return { vx: 0, vy: 0 };
}

/* ------------------------------------------------------------------- TTC -- */

/**
 * Time-to-Collision between two vehicles at one instant.
 *
 * With relative position `Δp = p₁ − p₂` and relative velocity
 * `Δv = v₁ − v₂`, the pair closes when `Δp·Δv < 0`, giving
 * `TTC = −(Δp·Δv)/(Δv·Δv)` at the instant of closest approach. The pair only
 * collides if the miss distance at that instant is within the combined
 * vehicle envelope (`missThresholdM`, default 2 m); otherwise there is no
 * collision course and the result is `Infinity`.
 *
 * @param {Object} veh1 `{x,y}` + `vx,vy | velocity | heading+speed`.
 * @param {Object} veh2 Same format.
 * @param {{minGapM?:number, missThresholdM?:number}} [opts]
 *   `minGapM` treats the pair as colliding once this close [m];
 *   `missThresholdM` discards near-misses whose closest approach stays wider
 *   than the envelope.
 * @returns {number} TTC in seconds (∞ when not on a collision course).
 *
 * @example
 * computeTTC({x:0,y:0,vx:10,vy:0}, {x:50,y:0,vx:0,vy:0}); // → 5 s
 */
export function computeTTC(veh1, veh2, opts = {}) {
  const p1 = posOf(veh1);
  const p2 = posOf(veh2);
  if (!p1 || !p2) throw new TypeError('computeTTC: both vehicles need positions');
  const v1 = velOf(veh1);
  const v2 = velOf(veh2);

  const dpx = p1.x - p2.x;
  const dpy = p1.y - p2.y;
  const dvx = v1.vx - v2.vx;
  const dvy = v1.vy - v2.vy;

  const dpdv = dpx * dvx + dpy * dvy; // >0 ⇒ separating
  const dv2 = dvx * dvx + dvy * dvy;
  if (dv2 < EPS || dpdv >= 0) return Infinity;

  const dist = Math.hypot(dpx, dpy);
  const minGap = Number.isFinite(opts.minGapM) ? opts.minGapM : 0;
  const envelope = Math.max(
    minGap,
    Number.isFinite(opts.missThresholdM) ? opts.missThresholdM : 2,
  );

  // Closest approach happens at t*; collide only if it is inside the envelope.
  const tStar = -dpdv / dv2;
  const missX = dpx + dvx * tStar;
  const missY = dpy + dvy * tStar;
  if (Math.hypot(missX, missY) > envelope) return Infinity;

  if (dist <= minGap) return 0;
  // Remaining distance beyond the vehicle bodies scales the effective TTC.
  return ((dist - minGap) / dist) * tStar;
}

/* ------------------------------------------------------------------- PET -- */

/**
 * First timestamp at which a trajectory's points enter the conflict zone.
 * @private
 */
function firstEntry(traj, cp, radius) {
  for (const p of traj.points ?? []) {
    const q = posOf(p);
    if (q && Math.hypot(q.x - cp.x, q.y - cp.y) <= radius) return Number.isFinite(p.t) ? p.t : null;
  }
  return null;
}

/**
 * Last timestamp inside the conflict zone (exit time).
 * @private
 */
function lastExit(traj, cp, radius) {
  let exit = null;
  for (const p of traj.points ?? []) {
    const q = posOf(p);
    if (q && Math.hypot(q.x - cp.x, q.y - cp.y) <= radius) {
      if (!Number.isFinite(p.t)) return null;
      exit = p.t;
    }
  }
  return exit;
}

/**
 * Post-Encroachment Time between two trajectories at a shared conflict point:
 * the time between the FIRST occupant leaving the zone and the SECOND
 * entering it.
 *
 * @param {Object} veh1 Trajectory `{id?, points:[{t,x,y}]}`.
 * @param {Object} veh2 Second trajectory.
 * @param {{x:number,y:number}} conflictPoint Shared location.
 * @param {{zoneRadiusM?:number}} [opts]
 * @returns {number} PET in seconds (≥ 0), or Infinity when either never enters.
 *
 * @example
 * computePET(trajA, trajB, {x:0,y:0}); // e.g. 2.4 s
 */
export function computePET(veh1, veh2, conflictPoint, opts = {}) {
  const radius = Number.isFinite(opts.zoneRadiusM)
    ? opts.zoneRadiusM
    : SAFETY_DEFAULTS.conflictZoneRadiusM;
  const t1In = firstEntry(veh1, conflictPoint, radius);
  const t2In = firstEntry(veh2, conflictPoint, radius);
  if (t1In == null || t2In == null) return Infinity;
  const t1Out = lastExit(veh1, conflictPoint, radius) ?? t1In;
  const t2Out = lastExit(veh2, conflictPoint, radius) ?? t2In;

  // Whoever occupies first defines the reference encroachment.
  if (t1In <= t2In) {
    const pet = t2In - t1Out;
    return pet >= 0 ? pet : 0;
  }
  const pet = t1In - t2Out;
  return pet >= 0 ? pet : 0;
}

/* -------------------------------------------------------- conflict mining -- */

/**
 * Linear interpolation of a trajectory position at time t.
 * @private
 * @returns {{x:number,y:number}|null}
 */
function interpPos(points, t) {
  if (!points || points.length === 0) return null;
  if (t <= points[0].t) return posOf(points[0]);
  if (t >= points[points.length - 1].t) return posOf(points[points.length - 1]);
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.t - a.t;
      const f = span > EPS ? (t - a.t) / span : 0;
      const pa = posOf(a);
      const pb = posOf(b);
      if (!pa || !pb) return null;
      return { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f };
    }
  }
  return null;
}

/** Velocity estimate at time t by central differences of sampled positions. */
function interpVel(points, t) {
  const h = 0.25;
  const a = interpPos(points, t - h);
  const b = interpPos(points, t + h);
  if (!a || !b) {
    const only = interpPos(points, t);
    return only ? { vx: 0, vy: 0 } : null;
  }
  return { vx: (b.x - a.x) / (2 * h), vy: (b.y - a.y) / (2 * h) };
}

/**
 * Pairwise conflict detection across a set of trajectories.
 *
 * For every pair, samples both trajectories on the union of their timestamps,
 * tracks the minimum TTC and the closest approach. Pairs qualify as conflicts
 * when min-TTC or PET falls below its threshold.
 *
 * @param {Array<{id?:string, points:Array<{t:number,x:number,y:number,speed?:number}>}>} trajectories
 * @param {Partial<typeof SAFETY_DEFAULTS>} [opts]
 * @returns {Array<{agents:[string,string], ttc:number, pet:number,
 *                  conflictPoint:{x:number,y:number}, closestDistM:number,
 *                  time:number, severity:'high'|'medium'|'low'}>}
 */
export function conflictAnalysis(trajectories, opts = {}) {
  const cfg = { ...SAFETY_DEFAULTS, ...opts };
  if (!Array.isArray(trajectories)) throw new TypeError('conflictAnalysis: trajectories array required');

  const trajs = trajectories.filter((tr) => tr && Array.isArray(tr.points) && tr.points.length >= 2);
  /** @type {Array<Object>} */ const conflicts = [];

  for (let i = 0; i < trajs.length; i++) {
    for (let j = i + 1; j < trajs.length; j++) {
      const A = trajs[i];
      const B = trajs[j];

      // Union of timestamps (both sorted ascending).
      const times = [...new Set([...A.points.map((p) => p.t), ...B.points.map((p) => p.t)])].sort((a, b) => a - b);

      let minTtc = Infinity;
      let ttcTime = times[0] ?? 0;
      let closest = Infinity;
      let closePoint = null;
      let closeTime = ttcTime;

      for (const t of times) {
        const pa = interpPos(A.points, t);
        const pb = interpPos(B.points, t);
        if (!pa || !pb) continue;
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < closest) {
          closest = d;
          closePoint = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
          closeTime = t;
        }
        const va = interpVel(A.points, t);
        const vb = interpVel(B.points, t);
        if (!va || !vb) continue;
        const ttc = computeTTC(
          { x: pa.x, y: pa.y, vx: va.vx, vy: va.vy },
          { x: pb.x, y: pb.y, vx: vb.vx, vy: vb.vy },
        );
        if (ttc < minTtc) {
          minTtc = ttc;
          ttcTime = t;
        }
      }

      if (!closePoint) continue;
      const pet = computePET(A, B, closePoint, { zoneRadiusM: cfg.conflictZoneRadiusM });

      const ttcConflict = minTtc < cfg.ttcThresholdS;
      const petConflict = pet < cfg.petThresholdS;
      if (!ttcConflict && !petConflict) continue;

      const severity =
        (minTtc < cfg.ttcSevereS || pet < cfg.petThresholdS / 5) ? 'high'
          : (minTtc < cfg.ttcThresholdS || pet < cfg.petThresholdS / 2) ? 'medium'
            : 'low';

      conflicts.push({
        agents: [A.id ?? `traj-${i}`, B.id ?? `traj-${j}`],
        ttc: minTtc === Infinity ? Infinity : +minTtc.toFixed(3),
        pet: pet === Infinity ? Infinity : +pet.toFixed(3),
        conflictPoint: { x: +closePoint.x.toFixed(3), y: +closePoint.y.toFixed(3) },
        closestDistM: +closest.toFixed(3),
        time: +(minTtc < Infinity ? ttcTime : closeTime).toFixed(3),
        severity,
      });
    }
  }

  conflicts.sort((a, b) => (a.severity === b.severity ? a.time - b.time : a.severity.localeCompare(b.severity)));
  return conflicts;
}

/* -------------------------------------------------------------- scoring -- */

/**
 * Aggregate risk score in [0, 100] from a conflict list. Each conflict
 * contributes up to 60 points through its TTC deficit and up to 40 through
 * its PET deficit; the sum saturates at 100.
 *
 * @param {Array<{ttc:number, pet:number}>} conflicts Output of {@link conflictAnalysis}.
 * @param {Partial<typeof SAFETY_DEFAULTS>} [opts]
 * @returns {number} 0 (safe) … 100 (critical).
 */
export function riskScore(conflicts, opts = {}) {
  const cfg = { ...SAFETY_DEFAULTS, ...opts };
  if (!Array.isArray(conflicts) || conflicts.length === 0) return 0;

  let score = 0;
  for (const c of conflicts) {
    const wTtc = Number.isFinite(c.ttc)
      ? Math.max(0, (cfg.ttcThresholdS - c.ttc) / cfg.ttcThresholdS) * 60
      : 0;
    const wPet = Number.isFinite(c.pet)
      ? Math.max(0, (cfg.petThresholdS - c.pet) / cfg.petThresholdS) * 40
      : 0;
    score += Math.min(60, wTtc) + Math.min(40, wPet);
  }
  return Math.min(100, Math.round(score));
}

/* ------------------------------------------------------------ entrypoint -- */

/**
 * Full surrogate-safety analysis over trajectory data.
 *
 * @param {Array<Object>} trajectories See module header for format.
 * @param {Map<string,Object>|Object|Array|null} [edges=null] Unused hook kept
 *   for API symmetry (may carry per-edge context in future revisions).
 * @param {Partial<typeof SAFETY_DEFAULTS>} [opts]
 * @returns {{
 *   conflictCount:number, conflicts:Array<Object>,
 *   ttc:{min:number, avg:number, belowThreshold:number},
 *   pet:{min:number, avg:number, belowThreshold:number},
 *   drs:{maxDecel:number, comfortThreshold:number, exceedances:number},
 *   riskScore:number
 * }}
 */
export function analyzeSafety(trajectories, edges = null, opts = {}) {
  void edges;
  const cfg = { ...SAFETY_DEFAULTS, ...opts };

  const conflicts = conflictAnalysis(trajectories, cfg);

  const finiteTtc = conflicts.map((c) => c.ttc).filter(Number.isFinite);
  const finitePet = conflicts.map((c) => c.pet).filter(Number.isFinite);

  // DRS: hardest deceleration observed anywhere in the dataset.
  let maxDecel = 0;
  let exceedances = 0;
  for (const traj of trajectories ?? []) {
    const pts = traj?.points ?? [];
    for (let k = 1; k < pts.length; k++) {
      const s0 = pts[k - 1].speed;
      const s1 = pts[k].speed;
      const dt = pts[k].t - pts[k - 1].t;
      if (!Number.isFinite(s0) || !Number.isFinite(s1) || !(dt > 0)) continue;
      const decel = (s0 - s1) / dt; // positive when slowing down
      if (decel > maxDecel) maxDecel = decel;
      if (decel > cfg.drsComfortableMps2) exceedances += 1;
    }
  }
  // Fall back to kinematic speeds derived from positions when no speed field.
  if (maxDecel === 0) {
    for (const traj of trajectories ?? []) {
      const pts = traj?.points ?? [];
      for (let k = 2; k < pts.length; k++) {
        const a = posOf(pts[k - 2]); const b = posOf(pts[k - 1]); const c = posOf(pts[k]);
        const dt1 = pts[k - 1].t - pts[k - 2].t;
        const dt2 = pts[k].t - pts[k - 1].t;
        if (!a || !b || !c || !(dt1 > 0 && dt2 > 0)) continue;
        const v1 = Math.hypot(b.x - a.x, b.y - a.y) / dt1;
        const v2 = Math.hypot(c.x - b.x, c.y - b.y) / dt2;
        const decel = (v1 - v2) / dt2;
        if (decel > maxDecel) maxDecel = decel;
        if (decel > cfg.drsComfortableMps2) exceedances += 1;
      }
    }
  }

  const avg = (arr) => (arr.length > 0 ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  const round = (x, n = 3) => (x == null ? null : +x.toFixed(n));

  return {
    conflictCount: conflicts.length,
    conflicts,
    ttc: {
      min: finiteTtc.length > 0 ? round(Math.min(...finiteTtc)) : null,
      avg: round(avg(finiteTtc)),
      belowThreshold: finiteTtc.filter((t) => t < cfg.ttcThresholdS).length,
    },
    pet: {
      min: finitePet.length > 0 ? round(Math.min(...finitePet)) : null,
      avg: round(avg(finitePet)),
      belowThreshold: finitePet.filter((p) => p < cfg.petThresholdS).length,
    },
    drs: {
      maxDecel: round(maxDecel),
      comfortThreshold: cfg.drsComfortableMps2,
      exceedances,
    },
    riskScore: riskScore(conflicts, cfg),
  };
}
