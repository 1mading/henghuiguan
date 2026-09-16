// ========== 任务卡片 ==========
function getAllActiveProjects() {
  return projects.filter(p => !isProjectArchived(p));
}

function getAllVisibleTasks() {
  return tasks.filter(t => t.status !== 'abolished');
}

function isRelatedToTask(task) {
  if (!task) return false;
  if (isSamePersonName(task.assignee, currentUser.name)) return true;
  if (isTaskCollaborator(task)) return true;
  if (isSamePersonName(task.creator, currentUser.name)) return true;
  if (isTaskProjectManager(task)) return true;
  if (isTaskProjectTeamMember(task)) return true;
  return false;
}

function isTaskProjectTeamMember(task) {
  if (!task?.projectId) return false;
  const project = projects.find(p => p.id === task.projectId);
  return !!(
    project &&
    Array.isArray(project.teamMembers) &&
    project.teamMembers.some(n => isSamePersonName(n, currentUser.name))
  );
}

/** 可管理项目：矩阵 projects.manage=all 则可管全部；own 则本人负责/创建；none 不可管 */
function canManageProject(project) {
  if (!project || isProjectArchived(project)) return false;
  const mode = resolveCap(currentUser, 'projects.manage');
  if (mode === 'all') return true;
  if (mode === 'none') return false;
  return isSamePersonName(project.manager, currentUser.name) || isSamePersonName(project.creator, currentUser.name);
}

/** 可新建项目 */
function canCreateProject() {
  return capOn(currentUser, 'projects.create');
}

/** 可删除项目 */
function canDeleteProject() {
  return capOn(currentUser, 'projects.delete');
}

/** 可编辑任务：负责人/协办人/创建人/项目负责人，或项目管理档位为全部可管 */
function canEditTask(task) {
  if (!task || task.status === 'archived' || task.status === 'abolished') return false;
  if (resolveCap(currentUser, 'projects.manage') === 'all') return true;
  return isRelatedToTask(task);
}

function getMyAssignedTasks() {
  return tasks.filter(t => isSamePersonName(t.assignee, currentUser.name));
}

function getMyCollaboratorTasks() {
  return tasks.filter(t =>
    !isSamePersonName(t.assignee, currentUser.name) &&
    (isInformCollaborator(t) || isAssistCollaborator(t))
  );
}

function getMyPendingAssistCollabTasks() {
  return tasks.filter(t => {
    const entry = getCollaboratorEntry(t, COLLAB_TYPE_ASSIST, currentUser.name);
    return entry && (entry.status === COLLAB_STATUS_PENDING || entry.status === COLLAB_STATUS_PROPOSED);
  });
}

/** 本人相关任务（负责人/协办）；不含「仅创建人」 */
function getMyRelatedTasks() {
  const assignedIds = new Set(getMyAssignedTasks().map(t => t.id));
  return [
    ...getMyAssignedTasks(),
    ...getMyCollaboratorTasks().filter(t => !assignedIds.has(t.id)),
  ];
}

/** 默认列表用：与任务相关（不含仅创建人） */
function isDisplayRelatedToTask(task) {
  if (!task) return false;
  if (isSamePersonName(task.assignee, currentUser.name)) return true;
  if (isTaskCollaborator(task)) return true;
  if (isTaskProjectManager(task)) return true;
  if (isTaskProjectTeamMember(task)) return true;
  return false;
}

/** 默认列表用：与项目相关（不含仅创建人） */
function isDisplayRelatedToProject(project) {
  if (!project) return false;
  if (isSamePersonName(project.manager, currentUser.name)) return true;
  if (
    Array.isArray(project.teamMembers) &&
    project.teamMembers.some(n => isSamePersonName(n, currentUser.name))
  ) return true;
  return getMyRelatedTasks().some(t => t.projectId === project.id);
}

/** 任务中心是否显示「部门」范围页签 */
function canViewDeptTaskScope() {
  return capOn(currentUser, 'tasks.deptScope');
}

function getUserDeptByName(name) {
  const u = users.find(x => isSamePersonName(x.name, name));
  return u?.dept || '';
}

function getTaskCenterDeptOptions() {
  if (currentUser.role === 'manager') {
    return [{ id: currentUser.dept, label: currentUser.dept }];
  }
  if (isFullAccess(currentUser.role)) {
    return [
      { id: 'all', label: '全部部门' },
      ...departments.map(d => ({ id: d, label: d })),
    ];
  }
  return [];
}

function getActiveTaskCenterDept() {
  if (currentUser.role === 'manager') return currentUser.dept;
  return state.taskCenterDept || 'all';
}

/** 部门范围：本部门成员负责的末级任务（不含已作废/已归档） */
function getDeptScopeLeafTasks() {
  const dept = getActiveTaskCenterDept();
  return filterLeafTasks(tasks.filter(t => {
    if (isTerminalTaskStatus(t.status)) return false;
    const assigneeDept = getUserDeptByName(t.assignee);
    if (!assigneeDept) return false;
    if (dept === 'all') return true;
    return assigneeDept === dept;
  }));
}

/** 可见范围内全部末级任务（项目任务按 canViewTask；临时任务仅相关人） */
function getAllViewableLeafTasks(opts = {}) {
  const includeDone = !!opts.includeDone;
  return filterLeafTasks(tasks.filter(t => {
    if (isTerminalTaskStatus(t.status)) return false;
    // 列表/待办：排除已完成、已暂停及所属项目已暂停
    if (!includeDone && isExcludedFromTodo(t)) return false;
    return canViewTask(t);
  }));
}

/** 本人待办末级任务（不含已完成/已暂停/项目暂停/已作废/已归档；不含仅创建人） */
function getMyTodoLeafTasks() {
  return filterLeafTasks(getMyRelatedTasks())
    .filter(t => !isExcludedFromTodo(t));
}

/** 本人相关末级任务（含已完成/已暂停，不含已作废/已归档；看板用） */
function getMyTodoLeafTasksIncludingDone() {
  return filterLeafTasks(getMyRelatedTasks())
    .filter(t => !isTerminalTaskStatus(t.status));
}

/** 我发起的：创建人为本人 */
function getMyCreatedLeafTasks() {
  return filterLeafTasks(tasks.filter(t => isSamePersonName(t.creator, currentUser.name)))
    .filter(t => !isTerminalTaskStatus(t.status));
}

/** 我处理的：负责人为本人 */
function getMyHandledLeafTasks() {
  return filterLeafTasks(getMyAssignedTasks()).filter(t => !isTerminalTaskStatus(t.status));
}

/** 任务中心当前范围下的末级任务列表；opts.includeDone 看板时含已完成/已暂停 */
function getTaskCenterBaseTasks(opts = {}) {
  const includeDone = !!opts.includeDone;
  const mode = state.todoViewMode || 'all';
  const asOpenTodo = (list) => includeDone ? list : list.filter(t => !isExcludedFromTodo(t));
  let list;
  if (state.taskScopeTab === 'dept' && canViewDeptTaskScope() && (mode === 'all' || mode === 'mine')) {
    list = asOpenTodo(getDeptScopeLeafTasks());
  } else if (mode === 'created') {
    list = asOpenTodo(getMyCreatedLeafTasks());
  } else if (mode === 'handled') {
    list = asOpenTodo(getMyHandledLeafTasks());
  } else if (mode === 'mine') {
    list = includeDone ? getMyTodoLeafTasksIncludingDone() : getMyTodoLeafTasks();
  } else {
    list = getAllViewableLeafTasks({ includeDone });
  }
  return (list || []).filter(t => !shouldHideMilestoneLikeTask(t));
}

