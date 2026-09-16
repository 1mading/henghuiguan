// ========== 操作函数 ==========
async function goTo(page, opts = {}) {
  if (page === 'performance' || page === 'workReports') {
    page = 'dashboard';
  }
  if (page === 'handaOm') {
    openHandaOmExternal();
    return;
  }
  state.todoActionMenuTaskId = null;
  if (page === 'nccMonitor' && !capOn(currentUser, 'nav.ncc')) {
    page = 'dashboard';
  }
  if (page === 'sqlTools' && !capOn(currentUser, 'nav.sqlTools')) {
    page = 'dashboard';
  }
  if (page === 'textPolish' && !capOn(currentUser, 'nav.textPolish')) {
    page = 'dashboard';
  }
  if (page === 'dataSecurity' && !capOn(currentUser, 'nav.dataSecurity')) {
    page = 'dashboard';
  }
  if (page === 'permissions' && !canAccessPermissionsPage()) {
    page = 'dashboard';
  }
  if (page === 'kpiPlans' && !canAccessKpiPlans()) {
    page = 'dashboard';
  }
  state.page = page;
  state.settingsOpen = false;
  state.projectDetailMoreOpen = false;
  state.uiScrollMain = 0;
  state.uiScrollWindow = 0;
  if (page === 'permissions') {
    loadPermissionsPage();
  }
  if (page === 'dataSecurity') {
    loadDataSecurityOverview();
  }
  if (page === 'textPolish') {
    loadTextPolishOptions();
  }
  if (page === 'kpiPlans' && ApiConfig.enabled && authSession.token) {
    await KpiPlanService.load(state.kpiYearMonth);
  }
  if (page === 'projects' && ApiConfig.enabled && authSession.token && !opts.skipReload) {
    if (!DataService._saveTimer && !DataService._syncing) {
      await DataService.loadFromServer();
    }
  }
  if (page === 'systemUpdates' && ApiConfig.enabled && authSession.token) {
    await SystemUpdateService.loadAll();
  }
  LiveRefresh.ensure();
  render();
}

async function dismissSystemUpdateModal() {
  const pending = state.pendingSystemUpdates || [];
  const latest = pending.length ? pending[pending.length - 1].version : null;
  await SystemUpdateService.markRead(latest);
  state.pendingSystemUpdates = [];
  state.showModal = null;
  render();
}

async function switchUser(userId) {
  await AuthService.loginDemo(userId);
  await SystemUpdateService.checkPending();
  render();
}

function closeModal() {
  hideTaskCommentMentionDropdown();
  closeImageLightbox();
  state.collabDropdownOpen = null;
  const wikiReturn = state.showModal === 'wikiDocPicker' ? state._wikiPickerReturn : null;
  if (!(wikiReturn && wikiReturn.kind === 'delivery')) {
    state.editingDeliveryTaskId = null;
    state.deliveryForm = null;
    state.inlineDeliveryEditId = null;
  }
  state.taskEditInline = false;
  // 关闭前不要用可能已是 0 的主区滚动覆盖记忆；保留 open 时记下的位置
  if (wikiReturn) {
    if (wikiReturn.kind === 'delivery') restoreWikiPickerDeliveryReturn(wikiReturn);
    else restoreWikiPickerReturnForm();
    render();
    return;
  }
  if (state.showModal === 'quickCreate') {
    clearQuickCreatePendingAttachments(state.form);
  }
  if (state.returnToTaskId) {
    const taskId = state.returnToTaskId;
    state.returnToTaskId = null;
    state.form = { taskId };
    state.showModal = 'taskDetail';
    render();
    return;
  }
  if (state.returnToMemberId) {
    const memberUserId = state.returnToMemberId;
    state.returnToMemberId = null;
    state.form = { memberUserId };
    state.showModal = 'memberKanban';
    state.taskViewStack = [];
    render();
    return;
  }
  state.taskViewStack = [];
  const projectId = state.prevProjectId || state.form.projectId;
  state.prevProjectId = null;
  const keepMain = Number(state.uiScrollMain) || 0;
  const keepWindow = Number(state.uiScrollWindow) || 0;
  state.showModal = null;
  if (projectId && state.page === 'projectDetail') {
    state.form = { projectId };
  } else {
    state.form = {};
  }
  render();
  // 关闭弹窗后再补一次，避免重绘/焦点把位置冲回顶部
  if (keepMain > 0 || keepWindow > 0) {
    state.uiScrollMain = keepMain;
    state.uiScrollWindow = keepWindow;
    restoreUiScrollPositions({
      mainContent: keepMain,
      windowY: keepWindow,
      modalBox: 0,
      modalBody: 0,
    });
  }
}

// 更新计划截止日期
function updateEndDate() {
  const startDate = state.form.planStartDate;
  const hours = state.form.estimatedHours;
  if (startDate && hours && hours > 0) {
    const endDate = calcEndDate(startDate, hours, state.form.dailyHours);
    state.form.dueDate = endDate; // dueDate 自动设置为计划截止日期
    const endDateInput = document.getElementById('autoEndDate');
    if (endDateInput) endDateInput.value = endDate;
  }
}

// 更新任务状态，自动计算实际工时
function updateTaskStatus(taskId, newStatus) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (isTaskProjectPaused(task) && newStatus !== 'paused') {
    alert('所属项目已暂停，请先恢复项目后再变更任务状态');
    return;
  }

  if ((newStatus === 'doing' || newStatus === 'done') && hasHardBlock(task)) {
    alert(getHardBlockAlertMessage(task));
    return;
  }

  if (newStatus === 'done' && isMilestoneTask(task) && !areAllMilestoneTasksDone(task.id)) {
    alert(getMilestoneIncompleteHint(task.id));
    return;
  }

  if (newStatus === 'done' && !isMilestoneTask(task) && hasActiveChildren(task.id)) {
    alert('该任务存在未完成的下级任务，请先完成下级任务。');
    return;
  }

  const oldStatus = task.status;
  const today = todayStr();

  if ((newStatus === 'doing' || newStatus === 'done') && oldStatus !== newStatus) {
    if (!ensureIntakeEstimatedHours(task)) return;
  }

  // 进入进行中：无实际开工日时记录；从暂停恢复时保留原开工日
  if (newStatus === 'doing' && oldStatus !== 'doing' && oldStatus !== 'done') {
    if (!task.actualStartDate) task.actualStartDate = today;
  }

  // 状态变为"已完成"，进度 100% 并记录实际结束时间
  if (newStatus === 'done' && oldStatus !== 'done') {
    // 表单提报可直达完成：补实际开始日以便计算实际工时
    if (isAitableIntakeTask(task) && !task.actualStartDate) task.actualStartDate = today;
    applyTaskDoneFields(task);
  }

  // 更新状态
  task.status = newStatus;

  // 记录日志
  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: statusMap[oldStatus]?.label || oldStatus,
    after: statusMap[newStatus]?.label || newStatus,
    reason: '状态变更',
    project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
  });

  // 更新上级任务进度
  if (task.parentId) {
    updateParentProgress(task.parentId);
  }

  if (newStatus === 'done') {
    onTaskMarkedDone(task);
    onPredecessorTaskCompleted(task);
  } else if (newStatus === 'paused' && oldStatus !== 'paused') {
    onTaskMarkedPaused(task);
  }

  save();

  const returnToMember = state.returnToMemberId;
  if (returnToMember) {
    state.returnToMemberId = null;
    state.form = { memberUserId: returnToMember };
    state.showModal = 'memberKanban';
    state.prevProjectId = null;
    render();
    return;
  }

  // 关闭弹窗，刷新页面
  state.showModal = null;
  state.form = state.prevProjectId ? { projectId: state.prevProjectId } : {};
  state.prevProjectId = null;
  render();
}

function quickUpdateProgress(taskId, progress) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !canQuickUpdateProgress(task)) return;

  const newProgress = Math.max(0, Math.min(100, parseInt(progress, 10) || 0));
  const oldProgress = task.progress || 0;
  if (newProgress === oldProgress) return;

  task.progress = newProgress;
  if (newProgress === 100 && task.status !== 'done') {
    if (hasHardBlock(task)) {
      alert(getHardBlockAlertMessage(task));
      task.progress = oldProgress;
      render();
      return;
    }
    if (isMilestoneTask(task) && !areAllMilestoneTasksDone(task.id)) {
      alert(getMilestoneIncompleteHint(task.id));
      task.progress = oldProgress;
      render();
      return;
    }
    if (!isMilestoneTask(task) && hasActiveChildren(task.id)) {
      alert('该任务存在未完成的下级任务，请先完成下级任务。');
      task.progress = oldProgress;
      render();
      return;
    }
    if (!ensureIntakeEstimatedHours(task)) {
      task.progress = oldProgress;
      render();
      return;
    }
    if (isAitableIntakeTask(task) && !task.actualStartDate) task.actualStartDate = todayStr();
    applyTaskDoneFields(task);
    task.status = 'done';
    onTaskMarkedDone(task);
    onPredecessorTaskCompleted(task);
  } else if (newProgress > 0 && task.status === 'todo') {
    if (hasHardBlock(task)) {
      alert(getHardBlockAlertMessage(task));
      task.progress = oldProgress;
      render();
      return;
    }
    if (!ensureIntakeEstimatedHours(task)) {
      task.progress = oldProgress;
      render();
      return;
    }
    task.actualStartDate = task.actualStartDate || todayStr();
    task.status = 'doing';
  }

  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: oldProgress + '%',
    after: newProgress + '%',
    reason: '快捷更新进度',
    project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
  });

  if (task.parentId) updateParentProgress(task.parentId);
  save();
  state.showModal = 'taskDetail';
  state.form = { taskId };
  render();
}

