const {
  getDb,
  persistStore,
  getAllUsers,
  appendChangeLogs,
} = require('../db/database');
const {
  KPI_DEPT,
  KPI_DEPT_PMO,
  listKpiDeptMembers,
} = require('../utils/kpiPlanAccess');

/** 实施交付部首套计划起始月 */
const FIRST_BOOTSTRAP_MONTH = '2026-08';
/** 项目管控部首套计划起始月 */
const FIRST_BOOTSTRAP_MONTH_PMO = '2026-09';

function getFirstBootstrapMonthForDept(dept) {
  if (dept === KPI_DEPT_PMO) return FIRST_BOOTSTRAP_MONTH_PMO;
  return FIRST_BOOTSTRAP_MONTH;
}

const PROJECT_NAME_DEFAULT = '岗位标准要求';

const WEEK_LABELS = ['第一', '第二', '第三', '第四'];

const FIXED_TEMPLATE_ORDER = [
  'monthly_review',
  'monthly_plan',
  'task_closure',
  'doc_archive',
  'issue_risk',
  'responsibility',
  'weekly_report',
];

const FIXED_TEMPLATE_ORDER_PMO = [
  'pmo_progress_ledger',
  'pmo_risk_alert',
  'pmo_weekly_summary',
  'pmo_key_project_push',
  'pmo_pdca_review',
];

/** 月度实际完成结果（对外展示的状态） */
const MONTHLY_RESULT_OPTIONS = {
  not_done: { label: '未完成', status: 'pending' },
  doing: { label: '进行中', status: 'doing' },
  paused: { label: '暂停中', status: 'paused' },
  done: { label: '已完成', status: 'done' },
};

function normalizeMonthlyResultKey(value) {
  const s = String(value || '').trim();
  if (MONTHLY_RESULT_OPTIONS[s]) return s;
  const byLabel = Object.entries(MONTHLY_RESULT_OPTIONS).find(([, v]) => v.label === s);
  if (byLabel) return byLabel[0];
  return 'not_done';
}

function monthlyResultLabel(key) {
  return MONTHLY_RESULT_OPTIONS[normalizeMonthlyResultKey(key)]?.label || '未完成';
}

function syncStatusFromMonthlyResult(plan) {
  const key = normalizeMonthlyResultKey(plan.monthlyResult);
  plan.monthlyResult = key;
  const opt = MONTHLY_RESULT_OPTIONS[key];
  if (opt) plan.status = opt.status;
  if (key === 'done') plan.progress = 100;
}

const FIXED_TEMPLATES = [
  {
    key: 'monthly_review',
    taskName: '月度复盘',
    targetDeliverable: '每月1~5日提交上月任务的复盘',
    dateRule: { kind: 'monthRange', startDay: 1, endDay: 5 },
  },
  {
    key: 'monthly_plan',
    taskName: '计划安排',
    targetDeliverable: '每月25~30日制定下月计划；计划可执行率≥90%。',
    dateRule: { kind: 'monthRange', startDay: 25, endDay: 30, endCapDay: 30 },
  },
  {
    key: 'task_closure',
    taskName: '计划任务跟进与闭环',
    targetDeliverable: '里程碑按期达成率≥90%；任务闭环率≥95%。',
    dateRule: { kind: 'fullMonth' },
  },
  {
    key: 'doc_archive',
    taskName: '项目资料完整沉淀',
    targetDeliverable: '资料齐套率100%；归档及时率≥95%；',
    dateRule: { kind: 'fullMonth' },
  },
  {
    key: 'issue_risk',
    taskName: '问题清单闭环与风险管控',
    targetDeliverable: '问题清单日更；分类准确率≥90%；问题闭环率≥95%',
    dateRule: { kind: 'fullMonth' },
  },
  {
    key: 'responsibility',
    taskName: '责任心与价值观',
    targetDeliverable: '当日业务、项目问题2小时内响应!',
    dateRule: { kind: 'fullMonth' },
  },
  {
    key: 'weekly_report',
    taskName: '项目整体节点主动汇报',
    targetDeliverable: '一周一次项目总结汇报；月初空档 1~2 天由本项覆盖',
    deliverable: '周汇报文件',
    dateRule: { kind: 'weeklySplit', weeks: 4 },
  },
];

