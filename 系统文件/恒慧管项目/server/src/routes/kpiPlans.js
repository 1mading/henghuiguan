const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { writeErr } = require('../utils/response');
const { getDb } = require('../db/database');
const {
  canAccessKpiPlans,
  canViewKpiPlan,
  canEditKpiPlan,
  canViewAllDeptKpiPlans,
  listKpiDeptMembers,
} = require('../utils/kpiPlanAccess');
const {
  FIRST_BOOTSTRAP_MONTH,
  FIRST_BOOTSTRAP_MONTH_PMO,
  currentYearMonth,
  normalizeYearMonth,
  ensureKpiPlansForDept,
  ensureKpiPlansForMonth,
  filterPlansForViewer,
  listMonthOptionsFromPlans,
  listDeptsFromPlans,
  findPlanById,
  findAssigneeUser,
  createCustomPlan,
  updateKpiPlan,
  getPlanChangeLogs,
  MONTHLY_RESULT_OPTIONS,
  normalizePlanRecord,
} = require('../services/kpiPlans');
const { isBusinessMember, isContactProfile } = require('../utils/staffProfile');

const router = express.Router();

function requireKpiAccess(req, res, next) {
  if (!canAccessKpiPlans(req.user)) {
    return writeErr(res, 403, '无权访问 KPI 计划');
  }
  next();
}

function isInactiveAssigneePlan(plan, users) {
  const assignee = findAssigneeUser(plan, users);
  return !!(assignee && assignee.active === false);
}

function listKpiFilterMembers(store, plans, canViewAll) {
  if (!canViewAll) {
    return listKpiDeptMembers(store.users || [])
      .map(u => ({ id: u.id, name: u.name, role: u.role, dept: u.dept }));
  }
  const byId = new Map();
  for (const u of listKpiDeptMembers(store.users || [])) {
    byId.set(u.id, { id: u.id, name: u.name, role: u.role, dept: u.dept });
  }
  for (const p of plans || []) {
    if (!p.assigneeId && !p.assignee) continue;
    const existing = (store.users || []).find(u =>
      (p.assigneeId && u.id === p.assigneeId) || u.name === p.assignee
    );
    // 已停用不进筛选名单；也不把停用人员当「孤儿责任人」补回
    if (!existing || !isBusinessMember(existing) || isContactProfile(existing)) continue;
    byId.set(existing.id, {
      id: existing.id,
      name: existing.name,
      role: existing.role,
      dept: existing.dept,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const d = String(a.dept || '').localeCompare(String(b.dept || ''), 'zh-CN');
    if (d !== 0) return d;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
  });
}

router.get('/kpi-plans', requireAuth, requireKpiAccess, (req, res) => {
  try {
    const yearMonth = normalizeYearMonth(req.query.yearMonth) || currentYearMonth();
    ensureKpiPlansForDept();
    ensureKpiPlansForMonth(yearMonth);
    const store = getDb();
    const canViewAll = canViewAllDeptKpiPlans(req.user);
    const plans = filterPlansForViewer(req.user, store.kpiPlans || [], yearMonth);
    const monthOptions = listMonthOptionsFromPlans(store.kpiPlans || []);
    const depts = listDeptsFromPlans(plans);
    const members = listKpiFilterMembers(store, plans, canViewAll);
    res.json({
      success: true,
      data: {
        yearMonth,
        firstBootstrapMonth: FIRST_BOOTSTRAP_MONTH,
        firstBootstrapMonthPmo: FIRST_BOOTSTRAP_MONTH_PMO,
        plans,
        monthOptions,
        depts,
        canViewAll,
        members,
        monthlyResultOptions: Object.entries(MONTHLY_RESULT_OPTIONS).map(([value, v]) => ({
          value,
          label: v.label,
        })),
      },
    });
  } catch (e) {
    writeErr(res, 500, e.message || '加载失败');
  }
});

router.get('/kpi-plans/:id', requireAuth, requireKpiAccess, (req, res) => {
  const plan = findPlanById(req.params.id);
  const store = getDb();
  if (!plan || !canViewKpiPlan(req.user, plan) || isInactiveAssigneePlan(plan, store.users)) {
    return writeErr(res, 404, '计划不存在或无权查看');
  }
  const normalized = normalizePlanRecord(plan, store.users);
  const logs = getPlanChangeLogs(plan.id);
  res.json({ success: true, data: { plan: normalized, logs } });
});

router.post('/kpi-plans', requireAuth, requireKpiAccess, (req, res) => {
  try {
    const body = req.body || {};
    const assigneeId = body.assigneeId || req.user.id;
    const store = getDb();
    const assignee = (store.users || []).find(u => u.id === assigneeId);
    if (!assignee) return writeErr(res, 400, '责任人不存在');
    if (assignee.active === false) return writeErr(res, 400, '责任人已停用，无法创建计划');
    if (!canViewAllDeptKpiPlans(req.user) && assigneeId !== req.user.id) {
      return writeErr(res, 403, '仅可为自己创建自定义计划');
    }
    if (!body.taskName?.trim()) return writeErr(res, 400, '请填写专项任务名称');
    const plan = createCustomPlan(req.user, {
      ...body,
      assigneeId,
      assignee: assignee.name,
      dept: assignee.dept,
    });
    res.json({ success: true, data: { plan } });
  } catch (e) {
    writeErr(res, 400, e.message || '创建失败');
  }
});

router.patch('/kpi-plans/:id', requireAuth, requireKpiAccess, (req, res) => {
  const plan = findPlanById(req.params.id);
  const store = getDb();
  if (!plan || !canEditKpiPlan(req.user, plan) || isInactiveAssigneePlan(plan, store.users)) {
    return writeErr(res, 403, '无权编辑该计划');
  }
  try {
    const updated = updateKpiPlan(req.user, plan.id, req.body || {});
    res.json({ success: true, data: { plan: updated } });
  } catch (e) {
    writeErr(res, 400, e.message || '保存失败');
  }
});

module.exports = router;
