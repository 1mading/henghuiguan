// ========== 项目甘特图（只读） ==========
const FRAPPE_GANTT_JS = '/vendor/frappe-gantt/frappe-gantt.min.js';
const FRAPPE_GANTT_CSS = '/vendor/frappe-gantt/frappe-gantt.css';
let _frappeGanttLoadPromise = null;

function ensureFrappeGanttLoaded() {
  if (typeof Gantt !== 'undefined') return Promise.resolve(true);
  if (_frappeGanttLoadPromise) return _frappeGanttLoadPromise;
  _frappeGanttLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-frappe-gantt]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FRAPPE_GANTT_CSS;
      link.setAttribute('data-frappe-gantt', '1');
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = FRAPPE_GANTT_JS;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      _frappeGanttLoadPromise = null;
      reject(new Error('甘特图组件加载失败'));
    };
    document.head.appendChild(s);
  });
  return _frappeGanttLoadPromise;
}

function addCalendarDaysStr(dateStr, days) {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  return formatLocalDate(addDaysLocal(d, days));
}

function getTaskGanttDateRange(task) {
  if (!task) return null;
  let start = normalizeDateStr(getEffectivePlanStart(task) || task.planStartDate) || '';
  let end = normalizeDateStr(resolveTaskDueDate(task)) || normalizeDateStr(task.dueDate) || '';
  if (!start && !end) return null;
  if (!start) start = end;
  if (!end) end = start;
  if (end < start) end = start;
  // Frappe 对同日条显示过短，展示上至少跨到次日
  if (end === start) end = addCalendarDaysStr(start, 1) || start;
  return { start, end };
}

function buildProjectGanttTasks(project) {
  if (!project) return { rows: [], unscheduled: 0 };
  const milestones = getProjectMilestones(project);
  const workTasks = getProjectWorkTasksFlat(project);
  const candidates = [];
  milestones.forEach(m => candidates.push(m));
  workTasks.forEach(t => candidates.push(t));
  const scheduled = [];
  let unscheduled = 0;
  candidates.forEach(task => {
    const range = getTaskGanttDateRange(task);
    if (!range) {
      unscheduled += 1;
      return;
    }
    const isMs = isMilestoneTask(task);
    const progress = Math.max(0, Math.min(100, Number(getDisplayProgress(task)) || 0));
    const classes = [];
    if (isMs) classes.push('gantt-row-milestone');
    if (task.status === 'done') classes.push('gantt-row-done');
    else if (isOverdue(task)) classes.push('gantt-row-overdue');
    const depIds = getTaskPredecessorDeps(task.id)
      .map(d => d.predecessorTaskId)
      .filter(Boolean);
    scheduled.push({
      id: task.id,
      name: String(task.title || task.id),
      start: range.start,
      end: range.end,
      progress,
      custom_class: classes.join(' '),
      _depIds: depIds,
    });
  });
  // 第二遍：仅保留同图内前置
  const finalIds = new Set(scheduled.map(r => r.id));
  const rows = scheduled.map(row => {
    const deps = (row._depIds || []).filter(id => finalIds.has(id) && id !== row.id);
    const out = {
      id: row.id,
      name: row.name,
      start: row.start,
      end: row.end,
      progress: row.progress,
      custom_class: row.custom_class,
    };
    if (deps.length) out.dependencies = deps.join(',');
    return out;
  });
  return { rows, unscheduled };
}

function isProjectWorkTab(tab) {
  return tab === 'work' || tab === 'milestones' || tab === 'tasks' || tab === 'delivery';
}

function normalizeProjectWorkView(view) {
  if (view === 'gantt' || view === 'table' || view === 'list') return view;
  if (view === 'delivery') return 'list';
  return 'table';
}

function setProjectPlanView(view) {
  if (view === 'delivery') view = 'list';
  const next = normalizeProjectWorkView(view);
  if (next !== 'list') {
    state.inlineDeliveryEditId = null;
    state.editingDeliveryTaskId = null;
    state.deliveryForm = null;
  }
  state.projectPlanView = next;
  state.projectDetailTab = 'work';
  render();
}

function renderProjectPlanViewToggle() {
  const view = normalizeProjectWorkView(state.projectPlanView);
  const items = [
    { id: 'table', label: '列表' },
    { id: 'list', label: '板' },
    { id: 'gantt', label: '甘特' },
  ];
  return `
    <div class="project-plan-view-toggle" role="tablist" aria-label="任务视图">
      ${items.map(item => `
        <button type="button" class="${view === item.id ? 'active' : ''}" onclick="setProjectPlanView('${item.id}')">${item.label}</button>
      `).join('')}
    </div>
  `;
}

function renderProjectWorkToolbar(project) {
  const scope = state.detailTaskScope === 'mine' ? 'mine' : 'all';
  const status = state.detailTaskStatusFilter || 'all';
  const q = state.detailTaskQuery || '';
  const chip = (id, label, active) => `
    <button type="button" class="project-work-filter-chip${active ? ' is-active' : ''}"
      onclick="state.detailTaskStatusFilter='${id}';render()">${label}</button>
  `;
  return `
    <div class="project-work-toolbar">
      <div class="project-work-toolbar-left">
        <label class="project-work-search">
          <i class="fas fa-search"></i>
          <input type="search" placeholder="搜索任务"
            value="${escapeHtml(q)}"
            onchange="state.detailTaskQuery=this.value;render()"
            onkeydown="if(event.key==='Enter'){state.detailTaskQuery=this.value;render();}" />
        </label>
        ${chip('all', '全部', status === 'all')}
        ${chip('doing', '进行中', status === 'doing')}
        <button type="button" class="project-work-filter-chip${scope === 'mine' ? ' is-active' : ''}"
          onclick="state.detailTaskScope=state.detailTaskScope==='mine'?'all':'mine';render()">我的</button>
      </div>
      ${renderProjectPlanViewToggle()}
    </div>
  `;
}

function filterProjectWorkTaskList(taskList) {
  let list = taskList || [];
  const q = String(state.detailTaskQuery || '').trim().toLowerCase();
  const status = state.detailTaskStatusFilter || 'all';
  const scope = state.detailTaskScope === 'mine' ? 'mine' : 'all';
  if (q) {
    list = list.filter(t => String(t.title || '').toLowerCase().includes(q)
      || String(t.assignee || '').toLowerCase().includes(q));
  }
  if (status === 'doing') {
    list = list.filter(t => getTaskDisplayStatus(t) === 'doing' || t.status === 'doing');
  } else if (status === 'todo') {
    list = list.filter(t => getTaskDisplayStatus(t) === 'todo' || t.status === 'todo');
  } else if (status === 'done') {
    list = list.filter(t => t.status === 'done' || getTaskDisplayStatus(t) === 'done');
  }
  if (scope === 'mine') {
    list = list.filter(t => isSamePersonName(t.assignee, currentUser.name)
      || (Array.isArray(t.assistCollaborators) && t.assistCollaborators.some(n => isSamePersonName(n, currentUser.name))));
  }
  return list;
}

function normalizeDeliveryFilter(filter) {
  if (filter === 'empty' || filter === 'partial' || filter === 'complete') return filter;
  return 'all';
}

function setDeliveryFilter(filter) {
  const next = normalizeDeliveryFilter(filter);
  state.deliveryFilter = state.deliveryFilter === next && next !== 'all' ? 'all' : next;
  render();
}

function ensureDeliveryOpenMap() {
  if (!state.deliveryOpenTaskIds || typeof state.deliveryOpenTaskIds !== 'object') {
    state.deliveryOpenTaskIds = {};
  }
  return state.deliveryOpenTaskIds;
}

