// ========== 人员档案 ==========
function getStaffDeptOptions() {
  return getStaffDeptNames();
}

function canAccessStaffPage() {
  return capOn(currentUser, 'nav.staff');
}

/** 人员档案 / 团队管理的数据范围：部门经理仅本部门；默认排除通知联系人 */
function getDeptScopeUsers(includeInactive = false, opts = {}) {
  const includeContacts = !!opts.includeContacts;
  let pool = includeInactive ? users : activeUsers();
  if (!includeContacts) pool = pool.filter(u => !isContactProfile(u));
  if (isFullAccess(currentUser.role)) return pool;
  if (currentUser.role === 'manager') return pool.filter(u => u.dept === currentUser.dept);
  return [];
}

function getDeptFilterTabs(opts = {}) {
  const memberOnly = !!opts.memberOnly;
  const showInactive = !!state.staffShowInactive;
  let pool = showInactive ? users : activeUsers();
  if (memberOnly) pool = pool.filter(u => !isContactProfile(u));
  const deptNames = memberOnly
    ? getMemberDeptNames()
    : getStaffDeptOptions();
  if (isFullAccess(currentUser.role)) {
    return [
      { id: 'all', label: '全部', count: pool.length, icon: 'fa-globe' },
      ...deptNames.map(dept => ({
        id: dept,
        label: dept,
        count: pool.filter(u => u.dept === dept).length,
        icon: catalogKindForDept(dept) === 'contact' ? 'fa-address-book' : '',
        kind: catalogKindForDept(dept),
      })),
    ];
  }
  if (currentUser.role === 'manager') {
    const dept = currentUser.dept;
    return [{
      id: dept,
      label: dept,
      count: pool.filter(u => u.dept === dept).length,
      icon: 'fa-building',
    }];
  }
  return [];
}

// 判断是否有编辑权限
function canEditStaff(targetUser) {
  const mode = resolveCap(currentUser, 'staff.edit');
  if (mode === 'all') return true;
  if (mode === 'dept_staff') {
    return !isContactProfile(targetUser) &&
      targetUser.dept === currentUser.dept &&
      targetUser.role === 'staff';
  }
  return false;
}

/** 仅可全员编辑人员档案的角色可停用/恢复；不可停用自己 */
function canToggleStaffActive(targetUser) {
  if (!targetUser || resolveCap(currentUser, 'staff.edit') !== 'all') return false;
  if (targetUser.id === currentUser.id) return false;
  return true;
}

/** 上级候选：默认同部门业务成员；部门经理额外可选总经理 */
function getLeaderCandidatesForStaff(targetUser = {}) {
  const selfId = targetUser.id || targetUser.userId || state.form?.userId;
  const dept = state.form?.dept || targetUser.dept;
  const role = state.form?.role || targetUser.role;
  const pool = businessUsers().filter(u => u.id !== selfId);
  const byId = new Map();
  pool.filter(u => u.dept === dept).forEach(u => byId.set(u.id, u));
  if (role === 'manager') {
    pool.filter(u => u.role === 'gm').forEach(u => byId.set(u.id, u));
  }
  const currentLeaderId = state.form?.leaderId || targetUser.leaderId;
  if (currentLeaderId && !byId.has(currentLeaderId)) {
    const cur = users.find(u => u.id === currentLeaderId);
    if (cur) byId.set(cur.id, cur);
  }
  return [...byId.values()];
}

function toggleStaffActive(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;
  if (!canToggleStaffActive(user)) {
    alert(user.id === currentUser.id ? '不能停用当前登录账号' : '仅总经理/管理员可停用或恢复人员');
    return;
  }
  const willDisable = isStaffActive(user);
  const tip = willDisable
    ? `确定停用「${user.name}」？\n停用后不可登录，也不会出现在任务分配人选中；历史任务仍保留。可通过「显示已停用」找回并恢复。`
    : `确定恢复「${user.name}」为在职？`;
  if (!confirm(tip)) return;

  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return;
  users[idx] = { ...users[idx], active: !willDisable };
  if (Array.isArray(allStaffUsers)) {
    allStaffUsers = allStaffUsers.map(u => (u.id === userId ? { ...u, active: !willDisable } : u));
  }
  save();
  state.syncFeedback = {
    type: 'success',
    message: willDisable ? `已停用 ${user.name}` : `已恢复 ${user.name}`,
    updated: 1,
    skipped: 0,
    names: [willDisable ? `停用 ${user.name}` : `恢复 ${user.name}`],
  };
  if (willDisable) state.staffShowInactive = true;
  render();
}

