const { isTaskBlocked } = require('../utils/taskDependencies');

const STATUS_LABELS = {
  todo: '待开始',
  doing: '进行中',
  done: '已完成',
  paused: '已暂停',
  rejected: '已驳回',
  archived: '已归档',
  abolished: '已作废',
};

const PROJECT_STATUS_LABELS = {
  planning: '规划中',
  active: '进行中',
  done: '已完成',
  archived: '已归档',
};

const PRIORITY_LABELS = {
  urgent: '紧急',
  important: '重要',
  normal: '普通',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateStr(v) {
  if (!v) return '';
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function isActiveTaskStatus(task) {
  return task && task.status !== 'done' && task.status !== 'archived' && task.status !== 'abolished';
}

function resolveTaskDueDate(task) {
  return normalizeDateStr(task?.dueDate || task?.planEndDate || '');
}

function isOverdue(task) {
  if (!task || !isActiveTaskStatus(task)) return false;
  const due = resolveTaskDueDate(task);
  if (!due) return false;
  return due < todayStr();
}

function getLeafTasks(tasks) {
  const parentIds = new Set(
    (tasks || [])
      .map(t => t.parentId)
      .filter(Boolean)
  );
  return (tasks || []).filter(t => !parentIds.has(t.id));
}

function calcProjectProgress(projectTasks) {
  const active = projectTasks.filter(t => t.status !== 'abolished' && t.status !== 'archived');
  if (!active.length) return 0;
  const done = active.filter(t => t.status === 'done').length;
  return Math.round((done / active.length) * 100);
}

function buildDisplayWallPayload(projects, tasks, taskDependencies) {
  const deps = taskDependencies || [];
  const visibleProjects = (projects || []).filter(p => p.status !== 'archived' && p.archived !== true);
  const projectMap = new Map(visibleProjects.map(p => [p.id, p]));

  const visibleTasks = (tasks || []).filter(t => {
    if (t.status === 'abolished' || t.status === 'archived') return false;
    if (!t.projectId) return true;
    return projectMap.has(t.projectId);
  });

  const leafTasks = getLeafTasks(visibleTasks);
  const tasksById = new Map(visibleTasks.map(t => [t.id, t]));

  const enrichedProjects = visibleProjects.map(p => {
    const projectTasks = visibleTasks.filter(t => t.projectId === p.id);
    const projectLeafTasks = leafTasks.filter(t => t.projectId === p.id);
    const doneLeaf = projectLeafTasks.filter(t => t.status === 'done').length;
    const doingLeaf = projectLeafTasks.filter(t => t.status === 'doing').length;
    const overdueLeaf = projectLeafTasks.filter(t => isOverdue(t)).length;
    const blockedLeaf = projectLeafTasks.filter(t => isTaskBlocked(t, deps, tasksById)).length;
    const leafProgress = projectLeafTasks.length
      ? Math.round((doneLeaf / projectLeafTasks.length) * 100)
      : 0;

    return {
      id: p.id,
      name: p.name,
      dept: p.dept || '',
      manager: p.manager || '',
      status: p.status || 'planning',
      statusLabel: PROJECT_STATUS_LABELS[p.status] || p.status || '未知',
      startDate: p.startDate || '',
      endDate: p.endDate || '',
      progress: calcProjectProgress(projectTasks),
      leafProgress,
      taskCount: projectTasks.length,
      leafCount: projectLeafTasks.length,
      doneCount: projectLeafTasks.filter(t => t.status === 'done').length,
      doingCount: doingLeaf,
      overdueCount: overdueLeaf,
      blockedCount: blockedLeaf,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  const enrichedLeafTasks = leafTasks.map(t => {
    const project = t.projectId ? projectMap.get(t.projectId) : null;
    const blocked = isTaskBlocked(t, deps, tasksById);
    let displayStatus = t.status;
    if (blocked && isActiveTaskStatus(t)) displayStatus = 'blocked';
    else if (isOverdue(t)) displayStatus = 'overdue';

    return {
      id: t.id,
      title: t.title || '',
      projectId: t.projectId || '',
      projectName: project?.name || (t.type === 'temp' ? '临时任务' : '无项目'),
      assignee: t.assignee || '',
      status: t.status,
      displayStatus,
      statusLabel: displayStatus === 'blocked'
        ? '阻塞中'
        : (displayStatus === 'overdue' ? '已延期' : (STATUS_LABELS[t.status] || t.status)),
      priority: t.priority || 'normal',
      priorityLabel: PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.normal,
      planStartDate: normalizeDateStr(t.planStartDate),
      dueDate: resolveTaskDueDate(t),
      estimatedHours: Number(t.estimatedHours) || 0,
      progress: Number(t.progress) || 0,
      isBlocked: blocked,
      type: t.type || 'normal',
    };
  }).sort((a, b) => {
    const pa = a.projectName.localeCompare(b.projectName, 'zh-CN');
    if (pa !== 0) return pa;
    return a.title.localeCompare(b.title, 'zh-CN');
  });

  const stats = {
    projectCount: enrichedProjects.length,
    leafTaskCount: enrichedLeafTasks.length,
    doing: enrichedLeafTasks.filter(t => t.status === 'doing').length,
    todo: enrichedLeafTasks.filter(t => t.status === 'todo').length,
    done: enrichedLeafTasks.filter(t => t.status === 'done').length,
    overdue: enrichedLeafTasks.filter(t => t.displayStatus === 'overdue').length,
    blocked: enrichedLeafTasks.filter(t => t.isBlocked).length,
  };

  return {
    serverTime: new Date().toISOString(),
    stats,
    projects: enrichedProjects,
    leafTasks: enrichedLeafTasks,
  };
}

module.exports = { buildDisplayWallPayload, getLeafTasks };
