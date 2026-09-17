// ========== 项目列表 ==========
function getProjectListStats(project) {
  const allNodes = tasks.filter(t => t.projectId === project.id && t.status !== 'abolished');
  const mainTasks = getProjectRootTasks(allNodes).filter(isMilestoneTask);
  const projectTasks = allNodes.filter(t => !isMilestoneTask(t));
  const doneTasks = projectTasks.filter(t => t.status === 'done');
  const overdueTasks = projectTasks.filter(t => isOverdue(t));
  const progress = projectTasks.length > 0 ? Math.round(doneTasks.length / projectTasks.length * 100) : 0;
  const mainDone = mainTasks.filter(t => t.status === 'done').length;
  const mainProgress = mainTasks.length > 0 ? Math.round(mainDone / mainTasks.length * 100) : 0;
  return {
    projectTasks,
    mainCount: mainTasks.length,
    mainDone,
    mainProgress,
    total: projectTasks.length,
    done: doneTasks.length,
    overdue: overdueTasks.length,
    progress,
    rootTasks: mainTasks,
  };
}

const PROJECT_ACCENT_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];
const PERSON_AVATAR_COLORS = [
  '#6366F1', '#10B981', '#F59E0B', '#EC4899', '#64748B', '#0EA5E9', '#8B5CF6', '#14B8A6',
];

