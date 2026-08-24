/**
 * @file Multi-corridor KPI comparison, scoring, ranking, rendering and export.
 *
 * Corridors are registered with a headline-KPI bag (`avgSpeed`, `los`,
 * `vcRatio`, `delay`, `queue`, `throughput`) plus optional time-series history.
 * {@link CorridorCompare#getComparison} computes per-metric best/worst, an
 * overall normalized score (0-100) and a human-readable summary;
 * {@link CorridorCompare#render} draws a color-coded HTML table without any
 * charting dependency.
 *
 * Scoring directions: higher avgSpeed / LOS / throughput is better; lower
 * v/c-ratio, delay and queue are better. LOS letters convert A=6 … F=1.
 *
 * @example
 * import { CorridorCompare } from './sim-engine/comparison/corridorCompare.js';
 * const cc = new CorridorCompare();
 * cc.addCorridor('Nasr Rd', { avgSpeed: 32, los: 'C', vcRatio: 0.92, delay: 41, queue: 85, throughput: 1450 });
 * document.getElementById('out').innerHTML = cc.render('out');
 */

/** Metric display order and metadata (direction drives best/worst + scoring). */
const METRICS = Object.freeze([
  { key: 'avgSpeed',   label: 'Avg Speed (km/h)', dir: 'higher', weight: 0.20 },
  { key: 'los',        label: 'LOS',              dir: 'higher', weight: 0.15 },
  { key: 'vcRatio',    label: 'V/C Ratio',        dir: 'lower',  weight: 0.20 },
  { key: 'delay',      label: 'Delay (s/veh)',    dir: 'lower',  weight: 0.20 },
  { key: 'queue',      label: 'Queue (m)',        dir: 'lower',  weight: 0.10 },
  { key: 'throughput', label: 'Throughput (veh/h)', dir: 'higher', weight: 0.15 },
]);

/** Absolute anchor points used when min-max normalization is degenerate. */
const ABSOLUTE_ANCHORS = Object.freeze({
  avgSpeed:   (v) => clamp01(v / 60),            // 60 km/h free-flow target
  los:        (v) => clamp01(v / 6),             // A -> 1.0
  vcRatio:    (v) => clamp01((1.6 - v) / 0.8),   // 0.8 -> 1.0, 1.6 -> 0.0
  delay:      (v) => clamp01(1 - v / 120),       // 120 s -> 0.0
  queue:      (v) => clamp01(1 - v / 200),       // 200 m -> 0.0
  throughput: (v) => clamp01(v / 1800),          // per-link saturation flow
});

/**
 * Clamp a number into [0, 1].
 * @param {number} v Input value.
 * @returns {number}
 */
function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v)));
}

/**
 * Convert a LOS letter (A-F, case-insensitive) to its numeric score A=6 … F=1.
 * @param {string|number} los LOS grade or already-numeric score.
 * @returns {number|null} Numeric score or null when unparseable.
 */
export function losToScore(los) {
  if (los == null) return null;
  if (typeof los === 'number' && Number.isFinite(los)) return los >= 1 && los <= 6 ? los : null;
  const idx = 'ABCDEF'.indexOf(String(los).trim().toUpperCase()[0]);
  return idx === -1 ? null : 6 - idx;
}

/**
 * Convert a numeric LOS score back to its letter.
 * @param {number} score Score in [1..6].
 * @returns {string} Letter grade.
 */
export function scoreToLos(score) {
  return 'ABCDEF'[Math.min(5, Math.max(0, 6 - Math.round(score)))];
}

/**
 * HTML-escape text for safe interpolation into markup.
 * @param {*} s Raw value.
 * @returns {string}
 */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Format a metric value for tabular display.
 * @param {string} metric Metric key.
 * @param {*} v Raw value.
 * @returns {string} Display string.
 */
function fmtMetric(metric, v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  switch (metric) {
    case 'los': return scoreToLos(Number(v));
    case 'vcRatio': return Number(v).toFixed(2);
    case 'avgSpeed': return Number(v).toFixed(1);
    default: return Number(v).toFixed(0);
  }
}

/**
 * Multi-corridor comparison engine.
 */
export class CorridorCompare {
  constructor() {
    /** @type {Map<string, {kpis:Object, history:Array}>} */
    this.corridors = new Map();
  }

