// ========== 归档管理 ==========
function renderArchive() {
  const archivedProjects = getViewableArchivedProjects();

  return `
    <p class="content-intro" style="margin-bottom:20px;">此页仅用于查询已归档项目。如需归档，请进入「项目管理」→ 项目详情 → 点击「归档」。</p>
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title"><i class="fas fa-archive" style="color:#9CA3AF;"></i>已归档项目</span>
        <span style="font-size:12px;color:#9CA3AF;">共 ${archivedProjects.length} 个项目</span>
      </div>
      <div class="panel-body">
        ${archivedProjects.length === 0 ? renderEmptyState({ icon: 'fa-archive', title: '暂无归档项目', hint: '归档后的项目会出现在这里' }) : ''}
        ${archivedProjects.map(p => `
          <div style="padding:16px;background:var(--bg-muted);border-radius:8px;border:1px solid var(--border);margin-bottom:12px;cursor:pointer;transition:border-color 0.2s;" onclick="viewProject('${p.id}')" onmouseover="this.style.borderColor='#6EE7B7'" onmouseout="this.style.borderColor='#E5E7EB'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <h3 style="font-size:15px;font-weight:600;color:var(--text);">${p.name}</h3>
                <div style="font-size:12px;color:#9CA3AF;margin-top:4px;">${p.id} · ${p.dept} · ${p.manager}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;" onclick="event.stopPropagation()">
                <span class="status-tag status-archived"><i class="fas fa-archive"></i>已归档</span>
                ${canDeleteProject() ? `
                  <button class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="deleteProject('${p.id}', event)" title="永久删除"><i class="fas fa-trash-alt"></i></button>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
