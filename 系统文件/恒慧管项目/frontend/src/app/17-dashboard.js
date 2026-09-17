// ========== 工作台（扣子模板布局）+ 任务中心 ==========
function formatActivityRelative(operateTime) {
  if (!operateTime) return '';
  const d = new Date(String(operateTime).replace(/-/g, '/'));
  if (Number.isNaN(d.getTime())) return String(operateTime);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return String(operateTime);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return String(operateTime);
}

function getRecentActivityItems(limit) {
  const max = limit || 8;
  return (changeLogs || []).slice(0, max).map(l => {
    const task = l.taskId ? tasks.find(t => t.id === l.taskId) : null;
    const title = task?.title || l.taskId || '任务';
    const projectLabel = l.project || (task ? getTaskProjectLabel(task) : '') || '';
    let icon = 'fa-pen';
    const afterText = typeof l.after === 'string' ? l.after : '';
    if (/完成|done/i.test(afterText) || /状态：已完成/.test(afterText)) icon = 'fa-check';
    else if (/进行中|doing/i.test(afterText)) icon = 'fa-play';
    else if (/创建|新建/.test(l.reason || '')) icon = 'fa-plus';
    return {
      id: l.id,
      icon,
      text: `${l.operator || '有人'} 更新了「${title}」`,
      meta: [projectLabel, formatActivityRelative(l.operateTime)].filter(Boolean).join(' · '),
      taskId: l.taskId,
    };
  });
}

/** 本人本周已完成末级任务（周一至周日；本周完成日志优先，否则看 actualEndDate） */
function getMyWeekCompletedTasks() {
  const { start, end } = getCurrentWeekRange();
  const doneLogsByTask = new Map();
  (changeLogs || []).forEach(l => {
    if (!l?.taskId) return;
    const afterText = typeof l.after === 'string' ? l.after : '';
    // 状态变更「已完成」或快捷进度 100% 均视为完成事件
    if (!(/完成|done/i.test(afterText) || /状态：已完成/.test(afterText) || afterText === '100%')) return;
    if (!changeLogInRange(l, start, end)) return;
    const prev = doneLogsByTask.get(l.taskId);
    const t = l.operateTime || l.createdAt || '';
    if (!prev || String(t) > String(prev)) doneLogsByTask.set(l.taskId, t);
  });

  let pool = [];
  try {
    pool = getMyTodoLeafTasksIncludingDone().filter(t => t.status === 'done');
  } catch {
    pool = [];
  }

  const items = pool.map(task => {
    const endDate = normalizeDateStr(task.actualEndDate) || '';
    const logRaw = doneLogsByTask.has(task.id) ? String(doneLogsByTask.get(task.id)) : '';
    let completedAt = '';
    // 本周内有完成日志：以日志日为准（避免旧 actualEndDate 把本周完成漏掉）
    if (logRaw) {
      completedAt = normalizeDateStr(logRaw) || '';
    }
    if (!completedAt && endDate && dateInRange(endDate, start, end)) {
      completedAt = endDate;
    }
    if (!completedAt) return null;
    return {
      task,
      completedAt,
      projectLabel: task.projectId ? getTaskProjectLabel(task) : '临时任务',
    };
  }).filter(Boolean);

  items.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  return items;
}

/** 标准模板门禁任务（标题以【里程碑】开头），工作台/任务中心不展示 */
function isNamedMilestoneGate(task) {
  return !!(task && /^【里程碑】/.test(String(task.title || '').trim()));
}

/** 阶段里程碑与门禁里程碑：不进入工作台待办、任务中心 */
function shouldHideMilestoneLikeTask(task) {
  return isMilestoneTask(task) || isNamedMilestoneGate(task);
}

/** @deprecated 兼容旧调用 */
function shouldHideFromWorkbenchTodos(task) {
  return shouldHideMilestoneLikeTask(task);
}

/**
 * 项目任务所属「一级目录」：挂在阶段里程碑下的第一层任务；
 * 若无里程碑父级，则取项目内最顶层祖先。
 */
