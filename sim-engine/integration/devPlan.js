/**
 * @file devPlan.js — رأس مال المصنع: خطة التطوير (Development Plan).
 *
 * صفحة البحث والتطوير: نموذج بيانات مركزي للـ KPIs موزّعة على الأقسام، مع
 * قيمة حالية + أهداف شهرية (أفق 3 شهور) لكل مؤشر. كل قسم ياخد "مهامه"
 * كزامن: الفروق الشهرية المطلوبة لتحقيق التارجت. دي "المدخلات اللي بتحرّكنا":
 *
 *  - بيانات افتراضية قابلة للتعديل (مبيعات الخرسانة 5000 → 5500 → 6000...)
 *  - تعديل مباشر للقيم الحالية والأهداف مع حفظ في localStorage
 *  - مخطط زمني (Chart.js) لمسار كل مؤشر (الآن ↔ الأهداف الشهرية)
 *  - جدول توزيع المهام شهريًا على الأقسام
 *  - تصدير CSV للمنظومة + رابط بحث وتطوير
 */

const LS_KEY = 'sae-dev-plan-v1';

/* ── القالب الافتراضي: أقسام و KPIs ─────────────────────────────────── */
const template = {
  horizon: 3,
  departments: [
    {
      id: 'sales',
      nameKey: 'dp_dept_sales',
      icon: 'fa-chart-line',
      color: 'from-emerald-500 to-teal-600',
      kpis: [
        {
          id: 'concrete',
          nameKey: 'dp_kpi_concrete',
          unit: 'm³',
          current: 5000,
          targets: [5500, 6000, 6500],
        },
        {
          id: 'bricks',
          nameKey: 'dp_kpi_bricks',
          unit: 'ألف',
          current: 900,
          targets: [1000, 1100, 1200],
        },
      ],
    },
    {
      id: 'plants',
      nameKey: 'dp_dept_plants',
      icon: 'fa-industry',
      color: 'from-cyan-500 to-blue-600',
      kpis: [
        {
          id: 'station1',
          nameKey: 'dp_kpi_station1',
          unit: 'm³',
          current: 2600,
          targets: [2850, 3050, 3300],
        },
        {
          id: 'station2',
          nameKey: 'dp_kpi_station2',
          unit: 'm³',
          current: 2200,
          targets: [2400, 2600, 2800],
        },
      ],
    },
    {
      id: 'quality',
      nameKey: 'dp_dept_quality',
      icon: 'fa-flask',
      color: 'from-violet-500 to-purple-600',
      kpis: [
        {
          id: 'compliance',
          nameKey: 'dp_kpi_compliance',
          unit: '%',
          current: 92,
          targets: [93.5, 95, 96.5],
        },
      ],
    },
    {
      id: 'logistics',
      nameKey: 'dp_dept_logistics',
      icon: 'fa-truck-fast',
      color: 'from-amber-500 to-orange-600',
      kpis: [
        {
          id: 'turnaround',
          nameKey: 'dp_kpi_turnaround',
          unit: 'دق',
          current: 52,
          targets: [49, 47, 45],
        },
      ],
    },
  ],
};

let plan = null;
let chart = null;
let chartDept = template.departments[0].id;

/* أي اتجاه يُعدّ تقدّمًا: مؤشرات ترتفع (مبيعات) أو تنخفض (زمن الدوران). */
function higherIsBetter(kpi) {
  const last = kpi.targets[kpi.targets.length - 1];
  return last >= kpi.current;
}

/* تحقّق شهر مسجّل من هدفه؟ true = محقق، false = متأخر، null = لم يُسجّل. */
function achievedAt(kpi, m) {
  const a = kpi.actuals ? kpi.actuals[m] : null;
  if (a === null || a === undefined) return null;
  const t = kpi.targets[m];
  if (t === null || t === undefined) return null;
  return higherIsBetter(kpi) ? a >= t : a <= t;
}

function recordedCount(p) {
  return (p || plan).departments.reduce((acc, d) => acc + d.kpis.reduce(
    (n, k) => n + (k.actuals || []).filter((v) => v !== null && v !== undefined).length, 0), 0);
}

function metCount(p) {
  return (p || plan).departments.reduce((acc, d) => acc + d.kpis.reduce(
    (n, k) => n + (k.actuals || []).filter((_, i) => achievedAt(k, i) === true).length, 0), 0);
}

/* تأكيد/توسيع أي خطة (محلّية أو قالب) لتطابق الأفق وتحمل `actuals`. */
function normalize(p) {
  if (!p || !Array.isArray(p.departments)) return p;
  if (!p.horizon) p.horizon = 3;
  p.departments.forEach((d) => {
    if (!Array.isArray(d.kpis)) d.kpis = [];
    d.kpis.forEach((k) => {
      if (!Array.isArray(k.targets)) k.targets = [];
      while (k.targets.length < p.horizon) {
        k.targets.push(k.targets.length ? k.targets[k.targets.length - 1] : 0);
      }
      if (!Array.isArray(k.actuals)) k.actuals = [];
      while (k.actuals.length < p.horizon) k.actuals.push(null);
      if (k.actuals.length > p.horizon) k.actuals.length = p.horizon;
    });
  });
  return p;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.departments) && parsed.departments.length) {
        plan = normalize(parsed);
        return;
      }
    }
  } catch (e) { /* corrupt → template */ }
  plan = normalize(JSON.parse(JSON.stringify(template)));
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(plan)); } catch (e) { /* storage blocked */ }
}

