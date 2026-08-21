/**
 * Patch share-demo app with real project/task/team interactions.
 * Run from server/scripts: node _patch-share-interactions.js
 */
const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, '_share-demo-app.js');
let s = fs.readFileSync(appPath, 'utf8');

function replaceOnce(from, to, label) {
  const i = s.indexOf(from);
  if (i < 0) throw new Error('Missing block: ' + label);
  if (s.indexOf(from, i + 1) >= 0) throw new Error('Duplicate block: ' + label);
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// startDate on projects (unique endDate values)
[
  ["endDate: addDays(14),\n        members: ['演示信息中心经理', '演示实施工程师', '演示运维工程师'],",
    "startDate: addDays(-20),\n        endDate: addDays(14),\n        members: ['演示信息中心经理', '演示实施工程师', '演示运维工程师'],"],
  ["endDate: addDays(5),\n        members: ['王元斌 Martin', '演示实施工程师', '演示研发工程师'],",
    "startDate: addDays(-10),\n        endDate: addDays(5),\n        members: ['王元斌 Martin', '演示实施工程师', '演示研发工程师'],"],
  ["endDate: addDays(30),\n        members: ['演示实施工程师', '演示研发工程师'],",
    "startDate: addDays(-5),\n        endDate: addDays(30),\n        members: ['演示实施工程师', '演示研发工程师'],"],
  ["endDate: addDays(45),\n        members: ['演示研发工程师'],",
    "startDate: todayStr(),\n        endDate: addDays(45),\n        members: ['演示研发工程师'],"],
  ["endDate: addDays(60),\n        members: ['演示运维工程师'],",
    "startDate: addDays(-40),\n        endDate: addDays(60),\n        members: ['演示运维工程师'],"],
  ["endDate: addDays(-20),\n        members: ['演示实施工程师', '演示运维工程师'],",
    "startDate: addDays(-90),\n        endDate: addDays(-20),\n        members: ['演示实施工程师', '演示运维工程师'],"],
].forEach(([a, b], i) => replaceOnce(a, b, 'startDate-' + i));

// Replace entire tasks array (between projects closing and SEED members with object entries)
const tasksMarker = '    tasks: [';
const seedMembersMarker = "    members: [\n      { name: '演示总经理'";
const t0 = s.indexOf(tasksMarker);
const m0 = s.indexOf(seedMembersMarker);
if (t0 < 0 || m0 < 0) throw new Error('tasks/seed-members markers not found');
const tasksBlock = `    tasks: [
      mkTask({ id: 'MS-SH1', title: '里程碑：演示脚本就绪', projectId: 'PRJ-SHARE1', assignee: ME.name, status: 'doing', priority: 'important', progress: 50, hours: 0, isMilestone: true, dueDate: addDays(3), desc: '分享演示脚本与表单链路验收。' }),
      mkTask({ id: 'T-SH01', title: '梳理演示脚本与脱敏数据', projectId: 'PRJ-SHARE1', parentId: 'MS-SH1', assignee: ME.name, status: 'doing', priority: 'important', progress: 60, hours: 8, dueDate: addDays(0), desc: '准备 5 分钟分享：钉钉登录 → 工作台 → 表单提报。' }),
      mkTask({ id: 'T-SH02', title: '验收钉钉 AI 表格进工作台', projectId: 'PRJ-SHARE1', parentId: 'MS-SH1', assignee: ME.name, status: 'todo', priority: 'urgent', hours: 4, dueDate: addDays(-1), desc: '表单提交后应出现在「我的待办」，带「表单提报」标签。' }),
      mkTask({ id: 'MS-SH2', title: '里程碑：试点上线验收', projectId: 'PRJ-SHARE1', assignee: '演示运维工程师', status: 'todo', priority: 'normal', progress: 100, hours: 0, isMilestone: true, dueDate: addDays(10), desc: '权限与上线验收。' }),
      mkTask({ id: 'T-SH05', title: '已完成样例：权限分级验收', projectId: 'PRJ-SHARE1', parentId: 'MS-SH2', assignee: '演示运维工程师', status: 'done', priority: 'normal', progress: 100, hours: 6, dueDate: addDays(-10) }),
      mkTask({ id: 'T-SH03', title: '团队饱和度本周样例', projectId: 'PRJ-SHARE2', assignee: '演示实施工程师', status: 'doing', priority: 'normal', progress: 30, hours: 16 }),
      mkTask({ id: 'T-SH04', title: '研发联调接口清单', projectId: 'PRJ-SHARE2', assignee: '演示研发工程师', status: 'todo', priority: 'important', hours: 12, dueDate: addDays(4) }),
      mkTask({ id: 'T-SH06', title: '会议室大屏滚动联调', projectId: 'PRJ-SHARE2', assignee: '演示运维工程师', status: 'doing', priority: 'normal', progress: 40, hours: 10 }),
      mkTask({ id: 'T-SH07', title: 'NCC 对账差异排查', projectId: 'PRJ-SHARE3', assignee: '演示实施工程师', status: 'todo', priority: 'urgent', hours: 8, dueDate: addDays(1) }),
      mkTask({ id: 'T-SH08', title: '单据模板权限开通', projectId: 'PRJ-SHARE3', assignee: '演示研发工程师', status: 'doing', priority: 'important', progress: 55, hours: 14 }),
      mkTask({ id: 'T-SH09', title: '暂停样例：历史工单迁移核对', projectId: 'PRJ-SHARE5', assignee: '演示运维工程师', status: 'paused', priority: 'normal', progress: 20, hours: 6, dueDate: addDays(20) }),
      mkTask({ id: 'T-INTAKE1', title: '【样例】NCC 单据打印异常', projectId: '', assignee: ME.name, status: 'todo', priority: 'important', type: 'temp', intake: true, submitter: '演示财务联系人', system: 'NCC', dueDate: addDays(0), desc: '财务反馈打印预览空白。' }),
      mkTask({ id: 'T-INTAKE2', title: '【样例】费用报销单无法提交', projectId: '', assignee: ME.name, status: 'todo', priority: 'urgent', type: 'temp', intake: true, submitter: '演示会计', system: 'NCC', dueDate: addDays(-1), desc: '提交时报「预算科目缺失」。' }),
      mkTask({ id: 'T-INTAKE3', title: '【样例】总账结账提示异常', projectId: '', assignee: '演示实施工程师', status: 'doing', priority: 'normal', progress: 20, hours: 4, type: 'temp', intake: true, submitter: '演示财务经理', system: '总账' }),
    ],
`;
s = s.slice(0, t0) + tasksBlock + s.slice(m0);

replaceOnce(
  `    members: [
      { name: '演示总经理', dept: '信息中心', role: 'gm', hours: 6, std: 40 },
      { name: '演示信息中心经理', dept: '信息中心', role: 'manager', hours: 28, std: 40 },
      { name: '王元斌 Martin', dept: '信息中心', role: 'admin', hours: 32, std: 40 },
      { name: '演示实施工程师', dept: '信息中心', role: 'staff', hours: 36, std: 40 },
      { name: '演示运维工程师', dept: '信息中心', role: 'staff', hours: 18, std: 40 },
      { name: '演示研发工程师', dept: '信息中心', role: 'staff', hours: 24, std: 40 },
    ],`,
  `    members: [
      { id: 'U001', name: '演示总经理', dept: '信息中心', role: 'gm', hours: 6, std: 40 },
      { id: 'U002', name: '演示信息中心经理', dept: '信息中心', role: 'manager', hours: 28, std: 40 },
      { id: 'U018', name: '王元斌 Martin', dept: '信息中心', role: 'admin', hours: 32, std: 40 },
      { id: 'U101', name: '演示实施工程师', dept: '信息中心', role: 'staff', hours: 36, std: 40 },
      { id: 'U102', name: '演示运维工程师', dept: '信息中心', role: 'staff', hours: 18, std: 40 },
      { id: 'U103', name: '演示研发工程师', dept: '信息中心', role: 'staff', hours: 24, std: 40 },
    ],`,
  'members-ids'
);

replaceOnce(
  `    settingsOpen: false,
    modal: null,
    detailTaskId: null,`,
  `    settingsOpen: false,
    modal: null,
    form: null,
    detailTaskId: null,
    detailProjectId: null,
    prevPage: null,
    projectPlanFilter: 'all',
    returnToMemberName: null,`,
  'state-fields'
);

replaceOnce(
  `  function mkTask(o) {
    return Object.assign({
      progress: 0,
      hours: 0,
      type: 'normal',
      intake: false,
      submitter: '',
      system: '',
      desc: '',
      dueDate: addDays(3),
      collaborators: [],
    }, o);
  }`,
  `  function mkTask(o) {
    return Object.assign({
      progress: 0,
      hours: 0,
      type: 'normal',
      intake: false,
      submitter: '',
      system: '',
      desc: '',
      dueDate: addDays(3),
      collaborators: [],
      parentId: '',
      isMilestone: false,
    }, o);
  }`,
  'mkTask'
);

replaceOnce(
  `  function goTo(page) {
    state.page = page;
    state.settingsOpen = false;
    state.detailTaskId = null;
    render();
  }`,
  `  function goTo(page) {
    state.page = page;
    state.settingsOpen = false;
    state.detailTaskId = null;
    if (page !== 'projectDetail') state.detailProjectId = null;
    render();
  }

  function goBack() {
    const target = state.prevPage || 'projects';
    state.detailProjectId = null;
    state.prevPage = null;
    goTo(target);
  }`,
  'goTo'
);

replaceOnce(
  `      { key: 'projects', label: '项目', icon: 'fa-folder', active: state.page === 'projects', onclick: "goTo('projects')" },`,
  `      { key: 'projects', label: '项目', icon: 'fa-folder', active: state.page === 'projects' || state.page === 'projectDetail', onclick: "goTo('projects')" },`,
  'sidebar-projects'
);

replaceOnce(
  `    const titles = { dashboard: '工作台', projects: '项目列表', tasks: '任务中心', team: '团队管理' };
    const pageTitle = titles[state.page] || '工作台';`,
  `    const titles = { dashboard: '工作台', projects: '项目列表', projectDetail: '项目详情', tasks: '任务中心', team: '团队管理' };
    let pageTitle = titles[state.page] || '工作台';
    if (state.page === 'projectDetail' && state.detailProjectId) {
      const p = state.projects.find(x => x.id === state.detailProjectId);
      if (p) pageTitle = p.name || pageTitle;
    }`,
  'header-title'
);

replaceOnce(
  `  function myTodos() {
    return state.tasks.filter(t => t.assignee === ME.name && t.status !== 'done' && t.status !== 'abolished');
  }`,
  `  function isMilestoneTask(t) { return !!(t && t.isMilestone); }

  function myTodos() {
    return state.tasks.filter(t => !isMilestoneTask(t) && t.assignee === ME.name && t.status !== 'done' && t.status !== 'abolished');
  }`,
  'myTodos'
);

replaceOnce(
  `  function getProjectListStats(p) {
    const ts = state.tasks.filter(t => t.projectId === p.id);
    const done = ts.filter(t => t.status === 'done').length;
    const mainCount = Math.max(1, Math.ceil(ts.length / 2) || 1);
    const mainDone = Math.min(mainCount, Math.round(done / Math.max(ts.length, 1) * mainCount));
    const pct = ts.length ? Math.round(done / ts.length * 100) : 0;
    return { mainCount, mainDone, mainProgress: pct, taskCount: ts.length, taskDone: done };
  }`,
  `  function getProjectListStats(p) {
    const all = state.tasks.filter(t => t.projectId === p.id && t.status !== 'abolished');
    const milestones = all.filter(isMilestoneTask);
    const leaves = all.filter(t => !isMilestoneTask(t));
    const mainCount = milestones.length || (leaves.length ? 1 : 0);
    const mainDone = milestones.length
      ? milestones.filter(m => {
          const kids = leaves.filter(t => t.parentId === m.id);
          return kids.length > 0 && kids.every(t => t.status === 'done');
        }).length
      : leaves.filter(t => t.status === 'done').length;
    const done = leaves.filter(t => t.status === 'done').length;
    const overdue = leaves.filter(t => isOverdue(t)).length;
    const pct = leaves.length ? Math.round(done / leaves.length * 100) : 0;
    return { mainCount, mainDone, mainProgress: pct, taskCount: leaves.length, taskDone: done, overdue };
  }`,
  'project-stats'
);

replaceOnce(
  `  function getTaskPool() {
    let list = state.tasks.filter(t => t.status !== 'abolished' && t.status !== 'archived');`,
  `  function getTaskPool() {
    let list = state.tasks.filter(t => !isMilestoneTask(t) && t.status !== 'abolished' && t.status !== 'archived');`,
  'task-pool'
);

replaceOnce(
  `<button class="btn btn-primary btn-sm" onclick="toast('演示版：新建项目仅展示交互')"><i class="fas fa-plus"></i>新建项目</button>`,
  `<button class="btn btn-primary btn-sm" onclick="showProjectModal()"><i class="fas fa-plus"></i>新建项目</button>`,
  'new-project-btn'
);

replaceOnce(
  `<div class="project-card" onclick="toast('演示版：打开项目「\${esc(p.name)}」')">`,
  `<div class="project-card" onclick="viewProject('\${p.id}')">`,
  'project-card-click'
);

replaceOnce(
  `<button type="button" class="btn btn-primary btn-sm" onclick="toast('演示版：项目详情')"><i class="fas fa-eye"></i>详情</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="toast('演示版：编辑项目')"><i class="fas fa-edit"></i>编辑</button>`,
  `<button type="button" class="btn btn-primary btn-sm" onclick="viewProject('\${p.id}')"><i class="fas fa-eye"></i>详情</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="editProject('\${p.id}')"><i class="fas fa-edit"></i>编辑</button>`,
  'project-card-actions'
);

replaceOnce(
  `<div class="todo-board-card-actions">
            <button type="button" title="编辑" onclick="event.stopPropagation();viewTask('\${task.id}')"><i class="fas fa-pen"></i></button>
          </div>`,
  `<div class="todo-board-card-actions">
            <button type="button" title="编辑" onclick="event.stopPropagation();editTask('\${task.id}')"><i class="fas fa-pen"></i></button>
            <button type="button" class="is-danger" title="作废" onclick="event.stopPropagation();abolishTask('\${task.id}')"><i class="fas fa-trash-alt"></i></button>
          </div>`,
  'board-actions'
);

replaceOnce(
  `<td class="col-actions" onclick="event.stopPropagation()">
            <button type="button" class="btn btn-ghost btn-sm" onclick="viewTask('\${task.id}')"><i class="fas fa-eye"></i></button>
          </td>`,
  `<td class="col-actions" onclick="event.stopPropagation()">
            \${task.status === 'todo' ? \`<button type="button" class="btn btn-primary btn-sm" onclick="updateTaskStatus('\${task.id}','doing')"><i class="fas fa-play"></i></button>\` : ''}
            \${task.status === 'doing' ? \`<button type="button" class="btn btn-success btn-sm" onclick="updateTaskStatus('\${task.id}','done')"><i class="fas fa-check"></i></button>\` : ''}
            \${(task.status === 'doing' || task.status === 'todo') ? \`<button type="button" class="btn btn-ghost btn-sm" onclick="updateTaskStatus('\${task.id}','paused')"><i class="fas fa-pause"></i></button>\` : ''}
            \${task.status === 'paused' ? \`<button type="button" class="btn btn-primary btn-sm" onclick="updateTaskStatus('\${task.id}','doing')"><i class="fas fa-play"></i></button>\` : ''}
            <button type="button" class="btn btn-ghost btn-sm" onclick="viewTask('\${task.id}')"><i class="fas fa-eye"></i></button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="editTask('\${task.id}')"><i class="fas fa-pen"></i></button>
          </td>`,
  'list-actions'
);

replaceOnce(
  `<button type="button" class="team-filter-tab is-active" onclick="toast('演示版仅展示信息中心成员')"><i class="fas fa-building" style="margin-right:4px;font-size:11px;"></i>信息中心 <span class="tab-count">\${state.members.length}</span></button>`,
  `<button type="button" class="team-filter-tab is-active"><i class="fas fa-building" style="margin-right:4px;font-size:11px;"></i>信息中心 <span class="tab-count">\${state.members.length}</span></button>`,
  'team-tab'
);

replaceOnce(
  `<div class="team-member-card" onclick="toast('演示版：\${esc(m.name)} 的任务看板')" title="点击查看\${esc(m.name)}的任务看板">`,
  `<div class="team-member-card" onclick="showMemberKanban('\${esc(m.name)}')" title="点击查看\${esc(m.name)}的任务看板">`,
  'member-card'
);

const interactionsPath = path.join(__dirname, '_share-demo-interactions-tail.js');
if (!fs.existsSync(interactionsPath)) throw new Error('missing interactions tail file');
const INTERACTIONS = fs.readFileSync(interactionsPath, 'utf8');

const markerStart = '  function updateTaskStatus(id, status) {';
const markerEnd = '  resetData(true);\n  render();\n})();';
const i0 = s.indexOf(markerStart);
const i1 = s.indexOf(markerEnd);
if (i0 < 0 || i1 < 0) throw new Error('tail markers not found');
s = s.slice(0, i0) + INTERACTIONS.trimEnd() + '\n';

fs.writeFileSync(appPath, s, 'utf8');
console.log('patched ok, bytes', Buffer.byteLength(s));
