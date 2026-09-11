// ========== 数据导出 ==========
const XLSX_CDN = '/vendor/xlsx/xlsx.full.min.js';
let _xlsxLoadPromise = null;
/** 首次导出/导入时再加载 XLSX，避免拖慢首开 */
function ensureXlsxLoaded() {
  if (typeof XLSX !== 'undefined') return Promise.resolve(true);
  if (_xlsxLoadPromise) return _xlsxLoadPromise;
  _xlsxLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_CDN;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      _xlsxLoadPromise = null;
      reject(new Error('Excel 组件加载失败'));
    };
    document.head.appendChild(s);
  });
  return _xlsxLoadPromise;
}

async function downloadExcel(sheetName, headers, rows, filename) {
  const aoa = headers ? [headers, ...rows] : rows;
  const colCount = Math.max(1, ...(aoa.map(r => (r || []).length)));
  try {
    await ensureXlsxLoaded();
  } catch (e) {
    console.warn('[导出]', e);
  }
  if (typeof XLSX === 'undefined') {
    const csv = aoa.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.replace(/\.xlsx$/, '.csv');
    link.click();
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = Array.from({ length: colCount }, () => ({ wch: 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

function getProjectsBeforeTabFilters() {
  let list = getViewableProjects().filter(p => !isProjectArchived(p));
  if (state.projectSearch) {
    const q = state.projectSearch.toLowerCase();
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.manager || '').toLowerCase().includes(q) ||
      (p.dept || '').toLowerCase().includes(q)
    );
  }
  list = applyProjectDeptFilter(list);
  list = applyProjectManagerFilter(list);
  list = applyProjectRiskFilter(list);
  return list;
}

function applyProjectStatusFilter(list) {
  const filter = state.projectFilter || 'all';
  if (filter === 'all') return list;
  return list.filter(p => p.status === filter);
}

function applyProjectDeptFilter(list) {
  const dept = state.projectDept || 'all';
  if (dept === 'all') return list;
  return list.filter(p => p.dept === dept);
}

function applyProjectManagerFilter(list) {
  const manager = state.projectManager || 'all';
  if (manager === 'all') return list;
  return list.filter(p => (p.manager || '') === manager);
}

function projectHasOverdueTasks(project) {
  if (!project) return false;
  return tasks.some(t => t.projectId === project.id && t.status !== 'abolished' && isOverdue(t));
}

/** 计划结束日在今天起 days 天内（含今天），已过期不算 */
function projectEndsWithinDays(project, days) {
  const end = normalizeDateStr(project?.endDate);
  if (!end) return false;
  const daysUntil = diffCalendarDays(todayStr(), end);
  if (daysUntil == null) return false;
  return daysUntil >= 0 && daysUntil <= days;
}

function applyProjectRiskFilter(list) {
  const risk = state.projectRiskFilter || 'all';
  if (risk === 'overdue') return list.filter(p => projectHasOverdueTasks(p));
  if (risk === 'endingSoon') return list.filter(p => projectEndsWithinDays(p, 7));
  return list;
}

function getProjectManagerOptions() {
  const names = new Set();
  getViewableProjects().filter(p => !isProjectArchived(p)).forEach(p => {
    if (p.manager) names.add(p.manager);
  });
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

const PROJECT_STATUS_SORT_ORDER = { active: 0, planning: 1, paused: 2, done: 3 };

function projectEndDateSortKey(p) {
  return normalizeDateStr(p?.endDate) || '9999-99-99';
}

function sortProjectsForList(list) {
  const mode = state.projectSort || 'default';
  if (mode === 'progress') {
    const progressMap = new Map(list.map(p => [p.id, getProjectListStats(p).mainProgress]));
    return list.slice().sort((a, b) => {
      const diff = (progressMap.get(b.id) || 0) - (progressMap.get(a.id) || 0);
      if (diff !== 0) return diff;
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });
  }
  return list.slice().sort((a, b) => {
    if (mode === 'name') {
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    }
    if (mode === 'endDate') {
      const cmp = projectEndDateSortKey(a).localeCompare(projectEndDateSortKey(b));
      if (cmp !== 0) return cmp;
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    }
    const sa = PROJECT_STATUS_SORT_ORDER[a.status] ?? 9;
    const sb = PROJECT_STATUS_SORT_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    const cmp = projectEndDateSortKey(a).localeCompare(projectEndDateSortKey(b));
    if (cmp !== 0) return cmp;
    return (a.name || '').localeCompare(b.name || '', 'zh-CN');
  });
}

function resetProjectFilters() {
  state.projectSearch = '';
  state.projectFilter = 'all';
  state.projectDept = 'all';
  state.projectManager = 'all';
  state.projectRiskFilter = 'all';
  state.projectSort = 'default';
  render();
}

function getFilteredProjects() {
  let list = getProjectsBeforeTabFilters();
  list = applyProjectStatusFilter(list);
  return sortProjectsForList(list);
}

function applyTaskProjectTabFilter(list, tabId) {
  const tab = tabId || 'all';
  if (tab === 'all') return list;
  if (tab === TEMP_PROJECT_GROUP_KEY || tab === 'temp') {
    return list.filter(t => !t.projectId || t.type === 'temp');
  }
  if (tab === 'normal') return list.filter(t => t.type === 'normal' && t.projectId);
  return list.filter(t => t.projectId === tab);
}

function getFilteredTasksForExport() {
  let list = applyTaskProjectTabFilter(getTaskCenterBaseTasks(), state.taskTab || 'all')
    .filter(t => !isHiddenDoneSpecialTask(t));
  if (state.taskSearch) {
    const q = state.taskSearch.toLowerCase();
    list = list.filter(t => {
      const parent = t.parentId ? tasks.find(pt => pt.id === t.parentId) : null;
      const projectLabel = getTaskProjectLabel(t).toLowerCase();
      return t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        projectLabel.includes(q) ||
        (parent && parent.title.toLowerCase().includes(q));
    });
  }
  return list;
}

function getFilteredTeamStats() {
  const selectedDept = state.teamDept || 'all';
  const weekRange = getCurrentWeekRange();
  let filteredMembers = getDeptScopeUsers();
  if (isFullAccess(currentUser.role) && selectedDept !== 'all') {
    filteredMembers = filteredMembers.filter(u => u.dept === selectedDept);
  }
  if (state.teamSearch) {
    const q = state.teamSearch.toLowerCase();
    filteredMembers = filteredMembers.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.position.toLowerCase().includes(q) ||
      u.dept.toLowerCase().includes(q)
    );
  }
  return filteredMembers.map(u => {
    const userTasks = tasks.filter(t => t.assignee === u.name && !isMilestoneTask(t));
    const total = userTasks.length;
    const doing = userTasks.filter(t => t.status === 'doing').length;
    const todo = userTasks.filter(t => t.status === 'todo').length;
    const done = userTasks.filter(t => t.status === 'done').length;
    const overdue = userTasks.filter(t => isOverdue(t)).length;
    const weeklyBreakdown = getMemberWeeklyHoursBreakdown(u.name, weekRange);
    const weeklyHours = weeklyBreakdown.totalHours;
    const originalPlannedHours = weeklyBreakdown.originalPlannedHours || 0;
    const standardWeekHours = u.standardWeekHours || 60;
    const saturation = Math.min(100, Math.round(weeklyHours / standardWeekHours * 100));
    const roleName = roleDisplayName(u.role);
    return { ...u, total, doing, todo, done, overdue, weeklyHours, originalPlannedHours, weeklyBreakdown, saturation, roleName, completionRate: total > 0 ? Math.round(done / total * 100) : 0, weekRange, pendingBlockedHours: weeklyBreakdown.pendingBlockedHours || 0 };
  });
}

function sortTeamMembers(list) {
  const sort = state.teamSort || 'saturation_desc';
  const arr = list.slice();
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh-CN');
  switch (sort) {
    case 'saturation_asc':
      return arr.sort((a, b) => a.saturation - b.saturation || byName(a, b));
    case 'weeklyHours_desc':
      return arr.sort((a, b) => b.weeklyHours - a.weeklyHours || b.saturation - a.saturation || byName(a, b));
    case 'weeklyHours_asc':
      return arr.sort((a, b) => a.weeklyHours - b.weeklyHours || a.saturation - b.saturation || byName(a, b));
    case 'name':
      return arr.sort(byName);
    case 'saturation_desc':
    default:
      return arr.sort((a, b) => b.saturation - a.saturation || b.weeklyHours - a.weeklyHours || byName(a, b));
  }
}

function setTeamSort(key) {
  state.teamSort = key;
  render();
}

async function exportProjects() {
  const list = getFilteredProjects();
  if (!list.length) { alert('当前没有可导出的项目'); return; }
  const headers = ['项目编号', '项目名称', '所属部门', '负责人', '状态', '开始日期', '结束日期', '进度(%)', '里程碑数', '总任务数', '项目描述'];
  const rows = list.map(p => {
    const stats = getProjectListStats(p);
    const pst = projectStatusMap[p.status] || projectStatusMap.active;
    return [p.id, p.name, p.dept, p.manager, pst.label, p.startDate || '', p.endDate || '', stats.progress, stats.mainCount, stats.total, p.desc || ''];
  });
  await downloadExcel('项目列表', headers, rows, `项目列表_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportTasks() {
  const list = getFilteredTasksForExport();
  if (!list.length) { alert('当前没有可导出的任务'); return; }
  const headers = ['任务编号', '任务名称', '所属项目', '负责人', '任务类型', '状态', '优先级', '截止日期', '进度(%)', '预计工时', '实际工时', '创建时间', '任务描述'];
  const priorityLabel = { urgent: '紧急', important: '重要', normal: '普通' };
  const rows = list.map(t => {
    const project = projects.find(p => p.id === t.projectId);
    const st = statusMap[t.status] || statusMap.todo;
    return [
      t.id, t.title, project ? project.name : '临时任务', t.assignee,
      t.type === 'temp' ? '临时' : '常规', st.label,
      priorityLabel[t.priority] || '普通', t.dueDate || '', t.progress || 0,
      t.estimatedHours || 0, t.actualHours || 0, formatTaskCreatedAt(t.createdAt), t.desc || '',
    ];
  });
  await downloadExcel('任务列表', headers, rows, `任务列表_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportTeam() {
  const stats = sortTeamMembers(getFilteredTeamStats());
  if (!stats.length) { alert('当前没有可导出的团队数据'); return; }
  const headers = ['姓名', '部门', '职位', '角色', '总任务', '进行中', '待开始', '已完成', '已逾期', '本周原计划工时', '当周待处理工时', '当周饱和度(%)', '完成率(%)'];
  const rows = stats.map(m => [
    m.name, m.dept, m.position, m.roleName,
    m.total, m.doing, m.todo, m.done, m.overdue,
    m.originalPlannedHours, m.weeklyHours, m.saturation, m.completionRate,
  ]);
  await downloadExcel('团队管理', headers, rows, `团队管理_${new Date().toISOString().split('T')[0]}.xlsx`);
}