function resetToTemplate() {
  plan = normalize(JSON.parse(JSON.stringify(template)));
  chartDept = plan.departments[0].id;
  save();
  render();
  renderChart();
}

/* ── ترجمة عناوين تظهر داخل JS (أسماء أقسام/مؤشرات) ─────────────────── */
const en = {
  current: 'Current', target: 'Target', per_month: 'per month',
  delta: 'Δ / mo', progress: 'Progress', dept: 'Department', kpi: 'KPI',
  now: 'Now', month: 'Month', tasks: 'Monthly task', task_desc: 'distributed monthly task',
  edit: 'Edit plan', save: 'Save plan', reset: 'Reset template', export: 'Export CSV',
  executive: 'Exec summary', trajectory: 'Monthly trajectory', tasks_title: 'Task board',
  empty: 'No departments yet — edit to add one.',
  depts: 'Departments', active: 'Active KPIs', horizon: 'Horizon', avgProg: 'Avg progress',
};
function tr(key) {
  const w = typeof window !== 'undefined' ? window : null;
  if (w && typeof w.t === 'function') {
    const txt = w.t(key);
    if (txt !== key) return txt;
  }
  if (w && w.TRANSLATIONS) {
    const d = document.documentElement;
    const lang = (w.currentLangSafe) || d.getAttribute('lang') || 'en';
    const data = w.TRANSLATIONS[lang] || w.TRANSLATIONS.en || {};
    if (data[key]) return data[key];
  }
  return (en[key] !== undefined ? en[key] : key);
}

/* ── عرض ────────────────────────────────────────────────────────────── */

function deptById(id) { return plan.departments.find((d) => d.id === id); }

function progressOf(kpi) {
  const last = kpi.targets[kpi.targets.length - 1];
  if (last === kpi.current) return 100;
  const growth = last > kpi.current;
  const span = growth
    ? (kpi.current + Math.abs(last - kpi.current))
    : (kpi.current - Math.abs(last - kpi.current));
  if (!span) return 100;
  const done = growth
    ? (kpi.current / span) * 100
    : 100 - (kpi.current / span) * 100;
  return Math.max(0, Math.min(100, Math.round(done)));
}

function deltaBadge(kpi) {
  const last = kpi.targets[kpi.targets.length - 1];
  const diff = Math.round((last - kpi.current) * 10) / 10;
  const up = diff >= 0;
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
    up ? 'bg-emerald-600/25 text-emerald-300' : 'bg-rose-600/25 text-rose-300'}">
    <i class="fas fa-${up ? 'arrow-up' : 'arrow-down'}"></i> ${Math.abs(diff)} ${kpi.unit}</span>`;
}

function kpiRowHtml(d, kpi) {
  const targetChips = kpi.targets.map((v, i) =>
    `<span class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-[10px]" title="${tr('dp_month')} ${i + 1}">${v}</span>`).join('');
  const actualChips = kpi.actuals.map((v, i) => {
    const st = achievedAt(kpi, i);
    const cls = v === null || v === undefined
      ? 'bg-slate-800 text-slate-600'
      : (st === true ? 'bg-emerald-600/25 text-emerald-300' : 'bg-rose-600/25 text-rose-300');
    const glyph = v === null || v === undefined ? '·' : (st === true ? '✓' : '✗');
    return `<span class="px-1.5 py-0.5 rounded ${cls} text-[10px]" title="${tr('dp_actual')} ${i + 1}">${glyph}${v === null || v === undefined ? '' : v}</span>`;
  }).join('');
  return '' +
    '<div class="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-700/60 last:border-0">' +
    '  <div class="min-w-[140px]">' +
    '    <div class="text-sm font-semibold text-white" data-key="' + kpi.nameKey + '">' + kpi.nameKey + '</div>' +
    '    <div class="text-[10px] text-slate-400 mt-0.5">' + tr('dp_current') + ': <b class="text-slate-200">' + kpi.current + '</b> ' + kpi.unit + ' <span data-key="dp_per_month">' + tr('per_month') + '</span></div>' +
    '  </div>' +
    '  <div class="flex items-center gap-2">' +
    '    <div class="text-right">' +
    '      <div class="text-[10px] text-slate-400">' + tr('dp_target') + '</div>' +
    '      <div class="flex gap-1 mt-1">' + targetChips + '</div>' +
    '      <div class="text-[10px] text-slate-400 mt-1.5">' + tr('dp_actual') + '</div>' +
    '      <div class="flex gap-1 mt-1">' + actualChips + '</div>' +
    '    </div>' +
    '    <div class="w-16 pr-2">' + deltaBadge(kpi) + '</div>' +
    '  </div>' +
    '  <div class="w-40">' +
    '    <div class="flex justify-between text-[10px] text-slate-400 mb-1"><span>' + tr('dp_progress') + '</span><span class="font-bold text-cyan-300">' + progressOf(kpi) + '%</span></div>' +
    '    <div class="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">' +
    '      <div class="h-full ' + d.color + ' rounded-full bg-gradient-to-r" style="width:' + progressOf(kpi) + '%"></div>' +
    '    </div>' +
    '  </div>' +
    '</div>';
}

