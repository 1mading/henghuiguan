// ========== 项目详情 ==========
/** 项目下用于树展示的根节点：无父、父等于自身、或父任务不在本项目 */
function getProjectRootTasks(projectTasks) {
  const ids = new Set(projectTasks.map(t => t.id));
  return projectTasks.filter(t => !t.parentId || t.parentId === t.id || !ids.has(t.parentId));
}

function renderProjectFocusPanel(project, canManage) {
  const { currentPhase, nextPlan, blocker } = getProjectFocusFields(project);
  const editing = !!(canManage && state.editingProjectFocus);
  const driver = project.phaseDriverMilestoneId
    ? tasks.find(t => t.id === project.phaseDriverMilestoneId)
    : null;
  const phaseMeta = [
    driver ? `由里程碑「${driver.title || driver.id}」驱动` : '',
    project.phaseSyncedAt ? `同步于 ${String(project.phaseSyncedAt).replace('T', ' ').slice(0, 19)}` : '',
  ].filter(Boolean).join(' · ');
  const readRow = (label, icon, value, emptyText, mod) => `
    <div class="project-focus-row${mod ? ' ' + mod : ''}">
      <div class="project-focus-label"><i class="fas ${icon}"></i>${label}</div>
      <div class="project-focus-value${value ? '' : ' is-empty'}">${escapeHtml(value || emptyText)}</div>
    </div>
  `;
  const editFields = `
    <div class="project-focus-row is-phase">
      <div class="project-focus-label"><i class="fas fa-flag"></i>当前阶段</div>
      <textarea class="project-focus-textarea" id="projectCurrentPhase" placeholder="项目当前处于哪个阶段？">${escapeHtml(currentPhase)}</textarea>
    </div>
    <div class="project-focus-row">
      <div class="project-focus-label"><i class="fas fa-arrow-right"></i>下一步计划</div>
      <textarea class="project-focus-textarea" id="projectNextPlan" placeholder="下一步要做什么？">${escapeHtml(nextPlan)}</textarea>
    </div>
    <div class="project-focus-row is-blocker">
      <div class="project-focus-label"><i class="fas fa-exclamation-triangle"></i>当前卡点</div>
      <textarea class="project-focus-textarea" id="projectBlocker" placeholder="卡在哪儿？没有可留空">${escapeHtml(blocker)}</textarea>
    </div>
    <div class="project-focus-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="cancelEditProjectFocus()"><i class="fas fa-times"></i> 取消</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="saveProjectFocus('${project.id}')"><i class="fas fa-save"></i> 保存</button>
    </div>
  `;
  const readFields = `
    ${readRow('当前阶段', 'fa-flag', currentPhase, '暂无当前阶段', 'is-phase')}
    ${phaseMeta ? `<div style="font-size:12px;color:#9CA3AF;margin:-4px 0 10px 0;">${escapeHtml(phaseMeta)}</div>` : ''}
    ${readRow('下一步计划', 'fa-arrow-right', nextPlan, '暂无下一步计划')}
    ${readRow('当前卡点', 'fa-exclamation-triangle', blocker, '暂无卡点', blocker ? 'is-blocker' : 'is-blocker')}
  `;
  return `
    <section>
      <h3 class="project-detail-section-title">
        <span>推进情况</span>
      </h3>
      <div class="project-focus-panel">
        ${editing ? editFields : readFields}
      </div>
    </section>
  `;
}

function renderProjectPlanPanel(project, canManage) {
  const editing = !!(canManage && state.editingProjectPlan);
  const completeness = getProjectPlanCompleteness(project);
  const pst = projectStatusMap[project.status] || projectStatusMap.active;
  const item = (label, value, wide) => `
    <div class="project-plan-item${wide ? ' is-wide' : ''}">
      <div class="project-plan-k">${label}</div>
      <div class="project-plan-v${value ? '' : ' is-empty'}">${escapeHtml(value || '待填写')}</div>
    </div>
  `;
  const editFields = `
    <div class="form-group" style="margin:0;">
      <label class="form-label">项目名称</label>
      <input class="input" id="projectPlanName" style="width:100%;" value="${escapeHtml(project.name || '')}" placeholder="项目名称">
    </div>
    <div class="project-plan-grid">
      <div class="form-group" style="margin:0;" id="plan-anchor-manager">
        <label class="form-label">负责人</label>
        <input class="input" id="projectPlanManager" style="width:100%;" value="${escapeHtml(project.manager || '')}" placeholder="项目负责人">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">所属部门</label>
        <input class="input" id="projectPlanDept" style="width:100%;" value="${escapeHtml(project.dept || '')}" placeholder="所属部门">
      </div>
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">项目成员</label>
      <div data-project-team-ms-host>${renderProjectTeamMultiSelect(state.form.teamMembers || project.teamMembers || [], project.manager || currentUser.name, false)}</div>
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">项目目标</label>
      <textarea class="project-focus-textarea" id="projectPlanObjective" placeholder="本项目要达成什么？">${escapeHtml(project.objective || '')}</textarea>
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">项目价值</label>
      <textarea class="project-focus-textarea" id="projectPlanValue" placeholder="做成后带来什么价值？">${escapeHtml(project.value || '')}</textarea>
    </div>
    <div class="project-plan-grid">
      <div class="form-group" style="margin:0;">
        <label class="form-label">范围（做什么）</label>
        <textarea class="project-focus-textarea" id="projectPlanScope" placeholder="本期范围">${escapeHtml(project.scope || '')}</textarea>
      </div>
      <div class="form-group" style="margin:0;" id="plan-anchor-outOfScope">
        <label class="form-label">不做范围 ${!completeness.hasOutOfScope ? '<span class="form-required">*</span>' : ''}</label>
        <textarea class="project-focus-textarea" id="projectPlanOutOfScope" placeholder="明确本期不做（防范围蔓延，写成可引用的句子）">${escapeHtml(project.outOfScope || '')}</textarea>
      </div>
    </div>
    <div class="form-group" style="margin:0;" id="plan-anchor-endDate">
      <label class="form-label">最终完成时间</label>
      <input class="input" type="date" id="projectPlanEndDate" style="width:100%;" value="${escapeHtml(project.endDate || '')}">
      ${project.originalEndDate ? `<div style="font-size:12px;color:#9CA3AF;margin-top:4px;">原定：${escapeHtml(project.originalEndDate)}</div>` : ''}
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">变更原因（改最终完成日时建议填写）</label>
      <input class="input" id="projectPlanChangeReason" style="width:100%;" value="${escapeHtml(project.changeReason || '')}" placeholder="如：调研后确认 / 资源调整">
    </div>
    <div class="project-focus-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="cancelEditProjectPlan()"><i class="fas fa-times"></i> 取消</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="saveProjectPlan('${project.id}')"><i class="fas fa-save"></i> 保存</button>
    </div>
  `;
  const readFields = `
    <div class="project-plan-grid">
      ${item('项目目标', project.objective, true)}
      ${item('项目价值', project.value, true)}
      ${item('范围（做什么）', project.scope)}
      ${item('不做范围', project.outOfScope)}
      ${item('当前状态', `${pst.label}${project.currentPhase ? ' · ' + project.currentPhase : ''}`)}
      ${item('最终完成时间', project.endDate || '')}
      ${project.originalEndDate ? item('原定最终完成', project.originalEndDate) : ''}
      ${project.changeReason ? item('变更原因', project.changeReason, true) : ''}
    </div>
  `;
  const badge = completeness.ready
    ? `<span class="project-plan-badge is-ok"><i class="fas fa-check-circle"></i>计划字段已齐</span>`
    : `<span class="project-plan-badge is-warn"><i class="fas fa-exclamation-circle"></i>${[
        !completeness.hasOutOfScope ? '缺不做范围' : '',
        `里程碑 ${completeness.milestoneFilled}/${completeness.milestoneTotal || 0}`,
        !completeness.hasEscalationHint ? '缺升级规则' : '',
      ].filter(Boolean).join(' · ')}</span>`;
  const verifiedBadge = project.planVerified
    ? `<span class="project-plan-badge is-verified" id="plan-anchor-verified"><i class="fas fa-stamp"></i>已校验 · ${escapeHtml(project.planVerifiedBy || '')}</span>`
    : `<span class="project-plan-badge is-warn" id="plan-anchor-verified"><i class="fas fa-stamp"></i>待校验确认</span>`;
  return `
    <section>
      <h3 class="project-detail-section-title">
        <span>项目计划书</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${badge}
          ${verifiedBadge}
        </div>
      </h3>
      <div class="project-plan-panel">
        <div style="font-size:12px;color:#6B7280;line-height:1.5;">
          按领导要求填写目标/范围/最终时间；里程碑需补齐 A/R/C/V、交付物、验收标准与依赖风险。C 协作人须本人确认后，由有权限人员校验并记入台账。
        </div>
        ${editing ? editFields : readFields}
      </div>
    </section>
  `;
}