function deliveryBucket(task) {
  const c = getDeliveryCompleteness(task);
  if (c.complete) return 'complete';
  if (!c.filled) return 'empty';
  return 'partial';
}

function matchesDeliveryFilter(task, filter) {
  const f = normalizeDeliveryFilter(filter);
  if (f === 'all') return true;
  return deliveryBucket(task) === f;
}

function groupMatchesDeliveryFilter(milestone, children, filter) {
  const f = normalizeDeliveryFilter(filter);
  if (f === 'all') return true;
  if (milestone && matchesDeliveryFilter(milestone, f)) return true;
  return (children || []).some(t => matchesDeliveryFilter(t, f));
}

function getDeliveryEvidenceFiles(task) {
  return (task && Array.isArray(task.attachments) ? task.attachments : []).filter(a =>
    a && (a.purpose === 'evidence' || isWikiAttachment(a))
  );
}

function hasDeliveryRecord(task) {
  return !!(getDeliveryEvidenceFiles(task).length || String((task && task.verification) || '').trim());
}

function getDeliveryDirectChildren(parentId, workTasks) {
  return (workTasks || [])
    .filter(t => (t.parentId || null) === parentId)
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'));
}

function getDeliveryDescendants(parentId, workTasks) {
  const out = [];
  const walk = (pid) => {
    getDeliveryDirectChildren(pid, workTasks).forEach(t => {
      out.push(t);
      walk(t.id);
    });
  };
  walk(parentId);
  return out;
}

function getUnassignedDeliveryRoots(unassigned) {
  const ids = new Set((unassigned || []).map(t => t.id));
  return (unassigned || []).filter(t => !t.parentId || !ids.has(t.parentId));
}

function splitDeliveryLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(s => s.replace(/^\s*[-*•、]\s*/, '').trim())
    .filter(Boolean);
}

function renderDeliveryOlRows(label, depth, cells) {
  const list = (cells && cells.length) ? cells : [{ html: '未填写', empty: true }];
  return list.map((cell, i) => `
    <div class="delivery-ol-row" style="--d:${depth}">
      <div class="delivery-ol-k">${i === 0 ? escapeHtml(label) : ''}</div>
      <div class="delivery-ol-v${cell.empty ? ' is-empty' : ''}">${cell.html}</div>
    </div>
  `).join('');
}

