// ========== 基础数据 ==========
/** 缺省业务部门（与后端 defaultStaffDeptCatalog 一致）；运行时以 staffDeptCatalog 为准 */
const DEFAULT_MEMBER_DEPT_NAMES = ['信息中心', '规划建设部', '实施交付部', '研发集成部', '网络运维部', '项目管控部', 'AI创新部'];
const INFO_CENTER_DEPT_NAME = '信息中心';
let staffDeptCatalog = DEFAULT_MEMBER_DEPT_NAMES.map(name => ({
  name,
  kind: 'member',
  parentName: name === INFO_CENTER_DEPT_NAME ? '' : INFO_CENTER_DEPT_NAME,
}));

function normalizeProfileKind(kind) {
  return 'member';
}
function isContactProfile(u) {
  return false;
}
function isBusinessMember(u) {
  return !!(u && isStaffActive(u));
}
function getStaffDeptCatalog() {
  return (staffDeptCatalog || []).length
    ? staffDeptCatalog
    : DEFAULT_MEMBER_DEPT_NAMES.map(name => ({
      name,
      kind: 'member',
      parentName: name === INFO_CENTER_DEPT_NAME ? '' : INFO_CENTER_DEPT_NAME,
    }));
}
function getStaffDeptNames() {
  return getStaffDeptCatalog().map(d => d.name);
}
/** 业务部门名（项目归属等）；兼容旧代码 departments */
function getMemberDeptNames() {
  const members = getStaffDeptCatalog().filter(d => d.kind === 'member').map(d => d.name);
  return members.length ? members : DEFAULT_MEMBER_DEPT_NAMES.slice();
}
function catalogKindForDept(deptName) {
  return 'member';
}
function applyStaffDeptCatalog(list) {
  if (!Array.isArray(list) || !list.length) return;
  const byName = new Map();
  list.forEach(raw => {
    const name = String(raw?.name || raw || '').trim();
    if (!name) return;
    let parentName = raw?.parentName != null ? String(raw.parentName).trim() : '';
    if (!parentName && name !== INFO_CENTER_DEPT_NAME && DEFAULT_MEMBER_DEPT_NAMES.includes(name)) {
      parentName = INFO_CENTER_DEPT_NAME;
    }
    byName.set(name, {
      name,
      kind: 'member',
      parentName,
      dingTalkDeptId: raw?.dingTalkDeptId || '',
    });
  });
  if (byName.size) staffDeptCatalog = [...byName.values()];
}
/** 部门森林：根节点 + children */
function buildClientOrgForest(catalog) {
  const list = (catalog && catalog.length) ? catalog : getStaffDeptCatalog();
  const byName = new Map(list.map(d => [d.name, { ...d, children: [] }]));
  const roots = [];
  byName.forEach(node => {
    const p = node.parentName;
    if (p && byName.has(p) && p !== node.name) byName.get(p).children.push(node);
    else roots.push(node);
  });
  const sortNodes = (arr) => {
    arr.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'member' ? -1 : 1;
      if (a.name === INFO_CENTER_DEPT_NAME) return -1;
      if (b.name === INFO_CENTER_DEPT_NAME) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    arr.forEach(n => sortNodes(n.children || []));
  };
  sortNodes(roots);
  return roots;
}
/** @deprecated 请优先用 getMemberDeptNames / getStaffDeptNames；保留数组引用兼容旧写法 */
const departments = DEFAULT_MEMBER_DEPT_NAMES.slice();
function syncDepartmentsAlias() {
  departments.length = 0;
  getMemberDeptNames().forEach(n => departments.push(n));
}
syncDepartmentsAlias();

/** 总经理与管理员权限相同，展示名称不同 */
function isFullAccess(role) {
  return role === 'gm' || role === 'admin';
}
function isStaffActive(u) {
  return !u || u.active !== false;
}
/** 钉钉备用号账号：不同步，团队管理不展示 */
function isSpareAccountName(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  return n.includes('备用号') || n.endsWith('备用') || /备用\d+$/.test(n);
}
function isSpareAccount(u) {
  return !!(u && isSpareAccountName(u.name));
}
function activeUsers() {
  return users.filter(u => isStaffActive(u) && !isSpareAccount(u));
}
/** 可登录、可分派任务的在职人员（钉钉通讯录全员） */
function businessUsers(includeInactive = false) {
  const pool = includeInactive ? users : activeUsers();
  return pool;
}
/** 与钉钉长名/短名兼容：王元斌 ≈ 王元斌 Martin */
function personNameCore(name) {
  const first = String(name || '').trim().split(/\s+/)[0];
  if (!first) return '';
  const dash = first.indexOf('-');
  return dash > 0 ? first.slice(0, dash) : first;
}
function isSamePersonName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = personNameCore(a);
  const cb = personNameCore(b);
  return !!ca && ca === cb;
}
function roleDisplayName(role) {
  if (role === 'gm') return '总经理';
  if (role === 'admin') return '管理员';
  if (role === 'manager') return '部门经理';
  return '执行人员';
}
function roleBadgeClass(role) {
  if (role === 'gm') return 'role-gm';
  if (role === 'admin') return 'role-admin';
  if (role === 'manager') return 'role-manager';
  return 'role-staff';
}

const INFO_CENTER_DEPT = '信息中心';
const KPI_DEPT_NAME = '实施交付部';
const KPI_DEPT_PMO_NAME = '项目管控部';
const KPI_DEPT_NAMES = [KPI_DEPT_NAME, KPI_DEPT_PMO_NAME];

/** 与后端 services/permissions.js 默认矩阵对齐 */
const DEFAULT_ROLE_PERMISSIONS = {
  full: {
    'nav.team': 'on', 'nav.staff': 'on', 'nav.permissions': 'on', 'nav.archive': 'on',
    'nav.import': 'on', 'nav.systemUpdates': 'on', 'nav.ncc': 'on', 'nav.dataSecurity': 'on',
    'nav.sqlTools': 'on', 'nav.textPolish': 'on', 'projects.view': 'all', 'projects.manage': 'all', 'projects.create': 'on',
    'projects.delete': 'on', 'tasks.deptScope': 'on', 'staff.edit': 'all', 'staff.dingSync': 'on',
    'kpi.viewAll': 'on', 'display.company': 'on',
  },
  manager: {
    'nav.team': 'on', 'nav.staff': 'on', 'nav.permissions': 'on', 'nav.archive': 'on',
    'nav.import': 'on', 'nav.systemUpdates': 'on', 'nav.ncc': 'off', 'nav.dataSecurity': 'off',
    'nav.sqlTools': 'off', 'nav.textPolish': 'off', 'projects.view': 'all', 'projects.manage': 'own', 'projects.create': 'on',
    'projects.delete': 'off', 'tasks.deptScope': 'on', 'staff.edit': 'dept_staff', 'staff.dingSync': 'off',
    'kpi.viewAll': 'on', 'display.company': 'off',
  },
  staff: {
    'nav.team': 'off', 'nav.staff': 'off', 'nav.permissions': 'off', 'nav.archive': 'off',
    'nav.import': 'off', 'nav.systemUpdates': 'on', 'nav.ncc': 'off', 'nav.dataSecurity': 'off',
    'nav.sqlTools': 'off', 'nav.textPolish': 'off', 'projects.view': 'related', 'projects.manage': 'own', 'projects.create': 'on',
    'projects.delete': 'off', 'tasks.deptScope': 'off', 'staff.edit': 'none', 'staff.dingSync': 'off',
    'kpi.viewAll': 'off', 'display.company': 'off',
  },
};

