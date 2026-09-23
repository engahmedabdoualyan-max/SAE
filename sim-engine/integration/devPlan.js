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

/* ── المسميات الوظيفية: كل مهمة تُسند لمسمى ومسؤولية قسمه. ───────────── */
const POSITIONS = [
  { k: 'pos_plant_mgr',   key: 'dp_mgmt_pos_plant_mgr',   icon: 'fa-user-tie',   deptId: null },
  { k: 'pos_station_mgr', key: 'dp_mgmt_pos_station_mgr', icon: 'fa-user-gear',  deptId: 'plants' },
  { k: 'pos_quality',     key: 'dp_mgmt_pos_quality',     icon: 'fa-user-graduate', deptId: 'quality' },
  { k: 'pos_sales',       key: 'dp_mgmt_pos_sales',       icon: 'fa-user-tag',   deptId: 'sales' },
  { k: 'pos_logistics',   key: 'dp_mgmt_pos_logistics',   icon: 'fa-user-clock', deptId: 'logistics' },
  { k: 'pos_hr',          key: 'dp_mgmt_pos_hr',          icon: 'fa-user-shield', deptId: null },
  { k: 'pos_finance',     key: 'dp_mgmt_pos_finance',     icon: 'fa-user-crown', deptId: null },
];

function posByKey(k) { return POSITIONS.find((p) => p.k === k) || POSITIONS[0]; }

/* نموذج إدارة التنفيذ: اعتماد، مهام، تكلفة، مشاكل، تقييمات. */
function mgmtDefaults() {
  return {
    status: 'draft',            /* draft → mgmt_ok → finance_pending → finance_ok → distributed → monitoring */
    logs: [],                   /* {at, role, note} */
    costRequested: 0,
    costApproved: 0,
    financeNote: '',
    tasks: [],
    staffReqs: [],
    problems: [],
    baselines: [],              /* snapshots للـ roadmap للمقارنة */
  };
}

/* ── Critical Path Method (CPM): حساب المسار الحرج ──────────────────── */

/* Forward pass: حساب Early Start (ES) و Early Finish (EF) */
function calculateEarlyTimes(tasks) {
  const es = {}; /* Early Start */
  const ef = {}; /* Early Finish */
  const sorted = [];

  /* Topological sort */
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const t = tasks.find((x) => x.id === id);
    if (t && t.predecessors) {
      t.predecessors.forEach((pid) => visit(pid));
    }
    sorted.push(id);
  }
  tasks.forEach((t) => visit(t.id));

  sorted.forEach((id) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const maxPredEF = t.predecessors.reduce((max, pid) => Math.max(max, ef[pid] || 0), 0);
    es[id] = maxPredEF;
    ef[id] = es[id] + (t.duration || 1);
  });

  return { es, ef };
}

/* Backward pass: حساب Late Start (LS) و Late Finish (LF) */
function calculateLateTimes(tasks) {
  const ls = {}; /* Late Start */
  const lf = {}; /* Late Finish */

  /* Find max EF (project duration) */
  const { ef } = calculateEarlyTimes(tasks);
  const projectDuration = Math.max(...Object.values(ef), 0);

  /* Initialize LF for all tasks */
  tasks.forEach((t) => { lf[t.id] = projectDuration; });

  /* Reverse topological sort */
  const reversed = tasks.map((t) => t.id).reverse();

  reversed.forEach((id) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;

    /* Find successors (tasks that depend on this one) */
    const successors = tasks.filter((s) => s.predecessors && s.predecessors.includes(id));
    if (successors.length > 0) {
      const minSuccLS = Math.min(...successors.map((s) => ls[s.id] || projectDuration));
      lf[id] = minSuccLS;
    } else {
      lf[id] = projectDuration;
    }
    ls[id] = lf[id] - (t.duration || 1);
  });

  return { ls, lf };
}

/* حساب Float وتحديد المسار الحرج */
function calculateCPM() {
  const tasks = plan.mgmt.tasks || [];
  if (tasks.length === 0) return { criticalPath: [], totalFloat: 0 };

  const { es, ef } = calculateEarlyTimes(tasks);
  const { ls, lf } = calculateLateTimes(tasks);

  let totalFloat = 0;
  const criticalPath = [];

  tasks.forEach((t) => {
    const float = (ls[t.id] || 0) - (es[t.id] || 0);
    t.float = float;
    t.isCritical = float === 0;
    totalFloat += float;

    if (t.isCritical) {
      criticalPath.push(t);
    }
  });

  save();
  return { criticalPath, totalFloat, projectDuration: Math.max(...Object.values(ef), 0) };
}

/* إضافة predecessor لمهمة */
function addPredecessor(taskId, predId) {
  const t = plan.mgmt.tasks.find((x) => String(x.id) === String(taskId));
  if (!t) return { error: 'no-task' };
  if (!t.predecessors) t.predecessors = [];
  if (!t.predecessors.includes(Number(predId)) && !t.predecessors.includes(String(predId))) {
    t.predecessors.push(predId);
  }
  save();
  calculateCPM();
  render();
  return { ok: true, predecessors: t.predecessors };
}

/* حذف predecessor */
function removePredecessor(taskId, predId) {
  const t = plan.mgmt.tasks.find((x) => String(x.id) === String(taskId));
  if (!t) return { error: 'no-task' };
  t.predecessors = (t.predecessors || []).filter((p) => String(p) !== String(predId));
  save();
  calculateCPM();
  render();
  return { ok: true, predecessors: t.predecessors };
}

/* تغيير مدة المهمة */
function setTaskDuration(taskId, duration) {
  const t = plan.mgmt.tasks.find((x) => String(x.id) === String(taskId));
  if (!t) return { error: 'no-task' };
  t.duration = Number(duration) || 1;
  save();
  calculateCPM();
  render();
  return { ok: true, duration: t.duration };
}

/* ── Baselines: حفظ snapshot للمقارنة ─────────────────────────────── */

function saveBaseline() {
  const r = ensureRoadmap();
  const baseline = {
    id: Date.now() % 100000,
    savedAt: new Date().toISOString(),
    current: r.current,
    target: r.target,
    horizon: r.horizon,
    phases: JSON.parse(JSON.stringify(r.phases)),
    tasks: JSON.parse(JSON.stringify(plan.mgmt.tasks || [])),
  };
  plan.mgmt.baselines = plan.mgmt.baselines || [];
  plan.mgmt.baselines.push(baseline);
  save();
  render();
  return { ok: true, baselineId: baseline.id };
}

function deleteBaseline(id) {
  plan.mgmt.baselines = (plan.mgmt.baselines || []).filter((b) => String(b.id) !== String(id));
  save();
  render();
  return { ok: true };
}

