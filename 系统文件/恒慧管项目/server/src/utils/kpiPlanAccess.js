const { isFullAccess } = require('./roles');
const { isBusinessMember, isContactProfile } = require('./staffProfile');

const KPI_DEPT = '实施交付部';
const KPI_DEPT_PMO = '项目管控部';
const KPI_DEPTS = [KPI_DEPT, KPI_DEPT_PMO];

function isKpiDept(user) {
  return !!(user && KPI_DEPTS.includes(user.dept));
}

/** 实施交付部/项目管控部成员，或部门经理/管理员/总经理 */
function canAccessKpiPlans(user) {
  if (!user?.id || !isBusinessMember(user)) return false;
  return isFullAccess(user.role) || user.role === 'manager' || isKpiDept(user);
}

/** 部门经理/管理员/总经理可查看全部部门计划 */
function canViewAllDeptKpiPlans(user) {
  if (!canAccessKpiPlans(user)) return false;
  return isFullAccess(user.role) || user.role === 'manager';
}

function canViewKpiPlan(user, plan) {
  if (!canAccessKpiPlans(user) || !plan) return false;
  if (canViewAllDeptKpiPlans(user)) return true;
  return plan.assigneeId === user.id || plan.assignee === user.name;
}

function canEditKpiPlan(user, plan) {
  if (!canViewKpiPlan(user, plan)) return false;
  if (canViewAllDeptKpiPlans(user)) return true;
  return plan.assigneeId === user.id || plan.assignee === user.name;
}

/** 实施交付部、项目管控部在职成员会自动生成各自部门的固定计划（已停用不生成） */
function listKpiDeptMembers(users) {
  return (users || []).filter(u =>
    isBusinessMember(u) && !isContactProfile(u) && KPI_DEPTS.includes(u.dept)
  );
}

function listKpiDeptMembersByDept(users, dept) {
  return listKpiDeptMembers(users).filter(u => u.dept === dept);
}

module.exports = {
  KPI_DEPT,
  KPI_DEPT_PMO,
  KPI_DEPTS,
  isKpiDept,
  canAccessKpiPlans,
  canViewAllDeptKpiPlans,
  canViewKpiPlan,
  canEditKpiPlan,
  listKpiDeptMembers,
  listKpiDeptMembersByDept,
};
