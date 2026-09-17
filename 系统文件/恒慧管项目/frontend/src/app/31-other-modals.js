// ========== 其他弹窗简化实现 ==========
function renderTaskEditModal() {
  const task = tasks.find(t => t.id === state.form.id) || state.form;
  const isEdit = !!state.form.id;
  const isMilestoneForm = !!(state.form.isMilestone || (isEdit && isMilestoneTask(task)));
  const isSubTask = !isEdit && !!state.form.parentId && !isMilestoneForm;
  const parentTask = state.form.parentId ? tasks.find(t => t.id === state.form.parentId) : null;
  const breadcrumb = parentTask ? getTaskBreadcrumb(state.form.parentId) : [];
  const subTaskDepth = parentTask ? getTaskDepth(state.form.parentId) + 1 : 1;
  const projectMilestones = (state.form.projectId
    ? getProjectRootTasks(tasks.filter(t => t.projectId === state.form.projectId && t.status !== 'abolished')).filter(isMilestoneTask)
    : []).filter(m => !isEdit || m.id !== state.form.id);
  // 编辑时只有负责人可以操作
  const canEdit = !isEdit || canOperateTask(task);
  const assigneeName = task.assignee || state.form.assignee || currentUser.name;
  const selectedInformCollaborators = getTaskFormCollaboratorNames(task, COLLAB_TYPE_INFORM);
  const selectedAssistCollaborators = getTaskFormCollaboratorNames(task, COLLAB_TYPE_ASSIST);
  const advancedOpen = isUiSectionOpen('taskFormAdvanced');
  const modalTitle = isMilestoneForm
    ? (isEdit ? '编辑里程碑' : '新建里程碑')
    : (isEdit ? '编辑任务' : (isSubTask && parentTask && isMilestoneTask(parentTask) ? '添加任务' : (isSubTask ? '添加子任务' : '新建任务')));
  const inline = !!state.taskEditInline;

  return `
    <div class="${inline ? 'project-inline-editor' : 'modal-overlay'}">
      <div class="modal-box" onclick="event.stopPropagation()"${inline ? ' style="max-width:none;margin:0;box-shadow:none;border-radius:0;"' : ''}>
        <div class="modal-header">
          <h3 class="modal-title">${modalTitle}</h3>
          <button onclick="cancelAndGoBack()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          ${isMilestoneForm ? `
          <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;margin-bottom:16px;font-size:12px;border:1px solid #BFDBFE;color:#1E40AF;">
            <i class="fas fa-flag" style="margin-right:4px;"></i>里程碑不计入任务；其下全部任务完成后，才可自动或手动完成该里程碑。
          </div>
          ` : ''}
          ${!isMilestoneForm && !isEdit && state.form.projectId && (!parentTask || isMilestoneTask(parentTask)) ? `
          <div class="form-group">
            <label class="form-label">所属里程碑 <span class="form-required">*</span></label>
            <select class="select" style="width:100%;" onchange="state.form.parentId=this.value" ${!canEdit ? 'disabled' : ''}>
              ${projectMilestones.map(m => `<option value="${escapeHtml(m.id)}" ${state.form.parentId === m.id ? 'selected' : ''}>${escapeHtml(m.title || m.id)}</option>`).join('')}
            </select>
          </div>
          ` : ''}
          ${isSubTask && parentTask && !isMilestoneTask(parentTask) ? `
          <div style="padding:10px 12px;background:#F0FDF4;border-radius:8px;margin-bottom:16px;font-size:12px;border:1px solid #BBF7D0;">
            <div style="color:#6B7280;margin-bottom:6px;"><i class="fas fa-layer-group" style="margin-right:4px;color:#059669;"></i>上级任务路径 · 新建为第 <strong>${subTaskDepth}</strong> 层</div>
            <div style="color:#059669;line-height:1.8;font-weight:500;">
              ${breadcrumb.map((t, i) => `${i > 0 ? '<span style="color:#CBD5E1;font-weight:400;"> › </span>' : ''}<span>${t.title}</span>`).join('')}
            </div>
            ${subTaskDepth > 2 ? `
            <div style="margin-top:8px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;color:#92400E;">
              <i class="fas fa-info-circle" style="margin-right:4px;"></i>建议日常拆分控制在「主任务 → 子任务」两级；更深层级仍可保存，规则不变。
            </div>
            ` : ''}
          </div>
          ` : ''}
          <div class="form-section">
            <div class="form-section-title"><i class="fas fa-align-left"></i>基本信息</div>
            <div class="form-group">
              <label class="form-label">${isMilestoneForm ? '里程碑名称' : '任务标题'} <span class="form-required">*</span></label>
              <input class="input" style="width:100%;" value="${task.title || ''}" onchange="state.form.title=this.value" placeholder="${isMilestoneForm ? '输入里程碑名称' : '输入任务标题'}" ${!canEdit ? 'disabled' : ''}>
            </div>
            ${isMilestoneForm ? `
            <div class="form-group">
              <label class="form-label">M序号</label>
              <input class="input" style="width:100%;" value="${escapeHtml(task.milestoneSeq || state.form.milestoneSeq || '')}" onchange="state.form.milestoneSeq=this.value" placeholder="如 M1、M2" ${!canEdit ? 'disabled' : ''}>
            </div>
            ` : ''}
            <div class="form-group">
              <label class="form-label">${isMilestoneForm ? '里程碑说明' : '任务描述'}</label>
              <textarea class="textarea" style="width:100%;height:80px;" onchange="state.form.desc=this.value" placeholder="${isMilestoneForm ? '补充说明（可选）' : '描述任务内容'}" ${!canEdit ? 'disabled' : ''}>${task.desc || ''}</textarea>
            </div>
            ${isMilestoneForm ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">开始日期</label>
                <input class="input" type="date" style="width:100%;" value="${task.planStartDate || ''}" onchange="state.form.planStartDate=this.value" ${!canEdit ? 'disabled' : ''}>
                ${(task.originalPlanStartDate) ? `<div style="font-size:12px;color:#9CA3AF;margin-top:4px;">原定：${escapeHtml(task.originalPlanStartDate)}</div>` : ''}
              </div>
              <div class="form-group">
                <label class="form-label">完成日期</label>
                <input class="input" type="date" style="width:100%;" value="${task.dueDate || ''}" onchange="state.form.dueDate=this.value" ${!canEdit ? 'disabled' : ''}>
                ${(task.originalDueDate) ? `<div style="font-size:12px;color:#9CA3AF;margin-top:4px;">原定：${escapeHtml(task.originalDueDate)}</div>` : ''}
              </div>
            </div>
            <div class="form-section-title" style="margin-top:8px;"><i class="fas fa-user-check"></i>责任矩阵 A/R/C/V</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">A 唯一交付人</label>
                ${renderArcvPersonSelect('roleA', task.roleA || state.form.roleA || '', !canEdit)}
              </div>
              <div class="form-group">
                <label class="form-label">R 直接执行人</label>
                ${renderArcvPersonSelect('roleR', task.roleR || task.assignee || state.form.roleR || '', !canEdit)}
              </div>
              <div class="form-group" style="grid-column:1 / -1;">
                <label class="form-label">C 协作人</label>
                <div data-rolec-ms-host ${!canEdit ? 'data-disabled="1"' : ''}>
                  ${renderRoleCMultiSelect(getRoleCFormNames(task), !canEdit)}
                </div>
                <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">从人员档案多选；须本人确认</div>
              </div>
              <div class="form-group">
                <label class="form-label">V 业务验收人</label>
                ${renderArcvPersonSelect('roleV', task.roleV || state.form.roleV || '', !canEdit)}
              </div>
            </div>
            ${isEdit ? `
            <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;margin:12px 0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <span style="font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <i class="fas fa-clipboard-check" style="color:var(--text-muted);"></i>交付齐备
                ${renderDeliveryCompletenessBadge(task)}
              </span>
              ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${task.id}')"><i class="fas fa-arrow-right"></i> 去填写</button>` : `<span style="font-size:12px;color:var(--text-muted);">明细在项目执行</span>`}
            </div>
            ` : ''}
            <div class="form-section-title" style="margin-top:8px;"><i class="fas fa-clipboard-list"></i>本里程碑不交什么</div>
            <div class="form-group">
              <label class="form-label">不交什么 / 不做范围</label>
              <textarea class="textarea" style="width:100%;height:56px;" oninput="state.form.outOfScope=this.value" placeholder="本节点明确不做、不交的内容" ${!canEdit ? 'disabled' : ''}>${escapeHtml(task.outOfScope || state.form.outOfScope || '')}</textarea>
            </div>
            <div class="form-section-title" style="margin-top:8px;"><i class="fas fa-exclamation-triangle"></i>依赖与风险</div>
            <div class="form-group">
              <label class="form-label">依赖 / 风险 / 卡点</label>
              <textarea class="textarea" style="width:100%;height:56px;" oninput="state.form.depsRisks=this.value" placeholder="前置依赖、风险、当前卡点" ${!canEdit ? 'disabled' : ''}>${escapeHtml(task.depsRisks || state.form.depsRisks || '')}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
              <div class="form-group">
                <label class="form-label">升级条件</label>
                <input class="input" style="width:100%;" value="${escapeHtml(task.escalation || state.form.escalation || '')}" oninput="state.form.escalation=this.value" placeholder="何时升级" ${!canEdit ? 'disabled' : ''}>
              </div>
              <div class="form-group">
                <label class="form-label">延期影响</label>
                <input class="input" style="width:100%;" value="${escapeHtml(task.delayImpact || state.form.delayImpact || '')}" oninput="state.form.delayImpact=this.value" placeholder="延期后果" ${!canEdit ? 'disabled' : ''}>
              </div>
              <div class="form-group">
                <label class="form-label">重开条件</label>
                <input class="input" style="width:100%;" value="${escapeHtml(task.reopenConditions || state.form.reopenConditions || '')}" oninput="state.form.reopenConditions=this.value" placeholder="何时重开" ${!canEdit ? 'disabled' : ''}>
              </div>
            </div>
            ` : `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">负责人</label>
                ${renderPersonSingleSelect({
                  key: 'taskAssignee',
                  formField: 'assignee',
                  value: task.assignee || state.form.assignee || currentUser.name,
                  getCandidates: getTaskAssigneeCandidates,
                  placeholder: '从人员档案选择',
                  disabled: !canEdit,
                })}
              </div>
              <div class="form-group">
                <label class="form-label">优先级</label>
                <select class="select" style="width:100%;" onchange="state.form.priority=this.value" ${!canEdit ? 'disabled' : ''}>
                  <option value="normal" ${task.priority === 'normal' ? 'selected' : ''}>普通</option>
                  <option value="important" ${task.priority === 'important' ? 'selected' : ''}>重要</option>
                  <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>紧急</option>
                </select>
              </div>
            </div>
            ${isEdit ? `
            <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <span style="font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <i class="fas fa-clipboard-check" style="color:var(--text-muted);"></i>交付齐备
                ${renderDeliveryCompletenessBadge(task)}
              </span>
              ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openTaskDeliveryEdit('${task.id}')"><i class="fas fa-arrow-right"></i> 去填写</button>` : `<span style="font-size:12px;color:var(--text-muted);">明细在项目执行</span>`}
            </div>
            ` : ''}
            `}
          </div>
          <div class="form-section">
            <div class="form-section-title"><i class="fas fa-tasks"></i>进度与状态</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">进度 (%)</label>
                <input class="input" type="number" min="0" max="100" style="width:100%;" value="${task.progress || 0}" onchange="state.form.progress=parseInt(this.value)">
              </div>
              <div class="form-group">
                <label class="form-label">状态</label>
                ${isEdit && isTerminalTaskStatus(task.status) ? `
                <input class="input" style="width:100%;background:var(--bg-muted);" value="${(statusMap[task.status] || statusMap.todo).label}" disabled>
                ` : `
                <select class="select" style="width:100%;" onchange="state.form.status=this.value" ${!canEdit ? 'disabled' : ''}>
                  <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>待开始</option>
                  <option value="doing" ${task.status === 'doing' ? 'selected' : ''}>进行中</option>
                  <option value="done" ${task.status === 'done' ? 'selected' : ''}>已完成</option>
                  <option value="paused" ${task.status === 'paused' ? 'selected' : ''}>已暂停</option>
                  ${task.status === 'rejected' ? `<option value="rejected" selected>已驳回</option>` : ''}
                </select>
                `}
              </div>
            </div>
            ${isEdit ? '<div class="form-group"><label class="form-label">修改原因 <span class="form-required">*</span></label><textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.reason=this.value" placeholder="请填写修改原因（必填）"></textarea></div>' : ''}
          </div>

          ${renderLiteAdvancedToggle('taskFormAdvanced', '高级选项', '协办 / 工时 / 依赖')}
          ${advancedOpen ? `
          <div class="lite-advanced-body">
            <div class="form-section-title" style="margin-top:0;"><i class="fas fa-users"></i>协作与工时</div>
            <div class="form-group">
              <label class="form-label">创建人</label>
              <input class="input" style="width:100%;background:var(--bg-muted);" value="${isEdit ? task.creator : currentUser.name}" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">创建时间</label>
              <input class="input" style="width:100%;background:var(--bg-muted);" value="${isEdit ? formatTaskCreatedAt(task.createdAt) : '保存时自动记录'}" disabled>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">告知性协办人</label>
                <div data-collab-ms-host="inform">
                  ${renderCollaboratorMultiSelect(COLLAB_TYPE_INFORM, selectedInformCollaborators, assigneeName, selectedAssistCollaborators, !canEdit)}
                </div>
                <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">仅接收进展通知，不计入工时</div>
              </div>
              <div class="form-group">
                <label class="form-label">辅助性协办人</label>
                <div data-collab-ms-host="assist">
                  ${renderCollaboratorMultiSelect(COLLAB_TYPE_ASSIST, selectedAssistCollaborators, assigneeName, selectedInformCollaborators, !canEdit)}
                </div>
                <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">须填协助时段并审批后计入工时</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">计划开始日期</label>
                <input class="input" type="date" style="width:100%;" value="${task.planStartDate || ''}" onchange="state.form.planStartDate=this.value;updateEndDate()">
              </div>
              <div class="form-group">
                <label class="form-label">预计工时（小时）</label>
                <input class="input" type="number" min="0" step="1" style="width:100%;" value="${task.estimatedHours || ''}" onchange="state.form.estimatedHours=parseFloat(this.value)||0;updateEndDate();refreshChildHoursBudgetHint();refreshParentHoursBudgetHint();">
                ${task.parentId ? `<div id="childHoursBudgetHint">${renderChildHoursBudgetHint(task.parentId, task.id || null, state.form.estimatedHours ?? task.estimatedHours)}</div>` : ''}
                ${isEdit && !task.parentId && task.id ? renderParentHoursBudgetHint(task.id, state.form.estimatedHours ?? task.estimatedHours) : ''}
                ${task.parentId ? (() => {
                  const internalAllocated = getChildrenInternalHours(task.parentId);
                  const externalAllocated = getChildrenExternalHours(task.parentId);
                  return `
                    <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">
                      <span style="color:#2563EB;">内部工时：${internalAllocated}h</span> | <span style="color:#D97706;">外部工时：${externalAllocated}h</span>
                    </div>
                  `;
                })() : ''}
              </div>
              <div class="form-group">
                <label class="form-label">每日投入工时（选填）</label>
                <input class="input" type="number" min="0" step="0.5" style="width:100%;" value="${task.dailyHours || ''}" placeholder="留空=标准满日" onchange="state.form.dailyHours=this.value?parseFloat(this.value):null;updateEndDate()">
                <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">留空按标准 ${getWorkDayBounds().hoursPerDay} 小时/天推算截止日</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">计划截止日期（自动计算）</label>
                <input class="input" type="text" style="width:100%;background:var(--bg-muted);" id="autoEndDate" value="${task.planStartDate && task.estimatedHours ? (resolveTaskDueDate(task) || calcEndDate(task.planStartDate, task.estimatedHours, task.dailyHours)) : ''}" readonly>
              </div>
              <div class="form-group">
                <label class="form-label">实际工时（按工作日历自动计算）</label>
                <input class="input" type="text" style="width:100%;background:var(--bg-muted);" value="${task.actualHours || 0} 小时" readonly>
              </div>
            </div>
            ${isEdit ? renderTaskDependencyPanel(tasks.find(t => t.id === state.form.id) || task) : `
            <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;margin-bottom:12px;font-size:12px;color:#2563EB;">
              <i class="fas fa-link" style="margin-right:4px;"></i>保存后可在任务详情「更多信息」中配置跨项目前置依赖。
            </div>`}
          </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="cancelAndGoBack()">取消</button>
          <button class="btn btn-primary" onclick="saveTask()"><i class="fas fa-save"></i>保存</button>
        </div>
      </div>
    </div>
  `;
}