// 递归更新上级任务进度（按子任务进度比例平均）；里程碑状态随下属任务自动同步
function updateParentProgress(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (isMilestoneTask(task)) {
    applyDerivedMilestoneStatus(task);
    if (task.parentId) updateParentProgress(task.parentId);
    return;
  }

  const activeChildren = tasks.filter(t => t.parentId === taskId && t.status !== 'abolished');
  if (activeChildren.length > 0) {
    task.progress = calcProgress(taskId);

    // 任意未作废子任务已开始/已完成，且上级仍为待开始 → 自动开始
    const anyChildStarted = activeChildren.some(
      c => c.status === 'doing' || c.status === 'done'
    );
    if (anyChildStarted && task.status === 'todo') {
      task.status = 'doing';
      task.actualStartDate = task.actualStartDate || todayStr();
    }

    const allChildrenDone = activeChildren.every(c => c.status === 'done');
    if (allChildrenDone && task.progress === 100 && task.status !== 'done' && task.status !== 'archived' && task.status !== 'abolished') {
      applyTaskDoneFields(task);
      task.status = 'done';
      onTaskMarkedDone(task);
    }

    if (task.parentId) {
      updateParentProgress(task.parentId);
    }
  } else {
    const hadChildren = tasks.some(t => t.parentId === taskId);
    if (hadChildren) task.progress = 0;
    if (task.parentId) {
      updateParentProgress(task.parentId);
    }
  }
}

function cancelAndGoBack() {
  state.taskEditInline = false;
  state.inlineDeliveryEditId = null;
  if (state.returnToTaskId) {
    const taskId = state.returnToTaskId;
    state.returnToTaskId = null;
    state.form = { taskId };
    state.showModal = 'taskDetail';
    render();
    return;
  }
  if (state.returnToMemberId) {
    const memberUserId = state.returnToMemberId;
    state.returnToMemberId = null;
    state.form = { memberUserId };
    state.showModal = 'memberKanban';
    state.taskViewStack = [];
    render();
    return;
  }
  // 保留项目相关的 form 数据，回到项目详情
  const projectId = state.prevProjectId || state.form.projectId;
  state.prevProjectId = null;
  state.showModal = null;
  state.taskViewStack = [];
  if (projectId && state.page === 'projectDetail') {
    state.form = { projectId };
  } else if (projectId) {
    state.form = { projectId };
  } else {
    state.form = {};
  }
  render();
}

function viewTaskFromTeamKanban(taskId) {
  if (state.showModal === 'memberKanban' && state.form.memberUserId) {
    state.returnToMemberId = state.form.memberUserId;
  }
  viewTask(taskId);
}

/** 打开任务详情；节点间跳转时压入浏览栈，供「返回前一步」；里程碑改走项目执行页签，不再弹详情窗 */
function viewTask(taskId, opts) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || !canViewTask(t)) {
    alert('无权查看该任务');
    return;
  }
  if (isMilestoneTask(t)) {
    openMilestoneInProjectWork(t, opts);
    return;
  }
  rememberMainScrollBeforeModal();
  const skipStack = !!(opts && opts.skipStack);
  if (!Array.isArray(state.taskViewStack)) state.taskViewStack = [];
  if (!skipStack) {
    if (state.showModal === 'taskDetail' && state.form.taskId && state.form.taskId !== taskId) {
      state.taskViewStack.push(state.form.taskId);
    } else if (state.showModal !== 'taskDetail') {
      state.taskViewStack = [];
    }
  }
  // 如果当前在项目详情页且还没有保存prevProjectId，记录projectId以便返回
  if (state.page === 'projectDetail' && !state.prevProjectId) {
    state.prevProjectId = state.form.projectId;
  }
  state.form = { taskId };
  state.showModal = 'taskDetail';
  state.taskDetailTab = 'info';
  render();
}

/** 任务详情：返回前一步（浏览历史 → 上级节点 → 关闭） */
function goBackTaskStep() {
  if (!Array.isArray(state.taskViewStack)) state.taskViewStack = [];
  while (state.taskViewStack.length) {
    const prevId = state.taskViewStack.pop();
    if (prevId && prevId !== state.form.taskId) {
      const prev = tasks.find(x => x.id === prevId);
      if (prev && canViewTask(prev)) {
        viewTask(prevId, { skipStack: true });
        return;
      }
    }
  }
  const task = tasks.find(x => x.id === state.form.taskId);
  if (task && task.parentId) {
    const parent = tasks.find(x => x.id === task.parentId);
    if (parent && canViewTask(parent)) {
      if (isMilestoneTask(parent)) {
        state.showModal = null;
        openMilestoneInProjectWork(parent);
        return;
      }
      viewTask(parent.id, { skipStack: true });
      return;
    }
  }
  closeModal();
}

function viewProject(projectId) {
  const p = projects.find(x => x.id === projectId);
  if (!p || !canViewProject(p)) {
    alert('无权查看该项目');
    return;
  }
  state.prevPage = state.page;
  state.form = { projectId };
  state.detailMilestoneId = '';
  state.editingProjectFocus = false;
  state.editingProjectPlan = false;
  state.projectDetailTab = 'work';
  state.projectDetailMoreOpen = false;
  state.projectPlanView = 'table';
  state.projectChangePage = 1;
  state.deliveryFilter = 'all';
  state.deliveryExpandedId = null;
  state.deliveryExpandedField = null;
  state.deliveryOpenTaskIds = {};
  state.inlineDeliveryEditId = null;
  state.editingDeliveryTaskId = null;
  state.deliveryForm = null;
  state.workViewReturn = null;
  state.planScrollAnchor = null;
  if (!state.detailTaskScope) state.detailTaskScope = 'all';
  state.page = 'projectDetail';
  render();
}

function goBack() {
  let target = state.prevPage || 'projects';
  if (['projectPlan', 'projectChanges', 'milestones', 'logs'].includes(target)) {
    target = 'projects';
  }
  state.prevPage = null;
  state.editingProjectFocus = false;
  state.page = target;
  render();
}

/** 顶栏「恒慧管」：有上一页则返回，否则回工作台 */
function goBreadcrumbHome() {
  if (state.page === 'dashboard') return;
  if (state.page === 'projectDetail' || state.prevPage) {
    goBack();
    return;
  }
  goTo('dashboard');
}

function editTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !canEditTask(task)) {
    alert('您没有编辑该任务的权限');
    return;
  }
  rememberMainScrollBeforeModal();
  if (isMilestoneTask(task)) hydrateMilestonePlanFromDesc(task);
  state.collabDropdownOpen = null;
  state.form = initTaskFormCollaborators(task);
  const hasAdvancedData = !!(
    (task.estimatedHours && Number(task.estimatedHours) > 0) ||
    task.planStartDate ||
    task.dailyHours ||
    (Array.isArray(task.collaboratorEntries) && task.collaboratorEntries.length) ||
    (Array.isArray(task.collaborators) && task.collaborators.length) ||
    getTaskPredecessorDeps(task.id).length
  );
  if (!state.uiSections) state.uiSections = {};
  if (hasAdvancedData) state.uiSections.taskFormAdvanced = true;
  if (state.page === 'projectDetail') {
    state.taskEditInline = true;
    state.showModal = null;
    state.projectDetailTab = 'work';
  } else {
    state.taskEditInline = false;
    state.showModal = 'taskEdit';
  }
  render();
}

function showTempTaskModal() {
  showQuickTempTaskModal();
}

const QUICK_CREATE_MAX_ATTACH_BYTES = 20 * 1024 * 1024;

function clearQuickCreatePendingAttachments(form) {
  const list = form?.pendingAttachments;
  if (!Array.isArray(list)) return;
  list.forEach(entry => {
    if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  });
  form.pendingAttachments = [];
}

function ensureQuickCreatePendingAttachments() {
  if (!Array.isArray(state.form.pendingAttachments)) state.form.pendingAttachments = [];
  return state.form.pendingAttachments;
}

function appendQuickCreatePendingFiles(files) {
  if (!files?.length) return;
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录并连接服务端后上传附件');
    return;
  }
  const pending = ensureQuickCreatePendingAttachments();
  let rejected = 0;
  for (const file of files) {
    if (!file) continue;
    if (file.size > QUICK_CREATE_MAX_ATTACH_BYTES) {
      rejected++;
      continue;
    }
    const isImg = isImageMime(file.type) || isImageFileName(file.name);
    pending.push({
      localId: genId('PA'),
      file,
      previewUrl: isImg ? URL.createObjectURL(file) : null,
    });
  }
  if (rejected) {
    alert(`有 ${rejected} 个文件超过 20MB，已跳过`);
  }
  render();
}

function addQuickCreateFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  appendQuickCreatePendingFiles(files);
}

function removeQuickCreatePendingFile(localId) {
  const pending = ensureQuickCreatePendingAttachments();
  const idx = pending.findIndex(x => x.localId === localId);
  if (idx < 0) return;
  const entry = pending[idx];
  if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  pending.splice(idx, 1);
  render();
}

function handleQuickCreateFilesPaste(event) {
  const files = extractClipboardImageFiles(event);
  if (!files.length) return;
  event.preventDefault();
  appendQuickCreatePendingFiles(files.map(file => {
    const named = clipboardFileName(file, 'paste');
    return new File([file], named, { type: file.type || 'image/png' });
  }));
}

function pickQuickCreateDingTalkDoc() {
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录并连接服务端后添加钉钉文档');
    return;
  }
  showWikiDocPicker('pending', '', { pendingMode: true });
}

function renderQuickCreatePendingFilesHtml() {
  const pending = state.form.pendingAttachments || [];
  if (!pending.length) {
    return `<div style="font-size:12px;color:#9CA3AF;">暂无附件，可上传本地文件、选择钉钉文档或粘贴截图</div>`;
  }
  return `
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${pending.map(entry => {
        const isWiki = entry.kind === 'dingtalk_wiki';
        const name = isWiki ? (entry.name || '钉钉文档') : (entry.file?.name || '未命名');
        const size = entry.file?.size || 0;
        const isImg = !isWiki && !!entry.previewUrl;
        const safeLocalId = String(entry.localId || '').replace(/'/g, "\\'");
        const safeUrl = String(entry.url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-panel);border-radius:6px;border:1px solid var(--border);">
          ${isWiki ? `
            <i class="fas fa-file-alt" style="color:#0089FF;font-size:18px;width:40px;text-align:center;" title="钉钉文档"></i>
          ` : isImg ? `
            <img src="${entry.previewUrl}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">
          ` : `<i class="fas fa-file" style="color:#6B7280;"></i>`}
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(name)}">${escapeHtml(name)}${isWiki ? ' <span style="font-size:10px;color:#0089FF;">· 钉钉</span>' : ''}</div>
            <div style="font-size:11px;color:#9CA3AF;">${isWiki ? '在线文档 · 创建后关联' : `${formatFileSize(size)} · 待上传`}</div>
          </div>
          ${isWiki && entry.url ? `
            <button type="button" class="btn btn-ghost btn-sm" onclick="openDingTalkDoc('${safeUrl}')" title="打开"><i class="fas fa-external-link-alt"></i></button>
          ` : ''}
          <button type="button" class="btn btn-ghost btn-sm" onclick="removeQuickCreatePendingFile('${safeLocalId}')" title="移除" style="color:#DC2626;"><i class="fas fa-trash-alt"></i></button>
        </div>`;
      }).join('')}
    </div>
  `;
}

function showQuickTempTaskModal() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDefault = tomorrow.toISOString().split('T')[0];
  clearQuickCreatePendingAttachments(state.form);
  state.form = {
    type: 'temp',
    title: '',
    assignee: currentUser.name,
    planStartDate: todayStr(),
    dueDate: dueDefault,
    creator: currentUser.name,
    status: 'todo',
    priority: 'normal',
    progress: 0,
    pendingAttachments: [],
  };
  state.showModal = 'quickCreate';
  render();
}

function renderQuickCreateModal() {
  const planStartDate = state.form.planStartDate || '';
  const dueDate = state.form.dueDate || '';
  const manageableProjects = getViewableProjects().filter(p => canManageProject(p));
  const showProject = isUiSectionOpen('quickProject');
  const pendingCount = (state.form.pendingAttachments || []).length;
  const canUpload = !!(ApiConfig.enabled && authSession.token);
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:440px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-bolt" style="color:var(--accent-urgent);margin-right:8px;"></i>快速新建事项</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p style="font-size:12px;color:#9CA3AF;margin-bottom:14px;">默认临时事项。详细协办/工时可创建后在「更多 → 编辑 → 高级选项」补充。</p>
          <div class="form-group">
            <label class="form-label">标题 <span class="form-required">*</span></label>
            <input class="input" style="width:100%;" value="${escapeHtml(state.form.title || '')}" oninput="state.form.title=this.value" placeholder="要做什么？" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">负责人 <span class="form-required">*</span></label>
            <select class="select" style="width:100%;" onchange="state.form.assignee=this.value">
              ${getTaskAssigneeCandidates().map(u => `<option value="${u.name}" ${(state.form.assignee || currentUser.name) === u.name ? 'selected' : ''}>${formatUserOptionLabel(u)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">计划开始时间</label>
            <input class="input" type="date" style="width:100%;" value="${planStartDate}" onchange="state.form.planStartDate=this.value">
          </div>
          <div class="form-group">
            <label class="form-label">截止日期 <span class="form-required">*</span></label>
            <input class="input" type="date" style="width:100%;" value="${dueDate}" onchange="state.form.dueDate=this.value">
          </div>
          ${manageableProjects.length ? `
          ${renderLiteAdvancedToggle('quickProject', '挂到项目', '可选')}
          ${showProject ? `
          <div class="lite-advanced-body">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">所属项目</label>
              <select class="select" style="width:100%;" onchange="state.form.projectId=this.value">
                <option value="">不挂项目（临时事项）</option>
                ${manageableProjects.map(p => `<option value="${p.id}" ${state.form.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
              </select>
              <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">仅可选您有权管理的项目（负责人/创建人/管理员）</div>
            </div>
          </div>
          ` : ''}
          ` : ''}
          <div class="form-group" style="margin-bottom:0;margin-top:4px;">
            <div id="quickCreateFilesZone" tabindex="0"
              ${canUpload ? 'onpaste="handleQuickCreateFilesPaste(event)"' : ''}
              style="padding:12px;background:var(--bg-muted);border-radius:8px;border:1px solid var(--border);outline:none;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-size:13px;font-weight:600;color:var(--text);"><i class="fas fa-paperclip" style="margin-right:6px;color:#10B981;"></i>附件 (${pendingCount})</span>
                ${canUpload ? `
                  <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                    <button type="button" class="btn btn-ghost btn-sm" onclick="pickQuickCreateDingTalkDoc()">
                      <i class="fas fa-link"></i> 钉钉文档
                    </button>
                    <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0;">
                      <i class="fas fa-upload"></i> 上传
                      <input type="file" multiple style="display:none;" onchange="addQuickCreateFiles(event)">
                    </label>
                  </div>
                ` : ''}
              </div>
              ${canUpload ? `
                <div style="font-size:11px;color:#6B7280;margin-bottom:8px;"><i class="fas fa-paste" style="margin-right:4px;color:#10B981;"></i>可上传本地文件、选择钉钉文档，或 Ctrl+V 粘贴图片 · 本地文件不超过 20MB</div>
              ` : `
                <div style="font-size:11px;color:#D97706;margin-bottom:8px;"><i class="fas fa-info-circle"></i> 附件上传需连接服务端</div>
              `}
              ${renderQuickCreatePendingFilesHtml()}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" id="quickCreateSubmitBtn" onclick="saveQuickCreate()"><i class="fas fa-check"></i> 创建</button>
        </div>
      </div>
    </div>
  `;
}

async function saveQuickCreate() {
  if (state._quickCreateSaving) return;
  const title = (state.form.title || '').trim();
  if (!title) { alert('请输入标题'); return; }
  if (!state.form.assignee) { alert('请选择负责人'); return; }
  if (!state.form.dueDate) { alert('请选择截止日期'); return; }
  if (state.form.planStartDate && state.form.dueDate && state.form.planStartDate > state.form.dueDate) {
    alert('计划开始时间不能晚于截止日期');
    return;
  }
  const projectId = state.form.projectId || '';
  if (projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project || !canManageProject(project)) {
      alert('仅项目负责人或创建人可将事项挂到该项目');
      return;
    }
  }
  const pending = (state.form.pendingAttachments || []).slice();
  state.form.pendingAttachments = [];
  const newTask = {
    id: genId('T'),
    title,
    desc: '',
    type: projectId ? 'normal' : 'temp',
    projectId,
    parentId: null,
    assignee: state.form.assignee,
    collaboratorEntries: [],
    collaborators: [],
    creator: currentUser.name,
    createdAt: getNowCreatedAt(),
    status: 'todo',
    priority: 'normal',
    progress: 0,
    dueDate: state.form.dueDate,
    estimatedHours: 0,
    actualHours: 0,
    planStartDate: state.form.planStartDate || null,
    actualStartDate: null,
    actualEndDate: null,
    comments: [],
    attachments: [],
  };
  state._quickCreateSaving = true;
  const submitBtn = document.getElementById('quickCreateSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 创建中…';
  }
  try {
    tasks.push(newTask);
    notifyTaskAssigned(newTask);
    if (pending.length && ApiConfig.enabled && authSession.token) {
      persistLocalCache();
      DataService.cancelScheduledSave();
      for (let i = 0; i < 25 && DataService._syncing; i++) {
        await new Promise(r => setTimeout(r, 200));
      }
      const synced = await DataService.syncToServer({ skipUsers: !isFullAccess(currentUser.role) });
      if (!synced) {
        pending.forEach(entry => {
          if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        });
        save();
        alert('事项已创建，但同步失败，附件未能上传。请稍后在事项详情中重新上传。');
        closeModal();
        return;
      }
      let failCount = 0;
      for (const entry of pending) {
        try {
          if (entry.kind === 'dingtalk_wiki') {
            await submitWikiDocLink('task', newTask.id, {
              nodeId: entry.nodeId,
              workspaceId: entry.workspaceId,
            }, { silent: true });
          } else {
            const file = entry.file;
            await uploadFileToEntity('task', newTask.id, file, file?.name, 'attachment');
          }
        } catch (e) {
          failCount++;
          console.warn('[新建事项] 附件上传失败', e);
        }
        if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }
      if (failCount) {
        alert(`事项已创建，但有 ${failCount} 个附件上传失败，可在详情中重试`);
      }
    } else {
      pending.forEach(entry => {
        if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      });
      if (pending.length) {
        alert('事项已创建。附件上传需连接服务端，请在详情中重新上传。');
      }
      save();
    }
    closeModal();
  } finally {
    state._quickCreateSaving = false;
  }
}

function toggleTaskMoreMenu(event) {
  if (event) event.stopPropagation();
  const el = document.getElementById('taskMoreDropdown');
  if (!el) return;
  const open = el.classList.toggle('is-open');
  if (open) {
    const closer = (e) => {
      if (!el.contains(e.target)) {
        el.classList.remove('is-open');
        document.removeEventListener('click', closer);
      }
    };
    setTimeout(() => document.addEventListener('click', closer), 0);
  }
}

function focusTaskComment(taskId) {
  const needOpen = state.showModal !== 'taskDetail' || state.form.taskId !== taskId;
  if (needOpen) {
    viewTask(taskId);
  }
  state.taskDetailTab = 'comments';
  render();
  setTimeout(() => {
    const input = document.getElementById('taskCommentInput-' + taskId);
    if (!input) {
      alert('当前无法留言');
      return;
    }
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus();
  }, 50);
}

// 作废任务
function abolishTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (!canAbolishTask(task)) {
    alert('您没有权限作废该任务');
    return;
  }

  if (hasActiveChildren(task.id)) {
    alert('该任务存在未完成的下级任务，请先处理下级任务后再作废。');
    return;
  }

  if (!confirm('确定作废该任务？作废后不可恢复。')) return;

  const oldStatus = task.status;
  task.status = 'abolished';
  getTaskSuccessorDeps(task.id).forEach(dep => {
    const succ = getDependencyTask(dep.successorTaskId);
    if (succ) refreshTaskDependencySchedule(succ);
  });

  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: statusMap[oldStatus]?.label || oldStatus,
    after: '已作废',
    reason: '任务作废',
    project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
  });

  if (task.parentId) {
    updateParentProgress(task.parentId);
  }

  save({ immediateSync: true });
  state.form = { taskId: task.id };
  state.showModal = 'taskDetail';
  render();
}

