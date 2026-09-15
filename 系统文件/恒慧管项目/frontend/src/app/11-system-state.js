// ========== 系统状态 ==========
let state = {
  page: 'dashboard',
  prevPage: null,
  taskTab: 'all',
  taskScopeTab: 'mine',
  taskCenterDept: 'all',
  todoListTab: 'all',
  todoTypeFilter: 'all',
  todoPriorityFilter: 'all',
  todoDueFilter: 'all',
  todoPage: 1,
  todoPageSize: 20,
  todoViewMode: 'all', // all | mine | created | handled
  todoViewLayout: 'board', // board | list
  projectDetailTab: 'work', // overview | work | plan（问题与记录）
  projectDetailMoreOpen: false,
  projectPlanView: 'table', // table | gantt | list（任务页内，默认列表）
  detailMilestoneId: '', // 任务页：当前里程碑轨 id（__unassigned__=未归属）
  detailTaskScope: 'all', // all | mine
  detailTaskStatusFilter: 'all', // all | doing | todo | done
  detailTaskQuery: '',
  workViewReturn: null, // 从表格/甘特跳去清单填写时记住来源视图
  planScrollAnchor: null, // 计划书编辑后滚到的元素 id
  deliveryFilter: 'all', // all | empty | partial | complete
  deliveryExpandedId: null,
  deliveryExpandedField: null,
  deliveryOpenTaskIds: {},
  projectChangePage: 1,
  taskEditInline: false,
  inlineDeliveryEditId: null,
  uiScrollMain: 0,
  uiScrollWindow: 0,
  navOpen: { todo: true, project: true, team: true, more: true },
  settingsOpen: false,
  showModal: null,
  form: {},
  taskViewStack: [],
  roleFilter: 'all',
  // 各页面搜索关键词
  projectSearch: '',
  projectFilter: 'all',
  projectDept: 'all',
  projectManager: 'all',
  projectRiskFilter: 'all',
  projectSort: 'default',
  projectExpandedId: null,
  taskSearch: '',
  staffSearch: '',
  staffKindFilter: 'all',
  staffSelectedDept: '信息中心',
  staffExpandedDepts: { '信息中心': true, '财务中心': true },
  staffDetailId: null,
  scopedKeyStatusByUser: {},
  scopedKeyStatusLoaded: false,
  staffDingTalkOpen: false,
  teamSearch: '',
  teamSort: 'saturation_desc',
  authError: null,
  dingTalkSyncing: false,
  syncFeedback: null,
  syncHighlightIds: [],
  pendingSystemUpdates: [],
  systemUpdatesList: [],
  systemUpdateSearch: '',
  inboxOpen: false,
  inboxItems: [],
  inboxUnreadCount: 0,
  inboxLoading: false,
  collabDropdownOpen: null,
  todoActionMenuTaskId: null,
  uiSections: {},
  sqlToolGuids: '',
  sqlToolIsClearing: '0',
  textPolishDraft: '',
  textPolishExtra: '',
  textPolishScene: 'vendor',
  textPolishModel: '',
  textPolishResult: '',
  textPolishLoading: false,
  textPolishSavingModels: false,
  textPolishError: null,
  textPolishOptions: null,
  textPolishOptionsLoaded: false,
  textPolishManageOpen: false,
  textPolishModelsDraft: '',
  textPolishDefaultDraft: '',
  textPolishBaseUrlDraft: '',
  textPolishApiKeyDraft: '',
  textPolishTemplatesOpen: false,
  textPolishSavingTemplate: false,
  textPolishSendingChat: false,
  dataSecurityTab: 'database',
  dataSecurityLoading: false,
  dataSecurityError: null,
  dataSecurityData: null,
  dataSecurityApiAuthFilter: 'all',
  dataSecurityApiRiskFilter: 'all',
  rolePermissions: null,
  permCatalog: null,
  permDraft: null,
  permLoading: false,
  permSaving: false,
  permError: null,
  permCanEdit: false,
  permDirty: false,
  kpiYearMonth: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })(),
  kpiPlans: [],
  kpiPlansLoading: false,
  kpiCanViewAll: false,
  kpiMonthOptions: ['2026-08'],
  kpiAssigneeFilter: null,
  kpiDeptFilter: 'all',
  kpiDepts: [],
  kpiFirstBootstrapMonth: '2026-08',
  kpiPlanLogs: [],
  editingProjectFocus: false,
};