const PERM_CAP_DEFS = [
  { key: 'nav.team', label: '团队管理', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.staff', label: '人员档案', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.permissions', label: '权限管理', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.dataSecurity', label: '数据安全', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.archive', label: '归档管理', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.import', label: '数据导入', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.systemUpdates', label: '更新记录', group: '菜单入口', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.ncc', label: 'NCC异常看板', group: '侧栏能力', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.sqlTools', label: 'SQL脚本生成', group: '侧栏能力', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'nav.textPolish', label: '文案润色', group: '侧栏能力', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'projects.view', label: '项目可见范围', group: '项目', values: ['all', 'related'], valueLabels: { all: '全公司', related: '仅相关' } },
  { key: 'projects.manage', label: '项目管理', group: '项目', values: ['all', 'own', 'none'], valueLabels: { all: '全部可管', own: '本人负责', none: '不可管' } },
  { key: 'projects.create', label: '新建项目', group: '项目', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
  { key: 'projects.delete', label: '删除项目', group: '项目', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
  { key: 'tasks.deptScope', label: '任务中心·部门页签', group: '任务', values: ['on', 'off'], valueLabels: { on: '可见', off: '隐藏' } },
  { key: 'staff.edit', label: '人员档案编辑', group: '组织', values: ['all', 'dept_staff', 'none'], valueLabels: { all: '全员', dept_staff: '本部门执行人员', none: '不可编辑' } },
  { key: 'staff.dingSync', label: '钉钉通讯录同步', group: '组织', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
  { key: 'kpi.viewAll', label: 'KPI 查看全部部门', group: 'KPI', values: ['on', 'off'], valueLabels: { on: '允许', off: '仅本人' } },
  { key: 'display.company', label: '滚动大屏（全公司）', group: '展示', values: ['on', 'off'], valueLabels: { on: '允许', off: '禁止' } },
];

function permRoleBucket(role) {
  if (isFullAccess(role) || role === 'full') return 'full';
  if (role === 'manager') return 'manager';
  return 'staff';
}

function getActiveRolePermissions() {
  return state.rolePermissions || DEFAULT_ROLE_PERMISSIONS;
}

function resolveCap(userOrRole, key) {
  const role = typeof userOrRole === 'object' ? userOrRole?.role : userOrRole;
  const bucket = permRoleBucket(role || currentUser?.role);
  const matrix = getActiveRolePermissions();
  const def = PERM_CAP_DEFS.find(d => d.key === key);
  const v = matrix?.[bucket]?.[key];
  if (def && def.values.includes(v)) return v;
  return DEFAULT_ROLE_PERMISSIONS[bucket]?.[key] ?? null;
}

function capOn(userOrRole, key) {
  return resolveCap(userOrRole, key) === 'on';
}

function canAccessPermissionsPage(user = currentUser) {
  return !!user?.id && capOn(user, 'nav.permissions');
}

function canEditPermissionsMatrix(user = currentUser) {
  return !!user?.id && isFullAccess(user.role);
}

/** 实施交付部/项目管控部成员，或部门经理/管理员/总经理 */
function canAccessKpiPlans(user = currentUser) {
  if (!user?.id || isContactProfile(user)) return false;
  return isFullAccess(user.role) || user.role === 'manager' || KPI_DEPT_NAMES.includes(user.dept);
}

/** 部门经理/管理员/总经理可查看全部部门计划（可由矩阵 kpi.viewAll 覆盖） */
function canViewAllKpiPlans(user = currentUser) {
  return canAccessKpiPlans(user) && capOn(user, 'kpi.viewAll');
}

function isInfoCenterMember(user = currentUser) {
  return !!(user && user.dept === INFO_CENTER_DEPT);
}

function canViewAllProjects(user = currentUser) {
  if (!user?.id) return false;
  return resolveCap(user, 'projects.view') === 'all';
}

/** 是否与项目相关（负责人/创建人/团队成员，或参与其下任务） */
function isRelatedToProject(project) {
  if (!project) return false;
  if (isSamePersonName(project.manager, currentUser.name) || isSamePersonName(project.creator, currentUser.name)) return true;
  if (Array.isArray(project.teamMembers) && project.teamMembers.some(n => isSamePersonName(n, currentUser.name))) return true;
  return getMyRelatedTasks().some(t => t.projectId === project.id);
}

/** 当前用户可查看的项目（未归档） */
function getViewableProjects() {
  const all = getAllActiveProjects();
  if (canViewAllProjects()) return all;
  return all.filter(p => isRelatedToProject(p));
}

/** 当前用户可查看的已归档项目 */
function getViewableArchivedProjects() {
  const all = projects.filter(p => isProjectArchived(p));
  if (canViewAllProjects()) return all;
  return all.filter(p => isRelatedToProject(p));
}

function canViewProject(project) {
  if (!project) return false;
  if (canViewAllProjects()) return true;
  return isRelatedToProject(project);
}

/** 能否打开任务详情（查看） */
function canViewTask(task) {
  if (!task) return false;
  if (task.type === 'temp' && !task.projectId) {
    return isRelatedToTask(task);
  }
  if (task.projectId) {
    const project = projects.find(p => p.id === task.projectId);
    if (project) return canViewProject(project);
    return isRelatedToTask(task);
  }
  return isRelatedToTask(task);
}

function getProjectsPageIntro() {
  const count = getViewableProjects().length;
  let base;
  if (isFullAccess(currentUser.role)) {
    base = '管理全公司项目与任务。';
  } else if (currentUser.role === 'manager') {
    base = '查看全公司项目与任务；可管理本人负责的项目。';
  } else {
    base = '仅显示与您相关的项目（负责人、成员或参与任务）。';
  }
  return `${base}（当前 ${count} 个未归档项目）`;
}

async function refreshProjectsFromServer() {
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后刷新');
    return;
  }
  const ok = await DataService.loadFromServer();
  render();
  if (ok) {
    alert(`已从服务端刷新，当前 ${getViewableProjects().length} 个未归档项目`);
  } else {
    alert('刷新失败，请检查网络或联系管理员');
  }
}

async function mergeSeedFromServer() {
  if (!isFullAccess(currentUser.role)) {
    alert('仅总经理/管理员可执行');
    return;
  }
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后操作');
    return;
  }
  if (!confirm('将把系统种子中缺失的项目/任务补入服务端，不覆盖已有数据。是否继续？')) return;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/data/admin/merge-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: '{}',
      signal: AbortSignal.timeout(ApiConfig.timeout),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || '补全失败');
      return;
    }
    await DataService.loadFromServer();
    render();
    alert(`${data.message}\n当前共 ${getViewableProjects().length} 个未归档项目，请通知同事刷新项目管理页。`);
  } catch (e) {
    alert('补全失败：' + e.message);
  }
}