function deptCardHtml(d) {
  return '' +
    '<div class="bg-slate-900 rounded-2xl border border-slate-700/70 p-5 shadow-lg shadow-black/20">' +
    '  <div class="flex items-center gap-3 mb-3">' +
    '    <div class="w-10 h-10 rounded-xl bg-gradient-to-br ' + d.color + ' flex items-center justify-center text-white text-sm"><i class="fas ' + d.icon + '"></i></div>' +
    '    <div>' +
    '      <div class="text-base font-bold text-white" data-key="' + d.nameKey + '">' + d.nameKey + '</div>' +
    '      <div class="text-[10px] text-slate-400">' + d.kpis.length + ' ' + tr('dp_kpi') + '</div>' +
    '    </div>' +
    '  </div>' +
    d.kpis.map((k) => kpiRowHtml(d, k)).join('') +
    '</div>';
}

function summaryStripHtml() {
  const totalKpis = plan.departments.reduce((a, d) => a + d.kpis.length, 0);
  const all = plan.departments.flatMap((d) => d.kpis);
  const avg = all.length
    ? Math.round(all.reduce((a, k) => a + progressOf(k), 0) / all.length)
    : 0;
  const rec = recordedCount();
  const met = metCount();
  const blocks = [
    [plan.departments.length, tr('dp_depts')],
    [totalKpis, tr('dp_active')],
    [plan.horizon, tr('dp_horizon')],
    [avg + '%', tr('dp_avgProg')],
    [rec ? met + '/' + rec : '—', tr('dp_ontrack')],
  ];
  return '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">' + blocks.map(([v, l]) =>
    '<div class="bg-slate-800 rounded-xl border border-slate-700/70 p-4 text-center">' +
    '  <div class="text-2xl font-extrabold text-white">' + v + '</div>' +
    '  <div class="text-[10px] uppercase tracking-wider text-slate-400 mt-1">' + l + '</div>' +
    '</div>').join('') + '</div>';
}

function chartDeptSelect() {
  return '<select id="dp-chart-dept" onchange="SAE_DevPlan && SAE_DevPlan.selectChartDept(this.value)" class="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white">' +
    plan.departments.map((d) =>
      `<option value="${d.id}" ${d.id === chartDept ? 'selected' : ''}>${tr(d.nameKey)}</option>`).join('') +
    '</select>';
}

function taskBoardHtml() {
  const rows = [];
  for (let m = 1; m <= plan.horizon; m++) {
    plan.departments.forEach((d) => {
      d.kpis.forEach((k) => {
        const tgt = k.targets[m - 1];
        const prev = m === 1 ? k.current : k.targets[m - 2];
        const delta = Math.round((tgt - prev) * 10) / 10;
        if (delta === 0) return;
        const achieved = achievedAt(k, m - 1);
        const act = k.actuals ? k.actuals[m - 1] : null;
        const actualTd = act === null || act === undefined
          ? '<span class="text-slate-600">—</span>'
          : '<span class="' + (achieved === true ? 'text-emerald-300' : 'text-rose-300') + '">' + act + ' ' + k.unit +
            ' <i class="fas fa-' + (achieved === true ? 'check' : 'xmark') + '"></i></span>';
        rows.push('' +
          '<tr class="border-b border-slate-700/50 last:border-0">' +
          '  <td class="py-2 px-2 text-[10px] text-cyan-300 font-mono">M' + m + '</td>' +
          '  <td class="py-2 px-2 text-xs text-white" data-key="' + d.nameKey + '">' + d.nameKey + '</td>' +
          '  <td class="py-2 px-2 text-xs text-slate-300" data-key="' + k.nameKey + '">' + k.nameKey + '</td>' +
          '  <td class="py-2 px-2 text-xs text-right text-emerald-300 font-mono">' +
          (delta > 0 ? '+' : '') + delta + ' ' + k.unit + ' <span data-key="dp_per_month">' + tr('per_month') + '</span>' +
          '  <span class="text-[10px] text-slate-500 ml-1">' + prev + ' → ' + tgt + '</span></td>' +
          '  <td class="py-2 px-2 text-xs text-right">' + actualTd + '</td>' +
          '</tr>');
      });
    });
  }
  if (!rows.length) {
    return '<div class="text-center text-slate-500 text-sm py-8">' + tr('empty') + '</div>';
  }
  return '' +
    '<div class="overflow-x-auto"><table class="w-full border-collapse">' +
    '  <thead><tr class="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-600">' +
    '    <th class="py-2 px-2">' + tr('dp_month') + '</th>' +
    '    <th class="py-2 px-2">' + tr('dp_dept') + '</th>' +
    '    <th class="py-2 px-2">' + tr('dp_kpi') + '</th>' +
    '    <th class="py-2 px-2 text-right">' + tr('dp_tasks') + '</th>' +
    '    <th class="py-2 px-2 text-right">' + tr('dp_actual') + '</th>' +
    '  </tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}

function translateDynamic() {
  const ctx = document.getElementById('dev-plan');
  if (!ctx) return;
  ctx.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.getAttribute('data-key');
    const txt = tr(k);
    if (txt !== k) el.textContent = txt;
  });
}

