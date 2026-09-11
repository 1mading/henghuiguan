// ========== 任务依赖（跨项目 FS） ==========
const DEP_STATUS_ACTIVE = 'active';
const DEP_TYPE_FS = 'finish_to_start';
const DEP_BLOCK_HARD = 'hard';
const DEP_BLOCK_SOFT = 'soft';

function getActiveTaskDependencies() {
  return (taskDependencies || []).filter(d => !d.status || d.status === DEP_STATUS_ACTIVE);
}

function getTaskPredecessorDeps(taskId) {
  return getActiveTaskDependencies().filter(d => d.successorTaskId === taskId);
}

function getTaskSuccessorDeps(taskId) {
  return getActiveTaskDependencies().filter(d => d.predecessorTaskId === taskId);
}

function getDependencyTask(taskId) {
  return tasks.find(t => t.id === taskId) || null;
}

function isPredecessorSatisfied(task) {
  return task && task.status === 'done';
}

function isPredecessorAbnormal(task) {
  return task && (task.status === 'abolished' || task.status === 'archived');
}

function isDependencyCrossProject(dep) {
  const pred = getDependencyTask(dep.predecessorTaskId);
  const succ = getDependencyTask(dep.successorTaskId);
  if (!pred || !succ) return false;
  return (pred.projectId || '') !== (succ.projectId || '');
}

function taskHasCrossProjectDependency(taskId) {
  return getTaskPredecessorDeps(taskId).concat(getTaskSuccessorDeps(taskId)).some(isDependencyCrossProject);
}

function isTaskBlocked(task) {
  if (!task || !isActiveTaskStatus(task)) return false;
  return getTaskPredecessorDeps(task.id).some(dep => {
    const pred = getDependencyTask(dep.predecessorTaskId);
    if (!pred || isPredecessorAbnormal(pred)) return true;
    return !isPredecessorSatisfied(pred);
  });
}

function hasHardBlock(task) {
  if (!isTaskBlocked(task)) return false;
  return getTaskPredecessorDeps(task.id).some(dep => {
    const pred = getDependencyTask(dep.predecessorTaskId);
    if (pred && isPredecessorSatisfied(pred)) return false;
    return (dep.blockMode || DEP_BLOCK_HARD) === DEP_BLOCK_HARD;
  });
}

function getBlockingSuccessorCount(taskId) {
  return getTaskSuccessorDeps(taskId).filter(dep => {
    const succ = getDependencyTask(dep.successorTaskId);
    return succ && isActiveTaskStatus(succ) && isTaskBlocked(succ);
  }).length;
}

function isRecentlyUnblocked(task) {
  if (!task || isTaskBlocked(task)) return false;
  const unblockedAt = task.dependencyMeta?.unblockedAt;
  if (!unblockedAt) return false;
  return diffCalendarDays(unblockedAt, todayStr()) <= 7;
}

function ensureDependencyMeta(task) {
  if (!task) return;
  if (!task.dependencyMeta || typeof task.dependencyMeta !== 'object') task.dependencyMeta = {};
}

function getEffectivePlanStart(task) {
  if (!task) return '';
  ensureDependencyMeta(task);
  return task.dependencyMeta.effectivePlanStart || task.planStartDate || '';
}

/** 计划开始变更后同步有效计划开始，避免详情页截止日与编辑页不一致 */
function reconcileEffectivePlanStart(task) {
  if (!task) return;
  ensureDependencyMeta(task);
  if (isTaskBlocked(task)) return;
  const plan = task.planStartDate || '';
  const meta = task.dependencyMeta;
  const today = todayStr();
  if (meta.unblockedAt || meta.blockedSince) {
    meta.effectivePlanStart = today > plan ? today : plan;
  } else {
    meta.effectivePlanStart = plan;
  }
}

function refreshTaskDependencySchedule(task) {
  if (!task) return;
  ensureDependencyMeta(task);
  const blocked = isTaskBlocked(task);
  const today = todayStr();
  if (blocked) {
    if (!task.dependencyMeta.blockedSince) task.dependencyMeta.blockedSince = today;
    task.dependencyMeta._wasBlocked = true;
    return;
  }
  if (task.dependencyMeta._wasBlocked) {
    task.dependencyMeta.unblockedAt = today;
    task.dependencyMeta._wasBlocked = false;
    const base = task.planStartDate || today;
    task.dependencyMeta.effectivePlanStart = today > base ? today : base;
    syncTaskScheduleFields(task);
  } else {
    reconcileEffectivePlanStart(task);
    syncTaskScheduleFields(task);
  }
}

function refreshAllDependencySchedules() {
  tasks.forEach(refreshTaskDependencySchedule);
}

