/**
 * @file Intelligent Driver Model (IDM) — Treiber, Hennecke & Helbing (2000).
 *
 * Acceleration equation:
 *   dv/dt = a * [ 1 - (v / v0)^delta - (s*(v, dv) / s)^2 ]
 *
 * Desired (dynamical) gap:
 *   s*(v, dv) = s0 + max(0, v*T + (v * dv) / (2 * sqrt(a * b)))
 *
 * Units are SI: speeds m/s, distances m, times s, accelerations m/s^2.
 */

/**
 * Default IDM parameter set.
 *
 * @typedef {Object} IdmParams
 * @property {number} v0    Desired speed [m/s] (33.3 m/s = 120 km/h).
 * @property {number} s0    Minimum standstill gap [m].
 * @property {number} T     Desired time headway [s].
 * @property {number} a     Maximum acceleration [m/s^2].
 * @property {number} b     Comfortable deceleration [m/s^2].
 * @property {number} delta Free-acceleration exponent [-].
 * @property {number} [bMax] Hard deceleration clamp [m/s^2] (default 8).
 */

/**
 * Default IDM parameters used when none are supplied.
 * @type {Readonly<IdmParams>}
 */
export const DEFAULT_IDM_PARAMS = Object.freeze({
  v0: 33.3,
  s0: 2.0,
  T: 1.5,
  a: 1.4,
  b: 2.0,
  delta: 4,
});

const freeze = (o) => Object.freeze(o);

/**
 * Per-vehicle-class IDM presets.
 *
 * - `sedan`      – default passenger car.
 * - `bus`        – slower, larger headways, gentle acceleration.
 * - `truck`      – heavy vehicle: low acceleration, low desired speed.
 * - `motorcycle` – agile: high acceleration, short headways.
 * - `tuktuk`     – urban three-wheeler: low speed envelope.
 * - `bicycle`    – slow micromobility.
 * - `av`         – autonomous vehicle: shorter headway thanks to faster reaction.
 *
 * @type {Readonly<Record<string, Readonly<IdmParams>>>}
 */
export const IDM_PARAMS_BY_TYPE = freeze({
  sedan: freeze({ ...DEFAULT_IDM_PARAMS }),
  bus: freeze({ v0: 25.0, s0: 2.5, T: 1.8, a: 1.0, b: 2.0, delta: 4 }),
  truck: freeze({ v0: 27.8, s0: 2.5, T: 1.9, a: 0.8, b: 2.2, delta: 4 }),
  motorcycle: freeze({ v0: 36.1, s0: 1.5, T: 1.0, a: 2.5, b: 3.0, delta: 4 }),
  tuktuk: freeze({ v0: 19.4, s0: 1.8, T: 1.4, a: 1.2, b: 2.0, delta: 4 }),
  bicycle: freeze({ v0: 5.5, s0: 1.0, T: 1.2, a: 0.8, b: 1.5, delta: 4 }),
  av: freeze({ v0: 33.3, s0: 1.2, T: 0.8, a: 1.8, b: 2.5, delta: 4 }),
});

/**
 * Resolve an IDM parameter set from a type name and/or overrides.
 *
 * @param {string|IdmParams|null} [typeOrParams] Vehicle type key or partial params.
 * @param {Partial<IdmParams>} [overrides] Explicit overrides (highest priority).
 * @returns {IdmParams} A fresh, merged parameter object.
 */
export function resolveIdmParams(typeOrParams, overrides = {}) {
  let base = DEFAULT_IDM_PARAMS;
  if (typeof typeOrParams === 'string') {
    base = IDM_PARAMS_BY_TYPE[typeOrParams] ?? DEFAULT_IDM_PARAMS;
  } else if (typeOrParams && typeof typeOrParams === 'object') {
    base = typeOrParams;
  }
  const merged = { ...base, ...overrides };
  for (const k of ['v0', 's0', 'T', 'a', 'b', 'delta']) {
    if (!Number.isFinite(merged[k])) {
      throw new TypeError(`idm: invalid param "${k}" = ${merged[k]}`);
    }
  }
  return merged;
}

/**
 * Compute the IDM acceleration for one vehicle at one instant.
 *
 * The function is pure/stateless; call it once per vehicle per step.
 *
 * @param {number} v       Current speed [m/s] (>= 0).
 * @param {number} s       Bumper-to-bumper gap to leader [m]; use `Infinity` for a free road.
 * @param {number} dv      Approach rate `(v - v_leader)` [m/s]; positive when closing in.
 * @param {Partial<IdmParams>} [params] Parameter set (defaults to {@link DEFAULT_IDM_PARAMS}).
 * @returns {number} Acceleration [m/s^2], clamped to [-bMax, a].
 * @throws {TypeError} If arguments are not finite numbers (`s` may be Infinity).
 *
 * @example
 * idmAcceleration(20, 100, 0);                 // ~1.07 m/s^2
 * idmAcceleration(0, Infinity, 0);            // free road from standstill => a
 */
export function idmAcceleration(v, s, dv, params = DEFAULT_IDM_PARAMS) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`idm: v must be finite, got ${v}`);
  if (typeof s !== 'number' || (s !== Infinity && !Number.isFinite(s))) throw new TypeError(`idm: s must be finite or Infinity, got ${s}`);
  if (typeof dv !== 'number' || !Number.isFinite(dv)) throw new TypeError(`idm: dv must be finite, got ${dv}`);
  const p = resolveIdmParams(params);

  const v0 = Math.max(p.v0, 0.01);
  const aMax = Math.max(p.a, 0.05);
  const bComf = Math.max(p.b, 0.05);
  const s0 = Math.max(p.s0, 0.01);
  const T = Math.max(p.T, 0);
  const delta = p.delta >= 1 ? p.delta : 4;
  const bMax = Number.isFinite(p.bMax) ? p.bMax : 8;

  const speed = Math.max(v, 0);

  // Free-road term: 1 - (v/v0)^delta (negative when overspeeding => braking).
  const freeTerm = 1 - Math.pow(speed / v0, delta);

  // Interaction term on a free road vanishes entirely.
  if (s === Infinity) {
    return clamp(aMax * freeTerm, -bMax, aMax);
  }

  const gap = Math.max(s, 0.01); // guard against division by zero / overlap
  const dynPart = speed * T + (speed * dv) / (2 * Math.sqrt(aMax * bComf));
  const sStar = s0 + Math.max(0, dynPart);
  const interaction = (sStar / gap) * (sStar / gap);

  return clamp(aMax * (freeTerm - interaction), -bMax, aMax);
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