function restoreBaseline(id) {
  const b = (plan.mgmt.baselines || []).find((x) => String(x.id) === String(id));
  if (!b) return { error: 'no-baseline' };
  const r = ensureRoadmap();
  r.current = b.current;
  r.target = b.target;
  r.horizon = b.horizon;
  r.phases = JSON.parse(JSON.stringify(b.phases));
  plan.mgmt.tasks = JSON.parse(JSON.stringify(b.tasks));
  save();
  render();
  renderChart();
  return { ok: true };
}

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
  if (!p.roadmap || !Array.isArray(p.roadmap.phases) || !p.roadmap.phases.length) {
    p.roadmap = buildRoadmap(p);
  }
  if (!p.mgmt || typeof p.mgmt !== 'object') p.mgmt = mgmtDefaults();
  p.mgmt.status = p.mgmt.status || 'draft';
  if (!Array.isArray(p.mgmt.logs)) p.mgmt.logs = [];
  if (!Array.isArray(p.mgmt.tasks)) p.mgmt.tasks = [];
  if (!Array.isArray(p.mgmt.staffReqs)) p.mgmt.staffReqs = [];
  if (!Array.isArray(p.mgmt.problems)) p.mgmt.problems = [];
  if (!p.mgmt.baselines) p.mgmt.baselines = [];
  p.mgmt.tasks.forEach((t) => {
    t.title = t.title || '';
    t.position = t.position || 'pos_plant_mgr';
    t.deptId = t.deptId || null;
    t.status = t.status || 'todo';
    t.cost = Number(t.cost) || 0;
    t.followups = Array.isArray(t.followups) ? t.followups : [];
    t.eval = t.eval || { score: null, note: '' };
    t.predecessors = Array.isArray(t.predecessors) ? t.predecessors : [];
    t.duration = Number(t.duration) || 1;
    t.float = t.float || 0;
    t.isCritical = t.isCritical || false;
  });
  p.mgmt.staffReqs.forEach((s) => {
    s.position = s.position || 'pos_plant_mgr';
    s.status = s.status || 'pending';
    s.reason = s.reason || '';
  });
  p.mgmt.problems.forEach((q) => {
    q.text = q.text || '';
    q.severity = q.severity || 'med';
    q.targetMonth = Number(q.targetMonth) || 1;
    q.status = q.status || 'open';
    q.note = q.note || '';
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
  plan.mgmt = mgmtDefaults();
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
  const mg = plan.mgmt || {};
  const mTasks = (mg.tasks || []).filter((t) => t.status === 'done').length + '/' + (mg.tasks || []).length;
  const mProbs = (mg.problems || []).filter((p) => p.status !== 'solved').length;
  const blocks = [
    [plan.departments.length, tr('dp_depts')],
    [totalKpis, tr('dp_active')],
    [plan.horizon, tr('dp_horizon')],
    [avg + '%', tr('dp_avgProg')],
    [rec ? met + '/' + rec : '—', tr('dp_ontrack')],
    [(mg.tasks || []).length ? mTasks : '—', tr('dp_mgmt_st_done')],
    [mProbs, tr('dp_mgmt_prob_open')],
  ];
  return '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">' + blocks.map(([v, l]) =>
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
    roadmapSectionHtml() +
    mgmtSectionHtml() +
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
  renderRoadReviewChart();
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

/* القيم المحسوبة من تارجت معيّن + الافتراضات (بدون أي منطق عرض). */
function opsModel(target) {
  const turnaround = findKpi('logistics', 'turnaround');
  const stations = (deptById('plants') || {}).kpis || [];
  const out = { salesTarget: 0, daily: 0, tripsPerDay: 0, cycleMin: 0, tripsPerMixer: 0, mixers: 0, samples: 0, revenue: 0, stations: [], util: 0 };
  if (!turnaround) return out;
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

function computeOps() {
  const concrete = findKpi('sales', 'concrete');
  if (!concrete) return opsModel(0);
  return opsModel(concrete.targets[opsMonth] || concrete.current || 0);
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

/* ── خطة PMP: الوضع الحالي ← هدف الوصول ← زمن الوصول ← مراحل ← تقييم ─ */

const ROAD_DEFAULTS = { horizon: 6, phases: 3, phaseNames: [] };
const ROAD_KEY = 'sae-devplan-road-v1';

function findKpiGlobal(deptId, kpiId) {
  const d = deptById(deptId);
  return d ? (d.kpis.find((k) => k.id === kpiId) || null) : null;
}

/* بناء roadmap افتراضيًا من الخرسانة: حالي→هدف مع تقسيم المراحل. */
function buildRoadmap(p) {
  const d = (p.departments || []).find((dd) => dd.id === 'sales');
  const concrete = d ? (d.kpis || []).find((k) => k.id === 'concrete') || null : null;
  const cur = concrete ? concrete.current : 5000;
  const tgt = concrete && Array.isArray(concrete.targets) && concrete.targets.length ? concrete.targets[concrete.targets.length - 1] : 6500;
  const total = 6;
  const n = 3;
  const phases = [];
  for (let i = 0; i < n; i++) {
    const startMonth = Math.round((total / n) * i) + 1;
    const endMonth = Math.round((total / n) * (i + 1));
    const plannedEnd = Math.round((cur + ((tgt - cur) * endMonth) / total) * 10) / 10;
    phases.push({ id: i + 1, name: '', startMonth, endMonth, plannedEnd, status: 'planned', actual: null, actualMonth: null, actualValue: null, notes: '' });
  }
  phases[0].status = 'active';
  return {
    goalName: 'خطة التطوير',
    current: cur,
    target: tgt,
    horizon: total,
    phaseCount: n,
    rebaselined: false,
    phases,
    evaluations: [],
    risks: [],
  };
}

function ensureRoadmap() {
  if (!plan.roadmap || !Array.isArray(plan.roadmap.phases) || !plan.roadmap.phases.length) {
    plan.roadmap = buildRoadmap(plan);
    save();
  }
  return plan.roadmap;
}

/* إعادة بناء خطة: مدخلات (حالي، هدف، شهور، مراحل) → مراحل موزّعة بالتساوي. */
function updateRoadmap(inputs) {
  const r = plan.roadmap;
  const cur = Number.isFinite(inputs.current) ? inputs.current : r.current;
  const tgt = Number.isFinite(inputs.target) ? inputs.target : r.target;
  const total = Number.isFinite(inputs.horizon) ? Math.max(1, Math.round(inputs.horizon)) : r.horizon;
  const n = Number.isFinite(inputs.phaseCount) ? Math.max(1, Math.min(12, Math.round(inputs.phaseCount))) : r.phaseCount;
  const phases = [];
  for (let i = 0; i < n; i++) {
    const startMonth = Math.round((total / n) * i) + 1;
    const endMonth = Math.round((total / n) * (i + 1));
    const plannedEnd = Math.round((cur + ((tgt - cur) * endMonth) / total) * 10) / 10;
    phases.push({ id: i + 1, name: (inputs.phaseNames && inputs.phaseNames[i]) || '', startMonth, endMonth, plannedEnd, status: 'planned', actual: null, actualMonth: null, actualValue: null, notes: '' });
  }
  phases[0].status = 'active';
  r.current = cur; r.target = tgt; r.horizon = total; r.phaseCount = n;
  r.phases = phases; r.rebaselined = false; r.evaluations = []; r.risks = [];
  syncRoadToConcrete();
  save();
  render();
  renderChart();
  return r;
}

/* دفع خطة المراحل إلى KPI الخرسانة ليقود الجدول/المهام/القدرة. */
function syncRoadToConcrete() {
  const r = plan.roadmap;
  const d = (plan.departments || []).find((dd) => dd.id === 'sales');
  const c = d ? (d.kpis || []).find((k) => k.id === 'concrete') || null : null;
  if (!c || !r || !Array.isArray(r.phases)) return;
  c.current = r.current;
  for (let i = 0; i < plan.horizon && i < r.phases.length; i++) {
    c.targets[i] = r.phases[i].plannedEnd;
  }
}

/* عقل المستشار: تحليل المنهجية + توصيات (مثل PMP EVM). */
function roadAnalytics() {
  const r = ensureRoadmap();
  const diff = r.target - r.current;
  const perMonth = diff / Math.max(1, r.horizon);
  const monthStep = (r.target - r.current) / Math.max(1, r.horizon);
  const a = {
    perMonth: Math.round(perMonth * 10) / 10,
    growthPct: r.current ? Math.round((monthStep / r.current) * 1000) / 10 : 0,
    spi: null, variance: null, verdict: 'idle', phaseIdx: 0, planPct: 0, donePct: 0,
    remaining: 0, needed: 0, scheduleRisk: false,
    eacMonths: null, monthsLate: 0, advice: null,
    messages: [],
  };
  const activeIdx = r.phases.findIndex((p) => p.status === 'active');
  const done = r.phases.filter((p) => p.status === 'done' && p.actualValue !== null && p.actualValue !== undefined);
  a.phaseIdx = activeIdx < 0 ? r.phases.length - 1 : activeIdx;
  /* SPI = القيمة المنجزة الفعلية / القيمة المخطط لها حتى زمن التقييم. */
  if (done.length) {
    const last = done[done.length - 1];
    a.spi = last.plannedEnd > 0 ? Math.round((last.actualValue / last.plannedEnd) * 100) / 100 : 1;
    a.variance = last.plannedEnd > 0 ? Math.round(((last.actualValue - last.plannedEnd) / last.plannedEnd) * 1000) / 10 : 0;
    a.verdict = a.spi >= 1.0 ? 'on' : 'late';
    a.donePct = Math.round((last.actualValue / Math.max(1, r.target)) * 100);
    a.planPct = last.plannedEnd ? Math.round((last.plannedEnd / Math.max(1, r.target)) * 100) : 0;
    a.remaining = r.target - last.actualValue;
    const monthsLeft = last.endMonth ? Math.max(1, r.horizon - last.endMonth) : r.horizon;
    a.needed = Math.round((a.remaining / monthsLeft) * 10) / 10;
    /* EAC (زمنيًا): كم شهرًا سيستغرق الهدف لو استمر الإيقاع الحالي؟ */
    a.eacMonths = Math.round((r.horizon / a.spi) * 10) / 10;
    a.monthsLate = Math.round((a.eacMonths - r.horizon) * 10) / 10;
    if (a.spi < 1.0) a.scheduleRisk = true;
    if (a.scheduleRisk) {
      a.advice = {
        lateMonths: a.monthsLate,
        fasterRate: a.needed,
        extendTo: Math.ceil(a.remaining / Math.max(1, a.perMonth) + (last.endMonth || 0)),
      };
    }
  } else {
    a.planPct = 0; a.donePct = 0;
    a.remaining = r.target - r.current;
    a.needed = a.perMonth;
  }
  return a;
}

/* طلب اليوم لكل قسم خلال المرحلة النشطة (يوزّع المهام من خطة المرحلة). */
function roadDeptFeed() {
  const r = ensureRoadmap();
  const active = r.phases.find((p) => p.status === 'active') || r.phases[r.phases.length - 1];
  const c = opsModel(active ? active.plannedEnd : r.target);
  return {
    phase: active ? active.id : null,
    plannedEnd: active ? active.plannedEnd : r.target,
    daily: c.daily, util: c.util, mixers: c.mixers, tripsPerDay: c.tripsPerDay,
    samples: c.samples, revenue: c.revenue, cycleMin: c.cycleMin,
    stations: c.stations,
  };
}

/* فحص الجدوى: هل تحقق أهداف المرحلة ممكن فعليًا على أرض المصنع؟ (قيد قدرة) */
function roadFeasibility() {
  const r = ensureRoadmap();
  const active = r.phases.find((p) => p.status === 'active') || r.phases[r.phases.length - 1];
  const target = active ? active.plannedEnd : r.target;
  const c = opsModel(target);
  const out = { target, daily: c.daily, util: c.util, stations: c.stations, warnings: [], ok: true };
  c.stations.forEach((s) => {
    if (s.util > 100) {
      out.ok = false;
      out.warnings.push({
        nameKey: s.nameKey,
        util: s.util,
        liftPct: Math.round((s.util - 100) / Math.max(1, s.util) * 100),
        req: s.req,
      });
    }
  });
  if (!out.ok) out.ok = false;
  return out;
}

function roadFeasHtml() {
  const f = roadFeasibility();
  if (!f) return '';
  const stationChips = f.stations.map((s) => {
    const hot = s.util > 100;
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md ' + (hot ? 'bg-rose-500/15 border border-rose-500/40 text-rose-200' : 'bg-slate-800 text-slate-300') + ' text-[10px]">' +
      '<span data-key="' + s.nameKey + '">' + tr(s.nameKey) + '</span><b class="font-mono">' + s.req + '</b> · ' + (hot ? '<i class="fas fa-triangle-exclamation text-[9px]"></i>' : '') + s.util + '%</span>';
  });
  return '' +
    '      <div class="mt-3 pt-3 border-t border-slate-700/60">' +
    '        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-shield-halved mr-1"></i><span data-key="dp_rm_feas">Feasibility on plant floor</span></div>' +
    '        <div class="flex flex-wrap gap-1.5 mb-2">' + stationChips.join('') + '</div>' +
    (f.ok
      ? '<div class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300"><i class="fas fa-circle-check mr-1"></i><span data-key="dp_rm_feas_ok">Plants can deliver this phase.</span></div>'
      : '<div class="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-[10px] text-rose-200 leading-relaxed"><i class="fas fa-triangle-exclamation mr-1"></i><span data-key="dp_rm_feas_warn">Not feasible at current capacity</span>: ' +
        f.warnings.map((w) => '<span data-key="' + w.nameKey + '">' + tr(w.nameKey) + '</span> <b class="font-mono">+' + w.liftPct + '%</b>').join(', ') + '</div>') +
    '      </div>';
}

/* ── سجل المخاطر: العقل يسجّل ويقيس المخاطر ويقترح المعالجة (أسلوب PMP). ── */
const RISK_LIK = { H: 5, M: 3, L: 1 };

/* فحص مستمر: تحويل الحالة الحالية (جدول زمني/قدرة) إلى سجل مخاطر مفتوح/مُعالج. */
function scanRisks() {
  const r = ensureRoadmap();
  if (!Array.isArray(r.risks)) r.risks = [];
  const a = roadAnalytics();
  const f = roadFeasibility();
  const now = Date.now();
  const cooked = [];

  /* مخاطرة الجدول الزمني: التخلف عن سباق الفترات → التأخر. */
  if (a.scheduleRisk && a.spi !== null) {
    const lik = a.monthsLate >= 2 ? 'H' : (a.monthsLate >= 1 ? 'M' : 'L');
    cooked.push({
      id: 'schedule', type: 'schedule', titleKey: 'dp_rm_risk_schedule',
      likelihood: lik, impact: 'H', score: RISK_LIK[lik] * 5,
      detail: { monthsLate: a.monthsLate, fasterRate: a.advice ? a.advice.fasterRate : a.needed, extendTo: a.advice ? a.advice.extendTo : r.horizon },
    });
  }
  /* مخاطرة القدرة: المستودعات لن تفي بمتطلبات المرحلة النشطة. */
  if (f && !f.ok) {
    const maxUtil = f.warnings.reduce((m, w) => Math.max(m, w.util), 0);
    const lik = maxUtil >= 120 ? 'H' : 'M';
    cooked.push({
      id: 'capacity', type: 'capacity', titleKey: 'dp_rm_risk_capacity',
      likelihood: lik, impact: 'H', score: RISK_LIK[lik] * 5,
      detail: { liftPct: Math.max.apply(null, f.warnings.map((w) => w.liftPct)), stations: f.warnings.length },
    });
  }

  /* مزامنة مع السجل الدائم: فتح الموجود، معالجة المختفي. */
  cooked.forEach((c) => {
    const open = r.risks.find((x) => x.id === c.id && x.status === 'open');
    if (open) {
      open.likelihood = c.likelihood; open.impact = c.impact; open.score = c.score; open.detail = c.detail;
      open.titleKey = c.titleKey;
    } else {
      /* إعادة فتح فقط إذا تفاقمت الخطورة عن آخر مخاطرة معالجة (موجة جديدة). */
      const prior = r.risks.filter((x) => x.id === c.id);
      const resolvedMax = Math.max.apply(null, [0].concat(
        prior.filter((x) => x.status !== 'open').map((x) => x.score || 0)));
      if (c.score <= resolvedMax) return;
      const wave = (prior.length ? Math.max.apply(null, prior.map((x) => x.wave || 1)) : 0) + 1;
      r.risks.push(Object.assign({ status: 'open', openedAt: now, closedAt: null, wave }, c));
    }
  });
  r.risks.forEach((x) => {
    if (x.status !== 'open') return;
    if (!cooked.find((c) => c.id === x.id)) { x.status = 'mitigated'; x.closedAt = now; }
  });
  return r.risks;
}

/* قبول التأخر صراحة (سيناريو "إبقاء الخطة") → تحويل المخاطرة إلى "مقبولة". */
function acceptRisk(id) {
  const r = ensureRoadmap();
  if (!Array.isArray(r.risks)) r.risks = [];
  scanRisks();
  const x = r.risks.find((z) => z.id === id && z.status === 'open')
    || r.risks.find((z) => z.id === id);
  if (x) { x.status = 'accepted'; x.closedAt = Date.now(); }
  return x || null;
}

/* تحويل مخاطرة مفتوحة إلى مُعالَجة بعد تطبيق خطة معالجة. */
function mitigateRisk(id) {
  const r = ensureRoadmap();
  if (!Array.isArray(r.risks)) r.risks = [];
  const x = r.risks.find((z) => z.id === id && z.status === 'open');
  if (x) { x.status = 'mitigated'; x.closedAt = Date.now(); }
  return x || null;
}

function roadRiskHtml() {
  const r = ensureRoadmap();
  const risks = scanRisks();
  const open = risks.filter((x) => x.status === 'open');
  const hist = risks.filter((x) => x.status !== 'open').slice(-3);
  const chip = (r2) => {
    const col = r2.score >= 20 ? 'bg-rose-500/15 border-rose-500/40 text-rose-200' : (r2.score >= 10 ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200');
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ' + col + ' text-[10px] font-mono"><i class="fas fa-shield-halved text-[9px]"></i> ' + r2.score + '</span>';
  };
  const mit = (r2) => r2.id === 'capacity'
    ? tr('dp_rm_risk_capacity_mit') + ' <b class="font-mono">+' + r2.detail.liftPct + '%</b>'
    : tr('dp_rm_risk_schedule_mit') + ' <b class="font-mono">' + fmtNum(r2.detail.fasterRate) + '</b>/mo <span class="text-slate-500">' + tr('dp_rm_or') + '</span> ' + tr('dp_rm_risk_extend') + ' <b class="font-mono">M' + r2.detail.extendTo + '</b>';
  return '' +
    '      <div class="mt-3 pt-3 border-t border-slate-700/60">' +
    '        <div class="flex items-center justify-between gap-2 mb-2">' +
    '          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400"><i class="fas fa-shield-virus mr-1"></i><span data-key="dp_rm_risk">Risk register</span></div>' +
    (open.length ? '<span class="text-[9px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 font-bold">' + open.length + '</span>' : '') +
    '        </div>' +
    (open.length
      ? open.map((r2) => '' +
          '<div class="rounded-xl border ' + (r2.score >= 20 ? 'border-rose-500/40 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/10') + ' p-2.5 mb-1.5">' +
          '  <div class="flex items-center justify-between gap-2">' +
          '    <div class="text-[11px] font-bold text-slate-200"><i class="fas ' + (r2.id === 'capacity' ? 'fa-industry' : 'fa-stopwatch') + ' mr-1 text-slate-400"></i><span data-key="' + r2.titleKey + '">' + tr(r2.titleKey) + '</span></div>' + chip(r2) +
          '  </div>' +
          '  <div class="text-[9px] text-amber-100/70 mt-1 leading-relaxed">' + mit(r2) + '</div>' +
          '</div>').join('')
      : '<div class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300"><i class="fas fa-circle-check mr-1"></i><span data-key="dp_rm_risk_clear">No open risks</span></div>') +
    (hist.length
      ? '<div class="mt-2 space-y-1">' + hist.reverse().map((x) =>
          '<div class="flex items-center justify-between gap-2 text-[9px] text-slate-500"><span><i class="fas ' + (x.status === 'accepted' ? 'fa-hand' : 'fa-bandage') + ' mr-1"></i><span data-key="' + x.titleKey + '">' + tr(x.titleKey) + '</span></span>' +
          '<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">' + (x.status === 'accepted' ? tr('dp_rm_risk_accepted') : tr('dp_rm_risk_mitigated')) + '</span></div>').join('') + '</div>'
      : '') +
    '      </div>';
}

/* تقرير إداري نصي: ملخص الخطة والمراحل والتقييمات والتوصيات. */
function roadReport() {
  const r = ensureRoadmap();
  const a = roadAnalytics();
  const lines = [];
  lines.push(tr('dp_rm_title') + ' — ' + r.goalName);
  lines.push(tr('dp_rm_current') + ': ' + fmtNum(r.current) + ' → ' + tr('dp_rm_target') + ': ' + fmtNum(r.target) + ' (' + r.horizon + ' ' + tr('dp_rm_months') + ')');
  lines.push(tr('dp_rm_rate') + ': ' + fmtNum(a.perMonth) + ' · ' + tr('dp_rm_growth') + ': ' + a.growthPct + '%');
  r.phases.forEach((p) => {
    lines.push(tr('dp_rm_phase') + ' ' + p.id + ' M' + p.startMonth + '–' + p.endMonth + ' → ' + fmtNum(p.plannedEnd)
      + (p.actualValue !== null && p.actualValue !== undefined ? ' | ' + tr('dp_rm_actual') + ': ' + fmtNum(p.actualValue) + ' (' + p.status + ')' : ''));
  });
  if (a.spi !== null) {
    lines.push('SPI: ' + a.spi + ' · ' + tr('dp_rm_variance') + ': ' + (a.variance >= 0 ? '+' : '') + a.variance + '% · ' + tr('dp_rm_verdict') + ': ' + (a.scheduleRisk ? tr('dp_rm_late') : tr('dp_rm_on_track')));
    if (a.advice) {
      lines.push(tr('dp_rm_advice') + ': ' + tr('dp_rm_advice_faster') + ' ' + fmtNum(a.advice.fasterRate) + '/mo · ' + tr('dp_rm_advice_extend') + ' ' + a.advice.extendTo + ' ' + tr('dp_rm_months'));
    }
  }
  if (r.evaluations.length) {
    lines.push('--- ' + tr('dp_rm_evals') + ' ---');
    r.evaluations.forEach((e) => {
      lines.push('P' + e.phase + ': ' + fmtNum(e.planned) + ' → ' + fmtNum(e.actual) + ' (SPI ' + e.spi + ', ' + (e.variance >= 0 ? '+' : '') + e.variance + '%)' + (e.notes ? ' · ' + e.notes : ''));
    });
  }
  const risks = scanRisks();
  if (risks.length) {
    lines.push('--- ' + tr('dp_rm_risk') + ' ---');
    risks.forEach((x) => {
      lines.push('[' + x.status + '] ' + tr(x.titleKey) + ' · ' + tr('dp_rm_risk_score') + ' ' + x.score + ' (' + x.likelihood + '×' + x.impact + ')');
    });
  }
  const m = plan.mgmt;
  if (m) {
    lines.push('--- ' + tr('dp_mgmt_title') + ' ---');
    lines.push(tr('dp_mgmt_status') + ': ' + tr('dp_mgmt_st_' + m.status));
    const tasks = m.tasks || [];
    const doneT = tasks.filter((t) => t.status === 'done').length;
    if (tasks.length) {
      lines.push(tr('dp_mgmt_task') + ' · ' + tr('dp_mgmt_st_done') + ': ' + doneT + '/' + tasks.length
        + ' · ' + tr('dp_mgmt_cost_total') + ': ' + fmtNum(mgmtTotalCost())
        + (m.costApproved ? ' · ' + tr('dp_mgmt_fin_approved') + ': ' + fmtNum(m.costApproved) : ''));
      tasks.forEach((t) => {
        const pos = posByKey(t.position);
        lines.push('- [' + t.status + '] ' + t.title + ' · ' + tr(pos.key)
          + (Number(t.cost) ? ' · ' + tr('dp_mgmt_cost') + ' ' + fmtNum(Number(t.cost)) : '')
          + (t.eval && t.eval.score ? ' · ' + tr('dp_mgmt_eval') + ' ' + t.eval.score + '/10' : ''));
      });
    }
    const openProbs = (m.problems || []).filter((p) => p.status !== 'solved').length;
    const pendingReq = (m.staffReqs || []).filter((s) => s.status === 'pending').length;
    lines.push(tr('dp_mgmt_problem_title') + ': ' + openProbs + ' ' + tr('dp_mgmt_prob_open') + ' · ' + tr('dp_mgmt_hr_title') + ': ' + pendingReq + ' ' + tr('dp_mgmt_pending'));
  }
  return { title: tr('dp_rm_title'), text: lines.join('\n'), analytics: a };
}

function roadFeedHtml() {
  const f = roadDeptFeed();
  if (!f) return '';
  const icon = (name) => { const d = deptById(name); return d ? (d.icon || 'fa-building') : 'fa-building'; };
  return '' +
    '      <div class="mt-3 pt-3 border-t border-slate-700/60">' +
    '        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-bullseye mr-1"></i><span data-key="dp_rm_feed">Today\u2019s job for every department</span></div>' +
    '        <div class="grid grid-cols-2 gap-1.5 text-[10px]">' +
            `<div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/70"><i class="fas fa-coins text-slate-400 w-3"></i><span data-key="dp_ops_rev">Revenue est.</span><b class="ml-auto font-mono text-white">${Math.round(f.revenue / 1000)}k</b></div>` +
            `<div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/70"><i class="fas fa-industry text-slate-400 w-3"></i><span data-key="dp_ops_dayreq">req daily</span><b class="ml-auto font-mono text-white">${f.daily}</b></div>` +
            `<div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/70"><i class="fas fa-truck fa-flip-horizontal text-slate-400 w-3"></i><span data-key="dp_ops_mixers">mixers</span><b class="ml-auto font-mono text-white">${f.mixers}</b></div>` +
            `<div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/70"><i class="fas fa-vials text-slate-400 w-3"></i><span data-key="dp_ops_samples">samples</span><b class="ml-auto font-mono text-white">${f.samples}</b></div>` +
    '        </div>' +
    '      </div>';
}

function roadEacHtml(a) {
  if (a.spi === null) return '';
  return '' +
    '      <div class="mt-3 pt-3 border-t border-slate-700/60 space-y-2">' +
    '        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400"><i class="fas fa-chart-line mr-1"></i><span data-key="dp_rm_eac">Trend forecast</span></div>' +
    '        <div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_eac_months') + '</span><b class="font-mono text-cyan-300">' + a.eacMonths + ' <span class="text-slate-400">' + tr('dp_rm_months') + '</span></b></div>' +
    '        <div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_miss') + '</span><b class="font-mono ' + (a.monthsLate > 0 ? 'text-rose-300' : 'text-emerald-300') + '">' + (a.monthsLate > 0 ? '+' : '') + a.monthsLate + ' ' + tr('dp_rm_months') + '</b></div>' +
    (a.advice
      ? '<div class="px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200 leading-relaxed"><i class="fas fa-lightbulb mr-1"></i><span data-key="dp_rm_advice">Advisor</span>: <span data-key="dp_rm_advice_faster">raise pace to</span> <b class="font-mono">' + fmtNum(a.advice.fasterRate) + '</b>/mo <span data-key="dp_rm_or">or</span> <span data-key="dp_rm_advice_extend">extend to</span> <b class="font-mono">' + a.advice.extendTo + '</b> ' + tr('dp_rm_months') + '</div>'
      : '') +
    '      </div>';
}

/* شريط زمني بصري: عرض المراحل على محور الشهور. */
function roadTimelineHtml() {
  const r = ensureRoadmap();
  if (!r || !Array.isArray(r.phases) || !r.phases.length) return '';
  const total = Math.max(1, r.horizon || 1);
  let segs = '';
  r.phases.forEach((p) => {
    const w = Math.max(6, Math.round(((p.endMonth - p.startMonth + 1) / total) * 100));
    const color = p.status === 'done' ? 'bg-emerald-500' : (p.status === 'active' ? 'bg-amber-500' : 'bg-slate-600');
    segs += `<div title="${tr('dp_rm_phase')} ${p.id}: M${p.startMonth}–${p.endMonth}" class="${color} rounded transition flex items-center justify-center text-white text-[8px] font-bold" style="width:${w}%"></div>`;
  });
  return '' +
    '      <div class="mb-3">' +
    '        <div class="text-[10px] text-slate-400 mb-1"><i class="fas fa-timeline mr-1"></i>' + tr('dp_rm_planned') + ' · <span data-key="dp_rm_timeline">Timeline</span></div>' +
    '        <div class="flex w-full h-4 gap-0.5 overflow-hidden rounded-md">' + segs + '</div>' +
    '        <div class="flex justify-between text-[8px] text-slate-500 mt-1"><span>M1</span><span>M' + total + '</span></div>' +
    '      </div>';
}

/* سيناريوهات القرار: إبقاء الخطة / إعادة تخطيط الوتيرة / تمديد الأفق. */
function roadScenarioHtml(a) {
  const r = ensureRoadmap();
  if (!a || a.spi === null) return '';
  const sc = roadScenarioData();
  return '' +
    '      <div class="mt-3 pt-3 border-t border-slate-700/60">' +
    '        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-gavel mr-1"></i><span data-key="dp_rm_scen">Decision scenarios</span></div>' +
    '        <div class="space-y-2">' +
    sc.map((s) =>
      '<div class="rounded-xl border ' + (s.kind === 'pace' && a.scheduleRisk ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-700/60 bg-slate-800/50') + ' p-2.5">' +
      '  <div class="flex items-center justify-between gap-2">' +
      '    <div class="text-[11px] font-bold text-slate-200"><i class="fas ' + s.icon + ' mr-1 text-slate-400"></i><span data-key="' + s.key + '">' + s.label + '</span>' + (s.kind === 'pace' && a.scheduleRisk ? '<span class="ml-1 text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold">' + tr('dp_rm_reco') + '</span>' : '') + '</div>' +
    '    <b class="font-mono text-cyan-300 text-[10px]">' + s.duration + '</b>' +
    '  </div>' +
    '  <div class="text-[9px] text-slate-400 mt-1">' + s.desc + '</div>' +
    (s.kind !== 'keep'
      ? '<button onclick="SAE_DevPlan && SAE_DevPlan.applyScenario(\'' + s.kind + '\')" class="mt-2 px-3 py-1 rounded-lg text-[10px] font-bold ' + (s.kind === 'pace' ? 'bg-amber-600 hover:bg-amber-500' : (s.kind === 'extend' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-slate-600 hover:bg-slate-500')) + ' text-white"><i class="fas fa-check mr-1"></i><span data-key="dp_rm_choose">Apply this</span></button>'
      : '<button onclick="SAE_DevPlan && SAE_DevPlan.keepPlan()" class="mt-2 px-3 py-1 rounded-lg text-[10px] font-bold bg-slate-600 hover:bg-slate-500 text-white"><i class="fas fa-ghost mr-1"></i><span data-key="dp_rm_keep">Accept the slip</span></button>') +
    '</div>'
    ).join('') +
    '        </div>' +
    '      </div>';
}

/* بيانات السيناريوهات: كم ستدوم كل خيار وماذا سيعني للمدير. */
function roadScenarioData() {
  const a = roadAnalytics();
  const r = ensureRoadmap();
  const out = [];
  out.push({
    kind: 'keep', icon: 'fa-hand-back-fist', key: 'dp_rm_scen_keep', label: 'Keep the plan as is',
    duration: 'M' + (a.eacMonths !== null ? a.eacMonths : r.horizon),
    desc: (a.monthsLate > 0 ? '+' + a.monthsLate + ' ' + tr('dp_rm_months') : tr('dp_rm_on_time')) + ' — ' + tr('dp_rm_scen_keep_desc'),
  });
  const paceDuration = a.scheduleRisk ? r.horizon : null;
  out.push({
    kind: 'pace', icon: 'fa-gauge-high', key: 'dp_rm_scen_pace', label: 'Re-baseline the pace',
    duration: paceDuration !== null ? 'M' + paceDuration : 'M' + r.horizon,
    desc: paceDuration !== null
      ? tr('dp_rm_scen_pace_desc') + ' ' + fmtNum(a.advice ? a.advice.fasterRate : a.perMonth) + '/mo'
      : tr('dp_rm_scen_pace_ok'),
  });
  const extendTo = a.advice ? a.advice.extendTo : (r.horizon + 1);
  out.push({
    kind: 'extend', icon: 'fa-hourglass-end', key: 'dp_rm_scen_extend', label: 'Extend the horizon',
    duration: 'M' + extendTo,
    desc: tr('dp_rm_scen_extend_desc') + ' ' + (extendTo - r.horizon) + ' ' + tr('dp_rm_months'),
  });
  return out;
}

/* تطبيق سيناريو: 'keep' → بلا تغيير؛ 'pace' → إعادة تخطيط؛ 'extend' → أفق أطول. */
function applyScenario(kind) {
  if (kind === 'keep') return { applied: false, kind };
  if (kind === 'pace') {
    const out = rebaseline();
    if (out) mitigateRisk('schedule');
    return { applied: true, kind, ...(out || {}) };
  }
  if (kind === 'extend') {
    const a = roadAnalytics();
    const r = ensureRoadmap();
    const target = r.target;
    const extendTo = Math.max(r.horizon + 1, a.advice ? a.advice.extendTo : r.horizon + 1);
    /* الغداء من "أين نحن" بعد التقييمات: آخر فعلي مُسجّل = المستوى الحالي. */
    const doneP = (r.phases || []).filter((p) => p.status === 'done' && p.actualValue !== null && p.actualValue !== undefined);
    const anchor = doneP.length ? doneP[doneP.length - 1].actualValue : r.current;
    const phases = [];
    for (let i = 0; i < r.phases.length; i++) {
      const startMonth = Math.round((extendTo / r.phases.length) * i) + 1;
      const endMonth = Math.round((extendTo / r.phases.length) * (i + 1));
      const plannedEnd = Math.round((anchor + ((target - anchor) * endMonth) / extendTo) * 10) / 10;
      phases.push({ id: i + 1, name: '', startMonth, endMonth, plannedEnd, status: 'planned', actual: null, actualMonth: null, actualValue: null, notes: '' });
    }
    phases[0].status = 'active';
    r.current = anchor;
    r.horizon = extendTo;
    r.phases = phases;
    r.rebaselined = true;
    mitigateRisk('schedule');
    syncRoadToConcrete();
    save();
    render();
    renderChart();
    return { applied: true, kind, extendTo, anchor };
  }
  return { applied: false, kind };
}

function keepPlan() {
  const accepted = acceptRisk('schedule');
  return { applied: false, kept: true, accepted: !!accepted };
}

/* تقييم مرحلة: الفعلي مقابل المخطط → تحديث الحالة + المتابعة التالية. */
function evaluatePhase(phaseId) {
  const r = ensureRoadmap();
  const ph = r.phases.find((p) => p.id === phaseId);
  if (!ph) return null;
  const slot = document.getElementById('dp-eval-' + ph.id);
  if (!slot) return null;
  const valIn = slot.querySelector('input[data-actual]');
  const monIn = slot.querySelector('input[data-actualmonth]');
  const notIn = slot.querySelector('input[data-notes]');
  const v = valIn ? parseFloat(valIn.value) : NaN;
  if (!Number.isFinite(v)) return { error: 'actual-required' };
  ph.actualValue = v;
  ph.actualMonth = monIn && Number.isFinite(parseFloat(monIn.value)) ? Math.max(1, parseInt(monIn.value, 10)) : ph.endMonth;
  ph.notes = (notIn && notIn.value ? notIn.value : '').trim();
  ph.status = 'done';
  const ev = {
    phase: ph.id, planned: ph.plannedEnd, actual: v, endMonth: ph.actualMonth,
    variance: ph.plannedEnd ? Math.round(((v - ph.plannedEnd) / ph.plannedEnd) * 1000) / 10 : 0,
    spi: ph.plannedEnd ? Math.round((v / ph.plannedEnd) * 100) / 100 : 1,
    date: Date.now(), notes: ph.notes,
  };
  r.evaluations.push(ev);
  const next = r.phases.find((p) => p.status === 'planned');
  if (next) next.status = 'active';
  save();
  render();
  return { ok: true, ev, nextPhase: next ? next.id : null };
}

/* إعادة التخطيط: تقييم ما تحقق → تعديل أهداف المراحل المتبقية للسياق الجديد. */
function rebaseline() {
  ensureRoadmap();
  const done = plan.roadmap.phases.filter((p) => p.status === 'done');
  if (!done.length) return null;
  const last = done[done.length - 1];
  const remaining = plan.roadmap.phases.filter((p) => p.status !== 'done');
  if (!remaining.length) return null;
  const monthsLeft = plan.roadmap.horizon - last.endMonth;
  if (monthsLeft <= 0) return null;
  const step = (plan.roadmap.target - last.actualValue) / monthsLeft;
  let m = last.endMonth;
  remaining.forEach((p) => {
    m += 1;
    p.plannedEnd = Math.round((last.actualValue + step * (m - last.endMonth)) * 10) / 10;
    p.startMonth = Math.min(p.startMonth, m);
    p.endMonth = m;
  });
  plan.roadmap.rebaselined = true;
  save();
  render();
  renderChart();
  return { lastActual: last.actualValue, step: Math.round(step * 10) / 10, remaining };
}

function fmtNum(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return Math.round(v * 10) / 10;
}

function roadEvalHtml(ph) {
  return `<div id="dp-eval-${ph.id}" class="mt-2 bg-slate-800/60 rounded-xl border border-slate-700/70 p-3">
    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-clipboard-check mr-1 text-amber-400"></i><span data-key="dp_rm_eval">Phase evaluation</span></div>
    <div class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1 text-[9px] text-slate-500">${tr('dp_rm_actual')}
        <input data-actual type="number" step="0.5" placeholder="${fmtNum(ph.plannedEnd)}" class="w-28 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"></label>
      <label class="flex flex-col gap-1 text-[9px] text-slate-500">${tr('dp_rm_real_month')}
        <input data-actualmonth type="number" min="1" placeholder="${ph.endMonth}" class="w-16 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"></label>
      <label class="flex flex-col gap-1 text-[9px] text-slate-500 flex-1 min-w-[120px]">${tr('dp_rm_notes')}
        <input data-notes type="text" placeholder="…" class="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"></label>
      <button onclick="SAE_DevPlan.evaluatePhase(${ph.id})" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold"><i class="fas fa-check mr-1"></i>${tr('dp_rm_save')}</button>
    </div>
  </div>`;
}

function phaseCardHtml(ph, idx, anal) {
  const active = ph.status === 'active';
  const done = ph.status === 'done';
  const statusIcon = done ? 'fa-circle-check text-emerald-400' : (active ? 'fa-circle-play text-amber-400' : 'fa-circle text-slate-600');
  const chip = `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${done ? 'bg-emerald-600/20 text-emerald-300' : (active ? 'bg-amber-600/20 text-amber-300' : 'bg-slate-700/60 text-slate-400')}`;
  const actualLine = ph.actualValue !== null && ph.actualValue !== undefined
    ? `<div class="text-[10px] mt-1"><span class="text-slate-400">${tr('dp_rm_actual')}:</span> <b class="text-white">${fmtNum(ph.actualValue)}</b> <span class="${(ph.evaluations && ph.evaluations.length ? '' : '')} ${ph.plannedEnd && ph.actualValue >= ph.plannedEnd ? 'text-emerald-300' : 'text-rose-300'}">${ph.plannedEnd && ph.actualValue >= ph.plannedEnd ? '✓' : '✗'}</span></div>`
    : ((active && !done) ? roadEvalHtml(ph) : '<div class="text-[10px] mt-1 text-slate-600">' + (done ? '— ' + tr('dp_rm_done_past') : tr('dp_rm_pending')) + '</div>');
  return '' +
    '<div class="bg-slate-900 rounded-2xl border ' + (active ? 'border-amber-500/60 shadow-lg shadow-amber-900/10' : 'border-slate-700/60') + ' p-4">' +
    '  <div class="flex items-center justify-between gap-2 mb-2">' +
    '    <div class="flex items-center gap-2"><i class="fas ' + (active ? 'fa-flag' : 'fa-flag-checkered') + ' text-slate-500 text-xs"></i>' +
    '      <span class="text-sm font-bold text-white">' + tr('dp_rm_phase') + ' ' + ph.id + '</span>' +
    '      <span class="text-[10px] text-slate-400">M' + ph.startMonth + '–' + ph.endMonth + '</span></div>' +
    '    <span class="' + chip + '"><i class="fas ' + statusIcon + '"></i> ' + (done ? tr('dp_rm_done') : (active ? tr('dp_rm_active') : tr('dp_rm_planned'))) + '</span>' +
    '  </div>' +
    '  <div class="text-[11px] text-slate-300"><span class="text-slate-400">' + tr('dp_rm_planned_end') + ':</span> <b class="text-cyan-300 font-mono">' + fmtNum(ph.plannedEnd) + '</b></div>' +
    actualLine +
    '  <div class="h-1 w-full rounded-full bg-slate-700 overflow-hidden mt-2">' +
    '    <div class="h-full rounded-full ' + (ph.plannedEnd && ph.actualValue >= ph.plannedEnd ? 'bg-emerald-500' : (active ? 'bg-amber-500' : 'bg-slate-600')) + '" style="width:' + Math.min(100, ph.plannedEnd ? Math.round((ph.actualValue || 0) / ph.plannedEnd * 100) : 0) + '%"></div>' +
    '  </div>' +
    '</div>';
}

/* سجل مراجعات المراحل: تقييم فعلي مقابل مخطط لكل مرحلة مكتملة + منحنى الفعلي التراكمي. */
function roadReviewHtml(a) {
  const r = ensureRoadmap();
  const evs = r.evaluations || [];
  if (!evs.length) return '';
  const rows = evs.map((e) => {
    const ok = e.actual >= e.planned;
    return '<tr class="border-t border-slate-800">' +
      '<td class="py-1.5 px-2 text-[10px] font-bold text-white">' + tr('dp_rm_phase') + ' ' + e.phase + '</td>' +
      '<td class="py-1.5 px-2 text-[10px] font-mono text-slate-400">' + fmtNum(e.planned) + '</td>' +
      '<td class="py-1.5 px-2 text-[10px] font-mono text-white">' + fmtNum(e.actual) + '</td>' +
      '<td class="py-1.5 px-2 text-[10px] font-mono ' + (e.spi >= 1 ? 'text-emerald-300' : 'text-rose-300') + '">' + e.spi + '</td>' +
      '<td class="py-1.5 px-2 text-[10px] font-mono ' + (e.variance >= 0 ? 'text-emerald-300' : 'text-rose-300') + '">' + (e.variance >= 0 ? '+' : '') + e.variance + '%</td>' +
      '<td class="py-1.5 px-2 text-[10px] ' + (ok ? 'text-emerald-300' : 'text-rose-300') + '">' + (ok ? tr('dp_rm_met') : tr('dp_rm_missed')) + '</td>' +
      '<td class="py-1.5 px-2 text-[10px] text-slate-400">' + (e.notes ? e.notes : '—') + '</td>' +
    '</tr>';
  }).join('');
  const chart = evs.length >= 2
    ? '<div class="mt-3"><canvas id="dp-road-review" height="90"></canvas></div>'
    : '';
  return '' +
    '      <div class="mt-4">' +
    '        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-clipboard-list mr-1"></i><span data-key="dp_rm_rev_log">Phase review log</span></div>' +
    '        <div class="overflow-x-auto rounded-xl border border-slate-700/70">' +
    '          <table class="w-full text-left min-w-[480px]">' +
    '            <thead><tr class="bg-slate-800/80 text-[9px] uppercase tracking-wider text-slate-500">' +
    '              <th class="px-2 py-2">' + tr('dp_rm_phase') + '</th>' +
    '              <th class="px-2 py-2">' + tr('dp_rm_planned') + '</th>' +
    '              <th class="px-2 py-2">' + tr('dp_rm_actual') + '</th>' +
    '              <th class="px-2 py-2">' + tr('dp_rm_spi') + '</th>' +
    '              <th class="px-2 py-2">' + tr('dp_rm_variance') + '</th>' +
    '              <th class="px-2 py-2">' + tr('dp_rm_result') + '</th>' +
    '              <th class="px-2 py-2">' + tr('dp_rm_notes') + '</th>' +
    '            </tr></thead>' +
    '            <tbody>' + rows + '</tbody>' +
    '          </table>' +
    '        </div>' + chart +
    '      </div>';
}

/* منحنى الفعلي التراكمي مقارنة بالمخطط عبر كل المراحل المكتملة (مخطط EVM). */
function renderRoadReviewChart() {
  const cv = document.getElementById('dp-road-review');
  if (!cv || typeof Chart === 'undefined') return;
  const r = ensureRoadmap();
  const evs = r.evaluations || [];
  if (evs.length < 2) return;
  const labels = evs.map((e) => tr('dp_rm_phase') + ' ' + e.phase);
  let planAcc = 0, actAcc = 0;
  const planData = evs.map((e) => { planAcc += e.planned; return Math.round(planAcc * 10) / 10; });
  const actData = evs.map((e) => { actAcc += e.actual; return Math.round(actAcc * 10) / 10; });
  if (typeof cv.roadChart !== 'undefined') { cv.roadChart.destroy(); }
  cv.roadChart = new Chart(cv.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: tr('dp_rm_planned_cum'), data: planData,
        borderColor: '#22D3EE', backgroundColor: '#22D3EE26',
        fill: false, tension: 0.25, pointRadius: 3, borderWidth: 2,
      }, {
        label: tr('dp_rm_actual_cum'), data: actData,
        borderColor: '#FBBF24', backgroundColor: '#FBBF2426',
        fill: false, tension: 0.25, pointRadius: 3, borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94A3B8', boxWidth: 10, font: { size: 9 } } } },
      scales: { x: { ticks: { color: '#64748B', font: { size: 9 } } }, y: { ticks: { color: '#64748B', font: { size: 9 } } } },
    },
  });
}

/* تقرير العقل: تحليلات ومراحل وتوصيات — الجزء الأول من الصفحة الشاملة. */
function roadmapSectionHtml() {
  const r = ensureRoadmap();
  const anal = roadAnalytics();
  const cards = r.phases.map((ph, i) => phaseCardHtml(ph, i, anal)).join('');
  const feasible = !anal.scheduleRisk;
  const verdictHtml = anal.verdict === 'idle'
    ? '<span class="text-slate-400">' + tr('dp_rm_idle') + '</span>'
    : (feasible ? '<span class="text-emerald-300"><i class="fas fa-circle-check mr-1"></i>' + tr('dp_rm_on_track') + '</span>'
       : '<span class="text-rose-300"><i class="fas fa-triangle-exclamation mr-1"></i>' + tr('dp_rm_late') + '</span>');
  const spiHtml = anal.spi !== null
    ? '<div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_spi') + '</span><b class="font-mono text-white">' + anal.spi + '</b></div>' +
      '<div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_variance') + '</span><b class="font-mono ' + (anal.variance >= 0 ? 'text-emerald-300' : 'text-rose-300') + '">' + (anal.variance >= 0 ? '+' : '') + anal.variance + '%</b></div>' +
      '<div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_progress') + '</span><b class="font-mono text-white">' + anal.donePct + '% / ' + tr('dp_rm_planned') + ' ' + anal.planPct + '%</b></div>'
    : '<div class="text-[10px] text-slate-500">' + tr('dp_rm_no_eval') + '</div>';
  const remainingHtml = '<div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_remaining') + '</span><b class="font-mono text-white">' + fmtNum(anal.remaining) + '</b></div>' +
    '<div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_needed') + '</span><b class="font-mono text-white">' + fmtNum(anal.needed) + '</b></div>';
  return '' +
    '  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">' +
    '    <div class="lg:col-span-2 bg-slate-900 rounded-2xl border border-slate-700/70 p-5">' +
    '      <div class="flex items-center gap-3 mb-4">' +
    '        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm"><i class="fas fa-route"></i></div>' +
    '        <div><div class="text-base font-bold text-white"><span data-key="dp_rm_title">Development roadmap</span></div>' +
    '          <div class="text-[10px] text-slate-400"><span data-key="dp_rm_goal">From today to the goal</span>: <b class="text-white">' + fmtNum(r.current) + '</b> → <b class="text-emerald-300">' + fmtNum(r.target) + '</b> · <b class="text-cyan-300">' + r.horizon + '</b> <span data-key="dp_rm_months">months</span></div></div>' +
    '      </div>' +
    roadTimelineHtml() +
    '      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">' + cards + '</div>' +
    roadReviewHtml(anal) +
    '      <div class="flex flex-wrap gap-2 mt-4">' +
    '        <button onclick="SAE_DevPlan && SAE_DevPlan.openRoadForm()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold"><i class="fas fa-sliders mr-1"></i><span data-key="dp_rm_config">Define current → target → time</span></button>' +
    '        <button onclick="SAE_DevPlan && SAE_DevPlan.rebaseline()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold"><i class="fas fa-wave-square mr-1"></i><span data-key="dp_rm_rebase">Re-baseline after review</span></button>' +
    '        <button onclick="SAE_DevPlan && SAE_DevPlan.exportReport()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold"><i class="fas fa-file-excel mr-1"></i><span data-key="dp_rm_report">Management report</span></button>' +
    '      </div>' +
    '      <div id="dp-road-edit" class="mt-4"></div>' +
    '    </div>' +
    '    <div class="bg-slate-900 rounded-2xl border border-slate-700/70 p-5">' +
    '      <div class="flex items-center gap-3 mb-4">' +
    '        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-sm"><i class="fas fa-brain"></i></div>' +
    '        <div><div class="text-base font-bold text-white"><span data-key="dp_rm_brain">The advisor</span></div>' +
    '          <div class="text-[10px] text-slate-400" data-key="dp_rm_brain_desc">Thinks like the sharpest planner — EVM, variance & corrective action.</div></div>' +
    '      </div>' +
    '      <div class="space-y-2 text-xs">' +
    '        <div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_rate') + '</span><b class="font-mono text-cyan-300">' + fmtNum(anal.perMonth) + '</b></div>' +
    '        <div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_growth') + '</span><b class="font-mono text-white">' + anal.growthPct + '%</b></div>' +
    spiHtml + remainingHtml +
    '        <div class="flex items-center gap-2"><span class="w-24 text-[10px] text-slate-400">' + tr('dp_rm_verdict') + '</span>' + verdictHtml + '</div>' +
    '      </div>' +
    roadEacHtml(anal) +
    roadScenarioHtml(anal) +
    '      <div class="mt-3 pt-3 border-t border-slate-700/60 space-y-2">' +
    '        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400"><i class="fas fa-list-check mr-1"></i><span data-key="dp_rm_tasks">Who carries the goal</span></div>' +
    '        <div class="flex flex-wrap gap-1.5">' +
    plan.departments.map((d) => '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-300"><i class="fas ' + d.icon + ' text-slate-400"></i><span data-key="' + d.nameKey + '">' + tr(d.nameKey) + '</span></span>').join('') +
    '        </div>' +
    '      </div>' +
    roadFeedHtml() +
    roadFeasHtml() +
    roadRiskHtml() +
    (plan.roadmap.rebaselined ? '<div class="mt-3 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-[10px] text-violet-200"><i class="fas fa-wave-square mr-1"></i><span data-key="dp_rm_rebaselined">Plan re-baselined after the last review.</span></div>' : '') +
    '    </div>' +
    '  </div>';
}