function wouldCreateDependencyCycle(predecessorTaskId, successorTaskId) {
  if (!predecessorTaskId || !successorTaskId) return false;
  if (predecessorTaskId === successorTaskId) return true;
  const visited = new Set();
  const stack = [successorTaskId];
  while (stack.length) {
    const id = stack.pop();
    if (id === predecessorTaskId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    getTaskSuccessorDeps(id).forEach(dep => stack.push(dep.successorTaskId));
  }
  return false;
}

function getTaskProjectLabel(task) {
  if (!task) return '未知';
  if (!task.projectId) return '临时任务';
  return projects.find(p => p.id === task.projectId)?.name || '未知项目';
}

/** 任务中心展示名：项目名称 · 任务名称 */
function getTaskCenterDisplayParts(task) {
  const projectLabel = getTaskProjectLabel(task);
  const title = isAitableIntakeTask(task) ? getIntakeTaskTitle(task) : String(task?.title || '');
  return { projectLabel, title };
}

function formatTaskCenterDisplayTitle(task) {
  const { projectLabel, title } = getTaskCenterDisplayParts(task);
  if (!title) return projectLabel;
  if (!task?.projectId) return title;
  return `${projectLabel} · ${title}`;
}

/** 卡片顶部上下文：默认「项目 › 上级」；hideProject 时仅上级（待办按项目分区用） */
function renderTaskCardContext(task, opts = {}) {
  if (!task) return '';
  const hideProject = !!opts.hideProject;
  const ancestors = task.parentId ? getTaskBreadcrumb(task.parentId) : [];
  if (hideProject && ancestors.length === 0) return '';
  const parts = [];
  if (!hideProject) {
    parts.push(`<span class="task-card-context-project">${getTaskProjectLabel(task)}</span>`);
  }
  ancestors.forEach(t => {
    parts.push(`<span class="task-card-context-ancestor">${t.title}</span>`);
  });
  const icon = hideProject ? 'fa-level-up-alt' : 'fa-folder';
  const iconStyle = hideProject ? ' style="transform:rotate(90deg);"' : '';
  return `<div class="task-card-context"><i class="fas ${icon}" aria-hidden="true"${iconStyle}></i><span>${parts.join('<span class="task-card-context-sep"> › </span>')}</span></div>`;
}

function isAitableIntakeTask(task) {
  return !!(task?.intakeMeta && task.intakeMeta.source === 'aitable');
}

/** 剥掉钉钉自动化偶发包裹的 {{...}} */
function unwrapTemplateDisplay(raw) {
  let text = String(raw == null ? '' : raw).trim();
  for (let i = 0; i < 3; i++) {
    const m = text.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
    if (!m) break;
    text = String(m[1] || '').trim();
  }
  return text;
}

function getIntakeSystemName(task) {
  return unwrapTemplateDisplay(task?.intakeMeta?.system || '');
}

function getIntakeTaskTitle(task) {
  return unwrapTemplateDisplay(task?.title || '') || String(task?.title || '');
}

function needsIntakeEstimatedHours(task) {
  return isAitableIntakeTask(task) && !(Number(task.estimatedHours) > 0);
}

/**
 * 表单提报任务：开始/完成前必填预计工时；计划开始为空则默认当天。
 * @returns {boolean} 是否通过（取消或非法输入返回 false）
 */
function ensureIntakeEstimatedHours(task) {
  if (!isAitableIntakeTask(task)) return true;
  if (!(Number(task.estimatedHours) > 0)) {
    const raw = prompt('表单提报任务须先填写预计工时（小时）后才能开始/完成：', '');
    if (raw === null) return false;
    const hours = Number(String(raw).trim());
    if (!Number.isFinite(hours) || hours <= 0) {
      alert('请输入大于 0 的预计工时');
      return false;
    }
    task.estimatedHours = Math.round(hours * 10) / 10;
  }
  if (!task.planStartDate) task.planStartDate = todayStr();
  return true;
}

function renderIntakeSourceTag(task, compact) {
  if (!isAitableIntakeTask(task)) return '';
  const label = compact ? '表单' : '表单提报';
  return `<span class="tag" style="background:#ECFDF5;color:#059669;font-size:10px;"><i class="fas fa-file-alt" style="margin-right:3px;"></i>${label}</span>`;
}

/** 表单提报且尚未填写预计工时的弱提示 */
function renderIntakeHoursHint(task, compact) {
  if (!needsIntakeEstimatedHours(task)) return '';
  if (task.status === 'done' || task.status === 'abolished' || task.status === 'archived') return '';
  if (compact) {
    return `<span class="tag" style="background:#FFFBEB;color:#D97706;font-size:10px;" title="开始执行前请填写预计工时"><i class="fas fa-clock" style="margin-right:3px;"></i>须填工时</span>`;
  }
  return `<div style="margin-top:8px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:12px;color:#92400E;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>开始执行前请填写预计工时，填写后计入当周饱和度</div>`;
}

function renderDependencyBadges(task, compact) {
  if (!task) return '';
  const parts = [];
  if (getTaskPredecessorDeps(task.id).length) {
    parts.push('<span class="dep-badge dep-in" title="有前置依赖">🔗' + (compact ? '' : ' 前置') + '</span>');
  }
  if (isTaskBlocked(task)) {
    parts.push('<span class="dep-badge dep-blocked" title="阻塞中，不计入饱和度">⏸' + (compact ? '' : ' 阻塞中') + '</span>');
  } else if (isRecentlyUnblocked(task)) {
    parts.push('<span class="dep-badge dep-unblocked" title="前置已完成，可继续">▶' + (compact ? '' : ' 可继续') + '</span>');
  }
  const outCount = getBlockingSuccessorCount(task.id);
  if (outCount > 0) {
    parts.push('<span class="dep-badge dep-out" title="阻塞后续任务">🚧' + (compact ? outCount : (' 阻塞后续(' + outCount + ')')) + '</span>');
  }
  if (taskHasCrossProjectDependency(task.id)) {
    parts.push('<span class="dep-badge dep-cross" title="跨项目依赖">🌐</span>');
  }
  if (getTaskPredecessorDeps(task.id).some(dep => isPredecessorAbnormal(getDependencyTask(dep.predecessorTaskId)))) {
    parts.push('<span class="dep-badge dep-warn" title="前置任务异常">⚠</span>');
  }
  return parts.length ? `<span class="dep-badges">${parts.join('')}</span>` : '';
}

function renderDependencyStatusIcon(dep, role) {
  const otherId = role === 'pred' ? dep.predecessorTaskId : dep.successorTaskId;
  const other = getDependencyTask(otherId);
  if (role === 'pred') {
    if (!other || isPredecessorAbnormal(other)) return '<span style="color:#DC2626;">⚠ 异常</span>';
    if (isPredecessorSatisfied(other)) return '<span style="color:#059669;">✅ 已完成</span>';
    if (isTaskBlocked(getDependencyTask(dep.successorTaskId))) return '<span style="color:#D97706;">⏸ 阻塞中</span>';
    return '<span style="color:#2563EB;">🔄 进行中</span>';
  }
  const succ = getDependencyTask(dep.successorTaskId);
  if (!succ) return '<span style="color:#9CA3AF;">—</span>';
  if (isTaskBlocked(succ)) return '<span style="color:#D97706;">⏸ 等待本任务</span>';
  return '<span style="color:#059669;">✅ 已可继续</span>';
}

function canManageTaskDependency(task) {
  if (!task) return false;
  if (isFullAccess(currentUser.role)) return true;
  if (canEditTask(task)) return true;
  return isTaskProjectManager(task);
}

function getProjectDependencyRows(projectId) {
  const rows = [];
  getActiveTaskDependencies().forEach(dep => {
    const pred = getDependencyTask(dep.predecessorTaskId);
    const succ = getDependencyTask(dep.successorTaskId);
    if (!pred || !succ) return;
    if (pred.projectId !== projectId && succ.projectId !== projectId) return;
    rows.push({ dep, pred, succ, cross: isDependencyCrossProject(dep) });
  });
  return rows;
}

function getTaskPendingBlockedHours(task) {
  if (!task || task.status === 'paused' || isTaskProjectPaused(task)) return 0;
  if (!isTaskBlocked(task) || !isActiveTaskStatus(task)) return 0;
  return Number(task.estimatedHours) || 0;
}

function getMemberPendingBlockedHours(userName) {
  return tasks
    .filter(t => t.assignee === userName && isActiveTaskStatus(t) && isTaskBlocked(t))
    .reduce((sum, t) => sum + getTaskPendingBlockedHours(t), 0);
}

function getHardBlockAlertMessage(task) {
  const deps = getTaskPredecessorDeps(task.id).filter(dep => {
    const pred = getDependencyTask(dep.predecessorTaskId);
    return pred && !isPredecessorSatisfied(pred);
  });
  const lines = deps.map(dep => {
    const pred = getDependencyTask(dep.predecessorTaskId);
    return `· ${getTaskProjectLabel(pred)} / ${pred?.title || dep.predecessorTaskId}（${statusMap[pred?.status]?.label || pred?.status || '未知'}）`;
  });
  return `任务存在未完成的硬阻塞前置依赖，无法开始或完成：\n\n${lines.join('\n')}\n\n请等待前置任务完成，或联系负责人调整依赖关系。`;
}

function removeDependenciesForTask(taskId) {
  taskDependencies = taskDependencies.filter(d =>
    d.predecessorTaskId !== taskId && d.successorTaskId !== taskId
  );
}

/** 已延期：截止日期严格早于今天（阻塞中、已暂停不算延期） */
function isOverdue(task) {
  if (isTaskBlocked(task)) return false;
  const dueDate = normalizeDateStr(resolveTaskDueDate(task));
  if (!isActiveTaskStatus(task) || !dueDate) return false;
  return dueDate < todayStr();
}

function getDaysOverdue(task) {
  if (!isOverdue(task)) return 0;
  return diffCalendarDays(normalizeDateStr(resolveTaskDueDate(task)), todayStr());
}

/** 临期：常规任务今天或明天到期；临时任务仅当天（不含已延期） */
function isDueSoon(task) {
  if (isTaskBlocked(task)) return false;
  if (!isActiveTaskStatus(task) || isOverdue(task)) return false;
  const dueDate = normalizeDateStr(resolveTaskDueDate(task));
  if (!dueDate) return false;
  const daysUntilDue = diffCalendarDays(todayStr(), dueDate);
  if (daysUntilDue < 0) return false;
  const isTemp = task.type === 'temp' || !task.projectId;
  return isTemp ? daysUntilDue === 0 : daysUntilDue <= 1;
}

/**
 * 任务展示用「进度状态」（是否推进）：终态优先，其次阻塞，否则业务状态。
 * 临期/逾期是截止情况，不写入此处，由徽标/截止列单独展示。
 */
function getTaskDisplayStatus(task) {
  if (!task) return 'todo';
  if (task.status === 'abolished' || task.status === 'archived' || task.status === 'rejected' || task.status === 'done' || task.status === 'paused') {
    return task.status;
  }
  if (isTaskBlocked(task) && isActiveTaskStatus(task)) return 'blocked';
  return task.status || 'todo';
}

function getWeekStartMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isSingleRestWeek(dateStr) {
  const cal = getWorkCalendar();
  if (cal.scheduleMode === 'single') return true;
  if (cal.scheduleMode === 'double') return false;
  const ref = parseLocalDate(cal.referenceDate);
  const cur = parseLocalDate(dateStr);
  if (!ref || !cur) return false;
  const refStart = getWeekStartMonday(ref).getTime();
  const curStart = getWeekStartMonday(cur).getTime();
  const weeksDiff = Math.round((curStart - refStart) / (7 * 24 * 3600 * 1000));
  const refIsSingle = cal.referenceIsSingleWeek !== false;
  return weeksDiff % 2 === 0 ? refIsSingle : !refIsSingle;
}

// 判断是否为工作日（节假日、单双休、调休补班）
function isWorkDay(dateStr) {
  const ds = String(dateStr).slice(0, 10);
  const cal = getWorkCalendar();
  if (cal.extraWorkdays.includes(ds)) return true;
  if (cal.holidays.includes(ds)) return false;

  const date = parseLocalDate(ds);
  if (!date) return false;
  const day = date.getDay();
  if (day >= 1 && day <= 5) return true;
  if (day === 6) return isSingleRestWeek(ds);
  return false;
}

function parseWorkTimeInput(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const text = String(val).trim();
  if (text.includes(':')) {
    const [h, m = '0'] = text.split(':');
    const hour = Number(h);
    const minute = Number(m);
    if (Number.isFinite(hour) && Number.isFinite(minute)) return hour + minute / 60;
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function getWorkDayBounds() {
  const cal = getWorkCalendar();
  const start = parseWorkTimeInput(cal.workStartHour);
  const end = parseWorkTimeInput(cal.workEndHour);
  if (start != null && end != null && end > start) {
    return { start, end, hoursPerDay: Math.round((end - start) * 10) / 10 };
  }
  const hoursPerDay = Number(cal.hoursPerDay) || 8.5;
  return { start: 8.5, end: 17, hoursPerDay };
}

function addDaysLocal(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

// 任务每日投入工时；未设置时按标准工作日满负荷（8.5h）推算
function resolveDailyHours(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function taskDailyHours(task) {
  return task ? resolveDailyHours(task.dailyHours) : null;
}

// 根据开始日期和工时（小时）计算截止日期（仅计工作日工时）
function calcEndDate(startDate, hours, dailyHours) {
  if (!startDate || !hours || hours <= 0) return '';

  const perDay = resolveDailyHours(dailyHours);
  let remainingHours = hours;
  let currentDate = parseLocalDate(startDate);
  if (!currentDate) return '';

  if (perDay != null) {
    while (remainingHours > 0) {
      const dateStr = formatLocalDate(currentDate);
      if (isWorkDay(dateStr)) {
        if (remainingHours <= perDay) {
          remainingHours = 0;
        } else {
          remainingHours -= perDay;
          currentDate = addDaysLocal(currentDate, 1);
        }
      } else {
        currentDate = addDaysLocal(currentDate, 1);
      }
    }
    return formatLocalDate(currentDate);
  }

  const { start: workStartHour, end: workEndHour } = getWorkDayBounds();
  let currentHour = workStartHour;

  while (remainingHours > 0) {
    const dateStr = formatLocalDate(currentDate);
    if (isWorkDay(dateStr)) {
      const availableHours = workEndHour - currentHour;
      if (remainingHours <= availableHours) {
        remainingHours = 0;
      } else {
        remainingHours -= availableHours;
        currentDate = addDaysLocal(currentDate, 1);
        currentHour = workStartHour;
      }
    } else {
      currentDate = addDaysLocal(currentDate, 1);
      currentHour = workStartHour;
    }
  }

  return formatLocalDate(currentDate);
}

// 计算两个日期之间的工作日天数
function calcWorkDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end || start > end) return 0;

  let count = 0;
  let currentDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (currentDate <= end) {
    if (isWorkDay(formatLocalDate(currentDate))) count++;
    currentDate = addDaysLocal(currentDate, 1);
  }
  return count;
}

// 计算两个日期之间的有效工时（小时，不含节假日与非工作日）
function calcWorkHoursBetween(startDate, endDate) {
  if (!startDate) return 0;
  const end = endDate || formatLocalDate(new Date());
  return calcWorkDays(startDate, end) * getWorkDayBounds().hoursPerDay;
}

// 计算实际工时（小时）；可传入每日投入工时，未设置则按标准工作日满负荷
function calcActualHours(startDate, endDate, dailyHours) {
  if (!startDate) return 0;
  const end = endDate || formatLocalDate(new Date());
  const perDay = resolveDailyHours(dailyHours) ?? getWorkDayBounds().hoursPerDay;
  return calcWorkDays(startDate, end) * perDay;
}

/** 当周范围（周一至周日） */
function getCurrentWeekRange(refDate = new Date()) {
  const monday = getWeekStartMonday(refDate);
  const sunday = addDaysLocal(monday, 6);
  return { start: formatLocalDate(monday), end: formatLocalDate(sunday) };
}

function countOverlapWorkDays(rangeStart, rangeEnd, windowStart, windowEnd) {
  const rs = parseLocalDate(rangeStart);
  const re = parseLocalDate(rangeEnd);
  if (!rs || !re || rs > re) return 0;
  const os = parseLocalDate(windowStart);
  const oe = parseLocalDate(windowEnd);
  if (!os || !oe) return 0;
  const overlapStart = rs > os ? rs : os;
  const overlapEnd = re < oe ? re : oe;
  if (overlapStart > overlapEnd) return 0;
  return calcWorkDays(formatLocalDate(overlapStart), formatLocalDate(overlapEnd));
}

/** 任务计划窗口（与周分摊、看板周期筛选共用起止日解析） */
function getTaskScheduleWindow(task) {
  const estimated = Number(task.estimatedHours) || 0;
  let taskStart = getEffectivePlanStart(task) || task.planStartDate || '';
  // 进行中且已实际开工：以实际开始日为准（可早于计划开始）
  if (task.status === 'doing' && task.actualStartDate) {
    if (!taskStart || task.actualStartDate < taskStart) taskStart = task.actualStartDate;
  }
  let taskEnd = resolveTaskDueDate(task) || '';
  if (taskStart && task.planStartDate && taskStart < task.planStartDate && estimated > 0) {
    taskEnd = calcEndDate(taskStart, estimated, taskDailyHours(task)) || taskEnd;
  }
  if (!taskStart && !taskEnd) return null;
  if (!taskStart) taskStart = taskEnd;
  if (!taskEnd) taskEnd = calcEndDate(taskStart, estimated, taskDailyHours(task)) || taskStart;
  return { start: taskStart, end: taskEnd };
}

/** 任务计划窗口与指定周是否有工作日重叠 */
function taskOverlapsWeek(task, weekStart, weekEnd) {
  const window = getTaskScheduleWindow(task);
  if (!window) return false;
  return countOverlapWorkDays(window.start, window.end, weekStart, weekEnd) > 0;
}

/** 任务预计工时落在指定周内的部分（按工作日比例分摊；已暂停/项目暂停不计入） */
function getTaskHoursInWeek(task, weekStart, weekEnd) {
  if (!canCountTaskHours(task)) return 0;
  if (isTaskBlocked(task)) return 0;
  const estimated = Number(task.estimatedHours) || 0;
  if (estimated <= 0) return 0;

  const window = getTaskScheduleWindow(task);
  if (!window) return 0;
  const totalWorkDays = calcWorkDays(window.start, window.end);
  if (!totalWorkDays) return 0;
  const overlapDays = countOverlapWorkDays(window.start, window.end, weekStart, weekEnd);
  if (!overlapDays) return 0;
  return Math.round((estimated * overlapDays / totalWorkDays) * 10) / 10;
}

/** 任务原计划窗口：仅用 planStartDate + 预计工时推算截止，不含实际开工/依赖顺延 */
function getTaskOriginalPlanWindow(task) {
  const estimated = Number(task.estimatedHours) || 0;
  let taskStart = task.planStartDate || '';
  let taskEnd = '';
  if (taskStart && estimated > 0) {
    taskEnd = calcEndDate(taskStart, estimated, taskDailyHours(task)) || task.dueDate || '';
  } else {
    taskEnd = task.dueDate || '';
  }
  if (!taskStart && !taskEnd) return null;
  if (!taskStart) taskStart = taskEnd;
  if (!taskEnd) taskEnd = calcEndDate(taskStart, estimated, taskDailyHours(task)) || taskStart;
  return { start: taskStart, end: taskEnd };
}

/** 原计划工时落在指定周内的部分（含已完成/阻塞，不含作废/归档/已暂停/项目暂停） */
function getTaskOriginalHoursInWeek(task, weekStart, weekEnd) {
  if (!task || task.status === 'archived' || task.status === 'abolished' || task.status === 'paused') return 0;
  if (isTaskProjectPaused(task)) return 0;
  const estimated = Number(task.estimatedHours) || 0;
  if (estimated <= 0) return 0;
  const window = getTaskOriginalPlanWindow(task);
  if (!window) return 0;
  const totalWorkDays = calcWorkDays(window.start, window.end);
  if (!totalWorkDays) return 0;
  const overlapDays = countOverlapWorkDays(window.start, window.end, weekStart, weekEnd);
  if (!overlapDays) return 0;
  return Math.round((estimated * overlapDays / totalWorkDays) * 10) / 10;
}

/** 成员本周原计划协办工时（已批准辅助性协办，按协助时段分摊；不含作废/归档/已暂停/项目暂停） */
function getMemberAssistOriginalWeeklyHours(userName, weekRange) {
  return tasks
    .filter(t => t.status !== 'archived' && t.status !== 'abolished' && t.status !== 'paused' && !isTaskProjectPaused(t))
    .reduce((sum, t) => {
      const entry = getCollaboratorEntry(t, COLLAB_TYPE_ASSIST, userName);
      return sum + (entry ? getAssistEntryHoursInWeek(entry, weekRange.start, weekRange.end) : 0);
    }, 0);
}

function getMemberOriginalWeeklyHours(userName, weekRange) {
  const assigneeHours = tasks
    .filter(t => t.assignee === userName)
    .reduce((sum, t) => sum + getTaskOriginalHoursInWeek(t, weekRange.start, weekRange.end), 0);
  const assistHours = getMemberAssistOriginalWeeklyHours(userName, weekRange);
  return Math.round((assigneeHours + assistHours) * 10) / 10;
}

function getMemberWeeklyHours(userName, weekRange) {
  const assigneeHours = tasks
    .filter(t => t.assignee === userName && canCountTaskHours(t))
    .reduce((sum, t) => sum + getTaskHoursInWeek(t, weekRange.start, weekRange.end), 0);
  const assistHours = getMemberAssistWeeklyHours(userName, weekRange);
  return assigneeHours + assistHours;
}

function getMemberWeeklyHoursBreakdown(userName, weekRange) {
  const assigneeHours = tasks
    .filter(t => t.assignee === userName && canCountTaskHours(t))
    .reduce((sum, t) => sum + getTaskHoursInWeek(t, weekRange.start, weekRange.end), 0);
  const assistHours = getMemberAssistWeeklyHours(userName, weekRange);
  const pendingBlockedHours = getMemberPendingBlockedHours(userName);
  const originalPlannedHours = getMemberOriginalWeeklyHours(userName, weekRange);
  return {
    assigneeHours: Math.round(assigneeHours * 10) / 10,
    assistHours: Math.round(assistHours * 10) / 10,
    pendingBlockedHours: Math.round(pendingBlockedHours * 10) / 10,
    originalPlannedHours: Math.round(originalPlannedHours * 10) / 10,
    totalHours: Math.round((assigneeHours + assistHours) * 10) / 10,
  };
}

/** 根据有效计划开始+预计工时推算截止日期，否则用已填写的 dueDate */
function resolveTaskDueDate(task) {
  if (!task) return '';
  const planStart = getEffectivePlanStart(task) || task.planStartDate;
  if (planStart && Number(task.estimatedHours) > 0) {
    return calcEndDate(planStart, task.estimatedHours, taskDailyHours(task)) || task.dueDate || '';
  }
  return task.dueDate || '';
}

function syncTaskScheduleFields(task) {
  if (!task) return task;
  const dueDate = resolveTaskDueDate(task);
  if (dueDate) task.dueDate = dueDate;
  return task;
}

// 状态定义
const statusMap = {
  todo: { label: '待开始', color: '#6B7280', bg: '#F3F4F6', icon: 'fa-clock' },
  doing: { label: '进行中', color: '#2563EB', bg: '#DBEAFE', icon: 'fa-spinner' },
  done: { label: '已完成', color: '#059669', bg: '#D1FAE5', icon: 'fa-check-circle' },
  overdue: { label: '已延期', color: '#DC2626', bg: '#FEE2E2', icon: 'fa-exclamation-circle' },
  dueSoon: { label: '临期', color: '#D97706', bg: '#FEF3C7', icon: 'fa-clock' },
  blocked: { label: '阻塞中', color: '#D97706', bg: '#FEF3C7', icon: 'fa-pause-circle' },
  paused: { label: '已暂停', color: '#6B7280', bg: '#E5E7EB', icon: 'fa-pause-circle' },
  rejected: { label: '已驳回', color: '#D97706', bg: '#FEF3C7', icon: 'fa-undo' },
  archived: { label: '已归档', color: '#9CA3AF', bg: '#F3F4F6', icon: 'fa-archive' },
  abolished: { label: '已作废', color: '#9CA3AF', bg: '#F3F4F6', icon: 'fa-ban' },
};

// 项目状态定义
const projectStatusMap = {
  planning: { label: '规划中', color: '#0284C7', bg: '#E0F2FE', icon: 'fa-lightbulb' },
  active: { label: '进行中', color: '#059669', bg: '#D1FAE5', icon: 'fa-spinner' },
  paused: { label: '已暂停', color: '#6B7280', bg: '#E5E7EB', icon: 'fa-pause-circle' },
  done: { label: '已完成', color: '#059669', bg: '#D1FAE5', icon: 'fa-check-circle' },
  archived: { label: '已归档', color: '#9CA3AF', bg: '#F3F4F6', icon: 'fa-archive' },
};

function isProjectArchived(project) {
  return !!(project && (project.archived === true || project.status === 'archived'));
}

function isProjectPaused(projectOrId) {
  const project = typeof projectOrId === 'string'
    ? projects.find(p => p.id === projectOrId)
    : projectOrId;
  return !!(project && project.status === 'paused');
}

/** 任务所属项目是否已暂停 */
function isTaskProjectPaused(task) {
  if (!task?.projectId) return false;
  return isProjectPaused(task.projectId);
}

/** 不计入待办（已暂停任务，或所属项目已暂停） */
function isExcludedFromTodo(task) {
  if (!task) return true;
  if (isTerminalTaskStatus(task.status) || task.status === 'done' || task.status === 'paused') return true;
  return isTaskProjectPaused(task);
}

/** 可计入饱和度/当周工时（任务与所属项目均未暂停） */
function canCountTaskHours(task) {
  if (!task || !isHoursCountableStatus(task.status)) return false;
  if (isTaskProjectPaused(task)) return false;
  return true;
}

const PROJECT_PAUSE_SKIP_STATUSES = new Set(['done', 'abolished', 'archived']);

/** 项目暂停：级联暂停其下未完成任务（已手动暂停的保留，恢复项目时不强制改回） */
function applyProjectPauseCascade(projectId) {
  tasks.forEach(t => {
    if (t.projectId !== projectId) return;
    if (PROJECT_PAUSE_SKIP_STATUSES.has(t.status)) return;
    if (t.status === 'paused') return;
    t.statusBeforeProjectPause = t.status;
    t.pausedByProject = true;
    t.status = 'paused';
  });
}

/** 项目从暂停恢复：仅恢复因项目暂停而自动暂停的任务 */
function clearProjectPauseCascade(projectId) {
  tasks.forEach(t => {
    if (t.projectId !== projectId || !t.pausedByProject) return;
    const restore = t.statusBeforeProjectPause || 'todo';
    t.status = restore === 'paused' ? 'todo' : restore;
    delete t.pausedByProject;
    delete t.statusBeforeProjectPause;
  });
}

function syncProjectPauseCascade(project, oldStatus) {
  if (!project) return;
  if (project.status === 'paused' && oldStatus !== 'paused') {
    applyProjectPauseCascade(project.id);
  } else if (oldStatus === 'paused' && project.status !== 'paused') {
    clearProjectPauseCascade(project.id);
  }
}

function normalizeProjectRecord(project) {
  if (!project) return project;
  if (isProjectArchived(project)) {
    project.archived = true;
    project.status = 'archived';
  } else if (project.archived == null) {
    project.archived = false;
  }
  if (!Array.isArray(project.teamMembers)) project.teamMembers = [];
  project.teamMembers = sanitizeProjectTeamMembers(project.manager, project.teamMembers);
  project.currentPhase = String(project.currentPhase || '').trim();
  project.nextPlan = String(project.nextPlan || '').trim();
  project.blocker = String(project.blocker || '').trim();
  project.objective = String(project.objective || '').trim();
  project.value = String(project.value || '').trim();
  project.scope = String(project.scope || '').trim();
  project.outOfScope = String(project.outOfScope || '').trim();
  project.planVerified = project.planVerified === true;
  project.planVerifiedBy = String(project.planVerifiedBy || '').trim();
  project.planVerifiedAt = String(project.planVerifiedAt || '').trim();
  return project;
}

const MILESTONE_PLAN_FIELDS = [
  'milestoneSeq', 'roleA', 'roleR', 'roleC', 'roleV',
  'deliverables', 'acceptanceCriteria', 'completionEvidence',
  'depsRisks', 'escalation', 'delayImpact', 'reopenConditions',
];

/** 兼容历史：交付物/验收写在 desc「【交付物】…｜【验收】…」 */
function extractMilestonePlanFromDesc(desc) {
  const text = String(desc || '').trim();
  if (!text) return { deliverables: '', acceptanceCriteria: '' };
  let deliverables = '';
  let acceptanceCriteria = '';
  const dIdx = text.indexOf('【交付物】');
  const aIdx = text.indexOf('【验收】');
  if (dIdx >= 0) {
    const start = dIdx + '【交付物】'.length;
    const end = aIdx > dIdx ? aIdx : text.length;
    deliverables = text.slice(start, end).replace(/^[｜|\s]+|[｜|\s]+$/g, '').trim();
  }
  if (aIdx >= 0) {
    acceptanceCriteria = text.slice(aIdx + '【验收】'.length).replace(/^[｜|\s]+|[｜|\s]+$/g, '').trim();
  }
  return { deliverables, acceptanceCriteria };
}

function getMilestoneDeliverablesText(m) {
  const direct = String(m?.deliverables || '').trim();
  if (direct) return direct;
  return extractMilestonePlanFromDesc(m?.desc).deliverables;
}

function getMilestoneAcceptanceText(m) {
  const direct = String(m?.acceptanceCriteria || '').trim();
  if (direct) return direct;
  return extractMilestonePlanFromDesc(m?.desc).acceptanceCriteria;
}

function hydrateMilestonePlanFromDesc(task) {
  if (!task || !isMilestoneTask(task)) return task;
  const parsed = extractMilestonePlanFromDesc(task.desc);
  if (!String(task.deliverables || '').trim() && parsed.deliverables) {
    task.deliverables = parsed.deliverables;
  }
  if (!String(task.acceptanceCriteria || '').trim() && parsed.acceptanceCriteria) {
    task.acceptanceCriteria = parsed.acceptanceCriteria;
  }
  return task;
}

function normalizeMilestonePlanFields(task) {
  if (!task) return task;
  hydrateMilestonePlanFromDesc(task);
  MILESTONE_PLAN_FIELDS.forEach((key) => {
    task[key] = String(task[key] || '').trim();
  });
  return task;
}

function getNextMilestoneSeq(projectId) {
  const list = tasks.filter(t => t.projectId === projectId && isMilestoneTask(t) && t.status !== 'abolished');
  let maxN = 0;
  list.forEach((m) => {
    const raw = String(m.milestoneSeq || '').trim();
    const match = raw.match(/(\d+)/);
    if (match) maxN = Math.max(maxN, Number(match[1]) || 0);
  });
  return `M${maxN + 1}`;
}

function formatScopeCombo(project) {
  const scope = String(project?.scope || '').trim();
  const out = String(project?.outOfScope || '').trim();
  if (scope && out) return `${scope} / 不做：${out}`;
  if (scope) return scope;
  if (out) return `不做：${out}`;
  return '';
}

function getMilestonePlanRoles(m) {
  return {
    roleA: String(m?.roleA || '').trim(),
    roleR: String(m?.roleR || m?.assignee || '').trim(),
    roleC: String(m?.roleC || '').trim(),
    roleV: String(m?.roleV || '').trim(),
  };
}

function buildProjectPlanLedgerLines(project) {
  if (!project) return [];
  const milestones = getProjectMilestones(project);
  const objective = String(project.objective || project.desc || '').trim();
  const scopeCombo = formatScopeCombo(project);
  const finalDue = normalizeDateStr(project.endDate) || project.endDate || '';
  const projectName = String(project.name || '').trim();
  if (!milestones.length) {
    return [[
      projectName, objective, scopeCombo, finalDue,
      '', '', '', '', '', '', '', '', '', '', '',
    ].join(' | ')];
  }
  return milestones.map((m, idx) => {
    const roles = getMilestonePlanRoles(m);
    const seq = String(m.milestoneSeq || `M${idx + 1}`).trim();
    const start = normalizeDateStr(getEffectivePlanStart(m) || m.planStartDate) || '';
    const end = normalizeDateStr(resolveTaskDueDate(m)) || m.dueDate || '';
    const depsRisks = [
      String(m.depsRisks || '').trim(),
      String(m.escalation || '').trim() ? `升级：${String(m.escalation).trim()}` : '',
      String(m.delayImpact || '').trim() ? `延期影响：${String(m.delayImpact).trim()}` : '',
      String(m.reopenConditions || '').trim() ? `重开：${String(m.reopenConditions).trim()}` : '',
    ].filter(Boolean).join('；');
    return [
      projectName,
      objective,
      scopeCombo,
      finalDue,
      seq,
      String(m.title || '').trim(),
      start,
      end,
      roles.roleA,
      roles.roleR,
      roles.roleC,
      roles.roleV,
      String(m.deliverables || '').trim() || extractMilestonePlanFromDesc(m.desc).deliverables,
      String(m.acceptanceCriteria || '').trim() || extractMilestonePlanFromDesc(m.desc).acceptanceCriteria,
      depsRisks,
    ].join(' | ');
  });
}

function getProjectPlanCompleteness(project) {
  const hasObjective = !!(project.objective || '').trim();
  const hasScope = !!(project.scope || '').trim() || !!(project.outOfScope || '').trim();
  const hasFinalDue = !!(project.endDate || '').trim();
  const milestones = getProjectMilestones(project);
  let filledMs = 0;
  milestones.forEach((m) => {
    const roles = getMilestonePlanRoles(m);
    const ok = !!(m.milestoneSeq || '').trim()
      && !!(roles.roleA)
      && !!(roles.roleR)
      && !!getMilestoneDeliverablesText(m)
      && !!getMilestoneAcceptanceText(m)
      && !!(normalizeDateStr(getEffectivePlanStart(m) || m.planStartDate))
      && !!(normalizeDateStr(resolveTaskDueDate(m)) || m.dueDate);
    if (ok) filledMs += 1;
  });
  return {
    hasObjective,
    hasScope,
    hasFinalDue,
    milestoneTotal: milestones.length,
    milestoneFilled: filledMs,
    ready: hasObjective && hasScope && hasFinalDue && milestones.length > 0 && filledMs === milestones.length,
  };
}

function canVerifyProjectPlan(project) {
  if (!project) return false;
  if (isFullAccess(currentUser.role)) return true;
  return isSamePersonName(currentUser.name, '陈璇');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

async function copyProjectPlanLedger(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const lines = buildProjectPlanLedgerLines(project);
  const header = '项目名称 | 目标 | 范围/不做范围 | 最终完成时间 | M序号 | 里程碑名称 | 开始日期 | 完成日期 | A | R | C | V | 交付物 | 验收标准 | 依赖/风险';
  const text = [header, ...lines].join('\n');
  try {
    await copyTextToClipboard(text);
    alert(`已复制 ${lines.length} 行计划台账（管线格式），可直接粘贴回复领导`);
  } catch (e) {
    alert('复制失败，请改用「导出计划台账」');
  }
}

async function exportProjectPlanLedger(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const milestones = getProjectMilestones(project);
  const headers = ['项目名称', '目标', '范围/不做范围', '最终完成时间', 'M序号', '里程碑名称', '开始日期', '完成日期', 'A', 'R', 'C', 'V', '交付物', '验收标准', '依赖/风险', '完成证据', '升级条件', '延期影响', '重开条件'];
  const objective = String(project.objective || project.desc || '').trim();
  const scopeCombo = formatScopeCombo(project);
  const finalDue = normalizeDateStr(project.endDate) || project.endDate || '';
  const rows = (milestones.length ? milestones : [null]).map((m, idx) => {
    if (!m) {
      return [project.name, objective, scopeCombo, finalDue, '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    }
    const roles = getMilestonePlanRoles(m);
    return [
      project.name,
      objective,
      scopeCombo,
      finalDue,
      String(m.milestoneSeq || `M${idx + 1}`).trim(),
      m.title || '',
      normalizeDateStr(getEffectivePlanStart(m) || m.planStartDate) || '',
      normalizeDateStr(resolveTaskDueDate(m)) || m.dueDate || '',
      roles.roleA,
      roles.roleR,
      roles.roleC,
      roles.roleV,
      m.deliverables || extractMilestonePlanFromDesc(m.desc).deliverables,
      m.acceptanceCriteria || extractMilestonePlanFromDesc(m.desc).acceptanceCriteria,
      m.depsRisks || '',
      m.completionEvidence || '',
      m.escalation || '',
      m.delayImpact || '',
      m.reopenConditions || '',
    ];
  });
  await downloadExcel('项目计划台账', headers, rows, `项目计划台账_${project.name || project.id}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function toggleProjectPlanVerified(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canVerifyProjectPlan(project)) {
    alert('仅陈璇或管理员可校验计划台账');
    return;
  }
  if (project.planVerified) {
    project.planVerified = false;
    project.planVerifiedBy = '';
    project.planVerifiedAt = '';
  } else {
    project.planVerified = true;
    project.planVerifiedBy = currentUser.name;
    project.planVerifiedAt = new Date().toLocaleString();
  }
  normalizeProjectRecord(project);
  appendChangeLogEntry({
    taskId: 'PROJECT-' + projectId,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: project.planVerified ? '未校验' : '已校验',
    after: project.planVerified ? `已校验（${project.planVerifiedBy}）` : '未校验',
    reason: '项目计划台账校验',
    project: project.name,
  });
  save({ immediateSync: true });
  render();
}

function normalizeAllProjects() {
  projects.forEach(normalizeProjectRecord);
}

/** 同步时可提交的项目（含已归档，避免归档后无法写回服务端） */
function canUserSyncProject(project) {
  if (!project) return false;
  if (isFullAccess(currentUser.role)) return true;
  return project.manager === currentUser.name || project.creator === currentUser.name;
}

/** 同步时可提交的任务（含已作废/已归档，避免终态变更无法写回服务端） */
function canUserSyncTask(task) {
  if (!task) return false;
  if (isFullAccess(currentUser.role)) return true;
  if (task.status !== 'archived' && task.status !== 'abolished' && canEditTask(task)) return true;
  if (canAbolishTask(task)) return true;
  return false;
}

// 优先级定义
const priorityMap = {
  urgent: { label: '紧急', color: '#DC2626', bg: '#FEE2E2' },
  important: { label: '重要', color: '#D97706', bg: '#FEF3C7' },
  normal: { label: '普通', color: '#6B7280', bg: '#F3F4F6' },
};