/** 允许多名部门经理的部门（如信息中心），不设经理时不自动降级原经理 */
const MULTI_MANAGER_DEPTS = ['信息中心'];

/**
 * 指定人员为部门经理后：本部门执行人员/管理员的上级批量指向该经理；
 * 单经理部门内原部门经理自动降为执行人员并归入新经理。
 * @returns {number} 实际变更人数
 */
function syncDeptStaffLeadersToManager(dept, managerId) {
  if (!dept || !managerId) return 0;
  const allowMultiManager = MULTI_MANAGER_DEPTS.includes(dept);
  let count = 0;
  users = users.map(u => {
    if (u.dept !== dept || u.id === managerId) return u;
    if (u.role === 'staff' || u.role === 'admin') {
      if (u.leaderId === managerId) return u;
      count++;
      return { ...u, leaderId: managerId };
    }
    if (!allowMultiManager && u.role === 'manager') {
      count++;
      return {
        ...u,
        role: 'staff',
        position: u.position === '部门经理' ? '执行人员' : u.position,
        leaderId: managerId,
      };
    }
    return u;
  });
  allStaffUsers = allStaffUsers.map(u => users.find(x => x.id === u.id) || u);
  return count;
}

function canCreateSubTask(task) {
  if (!task || task.type === 'temp' || !task.projectId) return false;
  if (task.status === 'archived' || task.status === 'abolished') return false;
  const project = projects.find(p => p.id === task.projectId);
  if (!project || isProjectArchived(project)) return false;
  if (isMilestoneTask(task)) {
    return isFullAccess(currentUser.role) || canManageProject(project);
  }
  if (isFullAccess(currentUser.role)) return true;
  if (canManageProject(project)) return true;
  if (task.assignee === currentUser.name) return true;
  return false;
}

function getTaskDepth(taskId) {
  let depth = 1;
  let t = tasks.find(x => x.id === taskId);
  while (t && t.parentId) {
    depth++;
    t = tasks.find(x => x.id === t.parentId);
  }
  return depth;
}

function getTaskBreadcrumb(taskId) {
  const chain = [];
  let t = tasks.find(x => x.id === taskId);
  while (t) {
    chain.unshift(t);
    t = t.parentId ? tasks.find(x => x.id === t.parentId) : null;
  }
  return chain;
}

// 判断是否可以操作任务（拆解、编辑、推进状态）
function canOperateTask(task) {
  return canEditTask(task);
}

// 检查下级任务是否都已失效（已完成或已作废）
function allChildrenInvalidated(taskId) {
  const children = tasks.filter(t => t.parentId === taskId);
  if (children.length === 0) return true; // 没有子任务，可以操作
  return children.every(t => t.status === 'done' || t.status === 'abolished');
}

// 检查是否有未完成的下级任务
function hasActiveChildren(taskId) {
  const children = tasks.filter(t => t.parentId === taskId);
  return children.some(t => t.status !== 'done' && t.status !== 'abolished');
}

// 计算下级任务已分配的总工时（所有子任务，无论内部外部）
function getChildrenAllocatedHours(taskId) {
  const children = tasks.filter(t => t.parentId === taskId && t.status !== 'abolished');
  return children.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
}

// 计算下级任务的内部工时（信息中心部门人员做的）
function getChildrenInternalHours(taskId) {
  const children = tasks.filter(t => t.parentId === taskId && t.status !== 'abolished');
  const internalChildren = children.filter(t => {
    const assigneeUser = users.find(u => u.name === t.assignee);
    return assigneeUser && assigneeUser.dept === '信息中心';
  });
  return internalChildren.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
}

// 计算下级任务的外部工时（非信息中心部门人员做的）
function getChildrenExternalHours(taskId) {
  const children = tasks.filter(t => t.parentId === taskId && t.status !== 'abolished');
  const externalChildren = children.filter(t => {
    const assigneeUser = users.find(u => u.name === t.assignee);
    return !assigneeUser || assigneeUser.dept !== '信息中心';
  });
  return externalChildren.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
}

// 计算上级任务剩余可分配工时
function getRemainingHours(taskId) {
  const parentTask = tasks.find(t => t.id === taskId);
  if (!parentTask) return 0;
  const allocated = getChildrenAllocatedHours(taskId);
  return Math.max(0, (parentTask.estimatedHours || 0) - allocated);
}