function hashStringToIndex(str, modulo) {
  const s = String(str || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % Math.max(modulo, 1);
}

function getProjectAccentColor(project) {
  const key = (project && (project.id || project.name)) || '';
  return PROJECT_ACCENT_COLORS[hashStringToIndex(key, PROJECT_ACCENT_COLORS.length)];
}

function getProjectMemberNames(project) {
  if (!project) return [];
  const names = [];
  if (project.manager) names.push(project.manager);
  (project.teamMembers || []).forEach(n => {
    if (n && !names.some(x => isSamePersonName(x, n))) names.push(n);
  });
  return names;
}

function getPersonAvatarColor(name) {
  return PERSON_AVATAR_COLORS[hashStringToIndex(name || '?', PERSON_AVATAR_COLORS.length)];
}

function renderPersonAvatar(name, opts) {
  const sizeClass = opts && opts.large ? ' person-avatar--lg' : '';
  const initial = escapeHtml(String(name || '?').charAt(0) || '?');
  const color = getPersonAvatarColor(name);
  const title = escapeHtml(name || '');
  return `<span class="person-avatar${sizeClass}" style="background:${color};" title="${title}">${initial}</span>`;
}

function renderAvatarStack(names, limit) {
  const list = names || [];
  const max = typeof limit === 'number' ? limit : 3;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return `
    <div class="avatar-stack">
      ${shown.map(n => renderPersonAvatar(n)).join('')}
      ${extra > 0 ? `<span class="avatar-stack-more" title="另有 ${extra} 人">+${extra}</span>` : ''}
    </div>
  `;
}

function renderProjectStatusDot(status) {
  const pst = projectStatusMap[status] || projectStatusMap.active;
  return `<span class="project-status-dot" style="color:${pst.color};">${escapeHtml(pst.label)}</span>`;
}

function renderProjectStatusBadge(project) {
  const endingSoon = isProjectEndingSoon(project);
  let key = project?.status || 'active';
  let label;
  let color;
  let bg;
  if (key === 'active' && endingSoon) {
    label = '临期';
    color = '#BE185D';
    bg = '#FCE7F3';
  } else {
    const pst = projectStatusMap[key] || projectStatusMap.active;
    label = pst.label;
    color = pst.color;
    bg = pst.bg;
  }
  return `<span class="project-card-badge" style="color:${color};background:${bg};">${escapeHtml(label)}</span>`;
}

function formatMilestoneCardDate(milestone) {
  return normalizeDateStr(resolveTaskDueDate(milestone) || milestone?.dueDate || milestone?.planStartDate || '') || '';
}

function getProjectCardPhaseLabel(project) {
  const { current, allDone } = getCurrentAndNextMilestones(project);
  if (allDone) return '全部里程碑已完成';
  if (current) {
    const seq = String(current.milestoneSeq || '').trim();
    const title = String(current.title || '').trim();
    if (seq && title && !title.toUpperCase().startsWith(seq.toUpperCase())) {
      return `${seq} ${title}`;
    }
    return title || seq || '进行中';
  }
  const focus = getProjectFocusFields(project);
  if (focus.currentPhase) return focus.currentPhase;
  return '暂无阶段信息';
}

function renderProjectCardMilestoneItems(project) {
  const { ordered, current, allDone } = getCurrentAndNextMilestones(project);
  const focus = getProjectFocusFields(project);
  if (project.status === 'paused') {
    const reason = focus.blocker || focus.nextPlan || '项目已暂停';
    return {
      title: '暂停原因',
      twoCol: false,
      html: `
        <div class="project-card-ms-item is-warn">
          <i class="fas fa-pause-circle"></i>
          <span class="project-card-ms-name">${escapeHtml(reason)}</span>
        </div>`,
    };
  }
  if (!ordered.length) {
    const next = focus.nextPlan;
    return {
      title: next ? '下一步动作' : '关键里程碑',
      twoCol: false,
      html: next
        ? `<div class="project-card-ms-item is-todo"><i class="far fa-circle"></i><span class="project-card-ms-name">${escapeHtml(next)}</span></div>`
        : `<div class="project-card-ms-item is-muted"><i class="far fa-circle"></i><span class="project-card-ms-name">暂无里程碑</span></div>`,
    };
  }
  const currentId = current && current.id;
  const twoCol = ordered.length >= 4;
  const limit = twoCol ? 8 : 4;
  const html = ordered.slice(0, limit).map(m => {
    const done = m.status === 'done' || m.status === 'archived' || allDone;
    const isCurrent = !done && currentId && m.id === currentId;
    const date = formatMilestoneCardDate(m);
    const title = m.title || m.id || '';
    let icon = 'far fa-circle';
    let mod = 'is-todo';
    if (done) { icon = 'fas fa-check-circle'; mod = 'is-done'; }
    else if (isCurrent) { icon = 'fas fa-circle-notch fa-spin'; mod = 'is-doing'; }
    return `
      <div class="project-card-ms-item ${mod}">
        <i class="${icon}"></i>
        <span class="project-card-ms-name" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        ${date ? `<span class="project-card-ms-date">${escapeHtml(date)}</span>` : ''}
      </div>`;
  }).join('');
  return { title: '关键里程碑', twoCol, html };
}

function renderProjectCardAlert(project) {
  const focus = getProjectFocusFields(project);
  if (focus.blocker && project.status !== 'paused') {
    return `<div class="project-card-alert is-blocker"><i class="fas fa-exclamation-circle"></i><span>${escapeHtml(focus.blocker)}</span></div>`;
  }
  if (isProjectEndingSoon(project) && project.endDate) {
    const d = normalizeDateStr(project.endDate);
    const short = d ? `${Number(d.slice(5, 7))}-${Number(d.slice(8, 10))}截止` : '即将到期';
    return `<div class="project-card-alert is-due"><i class="fas fa-exclamation-circle"></i><span>${escapeHtml(short)}</span></div>`;
  }
  const stats = getProjectListStats(project);
  if (stats.overdue > 0) {
    return `<div class="project-card-alert is-due"><i class="fas fa-exclamation-circle"></i><span>${stats.overdue} 个任务逾期</span></div>`;
  }
  return `<div class="project-card-alert is-empty"></div>`;
}

function isProjectEndingSoon(project) {
  if (!project || isProjectArchived(project) || project.status === 'done' || project.status === 'paused') return false;
  const end = normalizeDateStr(project.endDate);
  if (!end) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(end.replace(/-/g, '/'));
  if (Number.isNaN(endDate.getTime())) return false;
  const diff = (endDate - today) / 86400000;
  return diff >= 0 && diff <= 7;
}

function renderProjectListCard(project) {
  const stats = getProjectListStats(project);
  const phase = getProjectCardPhaseLabel(project);
  const ms = renderProjectCardMilestoneItems(project);
  const progress = stats.mainCount > 0 ? stats.mainProgress : stats.progress;
  return `
    <div class="project-card project-card--dash" onclick="viewProject('${project.id}')">
      <div class="project-card-dash-head">
        <div class="project-card-name" title="${escapeHtml(project.name || '')}">${escapeHtml(project.name || '')}</div>
        ${renderProjectStatusBadge(project)}
      </div>
      <div class="project-card-phase">当前阶段：${escapeHtml(phase)}</div>
      <div class="project-card-progress-block">
        <div class="project-card-progress-label">
          <span>项目进度</span>
          <span class="progress-pct">${progress}%</span>
        </div>
        <div class="progress-bar project-card-progress-bar">
          <div class="progress-fill" style="width:${progress}%;"></div>
        </div>
      </div>
      <div class="project-card-ms-block">
        <div class="project-card-ms-title">${escapeHtml(ms.title)}</div>
        <div class="project-card-ms-list${ms.twoCol ? ' is-two-col' : ''}">${ms.html}</div>
      </div>
      <div class="project-card-dash-foot">
        ${renderProjectCardAlert(project)}
        <button type="button" class="project-card-detail-link" onclick="event.stopPropagation();viewProject('${project.id}')">查看详情</button>
      </div>
    </div>
  `;
}

function renderProjectIconTile(project, size) {
  const color = getProjectAccentColor(project);
  const ch = escapeHtml(String(project.name || '?').charAt(0) || '?');
  const style = size === 'lg'
    ? `background:${color};width:48px;height:48px;font-size:18px;border-radius:14px;`
    : `background:${color};`;
  return `<div class="project-card-icon-tile" style="${style}">${ch}</div>`;
}

function toggleProjectExpand(projectId) {
  state.projectExpandedId = state.projectExpandedId === projectId ? null : projectId;
  render();
}

function sortProjectsByName(list) {
  return [...(list || [])].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  );
}