function getProjectFirstLevelDirectory(task) {
  if (!task || !task.projectId || task.type === 'temp') return null;
  let cur = task;
  let firstLevel = task;
  const visited = new Set();
  while (cur && cur.parentId && cur.parentId !== cur.id && !visited.has(cur.id)) {
    visited.add(cur.id);
    const parent = tasks.find(t => t.id === cur.parentId);
    if (!parent || parent.projectId !== task.projectId) break;
    if (isMilestoneTask(parent)) {
      firstLevel = cur;
      break;
    }
    firstLevel = parent;
    cur = parent;
  }
  if (isMilestoneTask(firstLevel)) return null;
  return firstLevel;
}

/**
 * 工作台待办：项目任务所属一级目录仍为「待开始」时不展示
 *（含一级目录自身；临时任务不受影响）
 * 所属阶段里程碑仍为待开始时同样隐藏。
 * 例外：计划开始日已到或落在近一周窗口内的任务仍展示，避免被未启动里程碑挡住。
 */
function shouldHideWorkbenchTodoUnderUnstartedFirstLevel(task) {
  if (!task || !task.projectId || task.type === 'temp') return false;
  if (shouldHideMilestoneLikeTask(task)) return false;

  const start = normalizeDateStr(getEffectivePlanStart(task) || task.planStartDate) || '';
  if (start) {
    const weekEnd = formatLocalDate(addDaysLocal(parseLocalDate(todayStr()), 6));
    if (start <= weekEnd) return false;
  }

  let cur = task;
  const visited = new Set();
  while (cur && cur.parentId && cur.parentId !== cur.id && !visited.has(cur.id)) {
    visited.add(cur.id);
    const parent = tasks.find(t => t.id === cur.parentId);
    if (!parent || parent.projectId !== task.projectId) break;
    if (isMilestoneTask(parent)) {
      if ((parent.status || 'todo') === 'todo') return true;
      break;
    }
    cur = parent;
  }

  const firstLevel = getProjectFirstLevelDirectory(task);
  if (!firstLevel) return false;
  return (firstLevel.status || 'todo') === 'todo';
}

/** 项目阶段里程碑：与详情轨同源（getProjectMilestones，按 milestoneSeq） */
function getOrderedProjectMilestones(project) {
  if (typeof getProjectMilestones === 'function') return getProjectMilestones(project);
  if (!project) return [];
  const list = tasks.filter(t =>
    t.projectId === project.id &&
    t.status !== 'abolished' &&
    isMilestoneTask(t)
  );
  return getProjectRootTasks(list).filter(isMilestoneTask);
}

/** 当前（首个未完成）与下一个阶段里程碑；当前尚未开始时不展示下一个 */
function getCurrentAndNextMilestones(project) {
  const ordered = getOrderedProjectMilestones(project);
  if (!ordered.length) return { current: null, next: null, ordered };
  const currentIdx = ordered.findIndex(m =>
    m.status !== 'done' && m.status !== 'archived'
  );
  if (currentIdx < 0) {
    return { current: ordered[ordered.length - 1], next: null, ordered, allDone: true };
  }
  const current = ordered[currentIdx];
  const currentStarted =
    current.status === 'doing' ||
    current.status === 'paused' ||
    Number(current.progress) > 0 ||
    !!current.actualStartDate ||
    calcProgress(current.id) > 0;
  return {
    current,
    next: currentStarted ? (ordered[currentIdx + 1] || null) : null,
    ordered,
    allDone: false,
  };
}

/** 项目推进三字段：当前阶段 / 下一步计划 / 当前卡点 */
function getProjectFocusFields(project) {
  return {
    currentPhase: String(project?.currentPhase || '').trim(),
    nextPlan: String(project?.nextPlan || '').trim(),
    blocker: String(project?.blocker || '').trim(),
  };
}

