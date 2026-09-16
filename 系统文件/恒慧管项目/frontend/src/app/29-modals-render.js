// ========== 弹窗渲染 ==========
function renderModal() {
  switch(state.showModal) {
    case 'taskDetail': return renderTaskDetailModal();
    case 'taskEdit': return renderTaskEditModal();
    case 'quickCreate':
    case 'quickTask':
    case 'tempTask':
      return renderQuickCreateModal();
    case 'staffEdit': return renderStaffEditModal();
    case 'scopedKeyResult': return renderScopedKeyResultModal();
    case 'scopedKeyIssue': return renderScopedKeyIssueModal();
    case 'issueEdit': return renderIssueEditModal();
    case 'projectRegister': return renderProjectRegisterModal();
    case 'dateBaselineConfirm': return renderDateBaselineConfirmModal();
    case 'projectDetail': return renderProjectDetailModal();
    case 'projectCreate': return renderProjectCreateModal();
    case 'projectEdit': return renderProjectEditModal();
    case 'kpiPlanEdit': return renderKpiPlanEditModal();
    case 'kpiPlanCreate': return renderKpiPlanCreateModal();
    case 'templateEdit':
    case 'templateCreate': return renderProjectTemplateEditModal();
    case 'reject': return renderRejectModal();
    case 'transfer': return renderTransferModal();
    case 'archive': return renderArchiveModal();
    case 'memberKanban': return renderMemberKanbanModal();
    case 'addDependency': return renderAddDependencyModal();
    case 'dingTalkSync': return renderDingTalkSyncModal();
    case 'wikiDocPicker': return renderWikiDocPickerModal();
    case 'systemUpdate': return renderSystemUpdateModal();
    default: return '';
  }
}

function renderSystemUpdateModal() {
  const pending = state.pendingSystemUpdates || [];
  if (!pending.length) return '';
  return `
    <div class="modal-overlay" onclick="if(event.target===this)dismissSystemUpdateModal()">
      <div class="modal-box" style="max-width:640px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-bullhorn" style="color:#D97706;margin-right:8px;"></i>系统更新说明</h3>
          <button onclick="dismissSystemUpdateModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto;">
          ${pending.length > 1 ? `<p style="font-size:13px;color:#6B7280;margin-bottom:16px;padding:10px 14px;background:#FFFBEB;border-radius:8px;"><i class="fas fa-layer-group" style="margin-right:6px;color:#D97706;"></i>您有 ${pending.length} 个版本更新尚未查看，已合并展示。</p>` : ''}
          ${pending.map(u => `
            <div style="margin-bottom:${pending.length > 1 ? '20px' : '0'};${pending.length > 1 ? 'padding-bottom:20px;border-bottom:1px solid #F3F4F6;' : ''}">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
                <span style="padding:3px 10px;background:#FEF3C7;color:#B45309;border-radius:12px;font-size:12px;font-weight:600;">v${escapeHtml(u.version)}</span>
                <span style="font-size:15px;font-weight:600;color:var(--text);">${escapeHtml(u.title || ('v' + u.version + ' 更新'))}</span>
                <span style="font-size:12px;color:#9CA3AF;margin-left:auto;">${escapeHtml(u.releaseDate || '')}</span>
              </div>
              ${u.summary ? `<p style="font-size:14px;color:#4B5563;margin-bottom:12px;line-height:1.6;">${escapeHtml(u.summary)}</p>` : ''}
              ${(u.items || []).length ? `<ul style="list-style:none;padding:0;margin:0;">${renderSystemUpdateItems(u.items)}</ul>` : ''}
            </div>
          `).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="dismissSystemUpdateModal()" style="width:100%;justify-content:center;">
            <i class="fas fa-check"></i>我知道了
          </button>
        </div>
      </div>
    </div>
  `;
}