function showProjectModal() {
  if (!canCreateProject()) {
    alert('您没有新建项目的权限');
    return;
  }
  state.form = {
    creator: currentUser.name,
    status: 'active',
    dept: currentUser.dept,
    manager: currentUser.name,
    teamMembers: [],
    stageTemplateId: 'TPL-WMS',
  };
  state.showModal = 'projectCreate';
  render();
}

function saveProject() {
  if (!state.form.name) { alert('请输入项目名称'); return; }

  const newProject = {
    id: genId('PRJ'),
    name: state.form.name,
    desc: state.form.desc || '',
    objective: state.form.objective || '',
    value: state.form.value || '',
    scope: state.form.scope || '',
    outOfScope: state.form.outOfScope || '',
    currentPhase: state.form.currentPhase || '',
    nextPlan: state.form.nextPlan || '',
    blocker: state.form.blocker || '',
    dept: state.form.dept || currentUser.dept,
    manager: state.form.manager || currentUser.name,
    teamMembers: sanitizeProjectTeamMembers(
      state.form.manager || currentUser.name,
      state.form.teamMembers
    ),
    status: 'active',
    startDate: state.form.startDate || new Date().toISOString().split('T')[0],
    endDate: state.form.endDate || '',
    archived: false,
    creator: currentUser.name,
    createdAt: getNowCreatedAt(),
    documents: [],
    planVerified: false,
    planVerifiedBy: '',
    planVerifiedAt: '',
    stageTemplateId: state.form.stageTemplateId || 'TPL-WMS',
  };

  projects.push(newProject);
  createMilestonesFromTemplate(newProject, newProject.stageTemplateId);
  notifyProjectManagerAssigned(newProject);
  save();
  closeModal();
}

function getBuiltinProjectTemplatesFallback() {
  return [
    {
      id: 'TPL-WMS',
      name: 'WMS 实施模板',
      desc: '选型确认（下挂定型/商务/合同任务）→启动→蓝图→配置→测试→上线准备→上线→验收',
      stageCount: 8,
      stages: [
        {
          key: 'M0',
          label: 'M0 选型确认',
          milestoneSeq: 'M0',
          tasks: ['M0a 选型定型', 'M0b 商务谈判', 'M0c 合同签订'],
          gates: [],
          registers: [],
          slots: [
            { key: 'vendor_minutes', title: '厂商交流纪要', ext: 'docx', required: false },
            { key: 'vendor_proposal', title: '厂商方案', ext: 'pdf', required: false },
            { key: 'meeting_md', title: '会议纪要', ext: 'md', required: false },
          ],
        },
        {
          key: 'M1', label: 'M1 项目启动', milestoneSeq: 'M1', tasks: [], gates: [],
          registers: ['stakeholders'],
          slots: [{ key: 'charter', title: '项目章程', ext: 'docx', required: true }],
        },
        {
          key: 'M2', label: 'M2 蓝图确认', milestoneSeq: 'M2', tasks: [], gates: [],
          registers: ['commPlans', 'qualityChecks', 'risks', 'budgetLines'],
          slots: [
            { key: 'blueprint', title: '功能蓝图', ext: 'docx', required: true },
            { key: 'blueprint_sign', title: '蓝图评审签字扫描件', ext: 'pdf', required: false },
          ],
        },
        {
          key: 'M3', label: 'M3 配置开发完成', milestoneSeq: 'M3', tasks: [], gates: [],
          registers: [], slots: [{ key: 'phase_accept', title: '阶段验收材料', ext: 'docx', required: false }],
        },
        {
          key: 'M4', label: 'M4 测试通过', milestoneSeq: 'M4', tasks: [], gates: [],
          registers: [], slots: [{ key: 'test_report', title: '测试报告', ext: 'docx', required: false }],
        },
        {
          key: 'M5', label: 'M5 上线准备', milestoneSeq: 'M5', tasks: [], gates: [],
          registers: [],
          slots: [
            { key: 'go_live_plan', title: '上线切换方案', ext: 'docx', required: true },
            { key: 'training', title: '培训材料', ext: 'docx', required: false },
          ],
        },
        {
          key: 'M6', label: 'M6 系统上线', milestoneSeq: 'M6', tasks: [], gates: [],
          registers: [], slots: [{ key: 'go_live_record', title: '上线记录', ext: 'docx', required: true }],
        },
        {
          key: 'M7', label: 'M7 项目验收', milestoneSeq: 'M7', tasks: [], gates: [],
          registers: [],
          slots: [
            { key: 'accept_report', title: '验收报告', ext: 'docx', required: true },
            { key: 'accept_sign', title: '验收签字扫描件', ext: 'pdf', required: false },
          ],
        },
      ],
    },
    {
      id: 'TPL-STD',
      name: '标准过程组模板',
      stageCount: 6,
      stages: [
        { key: '00', label: '00-立项与选型阶段', milestoneSeq: 'M1', tasks: ['M1 厂商选型定标', 'M2 采购合同+SLA签订'], gates: [] },
        { key: '01', label: '01-启动过程组', milestoneSeq: 'M2', tasks: ['M3 项目启动会召开'], gates: [] },
        { key: '02', label: '02-规划过程组', milestoneSeq: 'M3', tasks: ['M4 需求确认签字', 'M5 实施计划审批'], gates: [] },
        { key: '03', label: '03-执行过程组', milestoneSeq: 'M4', tasks: [], gates: [] },
        { key: '04', label: '04-监控过程组', milestoneSeq: 'M5', tasks: [], gates: [] },
        { key: '05', label: '05-收尾过程组', milestoneSeq: 'M6', tasks: ['M6 验收签字', 'M7 运维交接+复盘'], gates: [] },
      ],
    },
  ];
}

function resolveProjectTemplate(templateId) {
  const id = String(templateId || 'TPL-WMS').trim();
  if (!id || id === 'none') return null;
  const list = projectTemplates.length ? projectTemplates : getBuiltinProjectTemplatesFallback();
  return list.find(t => String(t.id) === id) || getBuiltinProjectTemplatesFallback().find(t => t.id === 'TPL-WMS');
}