function startEditProjectPlan() {
  const project = projects.find(p => p.id === state.form?.projectId);
  if (project) {
    state.form = {
      ...(state.form || {}),
      projectId: project.id,
      teamMembers: [...(project.teamMembers || [])],
    };
  }
  state.projectDetailTab = 'overview';
  state.editingProjectPlan = true;
  state.editingProjectFocus = false;
  state.projectDetailMoreOpen = false;
  state.inlineDeliveryEditId = null;
  state.editingDeliveryTaskId = null;
  state.deliveryForm = null;
  render();
}

function cancelEditProjectPlan() {
  state.editingProjectPlan = false;
  render();
}

function saveProjectPlan(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) {
    alert('仅项目负责人或创建人可编辑');
    return;
  }
  const name = (document.getElementById('projectPlanName')?.value || '').trim();
  if (!name) {
    alert('请输入项目名称');
    return;
  }
  const oldManager = project.manager;
  project.name = name;
  project.manager = (document.getElementById('projectPlanManager')?.value || '').trim() || project.manager;
  project.dept = (document.getElementById('projectPlanDept')?.value || '').trim() || project.dept;
  project.teamMembers = sanitizeProjectTeamMembers(
    project.manager,
    getProjectTeamMembersForm()
  );
  project.objective = (document.getElementById('projectPlanObjective')?.value || '').trim();
  project.value = (document.getElementById('projectPlanValue')?.value || '').trim();
  project.scope = (document.getElementById('projectPlanScope')?.value || '').trim();
  project.outOfScope = (document.getElementById('projectPlanOutOfScope')?.value || '').trim();
  const endDate = (document.getElementById('projectPlanEndDate')?.value || '').trim();
  const changeReason = (document.getElementById('projectPlanChangeReason')?.value || '').trim();
  const oldEnd = project.endDate || '';
  if (endDate && endDate !== oldEnd) {
    if (!project.originalEndDate && oldEnd) project.originalEndDate = oldEnd;
    if (project.originalEndDate && !changeReason) {
      alert('修改最终完成时间请填写变更原因');
      return;
    }
    project.endDate = endDate;
    if (changeReason) project.changeReason = changeReason;
  } else if (changeReason) {
    project.changeReason = changeReason;
  }
  normalizeProjectRecord(project);
  if (project.manager && project.manager !== oldManager) {
    notifyProjectManagerAssigned(project);
  }
  state.editingProjectPlan = false;
  save({ immediateSync: true });
  render();
}

function syncProjectPhaseFromMilestones(projectId, opts = {}) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) {
    if (!opts.silent) alert('仅项目负责人或创建人可同步');
    return;
  }
  const milestones = tasks
    .filter(t => t.projectId === projectId && isMilestoneTask(t))
    .slice()
    .sort((a, b) => String(a.milestoneSeq || a.planStartDate || a.title || '')
      .localeCompare(String(b.milestoneSeq || b.planStartDate || b.title || ''), 'zh'));
  if (!milestones.length) {
    if (!opts.silent) alert('尚无里程碑，无法同步阶段');
    return;
  }
  const open = milestones.find(m => m.status !== 'done' && m.status !== 'archived');
  const driver = open || milestones[milestones.length - 1];
  const before = project.currentPhase || '';
  project.currentPhase = String(driver.title || driver.milestoneSeq || '').trim();
  project.phaseDriverMilestoneId = driver.id;
  project.phaseSyncedAt = new Date().toISOString();
  if (before !== project.currentPhase) {
    appendChangeLogEntry({
      taskId: `PROJECT-${projectId}`,
      operator: currentUser.name,
      operateTime: new Date().toLocaleString(),
      before: before || '（空）',
      after: project.currentPhase || '（空）',
      reason: '同步当前阶段（随里程碑）',
      project: project.name,
    });
  }
  if (!opts.silent) {
    save({ immediateSync: true });
    render();
  }
}

function showProjectHandoverModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) {
    alert('仅项目负责人或创建人可交接');
    return;
  }
  const to = prompt('请输入交接给谁的姓名（须与人员档案一致）', '');
  if (to == null) return;
  const toName = String(to).trim();
  if (!toName) return;
  const note = prompt('交接备注（可选）', '') || '';
  const fromName = project.manager || '';
  if (toName === fromName) {
    alert('交接人与当前负责人相同');
    return;
  }
  if (!Array.isArray(project.handoverRecords)) project.handoverRecords = [];
  project.handoverRecords.push({
    from: fromName,
    to: toName,
    at: new Date().toISOString(),
    note: String(note).trim(),
    by: currentUser.name,
  });
  if (fromName && !isSamePersonName(fromName, toName)) {
    project.teamMembers = sanitizeProjectTeamMembers(toName, [...(project.teamMembers || []), fromName]);
  }
  project.manager = toName;
  appendChangeLogEntry({
    taskId: `PROJECT-${projectId}`,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: fromName || '（空）',
    after: toName,
    reason: note ? `项目交接：${note}` : '项目交接',
    project: project.name,
  });
  normalizeProjectRecord(project);
  save({ immediateSync: true });
  render();
}

function renderProjectIssuesPanel(project, canManage) {
  const list = issues.filter(i => String(i.projectId) === String(project.id));
  const statusLabel = {
    open: '待处理', in_progress: '处理中', resolved: '已解决', verified: '已验收', closed: '已关闭',
  };
  const statusColor = {
    open: '#B45309', in_progress: '#1D4ED8', resolved: '#7C3AED', verified: '#047857', closed: '#6B7280',
  };
  const rows = list.map(iss => `
    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg-panel);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
        <div style="font-weight:600;font-size:13px;">${escapeHtml(iss.title || '')}</div>
        <span style="font-size:11px;color:${statusColor[iss.status] || '#6B7280'};white-space:nowrap;font-weight:600;">${escapeHtml(statusLabel[iss.status] || iss.status || '')}</span>
      </div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;line-height:1.45;">
        ${iss.fact ? `<div>事实：${escapeHtml(iss.fact)}</div>` : ''}
        ${iss.cause ? `<div>原因：${escapeHtml(iss.cause)}</div>` : ''}
        ${iss.impact ? `<div>影响：${escapeHtml(iss.impact)}</div>` : ''}
        ${iss.solution ? `<div>方案：${escapeHtml(iss.solution)}</div>` : ''}
        ${iss.assignee ? `<div>跟进：${escapeHtml(iss.assignee)}</div>` : ''}
        ${iss.supporter ? `<div>支持：${escapeHtml(iss.supporter)}</div>` : ''}
        ${iss.expectedCloseDate ? `<div>预计：${escapeHtml(iss.expectedCloseDate)}</div>` : ''}
        ${iss.verifyNote ? `<div>验收：${escapeHtml(iss.verifyNote)}</div>` : ''}
      </div>
      ${canManage ? `
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-ghost btn-sm" onclick="showIssueEditModal('${iss.id}')">编辑</button>
        ${iss.status === 'open' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="setIssueStatus('${iss.id}','in_progress')">处理中</button>` : ''}
        ${iss.status === 'in_progress' || iss.status === 'open' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="setIssueStatus('${iss.id}','resolved')">已解决</button>` : ''}
        ${iss.status === 'resolved' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="setIssueStatus('${iss.id}','verified')">验收</button>` : ''}
        ${iss.status !== 'closed' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="setIssueStatus('${iss.id}','closed')">关闭</button>` : ''}
      </div>` : ''}
    </div>
  `).join('');
  return `
    <section>
      <h3 class="project-detail-section-title">
        <span>问题 / 风险</span>
        ${canManage ? `<button type="button" class="btn btn-primary btn-sm" onclick="showIssueCreateModal('${project.id}')"><i class="fas fa-plus"></i> 新建</button>` : ''}
      </h3>
      <div class="project-focus-panel">
        ${rows || '<div style="font-size:13px;color:#9CA3AF;">暂无问题记录</div>'}
        ${(project.handoverRecords || []).length ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #E5E7EB;">
            <div style="font-size:12px;font-weight:600;margin-bottom:6px;">交接记录</div>
            ${(project.handoverRecords || []).slice().reverse().map(h => `
              <div style="font-size:12px;color:#6B7280;margin-bottom:4px;">
                ${escapeHtml((h.at || '').replace('T', ' ').slice(0, 19))}：${escapeHtml(h.from || '空')} → ${escapeHtml(h.to || '')}
                ${h.note ? `（${escapeHtml(h.note)}）` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function showIssueCreateModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) return;
  state.form = {
    issueId: '',
    projectId,
    title: '',
    status: 'open',
    fact: '',
    cause: '',
    impact: '',
    solution: '',
    supporter: '',
    assignee: currentUser.name,
    expectedCloseDate: '',
    verifyNote: '',
  };
  state.showModal = 'issueEdit';
  render();
}

function showIssueEditModal(issueId) {
  const iss = issues.find(i => i.id === issueId);
  if (!iss) return;
  const project = projects.find(p => p.id === iss.projectId);
  if (!project || !canManageProject(project)) return;
  state.form = {
    issueId: iss.id,
    projectId: iss.projectId,
    title: iss.title || '',
    status: iss.status || 'open',
    fact: iss.fact || '',
    cause: iss.cause || '',
    impact: iss.impact || '',
    solution: iss.solution || '',
    supporter: iss.supporter || '',
    assignee: iss.assignee || '',
    expectedCloseDate: iss.expectedCloseDate || '',
    verifyNote: iss.verifyNote || '',
  };
  state.showModal = 'issueEdit';
  render();
}

