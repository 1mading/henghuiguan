/**
 * 验收脚本：项目可见性 — bootstrap 权限过滤
 * 运行：node server/scripts/test-project-access.js
 */
const path = require('path');
const { filterByRole } = require('../src/routes/data');
const {
  canViewAllProjects,
  isInfoCenterMember,
  filterProjectsForUser,
} = require('../src/utils/projectAccess');

const dataPath = path.join(__dirname, '../data/henghuiguan.json');
let store;
try {
  store = require(dataPath);
} catch {
  console.warn('未找到数据文件，使用最小样例');
  store = {
    users: [
      { id: 'U001', name: '魏海波', role: 'gm', dept: '信息中心' },
      { id: 'U005', name: '王元斌', role: 'staff', dept: '信息中心' },
      { id: 'U010', name: '测试员', role: 'staff', dept: '实施交付部' },
      { id: 'U011', name: '交付经理', role: 'manager', dept: '实施交付部' },
    ],
    projects: [
      { id: 'P1', name: '信息中心项目', dept: '信息中心', manager: '李浩', archived: false },
      { id: 'P2', name: '交付部项目', dept: '实施交付部', manager: '交付经理', archived: false },
      { id: 'P3', name: '其他参与', dept: '研发集成部', manager: '他人', archived: false },
    ],
    tasks: [
      { id: 'T1', projectId: 'P1', assignee: '王元斌', type: 'normal' },
      { id: 'T2', projectId: 'P2', assignee: '他人', type: 'normal' },
      { id: 'T3', projectId: 'P3', assignee: '测试员', type: 'normal' },
    ],
    changeLogs: [],
    transferLogs: [],
    pushLogs: [],
  };
}

const raw = {
  users: store.users || [],
  projects: store.projects || [],
  tasks: store.tasks || [],
  changeLogs: store.changeLogs || [],
  transferLogs: store.transferLogs || [],
  pushLogs: store.pushLogs || [],
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const icStaff = raw.users.find(u => u.dept === '信息中心' && u.role === 'staff')
  || { id: 'T-IC-STAFF', name: '信息中心测试员', role: 'staff', dept: '信息中心' };
const relatedStaff = raw.users.find(u => u.name === '王元斌')
  || { id: 'U005', name: '王元斌', role: 'staff', dept: '信息中心' };
const otherStaff = raw.users.find(u => u.dept === '实施交付部' && u.role === 'staff')
  || raw.users.find(u => u.dept !== '信息中心' && u.role === 'staff');
const deptManager = raw.users.find(u => u.role === 'manager')
  || { id: 'U011', name: '交付经理', role: 'manager', dept: '实施交付部' };
const gm = raw.users.find(u => u.role === 'gm');

assert(isInfoCenterMember(icStaff), '信息中心 staff 应识别为成员');
assert(!canViewAllProjects(icStaff), '执行人员不应 canViewAllProjects');
assert(canViewAllProjects(deptManager), '部门经理应 canViewAllProjects');
assert(canViewAllProjects(gm), '总经理应 canViewAllProjects');

const icFiltered = filterByRole(icStaff, raw);
const relatedFiltered = filterByRole(relatedStaff, raw);
const otherFiltered = filterByRole(otherStaff, raw);
const managerFiltered = filterByRole(deptManager, raw);
const gmFiltered = filterByRole(gm, raw);

const icRelatedCount = filterProjectsForUser(icStaff, raw.projects, raw.tasks).length;
const relatedStaffCount = filterProjectsForUser(relatedStaff, raw.projects, raw.tasks).length;

assert(
  icFiltered.projects.length === icRelatedCount,
  `信息中心 staff 仅可见相关项目：${icFiltered.projects.length} vs ${icRelatedCount}`
);
assert(
  relatedFiltered.projects.length === relatedStaffCount && relatedStaffCount >= 1,
  `相关 staff 应至少可见 1 个参与项目：${relatedFiltered.projects.length}`
);
assert(
  otherFiltered.projects.length === filterProjectsForUser(otherStaff, raw.projects, raw.tasks).length,
  '其他部门 staff 仅可见相关项目'
);
assert(
  managerFiltered.projects.length === raw.projects.length,
  `部门经理 projects 应为全量：${managerFiltered.projects.length} vs ${raw.projects.length}`
);
assert(
  gmFiltered.projects.length === raw.projects.length,
  '总经理 projects 应为全量'
);

console.log('✓ projectAccess 验收通过');
console.log(`  信息中心 staff (${icStaff.name}): ${icFiltered.projects.length} 项目`);
console.log(`  相关 staff (${relatedStaff.name}): ${relatedFiltered.projects.length} 项目`);
console.log(`  其他部门 staff (${otherStaff.name}): ${otherFiltered.projects.length} 项目`);
console.log(`  部门经理 (${deptManager.name}): ${managerFiltered.projects.length} 项目`);
console.log(`  总经理: ${gmFiltered.projects.length} 项目`);
