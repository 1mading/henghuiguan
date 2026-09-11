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

function setProjectPlanView(view) {
  if (view === 'delivery') {
    setProjectDetailTab('delivery');
    return;
  }
  state.projectPlanView = view === 'gantt' ? 'gantt' : 'table';
  if (state.projectDetailTab !== 'milestones') state.projectDetailTab = 'milestones';
  render();
}

function renderProjectPlanViewToggle() {
  const view = state.projectPlanView === 'gantt' ? 'gantt' : 'table';
  return `
    <div class="project-plan-view-toggle" role="tablist" aria-label="里程碑视图">
      <button type="button" class="${view === 'table' ? 'active' : ''}" onclick="setProjectPlanView('table')">
        <i class="fas fa-table"></i>表格
      </button>
      <button type="button" class="${view === 'gantt' ? 'active' : ''}" onclick="setProjectPlanView('gantt')">
        <i class="fas fa-chart-gantt"></i>甘特图
      </button>
    </div>
  `;
}

function setProjectDeliveryTab(tab) {
  state.projectDeliveryTab = tab === 'tasks' ? 'tasks' : 'milestones';
  render();
}

function renderProjectDeliveryTabToggle() {
  const tab = state.projectDeliveryTab === 'tasks' ? 'tasks' : 'milestones';
  return `
    <div class="project-plan-view-toggle" role="tablist" aria-label="交付检查视图">
      <button type="button" class="${tab === 'milestones' ? 'active' : ''}" onclick="setProjectDeliveryTab('milestones')">
        <i class="fas fa-flag"></i>里程碑
      </button>
      <button type="button" class="${tab === 'tasks' ? 'active' : ''}" onclick="setProjectDeliveryTab('tasks')">
        <i class="fas fa-tasks"></i>任务
      </button>
    </div>
  `;
}

function renderDeliveryFieldCell(value) {
  const text = String(value || '').trim();
  if (!text) {
    return `<span style="color:#D1D5DB;font-size:12px;">—</span>`;
  }
  const short = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  return `<div style="font-size:12px;color:var(--text);line-height:1.45;white-space:pre-wrap;word-break:break-word;" title="${escapeHtml(text)}">${escapeHtml(short)}</div>`;
}