function renderIssueEditModal() {
  const form = state.form || {};
  const isEdit = !!form.issueId;
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:640px;max-height:90vh;overflow:auto;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-exclamation-circle" style="color:#D97706;margin-right:8px;"></i>${isEdit ? '编辑问题' : '新建问题'}</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="display:grid;gap:12px;">
          <div>
            <label class="form-label">标题 *</label>
            <input class="form-input" value="${escapeHtml(form.title || '')}" oninput="state.form.title=this.value" placeholder="简要描述问题">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label">状态</label>
              <select class="select" style="width:100%;" onchange="state.form.status=this.value">
                <option value="open" ${form.status === 'open' ? 'selected' : ''}>待处理</option>
                <option value="in_progress" ${form.status === 'in_progress' ? 'selected' : ''}>处理中</option>
                <option value="resolved" ${form.status === 'resolved' ? 'selected' : ''}>已解决</option>
                <option value="verified" ${form.status === 'verified' ? 'selected' : ''}>已验收</option>
                <option value="closed" ${form.status === 'closed' ? 'selected' : ''}>已关闭</option>
              </select>
            </div>
            <div>
              <label class="form-label">预计关闭日</label>
              <input class="form-input" type="date" value="${escapeHtml(form.expectedCloseDate || '')}" oninput="state.form.expectedCloseDate=this.value">
            </div>
          </div>
          <div>
            <label class="form-label">事实</label>
            <textarea class="textarea" style="width:100%;height:56px;" oninput="state.form.fact=this.value">${escapeHtml(form.fact || '')}</textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label">原因</label>
              <textarea class="textarea" style="width:100%;height:56px;" oninput="state.form.cause=this.value">${escapeHtml(form.cause || '')}</textarea>
            </div>
            <div>
              <label class="form-label">影响</label>
              <textarea class="textarea" style="width:100%;height:56px;" oninput="state.form.impact=this.value">${escapeHtml(form.impact || '')}</textarea>
            </div>
          </div>
          <div>
            <label class="form-label">方案</label>
            <textarea class="textarea" style="width:100%;height:56px;" oninput="state.form.solution=this.value">${escapeHtml(form.solution || '')}</textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label">跟进人</label>
              <input class="form-input" value="${escapeHtml(form.assignee || '')}" oninput="state.form.assignee=this.value">
            </div>
            <div>
              <label class="form-label">需要谁支持</label>
              <input class="form-input" value="${escapeHtml(form.supporter || '')}" oninput="state.form.supporter=this.value">
            </div>
          </div>
          <div>
            <label class="form-label">验收说明 ${(form.status === 'closed' || form.status === 'verified') ? '<span class="form-required">*</span>' : ''}</label>
            <textarea class="textarea" style="width:100%;height:56px;" oninput="state.form.verifyNote=this.value" placeholder="关闭/验收时必填">${escapeHtml(form.verifyNote || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="saveIssueForm()"><i class="fas fa-save"></i> 保存</button>
        </div>
      </div>
    </div>
  `;
}

function saveIssueForm() {
  const form = state.form || {};
  const project = projects.find(p => p.id === form.projectId);
  if (!project || !canManageProject(project)) {
    alert('无权操作');
    return;
  }
  const title = String(form.title || '').trim();
  if (!title) {
    alert('请填写问题标题');
    return;
  }
  const status = form.status || 'open';
  const verifyNote = String(form.verifyNote || '').trim();
  if ((status === 'closed' || status === 'verified') && !verifyNote) {
    alert('关闭或验收须填写验收说明');
    return;
  }
  const now = new Date().toISOString();
  const payload = {
    title,
    status,
    fact: String(form.fact || '').trim(),
    cause: String(form.cause || '').trim(),
    impact: String(form.impact || '').trim(),
    solution: String(form.solution || '').trim(),
    supporter: String(form.supporter || '').trim(),
    assignee: String(form.assignee || '').trim(),
    expectedCloseDate: String(form.expectedCloseDate || '').trim(),
    verifyNote,
    updatedAt: now,
  };
  if (status === 'verified' || status === 'closed') {
    payload.verifiedAt = new Date().toLocaleString();
    payload.verifiedBy = currentUser.name;
    if (status === 'closed') payload.closedAt = now;
  }
  if (form.issueId) {
    const iss = issues.find(i => i.id === form.issueId);
    if (!iss) return;
    Object.assign(iss, payload);
  } else {
    issues.unshift({
      id: genId('ISS'),
      projectId: form.projectId,
      createdAt: now,
      createdBy: currentUser.name,
      verifiedAt: payload.verifiedAt || '',
      verifiedBy: payload.verifiedBy || '',
      closedAt: payload.closedAt || '',
      ...payload,
    });
  }
  closeModal();
  save({ immediateSync: true });
  render();
}

function createProjectIssue(projectId) {
  showIssueCreateModal(projectId);
}

function editProjectIssue(issueId) {
  showIssueEditModal(issueId);
}

function setIssueStatus(issueId, status) {
  const iss = issues.find(i => i.id === issueId);
  if (!iss) return;
  const project = projects.find(p => p.id === iss.projectId);
  if (!project || !canManageProject(project)) return;
  if (status === 'closed' || status === 'verified') {
    const note = prompt('请填写验收说明（必填）', iss.verifyNote || '');
    if (note == null) return;
    if (!String(note).trim()) {
      alert('关闭或验收须填写验收说明');
      return;
    }
    iss.verifyNote = String(note).trim();
    iss.verifiedAt = new Date().toLocaleString();
    iss.verifiedBy = currentUser.name;
    if (status === 'closed') iss.closedAt = new Date().toISOString();
  }
  iss.status = status;
  iss.updatedAt = new Date().toISOString();
  save({ immediateSync: true });
  render();
}

function upgradeBlockerToIssue(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) return;
  const blocker = String(project.blocker || '').trim();
  if (!blocker) {
    alert('当前无卡点');
    return;
  }
  if (!confirm('将当前卡点升级为问题记录？')) return;
  issues.unshift({
    id: genId('ISS'),
    projectId,
    title: blocker.slice(0, 80),
    status: 'open',
    fact: blocker,
    cause: '',
    impact: '',
    solution: '',
    supporter: '',
    assignee: currentUser.name,
    expectedCloseDate: '',
    verifiedAt: '',
    verifiedBy: '',
    closedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: currentUser.name,
  });
  save({ immediateSync: true });
  render();
}

function startEditProjectFocus() {
  state.projectDetailTab = 'overview';
  state.editingProjectFocus = true;
  state.editingProjectPlan = false;
  state.projectDetailMoreOpen = false;
  render();
}

function cancelEditProjectFocus() {
  state.editingProjectFocus = false;
  render();
}

function saveProjectFocus(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) {
    alert('仅项目负责人或创建人可编辑');
    return;
  }
  applyProjectFocusFields(project, readProjectFocusFromDom());
  syncProjectFocusToForm(projectId);
  state.editingProjectFocus = false;
  save({ immediateSync: true });
  render();
}

function renderProjectDetailTaskPanel(project) {
  const scope = state.detailTaskScope === 'mine' ? 'mine' : 'all';
  const milestoneId = state.detailMilestoneId || '';
  const { allProjectTasks, visibleTasks, rootTasks, mineIds } = getPlanRootTasks(project, milestoneId, scope);
  const workVisible = visibleTasks.filter(t => !isMilestoneTask(t));
  const milestoneOpts = getProjectRootTasks(allProjectTasks).filter(isMilestoneTask);
  let emptyHint = '请先「添加里程碑」，再在里程碑下「添加任务」';
  let emptyTitle = '暂无任务计划';
  if (rootTasks.length && !workVisible.length) {
    if (milestoneId && scope === 'mine') {
      emptyTitle = '该里程碑下暂无我的任务';
      emptyHint = '可切换范围到「全部任务」，或选择其他里程碑';
    } else if (milestoneId) {
      emptyTitle = '该里程碑下暂无任务';
      emptyHint = '可点击「添加任务」在该里程碑下拆解';
    } else if (scope === 'mine') {
      emptyTitle = '暂无我的任务';
      emptyHint = '可切换范围到「全部任务」查看完整计划';
    } else {
      emptyTitle = '里程碑下暂无任务';
      emptyHint = '可在里程碑下添加任务';
    }
  } else if (!rootTasks.length && scope === 'mine' && allProjectTasks.some(isMilestoneTask)) {
    emptyTitle = '暂无我的任务';
    emptyHint = '可切换范围到「全部任务」查看完整计划';
  }
  return `
    <div class="project-detail-section-title">
      <span>任务计划</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <select class="select" style="min-width:120px;font-size:12px;" onchange="state.detailMilestoneId=this.value;render()">
          <option value="" ${!milestoneId ? 'selected' : ''}>全部里程碑</option>
          ${milestoneOpts.map(t => `
            <option value="${escapeHtml(t.id)}" ${milestoneId === t.id ? 'selected' : ''}>${escapeHtml(t.title || t.id)}</option>
          `).join('')}
        </select>
        <select class="select" style="min-width:100px;font-size:12px;" onchange="state.detailTaskScope=this.value;render()">
          <option value="all" ${scope === 'all' ? 'selected' : ''}>全部任务</option>
          <option value="mine" ${scope === 'mine' ? 'selected' : ''}>我的任务</option>
        </select>
        ${!isProjectArchived(project) && canManageProject(project) ? `
          <button class="btn btn-ghost btn-sm" onclick="showNewMilestoneModal('${project.id}')"><i class="fas fa-flag"></i>里程碑</button>
          <button class="btn btn-primary btn-sm" onclick="showNewTaskModal('${project.id}')"><i class="fas fa-plus"></i>任务</button>
        ` : ''}
      </div>
    </div>
    ${renderProjectDependencyPanel(project.id)}
    <div class="panel" style="margin-top:12px;">
      <div class="panel-body" style="padding:12px;">
        ${rootTasks.length === 0 ? renderEmptyState({ icon: 'fa-flag', title: emptyTitle, hint: emptyHint }) : ''}
        ${rootTasks.map(m => renderMilestonePlanSection(m, visibleTasks, mineIds)).join('')}
      </div>
    </div>
  `;
}

function normalizeProjectDetailTab(tab) {
  if (tab === 'overview') return 'overview';
  if (tab === 'progress' || tab === 'plan') return 'plan';
  return 'work';
}

function isProjectDetailEditing() {
  // 任务页内编辑时只留执行页签；计划书/推进已挂在标题区，不锁页签
  return !!state.taskEditInline;
}

function renderSevenGridChip(cell, { mini, onclick } = {}) {
  const kind = cell.status === 'ok' ? 'is-ok' : (cell.status === 'weak' ? 'is-weak' : 'is-empty');
  const cls = `seven-grid-chip ${kind}${mini ? ' is-mini' : ''}`;
  const title = `${cell.key ? cell.key + ' ' : ''}${cell.label}：${sevenGridStatusLabel(cell.status)}`;
  const body = `
    ${cell.key ? `<span class="seven-grid-chip-k">${escapeHtml(cell.key)}</span>` : ''}
    <span class="seven-grid-chip-l">${escapeHtml(cell.label)}</span>
    <span class="seven-grid-chip-s">${sevenGridStatusLabel(cell.status)}</span>
  `;
  if (onclick) {
    return `<button type="button" class="${cls}" title="${escapeHtml(title)}（点击跳转）" onclick="${onclick}">${body}</button>`;
  }
  return `<span class="${cls}" title="${escapeHtml(title)}">${body}</span>`;
}

function pickMilestoneForSevenGridJump(project, gridKey) {
  const list = getProjectMilestones(project);
  if (!list.length) return null;
  if (gridKey) {
    const need = list.find(m => {
      const cell = getMilestoneSevenGridHealth(m, project).cells.find(c => c.key === gridKey);
      return cell && cell.status !== 'ok';
    });
    if (need) return need;
  }
  const incomplete = list.find(m => !getDeliveryCompleteness(m).complete);
  return incomplete || list[0];
}

function jumpToMilestoneSevenGrid(milestoneId, gridKey) {
  const milestone = tasks.find(t => t.id === milestoneId);
  if (!milestone) return;
  const project = projects.find(p => p.id === milestone.projectId);
  if (!project) return;
  state.form = { ...(state.form || {}), projectId: project.id };
  state.currentProjectId = project.id;
  jumpToSevenGridKey(project, gridKey, milestone);
}

function jumpToProjectSevenGrid(gridKey) {
  const pid = (state.form && state.form.projectId) || state.currentProjectId;
  const project = projects.find(p => p.id === pid);
  if (!project) return;
  const m = pickMilestoneForSevenGridJump(project, gridKey);
  jumpToSevenGridKey(project, gridKey, m);
}

function jumpToSevenGridKey(project, gridKey, milestone) {
  if (state.taskEditInline) state.taskEditInline = false;

  if (gridKey === 'R4' || gridKey === 'R5' || gridKey === 'R7') {
    const m = milestone || pickMilestoneForSevenGridJump(project, gridKey);
    if (m && canEditTask(m)) {
      state.inlineDeliveryEditId = null;
      state.editingDeliveryTaskId = null;
      state.deliveryForm = null;
      state.editingProjectPlan = false;
      editTask(m.id);
      return;
    }
  }

  // R1 / R2 / R3 / R6：进该里程碑清单填写
  const m = milestone || pickMilestoneForSevenGridJump(project, gridKey);
  if (m && canEditTask(m)) {
    if (gridKey === 'R2') state.planScrollAnchor = 'delivery-anchor-outOfScope';
    openTaskDeliveryEdit(m.id);
    return;
  }
  state.projectDetailTab = 'work';
  state.projectPlanView = 'list';
  render();
}

function setProjectDetailTab(tab) {
  if (isProjectDetailEditing()) return;
  state.projectDetailMoreOpen = false;
  if (tab === 'gantt') {
    state.projectDetailTab = 'work';
    state.projectPlanView = 'gantt';
    state.editingProjectPlan = false;
    state.editingProjectFocus = false;
    state.inlineDeliveryEditId = null;
    state.editingDeliveryTaskId = null;
    state.deliveryForm = null;
    render();
    return;
  }
  const next = normalizeProjectDetailTab(tab);
  state.projectDetailTab = next;
  if (next === 'work' && normalizeProjectWorkView(state.projectPlanView) === 'gantt') {
    state.projectPlanView = 'table';
  }
  if (next !== 'overview') {
    state.editingProjectPlan = false;
    state.editingProjectFocus = false;
  }
  if (next !== 'work') {
    state.inlineDeliveryEditId = null;
    state.editingDeliveryTaskId = null;
    state.deliveryForm = null;
  }
  render();
}

function renderProjectDetailTabs() {
  const tab = normalizeProjectDetailTab(state.projectDetailTab);
  const view = normalizeProjectWorkView(state.projectPlanView);
  const active = (tab === 'work' && view === 'gantt') ? 'gantt' : tab;
  const items = [
    { id: 'overview', label: '概览' },
    { id: 'work', label: '任务' },
    { id: 'gantt', label: '甘特' },
    { id: 'plan', label: '问题与记录' },
  ];
  const shown = isProjectDetailEditing()
    ? (active === 'gantt' ? items.filter(i => i.id === 'gantt') : items.filter(i => i.id === active))
    : items;
  return `
    <div class="project-detail-tabs" role="tablist" aria-label="项目详情页签">
      ${shown.map(item => `
        <button type="button"
          class="project-detail-tab${active === item.id ? ' active' : ''}"
          role="tab"
          aria-selected="${active === item.id ? 'true' : 'false'}"
          ${isProjectDetailEditing() ? 'disabled' : `onclick="setProjectDetailTab('${item.id}')"`}>
          ${item.label}
        </button>
      `).join('')}
    </div>
  `;
}

function renderProjectOverviewTab(project, canManage) {
  return `
    <div class="project-detail-tab-panel project-overview-grid">
      <div class="project-overview-main">
        ${renderProjectPlanPanel(project, canManage)}
      </div>
      <div class="project-overview-aside">
        ${canManage ? `
        <section>
          <h3 class="project-detail-section-title"><span>项目状态</span></h3>
          <div class="project-hero-status">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${Object.entries(projectStatusMap).filter(([key]) => key !== 'archived').map(([key, val]) => `
                <button onclick="updateProjectStatus('${project.id}', '${key}')" style="padding:6px 14px;border-radius:6px;border:1px solid ${project.status === key ? val.color : 'var(--border)'};background:${project.status === key ? val.bg : 'var(--bg-panel)'};color:${project.status === key ? val.color : 'var(--text-muted)'};cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                  <i class="fas ${val.icon}"></i>${val.label}
                </button>
              `).join('')}
              ${canManageProject(project) || isFullAccess(currentUser.role) ? `
              <button onclick="archiveProject('${project.id}')" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--bg-panel);color:#9CA3AF;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                <i class="fas fa-archive"></i>归档
              </button>
              ` : ''}
            </div>
          </div>
        </section>
        ` : ''}
        ${renderProjectFocusPanel(project, canManage)}
      </div>
    </div>
  `;
}

function renderProjectWorkSplit(project) {
  const view = normalizeProjectWorkView(state.projectPlanView);
  if (view === 'gantt') {
    return `
      <div class="project-detail-tab-panel">
        <div class="project-work-gantt-wrap">
          ${renderProjectWorkToolbar(project)}
          ${renderProjectGanttSection(project)}
        </div>
      </div>
    `;
  }
  return `
    <div class="project-detail-tab-panel">
      <div class="project-work-split">
        <aside class="project-work-rail">
          ${renderWorkMilestoneRail(project)}
          ${renderProjectFocusMini(project)}
        </aside>
        <div class="project-work-main">
          ${view === 'table'
            ? renderProjectMilestoneTabsSection(project, { hideTabs: true })
            : `<div class="project-work-board-wrap">${renderProjectWorkToolbar(project)}${renderProjectDeliveryBoard(project, { hideTabs: true })}</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderProjectFocusMini(project) {
  const { currentPhase, nextPlan, blocker } = getProjectFocusFields(project);
  const phaseText = currentPhase || '暂无当前阶段';
  const nextText = nextPlan || '暂无下一步';
  const blockerText = String(blocker || '').trim();
  return `
    <div class="project-focus-mini">
      <div class="project-focus-mini-head">
        <span>推进情况</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="setProjectDetailTab('overview')">详情</button>
      </div>
      <div class="project-focus-mini-row"><span class="k">当前阶段</span><span class="v">${escapeHtml(phaseText)}</span></div>
      <div class="project-focus-mini-row"><span class="k">下一步</span><span class="v">${escapeHtml(nextText)}</span></div>
      ${blockerText
        ? `<span class="project-focus-mini-tag" title="${escapeHtml(blockerText)}">卡点</span>`
        : `<div class="project-focus-mini-ok">暂无卡点</div>`}
    </div>
  `;
}

function renderProjectDetailTabBody(project, canManage) {
  const tab = normalizeProjectDetailTab(state.projectDetailTab);
  const editingOnly = isProjectDetailEditing();
  if (tab === 'overview') {
    return renderProjectOverviewTab(project, canManage);
  }
  if (tab === 'work') {
    if (editingOnly && state.taskEditInline) {
      return `<div class="project-detail-tab-panel">${renderTaskEditModal()}</div>`;
    }
    return renderProjectWorkSplit(project);
  }
  return `
    <div class="project-detail-tab-panel project-detail-side">
      ${editingOnly ? '' : renderProjectIssuesPanel(project, canManage)}
      ${editingOnly ? '' : renderProjectChangeLogsSection(project)}
    </div>
  `;
}

function toggleProjectDetailMoreMenu(ev) {
  if (ev) ev.stopPropagation();
  state.projectDetailMoreOpen = !state.projectDetailMoreOpen;
  if (state.projectDetailMoreOpen) {
    state.settingsOpen = false;
    setTimeout(() => {
      document.addEventListener('click', closeProjectDetailMoreOnOutsideClick, { once: true });
    }, 0);
  }
  render();
}

function closeProjectDetailMoreMenu() {
  if (!state.projectDetailMoreOpen) return;
  state.projectDetailMoreOpen = false;
  render();
}

function closeProjectDetailMoreOnOutsideClick() {
  if (state.projectDetailMoreOpen) closeProjectDetailMoreMenu();
}

function renderProjectDetailMoreMenu(project, canManage) {
  const blocker = String(getProjectFocusFields(project).blocker || '').trim();
  const editingFocus = !!(canManage && state.editingProjectFocus);
  const items = [];
  if (canManage && !editingFocus) {
    items.push({ onclick: `startEditProjectFocus()`, icon: 'fa-stream', label: '编辑推进' });
  }
  if (canManage) {
    items.push({ onclick: `syncProjectPhaseFromMilestones('${project.id}')`, icon: 'fa-sync', label: '同步阶段' });
    if (blocker) {
      items.push({ onclick: `upgradeBlockerToIssue('${project.id}')`, icon: 'fa-level-up-alt', label: '卡点升级' });
    }
  }
  items.push({ onclick: `copyProjectPlanLedger('${project.id}')`, icon: 'fa-copy', label: '复制台账' });
  items.push({ onclick: `exportProjectPlanLedger('${project.id}')`, icon: 'fa-file-excel', label: '导出' });
  if (canVerifyProjectPlan(project)) {
    items.push({
      onclick: `toggleProjectPlanVerified('${project.id}')`,
      icon: 'fa-stamp',
      label: project.planVerified ? '取消校验' : '校验',
    });
  }
  if (canManage) {
    items.push({ onclick: `showProjectHandoverModal('${project.id}')`, icon: 'fa-handshake', label: '交接' });
    if (canManageProjectTemplates()) {
      items.push({ onclick: `saveProjectAsTemplate('${project.id}')`, icon: 'fa-clone', label: '存为模板' });
    }
  }
  const danger = canDeleteProject()
    ? `<button type="button" class="settings-dropdown-item" style="color:#DC2626;" onclick="closeProjectDetailMoreMenu();deleteProject('${project.id}')"><i class="fas fa-trash-alt"></i><span>删除项目</span></button>`
    : '';
  if (!items.length && !danger) return '';
  return `
    <div class="settings-dropdown" onclick="event.stopPropagation()">
      ${items.map(item => `
        <button type="button" class="settings-dropdown-item" onclick="closeProjectDetailMoreMenu();${item.onclick}">
          <i class="fas ${item.icon}"></i>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `).join('')}
      ${danger ? `<div class="settings-dropdown-divider"></div>${danger}` : ''}
    </div>
  `;
}

function renderProjectDetailToolbar(project, canManage) {
  const editingPlan = !!(canManage && state.editingProjectPlan);
  const moreOpen = !!state.projectDetailMoreOpen;
  return `
    <div class="project-detail-toolbar">
      <div class="project-detail-crumb">
        <button type="button" class="project-detail-crumb-link" onclick="goBack()">返回项目管理</button>
        <span class="project-detail-crumb-sep">/</span>
        <span>项目详情</span>
      </div>
      <div class="project-detail-toolbar-actions">
        ${canManage && !editingPlan ? `
          <button type="button" class="btn btn-ghost btn-sm" onclick="startEditProjectPlan()"><i class="fas fa-file-alt"></i> 编辑计划</button>
        ` : ''}
        ${canManage && !isProjectArchived(project) ? `
          <button type="button" class="btn btn-primary btn-sm" onclick="showNewTaskModal('${project.id}')"><i class="fas fa-plus"></i> 新建任务</button>
        ` : ''}
        <div class="project-detail-more-wrap">
          <button type="button" class="btn btn-ghost btn-sm ${moreOpen ? 'is-open' : ''}" onclick="toggleProjectDetailMoreMenu(event)">
            <i class="fas fa-ellipsis-h"></i> 更多
          </button>
          ${moreOpen ? renderProjectDetailMoreMenu(project, canManage) : ''}
        </div>
      </div>
    </div>
  `;
}

function renderProjectHeroMembers(project, memberNames) {
  const names = memberNames || [];
  if (!names.length) {
    return `<span class="project-hero-members-empty">暂无成员</span>`;
  }
  return renderAvatarStack(names, 4);
}

function renderProjectDetail() {
  const project = projects.find(p => p.id === state.form.projectId);
  if (!project || !canViewProject(project)) {
    if (project && !canViewProject(project)) alert('无权查看该项目');
    return renderProjects();
  }

  // 兼容旧状态：里程碑/任务/交付检查 已合并为项目执行
  if (state.projectPlanView === 'delivery') {
    state.projectPlanView = 'list';
  }
  if (state.projectDetailTab === 'progress') {
    state.projectDetailTab = 'work';
  }
  if (state.projectDetailTab === 'milestones' || state.projectDetailTab === 'tasks' || state.projectDetailTab === 'delivery') {
    if (state.projectDetailTab === 'tasks' && state.projectPlanView !== 'gantt') {
      state.projectPlanView = 'table';
    }
    if (state.projectDetailTab === 'delivery') {
      state.projectPlanView = 'list';
    }
  }
  state.projectDetailTab = normalizeProjectDetailTab(state.projectDetailTab);
  state.projectPlanView = normalizeProjectWorkView(state.projectPlanView);

  const stats = getProjectListStats(project);
  const accent = getProjectAccentColor(project);
  const memberNames = getProjectMemberNames(project);
  const canManage = canManageProject(project) && !isProjectArchived(project);

  return `
    <div>
      ${isProjectArchived(project) ? `<p class="content-intro" style="margin-bottom:16px;"><i class="fas fa-archive" style="margin-right:6px;"></i>该项目已归档，仅可查看。归档操作请在未归档项目的详情页进行。</p>` : ''}
      ${isProjectPaused(project) ? `<p class="content-intro" style="margin-bottom:16px;"><i class="fas fa-pause-circle" style="margin-right:6px;"></i>项目已暂停：下属未完成任务已同步暂停，不计入待办与工时。恢复项目后将自动恢复这些任务状态。</p>` : ''}

      ${renderProjectDetailToolbar(project, canManage)}

      <div class="project-hero project-hero--compact">
        <div class="project-hero-compact">
          <div class="project-hero-identity">
            ${renderProjectIconTile(project, 'lg')}
            <div style="min-width:0;flex:1;">
              <div class="project-hero-title-line">
                <h2 class="project-hero-title" style="margin:0;">${escapeHtml(project.name || '')}</h2>
                ${renderProjectStatusBadge(project)}
              </div>
              <div class="project-hero-desc">${escapeHtml(project.objective || project.desc || '暂无目标/描述')}</div>
              <div class="project-hero-meta">
                <span>${escapeHtml((project.startDate || '-') + ' — ' + (project.endDate || '-'))}</span>
                ${renderProjectHeroMembers(project, memberNames)}
              </div>
            </div>
          </div>
          <div class="project-hero-kpi">
            <div class="project-hero-kpi-item is-progress">
              <div class="l">进度 ${stats.progress}%</div>
              <div class="progress-bar"><div class="progress-fill" style="width:${stats.progress}%;background:${accent};"></div></div>
            </div>
            <div class="project-hero-kpi-item">
              <div class="l">总任务</div>
              <div class="v">${stats.total}</div>
            </div>
            <div class="project-hero-kpi-item">
              <div class="l">已完成</div>
              <div class="v">${stats.done}</div>
            </div>
            <div class="project-hero-kpi-item${stats.overdue ? ' is-overdue' : ''}">
              <div class="l">延期</div>
              <div class="v">${stats.overdue}</div>
            </div>
          </div>
        </div>
      </div>

      ${renderProjectDetailTabs()}
      <div class="project-detail-layout">
        ${renderProjectDetailTabBody(project, canManage)}
      </div>
    </div>
  `;
}

function renderProjectTaskTree(task, level, allTasks, mineIds = null) {
  if (isMilestoneTask(task)) return '';
  const displayStatus = getTaskDisplayStatus(task);
  const st = statusMap[displayStatus] || statusMap[task.status];
  const pr = priorityMap[task.priority];
  const children = allTasks.filter(t => t.parentId === task.id && !isMilestoneTask(t));
  const progress = getDisplayProgress(task);
  const indent = level * 24;
  const isAncestorOnly = !!(mineIds && !mineIds.has(task.id));

  let html = `
    <div class="${isAncestorOnly ? 'plan-task-ancestor' : ''}" style="padding:12px 16px;background:${task.status === 'abolished' ? '#F9FAFB' : level === 0 ? '#F9FAFB' : '#FAFAFA'};border-radius:8px;border:1px solid ${task.status === 'abolished' ? '#E5E7EB' : '#E5E7EB'};margin-bottom:8px;${level > 0 ? 'margin-left:' + indent + 'px;' : ''}cursor:pointer;opacity:${task.status === 'abolished' ? '0.75' : isAncestorOnly ? '0.62' : '1'};${isTaskBlocked(task) ? 'border-color:#FDE68A;background:#FFFBEB;' : isOverdue(task) ? 'border-color:#FECACA;background:#FFFBFB;' : ''}" onclick="viewTask('${task.id}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        ${level > 0 ? '<span style="color:#CBD5E1;font-size:12px;">└</span>' : ''}
        <span class="priority-dot priority-${task.priority}"></span>
        <span style="font-size:14px;font-weight:500;flex:1;${task.status === 'abolished' ? 'text-decoration:line-through;color:#9CA3AF;' : ''}">${task.title}${isAncestorOnly ? '<span class="plan-ancestor-tag">上级</span>' : ''}${renderDependencyBadges(task, true)}</span>
        ${task.type === 'temp' ? '<span class="tag tag-temp" style="font-size:10px;"><i class="fas fa-bolt"></i>临时</span>' : ''}
        ${renderIntakeSourceTag(task, true)}
        ${renderIntakeHoursHint(task, true)}
        ${task.status === 'abolished' ? '<span class="tag" style="background:var(--bg-muted);color:#9CA3AF;font-size:10px;"><i class="fas fa-ban"></i>已作废</span>' : ''}
        <span class="status-tag status-${displayStatus}" style="font-size:10px;">${st.label}</span>
      </div>
      <div style="display:flex;align-items:center;gap:16px;font-size:12px;color:#9CA3AF;">
        <span><i class="fas fa-user" style="margin-right:4px;"></i>${task.assignee}</span>
        <span><i class="fas fa-clock" style="margin-right:4px;"></i>${formatTaskCreatedAt(task.createdAt)}</span>
        <span><i class="fas fa-calendar" style="margin-right:4px;"></i>${task.dueDate || '-'}</span>
        <span>进度：${progress}%</span>
      </div>
      <div style="margin-top:8px;">
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%;"></div></div>
      </div>
    </div>
  `;

  children.forEach(c => {
    html += renderProjectTaskTree(c, level + 1, allTasks, mineIds);
  });

  return html;
}

function showNewMilestoneModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) {
    alert('仅项目负责人或创建人可添加里程碑');
    return;
  }
  state.returnToTaskId = null;
  state.form = {
    projectId,
    parentId: null,
    isMilestone: true,
    type: 'normal',
    creator: currentUser.name,
    status: 'todo',
    priority: 'normal',
    progress: 0,
    assignee: project.manager || currentUser.name,
    milestoneSeq: getNextMilestoneSeq(projectId),
    roleA: project.manager || currentUser.name,
    roleR: project.manager || currentUser.name,
    roleC: '',
    roleV: '',
    deliverables: '',
    acceptanceCriteria: '',
    completionEvidence: '',
    outOfScope: '',
    depsRisks: '',
    escalation: '',
    delayImpact: '',
    reopenConditions: '',
    informCollaborators: [],
    assistCollaborators: [],
  };
  if (state.page !== 'projectDetail') {
    state.prevPage = state.page;
    state.page = 'projectDetail';
  }
  state.projectDetailTab = 'work';
  state.projectPlanView = 'table';
  state.taskEditInline = true;
  state.showModal = null;
  render();
}

function showNewTaskModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !canManageProject(project)) {
    alert('仅项目负责人或创建人可添加任务');
    return;
  }
  const milestones = getProjectRootTasks(
    tasks.filter(t => t.projectId === projectId && t.status !== 'abolished')
  ).filter(isMilestoneTask);
  if (!milestones.length) {
    alert('请先添加里程碑，再在里程碑下添加任务');
    return;
  }
  let parentId = getWorkMilestoneTabId(project);
  if (parentId === '__unassigned__' || (parentId && !milestones.some(m => m.id === parentId))) parentId = '';
  if (!parentId) parentId = milestones[0].id;
  state.returnToTaskId = null;
  state.form = {
    projectId,
    parentId,
    isMilestone: false,
    type: 'normal',
    creator: currentUser.name,
    status: 'todo',
    priority: 'normal',
    progress: 0,
    informCollaborators: [],
    assistCollaborators: [],
  };
  if (state.page !== 'projectDetail') {
    state.prevPage = state.page;
    state.page = 'projectDetail';
  }
  state.projectDetailTab = 'work';
  state.taskEditInline = true;
  state.showModal = null;
  render();
}

function showNewSubTaskModal(parentTaskId) {
  const parent = tasks.find(t => t.id === parentTaskId);
  if (!parent || !canCreateSubTask(parent)) {
    alert(isMilestoneTask(parent) ? '无权在该里程碑下添加任务' : '无权在该任务下添加子任务');
    return;
  }
  state.returnToTaskId = isMilestoneTask(parent) ? null : parentTaskId;
  state.form = {
    projectId: parent.projectId,
    parentId: parentTaskId,
    isMilestone: false,
    type: 'normal',
    creator: currentUser.name,
    status: 'todo',
    priority: 'normal',
    progress: 0,
    planStartDate: parent.planStartDate || new Date().toISOString().split('T')[0],
    dueDate: parent.dueDate || '',
    assignee: parent.assignee || currentUser.name,
    informCollaborators: [],
    assistCollaborators: [],
  };
  if (state.page !== 'projectDetail') {
    state.prevPage = state.page;
    state.page = 'projectDetail';
  }
  state.projectDetailTab = 'work';
  state.taskEditInline = true;
  state.showModal = null;
  render();
}