/** 项目管控部固定计划（源自《2026陈璇通用绩效考核表_项目管控部副科长》） */
const FIXED_TEMPLATES_PMO = [
  {
    key: 'pmo_progress_ledger',
    taskName: '项目进度跟踪与台账管理',
    targetDeliverable: '项目台账覆盖率100%；每周更新；能准确回答各项目当前状态。',
    dateRule: { kind: 'fullMonth' },
  },
  {
    key: 'pmo_risk_alert',
    taskName: '风险识别与预警上报',
    targetDeliverable: '风险识别及时率≥90%；P0问题24小时内上报；问题清单闭环率≥80%。',
    dateRule: { kind: 'fullMonth' },
  },
  {
    key: 'pmo_weekly_summary',
    taskName: '周报收集与月度汇总',
    targetDeliverable: '周报收集率100%；周报汇总按时输出；月度报告经审核通过。',
    deliverable: '周报汇总/项目看板',
    dateRule: { kind: 'weeklySplit', weeks: 4 },
  },
  {
    key: 'pmo_key_project_push',
    taskName: '重点项目进度跟进与推动',
    targetDeliverable: '重点项目跟进率≥90%；关键节点信息准确；问题推动有记录有反馈。',
    dateRule: { kind: 'fullMonth' },
  },
  {
    key: 'pmo_pdca_review',
    taskName: '计划跟进与复盘总结（PDCA闭环）',
    targetDeliverable: '重点节点跟进率≥90%；问题推动闭环率≥80%；月度复盘报告按时输出。',
    dateRule: { kind: 'fullMonth' },
  },
];

function getFixedTemplatesForDept(dept) {
  if (dept === KPI_DEPT_PMO) return FIXED_TEMPLATES_PMO;
  return FIXED_TEMPLATES;
}

function getFixedTemplateOrderForDept(dept) {
  if (dept === KPI_DEPT_PMO) return FIXED_TEMPLATE_ORDER_PMO;
  return FIXED_TEMPLATE_ORDER;
}

function isWeeklyFixedTemplateKey(key) {
  return key === 'weekly_report' || key === 'pmo_weekly_summary';
}

