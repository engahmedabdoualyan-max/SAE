/**
 * @file Unit conversion and display-formatting helpers.
 *
 * All engine internals are SI (`m/s`, meters, seconds). These helpers convert
 * to/from display units (`km/h`, `mph`, feet, miles) and produce human-readable
 * strings for the dashboard and PDF reports.
 *
 * Conversion functions are **strict**: non-finite input throws a `TypeError`.
 * Formatting functions are **lenient**: non-finite input renders as `'—'`
 * so UI code never crashes on missing telemetry.
 *
 * @example
 * import { mpsToKmh, formatSpeed, formatTime } from './sim-engine/utils/units.js';
 * mpsToKmh(13.9);            // 50.04
 * formatSpeed(13.9, 'mph');  // "31.1 mph"
 * formatTime(3725);          // "01:02:05"
 */

/** km per meter-mile factor: 1 m/s = 3.6 km/h. @type {number} */
export const KMH_PER_MPS = 3.6;
/** 1 m/s ≈ 2.236936 mph. @type {number} */
export const MPH_PER_MPS = 2.2369362920544;
/** 1 m ≈ 3.28084 ft. @type {number} */
export const FEET_PER_METER = 3.28083989501312;

function assertFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`units: ${name} must be a finite number, got ${value}`);
  }
}

// ----------------------------------------------------------- conversions --

/**
 * Convert metres/second to kilometres/hour.
 * @param {number} mps Speed [m/s].
 * @returns {number} Speed [km/h].
 */
export function mpsToKmh(mps) {
  assertFinite(mps, 'mps');
  return mps * KMH_PER_MPS;
}

/**
 * Convert kilometres/hour to metres/second.
 * @param {number} kmh Speed [km/h].
 * @returns {number} Speed [m/s].
 */
export function kmhToMps(kmh) {
  assertFinite(kmh, 'kmh');
  return kmh / KMH_PER_MPS;
}

/**
 * Convert metres/second to miles/hour.
 * @param {number} mps Speed [m/s].
 * @returns {number} Speed [mph].
 */
export function mpsToMph(mps) {
  assertFinite(mps, 'mps');
  return mps * MPH_PER_MPS;
}

/**
 * Convert miles/hour to metres/second.
 * @param {number} mph Speed [mph].
 * @returns {number} Speed [m/s].
 */
export function mphToMps(mph) {
  assertFinite(mph, 'mph');
  return mph / MPH_PER_MPS;
}

/**
 * Convert metres to feet.
 * @param {number} meters Distance [m].
 * @returns {number} Distance [ft].
 */
export function metersToFeet(meters) {
  assertFinite(meters, 'meters');
  return meters * FEET_PER_METER;
}

/**
 * Convert feet to metres.
 * @param {number} feet Distance [ft].
 * @returns {number} Distance [m].
 */
export function feetToMeters(feet) {
  assertFinite(feet, 'feet');
  return feet / FEET_PER_METER;
}

// ------------------------------------------------------------- formatting --

/** Registry of supported explicit speed units. @type {Record<string, {label:string, factor:number}>} */
const SPEED_UNITS = {
  mps: { label: 'm/s', factor: 1 },
  kmh: { label: 'km/h', factor: KMH_PER_MPS },
  mph: { label: 'mph', factor: MPH_PER_MPS },
  /** Alias accepted for convenience. */
  'm/s': { label: 'm/s', factor: 1 },
  'km/h': { label: 'km/h', factor: KMH_PER_MPS },
};

/**
 * Format a speed given in the engine base unit (m/s) for display.
 *
 * @param {number} valueMps Speed [m/s].
 * @param {'kmh'|'mph'|'mps'|'km/h'|'m/s'} [unit='kmh'] Target unit.
 * @param {Object} [opts]
 * @param {number} [opts.decimals] Override decimal places (default: 1 for kmh/mph, 2 for mps).
 * @returns {string} e.g. `"50.0 km/h"`; `'—'` for non-finite input.
 */
export function formatSpeed(valueMps, unit = 'kmh', opts = {}) {
  const u = SPEED_UNITS[unit];
  if (!u) throw new TypeError(`units: unknown speed unit "${unit}"`);
  if (typeof valueMps !== 'number' || !Number.isFinite(valueMps)) return '—';
  const decimals = Number.isInteger(opts.decimals)
    ? opts.decimals
    : unit === 'mps' || unit === 'm/s' ? 2 : 1;
  return `${(valueMps * u.factor).toFixed(decimals)} ${u.label}`;
}

/** Registry of supported explicit distance units (input always metres). @type {Record<string, {label:string, factor:number}>} */
const DISTANCE_UNITS = {
  m: { label: 'm', factor: 1 },
  km: { label: 'km', factor: 1 / 1000 },
  ft: { label: 'ft', factor: FEET_PER_METER },
  mi: { label: 'mi', factor: FEET_PER_METER / 5280 },
};

/**
 * Format a distance given in metres.
 *
 * With system presets (`'metric'` / `'imperial'`) the most readable unit is
 * chosen automatically (m vs km, ft vs mi). Explicit units (`'m'`, `'km'`,
 * `'ft'`, `'mi'`) force the target.
 *
 * @param {number} valueMeters Distance [m].
 * @param {'metric'|'imperial'|'m'|'km'|'ft'|'mi'} [unit='metric']
 * @param {Object} [opts]
 * @param {number} [opts.decimals] Decimal places (auto-picked when omitted).
 * @returns {string} e.g. `"1.25 km"`; `'—'` for non-finite input.
 */
export function formatDistance(valueMeters, unit = 'metric', opts = {}) {
  if (typeof valueMeters !== 'number' || !Number.isFinite(valueMeters)) return '—';

  let key = unit;
  if (unit === 'metric') key = Math.abs(valueMeters) >= 1000 ? 'km' : 'm';
  else if (unit === 'imperial') key = Math.abs(valueMeters * FEET_PER_METER) >= 5280 ? 'mi' : 'ft';

  const u = DISTANCE_UNITS[key];
  if (!u) throw new TypeError(`units: unknown distance unit "${unit}"`);

  const converted = valueMeters * u.factor;
  const decimals = Number.isInteger(opts.decimals)
    ? opts.decimals
    : key === 'm' ? 0 : key === 'ft' ? 0 : 2;
  return `${converted.toFixed(decimals)} ${u.label}`;
}

/**
 * Format a duration in seconds as `HH:MM:SS` (24-hour style stopwatch).
 *
 * Sub-second input is truncated; negative input is clamped to `"00:00:00"`.
 *
 * @param {number} seconds Duration [s].
 * @returns {string} `"HH:MM:SS"`; `'—'` for non-finite input.
 */
export function formatTime(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