function renderDeliveryFileChip(item) {
  const safeName = (item.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const wiki = isWikiAttachment(item);
  const isImg = !wiki && (isImageMime(item.mimeType) || isImageFileName(item.name));
  const openBtn = wiki
    ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openDingTalkDoc('${(item.url || item.sourceUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" title="打开钉钉文档"><i class="fas fa-external-link-alt"></i></button>`
    : `<button type="button" class="btn btn-ghost btn-sm" onclick="downloadEntityFile('${item.fileId}','${safeName}')"><i class="fas fa-download"></i></button>`;
  return `
    <span class="delivery-ol-file">
      ${isImg
        ? `<img data-authed-file="${item.fileId}" alt="" class="delivery-ol-thumb" onclick="previewAuthedImage('${item.fileId}')">`
        : `<i class="fas ${wiki ? 'fa-file-alt delivery-ol-ding-icon' : 'fa-file'}"></i>`}
      <span title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || '未命名')}</span>
      ${wiki ? '<span class="delivery-ol-ding">钉钉</span>' : ''}
      ${openBtn}
    </span>
  `;
}

function renderDeliveryNodeFields(task, depth) {
  const isMs = isMilestoneTask(task);
  let html = '';
  if (isMs) {
    html += renderDeliveryOlRows(
      '交付物',
      depth,
      splitDeliveryLines(getMilestoneDeliverablesText(task)).map(t => ({ html: escapeHtml(t) }))
    );
    html += renderDeliveryOlRows(
      '不交什么',
      depth,
      splitDeliveryLines(getMilestoneOutOfScopeText(task)).map(t => ({ html: escapeHtml(t) }))
    );
    const acc = String(getMilestoneAcceptanceText(task) || '').trim();
    html += renderDeliveryOlRows('验收标准', depth, acc ? [{ html: escapeHtml(acc) }] : []);
  }
  const files = getDeliveryEvidenceFiles(task);
  const note = String((task && task.verification) || '').trim();
  const rec = files.length
    ? files.map(item => ({ html: renderDeliveryFileChip(item) }))
    : (note ? [{ html: escapeHtml(note) }] : []);
  html += renderDeliveryOlRows('验收记录', depth, rec);
  const fb = String((task && task.feedback) || '').trim();
  html += renderDeliveryOlRows('业务反馈', depth, fb ? [{ html: escapeHtml(fb) }] : []);
  html += renderDeliveryOlRows(
    '遗留问题',
    depth,
    splitDeliveryLines(task && task.leftover).map(t => ({ html: escapeHtml(t) }))
  );
  return html;
}

function buildDeliveryGroups(project) {
  const milestones = getProjectMilestones(project);
  const workTasks = getProjectWorkTasksFlat(project);
  const byMs = new Map(milestones.map(m => [m.id, []]));
  const unassigned = [];
  workTasks.forEach(t => {
    const owner = getOwningMilestone(t);
    if (owner && byMs.has(owner.id)) byMs.get(owner.id).push(t);
    else unassigned.push(t);
  });
  return { milestones, byMs, unassigned, workTasks };
}

function countDeliveryBuckets(list) {
  let complete = 0;
  let partial = 0;
  let empty = 0;
  (list || []).forEach(task => {
    const b = deliveryBucket(task);
    if (b === 'complete') complete += 1;
    else if (b === 'empty') empty += 1;
    else partial += 1;
  });
  return { complete, partial, empty, total: (list || []).length };
}

function renderDeliveryFillActions(task, editing) {
  if (!canEditTask(task)) return '';
  if (editing) {
    return '';
  }
  return `<button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${task.id}')">填写</button>`;
}

function renderDeliveryEvidenceList(task, { canUpload } = {}) {
  const files = getDeliveryEvidenceFiles(task);
  const canUp = !!(canUpload && canEditTask(task) && ApiConfig.enabled);
  const rows = files.map(item => {
    const safeName = (item.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const refKey = attachmentRefKey(item);
    const wiki = isWikiAttachment(item);
    const isImg = !wiki && (isImageMime(item.mimeType) || isImageFileName(item.name));
    return `
      <div class="delivery-evidence-item">
        ${isImg
          ? `<img data-authed-file="${item.fileId}" alt="" class="delivery-evidence-thumb" onclick="previewAuthedImage('${item.fileId}')">`
          : `<i class="fas ${wiki ? 'fa-file-alt delivery-ol-ding-icon' : 'fa-file'} delivery-evidence-icon"></i>`}
        <span class="delivery-evidence-name" title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || '未命名')}</span>
        ${wiki ? '<span class="delivery-ol-ding">钉钉</span>' : ''}
        ${wiki
          ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openDingTalkDoc('${(item.url || item.sourceUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')"><i class="fas fa-external-link-alt"></i></button>`
          : `<button type="button" class="btn btn-ghost btn-sm" onclick="downloadEntityFile('${item.fileId}','${safeName}')"><i class="fas fa-download"></i></button>`}
        ${canUp && canDeleteEntityFile(item, true) ? `
          <button type="button" class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="deleteEntityFile('task','${task.id}','${refKey}')"><i class="fas fa-trash-alt"></i></button>
        ` : ''}
      </div>
    `;
  }).join('');
  return `
    <div class="delivery-evidence-box" ${canUp ? `tabindex="0" onpaste="handleDeliveryEvidencePaste(event,'${task.id}')"` : ''}>
      <div class="delivery-evidence-toolbar">
        <span>最终文件 ${files.length}</span>
        ${canUp ? `
        <div class="delivery-form-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick="showDeliveryWikiDocPicker('${task.id}')">
            <i class="fas fa-link"></i> 钉钉文档
          </button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0;">
            <i class="fas fa-upload"></i> 上传
            <input type="file" multiple style="display:none;" onchange="uploadDeliveryEvidenceFiles('${task.id}',event)">
          </label>
        </div>
        ` : ''}
      </div>
      ${canUp ? `<div class="delivery-evidence-hint">签字单、验收纪要、PDF 或钉钉文档；点此区域后 Ctrl+V 粘贴图片</div>` : ''}
      ${files.length ? `<div class="delivery-evidence-list">${rows}</div>` : (canUp ? `<div class="delivery-evidence-empty">还没有文件</div>` : '')}
      ${canUpload && !ApiConfig.enabled ? `<div class="delivery-evidence-hint">附件上传需连接服务端</div>` : ''}
    </div>
  `;
}

function showDeliveryWikiDocPicker(taskId) {
  showWikiDocPicker('task', taskId, { linkPurpose: 'evidence', returnToDelivery: true });
}

async function uploadDeliveryEvidenceFiles(taskId, event) {
  const files = Array.from((event.target && event.target.files) || []);
  if (event.target) event.target.value = '';
  if (!files.length) return;
  try {
    for (const file of files) {
      await uploadFileToEntity('task', taskId, file, file.name, 'evidence');
    }
    render();
  } catch (e) {
    alert(e.message || '上传失败');
    render();
  }
}

async function handleDeliveryEvidencePaste(event, taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !canUploadTaskAttachment(task)) return;
  const files = extractClipboardImageFiles(event);
  if (!files.length) return;
  event.preventDefault();
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请登录并连接服务端后粘贴图片');
    return;
  }
  try {
    for (const file of files) {
      await uploadFileToEntity('task', taskId, file, clipboardFileName(file, 'evidence'), 'evidence');
    }
  } catch (e) {
    alert(e.message || '图片上传失败');
  }
  render();
}

function renderDeliveryEditField(label, body, extraClass) {
  return `
    <div class="delivery-ol-row is-edit${extraClass ? ` ${extraClass}` : ''}" style="--d:0">
      <div class="delivery-ol-k">${escapeHtml(label)}</div>
      <div class="delivery-ol-v is-edit">${body}</div>
    </div>
  `;
}

function renderDeliveryInlineForm(task) {
  const isMs = isMilestoneTask(task);
  const f = state.deliveryForm || {};
  const project = projects.find(p => p.id === task.projectId);
  const health = isMs
    ? getMilestoneSevenGridHealth(task, project)
    : getTaskExecutionHealth(task);
  const missingChips = (health.missing || []).map(cell => {
    if (isMs) {
      return renderSevenGridChip(cell, {
        mini: true,
        onclick: `jumpToMilestoneSevenGrid('${task.id}','${cell.key}')`,
      });
    }
    return renderSevenGridChip(cell, { mini: true });
  }).join('');
  const returnBtn = state.workViewReturn
    ? `<button type="button" class="btn btn-ghost btn-sm" onclick="returnFromDeliveryEdit()"><i class="fas fa-arrow-left"></i> 返回${state.workViewReturn === 'gantt' ? '甘特图' : '表格'}</button>`
    : '';
  return `
    <div class="project-inline-delivery-editor" id="delivery-edit-anchor" onclick="event.stopPropagation();">
      <div class="delivery-edit-crumb">
        <div class="delivery-edit-crumb-path">
          <span>项目执行</span><span class="sep">·</span>
          <span>清单</span><span class="sep">·</span>
          <strong>${escapeHtml(task.title || task.id)}</strong>
          <span class="sep">·</span>
          <span>${isMs ? '里程碑填写' : '任务填写'}</span>
        </div>
        <div class="delivery-form-actions">
          ${returnBtn}
          <button type="button" class="btn btn-ghost btn-sm" onclick="cancelEditTaskDelivery()">取消</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="saveTaskDeliveryFields('${task.id}')"><i class="fas fa-save"></i> 保存</button>
        </div>
      </div>
      ${missingChips ? `<div class="delivery-edit-missing"><span class="delivery-edit-missing-k">${isMs ? '七格缺项' : '执行缺项'}</span>${missingChips}</div>` : ''}
      <div class="delivery-ol-edit-form">
        ${isMs ? renderDeliveryEditField(
          '交付物',
          `<textarea class="textarea delivery-edit-input" rows="4" oninput="state.deliveryForm.deliverables=this.value" placeholder="每行一项（名词清单，如：集成蓝图、验收报告）">${escapeHtml(f.deliverables || '')}</textarea>`
        ) : ''}
        ${isMs ? renderDeliveryEditField(
          '不交什么',
          `<textarea id="delivery-anchor-outOfScope" class="textarea delivery-edit-input" rows="3" oninput="state.deliveryForm.outOfScope=this.value" placeholder="本里程碑明确不做/不交（可引用的句子）">${escapeHtml(f.outOfScope || '')}</textarea>`
        ) : ''}
        ${isMs ? renderDeliveryEditField(
          '验收标准',
          `<textarea class="textarea delivery-edit-input" rows="3" oninput="state.deliveryForm.acceptanceCriteria=this.value" placeholder="能回答「是/否」的判法；可含回退条件">${escapeHtml(f.acceptanceCriteria || '')}</textarea>`
        ) : ''}
        ${renderDeliveryEditField('验收记录', renderDeliveryEvidenceList(task, { canUpload: true }))}
        ${renderDeliveryEditField(
          '业务反馈',
          `<textarea class="textarea delivery-edit-input" rows="3" oninput="state.deliveryForm.feedback=this.value" placeholder="业务侧意见或确认情况">${escapeHtml(f.feedback || '')}</textarea>`
        )}
        ${renderDeliveryEditField(
          '遗留问题',
          `<textarea class="textarea delivery-edit-input" rows="3" oninput="state.deliveryForm.leftover=this.value" placeholder="每行一项，保存后分行展示">${escapeHtml(f.leftover || '')}</textarea>`
        )}
      </div>
    </div>
  `;
}

function renderDeliveryTaskBlock(task, workTasks, depth) {
  const editing = state.inlineDeliveryEditId === task.id;
  const kids = getDeliveryDirectChildren(task.id, workTasks);
  const displayStatus = getTaskDisplayStatus(task);
  const st = statusMap[displayStatus] || statusMap[task.status] || statusMap.todo;
  const nest = Math.max(0, Number(depth) || 0);
  return `
    <div class="delivery-ol-row is-node is-task" style="--d:${nest}">
      <div class="delivery-ol-title"><i class="fas fa-check-square"></i>${escapeHtml(task.title || task.id)}</div>
      <div class="delivery-ol-meta">
        ${task.assignee ? `<span class="delivery-task-assignee">${escapeHtml(task.assignee)}</span>` : ''}
        <span class="status-tag status-${displayStatus}" style="font-size:10px;">${escapeHtml(st.label)}</span>
        ${renderDeliveryCompletenessBadge(task)}
        ${renderDeliveryFillActions(task, editing)}
      </div>
    </div>
    ${editing ? `<div class="delivery-ol-edit" style="--d:${nest + 1}">${renderDeliveryInlineForm(task)}</div>` : renderDeliveryNodeFields(task, nest + 1)}
    ${kids.map(child => renderDeliveryTaskBlock(child, workTasks, nest + 1)).join('')}
  `;
}

function renderDeliveryMilestoneCard(milestone, workTasks) {
  const editing = milestone && state.inlineDeliveryEditId === milestone.id;
  const project = milestone && projects.find(p => p.id === milestone.projectId);
  const canManage = !!(project && canManageProject(project) && !isProjectArchived(project));
  const kids = milestone
    ? getDeliveryDirectChildren(milestone.id, workTasks)
    : getUnassignedDeliveryRoots(workTasks);
  const displayStatus = milestone ? getTaskDisplayStatus(milestone) : null;
  const st = displayStatus ? (statusMap[displayStatus] || statusMap[milestone.status] || statusMap.todo) : null;
  return `
    <div class="delivery-ol-row is-node is-ms" style="--d:0">
      <div class="delivery-ol-title"><i class="fas fa-flag"></i>${escapeHtml((milestone && (milestone.title || milestone.id)) || '未归属任务')}</div>
      <div class="delivery-ol-meta">
        ${st ? `<span class="status-tag status-${displayStatus}" style="font-size:10px;"><i class="fas ${st.icon}"></i>${escapeHtml(st.label)}</span>` : ''}
        ${milestone ? renderDeliveryCompletenessBadge(milestone) : ''}
        ${milestone && canManage && !editing ? `
          <button type="button" class="btn btn-ghost btn-sm" onclick="showNewSubTaskModal('${milestone.id}')">添加任务</button>
        ` : ''}
        ${milestone ? renderDeliveryFillActions(milestone, editing) : ''}
      </div>
    </div>
    ${milestone ? (editing ? `<div class="delivery-ol-edit" style="--d:1">${renderDeliveryInlineForm(milestone)}</div>` : renderDeliveryNodeFields(milestone, 1)) : ''}
    ${kids.map(t => renderDeliveryTaskBlock(t, workTasks, 1)).join('')}
  `;
}

function renderProjectDeliveryBoard(project, opts) {
  const hideTabs = !!(opts && opts.hideTabs);
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const { milestones, unassigned, workTasks } = buildDeliveryGroups(project);
  const scored = [...milestones, ...workTasks];
  const counts = countDeliveryBuckets(scored);
  const filter = normalizeDeliveryFilter(state.deliveryFilter);
  const filterBtn = (id, label, count) => `
    <button type="button" class="delivery-filter-btn${filter === id ? ' active' : ''}" onclick="setDeliveryFilter('${id}')">
      ${label} ${count}
    </button>
  `;

  const activeId = getWorkMilestoneTabId(project);
  const cards = [];
  const editingId = state.inlineDeliveryEditId;
  const containsEdit = (milestone, descendants) => {
    if (!editingId) return false;
    if (milestone && milestone.id === editingId) return true;
    return (descendants || []).some(t => t.id === editingId);
  };

  if (activeId === '__unassigned__') {
    if (unassigned.length && (groupMatchesDeliveryFilter(null, unassigned, filter) || containsEdit(null, unassigned))) {
      cards.push(renderDeliveryMilestoneCard(null, unassigned));
    }
  } else if (activeId) {
    const m = milestones.find(x => x.id === activeId);
    if (m) {
      const descendants = getDeliveryDescendants(m.id, workTasks);
      if (groupMatchesDeliveryFilter(m, descendants, filter) || containsEdit(m, descendants)) {
        cards.push(renderDeliveryMilestoneCard(m, workTasks));
      }
    }
  }

  const hasSource = milestones.length || workTasks.length;
  let body;
  if (!hasSource) {
    body = renderEmptyState({
      icon: 'fa-clipboard-check',
      title: '暂无里程碑或任务',
      hint: canManage ? '请先添加里程碑或任务' : '暂无内容',
    });
  } else if (!cards.length) {
    body = renderEmptyState({
      icon: 'fa-filter',
      title: '没有符合筛选的项',
      hint: '试试切换「全部」或其它齐备状态，或换一个里程碑页签',
    });
  } else {
    body = `<div class="delivery-outline">${cards.join('')}</div>`;
  }

  return `
    <section class="delivery-board">
      ${hideTabs ? '' : renderWorkMilestoneTabBar(project)}
      <div class="delivery-board-head">
        <div>
          <div class="project-detail-section-title" style="margin:0;">交付清单</div>
          <p class="delivery-board-hint">当前页签下的里程碑与任务；交付物、遗留问题按行展开，验收记录显示最终文件。</p>
        </div>
        <div class="delivery-board-tools">
          ${canManage && activeId && activeId !== '__unassigned__' ? `
            <button type="button" class="btn btn-ghost btn-sm" onclick="showNewSubTaskModal('${activeId}')"><i class="fas fa-plus"></i>添加任务</button>
          ` : ''}
          <div class="delivery-filter" role="tablist" aria-label="齐备筛选">
          ${filterBtn('all', '全部', counts.total)}
          ${filterBtn('empty', '未填', counts.empty)}
          ${filterBtn('partial', '部分', counts.partial)}
          ${filterBtn('complete', '已齐备', counts.complete)}
          </div>
        </div>
      </div>
      ${body}
    </section>
  `;
}

function renderProjectGanttSection(project) {
  return `
    <section class="project-gantt-section">
      <div class="project-detail-section-title">
        <span>项目甘特图</span>
        <span style="font-size:11px;font-weight:500;color:var(--text-muted);">只读 · 点击条查看任务</span>
      </div>
      <div id="project-gantt" class="project-gantt-wrap" data-project-id="${escapeHtml(project.id)}"></div>
      <div id="project-gantt-meta" class="project-gantt-meta"></div>
    </section>
  `;
}

async function mountProjectGantt() {
  const el = document.getElementById('project-gantt');
  if (!el) return;
  const projectId = el.getAttribute('data-project-id');
  const project = projects.find(p => p.id === projectId);
  const meta = document.getElementById('project-gantt-meta');
  if (!project) {
    el.innerHTML = '<div style="padding:24px;color:#9CA3AF;font-size:13px;">项目不存在</div>';
    return;
  }
  el.innerHTML = '<div style="padding:24px;color:#9CA3AF;font-size:13px;"><i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>加载甘特图…</div>';
  try {
    await ensureFrappeGanttLoaded();
  } catch (err) {
    el.innerHTML = `<div style="padding:24px;color:#DC2626;font-size:13px;">${escapeHtml(err.message || '加载失败')}</div>`;
    return;
  }
  const host = document.getElementById('project-gantt');
  if (!host || state.projectDetailTab !== 'work' || state.projectPlanView !== 'gantt' || host.getAttribute('data-project-id') !== projectId) return;
  const { rows, unscheduled } = buildProjectGanttTasks(project);
  if (!rows.length) {
    host.innerHTML = renderEmptyState({
      icon: 'fa-chart-gantt',
      title: '暂无可展示的排期',
      hint: unscheduled
        ? `有 ${unscheduled} 项缺少计划开始/截止日期，请先在表格中补全日期`
        : '请先添加带日期的里程碑或任务',
    });
    if (meta) meta.textContent = '';
    return;
  }
  host.innerHTML = '';
  try {
    // eslint-disable-next-line no-undef
    new Gantt(host, rows, {
      view_mode: 'Week',
      bar_height: 22,
      padding: 14,
      on_click: (task) => {
        if (task && task.id) viewTask(task.id);
      },
      on_date_change: () => {},
      on_progress_change: () => {},
      custom_popup_html: (task) => {
        const src = tasks.find(t => t.id === task.id);
        const start = task.start instanceof Date ? formatLocalDate(task.start) : String(task.start || '').slice(0, 10);
        const endRaw = task.end instanceof Date ? formatLocalDate(task.end) : String(task.end || '').slice(0, 10);
        const dueShow = src ? (normalizeDateStr(resolveTaskDueDate(src)) || src.dueDate || endRaw) : endRaw;
        const assignee = src ? (src.assignee || '-') : '-';
        return `
          <div class="details-container" style="min-width:180px;">
            <h5 style="margin:0 0 6px;font-size:13px;">${escapeHtml(task.name || '')}</h5>
            <p style="margin:0;font-size:12px;color:#6B7280;">${escapeHtml(start)} ~ ${escapeHtml(dueShow)}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6B7280;">负责人：${escapeHtml(assignee)} · 进度 ${task.progress || 0}%</p>
          </div>
        `;
      },
    });
  } catch (err) {
    host.innerHTML = `<div style="padding:24px;color:#DC2626;font-size:13px;">甘特图渲染失败：${escapeHtml(err.message || String(err))}</div>`;
    return;
  }
  if (meta) {
    meta.textContent = unscheduled
      ? `已展示 ${rows.length} 项；另有 ${unscheduled} 项未排期（缺开始/截止日期）`
      : `已展示 ${rows.length} 项`;
  }
}

function getDeliveryCompleteness(task) {
  if (isMilestoneTask(task)) {
    const project = projects.find(p => p.id === task.projectId);
    const health = getMilestoneSevenGridHealth(task, project);
    return {
      filled: health.filled,
      total: health.total,
      complete: health.total > 0 && health.missing.length === 0,
      missing: health.missing.map(c => `${c.key} ${c.label}`),
    };
  }
  const health = getTaskExecutionHealth(task);
  return {
    filled: health.filled,
    total: health.total,
    complete: health.total > 0 && health.missing.length === 0,
    missing: health.missing.map(c => c.label),
  };
}

function renderDeliveryCompletenessBadge(task) {
  const c = getDeliveryCompleteness(task);
  if (!c.total) return '';
  const isMs = isMilestoneTask(task);
  const tip = c.complete
    ? (isMs ? '七格已齐' : '执行项已齐')
    : `缺：${c.missing.join('、') || '待填'}`;
  const kind = c.complete ? 'is-complete' : (c.filled === 0 ? 'is-empty' : 'is-partial');
  return `<span title="${escapeHtml(tip)}" class="delivery-badge ${kind}">齐备 ${c.filled}/${c.total}</span>`;
}

function renderTaskDeliveryCompletenessSection(task, canEdit) {
  if (!task) return '';
  const c = getDeliveryCompleteness(task);
  if (!c.total) return '';
  const goDelivery = canEdit
    ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${task.id}')"><i class="fas fa-arrow-right"></i> 去填写</button>`
    : `<span style="font-size:12px;color:var(--text-muted);">明细见「项目执行」</span>`;
  return `
    <div class="detail-section">
      <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <i class="fas fa-clipboard-check"></i> ${isMilestoneTask(task) ? '七格齐备' : '交付齐备'}
          ${renderDeliveryCompletenessBadge(task)}
        </span>
        ${goDelivery}
      </div>
      <div style="font-size:12px;color:var(--text-muted);">已齐备 ${c.filled} / 共 ${c.total}${c.complete ? '' : ` · 缺：${escapeHtml(c.missing.join('、') || '待填')}`}</div>
    </div>
  `;
}

function startEditTaskDelivery(taskId) {
  openTaskDeliveryEdit(taskId);
}

function openTaskDeliveryEdit(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !canEditTask(task)) {
    alert('无权编辑');
    return;
  }
  const curView = normalizeProjectWorkView(state.projectPlanView);
  if (state.page === 'projectDetail' && curView !== 'list') {
    state.workViewReturn = curView;
  }
  state.inlineDeliveryEditId = taskId;
  state.editingDeliveryTaskId = taskId;
  state.editingProjectPlan = false;
  state.deliveryForm = {
    deliverables: getMilestoneDeliverablesText(task) || '',
    outOfScope: getMilestoneOutOfScopeText(task) || '',
    acceptanceCriteria: getMilestoneAcceptanceText(task) || '',
    feedback: task.feedback || '',
    leftover: task.leftover || '',
  };
  state.showModal = null;
  state.taskEditInline = false;
  if (task.projectId) {
    state.page = 'projectDetail';
    state.currentProjectId = task.projectId;
    state.form = { projectId: task.projectId };
  }
  state.projectDetailTab = 'work';
  state.projectPlanView = 'list';
  state.deliveryFilter = 'all';
  if (isMilestoneTask(task)) state.detailMilestoneId = taskId;
  else {
    const owner = getOwningMilestone(task);
    if (owner) state.detailMilestoneId = owner.id;
  }
  ensureDeliveryOpenMap()[taskId] = true;
  render();
}

function returnFromDeliveryEdit() {
  const back = state.workViewReturn;
  state.editingDeliveryTaskId = null;
  state.inlineDeliveryEditId = null;
  state.deliveryForm = null;
  state.workViewReturn = null;
  if (back) state.projectPlanView = back;
  state.projectDetailTab = 'work';
  render();
}

function cancelEditTaskDelivery() {
  const back = state.workViewReturn;
  state.editingDeliveryTaskId = null;
  state.inlineDeliveryEditId = null;
  state.deliveryForm = null;
  state.workViewReturn = null;
  if (back) state.projectPlanView = back;
  render();
}

function saveTaskDeliveryFields(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !canEditTask(task)) {
    alert('无权编辑');
    return;
  }
  const f = state.deliveryForm || {};
  const before = {
    deliverables: task.deliverables || '',
    outOfScope: task.outOfScope || '',
    acceptanceCriteria: task.acceptanceCriteria || '',
    feedback: task.feedback || '',
    leftover: task.leftover || '',
  };
  if (isMilestoneTask(task)) {
    task.deliverables = String(f.deliverables || '').trim();
    task.outOfScope = String(f.outOfScope || '').trim();
    task.acceptanceCriteria = String(f.acceptanceCriteria || '').trim();
  }
  task.feedback = String(f.feedback || '').trim();
  task.leftover = String(f.leftover || '').trim();
  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: [
      before.deliverables && `交付物:${before.deliverables}`,
      before.outOfScope && `不交:${before.outOfScope}`,
      before.acceptanceCriteria && `验收:${before.acceptanceCriteria}`,
      before.feedback && `反馈:${before.feedback}`,
      before.leftover && `遗留:${before.leftover}`,
    ].filter(Boolean).join('；') || '（空）',
    after: [
      task.deliverables && `交付物:${task.deliverables}`,
      task.outOfScope && `不交:${task.outOfScope}`,
      task.acceptanceCriteria && `验收:${task.acceptanceCriteria}`,
      task.feedback && `反馈:${task.feedback}`,
      task.leftover && `遗留:${task.leftover}`,
    ].filter(Boolean).join('；') || '（空）',
    reason: '更新交付齐备信息',
    project: projects.find(p => p.id === task.projectId)?.name || '',
  });
  state.editingDeliveryTaskId = null;
  state.inlineDeliveryEditId = null;
  state.deliveryForm = null;
  const back = state.workViewReturn;
  state.workViewReturn = null;
  if (back) state.projectPlanView = back;
  save({ immediateSync: true });
  render();
}

