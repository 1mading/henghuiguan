// ========== 任务依赖 UI ==========
function renderDependencySchemeHint(compact) {
  return `
    <div style="padding:${compact ? '10px 12px' : '12px 14px'};background:linear-gradient(135deg,#EFF6FF,#ECFDF5);border:1px solid #BFDBFE;border-radius:8px;margin-bottom:${compact ? '10px' : '12px'};font-size:12px;color:var(--text);line-height:1.65;">
      <div style="font-weight:600;color:#1D4ED8;margin-bottom:6px;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>跨项目依赖说明</div>
      <div>· <strong>前置依赖</strong>：需等待其他任务（可跨项目）完成后，本任务才可继续</div>
      <div>· <strong>阻塞期间</strong>：任务显示「阻塞中」，<strong>不计入</strong>工时饱和度，不算逾期/临期</div>
      <div>· <strong>标识</strong>：🔗 前置 · ⏸ 阻塞中 · ▶ 可继续 · 🚧 阻塞后续 · 🌐 跨项目</div>
      <div style="margin-top:6px;color:#2563EB;">配置入口：打开<strong>任务详情</strong> →「依赖关系」→「添加前置依赖」</div>
    </div>
  `;
}

function renderProjectDependencyPanel(projectId) {
  const rows = getProjectDependencyRows(projectId);
  return `
    <div class="panel" style="margin-bottom:20px;border-color:#BFDBFE;">
      <div class="panel-header" style="background:var(--bg-muted);">
        <span class="panel-title"><i class="fas fa-link" style="color:#2563EB;"></i>跨项目 / 任务依赖</span>
      </div>
      <div class="panel-body" style="padding:${rows.length ? '12px 12px 0' : '16px'};">
        ${renderDependencySchemeHint(false)}
        ${rows.length ? `
        <div class="log-table-wrap">
          <table class="log-table">
            <thead>
              <tr>
                <th>本任务</th>
                <th>关系</th>
                <th>关联任务</th>
                <th>关联项目</th>
                <th>状态</th>
                <th>阻塞</th>
                <th>挂起工时</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(({ dep, pred, succ, cross }) => {
                const isOutgoing = pred.projectId === projectId;
                const local = isOutgoing ? pred : succ;
                const remote = isOutgoing ? succ : pred;
                const blocked = isTaskBlocked(succ);
                return `
                  <tr style="cursor:pointer;" onclick="viewTask('${local.id}')">
                    <td>${escapeHtml(local.title)}${renderDependencyBadges(local, true)}</td>
                    <td>${isOutgoing ? '🚧 阻塞后续' : '🔗 前置依赖'}${cross ? ' 🌐' : ''}</td>
                    <td style="color:#2563EB;" onclick="event.stopPropagation();viewTask('${remote.id}')">${escapeHtml(remote.title)}</td>
                    <td>${escapeHtml(getTaskProjectLabel(remote))}</td>
                    <td>${renderDependencyStatusIcon(dep, isOutgoing ? 'succ' : 'pred')}</td>
                    <td>${blocked ? '<span style="color:#D97706;">是</span>' : '否'}</td>
                    <td>${!isOutgoing && isTaskBlocked(local) ? ((local.estimatedHours || 0) + 'h') : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : `
          <div style="text-align:center;padding:24px 12px;color:#9CA3AF;font-size:13px;">
            <i class="fas fa-link" style="font-size:24px;margin-bottom:8px;opacity:0.4;display:block;"></i>
            暂无跨项目依赖。请在<strong>任务详情</strong>中点击「添加前置依赖」配置（可关联其他项目的任务）。
          </div>
        `}
      </div>
    </div>
  `;
}

function renderTaskDependencyPanel(task) {
  if (!task || !canViewTask(task)) return '';
  const preds = getTaskPredecessorDeps(task.id);
  const succs = getTaskSuccessorDeps(task.id);
  const canManage = canManageTaskDependency(task);
  return `
    <div id="task-dep-panel" style="margin-bottom:16px;border:2px solid #BFDBFE;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(37,99,235,0.08);">
      <div style="padding:10px 12px;background:linear-gradient(90deg,#EFF6FF,#F8FAFC);border-bottom:1px solid #BFDBFE;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:#1D4ED8;"><i class="fas fa-link" style="margin-right:6px;"></i>依赖关系（跨项目）</span>
        ${canManage ? `<button class="btn btn-primary btn-sm" onclick="showAddDependencyModal('${task.id}')"><i class="fas fa-plus"></i> 添加前置依赖</button>` : ''}
      </div>
      <div style="padding:12px;">
        ${renderDependencySchemeHint(true)}
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">前置依赖（需先完成）</div>
        ${preds.length ? preds.map(dep => {
          const pred = getDependencyTask(dep.predecessorTaskId);
          if (!pred) return '';
          return `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-muted);border-radius:8px;margin-bottom:6px;font-size:12px;">
              <span style="min-width:72px;">${renderDependencyStatusIcon(dep, 'pred')}</span>
              <span style="flex:1;">${isDependencyCrossProject(dep) ? '<span class="dep-badge dep-cross">🌐</span> ' : ''}${escapeHtml(getTaskProjectLabel(pred))} / <a href="javascript:void(0)" onclick="viewTask('${pred.id}')" style="color:#2563EB;text-decoration:none;">${escapeHtml(pred.title)}</a></span>
              <span style="color:#6B7280;">${pred.assignee}</span>
              <span style="color:#6B7280;">${normalizeDateStr(resolveTaskDueDate(pred)) || '-'}</span>
              ${canManage ? `<button class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="removeTaskDependency('${dep.id}')" title="解除依赖"><i class="fas fa-unlink"></i></button>` : ''}
            </div>
          `;
        }).join('') : '<div style="font-size:12px;color:#9CA3AF;margin-bottom:8px;">暂无前置依赖</div>'}
        ${isTaskBlocked(task) ? '<div style="font-size:11px;color:#D97706;margin:8px 0;padding:8px;background:#FFFBEB;border-radius:6px;"><i class="fas fa-pause-circle" style="margin-right:4px;"></i>阻塞期间：本任务<strong>不计入</strong>工时饱和度</div>' : ''}
        ${succs.length ? `
          <div style="font-size:12px;font-weight:600;color:var(--text);margin:12px 0 8px;">阻塞的后续任务</div>
          ${succs.map(dep => {
            const succ = getDependencyTask(dep.successorTaskId);
            if (!succ) return '';
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#FAF5FF;border-radius:8px;margin-bottom:6px;font-size:12px;">
                <span style="min-width:88px;">${renderDependencyStatusIcon(dep, 'succ')}</span>
                <span style="flex:1;">${isDependencyCrossProject(dep) ? '<span class="dep-badge dep-cross">🌐</span> ' : ''}${escapeHtml(getTaskProjectLabel(succ))} / <a href="javascript:void(0)" onclick="viewTask('${succ.id}')" style="color:#10B981;text-decoration:none;">${escapeHtml(succ.title)}</a></span>
                <span style="color:#6B7280;">${succ.assignee}</span>
                <span style="color:#6B7280;">${normalizeDateStr(resolveTaskDueDate(succ)) || '-'}</span>
              </div>
            `;
          }).join('')}
        ` : ''}
      </div>
    </div>
  `;
}

function getDependencyCandidateTasks(successorTaskId) {
  return tasks
    .filter(t => t.id !== successorTaskId && t.status !== 'abolished' && t.status !== 'archived')
    .filter(t => !wouldCreateDependencyCycle(t.id, successorTaskId))
    .sort((a, b) => getTaskProjectLabel(a).localeCompare(getTaskProjectLabel(b), 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN'));
}

function showAddDependencyModal(successorTaskId) {
  const task = tasks.find(t => t.id === successorTaskId);
  if (!task || !canManageTaskDependency(task)) {
    alert('无权添加依赖');
    return;
  }
  state.form = {
    successorTaskId,
    predecessorTaskId: '',
    blockMode: DEP_BLOCK_HARD,
    note: '',
  };
  state.showModal = 'addDependency';
  render();
}

function renderAddDependencyModal() {
  const succ = tasks.find(t => t.id === state.form.successorTaskId);
  if (!succ) return '';
  const candidates = getDependencyCandidateTasks(succ.id);
  const grouped = {};
  candidates.forEach(t => {
    const label = getTaskProjectLabel(t);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(t);
  });
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:560px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-link" style="color:#2563EB;margin-right:8px;"></i>添加前置依赖</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;margin-bottom:12px;font-size:12px;color:#1E40AF;">
            后继任务：<strong>${escapeHtml(succ.title)}</strong>（${escapeHtml(getTaskProjectLabel(succ))}）<br>
            前置任务完成后，后继任务才可继续（强阻塞时不可开始/完成）。
          </div>
          <div class="form-group">
            <label class="form-label">前置任务 <span class="form-required">*</span></label>
            <select class="select" style="width:100%;" onchange="state.form.predecessorTaskId=this.value">
              <option value="">请选择前置任务</option>
              ${Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'zh-CN')).map(projectName => `
                <optgroup label="${escapeHtml(projectName)}">
                  ${grouped[projectName].map(t => `<option value="${t.id}" ${state.form.predecessorTaskId === t.id ? 'selected' : ''}>${escapeHtml(t.title)} · ${escapeHtml(t.assignee)} · ${statusMap[getTaskDisplayStatus(t)]?.label || t.status}</option>`).join('')}
                </optgroup>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">阻塞强度</label>
            <select class="select" style="width:100%;" onchange="state.form.blockMode=this.value">
              <option value="${DEP_BLOCK_HARD}" ${state.form.blockMode !== DEP_BLOCK_SOFT ? 'selected' : ''}>强阻塞（不可开始/完成，不计饱和度）</option>
              <option value="${DEP_BLOCK_SOFT}" ${state.form.blockMode === DEP_BLOCK_SOFT ? 'selected' : ''}>弱阻塞（仅提醒）</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">说明</label>
            <textarea class="textarea" style="width:100%;height:70px;" placeholder="为何需要此依赖？" onchange="state.form.note=this.value">${state.form.note || ''}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="state.showModal='taskDetail';state.form={taskId:'${succ.id}'};render()">取消</button>
          <button class="btn btn-primary" onclick="saveTaskDependency()"><i class="fas fa-save"></i>保存</button>
        </div>
      </div>
    </div>
  `;
}

function saveTaskDependency() {
  const successorTaskId = state.form.successorTaskId;
  const predecessorTaskId = state.form.predecessorTaskId;
  const succ = tasks.find(t => t.id === successorTaskId);
  const pred = tasks.find(t => t.id === predecessorTaskId);
  if (!succ || !canManageTaskDependency(succ)) {
    alert('无权操作');
    return;
  }
  if (!pred) {
    alert('请选择前置任务');
    return;
  }
  if (wouldCreateDependencyCycle(predecessorTaskId, successorTaskId)) {
    alert('不能形成循环依赖');
    return;
  }
  if (getActiveTaskDependencies().some(d => d.predecessorTaskId === predecessorTaskId && d.successorTaskId === successorTaskId)) {
    alert('该依赖已存在');
    return;
  }
  const dep = {
    id: genId('DEP'),
    predecessorTaskId,
    successorTaskId,
    type: DEP_TYPE_FS,
    blockMode: state.form.blockMode || DEP_BLOCK_HARD,
    note: state.form.note || '',
    status: DEP_STATUS_ACTIVE,
    createdBy: currentUser.name,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  taskDependencies.push(dep);
  refreshTaskDependencySchedule(succ);
  appendChangeLogEntry({
    taskId: succ.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: '无此前置依赖',
    after: `依赖 ${getTaskProjectLabel(pred)}/${pred.title}`,
    reason: dep.note || '添加任务依赖',
    project: projects.find(p => p.id === succ.projectId)?.name || '临时任务',
  });
  notifyTaskDependencyAdded(dep, pred, succ);
  save();
  state.form = { taskId: succ.id };
  state.showModal = 'taskDetail';
  render();
}

function removeTaskDependency(depId) {
  const dep = taskDependencies.find(d => d.id === depId);
  if (!dep) return;
  const succ = getDependencyTask(dep.successorTaskId);
  if (!succ || !canManageTaskDependency(succ)) {
    alert('无权解除依赖');
    return;
  }
  if (!confirm('确定解除该依赖关系？')) return;
  const pred = getDependencyTask(dep.predecessorTaskId);
  taskDependencies = taskDependencies.filter(d => d.id !== depId);
  refreshTaskDependencySchedule(succ);
  appendChangeLogEntry({
    taskId: succ.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: pred ? `依赖 ${pred.title}` : depId,
    after: '已解除依赖',
    reason: '解除任务依赖',
    project: projects.find(p => p.id === succ.projectId)?.name || '临时任务',
  });
  save();
  state.form = { taskId: succ.id };
  state.showModal = 'taskDetail';
  render();
}

function onPredecessorTaskCompleted(completedTask) {
  getTaskSuccessorDeps(completedTask.id).forEach(dep => {
    const succ = getDependencyTask(dep.successorTaskId);
    if (!succ) return;
    const wasBlocked = isTaskBlocked(succ);
    refreshTaskDependencySchedule(succ);
    if (wasBlocked && !isTaskBlocked(succ)) {
      notifyTaskDependencyUnblocked(completedTask, succ, dep);
    }
  });
}

function notifyTaskDependencyAdded(dep, pred, succ) {
  const names = new Set([succ.assignee, pred.assignee]);
  const p1 = projects.find(p => p.id === pred.projectId);
  const p2 = projects.find(p => p.id === succ.projectId);
  if (p1?.manager) names.add(p1.manager);
  if (p2?.manager) names.add(p2.manager);
  NotificationService.send(PushEventType.TASK_DEPENDENCY_ADDED, {
    ...NotificationService.getTaskPayload(succ),
    predecessorTitle: pred.title,
    predecessorProject: getTaskProjectLabel(pred),
    recipientNames: [...names],
    operator: currentUser.name,
  });
}

function notifyTaskDependencyUnblocked(pred, succ, dep) {
  const names = new Set([succ.assignee]);
  const p2 = projects.find(p => p.id === succ.projectId);
  if (p2?.manager) names.add(p2.manager);
  NotificationService.send(PushEventType.TASK_DEPENDENCY_UNBLOCKED, {
    ...NotificationService.getTaskPayload(succ),
    predecessorTitle: pred.title,
    predecessorProject: getTaskProjectLabel(pred),
    recipientNames: [...names],
    operator: currentUser.name,
  });
}
