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
  currentYearMonth,
  normalizeYearMonth,
  ensureKpiPlansForDept,
  ensureKpiPlansForMonth,
  filterPlansForViewer,
  listMonthOptionsFromPlans,
  findPlanById,
  createCustomPlan,
  updateKpiPlan,
  getPlanChangeLogs,
  MONTHLY_RESULT_OPTIONS,
  normalizePlanRecord,
} = require('../services/kpiPlans');

const router = express.Router();

function requireKpiAccess(req, res, next) {
  if (!canAccessKpiPlans(req.user)) {
    return writeErr(res, 403, '无权访问 KPI 计划');
  }
  next();
}

router.get('/kpi-plans', requireAuth, requireKpiAccess, (req, res) => {
  try {
    const yearMonth = normalizeYearMonth(req.query.yearMonth) || currentYearMonth();
    ensureKpiPlansForDept();
    ensureKpiPlansForMonth(yearMonth);
    const store = getDb();
    const plans = filterPlansForViewer(req.user, store.kpiPlans || [], yearMonth)
      .map(p => normalizePlanRecord(p));
    const monthOptions = listMonthOptionsFromPlans(store.kpiPlans || []);
    const members = listKpiDeptMembers(store.users || []);
    res.json({
      success: true,
      data: {
        yearMonth,
        firstBootstrapMonth: FIRST_BOOTSTRAP_MONTH,
        plans,
        monthOptions,
        canViewAll: canViewAllDeptKpiPlans(req.user),
        members: members.map(u => ({ id: u.id, name: u.name, role: u.role })),
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
  if (!plan || !canViewKpiPlan(req.user, plan)) {
    return writeErr(res, 404, '计划不存在或无权查看');
  }
  const normalized = normalizePlanRecord(plan);
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
    if (!canViewAllDeptKpiPlans(req.user) && assigneeId !== req.user.id) {
      return writeErr(res, 403, '仅可为自己创建自定义计划');
    }
    if (!body.taskName?.trim()) return writeErr(res, 400, '请填写专项任务名称');
    const plan = createCustomPlan(req.user, { ...body, assigneeId, assignee: assignee.name });
    res.json({ success: true, data: { plan } });
  } catch (e) {
    writeErr(res, 400, e.message || '创建失败');
  }
});

router.patch('/kpi-plans/:id', requireAuth, requireKpiAccess, (req, res) => {
  const plan = findPlanById(req.params.id);
  if (!plan || !canEditKpiPlan(req.user, plan)) {
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