function render() {
  const host = document.getElementById('dev-plan');
  if (!host) return;
  host.innerHTML =
    '  <div class="text-center mb-10">' +
    '    <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 text-violet-200 text-[10px] font-bold uppercase tracking-widest mb-3 border border-violet-500/30">' +
    '      <i class="fas fa-diagram-project"></i> Research &amp; Development</span>' +
    '    <h2 class="text-2xl md:text-3xl font-bold mb-3" data-key="dp_title">Development Plan</h2>' +
    '    <p class="text-slate-300 max-w-3xl mx-auto text-sm" data-key="dp_desc">The factory\u2019s targets, distributed to every department as monthly tasks.</p>' +
    '  </div>' +
    summaryStripHtml() +
    '  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 mb-6">' +
    '    <div class="col-span-full flex flex-wrap items-center justify-between gap-2 mb-2">' +
    '      <h3 class="text-sm font-bold text-slate-300"><i class="fas fa-crosshairs mr-2 text-emerald-400"></i>' +
    '        <span data-key="dp_trajectory">Monthly trajectory</span></h3>' +
    chartDeptSelect() +
    '    </div>' +
    '    <div class="col-span-full bg-slate-900 rounded-2xl border border-slate-700/70 p-4">' +
    '      <canvas id="dp-chart" height="260"></canvas>' +
    '    </div>' +
    '  </div>' +
    '  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
    '    <div> ' +
    '      <h3 class="text-sm font-bold text-slate-300 mb-3"><i class="fas fa-people-group mr-2 text-cyan-400"></i>' +
    '        <span data-key="dp_depts_title">Departments &amp; targets</span></h3>' +
    '      <div class="space-y-4">' +
    plan.departments.map((d) => deptCardHtml(d)).join('') +
    '      </div>' +
    '    </div>' +
    '    <div>' +
    '      <h3 class="text-sm font-bold text-slate-300 mb-3"><i class="fas fa-list-check mr-2 text-amber-400"></i>' +
    '        <span data-key="dp_tasks_title">Task board — who does what</span></h3>' +
    '      <div class="bg-slate-900 rounded-2xl border border-slate-700/70 p-4">' + taskBoardHtml() + '</div>' +
    '      <div class="flex flex-wrap gap-2 mt-4">' +
    '        <button onclick="SAE_DevPlan && SAE_DevPlan.toggleEdit()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold"><i class="fas fa-pen mr-1"></i><span data-key="dp_edit">Edit plan</span></button>' +
    '        <button onclick="SAE_DevPlan && SAE_DevPlan.toggleActuals()" class="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-xs font-semibold"><i class="fas fa-clipboard-check mr-1"></i><span data-key="dp_actuals">Record actuals</span></button>' +
    '        <button onclick="SAE_DevPlan && SAE_DevPlan.exportCSV()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold"><i class="fas fa-file-csv mr-1"></i><span data-key="dp_export">Export CSV</span></button>' +
    '        <button onclick="SAE_DevPlan && SAE_DevPlan.resetToTemplate()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold"><i class="fas fa-rotate-left mr-1"></i><span data-key="dp_reset">Reset template</span></button>' +
    '      </div>' +
    '      <div id="dp-edit-slot" class="mt-4"></div>' +
    '    </div>' +
    '  </div>' +
    '  <div class="mt-6 bg-slate-900 rounded-2xl border border-slate-700/70 p-5">' +
    '    <div class="flex items-center gap-3 mb-4">' +
    '      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-sm"><i class="fas fa-calculator"></i></div>' +
    '      <div>' +
    '        <div class="text-base font-bold text-white" data-key="dp_ops_title">Capacity planner</div>' +
    '        <div class="text-[10px] text-slate-400" data-key="dp_ops_desc">Turn the monthly concrete target into an everyday task for every department.</div>' +
    '      </div>' +
    '    </div>' +
    '    <div id="dp-ops"></div>' +
    '  </div>';
  translateDynamic();
  renderOps();
  renderChart();
}

/* ── المخطط الزمني ──────────────────────────────────────────────────── */