function setWorkMilestoneTab(milestoneId) {
  state.detailMilestoneId = milestoneId || '';
  render();
}

function getWorkMilestoneTabId(project) {
  if (!project) return '';
  const milestones = getProjectMilestones(project);
  const workTasks = getProjectWorkTasksFlat(project);
  const unassigned = workTasks.filter(t => !getOwningMilestone(t));
  const id = state.detailMilestoneId || '';
  if (id === '__unassigned__' && unassigned.length) return id;
  if (id && milestones.some(m => m.id === id)) return id;
  if (milestones.length) return milestones[0].id;
  if (unassigned.length) return '__unassigned__';
  return '';
}

function openMilestoneInProjectWork(milestone, opts) {
  if (!milestone || !isMilestoneTask(milestone) || !milestone.projectId) return;
  if (!canViewTask(milestone)) {
    alert('无权查看该里程碑');
    return;
  }
  if (state.page !== 'projectDetail') {
    state.prevPage = state.page;
  }
  state.page = 'projectDetail';
  state.form = { projectId: milestone.projectId };
  state.currentProjectId = milestone.projectId;
  state.projectDetailTab = 'work';
  const preferView = opts && opts.view;
  if (preferView) state.projectPlanView = normalizeProjectWorkView(preferView);
  else if (normalizeProjectWorkView(state.projectPlanView) === 'gantt') {
    state.projectPlanView = 'table';
  } else {
    state.projectPlanView = normalizeProjectWorkView(state.projectPlanView) || 'table';
  }
  state.detailMilestoneId = milestone.id;
  state.showModal = null;
  state.taskEditInline = false;
  state.inlineDeliveryEditId = null;
  state.editingDeliveryTaskId = null;
  state.deliveryForm = null;
  state.taskViewStack = [];
  render();
}