let authSession = {
  token: null,
  refreshToken: null,
  dingTalkUserId: null,
  loginSource: 'demo', // demo | dingtalk_userid | dingtalk_oauth | dingtalk_miniapp
  expiresAt: null,
};

/** 留言草稿：待发送图片、@ 筛选词 */
let commentDrafts = {};
const fileObjectUrlCache = new Map();
let taskCommentMentionTaskId = null;
let taskCommentMentionScrollBound = false;
/** 已成功同步到服务端的日志 id（其余为待增量上传） */
let changeLogsSyncedIds = new Set();
let transferLogsSyncedIds = new Set();

const STORAGE_KEY = 'henghuiguan_data';

const DataService = {
  _saveTimer: null,
  _syncing: false,
  _serverReady: false,

  mergePayload(data) {
    this.applyServerPayload(data, { mergeUsers: true });
  },

  /** 从服务端加载：钉钉模式下整表替换，并按角色只保留可见数据 */
  applyServerPayload(data, opts = {}) {
    const mergeUsers = opts.mergeUsers === true;
    if (Array.isArray(data.projects)) {
      const localById = new Map(projects.map(p => [p.id, p]));
      const pendingLocalSave = !!(this._saveTimer || this._syncing);
      projects = data.projects.map(p => {
        const local = localById.get(p.id);
        const merged = normalizeProjectRecord(local ? { ...local, ...p } : { ...p });
        if (local && pendingLocalSave && canUserSyncProject(local)) {
          merged.currentPhase = String(local.currentPhase || '').trim();
          merged.nextPlan = String(local.nextPlan || '').trim();
          merged.blocker = String(local.blocker || '').trim();
          // 本地刚归档、尚未 sync 完成时，勿被服务端旧快照冲回未归档
          if (isProjectArchived(local)) {
            merged.archived = true;
            merged.status = 'archived';
          }
        }
        return merged;
      });
      normalizeAllProjects();
    }
    if (Array.isArray(data.tasks)) {
      tasks = data.tasks.slice();
      normalizeAllTaskCollaborators();
      normalizeDoneTaskProgress(tasks);
    }
    backfillTaskAttachmentsToProjectsLocal();
    if (Array.isArray(data.taskDependencies)) taskDependencies = data.taskDependencies.slice();
    else if (!taskDependencies.length) taskDependencies = [];
    refreshAllDependencySchedules();
    if (Array.isArray(data.changeLogs)) changeLogs = data.changeLogs.slice();
    if (Array.isArray(data.transferLogs)) transferLogs = data.transferLogs.slice();
    if (Array.isArray(data.pushLogs)) pushLogs = data.pushLogs.slice();
    if (Array.isArray(data.issues)) issues = data.issues.slice();
    if (Array.isArray(data.projectTemplates)) projectTemplates = data.projectTemplates.slice();
    resetLogSyncState();
    if (data.workCalendar) applyWorkCalendar(data.workCalendar);
    if (data.rolePermissions && typeof data.rolePermissions === 'object') {
      state.rolePermissions = data.rolePermissions;
    }
    if (Array.isArray(data.users)) {
      if ((ApiConfig.enabled || AuthService.isDingTalkMode()) && !mergeUsers) {
        users = data.users.slice();
      } else {
        data.users.forEach(saved => {
          const idx = users.findIndex(u => u.id === saved.id);
          if (idx >= 0) users[idx] = { ...users[idx], ...saved };
          else users.push(saved);
        });
      }
    }
    if (Array.isArray(data.allUsers) && data.allUsers.length) {
      allStaffUsers = data.allUsers.slice();
    } else if (Array.isArray(data.allStaffUsers) && data.allStaffUsers.length) {
      allStaffUsers = data.allStaffUsers.slice();
    } else if (Array.isArray(data.users) && data.users.length && !allStaffUsers.length) {
      allStaffUsers = data.users.slice();
    }
    if (Array.isArray(data.staffDeptCatalog)) {
      applyStaffDeptCatalog(data.staffDeptCatalog);
      syncDepartmentsAlias();
    }
    const meId = data.currentUserId || currentUser.id;
    const me = users.find(u => u.id === meId)
      || users.find(u => u.dingTalkUserId && u.dingTalkUserId === authSession.dingTalkUserId);
    if (me) currentUser = me;
  },

  cancelScheduledSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
  },

  applyAllUsersFromServer(list) {
    if (!Array.isArray(list)) return;
    users = list.slice();
    allStaffUsers = list.slice();
    this._serverReady = true;
    const meId = currentUser.id;
    const me = users.find(u => u.id === meId)
      || users.find(u => u.dingTalkUserId && u.dingTalkUserId === authSession.dingTalkUserId);
    if (me) currentUser = me;
  },

  applyUserUpdates(updatedList) {
    if (!Array.isArray(updatedList)) return;
    updatedList.forEach(saved => {
      const idx = users.findIndex(u => u.id === saved.id);
      if (idx >= 0) users[idx] = { ...users[idx], ...saved };
      else users.push(saved);
      const allIdx = allStaffUsers.findIndex(u => u.id === saved.id);
      if (allIdx >= 0) allStaffUsers[allIdx] = { ...allStaffUsers[allIdx], ...saved };
      else if (saved?.id) allStaffUsers.push(saved);
    });
    const meId = currentUser.id;
    const me = users.find(u => u.id === meId)
      || users.find(u => u.dingTalkUserId && u.dingTalkUserId === authSession.dingTalkUserId);
    if (me) currentUser = me;
  },

  async loadFromServer(opts = {}) {
    if (!ApiConfig.enabled || !authSession.token) return false;
    const timeoutMs = opts.timeout || ApiConfig.timeout;
    try {
      const res = await fetch(ApiConfig.baseUrl + '/data/bootstrap', {
        headers: { ...AuthService.getAuthHeaders() },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || '加载失败');
      // 拉取完成前若本地已有未同步写入，跳过覆盖，避免冲掉刚完成的任务
      if (typeof opts.beforeApply === 'function' && !opts.beforeApply()) return false;
      this.applyServerPayload(data, { mergeUsers: opts.mergeUsers === true });
      this._serverReady = true;
      if (data.storeRevision != null && typeof RealtimeService !== 'undefined') {
        const rev = Number(data.storeRevision);
        if (!Number.isNaN(rev) && rev > RealtimeService._lastRev) RealtimeService._lastRev = rev;
      }
      persistLocalCache();
      console.log('[数据] 已从服务端加载', currentUser.name, currentUser.role,
        projects.length, '个项目、', tasks.length, '个任务');
      return true;
    } catch (e) {
      console.warn('[数据] 服务端加载失败，使用本地数据', e);
      this._serverReady = false;
      return false;
    }
  },

  scheduleSave(opts = {}) {
    if (!ApiConfig.enabled || !authSession.token) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.syncToServer(opts), 600);
  },

  async syncToServer(opts = {}) {
    if (!ApiConfig.enabled || !authSession.token || this._syncing) return false;
    const removedProjectIds = Array.isArray(opts.removedProjectIds)
      ? opts.removedProjectIds.filter(id => id != null && String(id).trim()).map(id => String(id))
      : [];
    const removedTaskIds = Array.isArray(opts.removedTaskIds)
      ? opts.removedTaskIds.filter(id => id != null && String(id).trim()).map(id => String(id))
      : [];
    const hasExplicitRemovals = removedProjectIds.length > 0 || removedTaskIds.length > 0;
    if (!opts.forceEmpty && !hasExplicitRemovals && projects.length === 0 && tasks.length === 0) {
      console.warn('[数据] 本地 projects/tasks 为空，跳过同步以免覆盖服务端');
      return false;
    }
    this._syncing = true;
    backfillTaskAttachmentsToProjectsLocal();
    const includeUsers = !opts.skipUsers && this._serverReady && isFullAccess(currentUser.role);
    const includeManagerUserUpdates = !opts.skipUsers && this._serverReady && currentUser.role === 'manager';
    const syncProjects = isFullAccess(currentUser.role)
      ? projects
      : projects.filter(p => canUserSyncProject(p));
    const syncTasks = isFullAccess(currentUser.role)
      ? tasks
      : tasks.filter(t => canUserSyncTask(t));
    const syncDeps = isFullAccess(currentUser.role)
      ? taskDependencies
      : taskDependencies.filter(dep => {
        const pred = tasks.find(t => t.id === dep.predecessorTaskId);
        const succ = tasks.find(t => t.id === dep.successorTaskId);
        return (succ && canEditTask(succ)) || (pred && canEditTask(pred));
      });
    try {
      const res = await fetch(ApiConfig.baseUrl + '/data/sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
        body: JSON.stringify({
          projects: syncProjects, tasks: syncTasks, taskDependencies: syncDeps,
          changeLogUpdates: getPendingChangeLogs(),
          transferLogUpdates: getPendingTransferLogs(),
          issueUpdates: issues,
          ...(removedProjectIds.length ? { removedProjectIds } : {}),
          ...(removedTaskIds.length ? { removedTaskIds } : {}),
          ...(includeUsers ? { users } : {}),
          ...(includeManagerUserUpdates ? {
            userUpdates: users.filter(u => u.dept === currentUser.dept && u.role === 'staff'),
          } : {}),
        }),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await res.json();
      if (!data.success) {
        console.warn('[数据] 同步失败', data.message);
        return false;
      }
      markLogsSynced();
      persistLocalCache();
      return true;
    } catch (e) {
      console.warn('[数据] 同步异常', e);
      return false;
    } finally {
      this._syncing = false;
    }
  },
};