function renderChart() {
  const cv = document.getElementById('dp-chart');
  if (!cv || typeof Chart === 'undefined') return;
  const d = deptById(chartDept);
  if (!d) return;
  const labels = [tr('dp_now'), ...d.kpis[0].targets.map((_, i) => tr('dp_month') + ' ' + (i + 1))];
  const palettes = ['#34D399', '#22D3EE', '#A78BFA', '#FBBF24', '#F472B6'];
  const datasets = [];
  d.kpis.forEach((k, i) => {
    const col = palettes[i % palettes.length];
    datasets.push({
      label: translatorForKey(k.nameKey),
      data: [k.current, ...k.targets],
      borderColor: col,
      backgroundColor: col + '26',
      fill: true, tension: 0.3, borderWidth: 2, pointRadius: 3, pointBackgroundColor: col,
    });
    if ((k.actuals || []).some((v) => v !== null && v !== undefined)) {
      datasets.push({
        label: translatorForKey(k.nameKey) + ' · ' + tr('dp_actual').toLowerCase(),
        type: 'line',
        showLine: false,
        spanGaps: false,
        data: [null, ...k.actuals],
        borderColor: '#F8FAFC',
        backgroundColor: '#FFFFFF',
        pointRadius: 6, pointHoverRadius: 8, pointStyle: 'rect',
      });
    }
  });
  const opts = {
    animation: false, responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#E2E8F0', font: { size: 10 }, boxWidth: 12 } },
      tooltip: { backgroundColor: '#0F172A', titleColor: '#E2E8F0', bodyColor: '#CBD5E1' },
    },
    scales: {
      x: { ticks: { color: '#94A3B8', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.12)' } },
      y: { ticks: { color: '#94A3B8', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.12)' } },
    },
  };
  if (chart) { chart.destroy(); }
  chart = new Chart(cv.getContext('2d'), { type: 'line', data: { labels, datasets }, options: opts });
}

function translatorForKey(key) {
  const txt = tr(key);
  return txt !== key ? txt : key;
}

/* ── التعديل المباشر (المدخلات) ─────────────────────────────────────── */

function editSlotHtml() {
  const rows = [];
  if (!editing) editing = { mode: 'plan' };
  const showActuals = editing.mode === 'actuals';
  plan.departments.forEach((d, di) => {
    rows.push('<h4 class="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mt-3 mb-2" data-key="' + d.nameKey + '">' + d.nameKey + '</h4>');
    d.kpis.forEach((k, ki) => {
      const actualIn = (k.actuals || []).map((v, mi) =>
        '<label class="text-[9px] text-slate-500">' + tr('dp_actual') + ' ' + tr('dp_month') + ' ' + (mi + 1) +
        '<input data-plan="actual" data-m="' + mi + '" type="number" step="0.5" value="' + (v === null || v === undefined ? '' : v) + '" placeholder="—" class="w-20 ml-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white">' +
        '</label>').join('');
      const targetIn = k.targets.map((v, mi) =>
        '<label class="text-[9px] text-slate-500">' + tr('dp_month') + ' ' + (mi + 1) +
        '<input data-plan="target" data-m="' + mi + '" type="number" step="0.5" value="' + v + '" class="w-20 ml-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white">' +
        '</label>').join('');
      rows.push('<div data-row data-di="' + di + '" data-ki="' + ki + '" class="flex flex-wrap items-center gap-2 py-1.5 border-b border-slate-800 last:border-0">' +
        '<span class="w-36 text-xs text-slate-300 truncate" data-key="' + k.nameKey + '">' + k.nameKey + '</span>' +
        (showActuals ? '' : '<label class="text-[9px] text-slate-500">' + tr('dp_current') +
          '<input data-plan="current" type="number" value="' + k.current + '" class="w-20 ml-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white">' +
          '</label>') +
        (showActuals ? actualIn : targetIn) +
        '<button onclick="SAE_DevPlan && SAE_DevPlan.removeKpi(this)" class="px-2 py-1 rounded bg-rose-600/20 text-rose-300 text-[10px]" title="Remove"><i class="fas fa-xmark"></i></button>' +
        '</div>');
    });
  });
  rows.push(
    '<div class="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-slate-700">' +
    '  <select id="dp-new-dept" class="px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-white">' +
    plan.departments.map((d) => `<option value="${d.id}">${tr(d.nameKey)}</option>`).join('') +
    '  </select>' +
    '  <input id="dp-new-name" placeholder="KPI name" class="flex-1 min-w-[120px] px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-white">' +
    '  <input id="dp-new-unit" placeholder="m³" class="w-24 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-white">' +
    '  <button onclick="SAE_DevPlan && SAE_DevPlan.addKpi()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold"><i class="fas fa-plus mr-1"></i><span data-key="dp_add_kpi">Add KPI</span></button>' +
    '</div>'
  );
  rows.push(
    '<div class="flex gap-2 mt-4">' +
    '  <button onclick="SAE_DevPlan && SAE_DevPlan.commit()" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold"><i class="fas fa-check mr-1"></i><span data-key="dp_save">Save plan</span></button>' +
    '  <button onclick="SAE_DevPlan && SAE_DevPlan.cancelEdit()" class="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold"><span data-key="dp_cancel">Cancel</span></button>' +
    '</div>'
  );
  return rows.join('');
}

let editing = null;
function toggleEdit() {
  editing = editing && editing.mode === 'plan' ? null : { mode: 'plan' };
  const slot = document.getElementById('dp-edit-slot');
  if (!slot) return;
  slot.innerHTML = editing ? editSlotHtml() : '';
  translateRecursive(slot);
  renderChart();
}
function toggleActuals() {
  editing = editing && editing.mode === 'actuals' ? null : { mode: 'actuals' };
  const slot = document.getElementById('dp-edit-slot');
  if (!slot) return;
  slot.innerHTML = editing ? editSlotHtml() : '';
  translateRecursive(slot);
  renderChart();
}
function translateRecursive(root) {
  root.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.getAttribute('data-key');
    const txt = tr(k);
    if (txt !== k) el.textContent = txt;
  });
}
function cancelEdit() { editing = null; const s = document.getElementById('dp-edit-slot'); if (s) s.innerHTML = ''; }