function roadFormHtml() {
  const r = ensureRoadmap();
  return '<div class="bg-slate-800/60 rounded-xl border border-slate-700/70 p-4">' +
    '  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-sliders mr-1"></i><span data-key="dp_rm_config_title">Plan parameters</span></div>' +
    '  <div class="grid grid-cols-2 md:grid-cols-4 gap-2">' +
    '    <label class="flex flex-col gap-1 text-[9px] text-slate-500">' + tr('dp_rm_current') + '<input id="dp-rf-current" type="number" value="' + r.current + '" class="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white"></label>' +
    '    <label class="flex flex-col gap-1 text-[9px] text-slate-500">' + tr('dp_rm_target') + '<input id="dp-rf-target" type="number" value="' + r.target + '" class="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white"></label>' +
    '    <label class="flex flex-col gap-1 text-[9px] text-slate-500">' + tr('dp_rm_months') + '<input id="dp-rf-horizon" type="number" min="1" max="24" value="' + r.horizon + '" class="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white"></label>' +
    '    <label class="flex flex-col gap-1 text-[9px] text-slate-500">' + tr('dp_rm_phase_count') + '<input id="dp-rf-phases" type="number" min="1" max="12" value="' + r.phaseCount + '" class="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white"></label>' +
    '  </div>' +
    '  <div class="flex gap-2 mt-3">' +
    '    <button onclick="SAE_DevPlan && SAE_DevPlan.applyRoadForm()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold"><i class="fas fa-check mr-1"></i><span data-key="dp_rm_apply">Apply plan</span></button>' +
    '    <button onclick="SAE_DevPlan && SAE_DevPlan.cancelRoadForm()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold"><span data-key="dp_cancel">Cancel</span></button>' +
    '  </div>' +
    '</div>';
}