// 检查子任务工时是否超过上级任务（所有子任务工时总和不能超过）
function checkChildrenHoursExceeded(taskId, newChildHours = 0, excludeChildId = null) {
  const parentTask = tasks.find(t => t.id === taskId);
  if (!parentTask) return false;

  const children = tasks.filter(t => t.parentId === taskId && t.status !== 'abolished' && t.id !== excludeChildId);
  const currentAllocated = children.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const totalAllocated = currentAllocated + newChildHours;

  return totalAllocated > (parentTask.estimatedHours || 0);
}

/** 子任务相对上级任务的工时预算信息 */
function getChildHoursBudgetInfo(parentId, excludeChildId, proposedHours) {
  const parentTask = tasks.find(t => t.id === parentId);
  if (!parentTask) return null;
  const otherChildrenHours = tasks
    .filter(t => t.parentId === parentId && t.status !== 'abolished' && t.id !== excludeChildId)
    .reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const proposed = Number(proposedHours) || 0;
  const totalAllocated = otherChildrenHours + proposed;
  const parentHours = parentTask.estimatedHours || 0;
  return {
    parentTask,
    parentHours,
    otherChildrenHours,
    proposed,
    totalAllocated,
    remaining: parentHours - otherChildrenHours,
    overflow: totalAllocated - parentHours,
    minParentHours: totalAllocated,
  };
}

function renderChildHoursBudgetHint(parentId, excludeChildId, proposedHours) {
  const info = getChildHoursBudgetInfo(parentId, excludeChildId, proposedHours);
  if (!info) return '';
  const { parentTask, parentHours, otherChildrenHours, proposed, totalAllocated, remaining, overflow, minParentHours } = info;
  const overflowHtml = overflow > 0
    ? `<div style="margin-top:6px;padding:6px 8px;background:#FEF2F2;border-radius:6px;color:#DC2626;line-height:1.5;">
        <i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>
        子任务合计 ${totalAllocated}h，超出上级 ${overflow}h。请编辑上级任务「${escapeHtml(parentTask.title)}」，将预计工时调整为至少 <strong>${minParentHours}h</strong> 后再保存。
      </div>`
    : '';
  return `
    <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">
      上级「${escapeHtml(parentTask.title)}」总工时：${parentHours}h | 其他子任务：${otherChildrenHours}h | 剩余可分配：<span style="color:${remaining < 0 ? '#DC2626' : '#059669'};font-weight:500;">${remaining}h</span>
      ${overflowHtml}
    </div>`;
}

function renderParentHoursBudgetHint(taskId, proposedParentHours) {
  const allocated = getChildrenAllocatedHours(taskId);
  if (allocated <= 0) return '';
  const parentH = Number(proposedParentHours) || 0;
  const gap = allocated - parentH;
  if (gap > 0) {
    return `<div id="parentHoursBudgetHint" style="font-size:11px;color:#DC2626;margin-top:4px;padding:6px 8px;background:#FEF2F2;border-radius:6px;line-height:1.5;">
      <i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>
      子任务已分配 ${allocated}h，超过当前预计 ${parentH}h（缺 ${gap}h）。请将预计工时调整为至少 <strong>${allocated}h</strong>。
    </div>`;
  }
  return `<div id="parentHoursBudgetHint" style="font-size:11px;color:#9CA3AF;margin-top:4px;">
    子任务已分配 ${allocated}h，剩余可分配 <span style="color:#059669;font-weight:500;">${parentH - allocated}h</span>
  </div>`;
}

function refreshChildHoursBudgetHint() {
  const el = document.getElementById('childHoursBudgetHint');
  if (!el || !state.form.parentId) return;
  el.innerHTML = renderChildHoursBudgetHint(state.form.parentId, state.form.id || null, state.form.estimatedHours);
}

function refreshParentHoursBudgetHint() {
  const el = document.getElementById('parentHoursBudgetHint');
  if (!el || !state.form.id || state.form.parentId) return;
  const html = renderParentHoursBudgetHint(state.form.id, state.form.estimatedHours);
  if (html) el.outerHTML = html;
}

// 判断任务是否是外部工时（非信息中心部门人员）
function isExternalTask(assignee) {
  const assigneeUser = users.find(u => u.name === assignee);
  return !assigneeUser || assigneeUser.dept !== '信息中心';
}

// 判断是否可以作废任务
function canAbolishTask(task) {
  if (isFullAccess(currentUser.role)) return true;
  if (isTaskProjectManager(task)) return true;
  if (task.creator === currentUser.name) return true;
  return false;
}