function applyProjectFocusFields(project, fields) {
  if (!project || !fields) return project;
  project.currentPhase = String(fields.currentPhase ?? project.currentPhase ?? '').trim();
  project.nextPlan = String(fields.nextPlan ?? project.nextPlan ?? '').trim();
  project.blocker = String(fields.blocker ?? project.blocker ?? '').trim();
  return project;
}

/** 从 DOM 读取推进字段；editSuffix 传 'Edit' 对应编辑弹窗 */
function readProjectFocusFromDom(editSuffix = '') {
  const prefix = 'project' + (editSuffix || '');
  return {
    currentPhase: (document.getElementById(prefix + 'CurrentPhase')?.value || '').trim(),
    nextPlan: (document.getElementById(prefix + 'NextPlan')?.value || '').trim(),
    blocker: (document.getElementById(prefix + 'Blocker')?.value || '').trim(),
  };
}

function syncProjectFocusToForm(projectId) {
  if (state.form?.projectId !== projectId && state.form?.id !== projectId) return;
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  applyProjectFocusFields(state.form, getProjectFocusFields(project));
}

function renderProjectFocusRows(project, rowClass = 'wb-project-focus-row') {
  const { currentPhase, nextPlan, blocker } = getProjectFocusFields(project);
  return `
    <div class="${rowClass} is-phase">
      <span class="k">当前阶段</span>
      <span class="v">${escapeHtml(currentPhase || '暂无')}</span>
    </div>
    <div class="${rowClass}">
      <span class="k">下一步</span>
      <span class="v">${escapeHtml(nextPlan || '暂无')}</span>
    </div>
    <div class="${rowClass}${blocker ? ' is-blocker' : ''}">
      <span class="k">卡点</span>
      <span class="v">${escapeHtml(blocker || '暂无')}</span>
    </div>
  `;
}

/** 工作台展示的项目里程碑：进行中、当前用户相关的项目 */
function getWorkbenchMilestoneProjects() {
  return getViewableProjects()
    .filter(p => !isProjectArchived(p) && p.status === 'active')
    .filter(p => {
      const related =
        isSamePersonName(p.manager, currentUser.name) ||
        isSamePersonName(p.creator, currentUser.name) ||
        (Array.isArray(p.teamMembers) && p.teamMembers.some(n => isSamePersonName(n, currentUser.name))) ||
        tasks.some(t => t.projectId === p.id && isRelatedToTask(t));
      return related || isFullAccess(currentUser.role);
    })
    .filter(p => getOrderedProjectMilestones(p).length > 0)
    .slice(0, 8);
}

