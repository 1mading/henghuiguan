  function updateTaskStatus(id, status) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (isMilestoneTask(t)) {
      const kids = state.tasks.filter(x => x.parentId === t.id && x.status !== 'abolished');
      if (status === 'done' && kids.some(k => k.status !== 'done')) {
        alert('里程碑下仍有未完成任务，全部完成后方可完成里程碑');
        return;
      }
    }
    if (t.intake && (status === 'doing' || status === 'done') && !(t.hours > 0)) {
      const raw = prompt('表单提报任务须先填写预计工时（小时）：', '2');
      if (raw === null) return;
      const h = Number(String(raw).trim());
      if (!Number.isFinite(h) || h <= 0) { alert('请输入大于 0 的预计工时'); return; }
      t.hours = h;
    }
    t.status = status;
    if (status === 'doing') t.progress = Math.max(t.progress || 0, 10);
    if (status === 'done') t.progress = 100;
    if (status === 'paused') toast('已暂停：' + t.title);
    else if (status === 'done') toast('已完成：' + t.title);
    else toast('已开始：' + t.title);
    render();
  }

  function viewProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    state.prevPage = state.page === 'projectDetail' ? (state.prevPage || 'projects') : state.page;
    state.detailProjectId = id;
    state.projectPlanFilter = 'all';
    state.page = 'projectDetail';
    state.settingsOpen = false;
    render();
  }

  function updateProjectStatus(id, status) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    p.status = status;
    toast('项目状态已更新为：' + ({ planning: '规划中', active: '进行中', paused: '已暂停', done: '已完成' }[status] || status));
    render();
  }

  function showProjectModal() {
    state.form = {
      name: '',
      desc: '',
      dept: '信息中心',
      manager: ME.name,
      endDate: addDays(30),
      startDate: todayStr(),
      members: [],
    };
    state.modal = { type: 'projectCreate' };
    render();
  }

  function editProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    state.form = {
      id: p.id,
      name: p.name || '',
      desc: p.desc || '',
      dept: p.dept || '信息中心',
      manager: p.manager || ME.name,
      status: p.status || 'active',
      startDate: p.startDate || todayStr(),
      endDate: p.endDate || addDays(30),
      members: (p.members || []).slice(),
    };
    state.modal = { type: 'projectEdit' };
    render();
  }

  function saveProjectCreate() {
    const name = (document.getElementById('pfName') || {}).value;
    const desc = (document.getElementById('pfDesc') || {}).value;
    const manager = (document.getElementById('pfManager') || {}).value;
    const endDate = (document.getElementById('pfEnd') || {}).value;
    const title = String(name || '').trim();
    if (!title) { alert('请填写项目名称'); return; }
    const id = 'PRJ-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    state.projects.unshift({
      id,
      name: title,
      desc: String(desc || '').trim(),
      dept: '信息中心',
      manager: manager || ME.name,
      status: 'planning',
      startDate: todayStr(),
      endDate: endDate || addDays(30),
      members: [manager || ME.name].filter(Boolean),
    });
    state.modal = null;
    state.form = null;
    toast('已创建项目');
    viewProject(id);
  }

  function saveProjectEdit() {
    const f = state.form || {};
    const p = state.projects.find(x => x.id === f.id);
    if (!p) return;
    const name = (document.getElementById('pfName') || {}).value;
    const desc = (document.getElementById('pfDesc') || {}).value;
    const manager = (document.getElementById('pfManager') || {}).value;
    const endDate = (document.getElementById('pfEnd') || {}).value;
    const status = (document.getElementById('pfStatus') || {}).value;
    const title = String(name || '').trim();
    if (!title) { alert('请填写项目名称'); return; }
    p.name = title;
    p.desc = String(desc || '').trim();
    p.manager = manager || p.manager;
    p.endDate = endDate || p.endDate;
    p.status = status || p.status;
    state.modal = null;
    state.form = null;
    toast('已保存项目');
    render();
  }

  function renderProjectDetail() {
    const project = state.projects.find(p => p.id === state.detailProjectId);
    if (!project) return renderProjects();
    const stats = getProjectListStats(project);
    const accent = getProjectAccentColor(project);
    const memberNames = [project.manager].concat(project.members || []).filter((n, i, arr) => n && arr.indexOf(n) === i);
    const projectStatusMap = {
      planning: { label: '规划中', color: '#6366F1', bg: '#EEF2FF', icon: 'fa-drafting-compass' },
      active: { label: '进行中', color: '#10B981', bg: '#ECFDF5', icon: 'fa-play-circle' },
      paused: { label: '已暂停', color: '#6B7280', bg: '#F3F4F6', icon: 'fa-pause-circle' },
      done: { label: '已完成', color: '#059669', bg: '#D1FAE5', icon: 'fa-check-circle' },
    };
    const milestones = state.tasks.filter(t => t.projectId === project.id && isMilestoneTask(t) && t.status !== 'abolished');
    const leaves = state.tasks.filter(t => t.projectId === project.id && !isMilestoneTask(t) && t.status !== 'abolished');
    const filter = state.projectPlanFilter || 'all';
    const filterLeaves = (list) => (filter === 'mine' ? list.filter(t => t.assignee === ME.name) : list);

    const memberRows = memberNames.map(name => {
      const user = state.members.find(u => u.name === name);
      const isManager = project.manager === name;
      const roleLabel = isManager ? '项目经理' : (user ? roleDisplayName(user.role) : '团队成员');
      return `
        <div class="project-member-row">
          <span class="person-avatar" style="width:36px;height:36px;background:${avatarColor(name)};">${esc(String(name).charAt(0))}</span>
          <div style="min-width:0;flex:1;">
            <div class="project-member-name">${esc(name)}</div>
            <div class="project-member-role">${esc(roleLabel)}</div>
          </div>
        </div>`;
    }).join('');

    const renderLeafRow = (task) => `
      <div class="project-plan-task" onclick="viewTask('${task.id}')" style="cursor:pointer;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:#fff;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="priority-dot priority-${task.priority || 'normal'}"></span>
          <strong style="font-size:13px;">${esc(task.title)}</strong>
          ${statusTag(task.status)}
          ${isOverdue(task) ? '<span class="tag" style="background:#FEE2E2;color:#DC2626;">已逾期</span>' : ''}
        </div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;">
          <span><i class="fas fa-user" style="margin-right:4px;"></i>${esc(task.assignee || '-')}</span>
          <span><i class="fas fa-calendar" style="margin-right:4px;"></i>${esc(task.dueDate || '-')}</span>
          <span>进度 ${task.progress || 0}%</span>
        </div>
      </div>`;

    let planHtml = '';
    if (milestones.length) {
      planHtml = milestones.map(ms => {
        const kids = filterLeaves(leaves.filter(t => t.parentId === ms.id));
        return `
          <div class="panel" style="margin-bottom:12px;">
            <div class="panel-header" style="cursor:default;">
              <span class="panel-title"><i class="fas fa-flag" style="color:#2563EB;margin-right:6px;"></i>${esc(ms.title)} ${statusTag(ms.status)}</span>
              <button type="button" class="btn btn-ghost btn-sm" onclick="viewTask('${ms.id}')"><i class="fas fa-eye"></i></button>
            </div>
            <div class="panel-body" style="display:flex;flex-direction:column;gap:8px;">
              ${kids.length ? kids.map(renderLeafRow).join('') : '<div style="font-size:12px;color:#9CA3AF;">该里程碑下暂无任务</div>'}
            </div>
          </div>`;
      }).join('');
      const orphans = filterLeaves(leaves.filter(t => !t.parentId || !milestones.some(m => m.id === t.parentId)));
      if (orphans.length) {
        planHtml += `
          <div class="panel" style="margin-bottom:12px;">
            <div class="panel-header"><span class="panel-title">未归入里程碑的任务</span></div>
            <div class="panel-body" style="display:flex;flex-direction:column;gap:8px;">${orphans.map(renderLeafRow).join('')}</div>
          </div>`;
      }
    } else {
      const list = filterLeaves(leaves);
      planHtml = list.length
        ? `<div class="panel"><div class="panel-body" style="display:flex;flex-direction:column;gap:8px;">${list.map(renderLeafRow).join('')}</div></div>`
        : renderEmptyState({ icon: 'fa-flag', title: '暂无任务计划', hint: '可先新建里程碑，再在里程碑下添加任务' });
    }

    return `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="goBack()"><i class="fas fa-arrow-left"></i>返回项目列表</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-ghost btn-sm" onclick="editProject('${project.id}')" title="编辑项目"><i class="fas fa-edit"></i>编辑</button>
          </div>
        </div>

        <div class="project-hero">
          <div class="project-hero-top">
            <div class="project-hero-identity">
              ${renderProjectIconTile(project)}
              <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <h2 class="project-hero-title" style="margin:0;">${esc(project.name || '')}</h2>
                  ${renderProjectStatusDot(project.status)}
                </div>
                <div class="project-hero-desc" style="margin-top:6px;">${esc(project.desc || '暂无描述')}</div>
                <div class="project-hero-meta">
                  <span><i class="fas fa-building"></i>${esc(project.dept || '-')}</span>
                  <span><i class="fas fa-calendar"></i>${esc((project.startDate || '-') + ' ~ ' + (project.endDate || '-'))}</span>
                  <span style="font-family:monospace;font-size:12px;color:#9CA3AF;">${esc(project.id || '')}</span>
                </div>
              </div>
            </div>
            <div class="project-hero-stats-row">
              <div><div class="v">${stats.mainCount}</div><div class="l">里程碑</div></div>
              <div><div class="v">${stats.mainDone}</div><div class="l">已完成</div></div>
              <div><div class="v">${memberNames.length}</div><div class="l">成员</div></div>
            </div>
            ${stats.overdue ? `<p class="project-hero-overdue-hint"><i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>有 ${stats.overdue} 个延期任务</p>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:12px;color:var(--text-muted);">整体进度</span>
              <span style="font-size:12px;font-weight:600;">${stats.mainProgress}%</span>
            </div>
            <div class="progress-bar" style="height:8px;"><div class="progress-fill" style="width:${stats.mainProgress}%;background:${accent};"></div></div>
            <div style="margin-top:12px;padding:12px;background:#F9FAFB;border-radius:8px;">
              <div style="font-size:12px;color:#9CA3AF;margin-bottom:8px;">项目状态</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${Object.entries(projectStatusMap).map(([key, val]) => `
                  <button onclick="updateProjectStatus('${project.id}', '${key}')" style="padding:6px 14px;border-radius:6px;border:1px solid ${project.status === key ? val.color : '#E5E7EB'};background:${project.status === key ? val.bg : '#fff'};color:${project.status === key ? val.color : '#6B7280'};cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                    <i class="fas ${val.icon}"></i>${val.label}
                  </button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="project-detail-layout" style="display:grid;grid-template-columns:minmax(220px,260px) 1fr;gap:16px;margin-top:16px;">
          <div class="project-detail-side">
            <section>
              <h3 class="project-detail-section-title">项目成员</h3>
              <div class="project-member-panel">
                <div class="project-member-list">${memberRows || '<div class="project-member-row" style="color:var(--text-muted);font-size:12px;">暂无成员</div>'}</div>
              </div>
            </section>
          </div>
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:15px;">任务计划</h3>
              <div class="scope-seg">
                <button type="button" class="${filter === 'all' ? 'active' : ''}" onclick="state.projectPlanFilter='all';render()">全部任务</button>
                <button type="button" class="${filter === 'mine' ? 'active' : ''}" onclick="state.projectPlanFilter='mine';render()">我的任务</button>
              </div>
            </div>
            ${planHtml}
          </div>
        </div>
      </div>`;
  }

  function viewTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    state.modal = { type: 'task', taskId: id };
    render();
  }

  function viewTaskFromTeamKanban(id) {
    const m = state.modal && state.modal.type === 'memberKanban' ? state.modal.memberName : null;
    if (m) state.returnToMemberName = m;
    viewTask(id);
  }

  function editTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    state.form = {
      id: t.id,
      title: t.title || '',
      assignee: t.assignee || ME.name,
      priority: t.priority || 'normal',
      dueDate: t.dueDate || '',
      desc: t.desc || '',
      progress: t.progress || 0,
      hours: t.hours || 0,
    };
    state.modal = { type: 'taskEdit', taskId: id };
    render();
  }

  function saveTaskEdit() {
    const f = state.form || {};
    const t = state.tasks.find(x => x.id === f.id);
    if (!t) return;
    const title = String((document.getElementById('tfTitle') || {}).value || '').trim();
    if (!title) { alert('请填写任务标题'); return; }
    t.title = title;
    t.assignee = (document.getElementById('tfAssignee') || {}).value || t.assignee;
    t.priority = (document.getElementById('tfPriority') || {}).value || t.priority;
    t.dueDate = (document.getElementById('tfDue') || {}).value || t.dueDate;
    t.desc = String((document.getElementById('tfDesc') || {}).value || '').trim();
    const prog = Number((document.getElementById('tfProgress') || {}).value);
    if (Number.isFinite(prog)) t.progress = Math.max(0, Math.min(100, prog));
    const hours = Number((document.getElementById('tfHours') || {}).value);
    if (Number.isFinite(hours) && hours >= 0) t.hours = hours;
    state.modal = null;
    state.form = null;
    toast('已保存任务');
    render();
  }

  function abolishTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (!confirm('确认作废任务「' + t.title + '」？')) return;
    t.status = 'abolished';
    toast('已作废：' + t.title);
    if (state.modal && state.modal.taskId === id) state.modal = null;
    render();
  }

  function showMemberKanban(name) {
    state.returnToMemberName = null;
    state.modal = { type: 'memberKanban', memberName: name };
    render();
  }

  function openIntakeModal() {
    state.modal = { type: 'intake' };
    render();
  }

  function closeModal() {
    const back = state.returnToMemberName;
    state.modal = null;
    state.form = null;
    if (back) {
      state.returnToMemberName = null;
      state.modal = { type: 'memberKanban', memberName: back };
    }
    render();
  }

  function submitIntake() {
    const title = document.getElementById('fTitle').value.trim();
    if (!title) { alert('请填写事项标题'); return; }
    const system = document.getElementById('fSystem').value;
    const submitter = document.getElementById('fSubmitter').value;
    const priority = document.getElementById('fPri').value;
    const desc = document.getElementById('fDesc').value.trim();
    const id = 'T-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    state.tasks.unshift(mkTask({
      id, title, projectId: '', assignee: ME.name, status: 'todo', priority,
      type: 'temp', intake: true, submitter, system, desc, dueDate: addDays(1),
    }));
    state.activities.unshift({
      icon: 'fa-file-alt',
      text: `${submitter}提报「${title}」`,
      meta: '表单提报 · 刚刚',
    });
    state.modal = null;
    state.page = 'dashboard';
    render();
    toast('表单已提报 → 工作台新增待办');
  }

  function renderProjectFormModal(isEdit) {
    const f = state.form || {};
    const managers = state.members.map(m => m.name);
    return `
      <div class="modal-mask" onclick="if(event.target===this)closeModal()">
        <div class="modal-box">
          <div class="modal-header">
            <strong><i class="fas fa-folder" style="color:var(--brand);margin-right:8px;"></i>${isEdit ? '编辑项目' : '新建项目'}</strong>
            <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <div class="field"><label>项目名称</label><input class="input" id="pfName" value="${esc(f.name || '')}" placeholder="输入项目名称" /></div>
            <div class="field"><label>项目描述</label><textarea class="textarea" id="pfDesc">${esc(f.desc || '')}</textarea></div>
            <div class="field"><label>负责人</label><select class="select" id="pfManager">${managers.map(n => `<option value="${esc(n)}" ${(f.manager || ME.name) === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
            <div class="field"><label>截止日期</label><input class="input" id="pfEnd" type="date" value="${esc(f.endDate || '')}" /></div>
            ${isEdit ? `<div class="field"><label>状态</label><select class="select" id="pfStatus">
              <option value="planning" ${f.status === 'planning' ? 'selected' : ''}>规划中</option>
              <option value="active" ${f.status === 'active' ? 'selected' : ''}>进行中</option>
              <option value="paused" ${f.status === 'paused' ? 'selected' : ''}>已暂停</option>
              <option value="done" ${f.status === 'done' ? 'selected' : ''}>已完成</option>
            </select></div>` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal()">取消</button>
            <button class="btn btn-primary" onclick="${isEdit ? 'saveProjectEdit()' : 'saveProjectCreate()'}">保存</button>
          </div>
        </div>
      </div>`;
  }

  function renderMemberKanbanModal() {
    const name = state.modal.memberName;
    const member = state.members.find(m => m.name === name);
    if (!member) return '';
    const memberTasks = state.tasks.filter(t => !isMilestoneTask(t) && t.assignee === name && t.status !== 'abolished');
    const todoTasks = memberTasks.filter(t => t.status === 'todo');
    const doingTasks = memberTasks.filter(t => t.status === 'doing');
    const doneTasks = memberTasks.filter(t => t.status === 'done');
    const otherTasks = memberTasks.filter(t => !['todo', 'doing', 'done'].includes(t.status));
    const columns = [
      { key: 'todo', label: '待开始', tasks: todoTasks, color: '#6B7280', icon: 'fa-clock' },
      { key: 'doing', label: '进行中', tasks: doingTasks, color: '#2563EB', icon: 'fa-spinner' },
      { key: 'done', label: '已完成', tasks: doneTasks, color: '#059669', icon: 'fa-check-circle' },
      { key: 'other', label: '其他', tasks: otherTasks, color: '#D97706', icon: 'fa-ellipsis-h' },
    ];
    const weekStart = addDays(-((new Date().getDay() + 6) % 7));
    const weekEnd = addDays(6 - ((new Date().getDay() + 6) % 7));
    return `
      <div class="modal-mask" onclick="if(event.target===this)closeModal()">
        <div class="modal-box" style="max-width:1100px;width:95vw;">
          <div class="modal-header">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="member-kanban-avatar">${esc(member.name.charAt(0))}</div>
                <div>
                  <strong>${esc(member.name)} · 任务看板</strong>
                  <div style="font-size:12px;color:var(--text-light);margin-top:2px;">
                    ${esc(member.dept)} · <span class="role-badge ${roleBadgeClass(member.role)}">${esc(roleDisplayName(member.role))}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">统计周期：${weekStart} ~ ${weekEnd}</div>
                </div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-bottom:20px;">
              <div class="member-kanban-stat"><div class="stat-num">${memberTasks.length}</div><div class="stat-cap">总任务</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#2563EB;">${doingTasks.length}</div><div class="stat-cap">进行中</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#DC2626;">${memberTasks.filter(isOverdue).length}</div><div class="stat-cap">已逾期</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#059669;">${memberTasks.length ? Math.round(doneTasks.length / memberTasks.length * 100) : 0}%</div><div class="stat-cap">完成率</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:var(--brand);">${Math.round(member.hours * 1.1)}h</div><div class="stat-cap">本周原计划</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#E8A84A;">${member.hours}h</div><div class="stat-cap">当周待处理</div></div>
            </div>
            ${memberTasks.length === 0 ? '<div style="text-align:center;padding:48px;color:#9CA3AF;">暂无相关任务</div>' : `
              <div class="kanban-board">
                ${columns.map(col => `
                  <div class="kanban-column">
                    <div class="kanban-column-header" style="border-top:3px solid ${col.color};">
                      <span><i class="fas ${col.icon}" style="color:${col.color};margin-right:6px;"></i>${col.label}</span>
                      <span class="kanban-count">${col.tasks.length}</span>
                    </div>
                    <div class="kanban-column-body">
                      ${col.tasks.length ? col.tasks.map(task => `
                        <div class="kanban-card" onclick="viewTaskFromTeamKanban('${task.id}')" style="${isOverdue(task) ? 'border-color:#FECACA;background:#FFFBFB;' : ''}">
                          <div class="kanban-card-header">
                            <span class="priority-dot priority-${task.priority || 'normal'}"></span>
                            <span class="kanban-card-title">${esc(task.title)}</span>
                            ${task.intake ? '<span class="tag" style="font-size:10px;background:#ECFDF5;color:#059669;">表单</span>' : ''}
                          </div>
                          <div class="kanban-card-meta">
                            <span><i class="fas fa-folder" style="margin-right:4px;"></i>${esc(projectName(task.projectId))}</span>
                            <span style="${isOverdue(task) ? 'color:#DC2626;' : ''}"><i class="fas fa-calendar" style="margin-right:4px;"></i>${esc(task.dueDate || '-')}</span>
                          </div>
                          <div class="kanban-card-footer">
                            ${statusTag(task.status)}
                            <span style="font-size:10px;color:#9CA3AF;">${task.hours || 0}h</span>
                          </div>
                        </div>`).join('') : '<div class="kanban-empty">暂无</div>'}
                    </div>
                  </div>`).join('')}
              </div>`}
          </div>
        </div>
      </div>`;
  }

  function renderModal() {
    if (!state.modal) return '';
    if (state.modal.type === 'intake') {
      return `
        <div class="modal-mask" onclick="if(event.target===this)closeModal()">
          <div class="modal-box">
            <div class="modal-header">
              <strong><i class="fas fa-file-alt" style="color:var(--brand);margin-right:8px;"></i>模拟钉钉 AI 表格提报</strong>
              <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <div class="field"><label>事项标题</label><input class="input" id="fTitle" value="【演示】现场提报 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}" /></div>
              <div class="field"><label>系统</label><select class="select" id="fSystem"><option>NCC</option><option>总账</option><option>其它</option></select></div>
              <div class="field"><label>提单人（财务联系人）</label><select class="select" id="fSubmitter">${state.contacts.map(c => `<option>${esc(c.name)}</option>`).join('')}</select></div>
              <div class="field"><label>优先级</label><select class="select" id="fPri"><option value="important">重要</option><option value="urgent">紧急</option><option value="normal">普通</option></select></div>
              <div class="field"><label>详细说明</label><textarea class="textarea" id="fDesc">来自单文件演示的模拟提报。</textarea></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="closeModal()">取消</button>
              <button class="btn btn-primary" onclick="submitIntake()">提交并进入工作台</button>
            </div>
          </div>
        </div>`;
    }
    if (state.modal.type === 'projectCreate') return renderProjectFormModal(false);
    if (state.modal.type === 'projectEdit') return renderProjectFormModal(true);
    if (state.modal.type === 'memberKanban') return renderMemberKanbanModal();
    if (state.modal.type === 'taskEdit') {
      const f = state.form || {};
      const assignees = state.members.map(m => m.name);
      return `
        <div class="modal-mask" onclick="if(event.target===this)closeModal()">
          <div class="modal-box">
            <div class="modal-header">
              <strong>编辑任务</strong>
              <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <div class="field"><label>任务标题</label><input class="input" id="tfTitle" value="${esc(f.title || '')}" /></div>
              <div class="field"><label>负责人</label><select class="select" id="tfAssignee">${assignees.map(n => `<option value="${esc(n)}" ${f.assignee === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
              <div class="field"><label>优先级</label><select class="select" id="tfPriority">
                <option value="urgent" ${f.priority === 'urgent' ? 'selected' : ''}>紧急</option>
                <option value="important" ${f.priority === 'important' ? 'selected' : ''}>重要</option>
                <option value="normal" ${f.priority === 'normal' ? 'selected' : ''}>普通</option>
              </select></div>
              <div class="field"><label>截止日期</label><input class="input" type="date" id="tfDue" value="${esc(f.dueDate || '')}" /></div>
              <div class="field"><label>进度 %</label><input class="input" type="number" min="0" max="100" id="tfProgress" value="${esc(String(f.progress || 0))}" /></div>
              <div class="field"><label>预计工时</label><input class="input" type="number" min="0" id="tfHours" value="${esc(String(f.hours || 0))}" /></div>
              <div class="field"><label>说明</label><textarea class="textarea" id="tfDesc">${esc(f.desc || '')}</textarea></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="closeModal()">取消</button>
              <button class="btn btn-primary" onclick="saveTaskEdit()">保存</button>
            </div>
          </div>
        </div>`;
    }
    if (state.modal.type === 'task') {
      const t = state.tasks.find(x => x.id === state.modal.taskId);
      if (!t) return '';
      const parent = t.parentId ? state.tasks.find(x => x.id === t.parentId) : null;
      const children = state.tasks.filter(x => x.parentId === t.id && x.status !== 'abolished');
      const backBtn = state.returnToMemberName
        ? `<button class="btn btn-ghost" onclick="closeModal()"><i class="fas fa-arrow-left"></i> 返回看板</button>`
        : `<button class="btn btn-ghost" onclick="closeModal()">关闭</button>`;
      return `
        <div class="modal-mask" onclick="if(event.target===this)closeModal()">
          <div class="modal-box" style="max-width:560px;">
            <div class="modal-header">
              <strong>任务详情</strong>
              <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;">
                ${t.isMilestone ? '<span class="tag" style="background:#EFF6FF;color:#2563EB;"><i class="fas fa-flag"></i>里程碑</span>' : ''}
                ${t.intake ? '<span class="tag" style="background:#ECFDF5;color:#059669;">表单提报</span>' : ''}
                ${t.type === 'temp' ? '<span class="tag tag-temp">临时</span>' : ''}
                ${statusTag(t.status)}
                <span class="tag">${esc((priorityMap[t.priority] || priorityMap.normal).label)}</span>
              </div>
              <div style="font-size:18px;font-weight:700;margin-bottom:10px;">${esc(t.title)}</div>
              <div style="font-size:13px;color:var(--text-muted);line-height:1.8;margin-bottom:12px;">
                项目：${esc(projectName(t.projectId))}<br>
                负责人：${esc(t.assignee)}<br>
                ${t.submitter ? '提单人：' + esc(t.submitter) + '<br>' : ''}
                ${t.system ? '系统：' + esc(t.system) + '<br>' : ''}
                截止：${esc(t.dueDate || '—')}<br>
                预计工时：${t.hours || 0}h<br>
                ${parent ? '上级：' + esc(parent.title) + '<br>' : ''}
                ${t.desc ? '说明：' + esc(t.desc) : ''}
              </div>
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <span style="color:var(--text-muted);">进度</span><span>${t.progress || 0}%</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${t.progress || 0}%;"></div></div>
              </div>
              ${children.length ? `
                <div style="margin-top:8px;">
                  <div style="font-size:12px;font-weight:600;margin-bottom:6px;">子任务（${children.filter(c => c.status === 'done').length}/${children.length}）</div>
                  ${children.map(c => `
                    <div style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;" onclick="viewTask('${c.id}')">
                      ${esc(c.title)} · ${statusTag(c.status)}
                    </div>`).join('')}
                </div>` : ''}
            </div>
            <div class="modal-footer" style="flex-wrap:wrap;">
              ${t.status === 'todo' ? `<button class="btn btn-primary" onclick="updateTaskStatus('${t.id}','doing')"><i class="fas fa-play"></i> 开始</button>` : ''}
              ${t.status === 'doing' ? `<button class="btn btn-warning" onclick="updateTaskStatus('${t.id}','paused')"><i class="fas fa-pause"></i> 暂停</button>` : ''}
              ${t.status === 'doing' ? `<button class="btn btn-success" onclick="updateTaskStatus('${t.id}','done')"><i class="fas fa-check"></i> 完成</button>` : ''}
              ${t.status === 'paused' ? `<button class="btn btn-primary" onclick="updateTaskStatus('${t.id}','doing')"><i class="fas fa-play"></i> 继续</button>` : ''}
              <button class="btn btn-ghost" onclick="editTask('${t.id}')"><i class="fas fa-pen"></i> 编辑</button>
              ${t.status !== 'done' && t.status !== 'abolished' ? `<button class="btn btn-ghost" style="color:#DC2626;" onclick="abolishTask('${t.id}')"><i class="fas fa-trash-alt"></i> 作废</button>` : ''}
              ${backBtn}
            </div>
          </div>
        </div>`;
    }
    return '';
  }

  function renderPage() {
    if (state.page === 'dashboard') return renderWorkbenchHome();
    if (state.page === 'projects') return renderProjects();
    if (state.page === 'projectDetail') return renderProjectDetail();
    if (state.page === 'tasks') return renderTasks();
    if (state.page === 'team') return renderTeam();
    return renderWorkbenchHome();
  }

  function render() {
    const app = document.getElementById('app');
    if (!state.loggedIn) {
      app.innerHTML = renderDingTalkLoginGate();
      return;
    }
    app.innerHTML = `
      <div class="app-layout">
        ${renderSidebar()}
        <div class="main-area">
          ${renderHeader()}
          <div class="main-content">${renderPage()}</div>
        </div>
      </div>
      ${renderModal()}
    `;
  }

  window.enterDemo = enterDemo;
  window.logout = logout;
  window.goTo = goTo;
  window.goBack = goBack;
  window.toggleSettings = toggleSettings;
  window.resetData = () => resetData(false);
  window.openIntakeModal = openIntakeModal;
  window.closeModal = closeModal;
  window.submitIntake = submitIntake;
  window.updateTaskStatus = updateTaskStatus;
  window.viewTask = viewTask;
  window.viewTaskFromTeamKanban = viewTaskFromTeamKanban;
  window.editTask = editTask;
  window.saveTaskEdit = saveTaskEdit;
  window.abolishTask = abolishTask;
  window.viewProject = viewProject;
  window.editProject = editProject;
  window.showProjectModal = showProjectModal;
  window.saveProjectCreate = saveProjectCreate;
  window.saveProjectEdit = saveProjectEdit;
  window.updateProjectStatus = updateProjectStatus;
  window.showMemberKanban = showMemberKanban;
  window.setTeamSort = setTeamSort;
  window.resetProjectFilters = resetProjectFilters;
  window.goToTodoView = goToTodoView;
  window.setTodoListTab = setTodoListTab;
  window.setTodoViewLayout = setTodoViewLayout;
  window.setTaskProjectTab = setTaskProjectTab;
  window.setTaskScopeTab = setTaskScopeTab;
  window.resetTodoFilters = resetTodoFilters;
  window.setTodoPage = setTodoPage;
  window.setTodoPageSize = setTodoPageSize;
  window.handleTodoBoardDrop = handleTodoBoardDrop;
  window.render = render;
  window.state = state;
  window.toast = toast;

  resetData(true);
  render();
})();