function renderWorkMilestoneRail(project) {
  const milestones = getProjectMilestones(project);
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const active = getWorkMilestoneTabId(project);
  const workTasks = getProjectWorkTasksFlat(project);
  const unassigned = workTasks.filter(t => !getOwningMilestone(t));
  const items = milestones.map((m, idx) => {
    const seq = String(m.milestoneSeq || `M${idx + 1}`).trim();
    const descendants = getMilestoneDescendantTasks(m.id).filter(t => !isMilestoneTask(t));
    const done = descendants.filter(t => t.status === 'done').length;
    const health = getMilestoneSevenGridHealth(m, project);
    const hasEmpty = health.missing.some(c => c.status === 'empty');
    const hasWeak = health.missing.some(c => c.status === 'weak');
    const dot = (hasEmpty || hasWeak)
      ? `<span class="ms-work-tab-dot ${hasEmpty ? 'is-empty' : 'is-weak'}" title="七格有缺口"></span>`
      : '';
    return `
      <button type="button" class="ms-work-rail-item${active === m.id ? ' is-active' : ''}"
        onclick="setWorkMilestoneTab('${m.id}')" title="${escapeHtml(m.title || m.id)}">
        ${dot}
        <span class="ms-work-rail-name">${escapeHtml(seq)} ${escapeHtml(m.title || m.id)}</span>
        <span class="ms-work-rail-count">${done}/${descendants.length}</span>
      </button>
    `;
  });
  if (unassigned.length) {
    items.push(`
      <button type="button" class="ms-work-rail-item${active === '__unassigned__' ? ' is-active' : ''}"
        onclick="setWorkMilestoneTab('__unassigned__')">
        <span class="ms-work-rail-name">未归属</span>
        <span class="ms-work-rail-count">${unassigned.length}</span>
      </button>
    `);
  }
  return `
    <div class="ms-work-rail-card">
      <div class="ms-work-rail-head">
        <span>里程碑</span>
        ${canManage ? `
          <button type="button" class="btn btn-ghost btn-sm" onclick="showNewMilestoneModal('${project.id}')">
            <i class="fas fa-plus"></i>
          </button>
        ` : ''}
      </div>
      <div class="ms-work-rail-list">
        ${items.length ? items.join('') : `<div class="ms-work-tabs-empty">暂无里程碑</div>`}
      </div>
    </div>
  `;
}

