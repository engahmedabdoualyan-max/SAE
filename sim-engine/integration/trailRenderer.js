/**
 * @file Canvas vehicle-trail renderer: keeps a bounded position history per
 * vehicle and draws fading polylines behind each vehicle head.
 *
 * Trails are plain arrays of `{x, y}` points capped at `trailLength`. During
 * {@link TrailRenderer#render} vehicles that have not been updated for more
 * than 2 seconds are pruned automatically, and each segment's alpha decays
 * exponentially toward the tail (controlled by `fadeSpeed`).
 *
 * Works with any 2D canvas context; the renderer never clears the canvas so
 * callers stay in control of background painting.
 *
 * @example
 * import { TrailRenderer } from './sim-engine/integration/trailRenderer.js';
 * const trails = new TrailRenderer(canvas, { trailLength: 40 });
 * trails.addVehicle('bus-7', '#f59e0b');
 * // each animation frame:
 * trails.updateVehicle('bus-7', v.x, v.y);
 * ctx.clearRect(0, 0, w, h); drawNetwork(ctx);
 * trails.render(ctx);
 */

/** Vehicles not updated within this window are pruned during render. */
const STALE_MS = 2000;

/**
 * Clamp a number into [min, max].
 * @param {number} v Value.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number}
 */
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
}

/**
 * Per-vehicle trail record.
 * @typedef {Object} VehicleTrail
 * @property {string} color CSS color of the trail.
 * @property {Array<{x:number, y:number}>} positions Bounded point history (head = last).
 * @property {number} lastUpdate Epoch ms of the most recent update.
 */

/**
 * Renders fading motion trails for many vehicles on one canvas context.
 */
export class TrailRenderer {
  /**
   * @param {HTMLCanvasElement|null} canvas Optional canvas (kept for size/owner
   *   reference; rendering only needs a 2D context passed to `render`).
   * @param {Object} [config]
   * @param {number} [config.trailLength=30] Max stored points per vehicle.
   * @param {number} [config.trailOpacity=0.3] Alpha at the trail head (0..1].
   * @param {number} [config.trailWidth=2] Line width [px].
   * @param {number} [config.fadeSpeed=0.02] Exponential alpha decay per segment back.
   */
  constructor(canvas = null, config = {}) {
    /** @type {HTMLCanvasElement|null} */
    this.canvas = canvas ?? null;
    const c = config && typeof config === 'object' ? config : {};

    this.trailLength = clamp(c.trailLength ?? 30, 1, 500);
    this.trailOpacity = clamp(c.trailOpacity ?? 0.3, 0.01, 1);
    this.trailWidth = clamp(c.trailWidth ?? 2, 0.5, 20);
    this.fadeSpeed = clamp(c.fadeSpeed ?? 0.02, 0, 0.5);

    /** @type {Map<string, VehicleTrail>} */
    this.vehicles = new Map();
  }

  /**
   * Register a vehicle with an initial empty trail.
   * @param {string} id Unique vehicle id.
   * @param {string} [color='#38bdf8'] CSS color for the trail.
   * @returns {void}
   */
  addVehicle(id, color = '#38bdf8') {
    const key = String(id);
    if (!key) return;
    this.vehicles.set(key, { color: String(color), positions: [], lastUpdate: Date.now() });
  }

  /**
   * Append a position to a vehicle's trail (auto-registers unknown ids in a
   * neutral color). Points beyond `trailLength` are dropped from the tail.
   * @param {string} id Vehicle id.
   * @param {number} x Canvas x [px].
   * @param {number} y Canvas y [px].
   * @returns {void}
   */
  updateVehicle(id, x, y) {
    const key = String(id);
    let v = this.vehicles.get(key);
    if (!v) {
      this.addVehicle(key);
      v = this.vehicles.get(key);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    v.positions.push({ x, y });
    if (v.positions.length > this.trailLength) {
      v.positions.splice(0, v.positions.length - this.trailLength);
    }
    v.lastUpdate = Date.now();
  }

  /**
   * Remove a vehicle and its trail entirely.
   * @param {string} id Vehicle id.
   * @returns {boolean} true when the vehicle existed.
   */
  removeVehicle(id) {
    return this.vehicles.delete(String(id));
  }

  /**
   * Drop all vehicles and trails (canvas content is untouched — clear it via
   * `ctx.clearRect` as part of your frame drawing).
   * @returns {void}
   */
  clear() {
    this.vehicles.clear();
  }

  /**
   * Change the per-vehicle history cap and trim existing trails to match.
   * @param {number} n New maximum points per trail (>=1).
   * @returns {void}
   */
  setTrailLength(n) {
    this.trailLength = clamp(Math.round(n), 1, 500);
    for (const v of this.vehicles.values()) {
      if (v.positions.length > this.trailLength) {
        v.positions.splice(0, v.positions.length - this.trailLength);
      }
    }
  }

  /**
   * Set the head alpha of trails (0.01..1].
   * @param {number} o Opacity.
   * @returns {void}
   */
  setTrailOpacity(o) {
    this.trailOpacity = clamp(o, 0.01, 1);
  }

  /**
   * Set the trail stroke width [px] (0.5..20].
   * @param {number} w Width.
   * @returns {void}
   */
  setTrailWidth(w) {
    this.trailWidth = clamp(w, 0.5, 20);
  }

  /**
   * Draw all live trails onto the given 2D context.
   *
   * Stale vehicles (>2 s without updates) are pruned first. Each segment is
   * stroked individually with an alpha that starts at `trailOpacity` at the
   * head and multiplies by `(1 - fadeSpeed)` for every step back along the
   * tail, producing a smooth exponential fade.
   *
   * @param {CanvasRenderingContext2D|null} ctx Target 2D context (no-op when falsy).
   * @returns {void}
   */
  render(ctx) {
    if (!ctx || typeof ctx.beginPath !== 'function') return;
    const now = Date.now();

    // Prune stale vehicles before drawing.
    for (const [id, v] of this.vehicles) {
      if (!Number.isFinite(v.lastUpdate) || now - v.lastUpdate > STALE_MS) {
        this.vehicles.delete(id);
      }
    }

    ctx.save();
    ctx.lineWidth = this.trailWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const v of this.vehicles.values()) {
      const pts = v.positions;
      if (pts.length < 2) continue;

      ctx.strokeStyle = v.color;
      for (let i = 1; i < pts.length; i++) {
        const stepsBack = pts.length - 1 - i;
        const alpha = this.trailOpacity * Math.pow(1 - this.fadeSpeed, stepsBack);
        if (alpha <= 0.004) continue;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Number of currently tracked (live) vehicles.
   * @returns {number}
   */
  get count() {
    return this.vehicles.size;
  }
}

export default TrailRenderer;