function renderProjectDetailModal() { return renderTaskDetailModal(); }

function renderProjectEditModal() {
  const project = projects.find(p => p.id === state.form.projectId) || state.form;
  const pst = projectStatusMap[project.status] || projectStatusMap.planning;

  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:560px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-edit" style="color:#D97706;margin-right:8px;"></i>编辑项目</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-section">
            <div class="form-section-title"><i class="fas fa-folder-open"></i>基本信息</div>
            <div class="form-group">
              <label class="form-label">项目名称 <span style="color:#DC2626;">*</span></label>
              <input class="input" style="width:100%;" value="${project.name || ''}" onchange="state.form.name=this.value" placeholder="输入项目名称">
            </div>
            <div class="form-group">
              <label class="form-label">项目描述</label>
              <textarea class="textarea" style="width:100%;height:80px;" onchange="state.form.desc=this.value" placeholder="补充说明（可选）">${project.desc || ''}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">项目目标</label>
              <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.objective=this.value" placeholder="本项目要达成什么？">${escapeHtml(project.objective || '')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">项目价值</label>
              <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.value=this.value" placeholder="做成后带来什么价值？">${escapeHtml(project.value || '')}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">范围（做什么）</label>
                <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.scope=this.value" placeholder="本期范围">${escapeHtml(project.scope || '')}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">不做范围</label>
                <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.outOfScope=this.value" placeholder="明确本期不做">${escapeHtml(project.outOfScope || '')}</textarea>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">当前阶段</label>
              <input class="input" id="projectEditCurrentPhase" style="width:100%;" value="${escapeHtml(project.currentPhase || '')}" oninput="state.form.currentPhase=this.value" placeholder="项目当前处于哪个阶段？">
            </div>
            <div class="form-group">
              <label class="form-label">下一步计划</label>
              <input class="input" id="projectEditNextPlan" style="width:100%;" value="${escapeHtml(project.nextPlan || '')}" oninput="state.form.nextPlan=this.value" placeholder="下一步要做什么？">
            </div>
            <div class="form-group">
              <label class="form-label">当前卡点</label>
              <input class="input" id="projectEditBlocker" style="width:100%;" value="${escapeHtml(project.blocker || '')}" oninput="state.form.blocker=this.value" placeholder="卡在哪儿？没有可留空">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">所属部门</label>
                <select class="select" style="width:100%;" onchange="state.form.dept=this.value">
                  ${departments.map(d => `<option value="${d}" ${project.dept === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">项目负责人</label>
                ${renderPersonSingleSelect({
                  key: 'projectEditManager',
                  formField: 'manager',
                  value: state.form.manager || project.manager || '',
                  getCandidates: getProjectManagerCandidates,
                  placeholder: '从人员档案选择',
                  afterKey: 'projectManager',
                })}
                <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">从人员档案搜索选择</div>
              </div>
            </div>
          </div>
          <div class="form-section">
            <div class="form-section-title"><i class="fas fa-calendar-alt"></i>周期与团队</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group">
                <label class="form-label">开始日期</label>
                <input class="input" type="date" style="width:100%;" value="${project.startDate || ''}" onchange="state.form.startDate=this.value">
              </div>
              <div class="form-group">
                <label class="form-label">结束日期</label>
                <input class="input" type="date" style="width:100%;" value="${project.endDate || ''}" onchange="state.form.endDate=this.value">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">项目团队成员</label>
              <div data-project-team-ms-host>
                ${renderProjectTeamMultiSelect(project.teamMembers || [], project.manager || currentUser.name, false)}
              </div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">可多选，不含项目负责人</div>
            </div>
            <div class="form-group">
              <label class="form-label">项目状态</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${Object.entries(projectStatusMap).map(([key, val]) => `
                  <button onclick="state.form.status='${key}';render()" style="padding:8px 16px;border-radius:8px;border:1px solid ${project.status === key ? val.color : '#E5E7EB'};background:${project.status === key ? val.bg : '#fff'};color:${project.status === key ? val.color : '#6B7280'};cursor:pointer;display:flex;align-items:center;gap:6px;font-size:12px;">
                    <i class="fas ${val.icon}"></i>${val.label}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="saveProjectEdit()"><i class="fas fa-save"></i>保存</button>
        </div>
      </div>
    </div>
  `;
}

function editProject(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  if (!canManageProject(project)) {
    alert('仅项目负责人或创建人可编辑');
    return;
  }
  state.form = {
    projectId: project.id,
    manager: project.manager || '',
    teamMembers: [...(project.teamMembers || [])],
  };
  state.page = 'projectDetail';
  state.projectDetailTab = 'overview';
  state.editingProjectPlan = true;
  state.taskEditInline = false;
  state.showModal = null;
  render();
}

function saveProjectEdit() {
  if (!state.form.name) { alert('请输入项目名称'); return; }

  const idx = projects.findIndex(p => p.id === state.form.id);
  if (idx < 0) return;
  const existing = projects[idx];
  if (!canManageProject(existing)) {
    alert('仅项目负责人或创建人可编辑');
    return;
  }

  const oldStatus = existing.status;
  const newStatus = state.form.status || existing.status;
  if (newStatus === 'paused' && oldStatus !== 'paused') {
    if (!confirm('暂停项目将同时暂停其下未完成任务，且不计入待办与工时。确定暂停？')) return;
  }

  const oldManager = existing.manager;
  applyProjectFocusFields(state.form, readProjectFocusFromDom('Edit'));
  projects[idx] = {
    ...projects[idx],
    ...state.form,
    teamMembers: sanitizeProjectTeamMembers(
      state.form.manager || existing.manager,
      state.form.teamMembers
    ),
  };
  normalizeProjectRecord(projects[idx]);
  syncProjectFocusToForm(projects[idx].id);
  syncProjectPauseCascade(projects[idx], oldStatus);
  if (state.form.manager && state.form.manager !== oldManager) {
    notifyProjectManagerAssigned(projects[idx]);
  }
  save({ immediateSync: true });
  closeModal();
}

// 项目状态流转
function updateProjectStatus(projectId, newStatus) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  if (!canManageProject(project)) {
    alert('仅项目负责人或创建人可变更状态');
    return;
  }

  const oldStatus = project.status;
  if (newStatus === oldStatus) return;
  if (newStatus === 'paused' && oldStatus !== 'paused') {
    if (!confirm('暂停项目将同时暂停其下未完成任务，且不计入待办与工时。确定暂停？')) return;
  }

  project.status = newStatus;
  syncProjectPauseCascade(project, oldStatus);

  // 记录日志
  appendChangeLogEntry({
    taskId: 'PROJECT-' + projectId,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: projectStatusMap[oldStatus]?.label || oldStatus,
    after: projectStatusMap[newStatus]?.label || newStatus,
    reason: newStatus === 'paused' || oldStatus === 'paused'
      ? (newStatus === 'paused' ? '项目暂停（下属任务同步暂停）' : '项目恢复（自动暂停的任务已恢复）')
      : '项目状态变更',
    project: project.name,
  });

  save();
  render();
}

// 项目归档
function archiveProject(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  if (!canManageProject(project) && !isFullAccess(currentUser.role)) {
    alert('仅项目负责人或创建人可归档项目');
    return;
  }

  if (!confirm('确定归档该项目？归档后项目将移至归档列表。')) return;

  const oldStatus = project.status;
  project.status = 'archived';
  project.archived = true;
  normalizeProjectRecord(project);

  // 记录日志
  appendChangeLogEntry({
    taskId: 'PROJECT-' + projectId,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: projectStatusMap[oldStatus]?.label || oldStatus,
    after: '已归档',
    reason: '项目归档',
    project: project.name,
  });

  save();
  goTo('archive');
}

// 项目删除（仅总经理/管理员）
async function deleteProject(projectId, evt) {
  if (evt) evt.stopPropagation();
  if (!canDeleteProject()) {
    alert('仅总经理/管理员可删除项目');
    return;
  }
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const projectTasks = tasks.filter(t => t.projectId === projectId);
  const taskCount = projectTasks.length;
  const docCount = (project.documents || []).length;
  const attachCount = projectTasks.reduce((n, t) => n + (t.attachments || []).length, 0);
  const msg = [
    `确定永久删除项目「${project.name}」？`,
    '',
    `· 关联任务：${taskCount} 个`,
    `· 项目文档：${docCount} 个`,
    `· 任务附件：${attachCount} 个`,
    '',
    '此操作不可恢复。',
  ].join('\n');
  if (!confirm(msg)) return;

  const taskIds = new Set(projectTasks.map(t => t.id));
  const fileIds = new Set();
  (project.documents || []).forEach(d => {
    const key = d.fileId || d.id;
    if (key) fileIds.add(key);
  });
  projectTasks.forEach(t => {
    (t.attachments || []).forEach(a => {
      const key = a.fileId || a.id;
      if (key) fileIds.add(key);
    });
    (t.comments || []).forEach(c => {
      (c.attachments || []).forEach(a => { if (a.fileId) fileIds.add(a.fileId); });
    });
  });

  appendChangeLogEntry({
    taskId: 'PROJECT-' + projectId,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: project.name,
    after: '已删除',
    reason: '管理员删除项目',
    project: project.name,
  });

  const removedTaskIdList = [...taskIds];
  projects = projects.filter(p => p.id !== projectId);
  tasks = tasks.filter(t => t.projectId !== projectId);
  taskIds.forEach(id => removeDependenciesForTask(id));
  transferLogs = transferLogs.filter(l => !taskIds.has(l.taskId));

  persistLocalCache();
  DataService.cancelScheduledSave();

  if (ApiConfig.enabled && authSession.token) {
    const synced = await DataService.syncToServer({
      skipUsers: !isFullAccess(currentUser.role),
      removedProjectIds: [projectId],
      removedTaskIds: removedTaskIdList,
      forceEmpty: projects.length === 0 && tasks.length === 0,
    });
    if (!synced) {
      alert('删除已在本地生效，但同步服务端失败，请检查网络后重试或刷新页面');
    } else {
      await DataService.loadFromServer();
    }
    if (fileIds.size) {
      const headers = AuthService.getAuthHeaders();
      fileIds.forEach(fileId => {
        fetch(ApiConfig.baseUrl + '/files/' + encodeURIComponent(fileId), {
          method: 'DELETE',
          headers,
        }).catch(() => {});
      });
    }
  }

  const nextPage = state.page === 'archive' ? 'archive' : 'projects';
  await goTo(nextPage, { skipReload: true });
}
function renderProjectCreateModal() {
  const project = state.form;
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-folder-plus" style="color:#D97706;margin-right:8px;"></i>新建项目</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">模板</label>
            <select class="select" style="width:100%;" onchange="state.form.stageTemplateId=this.value">
              ${(() => {
                const opts = (projectTemplates.length ? projectTemplates : getBuiltinProjectTemplatesFallback())
                  .map(t => ({ id: t.id, name: t.name, stageCount: t.stageCount != null ? t.stageCount : (t.stages || []).length }));
                opts.push({ id: 'none', name: '不套用模板', stageCount: 0 });
                const cur = project.stageTemplateId || 'TPL-WMS';
                return opts.map(t => {
                  const tip = t.id === 'none' ? '' : `（${t.stageCount} 个里程碑）`;
                  return `<option value="${escapeHtml(t.id)}" ${cur === t.id ? 'selected' : ''}>${escapeHtml(t.name || t.id)}${tip}</option>`;
                }).join('');
              })()}
            </select>
            <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">默认「WMS 实施模板」；可改为标准过程组或不生成</div>
          </div>
          <div class="form-group">
            <label class="form-label">项目名称 <span style="color:#DC2626;">*</span></label>
            <input class="input" style="width:100%;" value="${project.name || ''}" onchange="state.form.name=this.value" placeholder="输入项目名称">
          </div>
          <div class="form-group">
            <label class="form-label">项目描述</label>
            <textarea class="textarea" style="width:100%;height:80px;" onchange="state.form.desc=this.value" placeholder="补充说明（可选）">${project.desc || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">项目目标</label>
            <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.objective=this.value" placeholder="本项目要达成什么？">${escapeHtml(project.objective || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">项目价值</label>
            <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.value=this.value" placeholder="做成后带来什么价值？">${escapeHtml(project.value || '')}</textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">范围（做什么）</label>
              <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.scope=this.value" placeholder="本期范围">${escapeHtml(project.scope || '')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">不做范围</label>
              <textarea class="textarea" style="width:100%;height:60px;" onchange="state.form.outOfScope=this.value" placeholder="明确本期不做">${escapeHtml(project.outOfScope || '')}</textarea>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">当前阶段</label>
            <input class="input" style="width:100%;" value="${escapeHtml(project.currentPhase || '')}" onchange="state.form.currentPhase=this.value" placeholder="项目当前处于哪个阶段？">
          </div>
          <div class="form-group">
            <label class="form-label">下一步计划</label>
            <input class="input" style="width:100%;" value="${escapeHtml(project.nextPlan || '')}" onchange="state.form.nextPlan=this.value" placeholder="下一步要做什么？">
          </div>
          <div class="form-group">
            <label class="form-label">当前卡点</label>
            <input class="input" style="width:100%;" value="${escapeHtml(project.blocker || '')}" onchange="state.form.blocker=this.value" placeholder="卡在哪儿？没有可留空">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">所属部门</label>
              <select class="select" style="width:100%;" onchange="state.form.dept=this.value">
                ${departments.map(d => `<option value="${d}" ${project.dept === d ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">项目负责人</label>
              ${renderPersonSingleSelect({
                key: 'projectCreateManager',
                formField: 'manager',
                value: state.form.manager || project.manager || '',
                getCandidates: getProjectManagerCandidates,
                placeholder: '从人员档案选择',
                afterKey: 'projectManager',
              })}
              <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">从人员档案搜索选择</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">开始日期</label>
              <input class="input" type="date" style="width:100%;" value="${project.startDate || ''}" onchange="state.form.startDate=this.value">
            </div>
            <div class="form-group">
              <label class="form-label">结束日期</label>
              <input class="input" type="date" style="width:100%;" value="${project.endDate || ''}" onchange="state.form.endDate=this.value">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">项目团队成员</label>
            <div data-project-team-ms-host>
              ${renderProjectTeamMultiSelect(project.teamMembers || [], project.manager || currentUser.name, false)}
            </div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">可多选，不含项目负责人</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="saveProject()"><i class="fas fa-save"></i>创建项目</button>
        </div>
      </div>
    </div>
  `;
}
function renderStaffEditModal() {
  const user = users.find(u => u.id === state.form.userId) || state.form;
  const isEdit = !!state.form.userId;

  // 可编辑的字段权限判断
  const canEditRole = isFullAccess(currentUser.role);
  const canEditDept = isFullAccess(currentUser.role);
  const canEditName = isFullAccess(currentUser.role);
  const deptOptions = [...new Set([...getStaffDeptNames(), user.dept].filter(Boolean))];
  const sectionTitle = (t) => `<div style="font-size:12px;font-weight:600;color:#6B7280;margin:4px 0 12px;padding-bottom:6px;border-bottom:1px solid #F3F4F6;">${t}</div>`;

  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">${isEdit ? '编辑人员' : '新建人员'}</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          ${sectionTitle('基本信息')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">姓名 <span style="color:#DC2626;">*</span></label>
              <input class="input" style="width:100%;" value="${escapeHtml(user.name || '')}" onchange="state.form.name=this.value" placeholder="输入姓名" ${!canEditName ? 'readonly' : ''}>
              ${!canEditName ? '<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">部门经理不可修改姓名</div>' : ''}
            </div>
            <div class="form-group">
              <label class="form-label">职位</label>
              <input class="input" style="width:100%;" value="${escapeHtml(user.position || '')}" onchange="state.form.position=this.value" placeholder="输入职位">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">所属部门</label>
              <select class="select" style="width:100%;" ${!canEditDept ? 'disabled' : ''} onchange="onStaffDeptChange(this.value)">
                ${deptOptions.map(d => `<option value="${escapeHtml(d)}" ${(state.form.dept || user.dept) === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
              </select>
              ${!canEditDept ? '<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">仅总经理/管理员可修改</div>' : ''}
            </div>
            <div class="form-group">
              <label class="form-label">角色权限</label>
              <select class="select" style="width:100%;" ${!canEditRole ? 'disabled' : ''} onchange="state.form.role=this.value;render()">
                <option value="staff" ${(state.form.role || user.role) === 'staff' ? 'selected' : ''}>执行人员</option>
                <option value="manager" ${(state.form.role || user.role) === 'manager' ? 'selected' : ''}>部门经理</option>
                <option value="admin" ${(state.form.role || user.role) === 'admin' ? 'selected' : ''}>管理员</option>
                <option value="gm" ${(state.form.role || user.role) === 'gm' ? 'selected' : ''}>总经理</option>
              </select>
              ${!canEditRole ? '<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">仅总经理/管理员可修改</div>' : ''}
              ${canEditRole && (state.form.role || user.role) === 'manager' ? '<div style="font-size:11px;color:#2563EB;margin-top:4px;"><i class="fas fa-info-circle"></i> 保存后将自动把本部门执行人员的上级设为此人；单经理部门原经理将降为执行人员。</div>' : ''}
            </div>
          </div>

          ${sectionTitle('汇报关系')}
          <div class="form-group">
            <label class="form-label">上级领导</label>
            ${renderPersonSingleSelect({
              key: 'staffLeader',
              formField: 'leaderId',
              value: state.form.leaderId || user.leaderId || '',
              valueMode: 'id',
              getCandidates: () => getLeaderCandidatesForStaff({ ...user, id: user.id || state.form.userId }),
              allowEmpty: true,
              emptyLabel: '无（部门负责人）',
              placeholder: '从人员档案选择上级',
            })}
          </div>
          ${isEdit && isFullAccess(currentUser.role) ? `
          <div class="form-group">
            <label class="form-label">账号状态</label>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-muted);">
              <div style="font-size:13px;color:var(--text);">
                ${isStaffActive(state.form) ? '<span style="color:#059669;font-weight:600;">在职</span>（可登录、可分配任务）' : '<span style="color:#DC2626;font-weight:600;">已停用</span>（不可登录）'}
                ${state.form.userId === currentUser.id ? '<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">不能停用当前登录账号</div>' : ''}
              </div>
              ${canToggleStaffActive({ id: state.form.userId, ...state.form }) ? `
              <button type="button" class="btn btn-ghost btn-sm" style="color:${isStaffActive(state.form) ? '#DC2626' : '#059669'};" onclick="closeModal();toggleStaffActive('${state.form.userId}')">
                <i class="fas ${isStaffActive(state.form) ? 'fa-user-slash' : 'fa-user-check'}"></i>${isStaffActive(state.form) ? '停用' : '恢复'}
              </button>` : ''}
            </div>
          </div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="saveStaff()"><i class="fas fa-save"></i>保存</button>
        </div>
      </div>
    </div>
  `;
}

function onStaffDeptChange(dept) {
  state.form.dept = dept;
  state.form.profileKind = 'member';
  render();
}

function onStaffProfileKindChange(kind) {
  state.form.profileKind = 'member';
  render();
}

async function setCatalogDeptKind(deptName, kind) {
  if (!isFullAccess(currentUser.role)) return;
  const next = getStaffDeptCatalog().map(d =>
    d.name === deptName ? { ...d, kind: 'member' } : { ...d, kind: 'member' }
  );
  if (!next.some(d => d.name === deptName)) {
    next.push({
      name: deptName,
      kind: 'member',
      parentName: deptName === INFO_CENTER_DEPT_NAME ? '' : INFO_CENTER_DEPT_NAME,
    });
  }
  applyStaffDeptCatalog(next);
  syncDepartmentsAlias();
  if (ApiConfig.enabled && authSession.token) {
    try {
      const res = await DingTalkConfig.saveDeptCatalog(getStaffDeptCatalog());
      if (res && res.success && Array.isArray(res.staffDeptCatalog)) {
        applyStaffDeptCatalog(res.staffDeptCatalog);
        syncDepartmentsAlias();
      }
    } catch (e) {
      console.warn('[dept-catalog]', e);
    }
  }
  save();
  render();
}

async function issueScopedApiKey(userId) {
  showScopedKeyIssueModal(userId, 'issue');
}

async function sendScopedApiKeyPackage(userId) {
  showScopedKeyIssueModal(userId, 'send');
}

function showScopedKeyIssueModal(userId, mode) {
  if (!isFullAccess(currentUser.role)) {
    alert(mode === 'send' ? '仅总经理/管理员可发送接入包' : '仅总经理/管理员可签发作用域 Key');
    return;
  }
  const user = users.find(u => u.id === userId);
  if (!user) return;
  if (mode === 'send' && !user.dingTalkUserId) {
    alert('该人员未绑定钉钉 userid，请先同步钉钉后再发送');
    return;
  }
  const st = getScopedKeyStatus(userId);
  const activeProjects = projects.filter(p => p && p.status !== 'archived' && p.status !== 'abolished');
  state.form = {
    scopedKeyUserId: userId,
    scopedKeyUserName: user.name,
    scopedKeyMode: mode === 'send' ? 'send' : 'issue',
    scopedKeyCapability: (st && st.capability === 'read') ? 'read' : 'read_write',
    scopedKeyUseWhitelist: !!(st && ((st.projectIdsRead || []).length || (st.projectIdsWrite || []).length)),
    scopedKeyProjectIds: [...new Set([
      ...((st && st.projectIdsRead) || []),
      ...((st && st.projectIdsWrite) || []),
    ])],
    scopedKeyProjectOptions: activeProjects.map(p => ({ id: p.id, name: p.name })),
  };
  state.showModal = 'scopedKeyIssue';
  render();
}

function toggleScopedKeyProject(projectId, checked) {
  if (!state.form) return;
  if (!Array.isArray(state.form.scopedKeyProjectIds)) state.form.scopedKeyProjectIds = [];
  const id = String(projectId);
  const set = new Set(state.form.scopedKeyProjectIds.map(String));
  if (checked) set.add(id);
  else set.delete(id);
  state.form.scopedKeyProjectIds = [...set];
}

function renderScopedKeyIssueModal() {
  const form = state.form || {};
  const isSend = form.scopedKeyMode === 'send';
  const options = form.scopedKeyProjectOptions || [];
  const selected = new Set((form.scopedKeyProjectIds || []).map(String));
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:560px;max-height:90vh;overflow:auto;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-key" style="color:var(--brand);margin-right:8px;"></i>${isSend ? '发送接入包' : '签发作用域 Key'}</h3>
          <button type="button" class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="display:grid;gap:14px;">
          <p style="font-size:13px;color:#6B7280;margin:0;">绑定人员：<strong>${escapeHtml(form.scopedKeyUserName || '')}</strong>。将吊销该人员已有有效 Key。${isSend ? '将按对方 userid 发送钉钉工作通知（无需选会话）。' : ''}</p>
          <div>
            <label class="form-label">能力</label>
            <div style="display:flex;gap:16px;font-size:13px;">
              <label><input type="radio" name="scopedCap" ${form.scopedKeyCapability !== 'read' ? 'checked' : ''} onchange="state.form.scopedKeyCapability='read_write'"> 读写</label>
              <label><input type="radio" name="scopedCap" ${form.scopedKeyCapability === 'read' ? 'checked' : ''} onchange="state.form.scopedKeyCapability='read'"> 只读</label>
            </div>
          </div>
          <div>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
              <input type="checkbox" ${form.scopedKeyUseWhitelist ? 'checked' : ''} onchange="state.form.scopedKeyUseWhitelist=this.checked;render()">
              <span>限制可访问项目（不勾选则按该人员「相关项目」权限）</span>
            </label>
          </div>
          ${form.scopedKeyUseWhitelist ? `
            <div style="border:1px solid var(--border);border-radius:8px;max-height:240px;overflow:auto;padding:8px 10px;background:var(--bg-muted);">
              ${options.length ? options.map(p => `
                <label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" ${selected.has(String(p.id)) ? 'checked' : ''} onchange="toggleScopedKeyProject('${escapeHtml(p.id)}', this.checked)">
                  <span>${escapeHtml(p.name || p.id)}</span>
                  <span style="color:#9CA3AF;font-size:11px;">${escapeHtml(p.id)}</span>
                </label>
              `).join('') : '<div style="font-size:12px;color:#9CA3AF;padding:8px;">暂无可用项目</div>'}
            </div>
            <p style="font-size:12px;color:#6B7280;margin:0;">已选 ${(form.scopedKeyProjectIds || []).length} 个项目；读写能力相同时，读/写白名单使用同一列表。</p>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button type="button" class="btn btn-primary" onclick="confirmScopedKeyIssue()"><i class="fas ${isSend ? 'fa-paper-plane' : 'fa-key'}"></i> ${isSend ? '签发并发送' : '生成 Key'}</button>
        </div>
      </div>
    </div>
  `;
}

async function confirmScopedKeyIssue() {
  const form = state.form || {};
  const userId = form.scopedKeyUserId;
  if (!userId) return;
  const capability = form.scopedKeyCapability === 'read' ? 'read' : 'read_write';
  const useWhitelist = !!form.scopedKeyUseWhitelist;
  const ids = useWhitelist ? (form.scopedKeyProjectIds || []).map(String).filter(Boolean) : [];
  if (useWhitelist && !ids.length) {
    alert('已开启项目限制，请至少勾选一个项目');
    return;
  }
  const body = {
    capability,
    projectIdsRead: useWhitelist ? ids : [],
    projectIdsWrite: useWhitelist && capability === 'read_write' ? ids : [],
  };
  const isSend = form.scopedKeyMode === 'send';
  try {
    const res = await fetch(
      ApiConfig.baseUrl + '/scoped-keys/users/' + encodeURIComponent(userId) + (isSend ? '/send' : '/issue'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      }
    );
    const raw = await parseApiJsonResponse(res, isSend ? '发送失败' : '签发失败');
    if (!res.ok || (raw.code && raw.code !== 200)) throw new Error(raw.message || (isSend ? '发送失败' : '签发失败'));
    const payload = raw.data || raw;
    state.form = {
      scopedKeySecret: payload.secret || '',
      scopedKeyRecord: payload.record || null,
      scopedKeyGuide: payload.guide || {},
      scopedKeyUserName: form.scopedKeyUserName,
      scopedKeyUserId: userId,
      scopedKeySent: isSend && payload.sent !== false,
      scopedKeySendWarning: payload.sendWarning || '',
    };
    state.showModal = 'scopedKeyResult';
    state.scopedKeyStatusLoaded = false;
    await loadScopedKeyStatus(true);
    render();
    if (isSend && payload.sendWarning) {
      alert(`Key 已生成，但工作通知未发出：\n${payload.sendWarning}\n\n请复制明文后手动发给对方。`);
    }
  } catch (e) {
    alert(e.message || (isSend ? '发送失败' : '签发失败'));
  }
}

function copyScopedKeySecret() {
  const secret = state.form?.scopedKeySecret || '';
  if (!secret) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(secret).then(() => alert('已复制作用域 Key')).catch(() => {
      prompt('请手动复制：', secret);
    });
  } else {
    prompt('请手动复制：', secret);
  }
}

function renderDateBaselineConfirmModal() {
  const info = state._pendingDateBaseline || {};
  const reason = (state.form && (state.form.changeReason || state.form.reason)) || '';
  return `
    <div class="modal-overlay" onclick="if(event.target===this){state.showModal='taskEdit';render();}">
      <div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-calendar-alt" style="color:#D97706;margin-right:8px;"></i>确认日期变更</h3>
          <button type="button" class="modal-close" onclick="state.showModal='taskEdit';render()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="display:grid;gap:12px;">
          <p style="font-size:13px;color:#6B7280;margin:0;">将保留「原定」日期，当前日期更新为新值（符合对齐会「原定 vs 调研后确认」要求）。</p>
          <div style="background:var(--bg-muted);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;line-height:1.7;">
            <div><strong>原定开始</strong>：${escapeHtml(info.keepOriginalStart || '—')} → <strong>当前</strong>：${escapeHtml(info.newPlanStart || '—')}</div>
            <div><strong>原定截止</strong>：${escapeHtml(info.keepOriginalDue || '—')} → <strong>当前</strong>：${escapeHtml(info.newDue || '—')}</div>
          </div>
          <div>
            <label class="form-label">变更原因 <span class="form-required">*</span></label>
            <textarea class="textarea" style="width:100%;height:72px;" oninput="state.form.changeReason=this.value;state.form.reason=this.value" placeholder="如：调研后确认 / 资源调整">${escapeHtml(reason)}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="state.showModal='taskEdit';render()">返回修改</button>
          <button type="button" class="btn btn-primary" onclick="confirmDateBaselineAndSave()"><i class="fas fa-check"></i> 确认并保存</button>
        </div>
      </div>
    </div>
  `;
}

function confirmDateBaselineAndSave() {
  if (!state.form) return;
  const reason = String(state.form.changeReason || state.form.reason || '').trim();
  if (!reason) {
    alert('请填写变更原因');
    return;
  }
  state.form.reason = reason;
  state.form.changeReason = reason;
  state.form._dateBaselineConfirmed = true;
  state._pendingDateBaseline = null;
  state.showModal = 'taskEdit';
  saveTask();
}

function renderScopedKeyResultModal() {
  const secret = state.form?.scopedKeySecret || '';
  const guide = state.form?.scopedKeyGuide || {};
  const name = state.form?.scopedKeyUserName || '';
  const sent = !!state.form?.scopedKeySent;
  const userId = state.form?.scopedKeyUserId || '';
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:520px;">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-key" style="color:var(--brand);margin-right:8px;"></i>${sent ? '已发送接入包' : '作用域 Key 已生成'}</h3>
          <button type="button" class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:#6B7280;margin-bottom:12px;">绑定人员：<strong>${escapeHtml(name)}</strong>。明文仅此一次，请复制或确认对方已收到。</p>
          ${sent ? '<p style="font-size:12px;color:#047857;margin-bottom:12px;"><i class="fas fa-check-circle"></i> 已通过钉钉工作通知发送说明文档、Key 与接口地址。</p>' : ''}
          ${state.form?.scopedKeySendWarning ? `<p style="font-size:12px;color:#B45309;margin-bottom:12px;"><i class="fas fa-exclamation-triangle"></i> 工作通知未发出：${escapeHtml(state.form.scopedKeySendWarning)}</p>` : ''}
          <div style="background:var(--bg-muted);border:1px solid var(--border);border-radius:8px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;">${escapeHtml(secret)}</div>
          <div style="margin-top:12px;font-size:12px;color:#6B7280;line-height:1.6;">
            <div>服务地址：${escapeHtml(guide.baseUrl || '-')}</div>
            <div>说明文档：${escapeHtml(guide.guideUrl || '-')}</div>
            <div>查询示例：${escapeHtml(guide.workbuddyQuery || '-')}</div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost" onclick="copyScopedKeySecret()"><i class="fas fa-copy"></i>复制 Key</button>
          ${!sent && userId ? `<button type="button" class="btn btn-primary" onclick="sendScopedApiKeyPackage('${userId}')"><i class="fas fa-paper-plane"></i>发送给本人</button>` : ''}
          <button type="button" class="btn btn-ghost" onclick="closeModal()">关闭</button>
        </div>
      </div>
    </div>
  `;
}

function editStaff(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  if (!canEditStaff(user)) {
    alert('您没有权限编辑该人员');
    return;
  }

  state.form = { userId: user.id, ...user };
  state.showModal = 'staffEdit';
  render();
}

function saveStaff() {
  if (!state.form.userId && !isFullAccess(currentUser.role)) {
    alert('仅总经理/管理员可添加人员');
    return;
  }
  if (!state.form.name && isFullAccess(currentUser.role)) { alert('请输入姓名'); return; }

  let savedUser = null;
  const idx = users.findIndex(u => u.id === state.form.userId);
  if (idx >= 0) {
    const existing = users[idx];
    if (!canEditStaff(existing)) {
      alert('您没有权限编辑该人员');
      return;
    }
    if (currentUser.role === 'manager') {
      users[idx] = {
        ...existing,
        position: state.form.position ?? existing.position,
        leaderId: state.form.leaderId ?? existing.leaderId,
      };
    } else {
      const { userId, profileKindLocked, ...rest } = state.form;
      users[idx] = {
        ...users[idx],
        ...rest,
        role: state.form.role || existing.role || 'staff',
        profileKind: 'member',
      };
    }
    savedUser = users[idx];
  } else if (isFullAccess(currentUser.role)) {
    if (!state.form.name) { alert('请输入姓名'); return; }
    savedUser = {
      id: genId('U'),
      name: state.form.name,
      dept: state.form.dept || currentUser.dept,
      role: state.form.role || 'staff',
      profileKind: 'member',
      position: state.form.position || '',
      leaderId: state.form.leaderId || '',
      standardWeekHours: state.form.standardWeekHours || 60,
      dingTalkUserId: '',
      active: true,
    };
    users.push(savedUser);
  }

  if (savedUser) {
    const allIdx = allStaffUsers.findIndex(u => u.id === savedUser.id);
    if (allIdx >= 0) allStaffUsers[allIdx] = { ...allStaffUsers[allIdx], ...savedUser };
    else allStaffUsers.push(savedUser);
  }

  let batchLeaderSyncCount = 0;
  if (savedUser?.role === 'manager' && savedUser.dept && isFullAccess(currentUser.role)) {
    batchLeaderSyncCount = syncDeptStaffLeadersToManager(savedUser.dept, savedUser.id);
  }

  save();
  closeModal();
  if (batchLeaderSyncCount > 0) {
    alert(`已同步更新本部门 ${batchLeaderSyncCount} 名人员的上级为「${savedUser.name}」`);
  }
}

function renderRejectModal() {
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:450px;" onclick="event.stopPropagation()">
        <div class="modal-header" style="background:#FEF3C7;">
          <h3 class="modal-title" style="color:#92400E;"><i class="fas fa-undo" style="margin-right:8px;"></i>驳回任务</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#92400E;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">驳回原因 <span class="form-required">*</span></label>
            <textarea class="textarea" style="width:100%;height:80px;" onchange="state.form.rejectReason=this.value" placeholder="请填写驳回原因和整改要求"></textarea>
          </div>
        </div>
        <div class="modal-footer" style="background:#FEF3C7;">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-warning" onclick="rejectTask()"><i class="fas fa-undo"></i>确认驳回</button>
        </div>
      </div>
    </div>
  `;
}

function renderTransferModal() {
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:450px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-exchange-alt" style="margin-right:8px;color:#2563EB;"></i>转办任务</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">转办给 <span class="form-required">*</span></label>
            ${renderPersonSingleSelect({
              key: 'transferTo',
              formField: 'transferTo',
              value: state.form.transferTo || '',
              getCandidates: () => {
                const assignee = tasks.find(t => t.id === state.form.taskId)?.assignee;
                return getTaskAssigneeCandidates().filter(u => u.name !== assignee);
              },
              allowEmpty: true,
              emptyLabel: '请选择人员',
              placeholder: '从人员档案选择',
            })}
          </div>
          <div class="form-group">
            <label class="form-label">转办原因 <span class="form-required">*</span></label>
            <textarea class="textarea" style="width:100%;height:80px;" onchange="state.form.transferReason=this.value" placeholder="请填写转办原因"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="transferTask()"><i class="fas fa-exchange-alt"></i>确认转办</button>
        </div>
      </div>
    </div>
  `;
}

function renderArchiveModal() {
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:450px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-archive" style="margin-right:8px;color:#9CA3AF;"></i>归档任务</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">归档原因 <span class="form-required">*</span></label>
            <textarea class="textarea" style="width:100%;height:80px;" onchange="state.form.archiveReason=this.value" placeholder="请填写归档原因"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-ghost" onclick="archiveTask()"><i class="fas fa-archive"></i>确认归档</button>
        </div>
      </div>
    </div>
  `;
}