function resetLogSyncState() {
  changeLogsSyncedIds = new Set(changeLogs.filter(l => l?.id).map(l => l.id));
  transferLogsSyncedIds = new Set(transferLogs.filter(l => l?.id).map(l => l.id));
}

function appendChangeLogEntry(entry) {
  const log = { ...entry };
  if (!log.id) log.id = genId('L');
  changeLogs.unshift(log);
  return log;
}

const LOG_FIELD_LABELS = {
  title: '标题',
  status: '状态',
  progress: '进度',
  assignee: '负责人',
  planStartDate: '计划开始',
  estimatedHours: '预计工时',
  dueDate: '截止日期',
  priority: '优先级',
  desc: '任务描述',
  informCollaborators: '告知性协办人',
  assistCollaborators: '辅助性协办人',
  milestoneSeq: 'M序号',
  roleA: 'A唯一交付人',
  roleR: 'R直接执行人',
  roleC: 'C协作人',
  roleV: 'V业务验收人',
  deliverables: '交付物',
  acceptanceCriteria: '验收标准',
  completionEvidence: '完成证据',
  verification: '验收记录',
  feedback: '业务反馈',
  leftover: '遗留问题',
  outOfScope: '不交什么',
  originalPlanStartDate: '原定开始',
  originalDueDate: '原定截止',
  changeReason: '变更原因',
  depsRisks: '依赖/风险',
  escalation: '升级条件',
  delayImpact: '延期影响',
  reopenConditions: '重开条件',
};