function removeKpi(btn) {
  const row = btn.closest('div[data-row]');
  if (!row) return;
  const di = parseInt(row.getAttribute('data-di'), 10);
  const ki = parseInt(row.getAttribute('data-ki'), 10);
  const d = plan.departments[di];
  if (d && d.kpis[ki]) { d.kpis.splice(ki, 1); save(); reflowEdit(); }
}

function commit() {
  const slot = document.getElementById('dp-edit-slot');
  if (!slot) return;
  plan.departments.forEach((d, dix) => {
    d.kpis.forEach((k, kix) => {
      const row = slot.querySelector(`div[data-row][data-di="${dix}"][data-ki="${kix}"]`);
      if (!row) return;
      const cur = row.querySelector('input[data-plan="current"]');
      if (cur) k.current = parseFloat(cur.value);
      row.querySelectorAll('input[data-plan="target"]').forEach((t) => {
        const mi = parseInt(t.getAttribute('data-m'), 10);
        if (Number.isFinite(mi) && k.targets[mi] !== undefined) k.targets[mi] = parseFloat(t.value) || 0;
      });
      row.querySelectorAll('input[data-plan="actual"]').forEach((a) => {
        const mi = parseInt(a.getAttribute('data-m'), 10);
        if (!Number.isFinite(mi) || k.actuals[mi] === undefined) return;
        const v = a.value.trim();
        k.actuals[mi] = v === '' ? null : (parseFloat(v) || 0);
      });
    });
  });
  save();
  editing = null;
  render();
}

function reflowEdit() {
  const slot = document.getElementById('dp-edit-slot');
  if (slot) { slot.innerHTML = editSlotHtml(); translateRecursive(slot); }
}

function addKpi() {
  const name = document.getElementById('dp-new-name')?.value.trim();
  const deptId = document.getElementById('dp-new-dept')?.value;
  const unit = document.getElementById('dp-new-unit')?.value.trim() || 'u';
  const d = deptById(deptId);
  if (!d) return;
  d.kpis.push({
    id: 'k' + Date.now(),
    nameKey: name || 'KPI',
    unit,
    current: 0,
    targets: [0, 0, 0],
    actuals: [null, null, null],
  });
  save();
  reflowEdit();
}

function selectChartDept(id) {
  chartDept = id;
  renderChart();
}

/* ── تصدير CSV ──────────────────────────────────────────────────────── */