function openRoadForm() {
  const slot = document.getElementById('dp-road-edit');
  if (!slot) return;
  slot.innerHTML = roadFormHtml();
  translateRecursive(slot);
}
function applyRoadForm() {
  const g = (id) => { const el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; };
  updateRoadmap({
    current: g('dp-rf-current'), target: g('dp-rf-target'),
    horizon: g('dp-rf-horizon'), phaseCount: g('dp-rf-phases'),
  });
}
function cancelRoadForm() {
  const slot = document.getElementById('dp-road-edit');
  if (slot) slot.innerHTML = '';
}

function exportReport() {
  const rep = roadReport();
  try {
    const blob = new Blob([rep.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sae-development-plan-report.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { /* storage blocked */ }
  return rep;
}

/* ── إدارة التنفيذ: دورة اعتماد الخطة + مهام بالمسمى الوظيفي + HR + تقييمات + تكلفة ومشاكل ── */

const MGMT_STEPS = ['draft', 'mgmt_ok', 'finance_ok', 'distributed', 'monitoring'];

function mgmtTotalCost() { return plan.mgmt.tasks.reduce((s, t) => s + (Number(t.cost) || 0), 0); }
function mgmtStatusIdx() {
  let i = MGMT_STEPS.indexOf(plan.mgmt.status);
  if (i < 0) i = 0;
  /* إذا بلا تكلفة، توزّع مباشرة بعد اعتماد الإدارة. */
  if (plan.mgmt.status === 'mgmt_ok' && mgmtTotalCost() === 0) i = MGMT_STEPS.indexOf('distributed');
  return i;
}
function mgmtLog(roleKey, note) {
  plan.mgmt.logs = plan.mgmt.logs || [];
  plan.mgmt.logs.unshift({ at: Date.now(), role: roleKey, note });
}
function mgmtApprove() {
  if (plan.mgmt.status === 'draft') {
    plan.mgmt.status = mgmtTotalCost() === 0 ? 'distributed' : 'mgmt_ok';
    mgmtLog('dp_mgmt_role_mgmt', tr('dp_mgmt_approve_note'));
  } else if (plan.mgmt.status === 'mgmt_ok' || plan.mgmt.status === 'finance_ok') {
    plan.mgmt.status = 'distributed';
    mgmtLog('dp_mgmt_role_mgmt', tr('dp_mgmt_dist_note'));
  } else if (plan.mgmt.status === 'distributed') {
    plan.mgmt.status = 'monitoring';
    mgmtLog('dp_mgmt_role_mgmt', tr('dp_mgmt_monitor_note'));
  }
  save(); render(); renderChart();
  return { status: plan.mgmt.status };
}
function mgmtFinanceApprove(amount) {
  const v = Number(amount);
  if (plan.mgmt.status === 'mgmt_ok') {
    plan.mgmt.costApproved = Number.isFinite(v) && v >= 0 ? v : mgmtTotalCost();
    plan.mgmt.status = 'finance_ok';
    mgmtLog('dp_mgmt_role_finance', tr('dp_mgmt_fin_note') + ' ' + plan.mgmt.costApproved);
  }
  save(); render(); renderChart();
  return { status: plan.mgmt.status, approved: plan.mgmt.costApproved };
}
function mgmtRejectFinance(note) {
  plan.mgmt.financeNote = note || '';
  mgmtLog('dp_mgmt_role_finance', note || tr('dp_mgmt_fin_reject'));
  save(); render();
  return { ok: true, note: plan.mgmt.financeNote };
}

/* مهمة بالمسمى الوظيفي: تسند لقسم/مسؤول، متابعة + تقييم. */
function addTask(inputs) {
  const t = {
    id: Date.now() % 100000,
    title: (inputs && inputs.title ? inputs.title : '').trim(),
    position: (inputs && inputs.position) || 'pos_plant_mgr',
    deptId: (inputs && inputs.deptId) || (posByKey((inputs && inputs.position) || 'pos_plant_mgr').deptId),
    status: 'todo',
    cost: Number(inputs && inputs.cost) || 0,
    followups: [],
    eval: { score: null, note: '', by: '' },
  };
  if (!t.title) return { error: 'title-required' };
  plan.mgmt.tasks.push(t);
  save(); render(); renderChart();
  return { id: t.id };
}
function taskFollow(id, note) {
  const t = plan.mgmt.tasks.find((x) => x.id === Number(id) || String(x.id) === String(id));
  if (!t) return { error: 'no-task' };
  t.followups.push({ at: Date.now(), note });
  t.status = t.status === 'done' ? 'done' : 'doing';
  save(); render();
  return { ok: true, count: t.followups.length };
}
function taskStatus(id, status) {
  const t = plan.mgmt.tasks.find((x) => String(x.id) === String(id));
  if (!t) return { error: 'no-task' };
  t.status = ['todo', 'doing', 'done'].includes(status) ? status : 'todo';
  save(); render();
  return { ok: true, status: t.status };
}
function evalTask(id, score, note) {
  const t = plan.mgmt.tasks.find((x) => String(x.id) === String(id));
  if (!t) return { error: 'no-task' };
  const s = Number(score);
  t.eval = { score: Number.isFinite(s) ? Math.max(1, Math.min(10, s)) : null, note: note || '', by: tr('dp_mgmt_role_mgmt') };
  save(); render();
  return { ok: true, score: t.eval.score };
}
function taskCost(id, cost) {
  const t = plan.mgmt.tasks.find((x) => String(x.id) === String(id));
  if (!t) return { error: 'no-task' };
  t.cost = Number(cost) || 0;
  save(); render();
  return { ok: true, cost: t.cost, total: mgmtTotalCost() };
}
function delTask(id) {
  plan.mgmt.tasks = plan.mgmt.tasks.filter((x) => String(x.id) !== String(id));
  save(); render();
  return { ok: true };
}

/* طلب إضافة أعضاء (يوجهه الإدارة للـ HR ومنه لفريق العمل). */
function addStaffReq(inputs) {
  const s = {
    id: Date.now() % 100000,
    position: (inputs && inputs.position) || 'pos_plant_mgr',
    reason: (inputs && inputs.reason || '').trim(),
    status: 'pending',
  };
  plan.mgmt.staffReqs.push(s);
  save(); render();
  return { id: s.id };
}
function resolveStaff(id, approved) {
  const s = plan.mgmt.staffReqs.find((x) => String(x.id) === String(id));
  if (!s) return { error: 'no-req' };
  s.status = approved ? 'approved' : 'declined';
  mgmtLog('dp_mgmt_role_hr', (approved ? tr('dp_mgmt_staff_filled') : tr('dp_mgmt_staff_declined')) + ' · ' + s.reason);
  save(); render();
  return { ok: true, status: s.status };
}

/* جدولة مشكلة: حتى لو كانت خارج الخطة نُسجّلها لنحلها. */
function addProblem(inputs) {
  const p = {
    id: Date.now() % 100000,
    text: (inputs && inputs.text || '').trim(),
    severity: (inputs && inputs.severity) || 'med',
    targetMonth: Number(inputs && inputs.targetMonth) || 1,
    status: 'open',
    note: '',
  };
  if (!p.text) return { error: 'text-required' };
  plan.mgmt.problems.push(p);
  save(); render();
  return { id: p.id };
}
function problemStatus(id, status) {
  const p = plan.mgmt.problems.find((x) => String(x.id) === String(id));
  if (!p) return { error: 'no-problem' };
  p.status = ['open', 'doing', 'solved'].includes(status) ? status : 'open';
  save(); render();
  return { ok: true, status: p.status };
}
function problemNote(id, note) {
  const p = plan.mgmt.problems.find((x) => String(x.id) === String(id));
  if (!p) return { error: 'no-problem' };
  p.note = note || '';
  save(); render();
  return { ok: true };
}

/* خانات المتابعة بالألوان (للطباعة وللشاشة). */
function mgmtStatusChip(status) {
  const map = {
    todo: ['bg-slate-600 text-white', tr('dp_mgmt_st_todo')],
    doing: ['bg-amber-500 text-white', tr('dp_mgmt_st_doing')],
    done: ['bg-emerald-500 text-white', tr('dp_mgmt_st_done')],
    open: ['bg-rose-500 text-white', tr('dp_mgmt_prob_open')],
    solved: ['bg-emerald-500 text-white', tr('dp_mgmt_prob_solved')],
  };
  const m = map[status] || map.todo;
  return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ' + m[0] + '">' + m[1] + '</span>';
}

/* ── WBS Tree: عرض هرمي للمهام ─────────────────────────────────────── */

function renderWBSTree(tasks) {
  if (!tasks || tasks.length === 0) return '';

  /* Find root tasks (no predecessors) */
  const roots = tasks.filter((t) => !t.predecessors || t.predecessors.length === 0);
  const children = {};
  tasks.forEach((t) => {
    (t.predecessors || []).forEach((pid) => {
      if (!children[pid]) children[pid] = [];
      children[pid].push(t);
    });
  });

  function renderNode(task, depth) {
    const indent = depth * 16;
    const criticalCls = task.isCritical ? 'border-l-2 border-rose-500 bg-rose-500/10' : 'border-l-2 border-slate-700';
    const statusIcon = task.status === 'done' ? '✓' : (task.status === 'doing' ? '◐' : '○');
    const statusCls = task.status === 'done' ? 'text-emerald-400' : (task.status === 'doing' ? 'text-amber-400' : 'text-slate-500');

    let html = '<div class="flex items-center gap-2 py-1 px-2 ' + criticalCls + '" style="margin-left:' + indent + 'px">' +
      '<span class="' + statusCls + ' text-[10px]">' + statusIcon + '</span>' +
      '<span class="text-[10px] text-white font-semibold">' + task.title + '</span>' +
      '<span class="text-[9px] text-slate-400">' + (task.duration || 1) + ' ' + tr('dp_cpm_days') + '</span>' +
      (task.isCritical ? '<span class="px-1 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[8px]"><i class="fas fa-fire"></i></span>' : '') +
      '</div>';

    const kids = children[task.id] || [];
    kids.forEach((kid) => {
      html += renderNode(kid, depth + 1);
    });

    return html;
  }

  return roots.map((r) => renderNode(r, 0)).join('');
}

/* ── Gantt Chart: مخطط جانت بسيط ───────────────────────────────────── */

function renderGanttChart(tasks) {
  if (!tasks || tasks.length === 0) return '<div class="text-[10px] text-slate-500">' + tr('dp_mgmt_no_tasks') + '</div>';

  const cpm = calculateCPM();
  const projectDuration = cpm.projectDuration || 10;
  const { es, ef } = calculateEarlyTimes(tasks);
  const rowHeight = 28;
  const dayWidth = 30;
  const labelWidth = 200;
  const totalWidth = labelWidth + (projectDuration * dayWidth);

  let html = '<div style="min-width:' + totalWidth + 'px">';

  /* Header: days */
  html += '<div style="display:flex; margin-bottom:4px;">';
  html += '<div style="width:' + labelWidth + 'px; flex-shrink:0;"></div>';
  for (let d = 0; d < projectDuration; d++) {
    html += '<div style="width:' + dayWidth + 'px; text-align:center; font-size:9px; color:#64748b; border-left:1px solid #334155;">' + (d + 1) + '</div>';
  }
  html += '</div>';

  /* Rows */
  tasks.forEach((task, i) => {
    const start = es[task.id] || 0;
    const end = ef[task.id] || (start + (task.duration || 1));
    const barLeft = labelWidth + (start * dayWidth);
    const barWidth = ((end - start) * dayWidth) - 4;
    const barColor = task.isCritical ? '#ef4444' : '#06b6d4';

    html += '<div style="display:flex; align-items:center; height:' + rowHeight + 'px; border-bottom:1px solid #1e293b;">';
    html += '<div style="width:' + labelWidth + 'px; flex-shrink:0; padding:0 8px; font-size:10px; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + task.title + '">' + (i + 1) + '. ' + task.title + '</div>';
    html += '<div style="flex:1; position:relative; height:100%;">';

    /* Grid lines */
    for (let d = 0; d < projectDuration; d++) {
      html += '<div style="position:absolute; left:' + (d * dayWidth) + 'px; top:0; bottom:0; width:1px; background:#1e293b;"></div>';
    }

    /* Bar */
    html += '<div style="position:absolute; left:' + barLeft + 'px; top:6px; width:' + barWidth + 'px; height:' + (rowHeight - 12) + 'px; background:' + barColor + '; border-radius:4px; opacity:0.8; box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>';

    html += '</div></div>';
  });

  /* Dependency arrows (simple visual indicator) */
  tasks.forEach((task) => {
    (task.predecessors || []).forEach((pid) => {
      const predTask = tasks.find((t) => t.id === pid);
      if (predTask) {
        const predEnd = ef[predTask.id] || 0;
        const taskStart = es[task.id] || 0;
        /* Arrow would go from predEnd to taskStart - simplified visual */
      }
    });
  });

  html += '</div>';
  return html;
}

/* الجدول القابل للطباعة: الحالي + المستهدف + خطوات العمل + خانات المتابعة بالألوان. */
function printablePlanHtml() {
  const r = ensureRoadmap();
  const m = plan.mgmt;
  const total = mgmtTotalCost();
  const steps = r.phases.map((p, i) => {
    const st = p.status === 'done' ? 'done' : (p.status === 'active' ? 'doing' : 'open');
    return { label: tr('dp_rm_phase') + ' ' + (i + 1) + ' (M' + p.startMonth + '–' + p.endMonth + ')', value: fmtNum(p.plannedEnd), status: st };
  });
  const rows = steps.map((s) => '<tr><td class="pr-cell">' + s.label + '</td><td class="pr-cell">' + s.value + '</td>' +
    '<td class="pr-cell"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ' + {
      done: 'bg-emerald-500 text-white', doing: 'bg-amber-500 text-white', open: 'bg-slate-400 text-white'}[s.status] + '">' + {
      done: tr('dp_mgmt_st_done'), doing: tr('dp_mgmt_st_doing'), open: tr('dp_mgmt_st_todo')}[s.status] + '</span></td></tr>').join('');
  const tasks = m.tasks.map((t, i) => '<tr>' +
    '<td class="pr-cell">' + (i + 1) + '</td>' +
    '<td class="pr-cell">' + t.title + '</td>' +
    '<td class="pr-cell">' + tr(posByKey(t.position).key) + '</td>' +
    '<td class="pr-cell">' + mgmtStatusChip(t.status) + '</td>' +
    '<td class="pr-cell">' + (Number(t.cost) || 0) + '</td>' +
    '<td class="pr-cell">' + (t.eval && t.eval.score ? t.eval.score + '/10' : '—') + '</td>' +
    '<td class="pr-cell">' + (t.followups && t.followups.length ? t.followups[t.followups.length - 1].note : '—') + '</td></tr>').join('');
  const problems = m.problems.map((p, i) => '<tr><td class="pr-cell">' + (i + 1) + '</td><td class="pr-cell">' + p.text + '</td>' +
    '<td class="pr-cell">' + p.targetMonth + '</td><td class="pr-cell">' + mgmtStatusChip(p.status) + '</td>' +
    '<td class="pr-cell">' + (p.status === 'solved' ? '' : p.note) + '</td></tr>').join('');
  return '' +
    '<div id="printable-plan">' +
    '  <div class="pp-head"><b>' + tr('dp_title') + '</b> · ' + tr('dp_mgmt_status') + ': <b>' + tr('dp_mgmt_st_' + m.status) + '</b></div>' +
    '  <table class="pp">' +
    '    <caption class="pp-caption">' + tr('dp_mgmt_tbl_summary') + '</caption>' +
    '    <tr><th>' + tr('dp_mgmt_current') + '</th><th>' + tr('dp_mgmt_target') + '</th><th>' + tr('dp_rm_rate') + '</th><th>' + tr('dp_mgmt_horizon') + '</th></tr>' +
    '    <tr><td class="pr-cell">' + fmtNum(r.current) + '</td><td class="pr-cell">' + fmtNum(r.target) + '</td><td class="pr-cell">' + fmtNum(r.target - r.current) + '</td><td class="pr-cell">' + r.horizon + ' ' + tr('dp_rm_months') + '</td></tr>' +
    '  </table>' +
    '  <table class="pp"><caption class="pp-caption">' + tr('dp_mgmt_tbl_steps') + ' — ' + tr('dp_mgmt_tbl_current_target') + '</caption>' +
    '    <tr><th>' + tr('dp_rm_phase') + '</th><th>' + tr('dp_mgmt_planned') + '</th><th>' + tr('dp_mgmt_tbl_follow') + '</th></tr>' + rows + '</table>' +
    '  <table class="pp"><caption class="pp-caption">' + tr('dp_mgmt_tbl_tasks') + ' + ' + tr('dp_mgmt_tbl_follow') + '</caption>' +
    '    <tr><th>#</th><th>' + tr('dp_mgmt_task') + '</th><th>' + tr('dp_mgmt_position') + '</th><th>' + tr('dp_mgmt_status') + '</th><th>' + tr('dp_mgmt_cost') + '</th><th>' + tr('dp_mgmt_eval') + '</th><th>' + tr('dp_rm_notes') + '</th></tr>' + tasks + '</table>' +
    (m.problems.length ? '  <table class="pp"><caption class="pp-caption">' + tr('dp_mgmt_tbl_problems') + '</caption>' +
      '    <tr><th>#</th><th>' + tr('dp_mgmt_prob') + '</th><th>' + tr('dp_mgmt_month') + '</th><th>' + tr('dp_mgmt_status') + '</th><th>' + tr('dp_rm_notes') + '</th></tr>' + problems + '</table>' : '') +
    '  <div class="pp-foot"><b>' + tr('dp_mgmt_cost_total') + ':</b> ' + fmtNum(total) +
    (plan.mgmt.costApproved ? ' · <b>' + tr('dp_mgmt_fin_approved') + ':</b> ' + fmtNum(plan.mgmt.costApproved) : '') + '</div>' +
    '</div>';
}

/* فتح الجدول في نافذة/طباعة. */
function printPlan() {
  const html = '<html><head><title>' + tr('dp_title') + '</title>' +
    '<meta charset="utf-8"><style>' +
    'body{font-family:sans-serif;padding:16px;color:#111}' +
    '.pp{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:12px}' +
    '.pp th,.pp .pr-cell{border:1px solid #444;padding:5px 8px;text-align:left}' +
    '.pp th{background:#1e3a5f;color:#fff}' +
    '.pp-caption{text-align:left;font-weight:bold;padding:6px 2px 2px;font-size:12px}' +
    '.pp-head{font-size:15px;margin-bottom:8px}' +
    '.pp-foot{margin-top:10px;font-size:13px}' +
    '}</style></head><body>' + printablePlanHtml() + '</body></html>';
  try {
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) {} }, 300); }
  } catch (e) { /* popup blocked */ }
  return { title: tr('dp_title'), html };
}

