const {
  reloadStoreFromDisk,
  getAllProjects,
  getAllTasks,
  getAllUsers,
} = require('../db/database');

const PROJECT_STATUS_LABELS = {
  planning: '规划中',
  active: '进行中',
  done: '已完成',
  archived: '已归档',
};

const TASK_STATUS_LABELS = {
  todo: '待开始',
  doing: '进行中',
  done: '已完成',
  paused: '已暂停',
  rejected: '已驳回',
  archived: '已归档',
  abolished: '已作废',
};

function clampLimit(raw, fallback = 50, max = 200) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function includesKeyword(text, keyword) {
  if (!keyword) return true;
  return String(text || '').toLowerCase().includes(keyword);
}

function isArchivedProject(p) {
  return p?.archived === true || p?.status === 'archived';
}

function toProjectItem(p, tasks) {
  const projectTasks = (tasks || []).filter(t => t.projectId === p.id && t.status !== 'abolished');
  const active = projectTasks.filter(t => t.status !== 'archived');
  const done = active.filter(t => t.status === 'done').length;
  const progress = active.length ? Math.round((done / active.length) * 100) : 0;
  return {
    id: p.id,
    name: p.name || '',
    desc: p.desc || '',
    dept: p.dept || '',
    manager: p.manager || '',
    status: p.status || 'planning',
    statusLabel: PROJECT_STATUS_LABELS[p.status] || p.status || '未知',
    startDate: p.startDate || '',
    endDate: p.endDate || '',
    currentPhase: String(p.currentPhase || '').trim(),
    nextPlan: String(p.nextPlan || '').trim(),
    blocker: String(p.blocker || '').trim(),
    progress,
    taskCount: active.length,
    doneTaskCount: done,
  };
}

function toTaskItem(t, projectMap) {
  const project = t.projectId ? projectMap.get(t.projectId) : null;
  return {
    id: t.id,
    title: t.title || t.name || '',
    projectId: t.projectId || '',
    projectName: project?.name || (t.type === 'temp' ? '临时任务' : ''),
    assignee: t.assignee || '',
    status: t.status || 'todo',
    statusLabel: TASK_STATUS_LABELS[t.status] || t.status || '未知',
    priority: t.priority || 'normal',
    dueDate: t.dueDate || t.planEndDate || '',
    type: t.type || 'normal',
    parentId: t.parentId || '',
  };
}

function filterProjects(projects, tasks, opts) {
  const keyword = String(opts.keyword || '').trim().toLowerCase();
  const status = String(opts.status || '').trim();
  const includeArchived = opts.includeArchived === true || opts.includeArchived === '1' || opts.includeArchived === 'true';
  let list = projects.slice();
  if (!includeArchived) list = list.filter(p => !isArchivedProject(p));
  if (status) list = list.filter(p => p.status === status);
  if (keyword) {
    list = list.filter(p =>
      includesKeyword(p.name, keyword)
      || includesKeyword(p.manager, keyword)
      || includesKeyword(p.dept, keyword)
      || includesKeyword(p.id, keyword)
    );
  }
  return list.map(p => toProjectItem(p, tasks));
}

function filterTasks(tasks, projectMap, opts) {
  const keyword = String(opts.keyword || '').trim().toLowerCase();
  const status = String(opts.status || '').trim();
  const assignee = String(opts.assignee || '').trim().toLowerCase();
  const projectId = String(opts.projectId || '').trim();
  const includeDone = opts.includeDone === true || opts.includeDone === '1' || opts.includeDone === 'true';

  let list = tasks.filter(t => t.status !== 'abolished' && t.status !== 'archived');
  if (!includeDone) list = list.filter(t => t.status !== 'done');
  if (projectId) list = list.filter(t => t.projectId === projectId);
  if (status) list = list.filter(t => t.status === status);
  if (assignee) {
    list = list.filter(t => String(t.assignee || '').toLowerCase().includes(assignee));
  }
  if (keyword) {
    list = list.filter(t =>
      includesKeyword(t.title || t.name, keyword)
      || includesKeyword(t.assignee, keyword)
      || includesKeyword(t.id, keyword)
      || includesKeyword(projectMap.get(t.projectId)?.name, keyword)
    );
  }
  return list.map(t => toTaskItem(t, projectMap));
}

function buildSummary(projects, tasks) {
  const visibleProjects = projects.filter(p => !isArchivedProject(p));
  const activeTasks = tasks.filter(t => t.status !== 'abolished' && t.status !== 'archived');
  const doing = activeTasks.filter(t => t.status === 'doing').length;
  const todo = activeTasks.filter(t => t.status === 'todo').length;
  const done = activeTasks.filter(t => t.status === 'done').length;
  const paused = activeTasks.filter(t => t.status === 'paused').length;
  return {
    projectCount: visibleProjects.length,
    taskCount: activeTasks.length,
    taskByStatus: { todo, doing, done, paused },
    userCount: getAllUsers().filter(u => u.active !== false && u.profileKind !== 'contact').length,
  };
}

/**
 * WorkBuddy 只读查询：项目 / 任务 / 汇总
 * @param {{ type?: string, keyword?: string, status?: string, assignee?: string, projectId?: string, limit?: number|string, includeArchived?: boolean|string, includeDone?: boolean|string }} opts
 */
function queryWorkbuddy(opts = {}) {
  reloadStoreFromDisk();
  const projects = getAllProjects();
  const tasks = getAllTasks();
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const limit = clampLimit(opts.limit);
  const type = String(opts.type || 'all').trim().toLowerCase();

  const result = {
    type,
    queriedAt: new Date().toISOString(),
  };

  if (type === 'summary') {
    result.summary = buildSummary(projects, tasks);
    return result;
  }

  if (type === 'projects' || type === 'all') {
    const items = filterProjects(projects, tasks, opts);
    result.projects = {
      total: items.length,
      items: items.slice(0, limit),
    };
  }

  if (type === 'tasks' || type === 'all') {
    const items = filterTasks(tasks, projectMap, opts);
    result.tasks = {
      total: items.length,
      items: items.slice(0, limit),
    };
  }

  if (type === 'summary' || type === 'all') {
    result.summary = buildSummary(projects, tasks);
  }

  if (!result.projects && !result.tasks && !result.summary) {
    const err = new Error('type 仅支持 all / projects / tasks / summary');
    err.status = 400;
    throw err;
  }

  return result;
}

function getProjectDetail(id) {
  reloadStoreFromDisk();
  const project = getAllProjects().find(p => p.id === id);
  if (!project) {
    const err = new Error('项目不存在');
    err.status = 404;
    throw err;
  }
  const tasks = getAllTasks();
  const projectMap = new Map([[project.id, project]]);
  const projectTasks = filterTasks(
    tasks.filter(t => t.projectId === id),
    projectMap,
    { includeDone: true }
  );
  return {
    project: toProjectItem(project, tasks),
    tasks: { total: projectTasks.length, items: projectTasks.slice(0, 200) },
  };
}

function getTaskDetail(id) {
  reloadStoreFromDisk();
  const task = getAllTasks().find(t => t.id === id);
  if (!task) {
    const err = new Error('任务不存在');
    err.status = 404;
    throw err;
  }
  const projects = getAllProjects();
  const projectMap = new Map(projects.map(p => [p.id, p]));
  return { task: toTaskItem(task, projectMap) };
}

module.exports = {
  queryWorkbuddy,
  getProjectDetail,
  getTaskDetail,
};