function renderWorkMilestoneTabBar(project) {
  const milestones = getProjectMilestones(project);
  const active = getWorkMilestoneTabId(project);
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const workTasks = getProjectWorkTasksFlat(project);
  const unassigned = workTasks.filter(t => !getOwningMilestone(t));
  const tabs = milestones.map((m, idx) => {
    const seq = String(m.milestoneSeq || `M${idx}`).trim();
    const health = getMilestoneSevenGridHealth(m, project);
    const hasEmpty = health.missing.some(c => c.status === 'empty');
    const hasWeak = health.missing.some(c => c.status === 'weak');
    const dot = (hasEmpty || hasWeak)
      ? `<span class="ms-work-tab-dot ${hasEmpty ? 'is-empty' : 'is-weak'}" title="七格有缺口"></span>`
      : '';
    return `
      <button type="button" class="ms-work-tab${active === m.id ? ' active' : ''}"
        onclick="setWorkMilestoneTab('${m.id}')" title="${escapeHtml(m.title || m.id)}">
        ${dot}
        <span class="ms-work-tab-seq">${escapeHtml(seq)}</span>
        <span class="ms-work-tab-name">${escapeHtml(m.title || m.id)}</span>
      </button>
    `;
  });
  if (unassigned.length) {
    tabs.push(`
      <button type="button" class="ms-work-tab${active === '__unassigned__' ? ' active' : ''}"
        onclick="setWorkMilestoneTab('__unassigned__')">
        <span class="ms-work-tab-name">未归属</span>
        <span class="ms-work-tab-count">${unassigned.length}</span>
      </button>
    `);
  }
  return `
    <div class="ms-work-tabs-wrap">
      <div class="ms-work-tabs" role="tablist" aria-label="里程碑页签">
        ${tabs.length ? tabs.join('') : `<span class="ms-work-tabs-empty">暂无里程碑</span>`}
      </div>
      ${canManage ? `
        <button type="button" class="btn btn-ghost btn-sm ms-work-tabs-add" onclick="showNewMilestoneModal('${project.id}')">
          <i class="fas fa-plus"></i>里程碑
        </button>
      ` : ''}
    </div>
  `;
}

function renderMilestoneTasksTableRows(project, milestone, taskList) {
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const list = taskList || [];
  if (!list.length) {
    return `<tr><td colspan="6">${renderEmptyState({
      icon: 'fa-check-square',
      title: milestone ? '该里程碑下暂无任务' : '暂无未归属任务',
      hint: canManage
        ? (milestone ? '点击「添加任务」在此里程碑下拆解' : '可将任务挂到某个里程碑下')
        : '暂无任务',
    })}</td></tr>`;
  }
  return list.map(t => {
    const displayStatus = getTaskDisplayStatus(t);
    const st = statusMap[displayStatus] || statusMap[t.status] || statusMap.todo;
    const due = normalizeDateStr(resolveTaskDueDate(t)) || t.dueDate || '-';
    const progress = getDisplayProgress(t);
    const chain = getTaskBreadcrumb(t.id).filter(x => !isMilestoneTask(x));
    const depth = Math.max(0, chain.length - 1);
    const prefix = depth > 0 ? `${'　'.repeat(Math.min(depth, 4))}└ ` : '';
    const overdueCls = isOverdue(t) ? ' todo-row--overdue' : '';
    return `
      <tr class="${overdueCls.trim()}" onclick="viewTask('${t.id}')">
        <td>
          <div style="font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${prefix}${escapeHtml(t.title || t.id)} ${renderDeliveryCompletenessBadge(t)}
          </div>
        </td>
        <td>${escapeHtml(t.assignee || '-')}</td>
        <td><span class="status-tag status-${displayStatus}" style="font-size:10px;">${st.label}</span></td>
        <td>${escapeHtml(due)}</td>
        <td style="min-width:100px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-bar" style="flex:1;height:6px;"><div class="progress-fill" style="width:${progress}%;"></div></div>
            <span style="font-size:12px;color:var(--text-muted);font-variant-numeric:tabular-nums;">${progress}%</span>
          </div>
        </td>
        <td class="col-actions" onclick="event.stopPropagation();">
          ${canEditTask(t) ? `
            <button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${t.id}')" title="填写"><i class="fas fa-clipboard-check"></i></button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="editTask('${t.id}')" title="编辑"><i class="fas fa-edit"></i></button>
          ` : ''}
        </td>
      </tr>`;
  }).join('');
}