function buildPlanVisibleTaskIds(projectTasks, scope) {
  if (scope !== 'mine') return new Set(projectTasks.map(t => t.id));
  const idSet = new Set(projectTasks.map(t => t.id));
  const mineIds = new Set(
    getMyRelatedTasks().filter(t => idSet.has(t.id)).map(t => t.id)
  );
  const keep = new Set(mineIds);
  const byId = new Map(projectTasks.map(t => [t.id, t]));
  mineIds.forEach(id => {
    let t = byId.get(id);
    while (t && t.parentId && byId.has(t.parentId) && t.parentId !== t.id) {
      keep.add(t.parentId);
      t = byId.get(t.parentId);
    }
  });
  return { keepIds: keep, mineIds };
}

function getPlanRootTasks(project, milestoneId, scope) {
  const allProjectTasks = tasks.filter(t => t.projectId === project.id && t.status !== 'abolished');
  const { keepIds, mineIds } = scope === 'mine'
    ? buildPlanVisibleTaskIds(allProjectTasks, 'mine')
    : { keepIds: new Set(allProjectTasks.map(t => t.id)), mineIds: null };
  // 我的任务视图：若某里程碑下有我的任务，保留该里程碑作为分组头
  if (scope === 'mine') {
    allProjectTasks.filter(isMilestoneTask).forEach(m => {
      if (allProjectTasks.some(t => !isMilestoneTask(t) && keepIds.has(t.id) && getTaskBreadcrumb(t.id).some(a => a.id === m.id))) {
        keepIds.add(m.id);
      }
    });
  }
  const visibleTasks = allProjectTasks.filter(t => keepIds.has(t.id));
  let rootTasks = getProjectRootTasks(allProjectTasks).filter(t => isMilestoneTask(t) && keepIds.has(t.id));
  if (milestoneId) {
    rootTasks = rootTasks.filter(t => t.id === milestoneId);
  }
  return { allProjectTasks, visibleTasks, rootTasks, mineIds, keepIds };
}

function getProjectChangeLogs(project) {
  if (!project) return [];
  const name = project.name;
  const id = project.id;
  const taskIds = new Set(tasks.filter(t => t.projectId === id).map(t => t.id));
  return changeLogs.filter(l => {
    if (l.projectId && l.projectId === id) return true;
    if (l.project && (l.project === name || l.project === id)) return true;
    if (l.taskId && taskIds.has(l.taskId)) return true;
    return false;
  });
}

function setProjectChangePage(page) {
  state.projectChangePage = Math.max(1, Number(page) || 1);
  render();
}

