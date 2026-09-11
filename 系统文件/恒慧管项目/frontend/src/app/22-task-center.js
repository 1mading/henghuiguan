// ========== 任务中心 ==========
const TEMP_PROJECT_GROUP_KEY = '__temp__';
const INFORM_COLLAB_GROUP_KEY = '__inform__';

/** 本人为告知协办（非负责人）的任务 */
function isMyInformCollabTask(task) {
  if (!task) return false;
  if (isSamePersonName(task.assignee, currentUser.name)) return false;
  return isInformCollaborator(task);
}

/** 任务中心类型：项目 / 临时 / 告知协办 */
function getTodoTaskType(task) {
  if (!task) return 'project';
  if (isMyInformCollabTask(task)) return 'inform';
  if (task.intake || task.type === 'temp' || !task.projectId) return 'temp';
  return 'project';
}

function getTodoTaskTypeLabel(type) {
  if (type === 'temp') return '临时任务';
  if (type === 'inform') return '告知协办';
  return '项目任务';
}

function matchesTodoDueFilter(task, dueFilter) {
  if (!dueFilter || dueFilter === 'all') return true;
  const due = normalizeDateStr(resolveTaskDueDate(task)) || normalizeDateStr(task.dueDate) || '';
  if (dueFilter === 'overdue') return isOverdue(task) && task.status !== 'done' && task.status !== 'paused';
  if (dueFilter === 'today') return !!due && due === todayStr() && task.status !== 'done';
  if (dueFilter === 'week') {
    const { start, end } = getCurrentWeekRange();
    return !!due && due >= start && due <= end && task.status !== 'done';
  }
  return true;
}

/** 列表截止列旁的相对提示 */
function formatTodoDueRelative(task) {
  if (!task || task.status === 'done' || task.status === 'abolished' || task.status === 'archived') {
    return { text: '', cls: '' };
  }
  const due = normalizeDateStr(resolveTaskDueDate(task)) || normalizeDateStr(task.dueDate) || '';
  if (!due) return { text: '', cls: '' };
  if (isOverdue(task)) return { text: '已逾期', cls: 'is-overdue' };
  if (due === todayStr()) return { text: '今天到期', cls: 'is-today' };
  if (isDueSoon(task)) return { text: '即将到期', cls: 'is-soon' };
  return { text: '', cls: '' };
}

function sortTasksForCenter(list) {
  return list.slice().sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
    if (isOverdue(a) && !isOverdue(b)) return -1;
    if (isOverdue(b) && !isOverdue(a)) return 1;
    return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
  });
}

/** 工作台待办：临时任务置顶，组内及其他任务均按截止时间升序（无日期靠后） */
function sortWorkbenchTodos(list) {
  const startKey = (task) => {
    const start = normalizeDateStr(getEffectivePlanStart(task) || task?.planStartDate) || '';
    return start || '9999-12-31';
  };
  const dueKey = (task) => {
    const due = normalizeDateStr(resolveTaskDueDate(task)) || normalizeDateStr(task?.dueDate) || '';
    return due || '9999-12-31';
  };
  return list.slice().sort((a, b) => {
    const aTemp = getTodoTaskType(a) === 'temp' ? 0 : 1;
    const bTemp = getTodoTaskType(b) === 'temp' ? 0 : 1;
    if (aTemp !== bTemp) return aTemp - bTemp;
    const byStart = startKey(a).localeCompare(startKey(b));
    if (byStart !== 0) return byStart;
    const byDue = dueKey(a).localeCompare(dueKey(b));
    if (byDue !== 0) return byDue;
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
  });
}

/** 临时任务 / 告知协办：已完成不在任务中心展示 */
function isHiddenDoneSpecialTask(task) {
  if (!task || task.status !== 'done') return false;
  if (isMyInformCollabTask(task)) return true;
  return !task.projectId;
}