function renderProjectMilestoneTabsSection(project, opts) {
  const hideTabs = !!(opts && opts.hideTabs);
  const milestones = getProjectMilestones(project);
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const activeId = getWorkMilestoneTabId(project);
  const workTasks = getProjectWorkTasksFlat(project);
  const milestone = activeId && activeId !== '__unassigned__'
    ? milestones.find(m => m.id === activeId)
    : null;

  if (!milestones.length && !workTasks.length) {
    return `
      <section class="ms-work-section">
        ${hideTabs ? '' : renderWorkMilestoneTabBar(project)}
        ${renderEmptyState({
          icon: 'fa-flag',
          title: '暂无里程碑',
          hint: canManage ? '点击左侧「+」新增里程碑' : '负责人可添加里程碑',
        })}
      </section>
    `;
  }

  let taskList = [];
  let panelHead = '';
  if (milestone) {
    taskList = getMilestoneDescendantTasks(milestone.id)
      .filter(t => !isMilestoneTask(t))
      .sort((a, b) => {
        const ba = getTaskBreadcrumb(a.id).map(x => x.id).join('\0');
        const bb = getTaskBreadcrumb(b.id).map(x => x.id).join('\0');
        return ba.localeCompare(bb, 'zh');
      });
    const displayStatus = getTaskDisplayStatus(milestone);
    const st = statusMap[displayStatus] || statusMap[milestone.status] || statusMap.todo;
    const start = normalizeDateStr(getEffectivePlanStart(milestone) || milestone.planStartDate) || '-';
    const due = normalizeDateStr(resolveTaskDueDate(milestone)) || milestone.dueDate || '-';
    const progress = calcProgress(milestone.id);
    const roles = getMilestonePlanRoles(milestone);
    const health = getMilestoneSevenGridHealth(milestone, project);
    const hint = getMilestoneIncompleteHint(milestone.id);
    if (hideTabs) {
      panelHead = `
        <div class="ms-work-panel-head ms-work-panel-head--slim">
          <div class="ms-work-panel-title">
            <strong>${escapeHtml(milestone.title || milestone.id)}</strong>
            <span class="status-tag status-${displayStatus}" style="font-size:10px;">${escapeHtml(st.label)}</span>
          </div>
          <div class="ms-work-panel-actions">
            ${canManage ? `
              <button type="button" class="btn btn-primary btn-sm" onclick="showNewSubTaskModal('${milestone.id}')"><i class="fas fa-plus"></i> 添加任务</button>
            ` : ''}
          </div>
        </div>
      `;
    } else {
      panelHead = `
        <div class="ms-work-panel-head">
          <div class="ms-work-panel-title">
            <i class="fas fa-flag"></i>
            <strong>${escapeHtml(milestone.title || milestone.id)}</strong>
            <span class="status-tag status-${displayStatus}" style="font-size:10px;"><i class="fas ${st.icon}"></i>${escapeHtml(st.label)}</span>
            ${renderDeliveryCompletenessBadge(milestone)}
          </div>
          <div class="ms-work-panel-actions">
            ${canEditTask(milestone) ? `
              <button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${milestone.id}')"><i class="fas fa-clipboard-check"></i> 填写</button>
            ` : ''}
            ${canManage ? `
              <button type="button" class="btn btn-ghost btn-sm" onclick="editTask('${milestone.id}')"><i class="fas fa-edit"></i> 编辑</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="showNewSubTaskModal('${milestone.id}')"><i class="fas fa-plus"></i> 添加任务</button>
            ` : ''}
            ${canCompleteMilestone(milestone) && canOperateTask(milestone) ? `
              <button type="button" class="btn btn-success btn-sm" onclick="updateTaskStatus('${milestone.id}', 'done')"><i class="fas fa-check"></i> 完成</button>
            ` : ''}
          </div>
        </div>
        <div class="ms-work-panel-meta">
          <span>排期 ${escapeHtml(start)} ~ ${escapeHtml(due)}</span>
          <span>进度 ${progress}%</span>
          <span>任务 ${taskList.length}</span>
          ${roles.roleA ? `<span class="arcv-chip"><b>A</b>${escapeHtml(roles.roleA)}</span>` : ''}
          ${roles.roleR || milestone.assignee ? `<span class="arcv-chip"><b>R</b>${escapeHtml(roles.roleR || milestone.assignee)}</span>` : ''}
          ${roles.roleC ? `<span class="arcv-chip"><b>C</b>${escapeHtml(roles.roleC)}</span>` : ''}
          ${roles.roleV ? `<span class="arcv-chip"><b>V</b>${escapeHtml(roles.roleV)}</span>` : ''}
        </div>
        <div class="ms-work-panel-seven">
          <div class="seven-grid-chips is-inline">
            ${health.cells.map(cell => renderSevenGridChip(cell, {
              mini: true,
              onclick: `jumpToMilestoneSevenGrid('${milestone.id}','${cell.key}')`,
            })).join('')}
            <span class="seven-grid-inline-tip">本里程碑 ${health.filled}/${health.total}</span>
          </div>
        </div>
        ${milestone.status !== 'done' ? `<div class="ms-work-panel-hint"><i class="fas fa-info-circle"></i>${escapeHtml(hint)}</div>` : ''}
      `;
    }
  } else {
    taskList = workTasks.filter(t => !getOwningMilestone(t));
    panelHead = `
      <div class="ms-work-panel-head ms-work-panel-head--slim">
        <div class="ms-work-panel-title"><strong>未归属任务</strong></div>
      </div>
    `;
  }

  const filtered = typeof filterProjectWorkTaskList === 'function' ? filterProjectWorkTaskList(taskList) : taskList;

  return `
    <section class="ms-work-section">
      ${hideTabs ? '' : renderWorkMilestoneTabBar(project)}
      <div class="ms-work-panel">
        ${hideTabs ? renderProjectWorkToolbar(project) : ''}
        ${panelHead}
        <div class="todo-table-card" style="box-shadow:none;border:none;">
          <div class="todo-table-wrap">
            <table class="todo-table todo-table--slim">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>负责人</th>
                  <th>状态</th>
                  <th>截止</th>
                  <th>进度</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${renderMilestoneTasksTableRows(project, milestone, filtered)}
              </tbody>
            </table>
          </div>
          <div class="todo-pager"><div class="todo-pager-info">共 ${filtered.length} 条任务</div></div>
        </div>
      </div>
    </section>
  `;
}

function renderProjectMilestonesTableSection(project) {
  return renderProjectMilestoneTabsSection(project);
}

function renderProjectTasksTableSection(project) {
  return '';
}

