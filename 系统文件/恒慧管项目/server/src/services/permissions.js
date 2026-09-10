/**
 * 角色能力矩阵：可配置；归属类规则（本人负责项目/任务等）仍由业务代码硬编码。
 * 角色桶：full(gm+admin) / manager / staff
 */
const { getRolePermissions: getStored, setRolePermissions: setStored } = require('../db/database');
const { isFullAccess } = require('../utils/roles');

const ROLE_BUCKETS = ['full', 'manager', 'staff'];

const CAP_DEFS = [
  { key: 'nav.team', label: '团队管理', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.staff', label: '人员档案', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.permissions', label: '权限管理', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.dataSecurity', label: '数据安全', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.archive', label: '归档管理', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.import', label: '数据导入', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.systemUpdates', label: '更新记录', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.ncc', label: 'NCC异常看板', group: '侧栏能力', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.sqlTools', label: 'SQL脚本生成', group: '侧栏能力', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  {
    key: 'projects.view',
    label: '项目可见范围',
    group: '项目',
    values: ['all', 'related'],
    valueLabels: { all: '全公司', related: '仅相关' },
  },
  {
    key: 'projects.manage',
    label: '项目管理',
    group: '项目',
    values: ['all', 'own', 'none'],
    valueLabels: { all: '全部可管', own: '本人负责', none: '不可管' },
  },
  { key: 'projects.create', label: '新建项目', group: '项目', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
  { key: 'projects.delete', label: '删除项目', group: '项目', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
  { key: 'tasks.deptScope', label: '任务中心·部门页签', group: '任务', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  {
    key: 'staff.edit',
    label: '人员档案编辑',
    group: '组织',
    values: ['all', 'dept_staff', 'none'],
    valueLabels: { all: '全员', dept_staff: '本部门执行人员', none: '不可编辑' },
  },
  { key: 'staff.dingSync', label: '钉钉通讯录同步', group: '组织', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
  { key: 'kpi.viewAll', label: 'KPI 查看全部部门', group: 'KPI', values: ['on', 'off'], valueLabels: { on: '允许', off: '仅本人' } },
  { key: 'display.company', label: '滚动大屏（全公司）', group: '展示', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
];

const CAP_BY_KEY = Object.fromEntries(CAP_DEFS.map(d => [d.key, d]));

function defaultMatrix() {
  return {
    full: {
      'nav.team': 'on',
      'nav.staff': 'on',
      'nav.permissions': 'on',
      'nav.archive': 'on',
      'nav.import': 'on',
      'nav.systemUpdates': 'on',
      'nav.ncc': 'on',
      'nav.dataSecurity': 'on',
      'nav.sqlTools': 'on',
      'projects.view': 'all',
      'projects.manage': 'all',
      'projects.create': 'on',
      'projects.delete': 'on',
      'tasks.deptScope': 'on',
      'staff.edit': 'all',
      'staff.dingSync': 'on',
      'kpi.viewAll': 'on',
      'display.company': 'on',
    },
    manager: {
      'nav.team': 'on',
      'nav.staff': 'on',
      'nav.permissions': 'on',
      'nav.archive': 'on',
      'nav.import': 'on',
      'nav.systemUpdates': 'on',
      'nav.ncc': 'off',
      'nav.dataSecurity': 'off',
      'nav.sqlTools': 'off',
      'projects.view': 'all',
      'projects.manage': 'own',
      'projects.create': 'on',
      'projects.delete': 'off',
      'tasks.deptScope': 'on',
      'staff.edit': 'dept_staff',
      'staff.dingSync': 'off',
      'kpi.viewAll': 'on',
      'display.company': 'off',
    },
    staff: {
      'nav.team': 'off',
      'nav.staff': 'off',
      'nav.permissions': 'off',
      'nav.archive': 'off',
      'nav.import': 'off',
      'nav.systemUpdates': 'on',
      'nav.ncc': 'off',
      'nav.dataSecurity': 'off',
      'nav.sqlTools': 'off',
      'projects.view': 'related',
      'projects.manage': 'own',
      'projects.create': 'on',
      'projects.delete': 'off',
      'tasks.deptScope': 'off',
      'staff.edit': 'none',
      'staff.dingSync': 'off',
      'kpi.viewAll': 'off',
      'display.company': 'off',
    },
  };
}

function roleBucket(role) {
  if (isFullAccess(role) || role === 'full') return 'full';
  if (role === 'manager') return 'manager';
  return 'staff';
}

function normalizeMatrix(raw) {
  const defaults = defaultMatrix();
  const out = { full: {}, manager: {}, staff: {} };
  for (const bucket of ROLE_BUCKETS) {
    const src = (raw && typeof raw === 'object' && raw[bucket] && typeof raw[bucket] === 'object')
      ? raw[bucket]
      : {};
    for (const def of CAP_DEFS) {
      const v = src[def.key] != null ? String(src[def.key]) : defaults[bucket][def.key];
      out[bucket][def.key] = def.values.includes(v) ? v : defaults[bucket][def.key];
    }
  }
  return out;
}

function getRolePermissions() {
  return normalizeMatrix(getStored());
}

function saveRolePermissions(raw) {
  const normalized = normalizeMatrix(raw);
  setStored(normalized);
  return normalized;
}

function resetRolePermissions() {
  return saveRolePermissions(defaultMatrix());
}

function resolveCap(roleOrUser, key) {
  const role = typeof roleOrUser === 'object' ? roleOrUser?.role : roleOrUser;
  const def = CAP_BY_KEY[key];
  if (!def) return null;
  const matrix = getRolePermissions();
  const bucket = roleBucket(role);
  return matrix[bucket]?.[key] ?? defaultMatrix()[bucket][key];
}

function capEquals(roleOrUser, key, expected) {
  return resolveCap(roleOrUser, key) === expected;
}

function capOn(roleOrUser, key) {
  return resolveCap(roleOrUser, key) === 'on';
}

function canAccessPermissionsPage(user) {
  return !!user?.id && capOn(user, 'nav.permissions');
}

function canEditPermissions(user) {
  return !!user?.id && isFullAccess(user.role);
}

function getCatalog() {
  return CAP_DEFS.map(d => ({ ...d, valueLabels: { ...d.valueLabels } }));
}

module.exports = {
  ROLE_BUCKETS,
  CAP_DEFS,
  defaultMatrix,
  normalizeMatrix,
  getRolePermissions,
  saveRolePermissions,
  resetRolePermissions,
  roleBucket,
  resolveCap,
  capEquals,
  capOn,
  canAccessPermissionsPage,
  canEditPermissions,
  getCatalog,
};