function formatTodoBoardDate(dateStr) {
  const s = normalizeDateStr(dateStr);
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return s;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

function getTasksPageIntro() {
  const mode = state.todoViewMode || 'all';
  if (mode === 'created') return '查看并跟进您发起的事项，可切换列表或看板。';
  if (mode === 'handled') return '查看您负责处理的事项，可切换列表或看板。';
  if (mode === 'mine') return '仅看与本人相关的事项，可切换列表或看板。';
  return '默认展示可见范围内全部任务；可筛选与我相关、我发起或我处理，支持列表与看板。';
}

function getTodoViewTitle() {
  const mode = state.todoViewMode || 'all';
  if (mode === 'created') return '我发起的';
  if (mode === 'handled') return '我处理的';
  if (mode === 'mine') return '与我相关';
  return '任务管理';
}

function setTaskScopeTab(scope) {
  state.taskScopeTab = scope;
  state.todoPage = 1;
  if (scope === 'dept' && currentUser.role === 'manager') {
    state.taskCenterDept = currentUser.dept;
  }
  render();
}

function setTaskCenterDept(dept) {
  state.taskCenterDept = dept;
  render();
}

/** 本人参与的项目：有相关任务，或本人为项目负责人（不含仅创建人） */
function getMyParticipatingProjects() {
  const idSet = new Set();
  getMyRelatedTasks().forEach(t => { if (t.projectId) idSet.add(t.projectId); });
  projects.forEach(p => {
    if (!isProjectArchived(p) && p.manager === currentUser.name) {
      idSet.add(p.id);
    }
  });
  return projects.filter(p => idSet.has(p.id) && !isProjectArchived(p));
}

/** @deprecated 使用 canManageProject */
function canStaffManageProject(project) {
  return canManageProject(project);
}

function getStaffProjectScope() {
  return getViewableProjects();
}

function canQuickUpdateProgress(task) {
  if (!task || task.status === 'done' || task.status === 'archived' || task.status === 'abolished') return false;
  if (isMilestoneTask(task)) return false;
  if (hasActiveChildren(task.id)) return false;
  return canEditTask(task);
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function canUploadTaskAttachment(task) {
  return canEditTask(task);
}

function canUploadProjectDoc(project) {
  return canManageProject(project);
}

function getTaskProject(task) {
  return task?.projectId ? projects.find(p => p.id === task.projectId) : null;
}

function isTaskProjectManager(task) {
  const project = getTaskProject(task);
  return !!(project && isSamePersonName(project.manager, currentUser.name));
}

function isTaskCollaborator(task) {
  return isInformCollaborator(task) || isAssistCollaborator(task);
}

function canPostTaskComment(task) {
  return canEditTask(task);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 列表为空时的占位（项目/任务等页依赖此函数，缺失会导致 render 抛错、点击无反应） */
function renderEmptyState(opts) {
  const icon = (opts && opts.icon) || 'fa-inbox';
  const title = (opts && opts.title) || '暂无数据';
  const hint = (opts && opts.hint) || '';
  const panel = opts && opts.panel;
  return `
  <div class="empty-state${panel ? ' empty-state--panel' : ''}">
    <div class="empty-state-icon"><i class="fas ${icon}"></i></div>
    <div class="empty-state-title">${escapeHtml(title)}</div>
    ${hint ? `<div class="empty-state-hint">${escapeHtml(hint)}</div>` : ''}
  </div>`;
}

function isImageMime(mime) {
  return /^image\//i.test(mime || '');
}

function isImageFileName(name) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '');
}

function getTaskCommentMentionCandidates(task) {
  const names = new Set();
  if (task.assignee) names.add(task.assignee);
  (getCollaboratorEntries(task, { excludeRejected: true }) || []).forEach(e => names.add(e.userName));
  const project = getTaskProject(task);
  if (project?.manager) names.add(project.manager);
  names.delete(currentUser.name);
  return [...names].map(name => users.find(u => u.name === name) || { name });
}

function formatCommentContentHtml(content, task) {
  const candidates = new Set(getTaskCommentMentionCandidates(task).map(u => u.name));
  const parts = [];
  const regex = /[@＠]([\u4e00-\u9fa5A-Za-z0-9·]+)/g;
  let last = 0;
  let m;
  while ((m = regex.exec(content || '')) !== null) {
    parts.push(escapeHtml(content.slice(last, m.index)));
    const name = m[1];
    if (candidates.has(name)) {
      parts.push(`<span style="color:#10B981;font-weight:600;">@${escapeHtml(name)}</span>`);
    } else {
      parts.push(escapeHtml(m[0]));
    }
    last = m.index + m[0].length;
  }
  parts.push(escapeHtml((content || '').slice(last)));
  return parts.join('');
}

function parseCommentMentions(content, task) {
  const candidates = new Set(getTaskCommentMentionCandidates(task).map(u => u.name));
  const matches = (content || '').match(/[@＠]([\u4e00-\u9fa5A-Za-z0-9·]+)/g) || [];
  const names = matches.map(token => token.slice(1));
  return [...new Set(names.filter(n => candidates.has(n) && n !== currentUser.name))];
}

function extractClipboardImageFiles(event) {
  const items = event.clipboardData?.items;
  if (!items) return [];
  const files = [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

function clipboardFileName(file, prefix) {
  const ext = (file.type || '').split('/')[1] || 'png';
  const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'png';
  return `${prefix}-${Date.now()}.${safeExt}`;
}

async function getAuthedFileBlobUrl(fileId) {
  if (fileObjectUrlCache.has(fileId)) return fileObjectUrlCache.get(fileId);
  if (!ApiConfig.enabled || !authSession.token) throw new Error('未登录');
  const res = await fetch(ApiConfig.baseUrl + '/files/' + encodeURIComponent(fileId), {
    headers: { ...AuthService.getAuthHeaders() },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '加载失败');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  fileObjectUrlCache.set(fileId, url);
  return url;
}

async function hydrateAuthedImages(root) {
  if (!root) return;
  const imgs = root.querySelectorAll('img[data-authed-file]');
  for (const img of imgs) {
    const fileId = img.getAttribute('data-authed-file');
    if (!fileId || img.dataset.loaded === '1') continue;
    try {
      img.src = await getAuthedFileBlobUrl(fileId);
      img.dataset.loaded = '1';
    } catch (e) {
      img.alt = '加载失败';
    }
  }
}

function showImageLightbox(url) {
  if (!url) return;
  closeImageLightbox();
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  overlay.id = 'imageLightbox';
  overlay.onclick = closeImageLightbox;
  overlay.tabIndex = -1;
  overlay.onkeydown = (e) => { if (e.key === 'Escape') closeImageLightbox(); };
  const img = document.createElement('img');
  img.src = url;
  img.alt = '图片预览';
  img.onclick = (e) => e.stopPropagation();
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  overlay.focus();
}

function closeImageLightbox() {
  document.getElementById('imageLightbox')?.remove();
}

async function previewAuthedImage(fileId) {
  try {
    const url = await getAuthedFileBlobUrl(fileId);
    showImageLightbox(url);
  } catch (e) {
    alert(e.message || '预览失败');
  }
}

function ensureCommentDraft(taskId) {
  if (!commentDrafts[taskId]) commentDrafts[taskId] = { pendingImages: [] };
  return commentDrafts[taskId];
}

function renderCommentDraftImages(taskId) {
  const draft = commentDrafts[taskId];
  if (!draft?.pendingImages?.length) return '';
  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
      ${draft.pendingImages.map((entry, idx) => {
        const preview = entry.previewUrl
          ? `src="${entry.previewUrl}"`
          : `data-authed-file="${entry.item.fileId}"`;
        return `
        <div style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:var(--bg-panel);">
          <img ${preview} alt="待发送图片" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="event.stopPropagation();previewCommentDraftImage('${taskId}',${idx})">
          <button type="button" onclick="event.stopPropagation();removeCommentDraftImage('${taskId}',${idx})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;font-size:11px;line-height:18px;cursor:pointer;">×</button>
        </div>`;
      }).join('')}
    </div>
  `;
}

function previewCommentDraftImage(taskId, index) {
  const draft = commentDrafts[taskId];
  const entry = draft?.pendingImages?.[index];
  if (!entry) return;
  if (entry.previewUrl) {
    showImageLightbox(entry.previewUrl);
    return;
  }
  previewAuthedImage(entry.item.fileId);
}

function getTaskCommentMentionPortal() {
  let portal = document.getElementById('taskCommentMentionPortal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'taskCommentMentionPortal';
    portal.style.cssText = 'display:none;position:fixed;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);max-height:220px;overflow-y:auto;z-index:30001;';
    document.body.appendChild(portal);
  }
  return portal;
}

function bindTaskCommentMentionScroll() {
  if (taskCommentMentionScrollBound) return;
  taskCommentMentionScrollBound = true;
  const reposition = () => {
    if (taskCommentMentionTaskId) positionTaskCommentMentionDropdown(taskCommentMentionTaskId);
  };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
}

function hideTaskCommentMentionDropdown(taskId) {
  taskCommentMentionTaskId = null;
  const portal = document.getElementById('taskCommentMentionPortal');
  if (portal) {
    portal.style.display = 'none';
    portal.innerHTML = '';
  }
  if (taskId) {
    const legacy = document.getElementById('taskCommentMention-' + taskId);
    if (legacy) {
      legacy.style.display = 'none';
      legacy.innerHTML = '';
    }
  }
}

function positionTaskCommentMentionDropdown(taskId) {
  const ta = document.getElementById('taskCommentInput-' + taskId);
  const portal = document.getElementById('taskCommentMentionPortal');
  if (!ta || !portal || portal.style.display === 'none') return;
  const rect = ta.getBoundingClientRect();
  const width = Math.min(rect.width, window.innerWidth - 16);
  let left = Math.max(8, rect.left);
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  let top = rect.bottom + 4;
  const maxHeight = 220;
  if (top + maxHeight > window.innerHeight - 8) {
    top = Math.max(8, rect.top - maxHeight - 4);
  }
  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
  portal.style.width = `${width}px`;
}

function findActiveCommentMentionMatch(text, pos) {
  const before = text.slice(0, pos);
  return before.match(/[@＠]([\u4e00-\u9fa5A-Za-z0-9·]*)$/);
}

function updateTaskCommentMentionDropdown(taskId) {
  const ta = document.getElementById('taskCommentInput-' + taskId);
  if (!ta) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const pos = ta.selectionStart ?? ta.value.length;
  const atMatch = findActiveCommentMentionMatch(ta.value, pos);
  if (!atMatch) {
    hideTaskCommentMentionDropdown(taskId);
    return;
  }
  const filter = atMatch[1];
  const candidates = getTaskCommentMentionCandidates(task).filter(u =>
    !filter || u.name.includes(filter)
  );
  if (!candidates.length) {
    hideTaskCommentMentionDropdown(taskId);
    return;
  }
  bindTaskCommentMentionScroll();
  taskCommentMentionTaskId = taskId;
  const portal = getTaskCommentMentionPortal();
  portal.style.display = 'block';
  portal.innerHTML = candidates.map(u => `
    <button type="button" data-mention-name="${escapeHtml(u.name)}"
      onclick="insertTaskCommentMentionFromEl('${taskId}', this)"
      style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:var(--bg-panel);cursor:pointer;font-size:13px;color:var(--text);"
      onmouseover="this.style.background='#ECFDF5'" onmouseout="this.style.background='#fff'">
      @${escapeHtml(u.name)}
    </button>
  `).join('');
  positionTaskCommentMentionDropdown(taskId);
}

function insertTaskCommentMentionFromEl(taskId, el) {
  const name = el?.getAttribute?.('data-mention-name');
  if (!name) return;
  insertTaskCommentMention(taskId, name);
}

function removeCommentDraftImage(taskId, index) {
  const draft = commentDrafts[taskId];
  if (!draft?.pendingImages?.length) return;
  const entry = draft.pendingImages[index];
  if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  draft.pendingImages.splice(index, 1);
  state.showModal = 'taskDetail';
  state.form.taskId = taskId;
  render();
}

function insertTaskCommentMention(taskId, name) {
  const ta = document.getElementById('taskCommentInput-' + taskId);
  if (!ta) return;
  const pos = ta.selectionStart ?? ta.value.length;
  const before = ta.value.slice(0, pos);
  const after = ta.value.slice(pos);
  const atMatch = findActiveCommentMentionMatch(ta.value, pos);
  if (!atMatch) return;
  const prefix = before.slice(0, before.length - atMatch[0].length);
  const overlay = document.querySelector('.modal-overlay');
  const modalBoxScroll = overlay?.querySelector('.modal-box')?.scrollTop || 0;
  const modalBodyScroll = overlay?.querySelector('.modal-body')?.scrollTop || 0;
  ta.value = `${prefix}@${name} ${after}`;
  const cursor = prefix.length + name.length + 2;
  ta.focus();
  ta.setSelectionRange(cursor, cursor);
  hideTaskCommentMentionDropdown(taskId);
  requestAnimationFrame(() => {
    const box = overlay?.querySelector('.modal-box');
    const body = overlay?.querySelector('.modal-body');
    if (box) box.scrollTop = modalBoxScroll;
    if (body) body.scrollTop = modalBodyScroll;
  });
}

function handleTaskCommentInput(event, taskId) {
  const draft = ensureCommentDraft(taskId);
  draft.text = event.target?.value || '';
  updateTaskCommentMentionDropdown(taskId);
}

function handleTaskCommentKeydown(event, taskId) {
  if (event.key === 'Escape') {
    hideTaskCommentMentionDropdown(taskId);
    return;
  }
  setTimeout(() => updateTaskCommentMentionDropdown(taskId), 0);
}

function handleTaskCommentCompositionEnd(event, taskId) {
  setTimeout(() => updateTaskCommentMentionDropdown(taskId), 0);
}

async function handleTaskCommentPaste(event, taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !canPostTaskComment(task)) return;
  const files = extractClipboardImageFiles(event);
  if (!files.length) return;
  event.preventDefault();
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录并连接服务端后粘贴图片');
    return;
  }
  const draft = ensureCommentDraft(taskId);
  for (const file of files) {
    const previewUrl = URL.createObjectURL(file);
    try {
      const item = await uploadFileToEntity('task', taskId, file, clipboardFileName(file, 'comment'), 'comment');
      draft.pendingImages.push({ item, previewUrl });
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      alert(e.message || '图片上传失败');
    }
  }
  state.showModal = 'taskDetail';
  state.form.taskId = taskId;
  render();
}

async function handleEntityFilesPaste(event, entityType, entityId) {
  if (entityType !== 'task') return;
  const task = tasks.find(t => t.id === entityId);
  if (!task || !canUploadTaskAttachment(task)) return;
  const files = extractClipboardImageFiles(event);
  if (!files.length) return;
  event.preventDefault();
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录并连接服务端后粘贴图片');
    return;
  }
  for (const file of files) {
    try {
      await uploadFileToEntity('task', entityId, file, clipboardFileName(file, 'paste'), 'attachment');
    } catch (e) {
      alert(e.message || '图片上传失败');
    }
  }
  state.showModal = 'taskDetail';
  state.form.taskId = entityId;
  render();
}

function renderCommentAttachmentsHtml(attachments) {
  const images = (attachments || []).filter(a => isImageMime(a.mimeType) || isImageFileName(a.name));
  if (!images.length) return '';
  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
      ${images.map(img => `
        <img data-authed-file="${img.fileId}" alt="${escapeHtml(img.name || '图片')}"
          onclick="previewAuthedImage('${img.fileId}')"
          style="max-width:160px;max-height:120px;border-radius:8px;border:1px solid var(--border);cursor:pointer;object-fit:cover;">
      `).join('')}
    </div>
  `;
}

function renderTaskDiscussion(task) {
  const comments = Array.isArray(task.comments)
    ? task.comments.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : [];
  const canPost = canPostTaskComment(task);
  return `
    <div style="border-top:1px solid #E5E7EB;padding-top:16px;margin-top:16px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">
        <i class="fas fa-comments" style="color:#10B981;margin-right:6px;"></i>留言讨论 (${comments.length})
      </div>
      ${comments.length === 0 ? `
        <div style="font-size:12px;color:#9CA3AF;margin-bottom:12px;">暂无留言。项目负责人、协办人与任务负责人可在此沟通进度与问题。</div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;max-height:260px;overflow-y:auto;">
          ${comments.map(c => `
            <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;border:1px solid var(--border);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
                <span style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(c.author)}</span>
                <span style="font-size:11px;color:#9CA3AF;white-space:nowrap;">${escapeHtml(c.createdAt || '')}</span>
              </div>
              ${c.content ? `<div style="font-size:13px;color:#4B5563;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${formatCommentContentHtml(c.content, task)}</div>` : ''}
              ${renderCommentAttachmentsHtml(c.attachments)}
            </div>
          `).join('')}
        </div>
      `}
      ${canPost ? `
        <div style="padding:12px;background:#ECFDF5;border-radius:8px;border:1px solid #D1FAE5;">
          <textarea id="taskCommentInput-${task.id}" class="input" rows="3" style="width:100%;resize:vertical;font-size:13px;"
            placeholder="输入留言，输入 @ 可提及相关人员，Ctrl+V 可粘贴图片…"
            oninput="handleTaskCommentInput(event,'${task.id}')"
            onkeyup="handleTaskCommentInput(event,'${task.id}')"
            onkeydown="handleTaskCommentKeydown(event,'${task.id}')"
            oncompositionend="handleTaskCommentCompositionEnd(event,'${task.id}')"
            onpaste="handleTaskCommentPaste(event,'${task.id}')">${escapeHtml(commentDrafts[task.id]?.text || '')}</textarea>
          ${renderCommentDraftImages(task.id)}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap;">
            <div style="font-size:11px;color:#6B7280;">
              <i class="fas fa-at" style="margin-right:4px;color:#10B981;"></i>输入 @ 提及 · Ctrl+V 粘贴图片
            </div>
            <button class="btn btn-primary btn-sm" onclick="postTaskComment('${task.id}')"><i class="fas fa-paper-plane" style="margin-right:4px;"></i>发送留言</button>
          </div>
        </div>
      ` : `
        <div style="font-size:12px;color:#9CA3AF;"><i class="fas fa-lock" style="margin-right:4px;"></i>仅项目负责人、协办人及任务负责人可留言</div>
      `}
    </div>
  `;
}

async function postTaskComment(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !canPostTaskComment(task)) {
    alert('您没有留言权限');
    return;
  }
  const textarea = document.getElementById('taskCommentInput-' + taskId);
  const content = (textarea?.value || '').trim();
  const draft = commentDrafts[taskId] || { pendingImages: [] };
  const pendingImages = draft.pendingImages || [];
  if (!content && !pendingImages.length) {
    alert('请输入留言内容或粘贴图片');
    return;
  }
  if (content.length > 2000) {
    alert('留言内容不能超过 2000 字');
    return;
  }
  const mentions = parseCommentMentions(content, task);
  pendingImages.forEach(entry => {
    if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  });
  if (!Array.isArray(task.comments)) task.comments = [];
  task.comments.push({
    id: genId('C'),
    author: currentUser.name,
    content,
    mentions,
    attachments: pendingImages.map(entry => entry.item),
    createdAt: new Date().toLocaleString(),
  });
  if (Array.isArray(task.commentPendingFiles) && pendingImages.length) {
    const usedIds = new Set(pendingImages.map(e => e.item?.fileId).filter(Boolean));
    task.commentPendingFiles = task.commentPendingFiles.filter(f => !usedIds.has(f.fileId));
  }
  delete commentDrafts[taskId];
  save();
  if (mentions.length) {
    NotificationService.send(PushEventType.TASK_COMMENT_MENTION, {
      ...NotificationService.getTaskPayload(task),
      operator: currentUser.name,
      recipientNames: mentions,
      commentPreview: content ? content.slice(0, 120) : '[图片]',
    });
  }
  state.showModal = 'taskDetail';
  state.form.taskId = taskId;
  render();
}

function isWikiAttachment(item) {
  return item?.source === 'dingtalk_wiki';
}

function isExternalLinkAttachment(item) {
  return !!(item && !item.fileId && item.url && (item.source === 'aitable_link' || item.source === 'dingtalk_wiki'));
}

function openExternalAttachment(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function attachmentRefKey(item) {
  return item?.fileId || item?.id || '';
}

function taskAttachmentAlreadySynced(project, item) {
  if (!project || !item) return false;
  return (project.documents || []).some(doc =>
    (item.fileId && doc.fileId === item.fileId) ||
    (item.nodeId && doc.source === 'dingtalk_wiki' && doc.nodeId === item.nodeId) ||
    (item.id && doc.syncedFromAttachmentId === item.id)
  );
}

function syncTaskAttachmentToProject(project, task, item) {
  if (!project || !task?.projectId || task.projectId !== project.id || !item) return false;
  if (taskAttachmentAlreadySynced(project, item)) return false;
  if (!Array.isArray(project.documents)) project.documents = [];
  project.documents.push({
    ...item,
    id: genId('DOC'),
    syncedFromTaskId: task.id,
    syncedFromAttachmentId: item.id,
  });
  return true;
}

function backfillTaskAttachmentsToProjectsLocal() {
  const projectById = new Map(projects.map(p => [p.id, p]));
  let synced = 0;
  let skipped = 0;
  const projectIds = new Set();

  for (const task of tasks) {
    if (!task?.projectId || !Array.isArray(task.attachments) || !task.attachments.length) continue;
    const project = projectById.get(task.projectId);
    if (!project) continue;
    for (const item of task.attachments) {
      if (taskAttachmentAlreadySynced(project, item)) {
        skipped += 1;
        continue;
      }
      if (syncTaskAttachmentToProject(project, task, item)) {
        synced += 1;
        projectIds.add(project.id);
      }
    }
  }

  return { synced, skipped, projectsTouched: projectIds.size };
}

async function syncTaskAttachmentsFromServer() {
  if (!isFullAccess(currentUser.role)) {
    alert('仅总经理/管理员可执行');
    return;
  }
  if (!confirm('将把历史任务附件补同步到所属项目的「项目文档」中（已存在的不会重复添加）。是否继续？')) return;

  if (ApiConfig.enabled && authSession.token) {
    try {
      const res = await fetch(ApiConfig.baseUrl + '/data/admin/sync-task-attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
        body: '{}',
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || '同步失败');
        return;
      }
      await DataService.loadFromServer();
      render();
      alert(data.message || '同步完成');
    } catch (e) {
      alert('同步失败：' + e.message);
    }
    return;
  }

  const result = backfillTaskAttachmentsToProjectsLocal();
  if (result.synced > 0) save();
  render();
  alert(
    result.synced > 0
      ? `已同步 ${result.synced} 个任务附件到 ${result.projectsTouched} 个项目（本地数据）`
      : '无需同步，任务附件均已存在于项目文档中'
  );
}

function openDingTalkDoc(url) {
  if (!url) {
    alert('文档链接无效');
    return;
  }
  if (typeof dd !== 'undefined' && dd.openLink) {
    dd.openLink({
      url,
      fail: () => window.open(url, '_blank'),
    });
  } else {
    window.open(url, '_blank');
  }
}

async function parseApiJsonResponse(res, fallbackMessage) {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok && data && !data.message) {
      data.message = data.message || `${fallbackMessage || '请求失败'}（HTTP ${res.status}）`;
    }
    return data;
  } catch {
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error(
        (fallbackMessage || '接口请求失败') +
        `：服务器返回了网页而非 JSON（HTTP ${res.status}）。` +
        '请确认后端已重启到最新版本，且访问地址正确。'
      );
    }
    throw new Error((fallbackMessage || '接口请求失败') + `：${text.slice(0, 120)}`);
  }
}

async function submitWikiDocLink(entityType, entityId, payload, opts) {
  const silent = !!(opts && opts.silent);
  const skipClose = !!(opts && opts.skipClose);
  const res = await fetch(ApiConfig.baseUrl + '/files/link-dingtalk-doc', {
    method: 'POST',
    headers: {
      ...AuthService.getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entityType, entityId, ...payload }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await parseApiJsonResponse(res, '添加钉钉文档失败');
  if (!data.success) throw new Error(data.message || '添加失败');
  if (entityType === 'project') {
    const p = projects.find(x => x.id === entityId);
    if (p) {
      if (!p.documents) p.documents = [];
      upsertLocalAttachment(p.documents, data.item);
      const purpose = payload && (payload.linkPurpose || payload.purpose);
      if (typeof applyPhaseSlotMetaFromPurpose === 'function') {
        applyPhaseSlotMetaFromPurpose(data.item, purpose);
        const doc = (p.documents || []).find(d =>
          (data.item.fileId && d.fileId === data.item.fileId) ||
          (data.item.id && d.id === data.item.id) ||
          (data.item.nodeId && d.nodeId === data.item.nodeId)
        ) || data.item;
        applyPhaseSlotMetaFromPurpose(doc, purpose);
      }
    }
  } else {
    const t = tasks.find(x => x.id === entityId);
    if (t) {
      if (!t.attachments) t.attachments = [];
      upsertLocalAttachment(t.attachments, data.item);
      if (t.projectId) {
        const p = projects.find(x => x.id === t.projectId);
        if (p) syncTaskAttachmentToProject(p, t, data.item);
      }
    }
  }
  if (silent) {
    persistLocalCache();
    return data.item;
  }
  save();
  if (!skipClose) {
    state.showModal = null;
    render();
  }
  return data.item;
}

function upsertLocalAttachment(list, item) {
  if (!item || !Array.isArray(list)) return;
  const idx = list.findIndex(a =>
    (item.id && a.id === item.id) ||
    (item.nodeId && a.source === 'dingtalk_wiki' && a.nodeId === item.nodeId) ||
    (item.fileId && a.fileId === item.fileId)
  );
  if (idx >= 0) list[idx] = { ...list[idx], ...item };
  else list.push(item);
}

const wikiNodeLookup = {};

function rememberWikiNodes(nodes) {
  (nodes || []).forEach(n => {
    if (n?.nodeId) wikiNodeLookup[n.nodeId] = n;
  });
}

function getSelectedWikiWorkspace() {
  return (state.form.wikiWorkspaces || []).find(w => w.workspaceId === state.form.wikiSelectedWorkspaceId) || null;
}

/** 将 API 返回的文档库拆成「我的文档 / 团队知识库」（兼容旧版仅返回 workspaces 的后端） */
function splitWikiWorkspacesForSidebar(allWorkspaces, personalWorkspaces, teamWorkspaces) {
  const personal = [...(personalWorkspaces || [])];
  const team = [...(teamWorkspaces || [])];
  if (personal.length || team.length) {
    return { personal, team };
  }
  const all = allWorkspaces || [];
  for (const ws of all) {
    if (String(ws.type || '').toUpperCase() === 'PERSONAL') {
      personal.push({ ...ws, name: ws.name || '我的文档' });
    } else {
      team.push(ws);
    }
  }
  if (!personal.length && !team.length && all.length) {
    team.push(...all);
  }
  return { personal, team };
}

function applyWikiWorkspaceLists(data) {
  const allWorkspaces = data.workspaces || [
    ...(data.personalWorkspaces || []),
    ...(data.teamWorkspaces || []),
  ];
  const split = splitWikiWorkspacesForSidebar(
    allWorkspaces,
    data.personalWorkspaces,
    data.teamWorkspaces
  );
  state.form.wikiWorkspaces = allWorkspaces;
  state.form.wikiPersonalWorkspaces = split.personal;
  state.form.wikiTeamWorkspaces = split.team;
  state.form.wikiMineError = data.mineError || '';
  state.form.wikiBindError = data.bindError || '';
  if (!split.personal.length && allWorkspaces.length && !data.personalWorkspaces && !data.mineError) {
    state.form.wikiMineError = '「我的文档」需重启后端后加载；当前仅显示团队知识库';
  }
  return allWorkspaces;
}

async function showWikiDocPicker(entityType, entityId, opts) {
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录并连接服务端后添加钉钉文档');
    return;
  }
  const pendingMode = !!(opts && opts.pendingMode);
  const returnToDelivery = !!(opts && opts.returnToDelivery);
  if (pendingMode) {
    state._wikiPickerReturn = {
      kind: 'pending',
      showModal: state.showModal || 'quickCreate',
      form: state.form,
    };
  } else if (returnToDelivery) {
    state._wikiPickerReturn = {
      kind: 'delivery',
      inlineDeliveryEditId: state.inlineDeliveryEditId,
      editingDeliveryTaskId: state.editingDeliveryTaskId,
      deliveryForm: state.deliveryForm,
      page: state.page,
      currentProjectId: state.currentProjectId,
      form: { projectId: state.currentProjectId || (state.form && state.form.projectId) || '' },
    };
  } else {
    state._wikiPickerReturn = null;
  }
  Object.keys(wikiNodeLookup).forEach(k => { delete wikiNodeLookup[k]; });
  state.form = {
    wikiEntityType: entityType,
    wikiEntityId: entityId,
    wikiPendingMode: pendingMode,
    wikiWorkspaces: [],
    wikiPersonalWorkspaces: [],
    wikiTeamWorkspaces: [],
    wikiSelectedWorkspaceId: '',
    wikiExpanded: {},
    wikiChildren: {},
    wikiLoadingKey: 'workspaces',
    wikiSelectedNode: null,
    wikiError: '',
    wikiMineError: '',
    wikiBindError: '',
    wikiSearch: '',
    wikiLinkPurpose: (opts && opts.linkPurpose) || '',
  };
  state.showModal = 'wikiDocPicker';
  render();
  await loadWikiWorkspacesList();
}

async function loadWikiWorkspacesList() {
  state.form.wikiLoadingKey = 'workspaces';
  state.form.wikiError = '';
  render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/files/wiki/workspaces', {
      headers: { ...AuthService.getAuthHeaders() },
      signal: AbortSignal.timeout(30000),
    });
    const data = await parseApiJsonResponse(res, '加载文档库失败');
    if (!data.success) throw new Error(data.message || '加载文档库失败');
    const allWorkspaces = applyWikiWorkspaceLists(data);
    if (allWorkspaces.length) {
      const defaultWs = state.form.wikiPersonalWorkspaces[0]
        || allWorkspaces.find(ws => ws.type === 'PERSONAL' && ws.accessibleVia === currentUser.name)
        || allWorkspaces[0];
      await selectWikiWorkspace(defaultWs.workspaceId, { skipRender: true });
    } else {
      state.form.wikiError = state.form.wikiBindError
        || '暂无可访问的文档库。请确认已绑定钉钉 userid/unionId，并重新同步通讯录';
    }
    state.form.wikiLoadingKey = '';
    render();
  } catch (e) {
    state.form.wikiLoadingKey = '';
    state.form.wikiError = e.message || '加载知识库失败';
    render();
  }
}

async function selectWikiWorkspace(workspaceId, opts) {
  const ws = (state.form.wikiWorkspaces || []).find(w => w.workspaceId === workspaceId);
  if (!ws) return;
  state.form.wikiSelectedWorkspaceId = workspaceId;
  state.form.wikiSelectedNode = null;
  state.form.wikiExpanded = {};
  state.form.wikiChildren = {};
  state.form.wikiError = '';
  if (!opts?.skipRender) render();
  if (ws.rootNodeId) {
    state.form.wikiExpanded[ws.rootNodeId] = true;
    await loadWikiTreeNodes(ws.rootNodeId, workspaceId);
  } else {
    render();
  }
}

async function loadWikiTreeNodes(parentNodeId, workspaceId) {
  if (!parentNodeId || state.form.wikiChildren[parentNodeId]) return;
  const wsId = workspaceId || state.form.wikiSelectedWorkspaceId || '';
  state.form.wikiLoadingKey = parentNodeId;
  render();
  try {
    const qs = new URLSearchParams({ parentNodeId });
    if (wsId) qs.set('workspaceId', wsId);
    const res = await fetch(
      ApiConfig.baseUrl + '/files/wiki/nodes?' + qs.toString(),
      {
        headers: { ...AuthService.getAuthHeaders() },
        signal: AbortSignal.timeout(30000),
      }
    );
    const data = await parseApiJsonResponse(res, '加载目录失败');
    if (!data.success) throw new Error(data.message || '加载目录失败');
    state.form.wikiChildren[parentNodeId] = data.nodes || [];
    rememberWikiNodes(data.nodes);
    state.form.wikiLoadingKey = '';
    render();
  } catch (e) {
    state.form.wikiLoadingKey = '';
    state.form.wikiError = e.message || '加载目录失败';
    render();
  }
}

async function toggleWikiTreeNodeById(nodeId) {
  const node = wikiNodeLookup[nodeId];
  if (!node) return;
  if (node.type !== 'FOLDER') {
    state.form.wikiSelectedNode = node;
    render();
    return;
  }
  const expanded = !!state.form.wikiExpanded[node.nodeId];
  state.form.wikiExpanded[node.nodeId] = !expanded;
  if (!expanded) await loadWikiTreeNodes(node.nodeId, node.workspaceId || state.form.wikiSelectedWorkspaceId);
  else render();
}

async function onWikiTreeNodeDblClick(nodeId) {
  const node = wikiNodeLookup[nodeId];
  if (!node || node.type === 'FOLDER') return;
  state.form.wikiSelectedNode = node;
  await confirmWikiDocPicker();
}

function getWikiDocTreeHtml() {
  const selectedWs = getSelectedWikiWorkspace();
  if (!selectedWs) {
    return `<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:12px;">请先在左侧选择「我的文档」或团队知识库</div>`;
  }
  if (!selectedWs.rootNodeId) {
    return `<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:12px;">知识库根节点不可用</div>`;
  }
  return renderWikiTreeBranch(selectedWs.rootNodeId, 0)
    || `<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:12px;">该目录下暂无文档</div>`;
}

function refreshWikiDocTree() {
  const el = document.getElementById('wiki-doc-tree');
  if (!el) return;
  el.innerHTML = getWikiDocTreeHtml();
}

function setWikiDocSearch(value) {
  state.form.wikiSearch = value;
  refreshWikiDocTree();
}

function wikiNodeMatchesSearch(node, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  return String(node.name || '').toLowerCase().includes(q);
}

function renderWikiTreeBranch(parentNodeId, depth) {
  const nodes = (state.form.wikiChildren[parentNodeId] || []).filter(n =>
    wikiNodeMatchesSearch(n, (state.form.wikiSearch || '').trim())
  );
  const loadingKey = state.form.wikiLoadingKey;
  return nodes.map(node => {
    const isFolder = node.type === 'FOLDER';
    const expanded = !!state.form.wikiExpanded[node.nodeId];
    const selected = state.form.wikiSelectedNode?.nodeId === node.nodeId;
    const padding = 12 + depth * 16;
    const icon = isFolder
      ? (expanded ? 'fa-folder-open' : 'fa-folder')
      : 'fa-file-alt';
    const iconColor = isFolder ? '#D97706' : '#0089FF';
    let html = `
      <div onclick="toggleWikiTreeNodeById('${node.nodeId}')"
        ${isFolder ? '' : `ondblclick="event.stopPropagation();onWikiTreeNodeDblClick('${node.nodeId}')"`}
        style="display:flex;align-items:center;gap:8px;padding:8px 10px 8px ${padding}px;cursor:pointer;border-radius:6px;
          background:${selected ? '#EFF6FF' : 'transparent'};border:1px solid ${selected ? '#BFDBFE' : 'transparent'};"
        onmouseover="if(!${selected})this.style.background='#F9FAFB'"
        onmouseout="if(!${selected})this.style.background='${selected ? '#EFF6FF' : 'transparent'}'">
        ${isFolder ? `<i class="fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="width:12px;font-size:10px;color:#9CA3AF;"></i>` : '<span style="width:12px;"></span>'}
        <i class="fas ${icon}" style="color:${iconColor};width:16px;text-align:center;"></i>
        <span style="flex:1;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(node.name || '')}">${escapeHtml(node.name || '未命名')}</span>
        ${!isFolder && node.extension ? `<span style="font-size:10px;color:#9CA3AF;">.${escapeHtml(node.extension)}</span>` : ''}
      </div>`;
    if (isFolder && expanded) {
      if (loadingKey === node.nodeId && !state.form.wikiChildren[node.nodeId]) {
        html += `<div style="padding:4px 10px 4px ${padding + 28}px;font-size:12px;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> 加载中…</div>`;
      } else {
        html += renderWikiTreeBranch(node.nodeId, depth + 1);
      }
    }
    return html;
  }).join('');
}

function formatWikiErrorHtml(message) {
  const text = String(message || '');
  const escaped = escapeHtml(text);
  return escaped.replace(
    /(https:\/\/open-dev\.dingtalk\.com[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:#B91C1C;text-decoration:underline;word-break:break-all;">点击申请权限</a>'
  ).replace(/\n/g, '<br>');
}

function renderWikiWorkspaceSidebarItem(ws) {
  const selected = ws.workspaceId === state.form.wikiSelectedWorkspaceId;
  const isPersonal = String(ws.type || '').toUpperCase() === 'PERSONAL';
  return `
    <button type="button" onclick="selectWikiWorkspace('${ws.workspaceId}')"
      style="width:100%;text-align:left;padding:8px 10px;margin-bottom:4px;border-radius:6px;border:1px solid ${selected ? '#BFDBFE' : 'transparent'};
        background:${selected ? '#EFF6FF' : '#fff'};cursor:pointer;">
      <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(ws.name)}">${escapeHtml(ws.name)}</div>
      <div style="font-size:10px;color:#9CA3AF;margin-top:2px;">${isPersonal ? '我的文档' : '团队知识库'}${ws.accessibleVia && !ws.isOwn ? ' · 来自 ' + escapeHtml(ws.accessibleVia) : ''}</div>
    </button>`;
}

function renderWikiWorkspaceSidebar() {
  const split = splitWikiWorkspacesForSidebar(
    state.form.wikiWorkspaces,
    state.form.wikiPersonalWorkspaces,
    state.form.wikiTeamWorkspaces
  );
  const personal = split.personal;
  const team = split.team;
  const loadingWorkspaces = state.form.wikiLoadingKey === 'workspaces';
  if (loadingWorkspaces) {
    return `<div style="padding:12px;font-size:12px;color:#9CA3AF;text-align:center;"><i class="fas fa-spinner fa-spin"></i> 加载中…</div>`;
  }
  if (!personal.length && !team.length) {
    const hint = state.form.wikiBindError || state.form.wikiMineError || '暂无文档库';
    return `<div style="padding:12px;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.6;">${escapeHtml(hint)}</div>`;
  }
  let html = '';
  html += `<div style="padding:4px 6px 6px;font-size:11px;font-weight:700;color:#0089FF;letter-spacing:0.02em;">我的文档</div>`;
  if (personal.length) {
    html += personal.map(renderWikiWorkspaceSidebarItem).join('');
  } else {
    html += `<div style="padding:4px 10px 10px;font-size:11px;color:#9CA3AF;line-height:1.5;">${state.form.wikiMineError ? escapeHtml(state.form.wikiMineError) : '暂无可用的个人文档库'}</div>`;
  }
  html += `<div style="margin-top:8px;padding:4px 6px 6px;font-size:11px;font-weight:700;color:#10B981;letter-spacing:0.02em;">团队知识库</div>`;
  if (team.length) {
    html += team.map(renderWikiWorkspaceSidebarItem).join('');
  } else {
    html += `<div style="padding:4px 10px;font-size:11px;color:#9CA3AF;">暂无团队知识库</div>`;
  }
  return html;
}

function renderWikiDocPickerModal() {
  const selectedWs = getSelectedWikiWorkspace();
  const selectedNode = state.form.wikiSelectedNode;
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:760px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-sitemap" style="color:#0089FF;margin-right:8px;"></i>选择钉钉文档</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="padding-top:0;">
          ${state.form.wikiError ? `
            <div style="padding:10px 12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;color:#B91C1C;font-size:12px;margin-bottom:12px;">
              <i class="fas fa-exclamation-circle" style="margin-right:6px;"></i>${formatWikiErrorHtml(state.form.wikiError)}
            </div>
          ` : ''}
          <div style="display:flex;gap:12px;min-height:360px;">
            <div style="width:200px;flex-shrink:0;border:1px solid var(--border);border-radius:8px;background:var(--bg-muted);overflow:hidden;display:flex;flex-direction:column;">
              <div style="padding:10px 12px;font-size:12px;font-weight:600;color:#6B7280;border-bottom:1px solid #E5E7EB;">知识库 / 我的文档</div>
              <div style="flex:1;overflow-y:auto;padding:6px;">
                ${renderWikiWorkspaceSidebar()}
              </div>
            </div>
            <div style="flex:1;border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);overflow:hidden;display:flex;flex-direction:column;">
              <div style="padding:10px 12px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:8px;">
                <span style="font-size:12px;font-weight:600;color:#6B7280;flex-shrink:0;">${selectedWs ? escapeHtml(selectedWs.name || '目录') : '目录'}</span>
                <input type="text" placeholder="搜索当前已加载的文档…" value="${escapeHtml(state.form.wikiSearch || '')}"
                  oninput="setWikiDocSearch(this.value)"
                  style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;">
              </div>
              <div id="wiki-doc-tree" style="flex:1;overflow-y:auto;padding:6px;">
                ${getWikiDocTreeHtml()}
              </div>
            </div>
          </div>
          <div style="margin-top:12px;padding:10px 12px;background:var(--bg-muted);border-radius:8px;border:1px solid var(--border);font-size:12px;color:#6B7280;line-height:1.6;">
            ${selectedNode
              ? `已选：<strong style="color:var(--text);">${escapeHtml(selectedNode.name || '未命名')}</strong>`
              : '请在左侧选择「我的文档」或团队知识库，再在右侧目录中选择具体文档；双击文档可直接确认添加（文件夹不可添加）'}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button type="button" class="btn btn-primary" onclick="confirmWikiDocPicker()" ${selectedNode ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"'}>
            <i class="fas fa-check"></i> 确认添加
          </button>
        </div>
      </div>
    </div>
  `;
}

function restoreWikiPickerDeliveryReturn(ret) {
  const r = ret || state._wikiPickerReturn;
  state._wikiPickerReturn = null;
  if (!r || r.kind !== 'delivery') return false;
  state.inlineDeliveryEditId = r.inlineDeliveryEditId || null;
  state.editingDeliveryTaskId = r.editingDeliveryTaskId || null;
  state.deliveryForm = r.deliveryForm || null;
  state.page = r.page || state.page;
  if (r.currentProjectId) state.currentProjectId = r.currentProjectId;
  state.form = r.form && r.form.projectId ? { projectId: r.form.projectId } : (state.form || {});
  state.projectDetailTab = 'work';
  state.projectPlanView = 'list';
  state.showModal = null;
  return true;
}

function restoreWikiPickerReturnForm() {
  const ret = state._wikiPickerReturn;
  state._wikiPickerReturn = null;
  if (!ret?.form) {
    state.showModal = null;
    state.form = {};
    return false;
  }
  state.form = ret.form;
  state.showModal = ret.showModal || 'quickCreate';
  return true;
}

async function confirmWikiDocPicker() {
  const node = state.form.wikiSelectedNode;
  if (!node) {
    alert('请选择要添加的文档');
    return;
  }
  if (state.form.wikiPendingMode) {
    if (!restoreWikiPickerReturnForm()) {
      render();
      return;
    }
    const pending = ensureQuickCreatePendingAttachments();
    if (pending.some(x => x.kind === 'dingtalk_wiki' && x.nodeId === node.nodeId)) {
      alert('该钉钉文档已添加');
      render();
      return;
    }
    pending.push({
      localId: genId('PA'),
      kind: 'dingtalk_wiki',
      nodeId: node.nodeId,
      workspaceId: node.workspaceId || '',
      name: node.name || '钉钉文档',
      url: node.url || '',
      docType: node.type || '',
    });
    render();
    return;
  }
  try {
    const deliveryReturn = state._wikiPickerReturn && state._wikiPickerReturn.kind === 'delivery'
      ? state._wikiPickerReturn
      : null;
    const linkPurpose = state.form.wikiLinkPurpose || '';
    await submitWikiDocLink(state.form.wikiEntityType, state.form.wikiEntityId, {
      nodeId: node.nodeId,
      workspaceId: node.workspaceId,
      linkPurpose,
    }, { skipClose: !!deliveryReturn });
    state.showModal = null;
    if (deliveryReturn) restoreWikiPickerDeliveryReturn(deliveryReturn);
    else state._wikiPickerReturn = null;
    render();
  } catch (e) {
    alert(e.message || '添加钉钉文档失败');
  }
}

async function linkDingTalkDocToEntity(entityType, entityId) {
  await showWikiDocPicker(entityType, entityId);
}

function canDeleteEntityFile(item, canUpload) {
  return canUpload || (item.uploadedBy === currentUser.name);
}

function renderEntityFiles(items, opts) {
  const { entityType, entityId, canUpload, title, emptyHint } = opts;
  const list = items || [];
  const zoneId = `entityFiles-${entityType}-${entityId}`;
  return `
    <div id="${zoneId}" tabindex="0"
      ${canUpload && entityType === 'task' ? `onpaste="handleEntityFilesPaste(event,'${entityType}','${entityId}')"` : ''}
      style="margin-bottom:16px;padding:12px;background:var(--bg-muted);border-radius:8px;border:1px solid var(--border);outline:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:13px;font-weight:600;color:var(--text);"><i class="fas fa-paperclip" style="margin-right:6px;color:#10B981;"></i>${title} (${list.length})</span>
        ${canUpload && ApiConfig.enabled ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="showWikiDocPicker('${entityType}','${entityId}')">
              <i class="fas fa-link"></i> 钉钉文档
            </button>
            <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0;">
              <i class="fas fa-upload"></i> 上传
              <input type="file" style="display:none;" onchange="uploadEntityFile('${entityType}','${entityId}',event)">
            </label>
          </div>
        ` : ''}
      </div>
      ${canUpload && entityType === 'task' && ApiConfig.enabled ? `
        <div style="font-size:11px;color:#6B7280;margin-bottom:8px;"><i class="fas fa-paste" style="margin-right:4px;color:#10B981;"></i>点击此区域后 Ctrl+V 可粘贴图片</div>
      ` : ''}
      ${list.length === 0 ? `<div style="font-size:12px;color:#9CA3AF;">${emptyHint}</div>` : `
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${list.map(item => {
            const safeName = (item.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const refKey = attachmentRefKey(item);
            const wiki = isWikiAttachment(item);
            const externalLink = isExternalLinkAttachment(item);
            const isImg = !wiki && !externalLink && (isImageMime(item.mimeType) || isImageFileName(item.name));
            const safeUrl = (item.url || item.sourceUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-panel);border-radius:6px;border:1px solid var(--border);">
              ${wiki || externalLink ? `
                <i class="fas fa-file-alt" style="color:#0089FF;font-size:18px;width:40px;text-align:center;" title="${externalLink ? '表单外链附件' : '钉钉文档'}"></i>
              ` : isImg ? `
                <img data-authed-file="${item.fileId}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewAuthedImage('${item.fileId}')">
              ` : `<i class="fas fa-file" style="color:#6B7280;"></i>`}
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.name || ''}">${item.name || '未命名'}${wiki ? ' <span style="font-size:10px;color:#0089FF;">· 钉钉</span>' : ''}${externalLink ? ' <span style="font-size:10px;color:#059669;">· 外链</span>' : ''}</div>
                <div style="font-size:11px;color:#9CA3AF;">${wiki || externalLink ? (externalLink ? '表单附件链接' : '在线文档') : formatFileSize(item.size)} · ${item.uploadedBy || '-'} · ${(item.uploadedAt || '').slice(0, 10)}</div>
              </div>
              ${wiki ? `
                <button class="btn btn-ghost btn-sm" onclick="openDingTalkDoc('${safeUrl}')" title="打开"><i class="fas fa-external-link-alt"></i></button>
              ` : externalLink ? `
                <button class="btn btn-ghost btn-sm" onclick="openExternalAttachment('${safeUrl}')" title="打开"><i class="fas fa-external-link-alt"></i></button>
              ` : `
                <button class="btn btn-ghost btn-sm" onclick="downloadEntityFile('${item.fileId}','${safeName}')" title="下载"><i class="fas fa-download"></i></button>
              `}
              ${canDeleteEntityFile(item, canUpload) && ApiConfig.enabled ? `
                <button class="btn btn-ghost btn-sm" onclick="deleteEntityFile('${entityType}','${entityId}','${refKey}')" title="删除" style="color:#DC2626;"><i class="fas fa-trash-alt"></i></button>
              ` : ''}
            </div>`;
          }).join('')}
        </div>
      `}
      ${!ApiConfig.enabled ? '<div style="font-size:11px;color:#D97706;margin-top:8px;"><i class="fas fa-info-circle"></i> 附件上传需连接服务端</div>' : ''}
    </div>
  `;
}

async function uploadFileToEntity(entityType, entityId, file, fileName, uploadPurpose) {
  if (!ApiConfig.enabled || !authSession.token) {
    throw new Error('请登录并连接服务端后上传附件');
  }
  const form = new FormData();
  form.append('file', file, fileName || file.name);
  form.append('entityType', entityType);
  form.append('entityId', entityId);
  if (uploadPurpose) form.append('uploadPurpose', uploadPurpose);
  const res = await fetch(ApiConfig.baseUrl + '/files/upload', {
    method: 'POST',
    headers: { ...AuthService.getAuthHeaders() },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || '上传失败');
  if (uploadPurpose === 'comment') {
    const t = tasks.find(x => x.id === entityId);
    if (t) {
      if (!Array.isArray(t.commentPendingFiles)) t.commentPendingFiles = [];
      t.commentPendingFiles.push(data.item);
      save();
    }
    return data.item;
  }
  if (entityType === 'project') {
    const p = projects.find(x => x.id === entityId);
    if (p) {
      if (!p.documents) p.documents = [];
      p.documents.push(data.item);
    }
  } else {
    const t = tasks.find(x => x.id === entityId);
    if (t) {
      if (!t.attachments) t.attachments = [];
      if (uploadPurpose === 'evidence' && data.item) data.item.purpose = 'evidence';
      t.attachments.push(data.item);
      if (t.projectId) {
        const p = projects.find(x => x.id === t.projectId);
        if (p) syncTaskAttachmentToProject(p, t, data.item);
      }
    }
  }
  save();
  return data.item;
}

async function uploadEntityFile(entityType, entityId, event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    await uploadFileToEntity(entityType, entityId, file, file.name, 'attachment');
    render();
  } catch (e) {
    alert(e.message || '上传失败');
  }
}

async function downloadEntityFile(fileId, fileName) {
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录后下载');
    return;
  }
  try {
    const res = await fetch(ApiConfig.baseUrl + '/files/' + encodeURIComponent(fileId), {
      headers: { ...AuthService.getAuthHeaders() },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '下载失败');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || '下载失败');
  }
}

async function deleteEntityFile(entityType, entityId, refKey) {
  if (!confirm('确定删除该附件？')) return;
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录后操作');
    return;
  }
  try {
    const qs = new URLSearchParams({
      entityType,
      entityId,
    });
    const res = await fetch(ApiConfig.baseUrl + '/files/' + encodeURIComponent(refKey) + '?' + qs.toString(), {
      method: 'DELETE',
      headers: { ...AuthService.getAuthHeaders() },
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '删除失败');
    if (entityType === 'project') {
      const p = projects.find(x => x.id === entityId);
      if (p && p.documents) {
        p.documents = p.documents.filter(d => d.fileId !== refKey && d.id !== refKey);
      }
    } else {
      const t = tasks.find(x => x.id === entityId);
      if (t && t.attachments) {
        t.attachments = t.attachments.filter(a => a.fileId !== refKey && a.id !== refKey);
      }
    }
    save();
    render();
  } catch (e) {
    alert(e.message || '删除失败');
  }
}

function renderTaskCard(task, opts = {}) {
  const displayStatus = getTaskDisplayStatus(task);
  const st = statusMap[displayStatus] || statusMap[task.status];
  const pr = priorityMap[task.priority];
  const isTemp = task.type === 'temp';
  const progress = getDisplayProgress(task);

  // 获取子任务
  const children = tasks.filter(t => t.parentId === task.id);

  let cardMod = '';
  if (task.status === 'abolished') cardMod = 'task-card--abolished';
  else if (isOverdue(task)) cardMod = 'task-card--overdue';
  else if (isDueSoon(task)) cardMod = 'task-card--duesoon';
  else if (task.status === 'doing') cardMod = 'task-card--doing';
  else if (task.status === 'done') cardMod = 'task-card--done';

  return `
    <div class="task-card ${cardMod}" onclick="viewTask('${task.id}')">
      ${renderTaskCardContext(task, opts)}
      <div class="task-card-header">
        <span class="priority-dot priority-${task.priority}" style="margin-top:5px;"></span>
        <span class="task-card-title" style="${task.status === 'abolished' ? 'text-decoration:line-through;color:#9CA3AF;' : ''}">${task.title}${renderDependencyBadges(task, true)}</span>
        ${isTemp ? '<span class="tag tag-temp"><i class="fas fa-bolt"></i>临时</span>' : ''}
        ${renderIntakeSourceTag(task, true)}
        ${renderIntakeHoursHint(task, true)}
        ${task.collaborators && task.collaborators.includes(currentUser.name) && task.assignee !== currentUser.name ? `<span class="tag" style="background:#ECFDF5;color:#10B981;font-size:10px;"><i class="fas fa-hands-helping"></i>${isAssistCollaborator(task) ? '辅助协办' : '告知协办'}</span>` : ''}
        ${task.status === 'abolished' ? '<span class="tag" style="background:var(--bg-muted);color:#9CA3AF;"><i class="fas fa-ban"></i>已作废</span>' : ''}
        <span class="status-tag status-${task.status === 'abolished' ? task.status : displayStatus}">
          <i class="fas ${st.icon}"></i>${st.label}
        </span>
      </div>
      <div class="task-card-meta">
        <span><i class="fas fa-user" style="margin-right:4px;"></i>${task.assignee}</span>
        <span style="${isOverdue(task) && task.status !== 'abolished' ? 'color:#DC2626;font-weight:600;' : isDueSoon(task) ? 'color:#D97706;font-weight:600;' : ''}"><i class="fas fa-calendar" style="margin-right:4px;"></i>${normalizeDateStr(resolveTaskDueDate(task)) || task.dueDate || '-'}</span>
      </div>
      ${task.status !== 'done' && task.status !== 'abolished' ? `
      <div class="task-card-progress">
        <div class="task-card-progress-row">
          <span>进度</span>
          <strong>${progress}%</strong>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%;"></div></div>
      </div>
      ` : ''}
      ${children.length > 0 ? `
      <div class="subtask-list">
        <div style="font-size:11px;color:#059669;font-weight:500;margin-bottom:4px;"><i class="fas fa-sitemap" style="margin-right:4px;"></i>子任务 (${children.length})</div>
        ${children.slice(0, 3).map(c => {
          const cSt = statusMap[c.status] || statusMap.todo;
          return `
            <div class="subtask-item">
              <i class="fas ${c.status === 'done' ? 'fa-check-circle' : c.status === 'abolished' ? 'fa-ban' : 'fa-circle'}" style="color:${c.status === 'done' ? '#059669' : c.status === 'abolished' ? '#9CA3AF' : '#D1D5DB'};"></i>
              <span style="flex:1;${c.status === 'abolished' ? 'text-decoration:line-through;color:#9CA3AF;' : ''}">${c.title}</span>
              <span style="color:#9CA3AF;">${c.assignee}</span>
            </div>
          `;
        }).join('')}
        ${children.length > 3 ? `<div style="font-size:10px;color:#2563EB;margin-top:4px;">还有 ${children.length - 3} 个子任务...</div>` : ''}
      </div>
      ` : ''}
    </div>
  `;
}
