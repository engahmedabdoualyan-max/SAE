/**
 * @file Seeded pseudo-random number generator (Mulberry32).
 *
 * Mulberry32 is tiny, fast and has far better statistical quality than the
 * classic LCG used in many demos, making it ideal for reproducible micro-
 * simulation runs: the same seed produces the exact same spawn jitter, lane
 * choice shuffles and driver variability across browsers and sessions.
 *
 * @example
 * import { createRNG } from './sim-engine/utils/seedRandom.js';
 * const rng = createRNG(42);
 * rng.next();                 // 0.445… (same sequence for seed 42, always)
 * rng.nextInt(1, 6);          // fair die roll, inclusive
 * rng.nextFloat(0, 0.5);      // uniform float in [0, 0.5)
 */

/**
 * Raw Mulberry32 generator.
 *
 * @param {number} [seed] 32-bit seed (non-integer / out-of-range input is
 *   coerced via `>>> 0`; default derived from the clock).
 * @returns {()=>number} Thunk producing uniform floats in `[0, 1)`.
 */
export function mulberry32(seed = Date.now() >>> 0) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a fully-featured seeded RNG object.
 *
 * The returned object is frozen and stateful: successive calls advance the
 * internal Mulberry32 stream deterministically for a given seed.
 *
 * @param {number} [seed] Any number; coerced to uint32. Defaults to a
 *   time-based seed.
 * @returns {RNG} Frozen RNG handle:
 *   - `next()` → float in `[0, 1)`
 *   - `nextInt(min, max)` → integer in `[min, max]` (both inclusive)
 *   - `nextFloat(min, max)` → float in `[min, max)`
 *   - `bool([p])` → true with probability `p` (default 0.5)
 *   - `pick(array)` → random element (throws on empty)
 *   - `reseed(newSeed)` → restart the stream in place
 * @throws {TypeError} On invalid arguments to the bound methods.
 *
 * @example
 * const rng = createRNG(1234);
 * const a = [rng.next(), rng.next()];
 * const b = createRNG(1234);
 * b.next() === a[0] && b.next() === a[1]; // true — deterministic
 */
export function createRNG(seed = Date.now() >>> 0) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new TypeError(`createRNG: seed must be a finite number, got ${seed}`);
  }

  let gen = mulberry32(seed >>> 0);

  /**
   * @typedef {Object} RNG
   * @property {()=>number} next Uniform float in `[0, 1)`.
   * @property {(min:number,max:number)=>number} nextInt Integer in `[min, max]`.
   * @property {(min:number,max:number)=>number} nextFloat Float in `[min, max)`.
   * @property {(p?:number)=>boolean} bool Bernoulli trial.
   * @property {<T>(items:T[])=>T} pick Random array element.
   * @property {(newSeed:number)=>void} reseed Restart the stream.
   * @property {()=>number} get seed Initial seed (uint32).
   */
  const api = {
    get seed() { return seed >>> 0; },

    /** @returns {number} float in [0,1) */
    next() {
      return gen();
    },

    /**
     * Uniform integer, BOTH endpoints inclusive (`nextInt(1,6)` models a die).
     * @param {number} min @param {number} max @returns {number}
     */
    nextInt(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new TypeError(`nextInt: min/max must be finite, got ${min}, ${max}`);
      }
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      const span = hi - lo + 1;
      if (span <= 0) throw new RangeError('nextInt: empty range');
      return lo + Math.floor(gen() * span);
    },

    /**
     * Uniform float in `[min, max)` (max excluded, like `next()`).
     * @param {number} min @param {number} max @returns {number}
     */
    nextFloat(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new TypeError(`nextFloat: min/max must be finite, got ${min}, ${max}`);
      }
      if (max < min) [min, max] = [max, min];
      return min + gen() * (max - min);
    },

    /**
     * Bernoulli trial — true with probability `p`.
     * @param {number} [p=0.5] Success probability in `[0, 1]`.
     * @returns {boolean}
     */
    bool(p = 0.5) {
      if (!Number.isFinite(p) || p < 0 || p > 1) {
        throw new TypeError(`bool: p must be in [0,1], got ${p}`);
      }
      return gen() < p;
    },

    /**
     * Pick a uniformly-random element.
     * @template T @param {T[]} items Non-empty array. @returns {T}
     */
    pick(items) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new TypeError('pick: items must be a non-empty array');
      }
      return items[Math.floor(gen() * items.length)];
    },

    /** Restart the deterministic stream with a new seed. @param {number} newSeed */
    reseed(newSeed) {
      if (typeof newSeed !== 'number' || !Number.isFinite(newSeed)) {
        throw new TypeError(`reseed: seed must be a finite number, got ${newSeed}`);
      }
      seed = newSeed >>> 0;
      gen = mulberry32(seed);
    },
  };

  return Object.freeze(api);
}