// 按模板库生成里程碑（默认 WMS）
function createMilestonesFromTemplate(project, templateId) {
  const tpl = resolveProjectTemplate(templateId);
  if (!tpl || !Array.isArray(tpl.stages) || !tpl.stages.length) return;
  const makeTask = (over) => {
    const t = {
      id: genId('T'),
      projectId: project.id,
      parentId: null,
      isMilestone: false,
      title: '',
      type: 'normal',
      creator: currentUser.name,
      assignee: project.manager,
      collaboratorEntries: [],
      status: 'todo',
      priority: 'normal',
      progress: 0,
      estimatedHours: 0,
      actualHours: 0,
      planStartDate: null,
      actualStartDate: null,
      actualEndDate: null,
      attachments: [],
      desc: '',
      createdAt: getNowCreatedAt(),
      milestoneSeq: '',
      roleA: '',
      roleR: '',
      roleC: '',
      roleV: '',
      deliverables: '',
      acceptanceCriteria: '',
      completionEvidence: '',
      verification: '',
      feedback: '',
      leftover: '',
      outOfScope: '',
      depsRisks: '',
      escalation: '',
      delayImpact: '',
      reopenConditions: '',
    };
    Object.assign(t, over);
    reconcileEffectivePlanStart(t);
    syncTaskScheduleFields(t);
    return t;
  };
  let seq = 0;
  tpl.stages.forEach((stage) => {
    seq += 1;
    const milestone = makeTask({
      isMilestone: true,
      title: stage.label || stage.name || `阶段${seq}`,
      planStartDate: project.startDate || null,
      milestoneSeq: stage.milestoneSeq || `M${seq}`,
      phaseKey: stage.key || '',
      roleA: project.manager || '',
      roleR: project.manager || '',
      deliverables: stage.deliverables || '',
      acceptanceCriteria: stage.acceptanceCriteria || '',
    });
    tasks.push(milestone);
    for (const tName of (stage.tasks || [])) {
      const title = String(tName || '').trim();
      if (!title) continue;
      tasks.push(makeTask({
        parentId: milestone.id,
        isMilestone: false,
        title,
        priority: 'normal',
      }));
    }
    for (const g of (stage.gates || [])) {
      const raw = String(g || '').trim();
      if (!raw) continue;
      tasks.push(makeTask({
        parentId: milestone.id,
        isMilestone: false,
        title: raw.startsWith('【') ? raw : `【里程碑】${raw}`,
        priority: 'important',
      }));
    }
  });
}

function canManageProjectTemplates() {
  return canCreateProject() || isFullAccess(currentUser.role);
}

function upsertProjectTemplateLocal(tpl) {
  if (!tpl || !tpl.id) return;
  const idx = projectTemplates.findIndex(t => t.id === tpl.id);
  if (idx >= 0) projectTemplates[idx] = tpl;
  else projectTemplates.push(tpl);
}

function blankTemplateStage(seq = 1) {
  return {
    key: `M${seq}`,
    label: `M${seq} 新里程碑`,
    milestoneSeq: `M${seq}`,
    tasks: [],
    deliverables: '',
    acceptanceCriteria: '',
  };
}

function stagesToEditForm(stages) {
  return (Array.isArray(stages) ? stages : []).map((s, i) => ({
    key: String(s.key || s.milestoneSeq || `M${i + 1}`),
    label: String(s.label || s.name || `里程碑${i + 1}`),
    milestoneSeq: String(s.milestoneSeq || s.key || `M${i + 1}`),
    tasks: Array.isArray(s.tasks)
      ? s.tasks.map(t => String(t || '').trim()).filter(Boolean)
      : String(s.tasksText || '').split(/\n/).map(t => t.trim()).filter(Boolean),
    deliverables: String(s.deliverables || ''),
    acceptanceCriteria: String(s.acceptanceCriteria || ''),
  }));
}

function collectTemplateFormStages() {
  const form = state.form || {};
  return (form.stages || []).map((s, i) => ({
    key: String(s.key || s.milestoneSeq || `M${i + 1}`).trim(),
    label: String(s.label || '').trim(),
    milestoneSeq: String(s.milestoneSeq || s.key || `M${i + 1}`).trim(),
    tasks: (Array.isArray(s.tasks) ? s.tasks : [])
      .map(t => String(t || '').trim())
      .filter(Boolean),
    gates: [],
    deliverables: String(s.deliverables || '').trim(),
    acceptanceCriteria: String(s.acceptanceCriteria || '').trim(),
  })).filter(s => s.label);
}

function showProjectTemplateCreateModal() {
  if (!canManageProjectTemplates()) {
    alert('无权管理模板库');
    return;
  }
  state.form = {
    id: '',
    name: '',
    desc: '',
    stages: [blankTemplateStage(1)],
  };
  state.showModal = 'templateCreate';
  render();
}

function showProjectTemplateEditModal(templateId) {
  if (!canManageProjectTemplates()) {
    alert('无权管理模板库');
    return;
  }
  const list = projectTemplates.length ? projectTemplates : getBuiltinProjectTemplatesFallback();
  const tpl = list.find(t => String(t.id) === String(templateId));
  if (!tpl) {
    alert('模板不存在');
    return;
  }
  state.form = {
    id: tpl.id,
    name: tpl.name || '',
    desc: tpl.desc || '',
    builtin: !!tpl.builtin,
    stages: (() => {
      const rows = stagesToEditForm(tpl.stages);
      return rows.length ? rows : [blankTemplateStage(1)];
    })(),
  };
  state.showModal = 'templateEdit';
  render();
}

function addTemplateStageRow() {
  if (!state.form) return;
  if (!Array.isArray(state.form.stages)) state.form.stages = [];
  state.form.stages.push(blankTemplateStage(state.form.stages.length + 1));
  render();
}

function removeTemplateStageRow(idx) {
  if (!state.form || !Array.isArray(state.form.stages)) return;
  if (state.form.stages.length <= 1) {
    alert('至少保留一个里程碑');
    return;
  }
  state.form.stages.splice(idx, 1);
  render();
}

function moveTemplateStageRow(idx, delta) {
  if (!state.form || !Array.isArray(state.form.stages)) return;
  const j = idx + delta;
  if (j < 0 || j >= state.form.stages.length) return;
  const arr = state.form.stages;
  const tmp = arr[idx];
  arr[idx] = arr[j];
  arr[j] = tmp;
  render();
}

function addTemplateTaskRow(stageIdx) {
  if (!state.form || !state.form.stages[stageIdx]) return;
  if (!Array.isArray(state.form.stages[stageIdx].tasks)) state.form.stages[stageIdx].tasks = [];
  state.form.stages[stageIdx].tasks.push('');
  render();
}

function removeTemplateTaskRow(stageIdx, taskIdx) {
  if (!state.form || !state.form.stages[stageIdx]) return;
  const tasks = state.form.stages[stageIdx].tasks || [];
  tasks.splice(taskIdx, 1);
  render();
}

function moveTemplateTaskRow(stageIdx, taskIdx, delta) {
  if (!state.form || !state.form.stages[stageIdx]) return;
  const tasks = state.form.stages[stageIdx].tasks || [];
  const j = taskIdx + delta;
  if (j < 0 || j >= tasks.length) return;
  const tmp = tasks[taskIdx];
  tasks[taskIdx] = tasks[j];
  tasks[j] = tmp;
  render();
}