const LOG_DESC_MAX_LEN = 80;

function normalizeCollaboratorListForLog(names) {
  const list = Array.isArray(names)
    ? names.filter(n => n && String(n).trim()).map(n => String(n).trim())
    : (names ? [String(names).trim()].filter(Boolean) : []);
  return [...new Set(list)].sort((a, b) => a.localeCompare(b, 'zh'));
}

function formatCollaboratorListForLog(names) {
  const list = normalizeCollaboratorListForLog(names);
  return list.length ? list.join('、') : '无';
}

function truncateLogDesc(text) {
  const s = text == null ? '' : String(text);
  if (s.length <= LOG_DESC_MAX_LEN) return s;
  return `${s.slice(0, LOG_DESC_MAX_LEN)}…`;
}

function getTaskChangeFieldValue(source, key, { isForm = false } = {}) {
  if (!source) return key === 'informCollaborators' || key === 'assistCollaborators' ? [] : '';
  if (key === 'informCollaborators') {
    if (isForm) return getTaskFormCollaboratorNames(source, COLLAB_TYPE_INFORM, source);
    return getCollaboratorEntries(source, { type: COLLAB_TYPE_INFORM, excludeRejected: true }).map(e => e.userName);
  }
  if (key === 'assistCollaborators') {
    if (isForm) return getTaskFormCollaboratorNames(source, COLLAB_TYPE_ASSIST, source);
    return getCollaboratorEntries(source, { type: COLLAB_TYPE_ASSIST, excludeRejected: true }).map(e => e.userName);
  }
  return source[key];
}

