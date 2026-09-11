// ========== 任务详情弹窗 ==========
function setTaskDetailTab(tab) {
  state.taskDetailTab = tab || 'info';
  render();
}

function getTaskDetailActivityLogs(taskId) {
  const rows = [];
  (changeLogs || []).forEach(l => {
    if (l && l.taskId === taskId) {
      rows.push({
        time: l.operateTime || l.createdAt || '',
        operator: l.operator || '-',
        kind: '变更',
        detail: [formatLogCell(l.before), formatLogCell(l.after)].filter(Boolean).join(' → ') || (l.reason || '字段变更'),
        reason: l.reason || '',
      });
    }
  });
  (transferLogs || []).forEach(l => {
    if (l && l.taskId === taskId) {
      rows.push({
        time: l.operateTime || l.createdAt || '',
        operator: l.operator || '-',
        kind: '转办',
        detail: `${l.fromAssignee || '-'} → ${l.toAssignee || '-'}`,
        reason: l.reason || '',
      });
    }
  });
  rows.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  return rows;
}

function renderTaskDetailActivityLogs(task) {
  const logs = getTaskDetailActivityLogs(task.id);
  if (!logs.length) {
    return renderEmptyState({ icon: 'fa-history', title: '暂无操作日志', hint: '状态变更、编辑与转办会出现在此' });
  }
  return `
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${logs.map(l => `
        <div style="padding:12px 14px;background:var(--border-light);border:1px solid var(--border);border-radius:10px;">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="font-size:12px;font-weight:600;color:var(--brand);">${escapeHtml(l.kind)}</span>
            <span style="font-size:11px;color:var(--text-light);">${escapeHtml(l.time || '-')}</span>
          </div>
          <div style="font-size:13px;color:var(--text);">${escapeHtml(l.detail)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">操作人：${escapeHtml(l.operator)}${l.reason ? ' · 原因：' + escapeHtml(l.reason) : ''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTaskDetailModal() {
  const task = tasks.find(t => t.id === state.form.taskId);
  if (!task || !canViewTask(task)) return '';
  const displayStatus = getTaskDisplayStatus(task);
  const st = statusMap[displayStatus] || statusMap[task.status];
  const pr = priorityMap[task.priority];
  const project = projects.find(p => p.id === task.projectId);
  const parent = task.parentId ? tasks.find(t => t.id === task.parentId) : null;
  const children = tasks.filter(t => t.parentId === task.id);
  const progress = getDisplayProgress(task);
  const detailTab = state.taskDetailTab || 'info';
  const commentCount = Array.isArray(task.comments) ? task.comments.length : 0;

  const canEdit = canEditTask(task);
  const canReject = (isFullAccess(currentUser.role) || isTaskProjectManager(task)) && task.status !== 'done' && task.status !== 'archived' && task.status !== 'abolished';
  const canTransfer = isSamePersonName(task.assignee, currentUser.name) || isFullAccess(currentUser.role) || isTaskProjectManager(task);
  const canArchive = (isFullAccess(currentUser.role) || isTaskProjectManager(task)) && task.status === 'done';
  const canAddSubTask = canCreateSubTask(task);
  const submitterName = typeof displayTaskSubmitterName === 'function' ? displayTaskSubmitterName(task) : '';
  const systemName = typeof getIntakeSystemName === 'function' ? getIntakeSystemName(task) : '';
  const detailTitle = isAitableIntakeTask(task) ? getIntakeTaskTitle(task) : String(task.title || '');
  if (!state.uiSections) state.uiSections = {};
  if (hasHardBlock(task) || getTaskPredecessorDeps(task.id).length) {
    state.uiSections.taskDetailAdvanced = true;
  }

  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:650px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              ${state.returnToMemberId ? `<button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#10B981;font-size:13px;display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;transition:all 0.2s;" onmouseover="this.style.background='#ECFDF5'" onmouseout="this.style.background='none'" title="返回成员任务看板"><i class="fas fa-arrow-left"></i>返回看板</button>` : ''}
              <button type="button" onclick="goBackTaskStep()" style="background:none;border:none;cursor:pointer;color:#2563EB;font-size:13px;display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;transition:all 0.2s;" onmouseover="this.style.background='#EFF6FF'" onmouseout="this.style.background='none'" title="返回前一步"><i class="fas fa-arrow-left"></i>返回前一步</button>
              ${isMilestoneTask(task) ? '<span class="tag" style="background:#EFF6FF;color:#2563EB;"><i class="fas fa-flag"></i>里程碑</span>' : (task.type === 'temp' ? '<span class="tag tag-temp"><i class="fas fa-bolt"></i>临时任务</span>' : '<span class="tag tag-normal"><i class="fas fa-folder"></i>常规任务</span>')}
              ${renderIntakeSourceTag(task, false)}
              <span style="font-size:12px;color:#9CA3AF;">${task.id}</span>
            </div>
            ${renderIntakeHoursHint(task, false)}
            <h3 class="modal-title">${escapeHtml(detailTitle)}${isMilestoneTask(task) ? '' : renderDependencyBadges(task, false)}</h3>
          </div>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;" title="关闭"><i class="fas fa-times"></i></button>
        </div>
        <div class="detail-tabs">
          <button type="button" class="detail-tab${detailTab === 'info' ? ' active' : ''}" onclick="setTaskDetailTab('info')">基本信息</button>
          <button type="button" class="detail-tab${detailTab === 'comments' ? ' active' : ''}" onclick="setTaskDetailTab('comments')">留言讨论${commentCount ? ` (${commentCount})` : ''}</button>
          <button type="button" class="detail-tab${detailTab === 'logs' ? ' active' : ''}" onclick="setTaskDetailTab('logs')">操作日志</button>
        </div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto;">
          ${detailTab === 'info' ? `
          ${task.status === 'rejected' ? `
          <div style="padding:12px;background:#FEF3C7;border-radius:8px;margin-bottom:16px;border:1px solid #FDE68A;">
            <div style="font-size:13px;font-weight:600;color:#92400E;margin-bottom:4px;"><i class="fas fa-undo" style="margin-right:4px;"></i>驳回原因</div>
            <div style="font-size:13px;color:#92400E;">${task.rejectReason || '未填写原因'}</div>
          </div>
          ` : ''}
          ${task.status === 'abolished' ? `
          <div style="padding:12px;background:var(--bg-muted);border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">
            <div style="font-size:13px;font-weight:600;color:#6B7280;"><i class="fas fa-ban" style="margin-right:4px;"></i>该任务已作废，不可再编辑或推进</div>
          </div>
          ` : ''}

          <p style="color:#6B7280;margin-bottom:16px;line-height:1.6;">${task.desc || '暂无描述'}</p>

          ${parent ? `
          <div style="padding:10px 12px;background:#F0FDF4;border-radius:8px;margin-bottom:16px;font-size:12px;">
            <span style="color:#9CA3AF;">上级任务：</span>
            <span style="color:#059669;font-weight:500;cursor:pointer;" onclick="viewTask('${parent.id}')">${parent.title}</span>
          </div>
          ` : ''}

          <div class="detail-section">
            <div class="detail-section-title"><i class="fas fa-info-circle"></i>关键信息</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">状态</div>
                <span class="status-tag status-${displayStatus}"><i class="fas ${st.icon}"></i>${st.label}</span>
              </div>
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">优先级</div>
                <span class="priority-dot priority-${task.priority}" style="display:inline-block;margin-right:4px;"></span>
                <span style="font-size:13px;font-weight:500;">${pr.label}</span>
              </div>
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">主负责人</div>
                <span style="font-size:13px;font-weight:500;">${task.assignee}</span>
              </div>
              ${submitterName ? `
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">提单人</div>
                <span style="font-size:13px;font-weight:500;">${escapeHtml(submitterName)}</span>
              </div>
              ` : ''}
              ${systemName ? `
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">系统</div>
                <span style="font-size:13px;font-weight:500;">${escapeHtml(systemName)}</span>
              </div>
              ` : ''}
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">截止日期</div>
                <span style="font-size:13px;font-weight:500;${isOverdue(task) ? 'color:#DC2626;' : isDueSoon(task) ? 'color:#D97706;' : ''}">${normalizeDateStr(resolveTaskDueDate(task)) || task.dueDate || '未设置'}${isOverdue(task) ? ' (延期' + getDaysOverdue(task) + '天)' : isDueSoon(task) ? ' (临期)' : ''}</span>
              </div>
              ${project ? `
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;grid-column:span 2;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">所属项目</div>
                <span style="font-size:13px;font-weight:500;">${project.name}</span>
              </div>
              ` : ''}
            </div>
          </div>

          ${renderCollaboratorReviewBlock(task)}

          ${isMilestoneTask(task) ? `
          <div class="detail-section">
            <div class="detail-section-title"><i class="fas fa-clipboard-list"></i>里程碑计划（A/R/C/V）</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">M序号</div>
                <span style="font-size:13px;font-weight:600;">${escapeHtml(task.milestoneSeq || '-')}</span>
              </div>
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">开始 ~ 完成</div>
                <span style="font-size:13px;font-weight:500;">${escapeHtml((normalizeDateStr(getEffectivePlanStart(task) || task.planStartDate) || '-') + ' ~ ' + (normalizeDateStr(resolveTaskDueDate(task)) || task.dueDate || '-'))}</span>
              </div>
              <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;">
                <div style="font-size:11px;color:#2563EB;margin-bottom:4px;">A 唯一交付人</div>
                <span style="font-size:13px;font-weight:600;">${escapeHtml(task.roleA || '-')}</span>
              </div>
              <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;">
                <div style="font-size:11px;color:#2563EB;margin-bottom:4px;">R 直接执行人</div>
                <span style="font-size:13px;font-weight:600;">${escapeHtml(task.roleR || task.assignee || '-')}</span>
              </div>
              <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;">
                <div style="font-size:11px;color:#2563EB;margin-bottom:4px;">C 协作人</div>
                <span style="font-size:13px;font-weight:600;">${escapeHtml(task.roleC || '-')}</span>
              </div>
              <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;">
                <div style="font-size:11px;color:#2563EB;margin-bottom:4px;">V 业务验收人</div>
                <span style="font-size:13px;font-weight:600;">${escapeHtml(task.roleV || '-')}</span>
              </div>
              <div style="padding:10px 12px;background:#FFFBEB;border-radius:8px;grid-column:span 2;border:1px solid #FDE68A;">
                <div style="font-size:11px;color:#D97706;margin-bottom:4px;">依赖 / 风险</div>
                <div style="font-size:13px;white-space:pre-wrap;">${escapeHtml(task.depsRisks || '暂无')}</div>
                ${(task.escalation || task.delayImpact || task.reopenConditions) ? `
                <div style="margin-top:8px;font-size:12px;color:#92400E;line-height:1.6;">
                  ${task.escalation ? `<div>升级条件：${escapeHtml(task.escalation)}</div>` : ''}
                  ${task.delayImpact ? `<div>延期影响：${escapeHtml(task.delayImpact)}</div>` : ''}
                  ${task.reopenConditions ? `<div>重开条件：${escapeHtml(task.reopenConditions)}</div>` : ''}
                </div>
                ` : ''}
              </div>
            </div>
          </div>
          ` : ''}

          ${renderTaskDeliveryCompletenessSection(task, canEdit)}

          <div class="detail-section">
            <div class="detail-section-title"><i class="fas fa-chart-line"></i>进度</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:13px;color:#6B7280;">当前完成度</span>
              <span style="font-size:13px;font-weight:600;">${progress}%</span>
            </div>
            <div class="progress-bar" style="height:8px;"><div class="progress-fill" style="width:${progress}%;"></div></div>
          </div>

          ${canQuickUpdateProgress(task) ? `
          <div style="margin-bottom:16px;padding:12px;background:#ECFDF5;border-radius:8px;border:1px solid #D1FAE5;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:12px;font-weight:500;color:#10B981;"><i class="fas fa-sliders-h" style="margin-right:4px;"></i>快捷更新进度</span>
              <span style="font-size:13px;font-weight:600;color:#10B981;" id="quickProgressVal-${task.id}">${progress}%</span>
            </div>
            <input type="range" min="0" max="100" value="${progress}" style="width:100%;cursor:pointer;accent-color:#10B981;"
              oninput="document.getElementById('quickProgressVal-${task.id}').textContent=this.value+'%'"
              onchange="quickUpdateProgress('${task.id}', this.value)">
            <div style="font-size:11px;color:#9CA3AF;margin-top:6px;">拖动滑条即可更新，无需填写修改原因</div>
          </div>
          ` : ''}

          ${renderLiteAdvancedToggle('taskDetailAdvanced', '更多信息', '工时 / 依赖 / 协办摘要')}
          ${isUiSectionOpen('taskDetailAdvanced') ? `
          <div class="lite-advanced-body">
            ${renderTaskDependencyPanel(task)}
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;">
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;">
                <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">创建时间</div>
                <span style="font-size:13px;font-weight:500;">${formatTaskCreatedAt(task.createdAt)}</span>
              </div>
              <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;">
                <div style="font-size:11px;color:#2563EB;margin-bottom:4px;"><i class="fas fa-calendar-alt" style="margin-right:4px;"></i>计划开始</div>
                <span style="font-size:13px;font-weight:600;color:#2563EB;">${task.planStartDate || '未设置'}</span>
              </div>
              <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;">
                <div style="font-size:11px;color:#2563EB;margin-bottom:4px;"><i class="fas fa-clock" style="margin-right:4px;"></i>预计工时</div>
                <span style="font-size:13px;font-weight:600;color:#2563EB;">${task.estimatedHours || 0} 小时</span>
                ${taskDailyHours(task) ? `<span style="font-size:11px;color:#6B7280;margin-left:4px;">（每天 ${taskDailyHours(task)}h）</span>` : ''}
                ${needsIntakeEstimatedHours(task) ? `<div style="font-size:11px;color:#D97706;margin-top:4px;">开始前请填写</div>` : ''}
              </div>
              <div style="padding:10px 12px;background:${(task.actualHours || 0) > (task.estimatedHours || 0) ? '#FEF2F2' : '#F0FDF4'};border-radius:8px;">
                <div style="font-size:11px;color:${(task.actualHours || 0) > (task.estimatedHours || 0) ? '#DC2626' : '#059669'};margin-bottom:4px;"><i class="fas fa-stopwatch" style="margin-right:4px;"></i>实际工时</div>
                <span style="font-size:13px;font-weight:600;color:${(task.actualHours || 0) > (task.estimatedHours || 0) ? '#DC2626' : '#059669'};">${task.actualHours || 0} 小时</span>
              </div>
              ${task.actualStartDate ? `
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;grid-column:span 2;">
                <div style="display:flex;gap:16px;">
                  <div>
                    <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">实际开始</div>
                    <span style="font-size:12px;font-weight:500;">${task.actualStartDate}</span>
                  </div>
                  <div>
                    <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">实际结束</div>
                    <span style="font-size:12px;font-weight:500;">${task.actualEndDate || '进行中...'}</span>
                  </div>
                </div>
              </div>
              ` : ''}
            </div>
            ${renderCollaboratorSummary(task)}
          </div>
          ` : ''}

          ${!canEdit && canViewTask(task) ? `
          <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;margin-bottom:12px;font-size:12px;color:#9CA3AF;">
            <i class="fas fa-eye" style="margin-right:4px;"></i>您正在查看他人任务，仅可浏览
          </div>
          ` : ''}

          ${children.length > 0 ? `
          <div style="border-top:1px solid #E5E7EB;padding-top:16px;">
            <div style="font-size:14px;font-weight:600;margin-bottom:12px;"><i class="fas fa-sitemap" style="color:#D97706;margin-right:6px;"></i>下级任务 (${children.length})</div>
            ${children.map(c => {
              const cDisplayStatus = getTaskDisplayStatus(c);
              const cSt = statusMap[cDisplayStatus] || statusMap[c.status];
              return `
                <div style="padding:10px 12px;background:var(--bg-muted);border-radius:8px;border:1px solid var(--border);margin-bottom:8px;cursor:pointer;" onclick="viewTask('${c.id}')">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="priority-dot priority-${c.priority}"></span>
                    <span style="font-size:13px;font-weight:500;flex:1;">${c.title}</span>
                    <span class="status-tag status-${cDisplayStatus}" style="font-size:10px;">${cSt.label}</span>
                  </div>
                  <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">${c.assignee} · ${c.dueDate}</div>
                </div>
              `;
            }).join('')}
          </div>
          ` : ''}
          ` : ''}

          ${detailTab === 'comments' ? `
          <div class="detail-section">
            <div class="detail-section-title"><i class="fas fa-comments"></i>沟通与附件</div>
            ${renderTaskDiscussion(task)}
            ${renderEntityFiles(task.attachments, {
              entityType: 'task',
              entityId: task.id,
              canUpload: canUploadTaskAttachment(task),
              title: '任务附件',
              emptyHint: '暂无附件，可上传、粘贴截图，或添加钉钉文档链接',
            })}
          </div>
          ` : ''}

          ${detailTab === 'logs' ? renderTaskDetailActivityLogs(task) : ''}

        </div>
        <div class="modal-footer">
          ${(canAddSubTask || canReject || canTransfer || (canAbolishTask(task) && task.status !== 'abolished' && task.status !== 'archived') || canOperateTask(task)) ? `
          <div class="task-more-wrap">
            <button type="button" class="btn btn-ghost" onclick="toggleTaskMoreMenu(event)"><i class="fas fa-ellipsis-h"></i>更多</button>
            <div id="taskMoreDropdown" class="task-more-dropdown" onclick="event.stopPropagation()">
              ${canAddSubTask ? `<button type="button" onclick="showNewSubTaskModal('${task.id}')"><i class="fas fa-sitemap" style="color:#059669;"></i>添加子任务</button>` : ''}
              ${canReject ? `<button type="button" onclick="showRejectModal('${task.id}')"><i class="fas fa-undo" style="color:#D97706;"></i>驳回</button>` : ''}
              ${canTransfer ? `<button type="button" onclick="showTransferModal('${task.id}')"><i class="fas fa-exchange-alt"></i>转办</button>` : ''}
              ${canAbolishTask(task) && task.status !== 'abolished' && task.status !== 'archived' ? `<button type="button" class="is-danger" onclick="abolishTask('${task.id}')"><i class="fas fa-ban"></i>作废</button>` : ''}
              ${canOperateTask(task) ? `<button type="button" onclick="editTask('${task.id}')"><i class="fas fa-edit"></i>编辑</button>` : ''}
            </div>
          </div>
          ` : ''}
          <div style="flex:1;"></div>

          ${canPostTaskComment(task) ? `
            <button class="btn btn-ghost" onclick="focusTaskComment('${task.id}')"><i class="fas fa-comment"></i>留言</button>
          ` : ''}

          ${isMilestoneTask(task) ? `
            ${canCompleteMilestone(task) && canOperateTask(task) ? `
              <button class="btn btn-success" onclick="updateTaskStatus('${task.id}', 'done')"><i class="fas fa-check"></i>完成里程碑</button>
            ` : (task.status !== 'done' && task.status !== 'abolished' && task.status !== 'archived' ? `
              <span style="font-size:12px;color:#9CA3AF;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>${escapeHtml(getMilestoneIncompleteHint(task.id))}</span>
            ` : '')}
            ${canCreateSubTask(task) ? `
              <button class="btn btn-primary" onclick="showNewSubTaskModal('${task.id}')"><i class="fas fa-plus"></i>添加任务</button>
            ` : ''}
          ` : `
            ${task.status === 'todo' && canOperateTask(task) && !hasActiveChildren(task.id) && !hasHardBlock(task) ? `
              <button class="btn btn-primary" onclick="updateTaskStatus('${task.id}', 'doing')"><i class="fas fa-play"></i>开始</button>
              <button class="btn btn-ghost" onclick="updateTaskStatus('${task.id}', 'paused')"><i class="fas fa-pause"></i>暂停</button>
            ` : ''}

            ${task.status === 'doing' && canOperateTask(task) && !hasActiveChildren(task.id) && !hasHardBlock(task) ? `
              <button class="btn btn-ghost" onclick="updateTaskStatus('${task.id}', 'paused')"><i class="fas fa-pause"></i>暂停</button>
              <button class="btn btn-success" onclick="updateTaskStatus('${task.id}', 'done')"><i class="fas fa-check"></i>完成</button>
            ` : ''}

            ${task.status === 'paused' && canOperateTask(task) && !hasActiveChildren(task.id) && !hasHardBlock(task) ? `
              <button class="btn btn-primary" onclick="updateTaskStatus('${task.id}', 'doing')"><i class="fas fa-play"></i>继续</button>
              <button class="btn btn-success" onclick="updateTaskStatus('${task.id}', 'done')"><i class="fas fa-check"></i>完成</button>
            ` : ''}

            ${hasHardBlock(task) && canOperateTask(task) ? `
              <span style="font-size:12px;color:#D97706;"><i class="fas fa-pause-circle" style="margin-right:4px;"></i>等待前置任务完成</span>
            ` : ''}

            ${canOperateTask(task) && hasActiveChildren(task.id) ? `
              <span style="font-size:12px;color:#9CA3AF;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>有未完成的下级任务</span>
            ` : ''}
          `}

          ${!canEdit ? `<button class="btn btn-ghost" onclick="closeModal()">关闭</button>` : ''}
        </div>
      </div>
    </div>
  `;
}