function exportCSV() {
  const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const header = ['department', 'key', 'unit', 'current', 'M1', 'M2', 'M3', 'A1', 'A2', 'A3', 'delta_final', 'ontrack'];
  const lines = [header.join(',')];
  plan.departments.forEach((d) => {
    d.kpis.forEach((k) => {
      const last = k.targets[k.targets.length - 1];
      const delta = Math.round((last - k.current) * 10) / 10;
      const rec = (k.actuals || []).filter((v) => v !== null && v !== undefined).length;
      const met = (k.actuals || []).filter((_, i) => achievedAt(k, i) === true).length;
      lines.push([d.nameKey, k.nameKey, k.unit, k.current, ...k.targets,
        ...k.actuals.map((v) => v === null || v === undefined ? '' : v),
        delta, rec ? met + '/' + rec : ''].map(esc).join(','));
    });
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sae-development-plan.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* ── حاسبة القدرة التشغيلية: من التارجت الشهري للمهمة اليومية ───────── */

const OPS_KEY = 'sae-devplan-ops-v1';
const opsDefaults = {
  workingDays: 26,
  mixerLoad: 7,
  shiftHours: 12,
  loadUnload: 20,
  reservePct: 8,
  pricePerM3: 900,
  sampleEvery: 60,
};
let ops = null;
let opsMonth = 0;

function loadOps() {
  try {
    const raw = localStorage.getItem(OPS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') { ops = Object.assign({}, opsDefaults, p); return; }
    }
  } catch (e) { /* corrupt */ }
  ops = Object.assign({}, opsDefaults);
  saveOps();
}
function saveOps() {
  try { localStorage.setItem(OPS_KEY, JSON.stringify(ops)); } catch (e) { /* storage blocked */ }
}

function findKpi(deptId, kpiId) {
  const d = deptById(deptId);
  return d ? (d.kpis.find((k) => k.id === kpiId) || null) : null;
}

/* القيم المحسوبة من التارجت + الافتراضات (بدون أي منطق عرض). */
function computeOps() {
  const concrete = findKpi('sales', 'concrete');
  const turnaround = findKpi('logistics', 'turnaround');
  const stations = (deptById('plants') || {}).kpis || [];
  const out = { salesTarget: 0, daily: 0, tripsPerDay: 0, cycleMin: 0, tripsPerMixer: 0, mixers: 0, samples: 0, revenue: 0, stations: [], util: 0 };
  if (!concrete || !turnaround) return out;
  const target = concrete.targets[opsMonth] || concrete.current || 0;
  const buf = 1 + (ops.reservePct || 0) / 100;
  const daily = target / Math.max(1, ops.workingDays) * buf;
  const tripsPerDay = daily / Math.max(0.1, ops.mixerLoad);
  const cycleMin = (turnaround.targets[opsMonth] || turnaround.current || 0) + (ops.loadUnload || 0);
  const tripsPerMixer = Math.max(1, Math.round((ops.shiftHours * 60) / Math.max(1, cycleMin)));
  const mixers = Math.max(1, Math.ceil(tripsPerDay / tripsPerMixer));
  const samples = Math.ceil(target / Math.max(1, ops.sampleEvery));
  const curSum = stations.reduce((a, k) => a + (k.current || 0), 0);
  const totalDaily = curSum / Math.max(1, ops.workingDays);
  out.salesTarget = Math.round(target);
  out.daily = Math.round(daily);
  out.tripsPerDay = Math.round(tripsPerDay * 10) / 10;
  out.cycleMin = Math.round(cycleMin);
  out.tripsPerMixer = tripsPerMixer;
  out.mixers = mixers;
  out.samples = samples;
  out.revenue = Math.round(target * (ops.pricePerM3 || 0));
  out.util = totalDaily ? Math.round((daily / totalDaily) * 100) : 0;
  out.stations = stations.map((k) => {
    const curDaily = (k.current || 0) / Math.max(1, ops.workingDays);
    const share = curSum ? (k.current || 0) / curSum : 0;
    const req = daily * share;
    const u = curDaily ? Math.round((req / curDaily) * 100) : 0;
    return { nameKey: k.nameKey, unit: k.unit || 'm³', req: Math.round(req), util: Math.max(0, Math.min(400, u)) };
  });
  return out;
}

function opsInput(labelKey, attr, step) {
  return `<label class="flex flex-col gap-1 text-[9px] text-slate-500">
    <span data-key="${labelKey}">${labelKey}</span>
    <input data-op="${attr}" type="number" step="${step || '1'}" value="${ops[attr]}" onchange="SAE_DevPlan && SAE_DevPlan.setOps('${attr}', this.value)"
      class="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-white font-mono"></label>`;
}

function renderOps() {
  const host = document.getElementById('dp-ops');
  if (!host || !ops) return;
  const c = computeOps();
  const monthBtns = () => {
    let html = '';
    for (let m = 0; m < plan.horizon; m++) {
      html += `<button onclick="SAE_DevPlan && SAE_DevPlan.setOpsMonth(${m})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${m === opsMonth ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}">${tr('dp_month')} ${m + 1}</button>`;
    }
    return html;
  };
  const stationRows = c.stations.length ? c.stations.map((s) => `
      <div class="flex items-center gap-2 py-1 border-b border-slate-800 last:border-0">
        <span class="text-[10px] text-slate-300 flex-1 truncate" data-key="${s.nameKey}">${s.nameKey}</span>
        <span class="text-[10px] text-slate-400 font-mono">${s.req} ${s.unit}</span>
        <div class="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div class="h-full ${s.util > 100 ? 'bg-rose-500' : 'bg-emerald-500'} rounded-full" style="width:${Math.min(100, s.util)}%"></div>
        </div>
        <span class="text-[10px] w-8 text-right font-mono ${s.util > 100 ? 'text-rose-300' : 'text-emerald-300'}">${s.util}%</span>
      </div>`).join('') : '<div class="text-slate-500 text-[10px] py-2">—</div>';
  host.innerHTML =
    '<div class="flex flex-col lg:flex-row gap-6">' +
    /* الافتراضات */
    '  <div class="lg:w-72 shrink-0">' +
    '    <div class="text-[11px] font-bold text-slate-400 mb-3"><i class="fas fa-sliders mr-1"></i><span data-key="dp_ops_assume">Assumptions</span></div>' +
    '    <div class="grid grid-cols-2 gap-2">' +
    opsInput('dp_a_days', 'workingDays') + opsInput('dp_a_load', 'mixerLoad', '0.5') +
    opsInput('dp_a_shift', 'shiftHours', '0.5') + opsInput('dp_a_unload', 'loadUnload') +
    opsInput('dp_a_reserve', 'reservePct') + opsInput('dp_a_price', 'pricePerM3', '50') +
    opsInput('dp_a_sample', 'sampleEvery') +
    '    </div>' +
    '  </div>' +
    /* النتائج */
    '  <div class="flex-1">' +
    '    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
    '      <div class="flex gap-2">' + monthBtns() + '</div>' +
    '      <div class="flex items-center gap-2 text-[10px] text-slate-400"><i class="fas fa-bullseye text-cyan-400"></i>' +
    `        <span>${tr('dp_ops_target')}</span>: <b class="text-cyan-300 font-mono">${c.salesTarget} m³/${tr('dp_month').toLowerCase()} ${opsMonth + 1}</b></div>` +
    '    </div>' +
    '    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">' +
    /* المبيعات */
    '      <div class="bg-slate-800 rounded-xl border border-slate-700/70 p-4">' +
    '        <div class="text-[10px] uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-sack-dollar text-emerald-400 mr-1"></i><span data-key="dp_dept_sales">Sales</span></div>' +
    `        <div class="text-2xl font-extrabold text-white font-mono">${c.salesTarget.toLocaleString()}</div>` +
    '        <div class="text-[9px] text-slate-400 mt-1" data-key="dp_per_month">per month</div>' +
    `        <div class="mt-2 pt-2 border-t border-slate-700/60 text-[10px] text-slate-400">${tr('dp_ops_rev')}: <b class="text-emerald-300 font-mono">${c.revenue.toLocaleString()}</b></div>` +
    '      </div>' +
    /* المحطات */
    '      <div class="bg-slate-800 rounded-xl border border-slate-700/70 p-4">' +
    '        <div class="text-[10px] uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-industry text-cyan-400 mr-1"></i><span data-key="dp_dept_plants">Batch Plants</span></div>' +
    `        <div class="text-2xl font-extrabold text-white font-mono">${c.daily.toLocaleString()} <span class="text-sm text-slate-400">m³</span></div>` +
    '        <div class="text-[9px] text-slate-400 mt-1" data-key="dp_ops_dayreq">required daily (w/ buffer)</div>' +
    `        <div class="mt-1 text-[10px] text-slate-400">${tr('dp_ops_util')}: <b class="${c.util > 100 ? 'text-rose-300' : 'text-emerald-300'} font-mono">${c.util}%</b></div>` +
    '        <div class="mt-2">' + stationRows + '</div>' +
    '      </div>' +
    /* اللوجستيات */
    '      <div class="bg-slate-800 rounded-xl border border-slate-700/70 p-4">' +
    '        <div class="text-[10px] uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-truck-fast text-amber-400 mr-1"></i><span data-key="dp_dept_logistics">Logistics</span></div>' +
    `        <div class="text-2xl font-extrabold text-white font-mono">${c.mixers} <span class="text-sm text-slate-400">${tr('dp_ops_mixers')}</span></div>` +
    '        <div class="text-[9px] text-slate-400 mt-1 flex flex-col gap-0.5">' +
    `          <span>${tr('dp_ops_trips')}: <b class="text-amber-300 font-mono">${c.tripsPerDay}</b></span>` +
    `          <span>${tr('dp_ops_cycle')}: <b class="text-slate-200 font-mono">${c.cycleMin} ${tr('dp_unit_min')}</b> → ${c.tripsPerMixer}/${tr('dp_ops_shift')}</span>` +
    '        </div>' +
    '      </div>' +
    /* الجودة */
    '      <div class="bg-slate-800 rounded-xl border border-slate-700/70 p-4">' +
    '        <div class="text-[10px] uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-flask text-violet-400 mr-1"></i><span data-key="dp_dept_quality">Quality Lab</span></div>' +
    `        <div class="text-2xl font-extrabold text-white font-mono">${c.samples} <span class="text-sm text-slate-400">${tr('dp_ops_samples')}</span></div>` +
    `        <div class="text-[9px] text-slate-400 mt-1">${tr('dp_ops_every')} ${ops.sampleEvery} m³</div>` +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>';
  translateDynamic();
}

function setOpsMonth(m) {
  opsMonth = Math.max(0, Math.min(plan.horizon - 1, m));
  renderOps();
}
function setOps(attr, val) {
  const num = parseFloat(val);
  ops[attr] = Number.isFinite(num) ? num : ops[attr];
  saveOps();
  renderOps();
}

/* ── إقلاع + إعادة رسم عند تغيير اللغة ───────────────────────────────── */

let langObserver = null;
function initDevPlan() {
  load();
  loadOps();
  const host = document.getElementById('dev-plan');
  if (!host) return null;
  render();
  if (langObserver) langObserver.disconnect();
  langObserver = new MutationObserver(() => render());
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.SAE_DevPlan = {
    selectChartDept, toggleEdit, toggleActuals, commit, cancelEdit, removeKpi, addKpi,
    exportCSV, resetToTemplate, getPlan: () => plan,
    getStats: () => ({ recorded: recordedCount(), met: metCount() }),
    setOpsMonth, setOps, computeOps: () => computeOps(),
  };
  return window.SAE_DevPlan;
}

export { initDevPlan, template };