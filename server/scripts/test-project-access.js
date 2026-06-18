/**
 * 验收脚本：信息中心全员查看全公司项目 — bootstrap 权限过滤
 * 运行：node server/scripts/test-project-access.js
 */
const path = require('path');
const { filterByRole } = require('../src/routes/data');
const {
  canViewAllProjects,
  isInfoCenterMember,
  filterProjectsForUser,
  filterTasksForUser,
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

function userById(id) {
  return raw.users.find(u => u.id === id) || raw.users.find(u => u.name === id);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const icStaff = raw.users.find(u => u.dept === '信息中心' && u.role === 'staff')
  || { id: 'T-IC-STAFF', name: '信息中心测试员', role: 'staff', dept: '信息中心' };
const otherStaff = raw.users.find(u => u.dept === '实施交付部' && u.role === 'staff')
  || raw.users.find(u => u.dept !== '信息中心' && u.role === 'staff');
const gm = raw.users.find(u => u.role === 'gm');

assert(isInfoCenterMember(icStaff), '信息中心 staff 应识别为成员');
assert(canViewAllProjects(icStaff), '登录用户应 canViewAllProjects');
assert(canViewAllProjects(otherStaff), '任意登录用户应 canViewAllProjects');

const icFiltered = filterByRole(icStaff, raw);
const otherFiltered = filterByRole(otherStaff, raw);
const gmFiltered = filterByRole(gm, raw);

assert(
  icFiltered.projects.length === raw.projects.length,
  `信息中心 staff projects 应为全量：${icFiltered.projects.length} vs ${raw.projects.length}`
);
assert(
  otherFiltered.projects.length === raw.projects.length,
  `其他部门 staff projects 应为全量：${otherFiltered.projects.length} vs ${raw.projects.length}`
);
assert(
  icFiltered.tasks.filter(t => t.projectId).length === raw.tasks.filter(t => t.projectId).length,
  '项目任务应为全量下发'
);
assert(
  gmFiltered.projects.length === raw.projects.length,
  '总经理 projects 应为全量'
);

console.log('✓ projectAccess 验收通过');
console.log(`  信息中心 staff (${icStaff.name}): ${icFiltered.projects.length} 项目, ${icFiltered.tasks.length} 任务`);
console.log(`  其他部门 staff (${otherStaff.name}): ${otherFiltered.projects.length} 项目, ${otherFiltered.tasks.length} 任务`);
console.log(`  总经理: ${gmFiltered.projects.length} 项目`);