function renderWorkbenchMilestoneItem(milestone, roleLabel, iconClass) {
  if (!milestone) {
    return `
      <div class="wb-activity-item">
        <div class="wb-activity-icon is-idle"><i class="fas fa-flag"></i></div>
        <div class="wb-activity-body">
          <div class="wb-activity-text" style="color:#94A3B8;">${escapeHtml(roleLabel)} · 暂无</div>
        </div>
      </div>`;
  }
  const progress = calcProgress(milestone.id);
  const due = normalizeDateStr(resolveTaskDueDate(milestone)) || milestone.dueDate || '';
  const st = statusMap[getTaskDisplayStatus(milestone)] || statusMap[milestone.status] || { label: milestone.status || '' };
  const meta = [
    st.label || '',
    `${progress}%`,
    due ? `截止 ${due}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="wb-activity-item" onclick="viewTask('${milestone.id}')" style="cursor:pointer;">
      <div class="wb-activity-icon ${iconClass || ''}"><i class="fas fa-flag"></i></div>
      <div class="wb-activity-body">
        <div class="wb-activity-text">${escapeHtml(roleLabel)} · ${escapeHtml(milestone.title || '')}</div>
        <div class="wb-activity-meta">${escapeHtml(meta)}</div>
      </div>
    </div>`;
}

/** 工作台展示的项目推进：进行中/已暂停
 *  可见范围与项目列表一致：总经理/管理员/部门经理看全公司；执行人员仅相关项目。
 *  [本地改动 2026-09-03] 原仅纳入 status==='active'，导致「已暂停」项目（专属钉钉等）在此完全不可见。
 *  现放宽为 active + paused；已完成(done) / 已归档(archived) 仍不在此展示。
 */
function getWorkbenchProjectFocusProjects() {
  return getViewableProjects()
    .filter(p => !isProjectArchived(p) && (p.status === 'active' || p.status === 'paused'))
    .filter(p => {
      if (canViewAllProjects()) return true;
      return (
        isSamePersonName(p.manager, currentUser.name) ||
        isSamePersonName(p.creator, currentUser.name) ||
        (Array.isArray(p.teamMembers) && p.teamMembers.some(n => isSamePersonName(n, currentUser.name))) ||
        tasks.some(t => t.projectId === p.id && isRelatedToTask(t))
      );
    })
    .sort((a, b) => {
      // 进行中优先，已暂停排后
      const aPaused = a.status === 'paused' ? 1 : 0;
      const bPaused = b.status === 'paused' ? 1 : 0;
      if (aPaused !== bPaused) return aPaused - bPaused;
      const aBlock = !!String(a.blocker || '').trim();
      const bBlock = !!String(b.blocker || '').trim();
      if (aBlock !== bBlock) return bBlock - aBlock;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });
}

function renderWorkbenchProjectFocusSection() {
  const list = getWorkbenchProjectFocusProjects();
  const itemsHtml = list.length
    ? list.map(project => {
        const pst = projectStatusMap[project.status] || projectStatusMap.active;
        return `
          <div class="wb-project-focus-item" onclick="viewProject('${project.id}')">
            <div class="wb-project-focus-name">
              <span>${escapeHtml(project.name || '')}</span>
              <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:${pst.bg};color:${pst.color};">${escapeHtml(pst.label)}</span>
            </div>
            ${renderProjectFocusRows(project)}
          </div>`;
      }).join('')
    : `<div class="wb-empty" style="border:none;padding:20px 8px;">暂无进行中或暂停的项目</div>`;

  return `
    <div class="wb-project-focus-block">
      <div class="wb-section-head">
        <div class="wb-section-title">项目推进</div>
        <button type="button" class="wb-more-link" onclick="goTo('projects')">全部项目</button>
      </div>
      <div class="wb-activity-panel">
        ${itemsHtml}
      </div>
    </div>`;
}

function renderWorkbenchMilestoneSection() {
  const list = getWorkbenchMilestoneProjects();
  const itemsHtml = list.length
    ? list.map(project => {
        const { current, next, allDone } = getCurrentAndNextMilestones(project);
        return `
          <div class="wb-milestone-project-group">
            <div class="wb-milestone-project-head">
              <div class="wb-milestone-project-name" title="${escapeHtml(project.name || '')}"
                onclick="viewProject('${project.id}')">${escapeHtml(project.name || '')}</div>
              ${allDone ? '<span style="font-size:11px;font-weight:600;color:#059669;flex-shrink:0;">已完成</span>' : ''}
              <button type="button" class="wb-milestone-project-link"
                onclick="event.stopPropagation();viewProject('${project.id}')">详情</button>
            </div>
            ${renderWorkbenchMilestoneItem(current, allDone ? '最近完成' : '当前', allDone ? 'is-done' : '')}
            ${next ? renderWorkbenchMilestoneItem(next, '下一个', 'is-next') : ''}
          </div>`;
      }).join('')
    : `<div class="wb-empty" style="border:none;padding:20px 8px;">暂无进行中的项目里程碑</div>`;

  return `
    <div class="wb-milestone-block">
      <div class="wb-section-head">
        <div class="wb-section-title">项目里程碑</div>
        <button type="button" class="wb-more-link" onclick="goTo('projects')">全部项目</button>
      </div>
      <div class="wb-activity-panel">
        ${itemsHtml}
      </div>
    </div>`;
}

function renderWorkbenchTodoCard(task) {
  const overdue = isOverdue(task) && task.status !== 'done';
  const dueSoon = !overdue && isDueSoon(task) && task.status !== 'done';
  const urgencyClass = overdue ? 'is-overdue' : (dueSoon ? 'is-duesoon' : '');
  // 截止情况徽标（与进度状态分列，不互相覆盖）
  const badge = overdue
    ? '<span class="wb-todo-badge is-overdue">已逾期</span>'
    : (dueSoon ? '<span class="wb-todo-badge is-duesoon">临期</span>' : '');
  const start = normalizeDateStr(getEffectivePlanStart(task) || task.planStartDate) || '';
  const due = normalizeDateStr(resolveTaskDueDate(task)) || task.dueDate || '';
  const parts = getTaskCenterDisplayParts(task);
  const actionMenu = renderTodoActionDropdown(task);
  const submitterName = typeof displayTaskSubmitterName === 'function' ? displayTaskSubmitterName(task) : '';
  const systemName = typeof getIntakeSystemName === 'function' ? getIntakeSystemName(task) : '';
  const displayStatus = getTaskDisplayStatus(task);
  const st = statusMap[displayStatus] || statusMap[task.status] || statusMap.todo;
  const source = getWorkbenchTodoSource(task);
  const metaBits = [];
  if (start) metaBits.push(`<span class="tag"><i class="far fa-calendar-plus"></i> 开始 ${escapeHtml(start)}</span>`);
  if (due) metaBits.push(`<span class="tag"><i class="far fa-calendar"></i> 截止 ${escapeHtml(due)}</span>`);
  if (systemName) metaBits.push(`<span class="tag"><i class="fas fa-server"></i> 系统 ${escapeHtml(systemName)}</span>`);
  if (submitterName) metaBits.push(`<span class="tag"><i class="fas fa-user"></i> 提单人 ${escapeHtml(submitterName)}</span>`);

  return `
    <div class="wb-todo-card ${urgencyClass}" onclick="viewTask('${task.id}')">
      <div class="wb-todo-bar">
        <div class="wb-todo-bar-main">
          <div class="wb-todo-top">
            <div class="wb-todo-title">
              <span class="wb-todo-title-main">${escapeHtml(parts.title)}</span>
            </div>
            ${badge}
          </div>
          <div class="wb-todo-status-row">
            <span class="status-tag status-${displayStatus}" style="font-size:10px;"><i class="fas ${st.icon}"></i>${st.label}</span>
            <span class="wb-todo-source ${source.mod}" title="${escapeHtml(source.detail || source.label)}">
              <i class="fas ${source.icon}"></i>${escapeHtml(source.label)}
            </span>
          </div>
        </div>
        ${actionMenu || ''}
      </div>
      ${metaBits.length ? `<div class="wb-todo-meta">${metaBits.join('')}</div>` : ''}
    </div>
  `;
}

/** 工作台待办来源：项目 / 临时 / 表单提报 / 告知协办 */
function getWorkbenchTodoSource(task) {
  if (!task) return { label: '未知', icon: 'fa-question', mod: '', detail: '' };
  if (isAitableIntakeTask(task)) {
    const sys = getIntakeSystemName(task);
    return {
      label: sys ? `表单 · ${sys}` : '表单提报',
      icon: 'fa-file-alt',
      mod: 'is-intake',
      detail: sys || '钉钉表单提报',
    };
  }
  const type = getTodoTaskType(task);
  if (type === 'inform') {
    return { label: '告知协办', icon: 'fa-bell', mod: 'is-inform', detail: getTaskProjectLabel(task) };
  }
  if (type === 'temp') {
    return { label: '临时任务', icon: 'fa-bolt', mod: 'is-temp', detail: '临时事项' };
  }
  const proj = getTaskProjectLabel(task);
  return { label: proj, icon: 'fa-folder', mod: 'is-project', detail: `项目任务 · ${proj}` };
}

/**
 * 工作台「我的待办」时间窗：开始日期在今天起一周内（含今天），
 * 或开始日已过但仍未完成（应已开工）；无开始日的仍展示以免漏项。
 */
function isWorkbenchStartWithinNextWeek(task) {
  const start = normalizeDateStr(getEffectivePlanStart(task) || task.planStartDate) || '';
  if (!start) return true;
  const today = todayStr();
  const end = formatLocalDate(addDaysLocal(parseLocalDate(today), 6));
  if (start > end) return false;
  return true;
}

function renderWorkbenchHome() {
  const projectCount = getViewableProjects().filter(p => !isProjectArchived(p)).length;
  const workTasks = tasks.filter(t =>
    t.status !== 'abolished' &&
    t.status !== 'archived' &&
    !shouldHideFromWorkbenchTodos(t)
  );
  const taskCount = workTasks.length;
  const completedCount = workTasks.filter(t => t.status === 'done').length;

  const stats = [
    { label: '项目数', value: projectCount, accent: '#4F46E5', bg: '#EEF2FF', icon: 'fa-folder-open' },
    { label: '任务数', value: taskCount, accent: '#0EA5E9', bg: '#F0F9FF', icon: 'fa-list-check' },
    { label: '已完成任务', value: completedCount, accent: '#10B981', bg: '#F0FDF4', icon: 'fa-circle-check' },
  ];

  let myTodos = [];
  try {
    myTodos = sortWorkbenchTodos(
      getMyTodoLeafTasks()
        .filter(t => t.status !== 'done' && t.status !== 'abolished' && t.status !== 'archived')
        .filter(t => !shouldHideFromWorkbenchTodos(t))
        .filter(t => !shouldHideWorkbenchTodoUnderUnstartedFirstLevel(t))
        .filter(isWorkbenchStartWithinNextWeek)
    );
  } catch { myTodos = []; }
  const overdueCount = myTodos.filter(t => isOverdue(t)).length;
  const soonCount = myTodos.filter(t => !isOverdue(t) && isDueSoon(t)).length;
  const preview = myTodos.slice(0, 12);
  const weekEndLabel = formatLocalDate(addDaysLocal(parseLocalDate(todayStr()), 6));

  return `
    <div class="wb-wrap">
      <div class="wb-stats">
        ${stats.map(s => `
          <div class="wb-stat-card">
            <div class="wb-stat-icon" style="background:${s.bg};color:${s.accent};"><i class="fas ${s.icon}"></i></div>
            <div>
              <div class="wb-stat-value">${s.value}</div>
              <div class="wb-stat-label">${s.label}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="wb-layout">
        <div>
          <button type="button" class="wb-new-btn" onclick="showQuickTempTaskModal()">
            <i class="fas fa-plus"></i> 新建事项
          </button>
          <div class="wb-section-head">
            <div class="wb-section-title">
              我的待办
              <span class="wb-count">${myTodos.length}</span>
              <span class="wb-section-sub">开始日 ≤ ${escapeHtml(weekEndLabel)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="wb-urgency-chips">
                ${overdueCount > 0 ? `<span class="wb-chip wb-chip--overdue">${overdueCount} 逾期</span>` : ''}
                ${soonCount > 0 ? `<span class="wb-chip wb-chip--soon">${soonCount} 临期</span>` : ''}
              </div>
              <button type="button" class="wb-more-link" onclick="goTo('tasks')">查看全部</button>
            </div>
          </div>
          <div class="wb-todo-list">
            ${preview.length
              ? preview.map(renderWorkbenchTodoCard).join('')
              : `<div class="wb-empty">近一周暂无待办（按开始日期），继续保持！</div>`}
          </div>
        </div>
        <div>
          ${renderWorkbenchProjectFocusSection()}
        </div>
      </div>
    </div>
  `;
}

function renderDashboard() {
  return renderWorkbenchHome();
}
