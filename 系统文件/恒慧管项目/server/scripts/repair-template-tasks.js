require('dotenv').config();
const {
  getAllProjects,
  getAllTasks,
  replaceAllData,
  getAllUsers,
  getAllChangeLogs,
  getAllTransferLogs,
  getAllPushLogs,
  getStaffDeptCatalog,
  getWorkCalendar,
} = require('../src/db/database');

let seq = 0;
function genId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${seq.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

const phases = [
  { key: '00', name: '00-立项与选型阶段' },
  { key: '01', name: '01-启动过程组' },
  { key: '02', name: '02-规划过程组' },
  { key: '03', name: '03-执行过程组' },
  { key: '04', name: '04-监控过程组' },
  { key: '05', name: '05-收尾过程组' },
];
const gates = {
  '00': ['M1 厂商选型定标', 'M2 采购合同+SLA签订'],
  '01': ['M3 项目启动会召开'],
  '02': ['M4 需求确认签字', 'M5 实施计划审批'],
  '05': ['M6 验收签字', 'M7 运维交接+复盘'],
};

const projects = getAllProjects();
const users = getAllUsers();
const rawTasks = getAllTasks();
let tasks = rawTasks.filter((t) => !(t.parentId && t.parentId === t.id));

let repaired = 0;
for (const project of projects) {
  const existing = tasks.filter((t) => t.projectId === project.id);
  const hasBroken = rawTasks.some((t) => t.projectId === project.id && t.parentId === t.id);
  const tooFew = existing.length < 6;
  if (!hasBroken && !tooFew) continue;

  tasks = tasks.filter((t) => t.projectId !== project.id);
  const createdAt = project.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' ');
  for (const ph of phases) {
    const mid = genId('T');
    tasks.push({
      id: mid,
      projectId: project.id,
      parentId: null,
      isMilestone: true,
      title: ph.name,
      type: 'normal',
      creator: project.creator || project.manager,
      assignee: project.manager,
      collaboratorEntries: [],
      collaborators: [],
      status: 'todo',
      priority: 'normal',
      progress: 0,
      estimatedHours: 0,
      actualHours: 0,
      planStartDate: project.startDate || null,
      actualStartDate: null,
      actualEndDate: null,
      attachments: [],
      desc: '',
      createdAt,
      dependencyMeta: { effectivePlanStart: project.startDate || '' },
    });
    for (const g of gates[ph.key] || []) {
      tasks.push({
        id: genId('T'),
        projectId: project.id,
        parentId: mid,
        isMilestone: false,
        title: `【里程碑】${g}`,
        type: 'normal',
        creator: project.creator || project.manager,
        assignee: project.manager,
        collaboratorEntries: [],
        collaborators: [],
        status: 'todo',
        priority: 'important',
        progress: 0,
        estimatedHours: 0,
        actualHours: 0,
        planStartDate: null,
        actualStartDate: null,
        actualEndDate: null,
        attachments: [],
        desc: '',
        createdAt,
        dependencyMeta: { effectivePlanStart: '' },
      });
    }
  }
  repaired += 1;
}

replaceAllData({
  users,
  projects,
  tasks,
  changeLogs: getAllChangeLogs(),
  transferLogs: getAllTransferLogs(),
  pushLogs: getAllPushLogs(500),
  staffDeptCatalog: getStaffDeptCatalog(),
  workCalendar: getWorkCalendar(),
});

const ids = tasks.map((t) => t.id);
console.log(JSON.stringify({
  repairedProjects: repaired,
  tasks: tasks.length,
  uniqueIds: new Set(ids).size,
  selfParent: tasks.filter((t) => t.parentId === t.id).length,
}, null, 2));
