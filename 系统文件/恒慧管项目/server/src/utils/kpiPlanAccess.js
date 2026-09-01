const { isFullAccess } = require('./roles');
const { isBusinessMember, isContactProfile } = require('./staffProfile');

const KPI_DEPT = '实施交付部';

function isKpiDept(user) {
  return !!(user && user.dept === KPI_DEPT);
}

function canAccessKpiPlans(user) {
  if (!user?.id || !isBusinessMember(user)) return false;
  return isFullAccess(user.role) || isKpiDept(user);
}

function canViewAllDeptKpiPlans(user) {
  if (!canAccessKpiPlans(user)) return false;
  return isFullAccess(user.role) || user.role === 'manager';
}

function canViewKpiPlan(user, plan) {
  if (!canAccessKpiPlans(user) || !plan) return false;
  if (canViewAllDeptKpiPlans(user)) return plan.dept === KPI_DEPT;
  return plan.assigneeId === user.id || plan.assignee === user.name;
}

function canEditKpiPlan(user, plan) {
  if (!canViewKpiPlan(user, plan)) return false;
  if (canViewAllDeptKpiPlans(user)) return true;
  return plan.assigneeId === user.id || plan.assignee === user.name;
}

/** 仅实施交付部成员会自动生成固定计划 */
function listKpiDeptMembers(users) {
  return (users || []).filter(u =>
    isBusinessMember(u) && !isContactProfile(u) && u.dept === KPI_DEPT
  );
}

module.exports = {
  KPI_DEPT,
  isKpiDept,
  canAccessKpiPlans,
  canViewAllDeptKpiPlans,
  canViewKpiPlan,
  canEditKpiPlan,
  listKpiDeptMembers,
};