function renderProjectTemplateEditModal() {
  const form = state.form || {};
  const isEdit = state.showModal === 'templateEdit';
  const stages = Array.isArray(form.stages) ? form.stages : [];
  const listBody = stages.map((s, idx) => {
    const tasks = Array.isArray(s.tasks) ? s.tasks : [];
    const milestoneRow = `
      <tr style="background:var(--bg-muted);cursor:default;">
        <td style="white-space:nowrap;">
          <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:#EEF2FF;color:#4338CA;">里程碑</span>
        </td>
        <td>
          <input class="form-input" style="margin:0;" value="${escapeHtml(s.label || '')}" oninput="state.form.stages[${idx}].label=this.value" placeholder="如：M0 选型确认">
        </td>
        <td style="color:#9CA3AF;font-size:12px;">—</td>
        <td>
          <input class="form-input" style="margin:0;width:72px;" value="${escapeHtml(s.milestoneSeq || '')}" oninput="state.form.stages[${idx}].milestoneSeq=this.value;state.form.stages[${idx}].key=this.value" placeholder="M0">
        </td>
        <td style="white-space:nowrap;text-align:right;">
          <button type="button" class="btn btn-ghost btn-sm" title="添加任务" onclick="addTemplateTaskRow(${idx})"><i class="fas fa-plus"></i></button>
          <button type="button" class="btn btn-ghost btn-sm" title="上移" onclick="moveTemplateStageRow(${idx},-1)" ${idx === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
          <button type="button" class="btn btn-ghost btn-sm" title="下移" onclick="moveTemplateStageRow(${idx},1)" ${idx >= stages.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
          <button type="button" class="btn btn-ghost btn-sm" style="color:#DC2626;" title="删除里程碑" onclick="removeTemplateStageRow(${idx})"><i class="fas fa-trash-alt"></i></button>
        </td>
      </tr>
    `;
    const taskRows = tasks.map((t, ti) => `
      <tr style="cursor:default;">
        <td style="white-space:nowrap;">
          <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:#ECFDF5;color:#047857;">任务</span>
        </td>
        <td style="padding-left:18px;">
          <input class="form-input" style="margin:0;" value="${escapeHtml(t || '')}" oninput="state.form.stages[${idx}].tasks[${ti}]=this.value" placeholder="如：M0a 选型定型">
        </td>
        <td style="color:#6B7280;font-size:12px;">${escapeHtml(s.label || s.milestoneSeq || '—')}</td>
        <td style="color:#9CA3AF;font-size:12px;">—</td>
        <td style="white-space:nowrap;text-align:right;">
          <button type="button" class="btn btn-ghost btn-sm" title="上移" onclick="moveTemplateTaskRow(${idx},${ti},-1)" ${ti === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
          <button type="button" class="btn btn-ghost btn-sm" title="下移" onclick="moveTemplateTaskRow(${idx},${ti},1)" ${ti >= tasks.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
          <button type="button" class="btn btn-ghost btn-sm" style="color:#DC2626;" title="删除任务" onclick="removeTemplateTaskRow(${idx},${ti})"><i class="fas fa-trash-alt"></i></button>
        </td>
      </tr>
    `).join('');
    return milestoneRow + taskRows;
  }).join('');

  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:860px;max-height:90vh;overflow:auto;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-layer-group" style="color:var(--brand);margin-right:8px;"></i>${isEdit ? '编辑模板' : '新建模板'}</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="display:grid;gap:14px;">
          ${form.builtin ? `<p style="font-size:12px;color:#047857;background:#ECFDF5;padding:8px 12px;border-radius:8px;margin:0;">内置模板可编辑；需要时可「恢复默认」。</p>` : ''}
          <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;">
            <div>
              <label class="form-label">模板名称 *</label>
              <input class="form-input" value="${escapeHtml(form.name || '')}" oninput="state.form.name=this.value" placeholder="如：WMS 实施模板">
            </div>
            <div>
              <label class="form-label">说明</label>
              <input class="form-input" value="${escapeHtml(form.desc || '')}" oninput="state.form.desc=this.value" placeholder="用途简述（可选）">
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;font-size:13px;color:var(--text);">标准里程碑与标准任务</div>
              <div style="font-size:12px;color:#6B7280;margin-top:2px;">列表中「里程碑」与「任务」分行；点里程碑行的 + 可添加任务。</div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="addTemplateStageRow()"><i class="fas fa-plus"></i> 添加里程碑</button>
          </div>
          <div class="todo-table-wrap" style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg-panel);">
            <table class="todo-table" style="margin:0;">
              <thead>
                <tr>
                  <th style="width:88px;">类型</th>
                  <th>名称</th>
                  <th style="width:160px;">归属里程碑</th>
                  <th style="width:80px;">序号</th>
                  <th style="width:150px;text-align:right;">操作</th>
                </tr>
              </thead>
              <tbody>
                ${listBody || `<tr style="cursor:default;"><td colspan="5" style="text-align:center;color:#9CA3AF;">暂无内容，请添加里程碑</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="saveProjectTemplateForm()"><i class="fas fa-save"></i> ${isEdit ? '保存' : '创建'}</button>
        </div>
      </div>
    </div>
  `;
}

async function saveProjectTemplateForm() {
  if (!canManageProjectTemplates()) {
    alert('无权管理模板库');
    return;
  }
  const form = state.form || {};
  const name = String(form.name || '').trim();
  if (!name) {
    alert('请填写模板名称');
    return;
  }
  const stages = collectTemplateFormStages();
  if (!stages.length) {
    alert('至少添加一个里程碑');
    return;
  }
  const isEdit = state.showModal === 'templateEdit' && form.id;
  const body = { name, desc: String(form.desc || '').trim(), stages };
  try {
    const url = isEdit
      ? ApiConfig.baseUrl + '/project-templates/' + encodeURIComponent(form.id)
      : ApiConfig.baseUrl + '/project-templates';
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify(body),
    });
    const raw = await parseApiJsonResponse(res, isEdit ? '保存失败' : '创建失败');
    if (!res.ok || (raw.code && raw.code !== 200)) throw new Error(raw.message || (isEdit ? '保存失败' : '创建失败'));
    const tpl = raw.data?.template || raw.template;
    if (tpl) {
      upsertProjectTemplateLocal(tpl);
      state.templateExpandedId = tpl.id;
    }
    closeModal();
    render();
  } catch (e) {
    alert(e.message || (isEdit ? '保存失败' : '创建失败'));
  }
}