  /**
   * Register (or replace) a corridor.
   *
   * @param {string} name Corridor display name.
   * @param {Object} kpis Headline KPIs `{avgSpeed, los, vcRatio, delay, queue, throughput}`.
   * @param {Array<{t:number, avgSpeed?:number}>} [history] Optional time series.
   * @returns {CorridorCompare} this (chainable).
   *
   * @example cc.addCorridor('Ring Rd', { avgSpeed: 28, los: 'D', delay: 55 });
   */
  addCorridor(name, kpis = {}, history = []) {
    const key = String(name ?? '').trim();
    if (!key) return this;
    this.corridors.set(key, {
      kpis: kpis && typeof kpis === 'object' ? { ...kpis } : {},
      history: Array.isArray(history) ? history : [],
    });
    return this;
  }

  /**
   * Remove a corridor by name.
   * @param {string} name Corridor name.
   * @returns {boolean} true when a corridor was removed.
   */
  removeCorridor(name) {
    return this.corridors.delete(String(name ?? '').trim());
  }

  /**
   * Extract the raw numeric value of a metric from a KPI bag.
   * @param {Object} kpis KPI bag.
   * @param {string} metric Metric key.
   * @returns {number|null}
   */
  static metricValue(kpis, metric) {
    if (!kpis || typeof kpis !== 'object') return null;
    if (metric === 'los') return losToScore(kpis.los);
    const n = Number(kpis[metric]);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Compare one metric across a `{name: value}` bag.
   *
   * @param {string} metric Metric key (e.g. `'delay'`, `'los'`).
   * @param {Record<string, number|string>} values Corridor-name -> raw value.
   * @returns {{best:string|null, worst:string|null, spread:number|null, avg:number|null}}
   */
  compareMetric(metric, values = {}) {
    const meta = METRICS.find((m) => m.key === metric);
    const dir = meta?.dir ?? 'higher';

    const entries = Object.entries(values ?? {})
      .map(([name, v]) => {
        if (metric === 'los') {
          const s = losToScore(v);
          return s != null ? [name, s] : null;
        }
        const n = Number(v);
        return Number.isFinite(n) ? [name, n] : null;
      })
      .filter(Boolean);

    if (entries.length === 0) return { best: null, worst: null, spread: null, avg: null };

    let best = entries[0];
    let worst = entries[0];
    for (const e of entries) {
      if (dir === 'higher' ? e[1] > best[1] : e[1] < best[1]) best = e;
      if (dir === 'higher' ? e[1] < worst[1] : e[1] > worst[1]) worst = e;
    }
    const nums = entries.map(([, v]) => v);
    return {
      best: best[0],
      worst: worst[0],
      spread: Math.abs(best[1] - worst[1]),
      avg: nums.reduce((s, v) => s + v, 0) / nums.length,
    };
  }

  /**
   * Full comparison payload: per-metric best/worst tables, weighted score
   * ranking (0-100) and a natural-language summary.
   *
   * @returns {{metrics: Array<{metric:string, values:Record<string,*>, best:(string|null), worst:(string|null)}>,
   *            ranking: Array<{name:string, score:number}>,
   *            summary:string}} Empty arrays/string when no corridors exist.
   */
  getComparison() {
    const names = [...this.corridors.keys()];
    if (names.length === 0) {
      return { metrics: [], ranking: [], summary: 'No corridors to compare.' };
    }

    // Per-metric raw value table + best/worst detection.
    const metrics = METRICS.map(({ key, dir }) => {
      const values = {};
      const numeric = {};
      for (const name of names) {
        const c = this.corridors.get(name);
        const v = CorridorCompare.metricValue(c.kpis, key);
        values[name] = key === 'los' ? (v != null ? scoreToLos(v) : null) : v;
        if (v != null) numeric[name] = v;
      }
      const cmp = this.compareMetric(key, values);
      void dir; // direction handled inside compareMetric
      return { metric: key, values, best: cmp.best, worst: cmp.worst, _numeric: numeric };
    });

    // Normalized weighted scores.
    const scores = new Map(names.map((n) => [n, 0]));
    let weightSeen = 0;
    for (const m of METRICS) {
      const entry = metrics.find((x) => x.metric === m.key);
      const vals = Object.values(entry._numeric);
      if (vals.length === 0) continue;

      const norm = new Map();
      const uniqueVals = new Set(vals);
      for (const [name, v] of Object.entries(entry._numeric)) {
        norm.set(
          name,
          uniqueVals.size > 1
            ? m.dir === 'higher'
              ? clamp01((v - Math.min(...vals)) / (Math.max(...vals) - Math.min(...vals)))
              : clamp01((Math.max(...vals) - v) / (Math.max(...vals) - Math.min(...vals)))
            : (ABSOLUTE_ANCHORS[m.key] ?? (() => 0.5))(entry._numeric[name])
        );
      }
      weightSeen += m.weight;
      for (const name of names) {
        if (norm.has(name)) scores.set(name, scores.get(name) + norm.get(name) * m.weight);
      }
    }

    const ranking = names
      .map((name) => ({
        name,
        score: weightSeen > 0 ? Math.round((scores.get(name) / weightSeen) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    return { metrics, ranking, summary: this.#buildSummary(metrics, ranking) };
  }

  /**
   * Compose the natural-language summary line.
   * @private
   * @param {Array<Object>} metrics Metric rows from getComparison().
   * @param {Array<{name:string,score:number}>} ranking Sorted ranking.
   * @returns {string}
   */
  #buildSummary(metrics, ranking) {
    if (ranking.length === 0) return 'No corridors to compare.';
    const top = ranking[0];
    const last = ranking[ranking.length - 1];
    const parts = [
      `"${top.name}" ranks #1 overall (score ${top.score.toFixed(1)}/100) across ${ranking.length} corridor${ranking.length > 1 ? 's' : ''}`,
    ];
    if (ranking.length > 1 && last.name !== top.name) {
      parts.push(`weakest: "${last.name}" (${last.score.toFixed(1)})`);
    }
    const speedRow = metrics.find((m) => m.metric === 'avgSpeed');
    if (speedRow?.best) parts.push(`best avg speed: "${speedRow.best}"`);
    const delayRow = metrics.find((m) => m.metric === 'delay');
    if (delayRow?.best) parts.push(`lowest delay: "${delayRow.best}"`);
    return `${parts.join('; ')}.`;
  }

  /**
   * Render a color-coded comparison table plus ranking list as HTML.
   * Best cell per row gets a green tint, worst a red tint. Pure string/DOM —
   * no chart library required. Also injects into `containerId` when found.
   *
   * @param {string} containerId DOM id of the target container (optional).
   * @returns {string} The generated HTML.
   */
  render(containerId = '') {
    const { metrics, ranking, summary } = this.getComparison();
    const names = [...this.corridors.keys()];

    const headCells = names.map((n) => `<th class="px-3 py-2 text-left font-semibold">${esc(n)}</th>`).join('');
    const bodyRows = metrics.map(({ metric, values, best, worst }) => {
      const label = METRICS.find((m) => m.key === metric)?.label ?? metric;
      const cells = names.map((n) => {
        const cls =
          best === n ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
          : worst === n ? 'bg-red-500/15 text-red-300'
          : '';
        return `<td class="px-3 py-1.5 ${cls}">${esc(fmtMetric(metric, values[n]))}</td>`;
      }).join('');
      return `<tr class="border-t border-slate-800"><td class="px-3 py-1.5 text-slate-400">${esc(label)}</td>${cells}</tr>`;
    }).join('');

    const rankItems = ranking.map((r, i) => `
      <li class="flex items-center gap-2 py-0.5">
        <span class="w-5 text-right text-slate-500">${i + 1}.</span>
        <span class="flex-1 ${i === 0 ? 'text-emerald-300 font-semibold' : 'text-slate-200'}">${esc(r.name)}</span>
        <span class="text-slate-400">${r.score.toFixed(1)}</span>
      </li>`).join('');

    const html = `
<div class="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
  <p class="text-sm text-slate-400">${esc(summary)}</p>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead><tr><th class="px-3 py-2 text-left text-slate-500">Metric</th>${headCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>
  ${names.length > 0 ? `
  <div class="pt-1">
    <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Overall Ranking</h4>
    <ol class="text-sm">${rankItems}</ol>
  </div>` : ''}
</div>`;

    if (containerId && typeof document !== 'undefined') {
      const el = document.getElementById(containerId);
      if (el) el.innerHTML = html;
    }
    return html;
  }

  /**
   * Export every corridor × metric as CSV (comma-separated, quoted strings).
   * Includes the computed total score as the final row.
   *
   * @returns {string} CSV text (LF line endings).
   *
   * @example downloadText('corridors.csv', cc.exportCSV());
   */
  exportCSV() {
    const { metrics, ranking } = this.getComparison();
    const names = [...this.corridors.keys()];
    const quote = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

    const lines = [['Metric', ...names].map(quote).join(',')];
    for (const m of metrics) {
      lines.push([quote(m.metric), ...names.map((n) => quote(fmtMetric(m.metric, m.values[n])))].join(','));
    }
    if (ranking.length > 0) {
      const byName = new Map(ranking.map((r) => [r.name, r.score]));
      lines.push([quote('Score'), ...names.map((n) => quote(byName.has(n) ? byName.get(n).toFixed(1) : ''))].join(','));
    }
    return lines.join('\n');
  }
}

export default CorridorCompare;