function renderProjectDeliveryBoard(project) {
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const scope = state.projectDeliveryTab === 'tasks' ? 'tasks' : 'milestones';
  const isMsScope = scope === 'milestones';
  const milestones = getProjectMilestones(project);
  const workTasks = getProjectWorkTasksFlat(project);
  const allRows = isMsScope
    ? milestones.map(m => ({ task: m, kind: '里程碑' }))
    : workTasks.map(t => ({ task: t, kind: '任务' }));

  if (state.inlineDeliveryEditId) {
    const editingRow = allRows.find(({ task }) => task.id === state.inlineDeliveryEditId)
      || (() => {
        const t = tasks.find(x => x.id === state.inlineDeliveryEditId);
        return t ? { task: t, kind: isMilestoneTask(t) ? '里程碑' : '任务' } : null;
      })();
    if (editingRow) {
      const task = editingRow.task;
      const isMs = isMilestoneTask(task);
      const f = state.deliveryForm || {};
      return `
        <section style="margin-top:8px;">
          <div class="project-inline-delivery-editor" style="background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);">
            <div class="project-inline-delivery-title">
              <strong>${escapeHtml(task.title || task.id)}</strong>
              <div style="display:flex;gap:6px;">
                <button type="button" class="btn btn-ghost btn-sm" onclick="cancelEditTaskDelivery()">取消</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="saveTaskDeliveryFields('${task.id}')"><i class="fas fa-save"></i> 保存</button>
              </div>
            </div>
            <div class="project-inline-delivery-grid">
              ${isMs ? `
              <div>
                <label class="form-label">交付物</label>
                <textarea class="textarea" style="width:100%;height:56px;" oninput="state.deliveryForm.deliverables=this.value">${escapeHtml(f.deliverables || '')}</textarea>
              </div>
              <div>
                <label class="form-label">验收标准</label>
                <textarea class="textarea" style="width:100%;height:56px;" oninput="state.deliveryForm.acceptanceCriteria=this.value">${escapeHtml(f.acceptanceCriteria || '')}</textarea>
              </div>
              <div>
                <label class="form-label">完成证据</label>
                <textarea class="textarea" style="width:100%;height:56px;" oninput="state.deliveryForm.completionEvidence=this.value" placeholder="签字/链接/截图等">${escapeHtml(f.completionEvidence || '')}</textarea>
              </div>
              ` : ''}
              <div>
                <label class="form-label">验证记录</label>
                <textarea class="textarea" style="width:100%;height:56px;" oninput="state.deliveryForm.verification=this.value">${escapeHtml(f.verification || '')}</textarea>
              </div>
              <div>
                <label class="form-label">业务反馈</label>
                <textarea class="textarea" style="width:100%;height:56px;" oninput="state.deliveryForm.feedback=this.value">${escapeHtml(f.feedback || '')}</textarea>
              </div>
              <div>
                <label class="form-label">遗留问题</label>
                <textarea class="textarea" style="width:100%;height:56px;" oninput="state.deliveryForm.leftover=this.value">${escapeHtml(f.leftover || '')}</textarea>
              </div>
            </div>
          </div>
        </section>
      `;
    }
  }

  let completeCount = 0;
  let partialCount = 0;
  let emptyCount = 0;
  allRows.forEach(({ task }) => {
    const c = getDeliveryCompleteness(task);
    if (c.complete) completeCount += 1;
    else if (c.filled === 0) emptyCount += 1;
    else partialCount += 1;
  });

  const rows = allRows.map(({ task, kind }) => {
    const isMs = kind === '里程碑';
    const milestone = isMs ? task : getOwningMilestone(task);
    return `
      <tr onclick="viewTask('${task.id}')" style="cursor:pointer;">
        <td>
          <div style="font-weight:600;color:var(--text);">${escapeHtml(task.title || task.id)}</div>
          ${!isMs ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px;">归属：${escapeHtml((milestone && milestone.title) || '—')}</div>` : ''}
        </td>
        <td style="text-align:center;">${renderDeliveryCompletenessBadge(task)}</td>
        ${isMs ? `
          <td>${renderDeliveryFieldCell(getMilestoneDeliverablesText(task))}</td>
          <td>${renderDeliveryFieldCell(getMilestoneAcceptanceText(task))}</td>
        ` : ''}
        <td>${renderDeliveryFieldCell(task.verification)}</td>
        <td>${renderDeliveryFieldCell(task.feedback)}</td>
        <td>${renderDeliveryFieldCell(task.leftover)}</td>
        <td class="col-actions" onclick="event.stopPropagation();">
          ${canEditTask(task) ? `
            <button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${task.id}')" title="填写">
              <i class="fas fa-edit"></i>
            </button>
          ` : '<span style="color:#D1D5DB;">—</span>'}
        </td>
      </tr>
    `;
  }).join('');

  const colCount = isMsScope ? 8 : 6;
  const emptyTitle = isMsScope ? '暂无里程碑' : '暂无任务';
  const emptyHint = canManage
    ? (isMsScope ? '请先添加里程碑' : '请先添加任务')
    : '暂无内容';

  return `
    <section style="margin-top:8px;">
      <div class="project-detail-section-title">
        <span>${isMsScope ? '里程碑交付检查' : '任务交付检查'}</span>
        <span style="font-size:12px;font-weight:500;color:#6B7280;">
          已齐备 ${completeCount} · 部分 ${partialCount} · 未填 ${emptyCount} · 共 ${allRows.length}
        </span>
      </div>
      <p style="font-size:12px;color:#6B7280;margin:0 0 12px;">${isMsScope
        ? '展示各里程碑的交付物、验收标准、验证、反馈与遗留；点击编辑可在本页直接填写。'
        : '展示各任务的验证、反馈与遗留；点击编辑可在本页直接填写。'}</p>
      <div class="todo-table-card">
        <div class="todo-table-wrap">
          <table class="todo-table todo-table--slim">
            <thead>
              <tr>
                <th>${isMsScope ? '里程碑' : '任务'}</th>
                <th style="width:90px;text-align:center;">齐备</th>
                ${isMsScope ? `
                  <th>交付物</th>
                  <th>验收标准</th>
                ` : ''}
                <th>验证记录</th>
                <th>业务反馈</th>
                <th>遗留问题</th>
                <th style="width:64px;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${allRows.length
                ? rows
                : `<tr><td colspan="${colCount}">${renderEmptyState({ icon: 'fa-clipboard-check', title: emptyTitle, hint: emptyHint })}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
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
  // 异步加载后页面可能已切走
  const host = document.getElementById('project-gantt');
  if (!host || state.projectDetailTab !== 'milestones' || state.projectPlanView !== 'gantt' || host.getAttribute('data-project-id') !== projectId) return;
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
        // 展示截止用实际 due（同日条在图上多画了一天）
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
  const isMs = isMilestoneTask(task);
  const fields = isMs
    ? [
        { key: 'deliverables', label: '交付物', value: getMilestoneDeliverablesText(task) },
        { key: 'acceptance', label: '验收标准', value: getMilestoneAcceptanceText(task) },
        { key: 'verification', label: '验证', value: task.verification },
        { key: 'feedback', label: '反馈', value: task.feedback },
        { key: 'leftover', label: '遗留', value: task.leftover },
      ]
    : [
        { key: 'verification', label: '验证', value: task.verification },
        { key: 'feedback', label: '反馈', value: task.feedback },
        { key: 'leftover', label: '遗留', value: task.leftover },
      ];
  const filled = fields.filter(f => String(f.value || '').trim()).length;
  return {
    filled,
    total: fields.length,
    complete: filled === fields.length && filled > 0,
    missing: fields.filter(f => !String(f.value || '').trim()).map(f => f.label),
  };
}

function renderDeliveryCompletenessBadge(task) {
  const c = getDeliveryCompleteness(task);
  if (!c.total) return '';
  const tip = c.complete ? '交付信息已齐备' : `缺：${c.missing.join('、') || '待填'}（请到「交付检查」填写）`;
  const color = c.complete ? '#047857' : (c.filled === 0 ? '#9CA3AF' : '#B45309');
  const bg = c.complete ? '#ECFDF5' : (c.filled === 0 ? '#F3F4F6' : '#FFFBEB');
  return `<span title="${escapeHtml(tip)}" style="font-size:10px;padding:1px 6px;border-radius:4px;background:${bg};color:${color};white-space:nowrap;font-weight:600;">齐备 ${c.filled}/${c.total}</span>`;
}

/** 里程碑/任务详情仅展示齐备数；明细与填写统一在「交付检查」 */
function renderTaskDeliveryCompletenessSection(task, canEdit) {
  if (!task) return '';
  const c = getDeliveryCompleteness(task);
  if (!c.total) return '';
  const goDelivery = canEdit
    ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${task.id}')"><i class="fas fa-arrow-right"></i> 去交付检查</button>`
    : `<span style="font-size:12px;color:var(--text-muted);">明细见「交付检查」</span>`;
  return `
    <div class="detail-section">
      <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <i class="fas fa-clipboard-check"></i> 交付齐备
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
  state.inlineDeliveryEditId = taskId;
  state.editingDeliveryTaskId = taskId;
  state.deliveryForm = {
    deliverables: getMilestoneDeliverablesText(task) || '',
    acceptanceCriteria: getMilestoneAcceptanceText(task) || '',
    completionEvidence: task.completionEvidence || '',
    verification: task.verification || '',
    feedback: task.feedback || '',
    leftover: task.leftover || '',
  };
  state.showModal = null;
  state.taskEditInline = false;
  if (task.projectId) {
    state.page = 'projectDetail';
    state.currentProjectId = task.projectId;
  }
  state.projectDetailTab = 'delivery';
  state.projectDeliveryTab = isMilestoneTask(task) ? 'milestones' : 'tasks';
  render();
}

function cancelEditTaskDelivery() {
  state.editingDeliveryTaskId = null;
  state.inlineDeliveryEditId = null;
  state.deliveryForm = null;
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
    acceptanceCriteria: task.acceptanceCriteria || '',
    completionEvidence: task.completionEvidence || '',
    verification: task.verification || '',
    feedback: task.feedback || '',
    leftover: task.leftover || '',
  };
  if (isMilestoneTask(task)) {
    task.deliverables = String(f.deliverables || '').trim();
    task.acceptanceCriteria = String(f.acceptanceCriteria || '').trim();
    task.completionEvidence = String(f.completionEvidence || '').trim();
  }
  task.verification = String(f.verification || '').trim();
  task.feedback = String(f.feedback || '').trim();
  task.leftover = String(f.leftover || '').trim();
  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: [
      before.deliverables && `交付物:${before.deliverables}`,
      before.acceptanceCriteria && `验收:${before.acceptanceCriteria}`,
      before.completionEvidence && `证据:${before.completionEvidence}`,
      before.verification && `验证:${before.verification}`,
      before.feedback && `反馈:${before.feedback}`,
      before.leftover && `遗留:${before.leftover}`,
    ].filter(Boolean).join('；') || '（空）',
    after: [
      task.deliverables && `交付物:${task.deliverables}`,
      task.acceptanceCriteria && `验收:${task.acceptanceCriteria}`,
      task.completionEvidence && `证据:${task.completionEvidence}`,
      task.verification && `验证:${task.verification}`,
      task.feedback && `反馈:${task.feedback}`,
      task.leftover && `遗留:${task.leftover}`,
    ].filter(Boolean).join('；') || '（空）',
    reason: '更新交付齐备信息',
    project: projects.find(p => p.id === task.projectId)?.name || '',
  });
  state.editingDeliveryTaskId = null;
  state.inlineDeliveryEditId = null;
  state.deliveryForm = null;
  save({ immediateSync: true });
  render();
}

function renderProjectMilestonesTableSection(project) {
  const list = getProjectMilestones(project);
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const rows = list.map((m, idx) => {
    const displayStatus = getTaskDisplayStatus(m);
    const st = statusMap[displayStatus] || statusMap[m.status] || statusMap.todo;
    const start = normalizeDateStr(getEffectivePlanStart(m) || m.planStartDate) || '-';
    const due = normalizeDateStr(resolveTaskDueDate(m)) || m.dueDate || '-';
    const workCount = getMilestoneDescendantTasks(m.id).length;
    const progress = calcProgress(m.id);
    const roles = getMilestonePlanRoles(m);
    const seq = String(m.milestoneSeq || `M${idx + 1}`).trim();
    const overdueCls = isOverdue(m) ? ' todo-row--overdue' : '';
    return `
      <tr class="${overdueCls.trim()}" onclick="viewTask('${m.id}')">
        <td style="font-variant-numeric:tabular-nums;font-weight:600;color:#4B5563;">${escapeHtml(seq)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;">
            <i class="fas fa-flag" style="color:var(--brand);flex-shrink:0;"></i>
            <span style="font-weight:600;color:var(--text);">${escapeHtml(m.title || m.id)}</span>
            ${renderDeliveryCompletenessBadge(m)}
          </div>
        </td>
        <td><span class="status-tag status-${displayStatus}" style="font-size:10px;"><i class="fas ${st.icon}"></i>${st.label}</span></td>
        <td>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${roles.roleA ? `<span class="arcv-chip"><b>A</b>${escapeHtml(roles.roleA)}</span>` : ''}
            ${roles.roleR ? `<span class="arcv-chip"><b>R</b>${escapeHtml(roles.roleR)}</span>` : `<span class="arcv-chip"><b>R</b>${escapeHtml(m.assignee || '-')}</span>`}
            ${roles.roleC ? `<span class="arcv-chip"><b>C</b>${escapeHtml(roles.roleC)}</span>` : ''}
            ${roles.roleV ? `<span class="arcv-chip"><b>V</b>${escapeHtml(roles.roleV)}</span>` : ''}
          </div>
        </td>
        <td>${escapeHtml(start)}</td>
        <td>${escapeHtml(due)}</td>
        <td style="font-variant-numeric:tabular-nums;">${workCount}</td>
        <td style="min-width:110px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-bar" style="flex:1;height:6px;"><div class="progress-fill" style="width:${progress}%;"></div></div>
            <span style="font-size:12px;color:var(--text-muted);font-variant-numeric:tabular-nums;">${progress}%</span>
          </div>
        </td>
        <td class="col-actions" onclick="event.stopPropagation();">
          ${canManage ? `
            <button type="button" class="btn btn-ghost btn-sm" onclick="editTask('${m.id}')" title="编辑"><i class="fas fa-edit"></i></button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="showNewSubTaskModal('${m.id}')" title="添加任务"><i class="fas fa-plus"></i></button>
          ` : ''}
          ${canCompleteMilestone(m) && canOperateTask(m) ? `
            <button type="button" class="btn btn-success btn-sm" onclick="updateTaskStatus('${m.id}', 'done')"><i class="fas fa-check"></i></button>
          ` : ''}
        </td>
      </tr>`;
  }).join('');

  return `
    <section style="margin-top:16px;">
      <div class="project-detail-section-title">
        <span>里程碑</span>
        ${canManage ? `
          <button type="button" class="btn btn-ghost btn-sm" onclick="showNewMilestoneModal('${project.id}')"><i class="fas fa-flag"></i>添加里程碑</button>
        ` : ''}
      </div>
      <div class="todo-table-card">
        <div class="todo-table-wrap">
          <table class="todo-table todo-table--slim">
            <thead>
              <tr>
                <th>M序号</th>
                <th>里程碑</th>
                <th>状态</th>
                <th>A/R/C/V</th>
                <th>开始日期</th>
                <th>截止日期</th>
                <th>任务数</th>
                <th>进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${list.length
                ? rows
                : `<tr><td colspan="9">${renderEmptyState({ icon: 'fa-flag', title: '暂无里程碑', hint: canManage ? '点击右上角添加里程碑' : '负责人可添加里程碑' })}</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="todo-pager"><div class="todo-pager-info">共 ${list.length} 个里程碑</div></div>
      </div>
    </section>
  `;
}

function renderProjectTasksTableSection(project) {
  const list = getProjectWorkTasksFlat(project);
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const rows = list.map(t => {
    const displayStatus = getTaskDisplayStatus(t);
    const st = statusMap[displayStatus] || statusMap[t.status] || statusMap.todo;
    const pr = priorityMap[t.priority] || priorityMap.normal;
    const milestone = getOwningMilestone(t);
    const start = normalizeDateStr(getEffectivePlanStart(t) || t.planStartDate) || '-';
    const due = normalizeDateStr(resolveTaskDueDate(t)) || t.dueDate || '-';
    const progress = getDisplayProgress(t);
    const chain = getTaskBreadcrumb(t.id).filter(x => !isMilestoneTask(x));
    const depth = Math.max(0, chain.length - 1);
    const prefix = depth > 0 ? `${'　'.repeat(Math.min(depth, 4))}└ ` : '';
    const overdueCls = isOverdue(t) ? ' todo-row--overdue' : '';
    return `
      <tr class="${overdueCls.trim()}" onclick="viewTask('${t.id}')">
        <td>
          <div style="min-width:0;">
            <div style="font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${prefix}${escapeHtml(t.title || t.id)} ${renderDeliveryCompletenessBadge(t)}</div>
            ${t.type === 'temp' ? '<span class="tag tag-temp" style="font-size:10px;margin-top:2px;display:inline-block;"><i class="fas fa-bolt"></i>临时</span>' : ''}
          </div>
        </td>
        <td>${escapeHtml((milestone && milestone.title) || '-')}</td>
        <td>${escapeHtml(t.assignee || '-')}</td>
        <td><span class="status-tag status-${displayStatus}" style="font-size:10px;">${st.label}</span></td>
        <td><span style="color:${pr.color};font-size:12px;">${pr.label}</span></td>
        <td>${escapeHtml(start)}</td>
        <td>${escapeHtml(due)}</td>
        <td style="min-width:100px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-bar" style="flex:1;height:6px;"><div class="progress-fill" style="width:${progress}%;"></div></div>
            <span style="font-size:12px;color:var(--text-muted);font-variant-numeric:tabular-nums;">${progress}%</span>
          </div>
        </td>
        <td class="col-actions" onclick="event.stopPropagation();">
          ${canEditTask(t) ? `<button type="button" class="btn btn-ghost btn-sm" onclick="editTask('${t.id}')" title="编辑"><i class="fas fa-edit"></i></button>` : ''}
        </td>
      </tr>`;
  }).join('');

  return `
    <section style="margin-top:16px;">
      <div class="project-detail-section-title">
        <span>项目任务</span>
        ${canManage ? `
          <button type="button" class="btn btn-primary btn-sm" onclick="showNewTaskModal('${project.id}')"><i class="fas fa-plus"></i>添加任务</button>
        ` : ''}
      </div>
      <div class="todo-table-card">
        <div class="todo-table-wrap">
          <table class="todo-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>所属里程碑</th>
                <th>负责人</th>
                <th>状态</th>
                <th>优先级</th>
                <th>开始日期</th>
                <th>截止日期</th>
                <th>进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${list.length
                ? rows
                : `<tr><td colspan="9">${renderEmptyState({ icon: 'fa-check-square', title: '暂无项目任务', hint: canManage ? '可先添加里程碑，再在里程碑下拆解任务' : '暂无任务' })}</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="todo-pager"><div class="todo-pager-info">共 ${list.length} 条任务</div></div>
      </div>
    </section>
  `;
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
