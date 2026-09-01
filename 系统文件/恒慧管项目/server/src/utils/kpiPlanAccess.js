const { isFullAccess } = require('./roles');
const { isBusinessMember, isContactProfile } = require('./staffProfile');

const KPI_DEPT = '实施交付部';

/** 非实施交付部但需使用 KPI 计划的人员（按中文名匹配） */
const KPI_EXTRA_MEMBER_NAMES = ['陈璇'];

function personNameCore(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const cn = s.match(/^([\u4e00-\u9fff]+)/);
  if (cn) return cn[1];
  return s.split(/\s+/)[0];
}

function isKpiExtraMember(user) {
  if (!user) return false;
  const core = personNameCore(user.name);
  return KPI_EXTRA_MEMBER_NAMES.some(n => core === n || String(user.name || '').includes(n));
}

function isKpiDept(user) {
  return !!(user && (user.dept === KPI_DEPT || isKpiExtraMember(user)));
}

function canAccessKpiPlans(user) {
  if (!user?.id || !isBusinessMember(user)) return false;
  return isFullAccess(user.role) || isKpiDept(user);
}

function canViewAllDeptKpiPlans(user) {
  if (!canAccessKpiPlans(user)) return false;
  if (isFullAccess(user.role)) return true;
  // 仅实施交付部经理可看全部门；额外开放人员默认只看自己的
  return user.role === 'manager' && user.dept === KPI_DEPT;
}

function canViewKpiPlan(user, plan) {
  if (!canAccessKpiPlans(user) || !plan) return false;
  if (canViewAllDeptKpiPlans(user)) return plan.dept === KPI_DEPT;
  return plan.assigneeId === user.id
    || plan.assignee === user.name
    || personNameCore(plan.assignee) === personNameCore(user.name);
}

function canEditKpiPlan(user, plan) {
  if (!canViewKpiPlan(user, plan)) return false;
  if (canViewAllDeptKpiPlans(user)) return true;
  return plan.assigneeId === user.id
    || plan.assignee === user.name
    || personNameCore(plan.assignee) === personNameCore(user.name);
}

function listKpiDeptMembers(users) {
  return (users || []).filter(u =>
    isBusinessMember(u) && !isContactProfile(u) && (u.dept === KPI_DEPT || isKpiExtraMember(u))
  );
}

module.exports = {
  KPI_DEPT,
  KPI_EXTRA_MEMBER_NAMES,
  isKpiDept,
  isKpiExtraMember,
  canAccessKpiPlans,
  canViewAllDeptKpiPlans,
  canViewKpiPlan,
  canEditKpiPlan,
  listKpiDeptMembers,
};