function renderProjectChangeLogsSection(project) {
  const logs = getProjectChangeLogs(project);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  if (state.projectChangePage > totalPages) state.projectChangePage = totalPages;
  if (state.projectChangePage < 1) state.projectChangePage = 1;
  const page = state.projectChangePage || 1;
  const pageRows = logs.slice((page - 1) * pageSize, page * pageSize);
  const pageButtons = [];
  for (let i = 1; i <= totalPages && i <= 7; i++) {
    pageButtons.push(`<button type="button" class="todo-page-btn${i === page ? ' active' : ''}" onclick="setProjectChangePage(${i})">${i}</button>`);
  }
  return `
    <section style="margin-top:16px;">
      <h3 class="project-detail-section-title">项目变更</h3>
      <div class="todo-table-card">
        <div class="todo-table-wrap">
          <table class="todo-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>操作人</th>
                <th>操作时间</th>
                <th>修改前</th>
                <th>修改后</th>
                <th>修改原因</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length ? pageRows.map(l => `
                <tr ${l.taskId ? `onclick="viewTask('${l.taskId}')" style="cursor:pointer;"` : ''}>
                  <td>${escapeHtml(tasks.find(t => t.id === l.taskId)?.title || l.taskId || '-')}</td>
                  <td>${escapeHtml(l.operator || '-')}</td>
                  <td>${escapeHtml(l.operateTime || '-')}</td>
                  <td><span style="color:#DC2626;white-space:pre-line;">${escapeHtml(formatLogCell(l.before))}</span></td>
                  <td><span style="color:#059669;white-space:pre-line;">${escapeHtml(formatLogCell(l.after))}</span></td>
                  <td style="max-width:200px;word-break:break-all;">${escapeHtml(l.reason || '-')}</td>
                </tr>
              `).join('') : `<tr><td colspan="6">${renderEmptyState({ icon: 'fa-exchange-alt', title: '暂无变更记录', hint: '任务修改后会出现在此' })}</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="todo-pager">
          <div class="todo-pager-info">共 ${logs.length} 条</div>
          ${logs.length > pageSize ? `
          <div class="todo-pager-controls">
            <button type="button" class="todo-page-btn" ${page <= 1 ? 'disabled' : ''} onclick="setProjectChangePage(${page - 1})"><i class="fas fa-chevron-left"></i></button>
            ${pageButtons.join('')}
            <button type="button" class="todo-page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="setProjectChangePage(${page + 1})"><i class="fas fa-chevron-right"></i></button>
          </div>` : ''}
        </div>
      </div>
    </section>
  `;
}

/** 任务所属里程碑（祖先链中最近的里程碑） */
function getOwningMilestone(task) {
  if (!task) return null;
  const chain = getTaskBreadcrumb(task.id);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (isMilestoneTask(chain[i])) return chain[i];
  }
  return null;
}

/** 项目下里程碑列表（排除作废） */
function getProjectMilestones(project) {
  if (!project) return [];
  const all = tasks.filter(t => t.projectId === project.id && t.status !== 'abolished');
  return getProjectRootTasks(all)
    .filter(isMilestoneTask)
    .slice()
    .sort((a, b) => {
      const sa = String(a.milestoneSeq || '').trim();
      const sb = String(b.milestoneSeq || '').trim();
      const na = (sa.match(/(\d+)/) || [])[1];
      const nb = (sb.match(/(\d+)/) || [])[1];
      if (na != null && nb != null && Number(na) !== Number(nb)) return Number(na) - Number(nb);
      if (sa && sb && sa !== sb) return sa.localeCompare(sb, 'zh');
      const da = normalizeDateStr(resolveTaskDueDate(a)) || a.dueDate || '';
      const db = normalizeDateStr(resolveTaskDueDate(b)) || b.dueDate || '';
      if (da && db && da !== db) return da.localeCompare(db);
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh');
    });
}

/** 项目下普通任务（平铺，按里程碑分组再树序） */
function getProjectWorkTasksFlat(project) {
  if (!project) return [];
  const all = tasks.filter(t => t.projectId === project.id && t.status !== 'abolished' && !isMilestoneTask(t));
  const milestones = getProjectMilestones(project);
  const ordered = [];
  const pushTree = (parentId) => {
    all
      .filter(t => (t.parentId || null) === parentId)
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'))
      .forEach(t => {
        ordered.push(t);
        pushTree(t.id);
      });
  };
  milestones.forEach(m => pushTree(m.id));
  // 无里程碑父级的散落任务
  all.forEach(t => {
    if (!ordered.some(x => x.id === t.id)) ordered.push(t);
  });
  return ordered;
}