function formatLogFieldValue(key, value) {
  if (key === 'informCollaborators' || key === 'assistCollaborators') {
    return formatCollaboratorListForLog(value);
  }
  if (value === null || value === undefined || value === '') return '空';
  if (key === 'status') return statusMap[value]?.label || String(value);
  if (key === 'priority') return priorityMap[value]?.label || String(value);
  if (key === 'desc') return truncateLogDesc(value) || '空';
  if (key === 'progress') {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}%` : String(value);
  }
  if (key === 'estimatedHours') {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}小时` : String(value);
  }
  return String(value);
}

function normalizeLogCompareValue(key, value) {
  if (key === 'informCollaborators' || key === 'assistCollaborators') {
    return formatCollaboratorListForLog(value);
  }
  if (key === 'progress' || key === 'estimatedHours') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (key === 'desc') return String(value == null ? '' : value).trim();
  if (key === 'priority') return value || 'normal';
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildTaskChangeDiff(beforeTask, afterForm) {
  const keys = [
    'title', 'status', 'progress', 'assignee', 'planStartDate', 'estimatedHours', 'dueDate',
    'priority', 'desc', 'informCollaborators', 'assistCollaborators',
    'milestoneSeq', 'roleA', 'roleR', 'roleC', 'roleV',
    'deliverables', 'acceptanceCriteria', 'completionEvidence', 'outOfScope',
    'verification', 'feedback', 'leftover',
    'depsRisks', 'escalation', 'delayImpact', 'reopenConditions',
  ];
  const diffs = [];
  keys.forEach(key => {
    const beforeVal = getTaskChangeFieldValue(beforeTask, key, { isForm: false });
    const afterVal = getTaskChangeFieldValue(afterForm, key, { isForm: true });
    if (normalizeLogCompareValue(key, beforeVal) === normalizeLogCompareValue(key, afterVal)) return;
    diffs.push({
      key,
      label: LOG_FIELD_LABELS[key] || key,
      before: beforeVal,
      after: afterVal,
    });
  });
  return diffs;
}

function formatChangeDiffText(diffs, side) {
  if (!diffs || diffs.length === 0) {
    return '（无字段变更）';
  }
  return diffs.map(d => `${d.label}：${formatLogFieldValue(d.key, side === 'after' ? d.after : d.before)}`).join('\n');
}

function formatSnapshotObject(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const keys = [
    'title', 'status', 'progress', 'assignee', 'planStartDate', 'estimatedHours', 'dueDate',
    'priority', 'desc', 'informCollaborators', 'assistCollaborators',
  ].filter(k => Object.prototype.hasOwnProperty.call(obj, k));
  if (keys.length === 0) return '';
  return keys.map(k => `${LOG_FIELD_LABELS[k] || k}：${formatLogFieldValue(k, obj[k])}`).join('\n');
}

function formatLogCell(raw) {
  if (raw === null || raw === undefined) return '';
  if (typeof raw !== 'string') return String(raw);
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const formatted = formatSnapshotObject(parsed);
      if (formatted) return formatted;
    } catch (_) { /* 非 JSON，按原文展示 */ }
  }
  return raw;
}