function genId(prefix = 'KPI') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function normalizeYearMonth(ym) {
  const m = String(ym || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, '0')}`;
}

function addMonths(yearMonth, delta) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym) return null;
  const [y, mo] = ym.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(yearMonth) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym) return null;
  const [y, mo] = ym.split('-').map(Number);
  const day = new Date(y, mo, 0).getDate();
  return `${ym}-${String(day).padStart(2, '0')}`;
}

function padDate(yearMonth, day) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym) return null;
  return `${ym}-${String(day).padStart(2, '0')}`;
}

function compareDate(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthNumber(yearMonth) {
  return parseInt(String(yearMonth || '').split('-')[1], 10) || 0;
}

function calcPlanDates(yearMonth, dateRule) {
  if (!dateRule) return { planStartDate: null, planEndDate: null };
  if (dateRule.kind === 'monthRange') {
    const last = parseInt(String(lastDayOfMonth(yearMonth)).slice(-2), 10);
    let endDay = dateRule.endDay;
    if (dateRule.endCapDay) endDay = Math.min(dateRule.endCapDay, last);
    else endDay = Math.min(endDay, last);
    const startDay = Math.min(dateRule.startDay, last);
    endDay = Math.max(startDay, Math.min(endDay, last));
    return {
      planStartDate: padDate(yearMonth, startDay),
      planEndDate: padDate(yearMonth, endDay),
    };
  }
  if (dateRule.kind === 'fullMonth') {
    return {
      planStartDate: padDate(yearMonth, 1),
      planEndDate: lastDayOfMonth(yearMonth),
    };
  }
  if (dateRule.kind === 'weeklySplit') {
    return null;
  }
  return { planStartDate: null, planEndDate: null };
}

/** 月初空档 ≥ 此天数时并入第一周，否则由父任务覆盖 */
const MONTH_WEEK_GAP_MERGE_THRESHOLD = 3;

/** 方案 C：固定 4 周；空档 1~2 天归父任务，≥3 天并入第一周，月末归第四周 */
function calcMonthWeekRanges(yearMonth) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym) return [];
  const [y, mo] = ym.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();

  let firstMonday = 1;
  while (firstMonday <= lastDay && new Date(y, mo - 1, firstMonday).getDay() !== 1) {
    firstMonday += 1;
  }
  if (firstMonday > lastDay) {
    return [[padDate(ym, 1), padDate(ym, lastDay)]];
  }

  const gapDays = firstMonday - 1;
  const week1Start = gapDays >= MONTH_WEEK_GAP_MERGE_THRESHOLD ? 1 : firstMonday;
  const week1End = Math.min(firstMonday + 6, lastDay);

  const ranges = [[padDate(ym, week1Start), padDate(ym, week1End)]];
  let weekStart = week1End + 1;
  while (ranges.length < 4 && weekStart <= lastDay) {
    const weekEnd = Math.min(weekStart + 6, lastDay);
    ranges.push([padDate(ym, weekStart), padDate(ym, weekEnd)]);
    weekStart = weekEnd + 1;
  }

  while (ranges.length < 4) {
    ranges.push([padDate(ym, lastDay), padDate(ym, lastDay)]);
  }

  // 月末剩余天数并入第四周
  const lastRange = ranges[ranges.length - 1];
  const monthEnd = padDate(ym, lastDay);
  if (lastRange && lastRange[1] < monthEnd) {
    lastRange[1] = monthEnd;
  }
  return ranges.slice(0, 4);
}

/** 月初 1~2 天空档的结束日（由父任务覆盖）；≥3 天已并入第一周 */
function calcMonthWeekGapEnd(yearMonth) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym) return null;
  const [y, mo] = ym.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  let firstMonday = 1;
  while (firstMonday <= lastDay && new Date(y, mo - 1, firstMonday).getDay() !== 1) {
    firstMonday += 1;
  }
  const gapDays = firstMonday - 1;
  if (gapDays <= 0 || gapDays >= MONTH_WEEK_GAP_MERGE_THRESHOLD) return null;
  return padDate(ym, firstMonday - 1);
}

function calcWeekDates(yearMonth, weekIndex) {
  const ranges = calcMonthWeekRanges(yearMonth);
  const [start, end] = ranges[weekIndex] || ranges[ranges.length - 1];
  return {
    planStartDate: start,
    planEndDate: end,
  };
}

function ensureKpiPlansArray(store) {
  if (!Array.isArray(store.kpiPlans)) store.kpiPlans = [];
  return store.kpiPlans;
}

function planDedupeKey(plan) {
  const parts = [
    plan.assigneeId || plan.assignee,
    plan.yearMonth,
    plan.templateKey || plan.type,
    plan.weekIndex != null ? String(plan.weekIndex) : '',
  ];
  return parts.join('|');
}

function findExistingPlan(plans, user, yearMonth, templateKey, weekIndex = null) {
  return plans.find(p =>
    p.yearMonth === yearMonth &&
    p.templateKey === templateKey &&
    (p.assigneeId === user.id || p.assignee === user.name) &&
    (weekIndex == null ? p.weekIndex == null : p.weekIndex === weekIndex)
  );
}

function findMonthlyPlanArrange(plans, user, yearMonth) {
  return findExistingPlan(plans, user, yearMonth, 'monthly_plan');
}

function findAssigneeUser(plan, users = getAllUsers()) {
  if (!plan) return null;
  if (plan.assigneeId) {
    const byId = (users || []).find(u => u.id === plan.assigneeId);
    if (byId) return byId;
  }
  if (plan.assignee) {
    return (users || []).find(u => u.name === plan.assignee) || null;
  }
  return null;
}

/** 计划所属部门：优先责任人当前部门，其次落库字段 */
function resolvePlanDept(plan, users = getAllUsers()) {
  const assignee = findAssigneeUser(plan, users);
  if (assignee?.dept) return assignee.dept;
  return plan?.dept || KPI_DEPT;
}

function normalizePlanRecord(raw, users = getAllUsers()) {
  const plan = { ...raw };
  plan.dept = resolvePlanDept(plan, users);
  plan.projectName = String(plan.projectName || '').trim();
  plan.taskName = String(plan.taskName || '').trim();
  plan.targetDeliverable = String(plan.targetDeliverable || '').trim();
  plan.assignee = String(plan.assignee || '').trim();
  plan.collaborators = Array.isArray(plan.collaborators)
    ? [...new Set(plan.collaborators.map(String).filter(Boolean))]
    : [];
  plan.riskMitigation = String(plan.riskMitigation || '').trim();
  plan.desc = String(plan.desc || '').trim();
  plan.progress = Math.max(0, Math.min(100, parseInt(plan.progress, 10) || 0));
  if (!['pending', 'doing', 'done', 'cancelled', 'paused'].includes(plan.status)) {
    plan.status = 'pending';
  }
  const rawResult = String(raw.monthlyResult || '').trim();
  if (!rawResult || !MONTHLY_RESULT_OPTIONS[normalizeMonthlyResultKey(rawResult)]) {
    const legacy = { pending: 'not_done', doing: 'doing', paused: 'paused', done: 'done', cancelled: 'paused' };
    plan.monthlyResult = legacy[plan.status] || 'not_done';
  } else {
    plan.monthlyResult = normalizeMonthlyResultKey(rawResult);
  }
  syncStatusFromMonthlyResult(plan);
  return plan;
}

function createPlanSkeleton(user, fields) {
  const now = new Date().toISOString();
  const assigneeId = fields.assigneeId || user.id;
  const assigneeUser = (getAllUsers() || []).find(u => u.id === assigneeId) || user;
  const dept = fields.dept || assigneeUser?.dept || user?.dept || KPI_DEPT;
  return normalizePlanRecord({
    id: genId(),
    dept,
    type: 'fixed',
    status: 'pending',
    progress: 0,
    collaborators: [],
    riskMitigation: '',
    desc: '',
    monthlyResult: 'not_done',
    actualStartDate: null,
    actualEndDate: null,
    createdAt: now,
    createdBy: '系统',
    updatedAt: now,
    updatedBy: '系统',
    completedAt: null,
    assigneeId: user.id,
    assignee: user.name,
    ...fields,
    dept,
  });
}

function generateFixedPlansForUserMonth(user, yearMonth, plans) {
  const created = [];
  const ym = normalizeYearMonth(yearMonth);
  const bootstrap = getFirstBootstrapMonthForDept(user?.dept);
  if (!ym || compareDate(ym, bootstrap) < 0) return created;

  const templates = getFixedTemplatesForDept(user.dept);
  for (const tpl of templates) {
    if (tpl.dateRule.kind === 'weeklySplit') {
      if (findExistingPlan(plans, user, ym, tpl.key)) continue;
      const parent = createPlanSkeleton(user, {
        yearMonth: ym,
        type: 'fixed',
        templateKey: tpl.key,
        projectName: PROJECT_NAME_DEFAULT,
        taskName: tpl.taskName,
        targetDeliverable: tpl.targetDeliverable,
        ...calcPlanDates(ym, { kind: 'fullMonth' }),
        isParent: true,
      });
      plans.push(parent);
      created.push(parent);

      for (let i = 0; i < tpl.dateRule.weeks; i++) {
        if (findExistingPlan(plans, user, ym, tpl.key, i)) continue;
        const m = monthNumber(ym);
        const child = createPlanSkeleton(user, {
          yearMonth: ym,
          type: 'fixed',
          templateKey: tpl.key,
          parentId: parent.id,
          weekIndex: i,
          projectName: PROJECT_NAME_DEFAULT,
          taskName: `${m}月${WEEK_LABELS[i]}周`,
          targetDeliverable: tpl.deliverable || '周汇报文件',
          ...calcWeekDates(ym, i),
        });
        plans.push(child);
        created.push(child);
      }
      continue;
    }

    if (findExistingPlan(plans, user, ym, tpl.key)) continue;
    const plan = createPlanSkeleton(user, {
      yearMonth: ym,
      type: 'fixed',
      templateKey: tpl.key,
      projectName: PROJECT_NAME_DEFAULT,
      taskName: tpl.taskName,
      targetDeliverable: tpl.targetDeliverable,
      ...calcPlanDates(ym, tpl.dateRule),
    });
    plans.push(plan);
    created.push(plan);
  }

  return created;
}

function ensureKpiPlansForUser(user, todayStr = todayDateStr()) {
  const store = getDb();
  const plans = ensureKpiPlansArray(store);
  const ym = currentYearMonth();
  const created = [];
  const bootstrap = getFirstBootstrapMonthForDept(user?.dept);

  if (compareDate(ym, bootstrap) >= 0) {
    created.push(...generateFixedPlansForUserMonth(user, ym, plans));
  }

  const planArrange = findMonthlyPlanArrange(plans, user, ym);
  const day = parseInt(String(todayStr).slice(8, 10), 10) || 0;
  const shouldGenNext =
    (planArrange?.planStartDate && compareDate(todayStr, planArrange.planStartDate) >= 0) ||
    (user.dept === KPI_DEPT_PMO && day >= 25);
  if (shouldGenNext) {
    const nextYm = addMonths(ym, 1);
    if (nextYm && compareDate(nextYm, bootstrap) >= 0) {
      created.push(...generateFixedPlansForUserMonth(user, nextYm, plans));
    }
  }

  if (created.length) persistStore();
  return created;
}

function refreshFixedWeeklyDates(plans, yearMonth) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym) return false;
  const ranges = calcMonthWeekRanges(ym);
  const fullMonth = calcPlanDates(ym, { kind: 'fullMonth' });
  const m = monthNumber(ym);
  let changed = false;
  for (const p of plans) {
    if (p.yearMonth !== ym || p.type !== 'fixed' || !isWeeklyFixedTemplateKey(p.templateKey)) continue;
    if (p.isParent) {
      if (p.planStartDate !== fullMonth.planStartDate || p.planEndDate !== fullMonth.planEndDate) {
        p.planStartDate = fullMonth.planStartDate;
        p.planEndDate = fullMonth.planEndDate;
        p.updatedAt = new Date().toISOString();
        changed = true;
      }
      continue;
    }
    if (p.weekIndex == null) continue;
    const range = ranges[p.weekIndex];
    if (!range) continue;
    const [start, end] = range;
    const expectedName = `${m}月${WEEK_LABELS[p.weekIndex] || ''}周`;
    if (p.planStartDate !== start || p.planEndDate !== end || p.taskName !== expectedName) {
      p.planStartDate = start;
      p.planEndDate = end;
      p.taskName = expectedName;
      p.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  return changed;
}

function purgeKpiPlansBeforeDeptBootstrap(plans) {
  let removed = 0;
  const users = getAllUsers();
  for (let i = (plans || []).length - 1; i >= 0; i--) {
    const p = plans[i];
    const ym = normalizeYearMonth(p?.yearMonth);
    if (!ym) continue;
    const dept = resolvePlanDept(p, users);
    const bootstrap = getFirstBootstrapMonthForDept(dept);
    if (compareDate(ym, bootstrap) < 0) {
      plans.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

function ensureKpiPlansForMonth(yearMonth) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym || compareDate(ym, FIRST_BOOTSTRAP_MONTH) < 0) return 0;
  const members = listKpiDeptMembers(getAllUsers());
  let total = 0;
  const store = getDb();
  const plans = ensureKpiPlansArray(store);
  const purged = purgeKpiPlansBeforeDeptBootstrap(plans);
  for (const user of members) {
    total += generateFixedPlansForUserMonth(user, ym, plans).length;
  }
  const refreshed = refreshFixedWeeklyDates(plans, ym);
  if (total || refreshed || purged) persistStore();
  return total;
}

function ensureKpiPlansForDept(todayStr = todayDateStr()) {
  const store = getDb();
  const plans = ensureKpiPlansArray(store);
  const purged = purgeKpiPlansBeforeDeptBootstrap(plans);
  const members = listKpiDeptMembers(getAllUsers());
  let total = 0;
  for (const user of members) {
    total += ensureKpiPlansForUser(user, todayStr).length;
  }
  if (purged) persistStore();
  return total;
}

function listMonthOptionsFromPlans(plans) {
  const set = new Set([FIRST_BOOTSTRAP_MONTH, currentYearMonth()]);
  (plans || []).forEach(p => {
    if (p?.yearMonth) set.add(p.yearMonth);
  });
  return [...set].sort().reverse();
}

function compareKpiPlans(a, b) {
  const deptCmp = String(a.dept || '').localeCompare(String(b.dept || ''), 'zh-CN');
  if (deptCmp !== 0) return deptCmp;
  if (a.type !== b.type) {
    if (a.type === 'fixed') return -1;
    if (b.type === 'fixed') return 1;
  }
  if (a.type === 'fixed' && b.type === 'fixed') {
    const order = getFixedTemplateOrderForDept(a.dept || b.dept);
    const ia = order.indexOf(a.templateKey || '');
    const ib = order.indexOf(b.templateKey || '');
    if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return (a.weekIndex ?? -1) - (b.weekIndex ?? -1);
  }
  const byStart = compareDate(a.planStartDate, b.planStartDate);
  if (byStart !== 0) return byStart;
  return String(a.taskName || '').localeCompare(String(b.taskName || ''), 'zh-CN');
}

function filterPlansForViewer(user, plans, yearMonth) {
  const ym = normalizeYearMonth(yearMonth) || currentYearMonth();
  const users = getAllUsers();
  let list = (plans || [])
    .filter(p => p.yearMonth === ym)
    .map(p => normalizePlanRecord(p, users))
    // 手工停用人员的计划不展示（仍保留在库中，恢复后可见）
    .filter(p => {
      const assignee = findAssigneeUser(p, users);
      return !(assignee && assignee.active === false);
    });
  if (!user) return [];
  const { canViewAllDeptKpiPlans } = require('../utils/kpiPlanAccess');
  if (!canViewAllDeptKpiPlans(user)) {
    list = list.filter(p => p.assigneeId === user.id || p.assignee === user.name);
  }
  return list.sort(compareKpiPlans);
}

function listDeptsFromPlans(plans) {
  const set = new Set();
  for (const p of plans || []) {
    const d = String(p.dept || '').trim();
    if (d) set.add(d);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

const TRACKED_FIELDS = [
  ['projectName', '项目名称'],
  ['taskName', '专项任务'],
  ['targetDeliverable', '任务目标&交付物'],
  ['planStartDate', '计划开始日期'],
  ['planEndDate', '计划截止日期'],
  ['assignee', '责任人'],
  ['collaborators', '协同人'],
  ['riskMitigation', '风险预判&应对措施'],
  ['desc', '说明'],
  ['actualStartDate', '实际开始日期'],
  ['actualEndDate', '实际结束日期'],
  ['progress', '完成百分比'],
  ['monthlyResult', '月度实际完成结果'],
];

function formatFieldValue(key, val) {
  if (key === 'collaborators') {
    return Array.isArray(val) ? val.join('、') : '';
  }
  if (key === 'monthlyResult') {
    return monthlyResultLabel(val);
  }
  return String(val ?? '').trim();
}

function buildChangeEntries(before, after, operator) {
  const entries = [];
  const operateTime = new Date().toLocaleString('zh-CN', { hour12: false });
  for (const [key, label] of TRACKED_FIELDS) {
    const b = formatFieldValue(key, before[key]);
    const a = formatFieldValue(key, after[key]);
    if (b === a) continue;
    entries.push({
      id: genId('L'),
      taskId: `KPI-${after.id}`,
      operator: operator || '系统',
      operateTime,
      before: `${label}：${b || '（空）'}`,
      after: `${label}：${a || '（空）'}`,
      reason: 'KPI计划变更',
      project: `KPI·${after.taskName || after.id}`,
    });
  }
  return entries;
}

function applyStatusSideEffects(plan, prevStatus, operator) {
  const today = todayDateStr();
  const active = plan.status === 'doing' || plan.status === 'paused';
  const wasActive = prevStatus === 'doing' || prevStatus === 'paused';
  if (active && !wasActive && !plan.actualStartDate) {
    plan.actualStartDate = today;
  }
  if (plan.status === 'done' && prevStatus !== 'done') {
    if (!plan.actualStartDate) plan.actualStartDate = today;
    plan.actualEndDate = plan.actualEndDate || today;
    plan.completedAt = new Date().toISOString();
    if (plan.progress < 100) plan.progress = 100;
  }
  plan.updatedAt = new Date().toISOString();
  plan.updatedBy = operator || plan.updatedBy || '系统';
}

function findPlanById(planId) {
  const store = getDb();
  return ensureKpiPlansArray(store).find(p => p.id === planId) || null;
}

function findCustomPlanDuplicate(plans, row) {
  const ym = normalizeYearMonth(row.yearMonth);
  const taskName = String(row.taskName || '').trim();
  const projectName = String(row.projectName || '').trim();
  const assigneeId = row.assigneeId || '';
  const assignee = String(row.assignee || '').trim();
  return plans.find(p =>
    p.type === 'custom' &&
    p.yearMonth === ym &&
    String(p.taskName || '').trim() === taskName &&
    String(p.projectName || '').trim() === projectName &&
    (p.assigneeId === assigneeId || p.assignee === assignee)
  ) || null;
}

function parseCollaborators(raw) {
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  const text = String(raw || '').trim();
  if (!text) return [];
  return text.split(/[,，、;；\n/|]/).map(s => s.trim()).filter(Boolean);
}

function normalizeImportDate(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const parsed = Date.parse(v);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().split('T')[0];
  return null;
}

function normalizeImportPersonName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const cn = s.match(/^([\u4e00-\u9fff]+)/);
  if (cn) return cn[1];
  return s.split(/\s+/)[0];
}

function resolveImportAssignee(rawName, users) {
  const name = normalizeImportPersonName(rawName);
  const full = String(rawName || '').trim();
  if (!name && !full) return null;
  return users.find(u => u.name === full || u.name === name)
    || users.find(u => u.name && normalizeImportPersonName(u.name) === name)
    || users.find(u => u.name && (u.name.startsWith(name) || name.startsWith(normalizeImportPersonName(u.name))))
    || users.find(u => u.name && (u.name.includes(name) || name.includes(normalizeImportPersonName(u.name))))
    || null;
}

function normalizeImportProgress(raw) {
  const text = String(raw || '').trim().replace(/%/g, '');
  if (!text) return 0;
  const num = Math.round(parseFloat(text));
  if (!Number.isFinite(num) || num < 0 || num > 100) return 0;
  return num;
}

function isCustomKpiImportRow(row) {
  const projectName = String(pickImportField(row, 'projectName')).trim();
  const taskName = String(pickImportField(row, 'taskName')).trim();
  if (!taskName) return false;
  if (projectName === '岗位标准要求') return false;
  if (/^(\d+月)?第[一二三四]周$/.test(projectName)) return false;
  return true;
}

const IMPORT_FIELD_ALIASES = {
  projectName: ['项目名称', '项目'],
  taskName: ['专项任务名称(核心工作)', '专项任务名称（核心工作）', '专项任务名称', '专项任务', '任务名称', '核心工作'],
  targetDeliverable: ['任务目标&交付物', '任务目标 & 交付物', '任务目标', '交付物', '目标&交付物'],
  planStartDate: ['计划开始日期', '计划开始', '开始日期'],
  planEndDate: ['计划截止日期', '计划截止时间', '计划截止', '截止日期', '计划结束日期'],
  assignee: ['责任人', '负责人'],
  collaborators: ['协同人', '协办人'],
  riskMitigation: ['风险预判&应对措施', '风险预判 & 应对措施', '风险预判', '应对措施'],
  desc: ['说明', '备注', '描述'],
  actualStartDate: ['实际开始日期', '实际开始时间', '实际开始'],
  actualEndDate: ['实际结束日期', '实际结束时间', '实际结束', '实际完成日期'],
  progress: ['完成百分比', '进度', '完成度'],
  monthlyResult: ['月度实际完成结果', '完成结果', '月度结果'],
};

function pickImportField(row, key) {
  if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  for (const alias of IMPORT_FIELD_ALIASES[key] || []) {
    if (row[alias] != null && String(row[alias]).trim() !== '') return row[alias];
  }
  return '';
}

function mapImportRow(row, yearMonth, users) {
  const assigneeName = String(pickImportField(row, 'assignee')).trim();
  const assigneeUser = resolveImportAssignee(assigneeName, users);
  if (!assigneeUser) {
    throw new Error(`找不到责任人：${assigneeName || '（空）'}`);
  }
  const taskName = String(pickImportField(row, 'taskName')).trim();
  if (!taskName) throw new Error('缺少专项任务名称');
  return {
    yearMonth: normalizeYearMonth(row.yearMonth || yearMonth),
    projectName: String(pickImportField(row, 'projectName')).trim(),
    taskName,
    targetDeliverable: String(pickImportField(row, 'targetDeliverable')).trim(),
    planStartDate: normalizeImportDate(pickImportField(row, 'planStartDate')),
    planEndDate: normalizeImportDate(pickImportField(row, 'planEndDate')),
    assigneeId: assigneeUser.id,
    assignee: assigneeUser.name,
    collaborators: parseCollaborators(pickImportField(row, 'collaborators')),
    riskMitigation: String(pickImportField(row, 'riskMitigation')).trim(),
    desc: String(pickImportField(row, 'desc')).trim(),
    actualStartDate: normalizeImportDate(pickImportField(row, 'actualStartDate')),
    actualEndDate: normalizeImportDate(pickImportField(row, 'actualEndDate')),
    progress: normalizeImportProgress(pickImportField(row, 'progress')),
    monthlyResult: pickImportField(row, 'monthlyResult'),
  };
  if (normalizeMonthlyResultKey(mapped.monthlyResult) === 'done') mapped.progress = 100;
  return mapped;
}

function importCustomKpiPlans(rows, options = {}) {
  const {
    yearMonth,
    operatorName = '系统导入',
    updateExisting = true,
  } = options;
  const store = getDb();
  const plans = ensureKpiPlansArray(store);
  const deptMembers = listKpiDeptMembers(getAllUsers());
  const deptMemberIds = new Set(deptMembers.map(u => u.id));
  const allUsers = getAllUsers();
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < (rows || []).length; i++) {
    const raw = rows[i];
    try {
      if (!raw || typeof raw !== 'object') {
        result.skipped += 1;
        continue;
      }
      if (!isCustomKpiImportRow(raw)) {
        result.skipped += 1;
        continue;
      }
      const mapped = mapImportRow(raw, yearMonth, allUsers);
      if (!deptMemberIds.has(mapped.assigneeId)) {
        result.skipped += 1;
        continue;
      }
      if (!mapped.yearMonth) throw new Error('缺少归属月份');
      const dup = findCustomPlanDuplicate(plans, mapped);
      if (dup && !updateExisting) {
        result.skipped += 1;
        continue;
      }
      if (dup) {
        updateKpiPlan(
          { id: dup.assigneeId, name: operatorName },
          dup.id,
          mapped,
        );
        result.updated += 1;
        continue;
      }
      createCustomPlan(
        { id: mapped.assigneeId, name: operatorName },
        mapped,
      );
      result.created += 1;
    } catch (e) {
      result.errors.push({ row: i + 1, message: e.message || String(e) });
    }
  }
  return result;
}

function createCustomPlan(user, body = {}) {
  const store = getDb();
  const plans = ensureKpiPlansArray(store);
  const ym = normalizeYearMonth(body.yearMonth) || currentYearMonth();
  const assigneeId = body.assigneeId || user.id;
  const assigneeUser = (getAllUsers() || []).find(u => u.id === assigneeId) || user;
  const dept = body.dept || assigneeUser?.dept || user?.dept;
  const bootstrap = getFirstBootstrapMonthForDept(dept);
  if (compareDate(ym, bootstrap) < 0) {
    throw new Error(`计划月份不能早于 ${bootstrap}`);
  }
  const plan = createPlanSkeleton(user, {
    yearMonth: ym,
    type: 'custom',
    templateKey: null,
    projectName: String(body.projectName || '').trim(),
    taskName: String(body.taskName || '').trim(),
    targetDeliverable: String(body.targetDeliverable || '').trim(),
    planStartDate: String(body.planStartDate || '').trim() || null,
    planEndDate: String(body.planEndDate || '').trim() || null,
    assigneeId,
    assignee: String(body.assignee || user.name).trim(),
    dept,
    collaborators: Array.isArray(body.collaborators) ? body.collaborators : [],
    riskMitigation: String(body.riskMitigation || '').trim(),
    desc: String(body.desc || '').trim(),
    progress: body.progress,
    monthlyResult: body.monthlyResult,
    actualStartDate: body.actualStartDate || null,
    actualEndDate: body.actualEndDate || null,
    createdBy: user.name,
    updatedBy: user.name,
  });
  syncStatusFromMonthlyResult(plan);
  if (plan.status === 'doing' || plan.status === 'paused' || plan.status === 'done') {
    applyStatusSideEffects(plan, 'pending', user.name);
  }
  plans.push(plan);
  appendChangeLogs([{
    id: genId('L'),
    taskId: `KPI-${plan.id}`,
    operator: user.name,
    operateTime: new Date().toLocaleString('zh-CN', { hour12: false }),
    before: '（无）',
    after: '创建自定义 KPI 计划',
    reason: '新建计划',
    project: `KPI·${plan.taskName}`,
  }]);
  persistStore();
  return plan;
}

function updateKpiPlan(user, planId, body = {}) {
  const store = getDb();
  const plans = ensureKpiPlansArray(store);
  const idx = plans.findIndex(p => p.id === planId);
  if (idx < 0) throw new Error('计划不存在');
  const prev = { ...plans[idx] };
  const next = normalizePlanRecord({ ...prev });

  const editableKeys = TRACKED_FIELDS.map(([k]) => k);
  for (const key of editableKeys) {
    if (body[key] === undefined) continue;
    if (key === 'collaborators') {
      next.collaborators = Array.isArray(body.collaborators) ? body.collaborators : [];
    } else if (key === 'progress') {
      next.progress = body.progress;
    } else {
      next[key] = body[key];
    }
  }

  if (next.type === 'fixed' && body.planStartDate != null) {
    // 固定计划日期由模板决定，仅 custom 可改；经理可强制改
    const { canViewAllDeptKpiPlans } = require('../utils/kpiPlanAccess');
    if (!canViewAllDeptKpiPlans(user)) {
      next.planStartDate = prev.planStartDate;
      next.planEndDate = prev.planEndDate;
    }
  }

  const prevStatus = prev.status;
  syncStatusFromMonthlyResult(next);
  applyStatusSideEffects(next, prevStatus, user.name);
  next.dept = resolvePlanDept(next, getAllUsers());

  const logs = buildChangeEntries(prev, next, user.name);
  plans[idx] = next;
  if (logs.length) appendChangeLogs(logs);
  persistStore();
  return next;
}

function getPlanChangeLogs(planId) {
  const tid = `KPI-${planId}`;
  const store = getDb();
  return (store.changeLogs || []).filter(l => l.taskId === tid);
}

module.exports = {
  KPI_DEPT,
  KPI_DEPT_PMO,
  FIRST_BOOTSTRAP_MONTH,
  FIRST_BOOTSTRAP_MONTH_PMO,
  getFirstBootstrapMonthForDept,
  FIXED_TEMPLATES,
  FIXED_TEMPLATES_PMO,
  MONTHLY_RESULT_OPTIONS,
  monthlyResultLabel,
  getFixedTemplatesForDept,
  genId,
  normalizeYearMonth,
  addMonths,
  currentYearMonth,
  todayDateStr,
  ensureKpiPlansForDept,
  ensureKpiPlansForMonth,
  ensureKpiPlansForUser,
  filterPlansForViewer,
  listMonthOptionsFromPlans,
  listDeptsFromPlans,
  resolvePlanDept,
  findPlanById,
  findAssigneeUser,
  createCustomPlan,
  updateKpiPlan,
  getPlanChangeLogs,
  normalizePlanRecord,
  compareKpiPlans,
  importCustomKpiPlans,
};