/* ── محتوى قسم الإدارة التنفيذية (الشاشة) ───────────────────────────── */
function mgmtTaskRowHtml(t, i) {
  const criticalCls = t.isCritical ? 'border-rose-500/60 bg-rose-500/5' : '';
  const predOptions = (plan.mgmt.tasks || []).filter((x) => x.id !== t.id).map((x) => '<option value="' + x.id + '">' + x.title + '</option>').join('');
  const predChips = (t.predecessors || []).map((pid) => {
    const pred = plan.mgmt.tasks.find((x) => x.id === pid);
    return pred ? '<span class="px-1.5 py-0.5 rounded bg-slate-700 text-[8px] text-slate-300">' + pred.title + ' <button onclick="SAE_DevPlan && SAE_DevPlan.removePredecessor(' + t.id + ',' + pid + ')" class="ml-1 text-rose-400 hover:text-rose-300">×</button></span>' : '';
  }).join('');

  return '<div class="rounded-xl border border-slate-700/70 bg-slate-800/40 p-3 ' + criticalCls + '">' +
    '  <div class="flex items-center justify-between gap-2 flex-wrap">' +
    '    <div class="flex items-center gap-2 min-w-0"><span class="text-[9px] text-slate-500">' + (i + 1) + '</span>' +
    '      <b class="text-[11px] text-white truncate">' + t.title + '</b>' + mgmtStatusChip(t.status) +
    (t.isCritical ? '<span class="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[8px] font-bold"><i class="fas fa-fire mr-1"></i>' + tr('dp_cpm_critical') + '</span>' : '') + '</div>' +
    '    <div class="flex items-center gap-1.5">' +
    '      <button onclick="SAE_DevPlan && SAE_DevPlan.taskStatus(' + t.id + ',\'todo\')" class="px-1.5 py-0.5 rounded bg-slate-700 text-[9px]">' + tr('dp_mgmt_st_todo') + '</button>' +
    '      <button onclick="SAE_DevPlan && SAE_DevPlan.taskStatus(' + t.id + ',\'doing\')" class="px-1.5 py-0.5 rounded bg-amber-600 text-[9px]">' + tr('dp_mgmt_st_doing') + '</button>' +
    '      <button onclick="SAE_DevPlan && SAE_DevPlan.taskStatus(' + t.id + ',\'done\')" class="px-1.5 py-0.5 rounded bg-emerald-600 text-[9px]">' + tr('dp_mgmt_st_done') + '</button>' +
    '      <button onclick="SAE_DevPlan && SAE_DevPlan.delTask(' + t.id + ')" class="px-1.5 py-0.5 rounded bg-rose-700 text-[9px]"><i class="fas fa-trash"></i></button>' +
    '    </div>' +
    '  </div>' +
    '  <div class="flex flex-wrap items-center gap-2 mt-1.5 text-[9px] text-slate-400">' +
    '    <span class="inline-flex items-center gap-1"><i class="fas ' + posByKey(t.position).icon + ' text-slate-300"></i>' + tr(posByKey(t.position).key) + '</span>' +
    '    <span class="inline-flex items-center gap-1"><i class="fas fa-building text-slate-500"></i>' + (t.deptId ? tr(deptById(t.deptId).nameKey) : tr('dp_mgmt_cross')) + '</span>' +
    '    <span class="inline-flex items-center gap-1"><i class="fas fa-coins text-amber-400"></i>' + fmtNum(Number(t.cost) || 0) + '</span>' +
    '    <span class="inline-flex items-center gap-1"><i class="fas fa-clock text-cyan-400"></i>' + (t.duration || 1) + ' ' + tr('dp_cpm_days') + '</span>' +
    '    <span class="inline-flex items-center gap-1"><i class="fas fa-sliders text-violet-400"></i>' + tr('dp_cpm_float') + ': ' + (t.float || 0) + '</span>' +
    (t.eval && t.eval.score ? '<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 font-bold">' + tr('dp_mgmt_eval') + ' ' + t.eval.score + '/10</span>' : '') +
    '  </div>' +
    '  <div class="flex flex-wrap items-center gap-1.5 mt-2">' +
    '    <input id="dp-task-dur-' + t.id + '" type="number" min="1" value="' + (t.duration || 1) + '" placeholder="' + tr('dp_cpm_duration') + '" class="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '    <button onclick="SAE_DevPlan && SAE_DevPlan.setTaskDuration(' + t.id + ', document.getElementById(\'dp-task-dur-' + t.id + '\').value)" class="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-[10px] font-bold"><i class="fas fa-clock mr-1"></i>' + tr('dp_cpm_set_dur') + '</button>' +
    '    <select id="dp-task-pred-' + t.id + '" class="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' + predOptions + '</select>' +
    '    <button onclick="SAE_DevPlan && SAE_DevPlan.addPredecessor(' + t.id + ', document.getElementById(\'dp-task-pred-' + t.id + '\').value)" class="px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-[10px] font-bold"><i class="fas fa-link mr-1"></i>' + tr('dp_cpm_add_pred') + '</button>' +
    '  </div>' +
    (predChips ? '<div class="flex flex-wrap items-center gap-1 mt-1">' + predChips + '</div>' : '') +
    '  <div class="flex flex-wrap items-center gap-1.5 mt-2">' +
    '    <input id="dp-task-follow-' + t.id + '" type="text" placeholder="' + tr('dp_mgmt_add_follow') + '…" class="flex-1 min-w-[140px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '    <button onclick="SAE_DevPlan && SAE_DevPlan.taskFollow(' + t.id + ', document.getElementById(\'dp-task-follow-' + t.id + '\').value)" class="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-[10px] font-bold"><i class="fas fa-pen mr-1"></i>' + tr('dp_mgmt_follow') + '</button>' +
    '    <input id="dp-task-eval-' + t.id + '" type="number" min="1" max="10" placeholder="' + tr('dp_mgmt_eval') + '" class="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '    <button onclick="SAE_DevPlan && SAE_DevPlan.evalTask(' + t.id + ', document.getElementById(\'dp-task-eval-' + t.id + '\').value, \'\')" class="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold"><i class="fas fa-star mr-1"></i>' + tr('dp_mgmt_eval_save') + '</button>' +
    '  </div>' +
    (t.followups.length ? '  <div class="mt-2 space-y-1">' + t.followups.map((f) =>
      '<div class="text-[9px] text-slate-400 border-l-2 border-cyan-500 pl-2">' + f.note + '</div>').join('') + '</div>' : '') +
    '</div>';
}
function mgmtStaffHtml() {
  const reqs = plan.mgmt.staffReqs;
  return '<div class="space-y-2">' +
    (reqs.length ? reqs.map((s) => '<div class="flex items-center justify-between gap-2 rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2">' +
      '<div class="min-w-0"><b class="text-[11px] text-white inline-flex items-center gap-1"><i class="fas ' + posByKey(s.position).icon + ' text-slate-300"></i>' + tr(posByKey(s.position).key) + '</b>' +
      (s.reason ? '<div class="text-[9px] text-slate-400 truncate">' + s.reason + '</div>' : '') + '</div>' +
      (s.status === 'pending'
        ? '<div class="flex gap-1.5 shrink-0">' +
          '<button onclick="SAE_DevPlan && SAE_DevPlan.resolveStaff(' + s.id + ',true)" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[9px] font-bold"><i class="fas fa-check mr-1"></i>' + tr('dp_mgmt_hire') + '</button>' +
          '<button onclick="SAE_DevPlan && SAE_DevPlan.resolveStaff(' + s.id + ',false)" class="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 text-[9px] font-bold"><i class="fas fa-x mr-1"></i></button></div>'
        : '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold ' + (s.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300') + '">' + (s.status === 'approved' ? tr('dp_mgmt_approved') : tr('dp_mgmt_declined')) + '</span>') +
      '</div>').join('')
      : '<div class="text-[10px] text-slate-500">' + tr('dp_mgmt_no_staff') + '</div>') +
    '</div>' +
    '<div class="flex flex-wrap items-center gap-1.5 mt-2">' +
    '<select id="dp-staff-pos" class="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    POSITIONS.map((p) => '<option value="' + p.k + '">' + tr(p.key) + '</option>').join('') +
    '</select>' +
    '<input id="dp-staff-reason" type="text" placeholder="' + tr('dp_mgmt_staff_why') + '…" class="flex-1 min-w-[120px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '<button onclick="SAE_DevPlan && SAE_DevPlan.addStaffReq({position: document.getElementById(\'dp-staff-pos\').value, reason: document.getElementById(\'dp-staff-reason\').value})" class="px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 text-[10px] font-bold"><i class="fas fa-user-plus mr-1"></i>' + tr('dp_mgmt_request_staff') + '</button>' +
    '</div>';
}
function mgmtProblemHtml() {
  const ps = plan.mgmt.problems;
  return '<div class="space-y-2">' +
    (ps.length ? ps.map((p) => {
      const sev = p.severity === 'high' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : (p.severity === 'low' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40');
      return '<div class="rounded-lg border ' + sev + ' border px-3 py-2">' +
        '<div class="flex items-center justify-between gap-2 flex-wrap">' +
        '<b class="text-[11px]">' + p.text + '</b>' + mgmtStatusChip(p.status) + '</div>' +
        '<div class="flex items-center gap-2 mt-1.5 text-[9px] text-slate-400"><span class="inline-flex items-center gap-1"><i class="fas fa-calendar-day"></i>' + tr('dp_mgmt_month') + ' ' + p.targetMonth + '</span>' +
        (p.status !== 'solved'
          ? '<button onclick="SAE_DevPlan && SAE_DevPlan.problemStatus(' + p.id + ',\'doing\')" class="px-2 py-0.5 rounded bg-amber-600 text-[9px]">' + tr('dp_mgmt_st_doing') + '</button>' +
            '<button onclick="SAE_DevPlan && SAE_DevPlan.problemStatus(' + p.id + ',\'solved\')" class="px-2 py-0.5 rounded bg-emerald-600 text-[9px]"><i class="fas fa-check mr-1"></i>' + tr('dp_mgmt_prob_solved') + '</button>'
          : '') +
        '<input data-pnote="' + p.id + '" type="text" placeholder="' + tr('dp_rm_notes') + '…" value="' + p.note + '" class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] text-white w-40">' +
        '<button onclick="SAE_DevPlan && SAE_DevPlan.problemNote(' + p.id + ', document.querySelector(\'[data-pnote="' + p.id + '"]\').value)" class="px-2 py-0.5 rounded bg-slate-700 text-[9px]"><i class="fas fa-save mr-1"></i></button>' +
        '</div></div>';
    }).join('') : '<div class="text-[10px] text-slate-500">' + tr('dp_mgmt_no_probs') + '</div>') +
    '</div>' +
    '<div class="flex flex-wrap items-center gap-1.5 mt-2">' +
    '<input id="dp-prob-text" type="text" placeholder="' + tr('dp_mgmt_prob_new') + '…" class="flex-1 min-w-[140px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '<select id="dp-prob-sev" class="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '<option value="low">' + tr('dp_mgmt_sev_low') + '</option><option value="med">' + tr('dp_mgmt_sev_med') + '</option><option value="high">' + tr('dp_mgmt_sev_high') + '</option></select>' +
    '<input id="dp-prob-mo" type="number" min="1" value="' + (ensureRoadmap().horizon) + '" class="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '<button onclick="SAE_DevPlan && SAE_DevPlan.addProblem({text: document.getElementById(\'dp-prob-text\').value, severity: document.getElementById(\'dp-prob-sev\').value, targetMonth: document.getElementById(\'dp-prob-mo\').value})" class="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-[10px] font-bold"><i class="fas fa-bug mr-1"></i>' + tr('dp_mgmt_add_prob') + '</button>' +
    '</div>';
}
function mgmtSectionHtml() {
  const m = plan.mgmt;
  const r = ensureRoadmap();
  const total = mgmtTotalCost();
  const cpm = calculateCPM();
  const stepDefs = [
    { key: 'draft', labelKey: 'dp_mgmt_st_draft', icon: 'fa-pen-ruler', note: tr('dp_mgmt_step_draft_note') },
    { key: 'mgmt_ok', labelKey: 'dp_mgmt_st_mgmt_ok', icon: 'fa-file-signature', note: tr('dp_mgmt_step_mgmt_note') },
    { key: 'finance_ok', labelKey: 'dp_mgmt_st_finance_ok', icon: 'fa-coins', note: tr('dp_mgmt_step_finance_note') },
    { key: 'distributed', labelKey: 'dp_mgmt_st_distributed', icon: 'fa-paper-plane', note: tr('dp_mgmt_step_dist_note') },
    { key: 'monitoring', labelKey: 'dp_mgmt_st_monitoring', icon: 'fa-eye', note: tr('dp_mgmt_step_monitor_note') },
  ];
  const cur = mgmtStatusIdx();
  const stepper = stepDefs.map((s, i) => {
    const state = i < cur ? 'done' : (i === cur ? 'now' : 'wait');
    const cls = state === 'done' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : (state === 'now' ? 'bg-amber-500/15 text-amber-200 border-amber-500/50' : 'bg-slate-800/60 text-slate-500 border-slate-700/60');
    const icon = state === 'done' ? 'fa-check' : s.icon;
    return '<div class="flex-1 text-center px-1">' +
      '<div class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold ' + cls + '"><i class="fas ' + icon + '"></i><span data-key="' + s.labelKey + '">' + tr(s.labelKey) + '</span></div>' +
      '<div class="mt-1 text-[8px] text-slate-500 leading-tight">' + s.note + '</div></div>';
  }).join('');
  const financeBlock = m.status === 'mgmt_ok'
    ? '<div class="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">' +
    '<div class="text-[10px] font-bold text-amber-200 mb-2"><i class="fas fa-coins mr-1"></i><span data-key="dp_mgmt_fin_need">Funding needed</span> <b class="font-mono">' + fmtNum(total) + '</b></div>' +
    '<div class="flex flex-wrap items-center gap-1.5">' +
    '<input id="dp-fin-amount" type="number" value="' + total + '" class="w-28 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[10px] text-white">' +
    '<button onclick="SAE_DevPlan && SAE_DevPlan.mgmtFinanceApprove(document.getElementById(\'dp-fin-amount\').value)" class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold"><i class="fas fa-check mr-1"></i><span data-key="dp_mgmt_fin_approve">Approve funding</span></button>' +
    '<button onclick="SAE_DevPlan && SAE_DevPlan.mgmtRejectFinance(\'\')" class="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-[10px] font-bold"><i class="fas fa-x mr-1"></i><span data-key="dp_mgmt_fin_reject">Reject</span></button>' +
    '</div></div>'
    : (m.status === 'finance_ok' ? '<div class="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-200"><i class="fas fa-circle-check mr-1"></i><span data-key="dp_mgmt_fin_approved_note">Funding approved</span>: <b class="font-mono">' + fmtNum(m.costApproved) + '</b></div>' : '');
  const actionBtn = m.status === 'draft'
    ? '<button onclick="SAE_DevPlan && SAE_DevPlan.mgmtApprove()" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold"><i class="fas fa-check mr-1"></i><span data-key="dp_mgmt_act_mgmt">Approve plan / send it on</span></button>'
    : (m.status === 'mgmt_ok' || m.status === 'finance_ok'
      ? '<button onclick="SAE_DevPlan && SAE_DevPlan.mgmtApprove()" class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold"><i class="fas fa-paper-plane mr-1"></i><span data-key="dp_mgmt_act_dist">Distribute to those in charge</span></button>'
      : (m.status === 'distributed'
        ? '<button onclick="SAE_DevPlan && SAE_DevPlan.mgmtApprove()" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold"><i class="fas fa-eye mr-1"></i><span data-key="dp_mgmt_act_mon">Start monitoring</span></button>'
        : '<button onclick="SAE_DevPlan && SAE_DevPlan.mgmtApprove()" class="px-4 py-2 rounded-lg bg-slate-600 text-xs font-bold"><i class="fas fa-rotate-left mr-1"></i><span data-key="dp_mgmt_act_restart">Restart cycle</span></button>'));
  /* أزرار إضافة المهام + النماذج الجاهزة */
  const taskForm = '<div class="flex flex-wrap items-center gap-1.5 mt-2">' +
    '<input id="dp-task-title" type="text" placeholder="' + tr('dp_mgmt_task_new') + '…" class="flex-1 min-w-[140px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '<select id="dp-task-pos" class="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    POSITIONS.map((p) => '<option value="' + p.k + '">' + tr(p.key) + '</option>').join('') +
    '</select>' +
    '<input id="dp-task-cost" type="number" placeholder="' + tr('dp_mgmt_cost') + '" class="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-white">' +
    '<button onclick="SAE_DevPlan && SAE_DevPlan.addTask({title: document.getElementById(\'dp-task-title\').value, position: document.getElementById(\'dp-task-pos\').value, cost: document.getElementById(\'dp-task-cost\').value})" class="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-[10px] font-bold"><i class="fas fa-plus mr-1"></i><span data-key="dp_mgmt_add_task">Add task</span></button>' +
    '</div>';

  /* WBS + Gantt + Baselines sections */
  const wbsGanttSection = '' +
    '<div class="mt-4 grid grid-cols-1 gap-4">' +
    '  <div class="rounded-xl border border-slate-700/70 bg-slate-800/40 p-4">' +
    '    <div class="flex items-center justify-between mb-3">' +
    '      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400"><i class="fas fa-sitemap mr-1"></i><span data-key="dp_wbs_title">Work Breakdown Structure (WBS)</span></div>' +
    '      <div class="flex items-center gap-2 text-[10px] text-slate-400">' +
    '        <span><i class="fas fa-fire text-rose-400"></i> <b class="text-rose-300">' + cpm.criticalPath.length + '</b> ' + tr('dp_cpm_critical_tasks') + '</span>' +
    '        <span><i class="fas fa-calendar text-cyan-400"></i> ' + tr('dp_cpm_project_dur') + ': <b class="text-cyan-300">' + cpm.projectDuration + '</b> ' + tr('dp_cpm_days') + '</span>' +
    '      </div>' +
    '    </div>' +
    '    <div class="space-y-1">' + (m.tasks.length ? renderWBSTree(m.tasks) : '<div class="text-[10px] text-slate-500">' + tr('dp_mgmt_no_tasks') + '</div>') + '</div>' +
    '  </div>' +
    '  <div class="rounded-xl border border-slate-700/70 bg-slate-800/40 p-4">' +
    '    <div class="flex items-center justify-between mb-3">' +
    '      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400"><i class="fas fa-chart-gantt mr-1"></i><span data-key="dp_gantt_title">Gantt Chart</span></div>' +
    '    </div>' +
    '    <div id="dp-gantt-container" style="overflow-x: auto;">' + renderGanttChart(m.tasks) + '</div>' +
    '  </div>' +
    '  <div class="rounded-xl border border-slate-700/70 bg-slate-800/40 p-4">' +
    '    <div class="flex items-center justify-between mb-3">' +
    '      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400"><i class="fas fa-history mr-1"></i><span data-key="dp_baseline_title">Baselines</span></div>' +
    '      <button onclick="SAE_DevPlan && SAE_DevPlan.saveBaseline()" class="px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 text-[10px] font-bold"><i class="fas fa-save mr-1"></i>' + tr('dp_baseline_save') + '</button>' +
    '    </div>' +
    '    <div class="space-y-1">' + ((m.baselines || []).length ? (m.baselines || []).map((b) =>
      '<div class="flex items-center justify-between gap-2 rounded-lg bg-slate-900/50 border border-slate-700/60 px-3 py-2">' +
      '<div class="min-w-0"><b class="text-[10px] text-white">' + new Date(b.savedAt).toLocaleString() + '</b>' +
      '<div class="text-[9px] text-slate-400">' + tr('dp_baseline_phases') + ': ' + (b.phases ? b.phases.length : 0) + ' · ' + tr('dp_baseline_tasks') + ': ' + (b.tasks ? b.tasks.length : 0) + '</div></div>' +
      '<div class="flex gap-1.5 shrink-0">' +
      '<button onclick="SAE_DevPlan && SAE_DevPlan.restoreBaseline(' + b.id + ')" class="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-[9px] font-bold"><i class="fas fa-undo mr-1"></i>' + tr('dp_baseline_restore') + '</button>' +
      '<button onclick="SAE_DevPlan && SAE_DevPlan.deleteBaseline(' + b.id + ')" class="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-[9px] font-bold"><i class="fas fa-trash"></i></button>' +
      '</div></div>').join('') : '<div class="text-[10px] text-slate-500">' + tr('dp_baseline_none') + '</div>') + '</div>' +
    '  </div>' +
    '</div>';

  return '' +
    '<div class="mt-8 bg-slate-900 rounded-2xl border border-indigo-500/30 p-5">' +
    '    <div class="flex items-center gap-3 mb-4 flex-wrap">' +
    '      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm"><i class="fas fa-clipboard-user"></i></div>' +
    '      <div class="flex-1 min-w-[220px]">' +
    '        <div class="text-base font-bold text-white"><span data-key="dp_mgmt_title">Execution management</span> <span class="ml-1 text-[9px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 font-bold" data-key="dp_mgmt_st_' + m.status + '">' + tr('dp_mgmt_st_' + m.status) + '</span></div>' +
    '        <div class="text-[10px] text-slate-400"><span data-key="dp_mgmt_desc">Management approves the plan; finance secures the money; tasks are delegated by job title; HR fills the team.</span></div>' +
    '      </div>' +
    '      <button onclick="SAE_DevPlan && SAE_DevPlan.printPlan()" class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-bold"><i class="fas fa-print mr-1"></i><span data-key="dp_mgmt_print">Print the plan</span></button>' +
    '      ' + actionBtn +
    '    </div>' +
    '    <div class="flex gap-2 mb-4">' + stepper + '</div>' +
    financeBlock +
    (m.logs.length ? '<div class="mt-3 space-y-1 max-h-32 overflow-y-auto">' + m.logs.map((g) =>
      '<div class="flex items-center gap-2 text-[9px] text-slate-500"><i class="fas fa-circle text-[6px] text-indigo-400"></i><span data-key="' + g.role + '">' + tr(g.role) + '</span> · ' + g.note + '</div>').join('') + '</div>' : '') +
    '    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">' +
    '      <div> <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-list-check mr-1"></i><span data-key="dp_mgmt_tasks_title">Tasks by job title</span>' + (total > 0 ? ' · <span data-key="dp_mgmt_cost_total">total cost</span> <b class="font-mono text-amber-300">' + fmtNum(total) + '</b>' : '') + '</div>' +
    '        <div class="space-y-2">' + (m.tasks.length ? m.tasks.map((t, i) => mgmtTaskRowHtml(t, i)).join('') : '<div class="text-[10px] text-slate-500">' + tr('dp_mgmt_no_tasks') + '</div>') + '</div>' + taskForm + '</div>' +
    '      <div class="space-y-4">' +
    '        <div><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-user-plus mr-1"></i><span data-key="dp_mgmt_hr_title">HR — fill the team</span></div>' + mgmtStaffHtml() + '</div>' +
    '        <div><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fas fa-bug mr-1"></i><span data-key="dp_mgmt_problem_title">Problem scheduler</span> <span class="text-slate-500">(<span data-key="dp_mgmt_problem_outside">even outside the plan</span>)</span></div>' + mgmtProblemHtml() + '</div>' +
    '      </div>' +
    '    </div>' +
    wbsGanttSection +
    '  </div>';
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
    updateRoadmap, evaluatePhase, rebaseline,
    openRoadForm, applyRoadForm, cancelRoadForm,
    roadAnalytics: () => roadAnalytics(),
    roadDeptFeed: () => roadDeptFeed(),
    roadFeasibility: () => roadFeasibility(),
    applyScenario, keepPlan,
    roadReport: () => roadReport(),
    exportReport,
    scanRisks: () => scanRisks(),
    acceptRisk, mitigateRisk,
    roadRiskHtml: () => roadRiskHtml(),
    getRoadmap: () => ensureRoadmap(),
    mgmtApprove, mgmtFinanceApprove, mgmtRejectFinance,
    mgmtState: () => ({ status: plan.mgmt.status, costTotal: mgmtTotalCost(), costApproved: plan.mgmt.costApproved }),
    addTask, taskFollow, taskStatus, evalTask, taskCost, delTask,
    addStaffReq, resolveStaff,
    addProblem, problemStatus, problemNote,
    printPlan: () => printPlan(),
    calculateCPM: () => calculateCPM(),
    addPredecessor, removePredecessor, setTaskDuration,
    saveBaseline, deleteBaseline, restoreBaseline,
  };
  return window.SAE_DevPlan;
}

export { initDevPlan, template };