function appendTransferLogEntry(entry) {
  const log = { ...entry };
  if (!log.id) log.id = genId('TR');
  transferLogs.unshift(log);
  return log;
}

function getPendingChangeLogs() {
  return changeLogs.filter(l => l?.id && !changeLogsSyncedIds.has(l.id));
}

function getPendingTransferLogs() {
  return transferLogs.filter(l => l?.id && !transferLogsSyncedIds.has(l.id));
}

function markLogsSynced() {
  getPendingChangeLogs().forEach(l => changeLogsSyncedIds.add(l.id));
  getPendingTransferLogs().forEach(l => transferLogsSyncedIds.add(l.id));
}

function persistLocalCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      projects,
      tasks,
      taskDependencies,
      changeLogs,
      transferLogs,
      issues,
      users,
      allStaffUsers,
      currentUserId: currentUser.id,
      pushLogs,
      pushSentKeys: [...pushSentKeys],
      authSession,
    }));
  } catch (e) {
    console.warn('本地缓存写入失败', e);
  }
}

/** 服务端无业务数据时，尝试从浏览器 localStorage 恢复（常见于改版后强刷） */
function tryRecoverFromLocalStorage() {
  if (!ApiConfig.enabled || !authSession.token) return false;
  if (projects.length || tasks.length) return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const localProjects = Array.isArray(data.projects) ? data.projects : [];
    const localTasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (!localProjects.length && !localTasks.length) return false;
    DataService.mergePayload(data, { mergeUsers: true });
    console.log('[数据] 已从浏览器缓存恢复', localProjects.length, '个项目、', localTasks.length, '个任务');
    DataService.syncToServer({ skipUsers: !isFullAccess(currentUser.role) });
    return true;
  } catch (e) {
    console.warn('[数据] 浏览器缓存恢复失败', e);
    return false;
  }
}

function save(opts = {}) {
  normalizeDoneTaskProgress(tasks);
  persistLocalCache();
  if (ApiConfig.enabled && authSession.token) {
    if (opts.immediateSync) {
      clearTimeout(DataService._saveTimer);
      DataService.syncToServer(opts);
    } else {
      DataService.scheduleSave(opts);
    }
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (ApiConfig.enabled) {
      if (data.authSession && typeof data.authSession === 'object') {
        authSession = { ...authSession, ...data.authSession };
      }
      if (data.currentUserId) {
        const user = users.find(u => u.id === data.currentUserId);
        if (user) currentUser = user;
      }
      if (Array.isArray(data.pushSentKeys)) pushSentKeys = new Set(data.pushSentKeys);
      return;
    }
    DataService.mergePayload(data);
    if (Array.isArray(data.taskDependencies)) taskDependencies = data.taskDependencies.slice();
    refreshAllDependencySchedules();
    if (data.currentUserId) {
      const user = users.find(u => u.id === data.currentUserId);
      if (user) currentUser = user;
    }
    if (Array.isArray(data.pushSentKeys)) pushSentKeys = new Set(data.pushSentKeys);
    if (data.authSession && typeof data.authSession === 'object') authSession = { ...authSession, ...data.authSession };
  } catch (e) {
    console.warn('数据加载失败', e);
  }
}

/** 正式环境不再自动注入演示/功能确认测试数据 */
function seedConfirmTestData() {}