function renderMilestonePlanSection(milestone, allTasks, mineIds = null) {
  const children = allTasks.filter(t => t.parentId === milestone.id && !isMilestoneTask(t));
  const progress = calcProgress(milestone.id);
  const displayStatus = getTaskDisplayStatus(milestone);
  const st = statusMap[displayStatus] || statusMap[milestone.status] || statusMap.todo;
  const due = normalizeDateStr(resolveTaskDueDate(milestone)) || milestone.dueDate || '-';
  const workCount = getMilestoneDescendantTasks(milestone.id).length;
  const canDone = canCompleteMilestone(milestone);
  const project = projects.find(p => p.id === milestone.projectId);
  const canManage = project && !isProjectArchived(project) && canManageProject(project);
  return `
    <div class="plan-milestone" style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg-panel);">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(90deg,#F8FAFC,#F1F5F9);border-bottom:1px solid #E5E7EB;">
        <i class="fas fa-flag" style="color:var(--brand);"></i>
        <div style="flex:1;min-width:0;cursor:pointer;" onclick="viewTask('${milestone.id}')">
          <div style="font-size:14px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${escapeHtml(milestone.title || '')}
            ${renderDeliveryCompletenessBadge(milestone)}
          </div>
          <div style="font-size:12px;color:#9CA3AF;margin-top:2px;">
            ${workCount} 项任务 · 截止 ${escapeHtml(due)} · ${escapeHtml(milestone.assignee || '-')}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;min-width:120px;">
          <div class="progress-bar" style="flex:1;height:6px;"><div class="progress-fill" style="width:${progress}%;"></div></div>
          <span style="font-size:12px;color:#6B7280;">${progress}%</span>
        </div>
        <span class="status-tag status-${displayStatus}" style="font-size:10px;"><i class="fas ${st.icon}"></i>${st.label}</span>
        ${canManage ? `
          <button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation();showNewSubTaskModal('${milestone.id}')" title="在此里程碑下添加任务"><i class="fas fa-plus"></i></button>
        ` : ''}
        ${canDone && canOperateTask(milestone) ? `
          <button type="button" class="btn btn-success btn-sm" onclick="event.stopPropagation();updateTaskStatus('${milestone.id}', 'done')"><i class="fas fa-check"></i>完成</button>
        ` : ''}
      </div>
      <div style="padding:10px 12px 4px;">
        ${children.length === 0 ? `<div style="padding:12px;font-size:12px;color:#9CA3AF;">暂无任务，可点击「+」在此里程碑下添加</div>` : ''}
        ${children.map(t => renderProjectTaskTree(t, 0, allTasks, mineIds)).join('')}
      </div>
    </div>
  `;
}

function renderProjects() {
  const filteredProjects = getFilteredProjects();
  const scopeProjects = getProjectsBeforeTabFilters();
  const managers = getProjectManagerOptions();
  const selectedDept = state.projectDept || 'all';
  const selectedManager = state.projectManager || 'all';
  const selectedRisk = state.projectRiskFilter || 'all';
  const selectedSort = state.projectSort || 'default';

  const statusCounts = {
    planning: scopeProjects.filter(p => p.status === 'planning').length,
    active: scopeProjects.filter(p => p.status === 'active').length,
    paused: scopeProjects.filter(p => p.status === 'paused').length,
    done: scopeProjects.filter(p => p.status === 'done').length,
  };
  const totalAll = statusCounts.planning + statusCounts.active + statusCounts.paused + statusCounts.done;

  return `
    <div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
            <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">项目列表</h2>
            <div style="display:flex;align-items:center;gap:8px;">
              ${ApiConfig.enabled ? `<button class="btn btn-ghost btn-sm" onclick="refreshProjectsFromServer()" title="从服务端重新拉取项目"><i class="fas fa-sync-alt"></i></button>` : ''}
              ${canCreateProject() ? `<button class="btn btn-primary btn-sm" onclick="showProjectModal()"><i class="fas fa-plus"></i>新建项目</button>` : ''}
            </div>
          </div>
          <p class="content-intro" style="margin:0 0 12px;">${getProjectsPageIntro()}</p>
          <div class="todo-tabs">
            <button type="button" class="todo-tab${(state.projectFilter || 'all') === 'all' ? ' active' : ''}" onclick="state.projectFilter='all';render()">全部 <span class="count">(${totalAll})</span></button>
            <button type="button" class="todo-tab${state.projectFilter === 'active' ? ' active' : ''}" onclick="state.projectFilter='active';render()">进行中 <span class="count">(${statusCounts.active})</span></button>
            <button type="button" class="todo-tab${state.projectFilter === 'planning' ? ' active' : ''}" onclick="state.projectFilter='planning';render()">规划中 <span class="count">(${statusCounts.planning})</span></button>
            <button type="button" class="todo-tab${state.projectFilter === 'paused' ? ' active' : ''}" onclick="state.projectFilter='paused';render()">已暂停 <span class="count">(${statusCounts.paused})</span></button>
            <button type="button" class="todo-tab${state.projectFilter === 'done' ? ' active' : ''}" onclick="state.projectFilter='done';render()">已完成 <span class="count">(${statusCounts.done})</span></button>
          </div>
        </div>
      </div>

      <div class="todo-filter-bar">
        <div class="todo-field todo-field-grow">
          <i class="fas fa-search"></i>
          <input type="text" placeholder="搜索项目名称、编号、负责人、部门" value="${escapeHtml(state.projectSearch || '')}"
            onchange="state.projectSearch=this.value;render()" />
        </div>
        <div class="todo-field">
          <select onchange="state.projectDept=this.value;render()">
            <option value="all" ${selectedDept === 'all' ? 'selected' : ''}>全部部门</option>
            ${departments.map(dept => `<option value="${escapeHtml(dept)}" ${selectedDept === dept ? 'selected' : ''}>${escapeHtml(dept)}</option>`).join('')}
          </select>
        </div>
        <div class="todo-field">
          <select onchange="state.projectManager=this.value;render()">
            <option value="all" ${selectedManager === 'all' ? 'selected' : ''}>负责人</option>
            ${managers.map(name => `<option value="${escapeHtml(name)}" ${selectedManager === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
          </select>
        </div>
        <div class="todo-field">
          <select onchange="state.projectRiskFilter=this.value;render()">
            <option value="all" ${selectedRisk === 'all' ? 'selected' : ''}>异常情况</option>
            <option value="overdue" ${selectedRisk === 'overdue' ? 'selected' : ''}>有逾期任务</option>
            <option value="endingSoon" ${selectedRisk === 'endingSoon' ? 'selected' : ''}>7日内到期</option>
          </select>
        </div>
        <div class="todo-field">
          <select onchange="state.projectSort=this.value;render()">
            <option value="default" ${selectedSort === 'default' ? 'selected' : ''}>默认排序</option>
            <option value="endDate" ${selectedSort === 'endDate' ? 'selected' : ''}>按截止日</option>
            <option value="progress" ${selectedSort === 'progress' ? 'selected' : ''}>按进度</option>
            <option value="name" ${selectedSort === 'name' ? 'selected' : ''}>按名称</option>
          </select>
        </div>
        <button type="button" class="btn btn-ghost" onclick="resetProjectFilters()"><i class="fas fa-rotate-right"></i> 重置</button>
      </div>

      <div class="project-list-count">共 ${filteredProjects.length} 条</div>
      <div class="project-card-grid">
        ${filteredProjects.length === 0 ? renderEmptyState({ icon: 'fa-folder-open', title: '暂无项目', hint: '试试调整筛选，或新建一个项目', panel: true }) : ''}
        ${filteredProjects.map(p => renderProjectListCard(p)).join('')}
      </div>
    </div>
  `;
}
