// ========== 团队管理 ==========
function renderTeam() {
  const isTeamAdmin = isFullAccess(currentUser.role);
  const deptTabs = getDeptFilterTabs({ memberOnly: true });
  const selectedDept = isTeamAdmin ? (state.teamDept || 'all') : currentUser.dept;
  let filteredMembers = getDeptScopeUsers();
  if (isTeamAdmin && selectedDept !== 'all') {
    filteredMembers = filteredMembers.filter(u => u.dept === selectedDept);
  }

  // 搜索过滤
  if (state.teamSearch) {
    const q = state.teamSearch.toLowerCase();
    filteredMembers = filteredMembers.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.position.toLowerCase().includes(q) ||
      u.dept.toLowerCase().includes(q)
    );
  }

  // 统计每个成员的任务情况（基于工时）
  const memberStats = sortTeamMembers(getFilteredTeamStats());
  const weekRange = memberStats[0]?.weekRange || getCurrentWeekRange();
  const teamSort = state.teamSort || 'saturation_desc';
  const teamSortOptions = [
    { key: 'saturation_desc', label: '当周饱和度从高到低' },
    { key: 'saturation_asc', label: '当周饱和度从低到高' },
    { key: 'weeklyHours_desc', label: '当周工时从高到低' },
    { key: 'weeklyHours_asc', label: '当周工时从低到高' },
    { key: 'name', label: '姓名 A-Z' },
  ];

  // 部门整体统计
  const allDeptTasks = tasks.filter(t => filteredMembers.some(u => u.name === t.assignee));
  const totalTasks = allDeptTasks.length;
  const totalDone = allDeptTasks.filter(t => t.status === 'done').length;
  const totalDoing = allDeptTasks.filter(t => t.status === 'doing').length;
  const totalTodo = allDeptTasks.filter(t => t.status === 'todo').length;
  const totalOverdue = allDeptTasks.filter(t => isOverdue(t)).length;

  // 任务类型分布
  const tempTasks = allDeptTasks.filter(t => t.type === 'temp').length;
  const normalTasks = allDeptTasks.filter(t => t.type === 'normal').length;

  const normalPct = totalTasks > 0 ? Math.round(normalTasks / totalTasks * 100) : 0;
  const tempPct = totalTasks > 0 ? Math.round(tempTasks / totalTasks * 100) : 0;
  const donePct = totalTasks > 0 ? Math.round(totalDone / totalTasks * 100) : 0;

  return `
    <div class="team-page">
      <div class="team-page-toolbar">
        <div class="team-filter-tabs">
          ${deptTabs.map(tab => {
            const isActive = selectedDept === tab.id;
            return `
              <button type="button" class="team-filter-tab${isActive ? ' is-active' : ''}" onclick="state.teamDept='${tab.id}';render()">
                ${tab.icon ? `<i class="fas ${tab.icon}" style="margin-right:4px;font-size:11px;"></i>` : ''}${tab.label}
                <span class="tab-count">${tab.count}</span>
              </button>
            `;
          }).join('')}
          ${!isTeamAdmin ? `<span style="font-size:12px;color:var(--text-light);margin-left:4px;">仅本部门数据</span>` : ''}
        </div>
        <div style="position:relative;">
          <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-light);font-size:13px;"></i>
          <input class="input" style="width:240px;padding-left:36px;" placeholder="搜索成员姓名..." value="${state.teamSearch}" onchange="state.teamSearch=this.value;render()">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--brand-soft);color:var(--brand);"><i class="fas fa-tasks"></i></div>
          <div class="stat-value">${totalTasks}</div>
          <div class="stat-label">总任务数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#ECFDF5;color:#059669;"><i class="fas fa-check-circle"></i></div>
          <div class="stat-value">${totalDone}</div>
          <div class="stat-label">已完成</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#EFF6FF;color:#2563EB;"><i class="fas fa-spinner"></i></div>
          <div class="stat-value">${totalDoing}</div>
          <div class="stat-label">进行中</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--border-light);color:var(--text-muted);"><i class="fas fa-clock"></i></div>
          <div class="stat-value">${totalTodo}</div>
          <div class="stat-label">待开始</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#FEF2F2;color:#DC2626;"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="stat-value">${totalOverdue}</div>
          <div class="stat-label">已逾期</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title"><i class="fas fa-chart-pie" style="color:var(--brand);"></i>任务类型分布</span>
          </div>
          <div class="panel-body">
            <div style="display:flex;gap:14px;">
              <div class="team-type-chip">
                <div class="chip-value">${normalTasks}</div>
                <div class="chip-label">常规任务</div>
                <div class="chip-bar"><span style="width:${normalPct}%;"></span></div>
              </div>
              <div class="team-type-chip is-temp">
                <div class="chip-value">${tempTasks}</div>
                <div class="chip-label">临时任务</div>
                <div class="chip-bar"><span style="width:${tempPct}%;"></span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <span class="panel-title"><i class="fas fa-chart-bar" style="color:var(--brand);"></i>任务完成情况</span>
          </div>
          <div class="panel-body">
            <div style="text-align:center;margin-bottom:16px;">
              <div style="position:relative;width:120px;height:120px;margin:0 auto;">
                <svg style="width:120px;height:120px;transform:rotate(-90deg);">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="12"/>
                  <circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand)" stroke-width="12"
                    stroke-dasharray="${2 * Math.PI * 50}" stroke-dashoffset="${2 * Math.PI * 50 * (1 - (totalTasks > 0 ? totalDone / totalTasks : 0))}"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
                  <span style="font-size:24px;font-weight:700;color:var(--text);">${donePct}%</span>
                  <span style="font-size:11px;color:var(--text-light);">完成率</span>
                </div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="team-complete-mini is-done">
                <div class="mini-value">${totalDone}</div>
                <div class="mini-label">已完成</div>
              </div>
              <div class="team-complete-mini is-todo">
                <div class="mini-value">${totalTasks - totalDone}</div>
                <div class="mini-label">未完成</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:24px;">
        <div class="panel-header" style="flex-wrap:wrap;gap:12px;">
          <span class="panel-title"><i class="fas fa-users" style="color:var(--brand);"></i>团队成员工作饱和度 ${selectedDept === 'all' ? '(全部门)' : '(' + selectedDept + ')'}</span>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto;">
            <span style="font-size:12px;color:var(--text-light);white-space:nowrap;"><i class="fas fa-sort-amount-down" style="margin-right:4px;"></i>排序</span>
            ${teamSortOptions.map(opt => `
              <button type="button" class="team-sort-btn${teamSort === opt.key ? ' is-active' : ''}" onclick="setTeamSort('${opt.key}')">${opt.label}</button>
            `).join('')}
          </div>
        </div>
        <div class="team-period-note">
          统计周期：${weekRange.start} ~ ${weekRange.end}（当周周一至周日）· 本周原计划按任务原始计划分摊（含已完成/阻塞）· 当周待处理仅计未完成且未阻塞 · 已批准辅助性协办按协助时段分摊 · 告知性协办不计工时
        </div>
        <div class="panel-body" style="padding:16px;">
          <div class="team-member-grid">
            ${memberStats.map(m => {
              let satColor = '#059669';
              let satBg = 'rgba(5,150,105,0.12)';
              let satLabel = '空闲';
              if (m.saturation >= 80) {
                satColor = '#DC2626'; satBg = 'rgba(220,38,38,0.12)'; satLabel = '饱和';
              } else if (m.saturation >= 50) {
                satColor = '#E8A84A'; satBg = 'rgba(232,168,74,0.16)'; satLabel = '适中';
              } else if (m.saturation >= 20) {
                satColor = '#3D4A8C'; satBg = 'var(--brand-soft)'; satLabel = '正常';
              }

              const roleClass = roleBadgeClass(m.role);
              const roleName = roleDisplayName(m.role);
              const isNonStaff = m.role !== 'staff';
              const rateColor = m.completionRate >= 80 ? '#059669' : m.completionRate >= 50 ? '#E8A84A' : '#DC2626';
              return `
                <div class="team-member-card" onclick="showMemberKanban('${m.id}')" title="点击查看${m.name}的任务看板">
                  <div class="team-member-card-head">
                    <div class="team-member-avatar">${m.name.charAt(0)}</div>
                    <div style="flex:1;min-width:0;">
                      <div class="team-member-name">${m.name}</div>
                      <div class="team-member-dept">${m.dept}</div>
                      <span class="role-badge ${roleClass}" style="margin-top:4px;">${roleName}</span>
                    </div>
                    <span class="team-sat-tag" style="background:${satBg};color:${satColor};">${satLabel}</span>
                  </div>

                  <div style="margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                      <span style="font-size:12px;color:var(--text-muted);">当周工时饱和度</span>
                      <span style="font-size:12px;font-weight:600;color:${satColor};">${m.saturation}%</span>
                    </div>
                    <div class="team-sat-bar"><span style="width:${Math.min(m.saturation, 100)}%;background:${satColor};"></span></div>
                    <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--text-light);flex-wrap:wrap;gap:4px;">
                      <span>本周原计划：${m.originalPlannedHours ?? 0}h</span>
                      <span>标准：${m.standardWeekHours}h/周</span>
                    </div>
                    <div style="margin-top:2px;font-size:11px;color:var(--text-light);">
                      <span>当周待处理：${m.weeklyHours}h${m.weeklyBreakdown?.assistHours > 0 ? `（主责 ${m.weeklyBreakdown.assigneeHours}h · 协办 ${m.weeklyBreakdown.assistHours}h）` : ''}${m.pendingBlockedHours > 0 ? ` · <span style="color:#E8A84A;">${m.pendingBlockedHours}h 因阻塞挂起</span>` : ''}</span>
                    </div>
                  </div>

                  <div class="team-member-metrics">
                    <div class="team-metric">
                      <div class="metric-value">${m.total}</div>
                      <div class="metric-label">总任务</div>
                    </div>
                    <div class="team-metric">
                      <div class="metric-value" style="color:#2563EB;">${m.doing}</div>
                      <div class="metric-label">进行中</div>
                    </div>
                    <div class="team-metric">
                      <div class="metric-value" style="color:#059669;">${m.done}</div>
                      <div class="metric-label">已完成</div>
                    </div>
                    <div class="team-metric${m.overdue > 0 ? ' is-overdue' : ''}">
                      <div class="metric-value"${m.overdue > 0 ? '' : ' style="color:var(--text-light);"'}>${m.overdue}</div>
                      <div class="metric-label">已逾期</div>
                    </div>
                  </div>

                  <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                    <span style="color:var(--text-light);">完成率</span>
                    <span style="font-weight:500;color:${rateColor};">${m.completionRate}%</span>
                  </div>
                  <div class="team-member-footer">
                    <i class="fas fa-columns" style="margin-right:4px;"></i>${isNonStaff ? '查看管理岗任务看板' : '查看任务看板'}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}