function uniqueUsersById(userList) {
  const map = new Map();
  userList.forEach(u => { if (u?.id) map.set(u.id, u); });
  return [...map.values()];
}

function sortUsersForSelect(list) {
  return [...list].sort((a, b) =>
    a.dept.localeCompare(b.dept, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'));
}

/** 任务负责人：全量在职档案（钉钉通讯录） */
function getTaskAssigneeCandidates() {
  return sortUsersForSelect(
    uniqueUsersById(getStaffDirectoryUsers().filter(u => isStaffActive(u) && !isSpareAccount(u)))
  );
}

function getStaffDirectoryUsers() {
  return allStaffUsers.length ? allStaffUsers : users;
}

/** 任务协办人：同负责人池 */
function getTaskCollaboratorCandidates() {
  return getTaskAssigneeCandidates();
}

/** A/R/C/V：全量在职人员档案 */
function getArcvArchiveCandidates() {
  return getTaskAssigneeCandidates();
}

/** @deprecated 与 getArcvArchiveCandidates 相同（已无联系人二分） */
function getArcvMemberCandidates() {
  return getArcvArchiveCandidates();
}

function renderArcvPersonSelect(fieldKey, currentValue, disabled) {
  const candidates = getArcvArchiveCandidates();
  const cur = String(currentValue || '').trim();
  const inList = candidates.some(u => u.name === cur);
  const syncR = fieldKey === 'roleR'
    ? `state.form.roleR=this.value;state.form.assignee=this.value`
    : `state.form.${fieldKey}=this.value`;
  return `
    <select class="select" style="width:100%;" onchange="${syncR}" ${disabled ? 'disabled' : ''}>
      <option value="">请选择</option>
      ${cur && !inList ? `<option value="${escapeHtml(cur)}" selected>${escapeHtml(cur)}（档案外）</option>` : ''}
      ${candidates.map(u => `<option value="${escapeHtml(u.name)}" ${u.name === cur ? 'selected' : ''}>${formatUserOptionLabel(u)}</option>`).join('')}
    </select>`;
}

function parseRoleCNames(raw) {
  return [...new Set(String(raw || '').split(/[,，、;；|/\s]+/).map(s => s.trim()).filter(Boolean))];
}

function getRoleCFormNames(task) {
  if (Array.isArray(state.form.roleCNames)) return state.form.roleCNames;
  const names = parseRoleCNames(state.form.roleC != null ? state.form.roleC : (task?.roleC || ''));
  state.form.roleCNames = names;
  state.form.roleC = names.join('、');
  return names;
}

function syncRoleCFormFromNames() {
  const names = Array.isArray(state.form.roleCNames) ? state.form.roleCNames : [];
  state.form.roleC = names.join('、');
}

function toggleRoleCDropdown() {
  if (state.collabDropdownOpen === 'roleC') state.collabDropdownOpen = null;
  else state.collabDropdownOpen = 'roleC';
  refreshRoleCMultiSelect();
}

function toggleRoleCName(name) {
  const list = getRoleCFormNames();
  const idx = list.indexOf(name);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(name);
  state.form.roleCNames = list;
  syncRoleCFormFromNames();
  state.collabDropdownOpen = 'roleC';
  refreshRoleCMultiSelect();
}

function removeRoleCName(name) {
  state.form.roleCNames = getRoleCFormNames().filter(n => n !== name);
  syncRoleCFormFromNames();
  refreshRoleCMultiSelect();
}

function setRoleCSearch(q) {
  state.form.roleCSearch = q;
  refreshRoleCMultiSelect();
}

function refreshRoleCMultiSelect() {
  const host = document.querySelector('[data-rolec-ms-host]');
  if (!host) {
    render();
    return;
  }
  const scrollPos = captureUiScrollPositions();
  const task = tasks.find(t => t.id === state.form.taskId) || {};
  host.innerHTML = renderRoleCMultiSelect(getRoleCFormNames(task), !!host.getAttribute('data-disabled'));
  restoreUiScrollPositions(scrollPos);
}

function renderRoleCMultiSelect(selectedNames, disabled) {
  const selected = selectedNames || [];
  const selectedSet = new Set(selected);
  const isOpen = state.collabDropdownOpen === 'roleC';
  const q = String(state.form.roleCSearch || '').trim().toLowerCase();
  let candidates = getArcvArchiveCandidates();
  if (q) {
    candidates = candidates.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.dept || '').toLowerCase().includes(q) ||
      (u.position || '').toLowerCase().includes(q)
    );
  }
  const orphan = selected.filter(n => !candidates.some(u => u.name === n) && (!q || n.toLowerCase().includes(q)));

  const triggerLabel = selected.length === 0
    ? '请选择协作人（可多选）'
    : (selected.length <= 2 ? selected.join('、') : `已选 ${selected.length} 人`);

  return `
    <div class="collab-ms" data-rolec-ms-host ${disabled ? 'data-disabled="1"' : ''}>
      ${isOpen ? '<div class="collab-ms-backdrop" onclick="closeCollabDropdown()"></div>' : ''}
      <button type="button" class="collab-ms-trigger${isOpen ? ' open' : ''}" ${disabled ? 'disabled' : ''}
        onclick="event.stopPropagation();toggleRoleCDropdown()">
        <span style="color:${selected.length ? '#374151' : '#9CA3AF'};">${escapeHtml(triggerLabel)}</span>
        <i class="fas fa-chevron-down chevron"></i>
      </button>
      ${isOpen ? `
        <div class="collab-ms-panel" onclick="event.stopPropagation()">
          <input class="input" style="width:100%;margin-bottom:8px;font-size:12px;" placeholder="搜索姓名、部门..."
            value="${escapeHtml(state.form.roleCSearch || '')}"
            oninput="setRoleCSearch(this.value)" onclick="event.stopPropagation()">
          ${orphan.map(name => `
            <label class="collab-ms-option selected">
              <input type="checkbox" checked onchange='toggleRoleCName(${JSON.stringify(name)})'>
              <span>${escapeHtml(name)}（档案外）</span>
            </label>
          `).join('')}
          ${candidates.length ? candidates.map(u => `
            <label class="collab-ms-option${selectedSet.has(u.name) ? ' selected' : ''}">
              <input type="checkbox" ${selectedSet.has(u.name) ? 'checked' : ''}
                onchange='toggleRoleCName(${JSON.stringify(u.name)})'>
              <span>${formatUserOptionLabel(u)}</span>
            </label>
          `).join('') : '<div style="padding:10px;color:#9CA3AF;font-size:12px;">无匹配人员</div>'}
        </div>
      ` : ''}
      ${selected.length ? `
        <div class="collab-ms-tags">
          ${selected.map(name => `
            <span class="collab-ms-tag">
              ${escapeHtml(name)}
              ${disabled ? '' : `<button type="button" title="移除" onclick='removeRoleCName(${JSON.stringify(name)})'>&times;</button>`}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/** 项目负责人：信息中心全员 + 本部门全员（含执行人员）+ 各部门经理/总经理/管理员 */
function getProjectManagerCandidates() {
  const pool = businessUsers();
  if (currentUser.role === 'staff') {
    return sortUsersForSelect(uniqueUsersById(
      pool.filter(u => u.id === currentUser.id || u.dept === INFO_CENTER_DEPT)
    ));
  }
  return sortUsersForSelect(uniqueUsersById(
    pool.filter(u =>
      u.dept === INFO_CENTER_DEPT ||
      u.dept === currentUser.dept ||
      u.role === 'manager' ||
      isFullAccess(u.role)
    )
  ));
}

function sanitizeProjectTeamMembers(manager, teamMembers) {
  return [...new Set((teamMembers || []).filter(n => n && n !== manager))];
}

function getProjectTeamMembersForm() {
  if (!Array.isArray(state.form.teamMembers)) state.form.teamMembers = [];
  return state.form.teamMembers;
}

function getProjectTeamCandidates(managerName) {
  return getTaskAssigneeCandidates().filter(u => u.name !== managerName);
}

function toggleProjectTeamDropdown() {
  const formKey = 'projectTeamMembers';
  if (state.collabDropdownOpen === formKey) state.collabDropdownOpen = null;
  else state.collabDropdownOpen = formKey;
  refreshProjectTeamMultiSelect();
}

function toggleProjectTeamMember(name) {
  const list = getProjectTeamMembersForm();
  const idx = list.indexOf(name);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(name);
  state.collabDropdownOpen = 'projectTeamMembers';
  refreshProjectTeamMultiSelect();
}

function removeProjectTeamMember(name) {
  state.form.teamMembers = getProjectTeamMembersForm().filter(n => n !== name);
  refreshProjectTeamMultiSelect();
}

function refreshProjectTeamMultiSelect() {
  const host = document.querySelector('[data-project-team-ms-host]');
  if (!host) {
    render();
    return;
  }
  const scrollPos = captureUiScrollPositions();
  host.innerHTML = renderProjectTeamMultiSelect(
    getProjectTeamMembersForm(),
    state.form.manager || currentUser.name,
    false
  );
  restoreUiScrollPositions(scrollPos);
}

function renderProjectTeamMultiSelect(selectedNames, managerName, disabled) {
  const formKey = 'projectTeamMembers';
  const selected = selectedNames || [];
  const selectedSet = new Set(selected);
  const isOpen = state.collabDropdownOpen === formKey;
  const candidates = getProjectTeamCandidates(managerName || currentUser.name);

  const triggerLabel = selected.length === 0
    ? '请选择（可多选）'
    : (selected.length <= 2 ? selected.join('、') : `已选 ${selected.length} 人`);

  if (!candidates.length) {
    return '<div style="padding:10px;color:#9CA3AF;font-size:12px;border:1px solid var(--border);border-radius:8px;">无可选人员</div>';
  }

  return `
    <div class="collab-ms">
      ${isOpen ? '<div class="collab-ms-backdrop" onclick="closeCollabDropdown()"></div>' : ''}
      <button type="button" class="collab-ms-trigger${isOpen ? ' open' : ''}" ${disabled ? 'disabled' : ''}
        onclick="event.stopPropagation();toggleProjectTeamDropdown()">
        <span style="color:${selected.length ? '#374151' : '#9CA3AF'};">${escapeHtml(triggerLabel)}</span>
        <i class="fas fa-chevron-down chevron"></i>
      </button>
      ${isOpen ? `
        <div class="collab-ms-panel" onclick="event.stopPropagation()">
          ${candidates.map(u => `
            <label class="collab-ms-option${selectedSet.has(u.name) ? ' selected' : ''}">
              <input type="checkbox" ${selectedSet.has(u.name) ? 'checked' : ''}
                onchange='toggleProjectTeamMember(${JSON.stringify(u.name)})'>
              <span>${formatUserOptionLabel(u)}</span>
            </label>
          `).join('')}
        </div>
      ` : ''}
      ${selected.length ? `
        <div class="collab-ms-tags">
          ${selected.map(name => `
            <span class="collab-ms-tag">
              ${escapeHtml(name)}
              ${disabled ? '' : `<button type="button" title="移除" onclick='removeProjectTeamMember(${JSON.stringify(name)})'>&times;</button>`}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function formatUserOptionLabel(u) {
  const role = roleDisplayName(u.role);
  return `${u.name} - ${u.dept}${role === '执行人员' ? '' : ` · ${role}`}`;
}

function sanitizeTaskCollaborators(assignee, collaborators) {
  return [...new Set((collaborators || []).filter(c => c && c !== assignee))];
}

const COLLAB_TYPE_INFORM = 'inform';
const COLLAB_TYPE_ASSIST = 'assist';
const COLLAB_STATUS_ACTIVE = 'active';
const COLLAB_STATUS_PENDING = 'pending_schedule';
const COLLAB_STATUS_PROPOSED = 'proposed';
const COLLAB_STATUS_APPROVED = 'approved';
const COLLAB_STATUS_REJECTED = 'rejected';

function collabTypeLabel(type) {
  return type === COLLAB_TYPE_ASSIST ? '辅助性' : '告知性';
}

function collabStatusLabel(entry) {
  if (!entry) return '';
  if (entry.type === COLLAB_TYPE_INFORM) return '告知中';
  const map = {
    pending_schedule: '待填写协助时段',
    proposed: '待负责人审批',
    approved: '已批准·计入工时',
    rejected: '未接受',
  };
  return map[entry.status] || entry.status;
}

function syncCollaboratorsArray(task) {
  if (!task) return;
  task.collaborators = (task.collaboratorEntries || [])
    .filter(e => e && e.userName && e.status !== COLLAB_STATUS_REJECTED)
    .map(e => e.userName)
    .filter(n => n !== task.assignee);
  task.collaborators = sanitizeTaskCollaborators(task.assignee, task.collaborators);
}

function ensureCollaboratorEntries(task) {
  if (!task) return;
  if (Array.isArray(task.collaboratorEntries) && task.collaboratorEntries.length) {
    task.collaboratorEntries.forEach(e => {
      if (!e.id) e.id = genId('COL');
      if (!e.type) e.type = COLLAB_TYPE_INFORM;
      if (!e.status) e.status = e.type === COLLAB_TYPE_ASSIST ? COLLAB_STATUS_PENDING : COLLAB_STATUS_ACTIVE;
    });
    syncCollaboratorsArray(task);
    return;
  }
  task.collaboratorEntries = (task.collaborators || [])
    .filter(n => n && n !== task.assignee)
    .map(name => ({
      id: genId('COL'),
      userName: name,
      type: COLLAB_TYPE_INFORM,
      status: COLLAB_STATUS_ACTIVE,
    }));
  syncCollaboratorsArray(task);
}

function normalizeAllTaskCollaborators() {
  tasks.forEach(ensureCollaboratorEntries);
  normalizeMilestoneFlags();
  syncAllMilestoneStatusesFromTasks({ silent: true });
}

/** 将项目一级根节点标记为里程碑（兼容历史数据） */
function normalizeMilestoneFlags() {
  const byProject = new Map();
  tasks.forEach(t => {
    if (!t || !t.projectId || t.type === 'temp') return;
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
    byProject.get(t.projectId).push(t);
  });
  byProject.forEach(list => {
    const ids = new Set(list.map(t => t.id));
    list.forEach(t => {
      const isRoot = !t.parentId || t.parentId === t.id || !ids.has(t.parentId);
      if (isRoot) t.isMilestone = true;
      else if (t.isMilestone) t.isMilestone = false;
    });
  });
}

/**
 * 里程碑状态由下属任务推导：
 * - 任一进行中 → 进行中
 * - 全部完成 → 已完成
 * - 否则有暂停 → 已暂停
 * - 否则 → 待开始
 */
function deriveMilestoneStatusFromTasks(milestoneId) {
  const descendants = getMilestoneDescendantTasks(milestoneId);
  if (!descendants.length) return null;
  if (descendants.every(t => t.status === 'done')) return 'done';
  if (descendants.some(t => t.status === 'doing')) return 'doing';
  if (descendants.some(t => t.status === 'paused')) return 'paused';
  return 'todo';
}

function applyDerivedMilestoneStatus(milestone, opts = {}) {
  if (!milestone || !isMilestoneTask(milestone)) return false;
  if (milestone.status === 'abolished' || milestone.status === 'archived') return false;
  const derived = deriveMilestoneStatusFromTasks(milestone.id);
  if (!derived) return false;
  const oldStatus = milestone.status;
  milestone.progress = calcProgress(milestone.id);
  if (oldStatus === derived) return false;

  if (derived === 'done') {
    applyTaskDoneFields(milestone);
    milestone.status = 'done';
    if (!opts.silent) {
      appendChangeLogEntry({
        taskId: milestone.id,
        operator: currentUser.name,
        operateTime: new Date().toLocaleString(),
        before: statusMap[oldStatus]?.label || oldStatus,
        after: statusMap.done.label,
        reason: '下属任务全部完成，里程碑自动完成',
        project: projects.find(p => p.id === milestone.projectId)?.name || '',
      });
      onTaskMarkedDone(milestone);
    }
  } else {
    if (oldStatus === 'done') {
      milestone.actualEndDate = null;
    }
    if (derived === 'doing' && !milestone.actualStartDate) {
      milestone.actualStartDate = todayStr();
    }
    milestone.status = derived;
    if (derived !== 'done') {
      const p = Number(milestone.progress);
      if (!Number.isFinite(p) || p >= 100) milestone.progress = calcProgress(milestone.id);
    }
    if (!opts.silent) {
      appendChangeLogEntry({
        taskId: milestone.id,
        operator: currentUser.name,
        operateTime: new Date().toLocaleString(),
        before: statusMap[oldStatus]?.label || oldStatus,
        after: statusMap[derived]?.label || derived,
        reason: '随下属任务状态自动同步',
        project: projects.find(p => p.id === milestone.projectId)?.name || '',
      });
    }
  }
  return true;
}

function syncAllMilestoneStatusesFromTasks(opts = {}) {
  let changed = 0;
  tasks.forEach(t => {
    if (isMilestoneTask(t) && applyDerivedMilestoneStatus(t, opts)) changed += 1;
  });
  return changed;
}

/** 从任务向上同步所属里程碑状态 */
function syncOwningMilestoneStatus(task, opts = {}) {
  const milestone = getOwningMilestone(task);
  if (!milestone) return false;
  return applyDerivedMilestoneStatus(milestone, opts);
}

/** 里程碑：项目计划中的分组节点，不计入任务 */
function isMilestoneTask(task) {
  if (!task || task.type === 'temp' || !task.projectId) return false;
  if (task.isMilestone === true) return true;
  if (task.isMilestone === false) return false;
  if (!task.parentId || task.parentId === task.id) return true;
  const parent = tasks.find(x => x.id === task.parentId);
  return !parent || parent.projectId !== task.projectId;
}

/** 里程碑下全部未作废任务（含子级），不含里程碑自身 */
function getMilestoneDescendantTasks(milestoneId) {
  const result = [];
  const stack = [milestoneId];
  const visited = new Set([milestoneId]);
  while (stack.length) {
    const id = stack.pop();
    tasks.forEach(t => {
      if (t.parentId !== id || t.status === 'abolished' || visited.has(t.id)) return;
      visited.add(t.id);
      if (!isMilestoneTask(t)) result.push(t);
      stack.push(t.id);
    });
  }
  return result;
}

/** 里程碑下所有任务均已完成（至少有一条任务）才可完成里程碑 */
function areAllMilestoneTasksDone(milestoneId) {
  const descendants = getMilestoneDescendantTasks(milestoneId);
  if (!descendants.length) return false;
  return descendants.every(t => t.status === 'done');
}

function canCompleteMilestone(milestone) {
  if (!milestone || !isMilestoneTask(milestone)) return false;
  if (milestone.status === 'done' || milestone.status === 'archived' || milestone.status === 'abolished') return false;
  return areAllMilestoneTasksDone(milestone.id);
}

function getMilestoneIncompleteHint(milestoneId) {
  const descendants = getMilestoneDescendantTasks(milestoneId);
  if (!descendants.length) return '请先在该里程碑下添加任务；全部任务完成后方可完成里程碑。';
  const open = descendants.filter(t => t.status !== 'done');
  return `该里程碑下仍有 ${open.length} 项未完成任务，全部完成后才可完成里程碑。`;
}

function getCollaboratorEntries(task, opts = {}) {
  if (!task) return [];
  ensureCollaboratorEntries(task);
  let list = task.collaboratorEntries || [];
  if (opts.type) list = list.filter(e => e.type === opts.type);
  if (opts.userName) list = list.filter(e => isSamePersonName(e.userName, opts.userName));
  if (opts.excludeRejected) list = list.filter(e => e.status !== COLLAB_STATUS_REJECTED);
  return list;
}

function getCollaboratorEntry(task, type, userName) {
  return getCollaboratorEntries(task, { type, userName, excludeRejected: true })[0]
    || getCollaboratorEntries(task, { type, userName })[0]
    || null;
}

function normalizeCollaboratorNames(raw, assignee) {
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' && raw.trim()
      ? raw.split(/[,，、;；|/\s]+/).map(s => s.trim())
      : []);
  return [...new Set(list.filter(n => n && n !== assignee))];
}

function getTaskFormCollaboratorNames(task, type, form = state.form) {
  const pluralKey = type === COLLAB_TYPE_INFORM ? 'informCollaborators' : 'assistCollaborators';
  const legacyKey = type === COLLAB_TYPE_INFORM ? 'informCollaborator' : 'assistCollaborator';
  if (Array.isArray(form?.[pluralKey])) return form[pluralKey].slice();
  if (form?.[legacyKey]) return [form[legacyKey]];
  return getCollaboratorEntries(task, { type, excludeRejected: true }).map(e => e.userName);
}

function initTaskFormCollaborators(task) {
  ensureCollaboratorEntries(task);
  return {
    ...task,
    informCollaborators: getCollaboratorEntries(task, { type: COLLAB_TYPE_INFORM, excludeRejected: true }).map(e => e.userName),
    assistCollaborators: getCollaboratorEntries(task, { type: COLLAB_TYPE_ASSIST, excludeRejected: true }).map(e => e.userName),
  };
}

function toggleCollabDropdown(formKey) {
  if (state.collabDropdownOpen === formKey) state.collabDropdownOpen = null;
  else state.collabDropdownOpen = formKey;
  refreshCollaboratorMultiSelects();
}

function closeCollabDropdown() {
  if (!state.collabDropdownOpen) return;
  const wasRoleC = state.collabDropdownOpen === 'roleC';
  state.collabDropdownOpen = null;
  if (wasRoleC) refreshRoleCMultiSelect();
  else refreshCollaboratorMultiSelects();
}

function toggleFormCollaborator(formKey, name) {
  if (!Array.isArray(state.form[formKey])) state.form[formKey] = [];
  const idx = state.form[formKey].indexOf(name);
  if (idx >= 0) state.form[formKey].splice(idx, 1);
  else state.form[formKey].push(name);
  state.collabDropdownOpen = formKey;
  refreshCollaboratorMultiSelects();
}

function removeFormCollaborator(formKey, name) {
  if (!Array.isArray(state.form[formKey])) return;
  state.form[formKey] = state.form[formKey].filter(n => n !== name);
  refreshCollaboratorMultiSelects();
}

function getCollaboratorMultiSelectContext() {
  const task = tasks.find(t => t.id === state.form.id) || state.form;
  const assigneeName = task.assignee || state.form.assignee || currentUser.name;
  const canEdit = !state.form.id || canOperateTask(tasks.find(t => t.id === state.form.id) || task);
  return {
    task,
    assigneeName,
    disabled: !canEdit,
    informNames: getTaskFormCollaboratorNames(task, COLLAB_TYPE_INFORM),
    assistNames: getTaskFormCollaboratorNames(task, COLLAB_TYPE_ASSIST),
  };
}

/** 仅刷新协办人多选区域，避免整页 render 导致弹窗滚回顶部 */
function refreshCollaboratorMultiSelects() {
  const modalBody = document.querySelector('.modal-overlay .modal-body');
  const informHost = modalBody?.querySelector('[data-collab-ms-host="inform"]');
  const assistHost = modalBody?.querySelector('[data-collab-ms-host="assist"]');
  if (!informHost && !assistHost) {
    render();
    return;
  }
  const scrollPos = captureUiScrollPositions();
  const ctx = getCollaboratorMultiSelectContext();
  if (informHost) {
    informHost.innerHTML = renderCollaboratorMultiSelect(
      COLLAB_TYPE_INFORM, ctx.informNames, ctx.assigneeName, ctx.assistNames, ctx.disabled
    );
  }
  if (assistHost) {
    assistHost.innerHTML = renderCollaboratorMultiSelect(
      COLLAB_TYPE_ASSIST, ctx.assistNames, ctx.assigneeName, ctx.informNames, ctx.disabled
    );
  }
  restoreUiScrollPositions(scrollPos);
}

function renderCollaboratorMultiSelect(type, selectedNames, assigneeName, excludeNames, disabled) {
  const formKey = type === COLLAB_TYPE_INFORM ? 'informCollaborators' : 'assistCollaborators';
  const selected = selectedNames || [];
  const selectedSet = new Set(selected);
  const exclude = new Set(excludeNames || []);
  const isOpen = state.collabDropdownOpen === formKey;
  const candidates = getTaskCollaboratorCandidates()
    .filter(u => u.name !== assigneeName && !exclude.has(u.name));

  const triggerLabel = selected.length === 0
    ? '请选择（可多选）'
    : (selected.length <= 2 ? selected.join('、') : `已选 ${selected.length} 人`);

  if (!candidates.length) {
    return '<div style="padding:10px;color:#9CA3AF;font-size:12px;border:1px solid var(--border);border-radius:8px;">无可选人员</div>';
  }

  return `
    <div class="collab-ms">
      ${isOpen ? '<div class="collab-ms-backdrop" onclick="closeCollabDropdown()"></div>' : ''}
      <button type="button" class="collab-ms-trigger${isOpen ? ' open' : ''}" ${disabled ? 'disabled' : ''}
        onclick="event.stopPropagation();toggleCollabDropdown('${formKey}')">
        <span style="color:${selected.length ? '#374151' : '#9CA3AF'};">${escapeHtml(triggerLabel)}</span>
        <i class="fas fa-chevron-down chevron"></i>
      </button>
      ${isOpen ? `
        <div class="collab-ms-panel" onclick="event.stopPropagation()">
          ${candidates.map(u => `
            <label class="collab-ms-option${selectedSet.has(u.name) ? ' selected' : ''}">
              <input type="checkbox" ${selectedSet.has(u.name) ? 'checked' : ''}
                onchange='toggleFormCollaborator("${formKey}", ${JSON.stringify(u.name)})'>
              <span>${formatUserOptionLabel(u)}</span>
            </label>
          `).join('')}
        </div>
      ` : ''}
      ${selected.length ? `
        <div class="collab-ms-tags">
          ${selected.map(name => `
            <span class="collab-ms-tag">
              ${escapeHtml(name)}
              ${disabled ? '' : `<button type="button" title="移除" onclick='removeFormCollaborator("${formKey}", ${JSON.stringify(name)})'>&times;</button>`}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function syncCollaboratorsByType(task, type, userNames, opts = {}) {
  ensureCollaboratorEntries(task);
  const names = normalizeCollaboratorNames(userNames, task.assignee);
  const otherType = type === COLLAB_TYPE_INFORM ? COLLAB_TYPE_ASSIST : COLLAB_TYPE_INFORM;
  for (const name of names) {
    if (getCollaboratorEntries(task, { type: otherType, userName: name, excludeRejected: true }).length > 0) {
      throw new Error(`「${name}」已担任${collabTypeLabel(otherType)}协办，不能同时选为${collabTypeLabel(type)}协办`);
    }
  }

  const prevOfType = (task.collaboratorEntries || []).filter(e => e.type === type);
  const prevNames = new Set(prevOfType.map(e => e.userName));
  const nameSet = new Set(names);

  task.collaboratorEntries = (task.collaboratorEntries || []).filter(e => e.type !== type || nameSet.has(e.userName));

  for (const name of names) {
    if ((task.collaboratorEntries || []).some(e => e.type === type && e.userName === name)) continue;
    const entry = {
      id: genId('COL'),
      userName: name,
      type,
      status: type === COLLAB_TYPE_ASSIST ? COLLAB_STATUS_PENDING : COLLAB_STATUS_ACTIVE,
    };
    task.collaboratorEntries.push(entry);
    if (type === COLLAB_TYPE_ASSIST && opts.notify !== false && !prevNames.has(name)) {
      notifyCollaboratorAssistRequest(task, entry);
    }
  }
  syncCollaboratorsArray(task);
  return task.collaboratorEntries.filter(e => e.type === type);
}

function upsertCollaboratorEntry(task, type, userName, opts = {}) {
  const names = userName ? [userName] : [];
  return syncCollaboratorsByType(task, type, names, opts);
}

function isInformCollaborator(task, userName = currentUser.name) {
  return getCollaboratorEntries(task, { type: COLLAB_TYPE_INFORM, userName, excludeRejected: true }).length > 0;
}

function isAssistCollaborator(task, userName = currentUser.name) {
  return getCollaboratorEntries(task, { type: COLLAB_TYPE_ASSIST, userName, excludeRejected: true }).length > 0;
}

function isApprovedAssistCollaborator(task, userName = currentUser.name) {
  return getCollaboratorEntries(task, { type: COLLAB_TYPE_ASSIST, userName }).some(e => e.status === COLLAB_STATUS_APPROVED);
}

function canReviewCollaboratorProposal(task) {
  if (!task) return false;
  if (isFullAccess(currentUser.role)) return true;
  if (isSamePersonName(task.assignee, currentUser.name)) return true;
  return isTaskProjectManager(task);
}

function getCollaboratorProposalReviewers(task) {
  const names = new Set();
  if (task.assignee) names.add(task.assignee);
  const project = getTaskProject(task);
  if (project?.manager) names.add(project.manager);
  return [...names];
}

function calcAssistEntryEstimatedHours(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  if (parseLocalDate(startDate) > parseLocalDate(endDate)) return 0;
  return calcWorkHoursBetween(startDate, endDate);
}

function getAssistEntryHoursInWeek(entry, weekStart, weekEnd) {
  if (!entry || entry.type !== COLLAB_TYPE_ASSIST || entry.status !== COLLAB_STATUS_APPROVED) return 0;
  const start = entry.planStartDate;
  const end = entry.planEndDate;
  const estimated = Number(entry.estimatedHours) || calcAssistEntryEstimatedHours(start, end);
  if (!start || !end || estimated <= 0) return 0;
  const totalWorkDays = calcWorkDays(start, end);
  if (!totalWorkDays) return 0;
  const overlapDays = countOverlapWorkDays(start, end, weekStart, weekEnd);
  if (!overlapDays) return 0;
  return Math.round((estimated * overlapDays / totalWorkDays) * 10) / 10;
}

function getMemberAssistWeeklyHours(userName, weekRange) {
  return tasks
    .filter(t => canCountTaskHours(t))
    .reduce((sum, t) => {
      if (isTaskBlocked(t)) return sum;
      const entry = getCollaboratorEntry(t, COLLAB_TYPE_ASSIST, userName);
      return sum + (entry ? getAssistEntryHoursInWeek(entry, weekRange.start, weekRange.end) : 0);
    }, 0);
}

/** 计入饱和度/当周工时的业务状态（已暂停不计入） */
function isHoursCountableStatus(status) {
  return status === 'todo' || status === 'doing';
}

// 用户数据 - 信息中心组织架构
let users = [
  { id: 'U001', name: '魏海波', dept: '信息中心', role: 'gm', position: '信息中心总经理', leaderId: '', standardWeekHours: 60, dingTalkUserId: '084918593839104986' },
  { id: 'U002', name: '葛鸿玮 信息中心助理', dept: '信息中心', role: 'manager', position: '部门管理执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '763409435' },
  { id: 'U003', name: '运营助理备用', dept: '信息中心', role: 'manager', position: '部门管理执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '215997906' },
  { id: 'U004', name: '明秀丽  项目申报专员', dept: '信息中心', role: 'manager', position: '部门管理执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '385496097' },
  { id: 'U005', name: '刘易', dept: '规划建设部', role: 'manager', position: '部门经理', leaderId: '', standardWeekHours: 60, dingTalkUserId: '3534416912677627' },
  { id: 'U006', name: '黄艳-信息中心', dept: '实施交付部', role: 'manager', position: '部门经理', leaderId: '', standardWeekHours: 60, dingTalkUserId: '21043656561293359' },
  { id: 'U007', name: '吴志伟', dept: '研发集成部', role: 'manager', position: '部门经理', leaderId: '', standardWeekHours: 60, dingTalkUserId: '093551554921496156' },
  { id: 'U008', name: '张俊官', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '081324474424058926' },
  { id: 'U009', name: '钱广', dept: 'AI创新部', role: 'manager', position: '部门经理', leaderId: '', standardWeekHours: 60, dingTalkUserId: '0164024035201204206' },
  { id: 'U010', name: '陈璇', dept: '信息中心', role: 'admin', position: '管理员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '24623338601222463' },
  { id: 'U011', name: '吕腾飞', dept: '规划建设部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '010338552721752309' },
  { id: 'U012', name: '薛钧益  需求分析师', dept: '规划建设部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '979368583' },
  { id: 'U013', name: '谢易琳-需求分析师', dept: '规划建设部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '581487488' },
  { id: 'U014', name: '江寒赟 数据中心供应链分析师', dept: '规划建设部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '777234315' },
  { id: 'U015', name: '殷酉荣', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '3042226827686193' },
  { id: 'U016', name: '章志红', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '112655254031022219' },
  { id: 'U017', name: '陈吴越', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '086520641637676062' },
  { id: 'U018', name: '王元斌 Martin', dept: '实施交付部', role: 'admin', position: '执行人员/管理员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '669701617' },
  { id: 'U020', name: '叶栋 软件实施工程师', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '361543173' },
  { id: 'U021', name: '专属钉钉实施', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '868189020' },
  { id: 'U022', name: '魏宗斌   软件实施工程师', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '262793598' },
  { id: 'U023', name: '苗治国', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '958962376' },
  { id: 'U024', name: '张书铖', dept: '研发集成部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '216703090124062544' },
  { id: 'U025', name: '钱月-后端研发', dept: '研发集成部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '135329713' },
  { id: 'U026', name: '马明晶', dept: '研发集成部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '085040485938826388' },
  { id: 'U027', name: '张政 后台工程师', dept: '研发集成部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '686062681' },
  { id: 'U028', name: '任双   前端研发', dept: '研发集成部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '538187641' },
  { id: 'U029', name: '季橙成', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '180206100123351674' },
  { id: 'U030', name: '网络管理', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '110128080638312931' },
  { id: 'U031', name: '网络管理员备用号', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '49642046' },
  { id: 'U032', name: '孙坤毫 网络管理员', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '733909115' },
  { id: 'U033', name: '周骋骋 网络管理员', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '454227911' },
  { id: 'U034', name: '李明海  网络管理员', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '82849151' },
  { id: 'U035', name: 'AI应用工程师', dept: 'AI创新部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '484147694' },
  { id: 'U036', name: '陈运来', dept: 'AI创新部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '204240620' },
  { id: 'U037', name: '朱贵乔', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '01063938154126527408' },
  { id: 'U038', name: '曹燚炜 软件实施工程师', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '265783602' },
  { id: 'U040', name: 'AI应用工程师备用号', dept: 'AI创新部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '361546098' },
  { id: 'U042', name: '龙涛 AI应用工程师', dept: 'AI创新部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '480907618' },
  { id: 'U044', name: '缪蕾', dept: '财务部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '18023059101043348' },
  { id: 'U045', name: '柳敏', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '2262615565850876' },
  { id: 'U046', name: '陆敏明', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '181122176937799781' },
  { id: 'U047', name: '金叶', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '12435915161178693' },
  { id: 'U048', name: '胡月琴', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '4935131832553677' },
  { id: 'U049', name: '平晓慧', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '184747671124072999' },
  { id: 'U050', name: '平香', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '1833092359-1743086946' },
  { id: 'U051', name: '高雅艳', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '1831162829-2128399800' },
  { id: 'U052', name: '朱宇红', dept: '账务管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '18330949492125820994' },
  { id: 'U053', name: '顾焱', dept: '财务中心', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '1834672761331391491' },
  { id: 'U054', name: '韩莹', dept: '内部核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '20102368371239280' },
  { id: 'U055', name: '宋卫星', dept: '海外管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '212406206123209183' },
  { id: 'U056', name: '朱斌', dept: '海外管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '023219320006844923' },
  { id: 'U057', name: '刘春艳', dept: '海外管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '203344686421040390' },
  { id: 'U058', name: '毛斌芳', dept: '海外管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '02192834511827373506' },
  { id: 'U059', name: '李兵bruce', dept: '海外管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '2112013701-976676416' },
  { id: 'U060', name: '孟加拉财务', dept: '海外管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '224751488' },
  { id: 'U061', name: '汪颖 核算专员', dept: '海外管理组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '9836400' },
  { id: 'U062', name: '徐海红', dept: '关务部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '183464433024411035' },
  { id: 'U063', name: '章云月', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '322944126830879095' },
  { id: 'U064', name: '刘玉', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '6632214843681073' },
  { id: 'U065', name: '邵钰婷', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '01416754346136803388' },
  { id: 'U066', name: '林纯漳', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '01254836233926518587' },
  { id: 'U067', name: '周华慧', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '125958512721451329' },
  { id: 'U068', name: '陈思逸', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '195846506937771267' },
  { id: 'U069', name: '赵丹', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '18351652621142628' },
  { id: 'U070', name: '党怡曾  单证员', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '625527358' },
  { id: 'U071', name: '顾静文   报关员', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '470592851' },
  { id: 'U072', name: '蔡文洁  单证员', dept: '成衣进出口组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '315986813' },
  { id: 'U073', name: '惠姣', dept: '面辅料出运组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '1835106213791811' },
  { id: 'U074', name: '虞逸淼', dept: '面辅料出运组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '01113704682734229154' },
  { id: 'U075', name: '蔡钶丹', dept: '面辅料出运组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '01175637066733952036' },
  { id: 'U076', name: '常秀丽', dept: '面辅料出运组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '274359424624165557' },
  { id: 'U077', name: '董皓雪 单证员', dept: '面辅料出运组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '162618728' },
  { id: 'U078', name: '屈婷婷  单证员', dept: '面辅料出运组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '590895300' },
  { id: 'U079', name: '辛嘉霖', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '4935134936050696' },
  { id: 'U080', name: '李智珠', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '183459400226257524' },
  { id: 'U081', name: '王柳', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '1625696925943560' },
  { id: 'U082', name: '张路路', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '054122632424564992' },
  { id: 'U083', name: '杨茜', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '2710591807854196' },
  { id: 'U084', name: '王欢欢', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '183465574829303051' },
  { id: 'U085', name: '胡洁', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '18314236511050688' },
  { id: 'U086', name: '徐群英', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '204416250324556381' },
  { id: 'U087', name: '冯小红', dept: '财务核算组', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '343811453120858466' },
  { id: 'U088', name: '沈昊 AI应用工程师', dept: 'AI创新部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '398947776' },
  { id: 'U089', name: '朱贵乔 Joe', dept: '实施交付部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '136334158' },
  { id: 'U090', name: '陈璇  Chenxuan', dept: '项目管控部', role: 'admin', position: '副科长', leaderId: '', standardWeekHours: 60, dingTalkUserId: '418924990' },
  { id: 'U091', name: '钱华杰 后端研发', dept: '研发集成部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '379939783' },
  { id: 'U092', name: '李天硕   网络管理员', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '980952307' },
  { id: 'U093', name: '孙应敏 系统运维', dept: '网络运维部', role: 'staff', position: '执行人员', leaderId: '', standardWeekHours: 60, dingTalkUserId: '730191909' },
];
/** 人员档案全量（协办人选人等场景用，不受角色/部门页签限制） */
let allStaffUsers = users.slice();

// 当前用户
let currentUser = users.find(u => u.name === '王元斌') || users[17];