/** 任务中心顶部：按具体项目筛选/跳转（告知协办单独成区，不计入项目/临时下拉） */
function getTaskCenterProjectTabs(baseTasks) {
  const visibleBase = baseTasks.filter(t => !isHiddenDoneSpecialTask(t));
  const counts = new Map();
  visibleBase.forEach(t => {
    if (isMyInformCollabTask(t)) return;
    const key = t.projectId || TEMP_PROJECT_GROUP_KEY;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const tabs = [{ id: 'all', label: '全部', count: visibleBase.length, icon: 'fa-list', isTemp: false }];
  const projectTabs = [];
  counts.forEach((count, key) => {
    if (key === TEMP_PROJECT_GROUP_KEY) return;
    const project = projects.find(p => p.id === key);
    projectTabs.push({
      id: key,
      label: project?.name || '未知项目',
      count,
      icon: 'fa-folder',
      isTemp: false,
    });
  });
  projectTabs.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
  tabs.push(...projectTabs);

  if (counts.has(TEMP_PROJECT_GROUP_KEY)) {
    tabs.push({
      id: TEMP_PROJECT_GROUP_KEY,
      label: '临时任务',
      count: counts.get(TEMP_PROJECT_GROUP_KEY),
      icon: 'fa-bolt',
      isTemp: true,
    });
  }
  return tabs;
}

function setTaskProjectTab(tabId) {
  state.taskTab = tabId || 'all';
  state.todoPage = 1;
  render();
}

function openTaskCenterProject(projectId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  viewProject(projectId);
}

/** 待办快捷操作按钮（工作台卡片 / 任务列表共用） */
function buildTodoQuickActionButtons(task) {
  return getTodoActionMenuItems(task).map(item =>
    `<button type="button" class="btn btn-icon${item.mod ? ' ' + item.mod : ''}" title="${escapeHtml(item.label)}" onclick="event.stopPropagation();${item.run}"><i class="fas ${item.icon}"></i></button>`
  );
}

/** 任务操作菜单项（开始/暂停/完成/留言/编辑/作废） */
function getTodoActionMenuItems(task) {
  if (!task) return [];
  const items = [];
  const canOp = typeof canOperateTask === 'function' && canOperateTask(task);
  const blocked = typeof hasHardBlock === 'function' && hasHardBlock(task);
  const hasKids = typeof hasActiveChildren === 'function' && hasActiveChildren(task.id);
  const isMs = typeof isMilestoneTask === 'function' && isMilestoneTask(task);
  if (!isMs && canOp && !blocked && !hasKids) {
    if (task.status === 'todo') {
      items.push({ label: '开始', icon: 'fa-play', mod: 'is-primary', run: `runTodoAction('${task.id}','doing')` });
      items.push({ label: '暂停', icon: 'fa-pause', mod: 'is-warning', run: `runTodoAction('${task.id}','paused')` });
    } else if (task.status === 'doing') {
      items.push({ label: '暂停', icon: 'fa-pause', mod: 'is-warning', run: `runTodoAction('${task.id}','paused')` });
      items.push({ label: '完成', icon: 'fa-check', mod: 'is-success', run: `runTodoAction('${task.id}','done')` });
    } else if (task.status === 'paused') {
      items.push({ label: '继续', icon: 'fa-play', mod: 'is-primary', run: `runTodoAction('${task.id}','doing')` });
    }
  }
  if (typeof canPostTaskComment === 'function' && canPostTaskComment(task)) {
    items.push({ label: '留言', icon: 'fa-comment', mod: '', run: `runTodoAction('${task.id}','comment')` });
  }
  if (typeof canEditTask === 'function' && canEditTask(task)) {
    items.push({ label: '编辑', icon: 'fa-pen', mod: '', run: `runTodoAction('${task.id}','edit')` });
  }
  if (typeof canAbolishTask === 'function' && canAbolishTask(task)
    && task.status !== 'abolished' && task.status !== 'archived' && task.status !== 'done') {
    items.push({ label: '作废', icon: 'fa-trash-alt', mod: 'is-danger', run: `runTodoAction('${task.id}','abolish')` });
  }
  return items;
}

function toggleTodoActionMenu(taskId, ev) {
  if (ev) ev.stopPropagation();
  const next = state.todoActionMenuTaskId === taskId ? null : taskId;
  state.todoActionMenuTaskId = next;
  if (next) {
    state.settingsOpen = false;
    state.inboxOpen = false;
    setTimeout(() => {
      document.addEventListener('click', closeTodoActionMenuOnOutside, { once: true });
    }, 0);
  }
  render();
}

function closeTodoActionMenu() {
  if (!state.todoActionMenuTaskId) return;
  state.todoActionMenuTaskId = null;
  render();
}

function closeTodoActionMenuOnOutside() {
  if (state.todoActionMenuTaskId) closeTodoActionMenu();
}

function runTodoAction(taskId, action) {
  state.todoActionMenuTaskId = null;
  if (action === 'comment') {
    focusTaskComment(taskId);
    return;
  }
  if (action === 'edit') {
    editTask(taskId);
    return;
  }
  if (action === 'abolish') {
    abolishTask(taskId);
    return;
  }
  updateTaskStatus(taskId, action);
}

/** 待办操作下拉（任务中心看板/列表） */
function renderTodoActionDropdown(task) {
  const items = getTodoActionMenuItems(task);
  if (!items.length) return '';
  const open = state.todoActionMenuTaskId === task.id;
  return `
    <div class="todo-action-menu" onclick="event.stopPropagation()">
      <button type="button" class="btn btn-ghost btn-sm todo-action-menu-btn" onclick="toggleTodoActionMenu('${task.id}', event)">
        操作 <i class="fas fa-caret-down"></i>
      </button>
      ${open ? `
        <div class="todo-action-menu-panel">
          ${items.map(item => `
            <button type="button" class="todo-action-menu-item${item.mod ? ' ' + item.mod : ''}" onclick="${item.run}">
              <i class="fas ${item.icon}"></i><span>${escapeHtml(item.label)}</span>
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/** 待办行内快捷操作（权限与详情页一致） */
function renderTodoRowQuickActions(task) {
  const html = renderTodoActionDropdown(task);
  if (!html) return '<td class="col-actions" onclick="event.stopPropagation()"></td>';
  return `<td class="col-actions" onclick="event.stopPropagation()">${html}</td>`;
}

function setTodoViewLayout(layout) {
  state.todoViewLayout = layout === 'list' ? 'list' : 'board';
  if (state.todoViewLayout === 'list' && (state.todoListTab === 'done' || state.todoListTab === 'paused')) {
    state.todoListTab = 'all';
  }
  render();
}

function handleTodoBoardDrop(event, newStatus) {
  event.preventDefault();
  const col = event.currentTarget;
  if (col) col.classList.remove('is-drop-target');
  const taskId = event.dataTransfer.getData('text/taskId');
  if (!taskId) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!canOperateTask(task)) {
    alert('无权修改该任务状态');
    return;
  }
  if (isMilestoneTask(task)) {
    alert('里程碑请在详情中操作完成');
    return;
  }
  if (hasActiveChildren(task.id)) {
    alert('存在未完成的下级任务，无法直接改状态');
    return;
  }
  if (hasHardBlock(task) && (newStatus === 'doing' || newStatus === 'done')) {
    alert('任务被前置依赖阻塞，无法开始或完成');
    return;
  }
  if (task.status === newStatus) return;
  updateTaskStatus(taskId, newStatus);
}

function renderTodoBoardCard(task) {
  const overdue = isOverdue(task) && task.status !== 'done';
  const dueSoon = !overdue && isDueSoon(task) && task.status !== 'done';
  const dueRaw = normalizeDateStr(resolveTaskDueDate(task)) || task.dueDate || '';
  const dueLabel = formatTodoBoardDate(dueRaw) || dueRaw || '-';
  const canDrag = canOperateTask(task) && !isMilestoneTask(task);
  const parts = getTaskCenterDisplayParts(task);
  const submitterName = typeof displayTaskSubmitterName === 'function' ? displayTaskSubmitterName(task) : '';
  const systemName = typeof getIntakeSystemName === 'function' ? getIntakeSystemName(task) : '';
  const actionMenu = renderTodoActionDropdown(task);
  return `
    <div class="todo-board-card${overdue ? ' is-overdue' : ''}${dueSoon ? ' is-duesoon' : ''}"
      draggable="${canDrag ? 'true' : 'false'}"
      ondragstart="event.dataTransfer.setData('text/taskId','${task.id}')"
      onclick="viewTask('${task.id}')">
      <div class="todo-board-card-top">
        <div class="todo-board-card-title">
          ${task.projectId ? `<span class="todo-board-card-title-proj">${escapeHtml(parts.projectLabel)}</span>` : ''}
          <span class="todo-board-card-title-main">${escapeHtml(parts.title)}</span>
        </div>
        ${actionMenu ? `<div class="todo-board-card-actions">${actionMenu}</div>` : ''}
      </div>
      <div class="todo-board-card-footer">
        <span class="todo-board-date">${escapeHtml(dueLabel)}</span>
        ${systemName ? `<span class="todo-board-submitter" title="系统"><i class="fas fa-server"></i> ${escapeHtml(systemName)}</span>` : ''}
        ${submitterName ? `<span class="todo-board-submitter" title="提单人"><i class="fas fa-user"></i> ${escapeHtml(submitterName)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderTodoBoardView(list) {
  const columns = [
    { key: 'todo', label: '待开始', color: '#6366F1', icon: 'fa-circle', match: t => t.status === 'todo' },
    { key: 'doing', label: '进行中', color: '#8B5CF6', icon: 'fa-spinner', match: t => t.status === 'doing' },
    { key: 'paused', label: '已暂停', color: '#6B7280', icon: 'fa-pause-circle', match: t => t.status === 'paused' },
    { key: 'done', label: '已完成', color: '#10B981', icon: 'fa-check-circle', match: t => t.status === 'done' },
    { key: 'other', label: '其他', color: '#D97706', icon: 'fa-ellipsis-h', match: t => !['todo', 'doing', 'paused', 'done'].includes(t.status) },
  ];
  const visibleCols = columns.map(col => ({
    ...col,
    tasks: sortTasksForCenter(list.filter(col.match)),
  })).filter(col => {
    if (col.key === 'other') return col.tasks.length > 0 || list.some(t => !['todo', 'doing', 'paused', 'done'].includes(t.status));
    if (col.key === 'paused') return col.tasks.length > 0 || list.some(t => t.status === 'paused');
    return true;
  });

  if (!list.length) {
    return renderEmptyState({ icon: 'fa-check-circle', title: '暂无任务', hint: '当前筛选下没有任务' });
  }

  return `
    <div class="todo-status-kanban" style="--todo-kanban-cols:${Math.max(visibleCols.length, 1)};">
      ${visibleCols.map(col => `
        <div class="todo-kanban-col"
          ondragover="event.preventDefault();this.classList.add('is-drop-target')"
          ondragleave="this.classList.remove('is-drop-target')"
          ondrop="${col.key === 'other' ? `event.preventDefault();this.classList.remove('is-drop-target')` : `handleTodoBoardDrop(event, '${col.key}')`}">
          <div class="todo-kanban-col-head">
            <i class="fas ${col.icon}" style="color:${col.color};"></i>
            <span class="col-label">${col.label}</span>
            <span class="col-count" style="background:${col.color};">${col.tasks.length}</span>
          </div>
          ${col.tasks.length ? col.tasks.map(renderTodoBoardCard).join('') : `<div class="todo-kanban-empty">暂无</div>`}
        </div>
      `).join('')}
    </div>
  `;
}

function renderTasks() {
  const scopeTab = state.taskScopeTab || 'mine';
  const isDeptScope = scopeTab === 'dept' && canViewDeptTaskScope();
  const viewLayout = state.todoViewLayout === 'list' ? 'list' : 'board';
  const includeDone = viewLayout === 'board';
  const poolTasks = getTaskCenterBaseTasks({ includeDone })
    .filter(t => t.status !== 'abolished' && t.status !== 'archived' && !isHiddenDoneSpecialTask(t));
  const projectTabs = getTaskCenterProjectTabs(poolTasks);
  const validTabIds = new Set(projectTabs.map(t => t.id));
  let projectTab = state.taskTab || 'all';
  if (!validTabIds.has(projectTab)) {
    if (projectTab === 'temp') projectTab = TEMP_PROJECT_GROUP_KEY;
    else projectTab = 'all';
    state.taskTab = projectTab;
  }

  let list = poolTasks.slice();
  if (state.taskSearch) {
    const q = state.taskSearch.toLowerCase();
    list = list.filter(t => {
      const parent = t.parentId ? tasks.find(pt => pt.id === t.parentId) : null;
      const projectLabel = getTaskProjectLabel(t).toLowerCase();
      return (t.title || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q) ||
        (t.assignee || '').toLowerCase().includes(q) ||
        projectLabel.includes(q) ||
        (parent && (parent.title || '').toLowerCase().includes(q));
    });
  }

  if (projectTab === TEMP_PROJECT_GROUP_KEY || projectTab === 'temp') {
    list = list.filter(t => !t.projectId || isMyInformCollabTask(t));
  } else if (projectTab !== 'all' && projectTab !== 'normal') {
    list = list.filter(t => t.projectId === projectTab || (isMyInformCollabTask(t) && t.projectId === projectTab));
  }

  if (state.todoTypeFilter === 'project') list = list.filter(t => getTodoTaskType(t) === 'project');
  else if (state.todoTypeFilter === 'temp') list = list.filter(t => getTodoTaskType(t) === 'temp');
  else if (state.todoTypeFilter === 'inform') list = list.filter(t => getTodoTaskType(t) === 'inform');

  if (state.todoPriorityFilter && state.todoPriorityFilter !== 'all') {
    list = list.filter(t => (t.priority || 'normal') === state.todoPriorityFilter);
  }
  list = list.filter(t => matchesTodoDueFilter(t, state.todoDueFilter));

  const countAll = list.length;
  const countTodo = list.filter(t => t.status === 'todo').length;
  const countDoing = list.filter(t => t.status === 'doing').length;
  const countPaused = list.filter(t => t.status === 'paused').length;
  const countOverdue = list.filter(t => isOverdue(t) && t.status !== 'done' && t.status !== 'paused').length;
  const countDone = list.filter(t => t.status === 'done').length;

  let listTab = state.todoListTab || 'all';
  if ((listTab === 'done' || listTab === 'paused') && viewLayout !== 'board') {
    listTab = 'all';
    state.todoListTab = 'all';
  }
  if (listTab === 'todo') list = list.filter(t => t.status === 'todo');
  else if (listTab === 'doing') list = list.filter(t => t.status === 'doing');
  else if (listTab === 'paused') list = list.filter(t => t.status === 'paused');
  else if (listTab === 'overdue') list = list.filter(t => isOverdue(t) && t.status !== 'done' && t.status !== 'paused');
  else if (listTab === 'done') list = list.filter(t => t.status === 'done');

  list = sortTasksForCenter(list);

  const pageSize = state.todoPageSize || 20;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (state.todoPage > totalPages) state.todoPage = totalPages;
  if (state.todoPage < 1) state.todoPage = 1;
  const page = state.todoPage;
  const pageRows = list.slice((page - 1) * pageSize, page * pageSize);

  const scopePool = (arr) => (arr || []).filter(t => !isHiddenDoneSpecialTask(t) && !shouldHideMilestoneLikeTask(t));
  const allScopeCount = scopePool(getAllViewableLeafTasks({ includeDone })).length;
  const mineCount = scopePool(includeDone ? getMyTodoLeafTasksIncludingDone() : getMyTodoLeafTasks()).length;
  const deptCount = canViewDeptTaskScope()
    ? scopePool(includeDone
      ? getDeptScopeLeafTasks()
      : getDeptScopeLeafTasks().filter(t => !isExcludedFromTodo(t))).length
    : 0;

  const pageButtons = [];
  for (let i = 1; i <= totalPages && i <= 7; i++) {
    pageButtons.push(`<button type="button" class="todo-page-btn${i === page ? ' active' : ''}" onclick="setTodoPage(${i})">${i}</button>`);
  }

  const viewMode = state.todoViewMode || 'all';
  const summaryItems = [
    { key: 'todo', label: '待开始', count: countTodo, color: '#6366F1' },
    { key: 'doing', label: '进行中', count: countDoing, color: '#8B5CF6' },
    { key: 'overdue', label: '已延期', count: countOverdue, color: '#F59E0B' },
  ];
  if (viewLayout === 'board') {
    summaryItems.splice(2, 0, { key: 'paused', label: '已暂停', count: countPaused, color: '#6B7280' });
    summaryItems.push({ key: 'done', label: '已完成', count: countDone, color: '#10B981' });
  }

  return `
    <div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <div class="scope-seg" style="margin-bottom:12px;">
            <button type="button" class="${viewMode === 'all' ? 'active' : ''}" onclick="goToTodoView('all')">全部</button>
            <button type="button" class="${viewMode === 'mine' ? 'active' : ''}" onclick="goToTodoView('mine')">与我相关</button>
            <button type="button" class="${viewMode === 'created' ? 'active' : ''}" onclick="goToTodoView('created')">我发起的</button>
            <button type="button" class="${viewMode === 'handled' ? 'active' : ''}" onclick="goToTodoView('handled')">我处理的</button>
          </div>
          <div class="todo-tabs">
            <button type="button" class="todo-tab${listTab === 'all' ? ' active' : ''}" onclick="setTodoListTab('all')">全部 <span class="count">(${countAll})</span></button>
            <button type="button" class="todo-tab${listTab === 'todo' ? ' active' : ''}" onclick="setTodoListTab('todo')">待开始 <span class="count">(${countTodo})</span></button>
            <button type="button" class="todo-tab${listTab === 'doing' ? ' active' : ''}" onclick="setTodoListTab('doing')">进行中 <span class="count">(${countDoing})</span></button>
            ${viewLayout === 'board' ? `<button type="button" class="todo-tab${listTab === 'paused' ? ' active' : ''}" onclick="setTodoListTab('paused')">已暂停 <span class="count">(${countPaused})</span></button>` : ''}
            <button type="button" class="todo-tab${listTab === 'overdue' ? ' active' : ''}" onclick="setTodoListTab('overdue')">已延期 <span class="count">(${countOverdue})</span></button>
            ${viewLayout === 'board' ? `<button type="button" class="todo-tab${listTab === 'done' ? ' active' : ''}" onclick="setTodoListTab('done')">已完成 <span class="count">(${countDone})</span></button>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${canViewDeptTaskScope() && (viewMode === 'all' || viewMode === 'mine') ? `
          <div class="scope-seg">
            <button type="button" class="${scopeTab === 'mine' ? 'active' : ''}" onclick="setTaskScopeTab('mine')"><i class="fas fa-globe" style="margin-right:6px;"></i>${viewMode === 'all' ? '全量' : '本人'} ${viewMode === 'all' ? allScopeCount : mineCount}</button>
            <button type="button" class="${scopeTab === 'dept' ? 'active' : ''}" onclick="setTaskScopeTab('dept')"><i class="fas fa-users" style="margin-right:6px;"></i>部门 ${deptCount}</button>
          </div>` : ''}
          <div class="todo-view-toggle">
            <button type="button" class="${viewLayout === 'list' ? 'active' : ''}" onclick="setTodoViewLayout('list')" title="列表"><i class="fas fa-list"></i> 列表</button>
            <button type="button" class="${viewLayout === 'board' ? 'active' : ''}" onclick="setTodoViewLayout('board')" title="看板"><i class="fas fa-columns"></i> 看板</button>
          </div>
        </div>
      </div>

      ${isDeptScope && isFullAccess(currentUser.role) ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${getTaskCenterDeptOptions().map(opt => `
          <button type="button" onclick="setTaskCenterDept('${opt.id}')" style="padding:6px 14px;border-radius:16px;font-size:12px;font-weight:500;border:1px solid ${getActiveTaskCenterDept() === opt.id ? 'var(--brand)' : 'var(--border)'};background:${getActiveTaskCenterDept() === opt.id ? 'var(--brand-soft)' : '#fff'};color:${getActiveTaskCenterDept() === opt.id ? 'var(--brand-dark)' : 'var(--text-muted)'};cursor:pointer;">
            ${opt.label}
          </button>
        `).join('')}
      </div>` : ''}

      <div class="todo-status-summary">
        ${summaryItems.map(item => `
          <button type="button" class="todo-status-summary-item${listTab === item.key ? ' active' : ''}" onclick="setTodoListTab('${item.key}')">
            <span class="todo-status-summary-dot" style="background:${item.color};"></span>
            <span>${item.label}</span>
            <span class="todo-status-summary-num">${item.count}</span>
          </button>
        `).join('')}
      </div>

      <div class="todo-filter-bar">
        <div class="todo-field todo-field-grow">
          <i class="fas fa-search"></i>
          <input type="text" placeholder="请输入任务标题" value="${escapeHtml(state.taskSearch || '')}"
            onchange="state.taskSearch=this.value;state.todoPage=1;render()" />
        </div>
        <div class="todo-field">
          <select onchange="state.todoTypeFilter=this.value;state.todoPage=1;render()">
            <option value="all" ${state.todoTypeFilter === 'all' ? 'selected' : ''}>全部类型</option>
            <option value="project" ${state.todoTypeFilter === 'project' ? 'selected' : ''}>项目任务</option>
            <option value="temp" ${state.todoTypeFilter === 'temp' ? 'selected' : ''}>临时任务</option>
            <option value="inform" ${state.todoTypeFilter === 'inform' ? 'selected' : ''}>告知协办</option>
          </select>
        </div>
        <div class="todo-field">
          <select onchange="setTaskProjectTab(this.value);state.todoPage=1;">
            ${projectTabs.map(tab => `<option value="${escapeHtml(String(tab.id))}" ${projectTab === tab.id ? 'selected' : ''}>${escapeHtml(tab.label)}（${tab.count}）</option>`).join('')}
          </select>
        </div>
        <div class="todo-field">
          <select onchange="state.todoPriorityFilter=this.value;state.todoPage=1;render()">
            <option value="all" ${state.todoPriorityFilter === 'all' ? 'selected' : ''}>全部优先级</option>
            <option value="urgent" ${state.todoPriorityFilter === 'urgent' ? 'selected' : ''}>紧急</option>
            <option value="important" ${state.todoPriorityFilter === 'important' ? 'selected' : ''}>重要</option>
            <option value="normal" ${state.todoPriorityFilter === 'normal' ? 'selected' : ''}>普通</option>
          </select>
        </div>
        <div class="todo-field">
          <select onchange="state.todoDueFilter=this.value;state.todoPage=1;render()">
            <option value="all" ${state.todoDueFilter === 'all' ? 'selected' : ''}>全部到期</option>
            <option value="today" ${state.todoDueFilter === 'today' ? 'selected' : ''}>今天</option>
            <option value="week" ${state.todoDueFilter === 'week' ? 'selected' : ''}>本周</option>
            <option value="overdue" ${state.todoDueFilter === 'overdue' ? 'selected' : ''}>已延期</option>
          </select>
        </div>
        <button type="button" class="btn btn-ghost" onclick="resetTodoFilters()"><i class="fas fa-rotate-right"></i> 重置</button>
      </div>

      <div class="project-list-count">共 ${list.length} 条</div>
      ${viewLayout === 'board' ? `
      <div class="todo-board-wrap">${renderTodoBoardView(list)}</div>
      ` : `
      <div class="todo-list-card">
        <div class="wb-todo-list">
          ${pageRows.length
            ? pageRows.map(renderWorkbenchTodoCard).join('')
            : `<div class="wb-empty">暂无任务</div>`}
        </div>
        <div class="todo-pager">
          <div class="todo-pager-info">共 ${list.length} 条</div>
          <div class="todo-pager-controls">
            <button type="button" class="todo-page-btn" ${page <= 1 ? 'disabled' : ''} onclick="setTodoPage(${page - 1})"><i class="fas fa-chevron-left"></i></button>
            ${pageButtons.join('')}
            <button type="button" class="todo-page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="setTodoPage(${page + 1})"><i class="fas fa-chevron-right"></i></button>
            <select class="todo-page-btn" style="width:auto;padding:0 8px;" onchange="setTodoPageSize(this.value)">
              <option value="20" ${pageSize === 20 ? 'selected' : ''}>20 条/页</option>
              <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 条/页</option>
            </select>
          </div>
        </div>
      </div>
      `}
    </div>
  `;
}

const systemUpdateTypeMap = {
  feature: { icon: 'fa-star', color: '#059669', label: '新功能' },
  fix: { icon: 'fa-wrench', color: '#DC2626', label: '修复' },
  improve: { icon: 'fa-magic', color: '#2563EB', label: '优化' },
};

function renderSystemUpdateItems(items) {
  return (items || []).map(item => {
    const t = systemUpdateTypeMap[item.type] || systemUpdateTypeMap.improve;
    return `<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;font-size:14px;color:var(--text);">
      <span style="flex-shrink:0;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;background:${t.color}15;color:${t.color};white-space:nowrap;"><i class="fas ${t.icon}" style="margin-right:4px;"></i>${t.label}</span>
      <span style="line-height:1.6;padding-top:2px;">${escapeHtml(item.text || '')}</span>
    </li>`;
  }).join('');
}

function renderSystemUpdates() {
  let list = state.systemUpdatesList || [];
  if (state.systemUpdateSearch) {
    const q = state.systemUpdateSearch.toLowerCase();
    list = list.filter(u =>
      (u.version && u.version.toLowerCase().includes(q)) ||
      (u.title && u.title.toLowerCase().includes(q)) ||
      (u.summary && u.summary.toLowerCase().includes(q)) ||
      (u.items || []).some(i => (i.text || '').toLowerCase().includes(q))
    );
  }

  return `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:#FFFBEB;border-radius:20px;">
          <i class="fas fa-bullhorn" style="color:#D97706;"></i>
          <span style="font-size:13px;font-weight:500;color:#B45309;">共 ${list.length} 个版本记录</span>
        </div>
        <div style="position:relative;">
          <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9CA3AF;font-size:13px;"></i>
          <input class="input search-input-wide" style="width:280px;padding-left:36px;" placeholder="搜索版本、标题、更新内容..." value="${state.systemUpdateSearch || ''}" onchange="state.systemUpdateSearch=this.value;render()">
        </div>
      </div>
      <p class="content-intro" style="margin-bottom:16px;"><i class="fas fa-info-circle" style="margin-right:6px;"></i>系统更新记录仅供查看，由运维在发版时写入；停留本页时约每 30 秒自动刷新。</p>
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${list.map(u => `
          <div class="panel">
            <div class="panel-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <span class="panel-title"><i class="fas fa-tag" style="color:#D97706;margin-right:6px;"></i>${escapeHtml(u.title || ('v' + u.version))}</span>
              <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:#9CA3AF;">
                <span style="padding:2px 10px;background:#FEF3C7;color:#B45309;border-radius:12px;font-weight:600;">v${escapeHtml(u.version)}</span>
                <span><i class="fas fa-calendar-alt" style="margin-right:4px;"></i>${escapeHtml(u.releaseDate || '')}</span>
              </div>
            </div>
            <div class="panel-body">
              ${u.summary ? `<p style="font-size:14px;color:#4B5563;margin-bottom:12px;line-height:1.6;">${escapeHtml(u.summary)}</p>` : ''}
              ${(u.items || []).length ? `<ul style="list-style:none;padding:0;margin:0;">${renderSystemUpdateItems(u.items)}</ul>` : '<p style="color:#9CA3AF;font-size:13px;">暂无详细条目</p>'}
            </div>
          </div>
        `).join('')}
        ${list.length === 0 ? `
          <div class="panel">
            <div class="panel-body" style="padding:12px;">
              ${renderEmptyState({ icon: 'fa-bullhorn', title: '暂无系统更新记录', hint: '发版说明会展示在这里' })}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}