function renderProjectTemplatesPage() {
  const list = (projectTemplates.length ? projectTemplates : getBuiltinProjectTemplatesFallback())
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'));
  const expanded = state.templateExpandedId || null;
  const canManage = canManageProjectTemplates();
  if (!list.length) {
    return `
      <p class="content-intro" style="margin-bottom:16px;">模板只展示标准里程碑与标准任务；新建项目时按模板生成对应结构。</p>
      <div style="padding:24px;text-align:center;color:#9CA3AF;border:1px dashed #E5E7EB;border-radius:10px;background:var(--bg-panel);">暂无模板${canManage ? '，请点击右上角「新建模板」' : ''}</div>
    `;
  }
  const rows = list.map(tpl => {
    const stages = tpl.stages || [];
    const open = expanded === tpl.id;
    const taskCount = stages.reduce((n, s) => n + ((s.tasks || []).length), 0);
    const detailRows = [];
    stages.forEach((s, si) => {
      detailRows.push({
        kind: '里程碑',
        name: s.label || s.name || s.key || `里程碑${si + 1}`,
        parent: '—',
        seq: s.milestoneSeq || s.key || '',
      });
      (s.tasks || []).forEach(t => {
        detailRows.push({
          kind: '任务',
          name: t,
          parent: s.label || s.name || s.key || '',
          seq: '',
        });
      });
    });
    return `
      <tr onclick="state.templateExpandedId=state.templateExpandedId==='${escapeHtml(tpl.id)}'?null:'${escapeHtml(tpl.id)}';render()" style="${open ? 'background:var(--bg-muted);' : ''}">
        <td style="white-space:nowrap;">
          <i class="fas fa-chevron-${open ? 'down' : 'right'}" style="color:#9CA3AF;width:14px;"></i>
          <strong>${escapeHtml(tpl.name || tpl.id)}</strong>
          ${tpl.builtin ? '<span style="font-size:11px;color:#047857;background:#ECFDF5;padding:1px 6px;border-radius:4px;margin-left:6px;">内置</span>' : ''}
        </td>
        <td style="color:#6B7280;font-size:12px;">${escapeHtml(tpl.desc || '—')}</td>
        <td style="text-align:center;white-space:nowrap;">${stages.length}</td>
        <td style="text-align:center;white-space:nowrap;">${taskCount}</td>
        <td style="color:#9CA3AF;font-size:12px;white-space:nowrap;">${escapeHtml(tpl.source || '—')}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap;">
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
            ${canCreateProject() ? `<button type="button" class="btn btn-primary btn-sm" onclick="showProjectModalWithTemplate('${escapeHtml(tpl.id)}')">新建</button>` : ''}
            ${canManage ? `<button type="button" class="btn btn-ghost btn-sm" onclick="showProjectTemplateEditModal('${escapeHtml(tpl.id)}')">编辑</button>` : ''}
            ${canManage && tpl.builtin ? `<button type="button" class="btn btn-ghost btn-sm" onclick="resetBuiltinProjectTemplate('${escapeHtml(tpl.id)}')">恢复</button>` : ''}
            ${canManage && !tpl.builtin ? `<button type="button" class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="deleteProjectTemplate('${escapeHtml(tpl.id)}')">删除</button>` : ''}
          </div>
        </td>
      </tr>
      ${open ? `
        <tr class="tpl-detail-row" style="cursor:default;" onclick="event.stopPropagation()">
          <td colspan="6" style="padding:0 12px 14px;background:var(--bg-muted);border-bottom:1px solid #E5E7EB;">
            <div class="todo-table-wrap" style="margin-top:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);overflow:hidden;">
              <table class="todo-table" style="margin:0;">
                <thead>
                  <tr>
                    <th style="width:88px;">类型</th>
                    <th>名称</th>
                    <th style="width:160px;">归属里程碑</th>
                    <th style="width:80px;">序号</th>
                  </tr>
                </thead>
                <tbody>
                  ${detailRows.length ? detailRows.map(r => `
                    <tr style="cursor:default;">
                      <td>
                        <span style="font-size:11px;padding:2px 8px;border-radius:4px;${r.kind === '里程碑'
                          ? 'background:#EEF2FF;color:#4338CA;'
                          : 'background:#ECFDF5;color:#047857;'}">${r.kind}</span>
                      </td>
                      <td style="${r.kind === '任务' ? 'padding-left:20px;color:var(--text);' : 'font-weight:600;'}">${escapeHtml(r.name)}</td>
                      <td style="color:#6B7280;font-size:12px;">${escapeHtml(r.parent)}</td>
                      <td style="color:#9CA3AF;font-size:12px;">${escapeHtml(r.seq || '—')}</td>
                    </tr>
                  `).join('') : `<tr style="cursor:default;"><td colspan="4" style="text-align:center;color:#9CA3AF;">暂无里程碑与任务</td></tr>`}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ` : ''}
    `;
  }).join('');
  return `
    <p class="content-intro" style="margin-bottom:16px;">模板只展示标准里程碑与标准任务；点击行可展开明细。</p>
    <div class="todo-table-wrap" style="background:var(--bg-panel);border:1px solid var(--border);border-radius:10px;overflow:hidden;">
      <table class="todo-table">
        <thead>
          <tr>
            <th>模板名称</th>
            <th>说明</th>
            <th style="width:90px;text-align:center;">里程碑</th>
            <th style="width:80px;text-align:center;">任务</th>
            <th style="width:140px;">来源</th>
            <th style="width:220px;text-align:right;">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function showProjectModalWithTemplate(templateId) {
  showProjectModal();
  state.form.stageTemplateId = templateId || 'TPL-WMS';
  render();
}

async function deleteProjectTemplate(id) {
  if (!canManageProjectTemplates()) {
    alert('无权管理模板库');
    return;
  }
  if (!confirm('确定删除该模板？删除后不可恢复。')) return;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/project-templates/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { ...AuthService.getAuthHeaders() },
    });
    const raw = await parseApiJsonResponse(res, '删除失败');
    if (!res.ok || (raw.code && raw.code !== 200)) throw new Error(raw.message || '删除失败');
    projectTemplates = projectTemplates.filter(t => t.id !== id);
    if (state.templateExpandedId === id) state.templateExpandedId = null;
    render();
  } catch (e) {
    alert(e.message || '删除失败');
  }
}

async function resetBuiltinProjectTemplate(id) {
  if (!canManageProjectTemplates()) {
    alert('无权管理模板库');
    return;
  }
  if (!confirm('确定将该内置模板恢复为系统默认内容？当前编辑会被覆盖。')) return;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/project-templates/' + encodeURIComponent(id) + '/reset', {
      method: 'POST',
      headers: { ...AuthService.getAuthHeaders() },
    });
    const raw = await parseApiJsonResponse(res, '恢复失败');
    if (!res.ok || (raw.code && raw.code !== 200)) throw new Error(raw.message || '恢复失败');
    const tpl = raw.data?.template || raw.template;
    if (tpl) upsertProjectTemplateLocal(tpl);
    render();
  } catch (e) {
    alert(e.message || '恢复失败');
  }
}

/** @deprecated 兼容旧名 */
function createDefaultPhaseMilestones(project) {
  createMilestonesFromTemplate(project, project.stageTemplateId || 'TPL-WMS');
}

async function saveProjectAsTemplate(projectId) {
  if (!canManageProjectTemplates()) {
    alert('无权另存模板');
    return;
  }
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const name = prompt('模板名称', `${project.name} 模板`);
  if (name == null || !String(name).trim()) return;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/project-templates/from-project/' + encodeURIComponent(projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify({ name: String(name).trim() }),
    });
    const raw = await parseApiJsonResponse(res, '另存失败');
    if (!res.ok || (raw.code && raw.code !== 200)) throw new Error(raw.message || '另存失败');
    const tpl = raw.data?.template || raw.template;
    if (tpl) upsertProjectTemplateLocal(tpl);
    alert('已保存到模板库');
  } catch (e) {
    alert(e.message || '另存失败');
  }
}

function showRejectModal(taskId) {
  state.form = { taskId };
  state.showModal = 'reject';
  render();
}

function showTransferModal(taskId) {
  state.form = { taskId };
  state.showModal = 'transfer';
  render();
}

function showArchiveModal(taskId) {
  state.form = { taskId };
  state.showModal = 'archive';
  render();
}

function saveTask() {
  if (!state.form.title) { alert(state.form.isMilestone ? '请输入里程碑名称' : '请输入任务标题'); return; }
  if (Array.isArray(state.form.roleCNames)) {
    state.form.roleC = state.form.roleCNames.join('、');
  }
  delete state.form.roleCNames;
  delete state.form.roleCSearch;
  state.form.dailyHours = resolveDailyHours(state.form.dailyHours);
  if (state.form.planStartDate && Number(state.form.estimatedHours) > 0) {
    const autoDue = calcEndDate(state.form.planStartDate, state.form.estimatedHours, state.form.dailyHours);
    if (autoDue) state.form.dueDate = autoDue;
  }

  const formIsMilestone = !!state.form.isMilestone || (!!state.form.id && isMilestoneTask(tasks.find(t => t.id === state.form.id)));

  // 编辑上级任务：预计工时不得低于子任务已分配合计
  if (state.form.id && (formIsMilestone || !state.form.parentId)) {
    const allocated = getChildrenAllocatedHours(state.form.id);
    const proposedParent = Number(state.form.estimatedHours) || 0;
    if (allocated > 0 && proposedParent < allocated) {
      alert(`${formIsMilestone ? '里程碑' : '上级任务'}预计工时不能低于子任务已分配合计！\n\n子任务已分配：${allocated}小时\n当前填写：${proposedParent}小时\n\n请将预计工时调整为至少 ${allocated} 小时。`);
      return;
    }
  }

  // 校验子任务工时是否超过上级
  if (state.form.parentId && state.form.estimatedHours) {
    const budget = getChildHoursBudgetInfo(state.form.parentId, state.form.id || null, state.form.estimatedHours);
    if (budget && budget.overflow > 0) {
      const { parentTask, parentHours, otherChildrenHours, proposed, totalAllocated, minParentHours } = budget;
      alert(
        `子任务工时不能超过上级任务！\n\n` +
        `上级任务「${parentTask.title}」工时：${parentHours}小时\n` +
        `其他子任务已分配：${otherChildrenHours}小时\n` +
        `本任务拟填写：${proposed}小时\n` +
        `合计需：${totalAllocated}小时，超出 ${budget.overflow} 小时\n\n` +
        `建议：请编辑上级任务「${parentTask.title}」，将预计工时调整为至少 ${minParentHours} 小时后再保存本任务。\n` +
        `或将本任务预计工时调整为不超过 ${Math.max(0, parentHours - otherChildrenHours)} 小时。`
      );
      return;
    }
  }

  const task = tasks.find(t => t.id === state.form.id);
  if (task) {
    if (!canEditTask(task)) {
      alert('您没有编辑该任务的权限');
      return;
    }
    if (isTerminalTaskStatus(task.status)) {
      alert('已作废或已归档的任务不可编辑');
      return;
    }
    // 编辑已有任务，必须填写修改原因
    if (!state.form.reason) { alert('请填写修改原因'); return; }
    const oldAssignee = task.assignee;
    const oldStatus = task.status;
    const oldPlanStart = task.planStartDate || null;
    const oldDue = task.dueDate || '';
    const newPlanStart = state.form.planStartDate || null;
    const newDue = state.form.dueDate || '';
    const dateChanged = newPlanStart !== oldPlanStart || newDue !== oldDue;
    if (dateChanged && !state.form._dateBaselineConfirmed) {
      if ((task.originalPlanStartDate || task.originalDueDate) && !String(state.form.reason || state.form.changeReason || '').trim()) {
        alert('已有原定日期，再次变更须填写变更原因');
        return;
      }
      state._pendingDateBaseline = {
        taskId: task.id,
        oldPlanStart,
        oldDue,
        newPlanStart,
        newDue,
        hadOriginalStart: !!task.originalPlanStartDate,
        hadOriginalDue: !!task.originalDueDate,
        keepOriginalStart: task.originalPlanStartDate || oldPlanStart || '',
        keepOriginalDue: task.originalDueDate || oldDue || '',
      };
      state.showModal = 'dateBaselineConfirm';
      render();
      return;
    }
    if (isTaskProjectPaused(task) && state.form.status !== 'paused' && state.form.status !== oldStatus) {
      alert('所属项目已暂停，请先恢复项目后再变更任务状态');
      return;
    }
    if ((state.form.status === 'doing' || state.form.status === 'done') && state.form.status !== oldStatus && hasHardBlock(task)) {
      alert(getHardBlockAlertMessage(task));
      return;
    }
    if (state.form.status === 'done' && oldStatus !== 'done' && isMilestoneTask(task) && !areAllMilestoneTasksDone(task.id)) {
      alert(getMilestoneIncompleteHint(task.id));
      return;
    }
    if (state.form.status === 'done' && oldStatus !== 'done' && !isMilestoneTask(task) && hasActiveChildren(task.id)) {
      alert('该任务存在未完成的下级任务，请先完成下级任务。');
      return;
    }
    if (
      isAitableIntakeTask(task)
      && (state.form.status === 'doing' || state.form.status === 'done')
      && state.form.status !== oldStatus
      && !(Number(state.form.estimatedHours) > 0)
    ) {
      alert('表单提报任务须填写预计工时后才能开始或完成');
      return;
    }
    if (
      isAitableIntakeTask(task)
      && (state.form.status === 'doing' || state.form.status === 'done')
      && !state.form.planStartDate
    ) {
      state.form.planStartDate = todayStr();
    }
    if (
      isAitableIntakeTask(task)
      && state.form.status === 'done'
      && oldStatus !== 'done'
      && !task.actualStartDate
    ) {
      task.actualStartDate = todayStr();
    }
    const diffs = buildTaskChangeDiff(task, state.form);
    appendChangeLogEntry({
      taskId: task.id,
      operator: currentUser.name,
      operateTime: new Date().toLocaleString(),
      before: formatChangeDiffText(diffs, 'before'),
      after: formatChangeDiffText(diffs, 'after'),
      reason: state.form.reason,
      project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
    });
    const preservedCreatedAt = task.createdAt;
    const preservedStatus = isTerminalTaskStatus(task.status) ? task.status : null;
    Object.assign(task, state.form);
    delete task._dateBaselineConfirmed;
    if (preservedCreatedAt) task.createdAt = preservedCreatedAt;
    if (preservedStatus) task.status = preservedStatus;
    if (dateChanged) {
      if (!task.originalPlanStartDate && oldPlanStart && newPlanStart !== oldPlanStart) {
        task.originalPlanStartDate = oldPlanStart;
      }
      if (!task.originalDueDate && oldDue && newDue !== oldDue) {
        task.originalDueDate = oldDue;
      }
      task.changeReason = String(state.form.changeReason || state.form.reason || '').trim();
    } else if (state.form.reason) {
      task.changeReason = state.form.reason;
    }
    if (isAitableIntakeTask(task) && (task.status === 'doing' || task.status === 'done') && !task.actualStartDate) {
      task.actualStartDate = todayStr();
    }
    if (isMilestoneTask(task) || formIsMilestone) {
      task.isMilestone = true;
      task.parentId = null;
      normalizeMilestonePlanFields(task);
      if (task.roleR) task.assignee = task.roleR;
      else if (task.assignee && !task.roleR) task.roleR = task.assignee;
    } else {
      task.isMilestone = false;
    }
    delete task.informCollaborator;
    delete task.assistCollaborator;
    delete task.informCollaborators;
    delete task.assistCollaborators;
    reconcileEffectivePlanStart(task);
    syncTaskScheduleFields(task);
    try {
      syncCollaboratorsByType(task, COLLAB_TYPE_INFORM, getTaskFormCollaboratorNames(task, COLLAB_TYPE_INFORM), { notify: false });
      syncCollaboratorsByType(task, COLLAB_TYPE_ASSIST, getTaskFormCollaboratorNames(task, COLLAB_TYPE_ASSIST));
    } catch (e) {
      alert(e.message);
      return;
    }
    if (state.form.status === 'done' && oldStatus !== 'done') {
      applyTaskDoneFields(task);
      onTaskMarkedDone(task);
      onPredecessorTaskCompleted(task);
      if (isMilestoneTask(task) && task.projectId) {
        try { syncProjectPhaseFromMilestones(task.projectId, { silent: true }); } catch (e) { /* ignore */ }
      }
    } else if (task.status === 'done') {
      task.progress = 100;
    }
    if (state.form.status === 'paused' && oldStatus !== 'paused') {
      onTaskMarkedPaused(task, state.form.reason || '');
    }
    if (state.form.assignee && state.form.assignee !== oldAssignee) {
      notifyTaskAssigned(task);
    }
    if (task.parentId) updateParentProgress(task.parentId);
    if (isMilestoneTask(task) || formIsMilestone) {
      state.detailMilestoneId = task.id;
      state.projectDetailTab = 'work';
    }
  } else {
    const creatingMilestone = !!state.form.isMilestone;
    const parentTask = state.form.parentId ? tasks.find(t => t.id === state.form.parentId) : null;
    if (!creatingMilestone && state.form.projectId && !parentTask) {
      alert('项目任务须挂在里程碑下，请选择所属里程碑');
      return;
    }
    if (parentTask && !canCreateSubTask(parentTask)) {
      alert(isMilestoneTask(parentTask) ? '无权在该里程碑下添加任务' : '无权在该任务下添加子任务');
      return;
    }
    if (creatingMilestone || (!parentTask && state.form.projectId)) {
      const project = projects.find(p => p.id === state.form.projectId);
      if (!project || !canManageProject(project)) {
        alert(creatingMilestone ? '仅项目负责人或创建人可添加里程碑' : '仅项目负责人或创建人可添加任务');
        return;
      }
    }
    // 新建任务，不需要修改原因
    const newTask = {
      ...state.form,
      id: genId('T'),
      projectId: state.form.projectId || '',
      parentId: creatingMilestone ? null : (state.form.parentId || null),
      isMilestone: creatingMilestone,
      assignee: state.form.assignee || currentUser.name,
      collaboratorEntries: [],
      creator: currentUser.name,
      createdAt: getNowCreatedAt(),
      estimatedHours: state.form.estimatedHours || 0,
      actualHours: 0,
      planStartDate: state.form.planStartDate || null,
      actualStartDate: null,
      actualEndDate: null,
      attachments: [],
    };
    if (creatingMilestone) {
      normalizeMilestonePlanFields(newTask);
      if (!newTask.milestoneSeq) newTask.milestoneSeq = getNextMilestoneSeq(newTask.projectId);
      if (newTask.roleR) newTask.assignee = newTask.roleR;
      else if (newTask.assignee && !newTask.roleR) newTask.roleR = newTask.assignee;
      if (!newTask.roleA) {
        const project = projects.find(p => p.id === newTask.projectId);
        newTask.roleA = project?.manager || newTask.assignee || currentUser.name;
      }
    }
    reconcileEffectivePlanStart(newTask);
    syncTaskScheduleFields(newTask);
    tasks.push(newTask);
    try {
      syncCollaboratorsByType(newTask, COLLAB_TYPE_INFORM, getTaskFormCollaboratorNames(newTask, COLLAB_TYPE_INFORM), { notify: false });
      syncCollaboratorsByType(newTask, COLLAB_TYPE_ASSIST, getTaskFormCollaboratorNames(newTask, COLLAB_TYPE_ASSIST));
    } catch (e) {
      tasks.pop();
      alert(e.message);
      return;
    }
    notifyTaskAssigned(newTask);
    if (newTask.parentId) updateParentProgress(newTask.parentId);
    const returnTo = state.returnToTaskId;
    save();
    if (creatingMilestone) {
      state.returnToTaskId = null;
      state.taskEditInline = false;
      state.showModal = null;
      state.detailMilestoneId = newTask.id;
      state.projectDetailTab = 'work';
      state.projectPlanView = normalizeProjectWorkView(state.projectPlanView) || 'table';
      state.form = { projectId: newTask.projectId };
      state.page = 'projectDetail';
      render();
      return;
    }
    if (returnTo) {
      state.returnToTaskId = null;
      state.taskEditInline = false;
      state.form = { taskId: returnTo };
      state.showModal = 'taskDetail';
      render();
      return;
    }
  }
  save();
  closeModal();
}

function rejectTask() {
  if (!state.form.rejectReason) { alert('请填写驳回原因'); return; }
  const task = tasks.find(t => t.id === state.form.taskId);
  if (task) {
    const oldStatus = task.status;
    task.status = 'rejected';
    task.rejectReason = state.form.rejectReason;
    appendChangeLogEntry({
      taskId: task.id,
      operator: currentUser.name,
      operateTime: new Date().toLocaleString(),
      before: statusMap[oldStatus]?.label || oldStatus,
      after: '已驳回',
      reason: state.form.rejectReason,
      project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
    });
    notifyTaskRejected(task, state.form.rejectReason);
    save();
  }
  closeModal();
}

function transferTask() {
  if (!state.form.transferTo) { alert('请选择转办对象'); return; }
  if (!state.form.transferReason) { alert('请填写转办原因'); return; }
  const task = tasks.find(t => t.id === state.form.taskId);
  if (task) {
    const oldAssignee = task.assignee;
    task.assignee = state.form.transferTo;
    appendTransferLogEntry({
      taskId: task.id,
      from: oldAssignee,
      to: state.form.transferTo,
      operator: currentUser.name,
      time: new Date().toLocaleString(),
      reason: state.form.transferReason,
    });
    appendChangeLogEntry({
      taskId: task.id,
      operator: currentUser.name,
      operateTime: new Date().toLocaleString(),
      before: oldAssignee,
      after: state.form.transferTo,
      reason: '转办：' + state.form.transferReason,
      project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
    });
    notifyTaskTransfer(task, state.form.transferTo, state.form.transferReason);
    save();
  }
  closeModal();
}

function archiveTask() {
  if (!state.form.archiveReason) { alert('请填写归档原因'); return; }
  const task = tasks.find(t => t.id === state.form.taskId);
  if (task) {
    const oldStatus = task.status;
    task.status = 'archived';
    appendChangeLogEntry({
      taskId: task.id,
      operator: currentUser.name,
      operateTime: new Date().toLocaleString(),
      before: statusMap[oldStatus]?.label || oldStatus,
      after: '已归档',
      reason: state.form.archiveReason,
      project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
    });
    save();
  }
  closeModal();
}
