const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../config');
const { backupJsonFile } = require('../utils/backup');
const { mergeProjectDocuments } = require('../utils/projectDocuments');
const {
  defaultStaffDeptCatalog,
  normalizeStaffDeptCatalog,
  normalizeProfileKind,
} = require('../utils/staffProfile');

const DEFAULT_STORE = {
  users: [],
  projects: [],
  tasks: [],
  taskDependencies: [],
  changeLogs: [],
  transferLogs: [],
  pushLogs: [],
  notifications: [],
  workCalendar: null,
  rolePermissions: null,
  llmSettings: null,
  systemUpdates: [],
  performanceTemplates: [],
  performanceCycles: [],
  performanceAssessments: [],
  workReports: [],
  kpiPlans: [],
  staffDeptCatalog: defaultStaffDeptCatalog(),
  apiKeys: [],
  issues: [],
  projectTemplates: [],
};

let store = null;
let storePath = null;
/** 当前内存库对应的磁盘 mtime；用于判断是否需从磁盘刷新 */
let storeFileMtimeMs = null;
/** MySQL 驱动下最近一次成功落盘时间戳（ms） */
let storeMysqlSyncedAt = null;
/** MySQL 读取失败时为 true，禁止 seed/落盘以免覆盖正式数据 */
let storeLoadFailed = false;

function useMysql() {
  return config.dbDriver === 'mysql';
}

function mysqlWorkerPath() {
  return path.join(__dirname, 'mysqlStoreWorker.js');
}

function runMysqlWorker(cmd, filePath) {
  const r = spawnSync(process.execPath, [mysqlWorkerPath(), cmd, filePath], {
    encoding: 'utf8',
    env: process.env,
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim() || `mysql worker exit ${r.status}`;
    throw new Error(err);
  }
  return r;
}

function getStorePath() {
  if (!storePath) {
    storePath = config.dbPath.endsWith('.json')
      ? config.dbPath
      : config.dbPath.replace(/\.db$/i, '.json');
  }
  return storePath;
}

function getStoreFileMtimeMs() {
  if (useMysql()) return storeMysqlSyncedAt;
  const file = getStorePath();
  try {
    if (!fs.existsSync(file)) return null;
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function sanitizeProjectTeamMembers(manager, teamMembers) {
  return [...new Set((teamMembers || []).filter(n => n && n !== manager))];
}

function normalizeProjectRecord(project) {
  if (!project) return project;
  if (project.archived === true || project.status === 'archived') {
    project.archived = true;
    project.status = 'archived';
  } else if (project.archived == null) {
    project.archived = false;
  }
  if (!Array.isArray(project.teamMembers)) project.teamMembers = [];
  project.teamMembers = sanitizeProjectTeamMembers(project.manager, project.teamMembers);
  project.currentPhase = String(project.currentPhase || '').trim();
  project.nextPlan = String(project.nextPlan || '').trim();
  project.blocker = String(project.blocker || '').trim();
  project.objective = String(project.objective || '').trim();
  project.value = String(project.value || '').trim();
  project.scope = String(project.scope || '').trim();
  project.outOfScope = String(project.outOfScope || '').trim();
  project.planVerified = project.planVerified === true;
  project.planVerifiedBy = String(project.planVerifiedBy || '').trim();
  project.planVerifiedAt = String(project.planVerifiedAt || '').trim();
  if (!Array.isArray(project.handoverRecords)) project.handoverRecords = [];
  project.originalEndDate = project.originalEndDate || '';
  project.changeReason = String(project.changeReason || '').trim();
  project.phaseSyncedAt = String(project.phaseSyncedAt || '').trim();
  project.phaseDriverMilestoneId = String(project.phaseDriverMilestoneId || '').trim();
  if (!Array.isArray(project.stakeholders)) project.stakeholders = [];
  if (!Array.isArray(project.commPlans)) project.commPlans = [];
  if (!Array.isArray(project.qualityChecks)) project.qualityChecks = [];
  if (!Array.isArray(project.risks)) project.risks = [];
  if (!Array.isArray(project.budgetLines)) project.budgetLines = [];
  if (!Array.isArray(project.documents)) project.documents = [];
  return project;
}

function normalizeAllProjects(projects) {
  (projects || []).forEach(normalizeProjectRecord);
}

function ensureStaffDeptCatalog(s) {
  const before = JSON.stringify(s.staffDeptCatalog || null);
  s.staffDeptCatalog = normalizeStaffDeptCatalog(s.staffDeptCatalog);
  return JSON.stringify(s.staffDeptCatalog) !== before;
}

function normalizeUserProfileKinds(users) {
  let changed = false;
  (users || []).forEach(u => {
    if (!u) return;
    // 取消通知联系人：存量 contact 升为可登录执行人员（特权角色保留）
    const kind = normalizeProfileKind(u.profileKind);
    if (u.profileKind !== kind) {
      u.profileKind = kind;
      changed = true;
    }
    if (u.profileKind === 'member' && !u.role) {
      u.role = 'staff';
      changed = true;
    }
  });
  return changed;
}

function finalizeLoadedStore(dirtyHint = false) {
  normalizeAllProjects(store.projects);
  let dirty = ensureStaffDeptCatalog(store) || dirtyHint;
  dirty = normalizeUserProfileKinds(store.users) || dirty;
  try {
    const { ensureProjectTemplates, repairWmsM0FalseMilestones } = require('../services/projectTemplates');
    const before = JSON.stringify(store.projectTemplates || []);
    ensureProjectTemplates(store);
    if (JSON.stringify(store.projectTemplates || []) !== before) dirty = true;
    if (repairWmsM0FalseMilestones(store) > 0) dirty = true;
  } catch (e) {
    console.warn('[db] ensureProjectTemplates', e.message);
  }
  if (dirty) persistStore();
  return store;
}

function loadStoreFromMysql() {
  const tmp = path.join(os.tmpdir(), `hhg-mysql-load-${process.pid}.json`);
  storeLoadFailed = false;
  try {
    runMysqlWorker('load', tmp);
    const raw = fs.readFileSync(tmp, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed == null) {
      store = structuredClone(DEFAULT_STORE);
      persistStore();
      return store;
    }
    store = { ...structuredClone(DEFAULT_STORE), ...parsed };
    storeMysqlSyncedAt = Date.now();
    storeFileMtimeMs = storeMysqlSyncedAt;
    return finalizeLoadedStore(false);
  } catch (e) {
    storeLoadFailed = true;
    console.error('[db] MySQL 读取失败，内存为空库且禁止写入/初始化', e.message);
    console.error('[db] 请先启动 MySQL（D:\\HHG_MYSQL\\start-mysql.bat），再重启恒慧管后端');
    store = structuredClone(DEFAULT_STORE);
    storeMysqlSyncedAt = null;
    storeFileMtimeMs = null;
    return store;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function loadStoreFromDisk() {
  if (useMysql()) return loadStoreFromMysql();

  const file = getStorePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(file)) {
    store = structuredClone(DEFAULT_STORE);
    persistStore();
    return store;
  }

  try {
    const raw = fs.readFileSync(file, 'utf8');
    store = { ...structuredClone(DEFAULT_STORE), ...JSON.parse(raw) };
    storeFileMtimeMs = getStoreFileMtimeMs();
    return finalizeLoadedStore(false);
  } catch (e) {
    console.warn('[db] 读取失败，使用空库', e.message);
    store = structuredClone(DEFAULT_STORE);
    storeFileMtimeMs = null;
  }
  return store;
}

function getStore() {
  if (!store) loadStoreFromDisk();
  return store;
}

/** 强制从磁盘/MySQL 重新加载（改库后或排查数据不一致时使用） */
function reloadStoreFromDisk() {
  store = null;
  storeFileMtimeMs = null;
  storeMysqlSyncedAt = null;
  storeLoadFailed = false;
  return loadStoreFromDisk();
}

function isStoreLoadFailed() {
  return storeLoadFailed === true;
}

/**
 * 仅当磁盘文件比内存新（外部改库 / 其它进程写入）时才重读；
 * 常驻进程内 bootstrap 应走此路径，避免每次打开都 JSON.parse 整库。
 * MySQL 模式下默认不主动重拉（同进程内以内存为准）。
 */
function reloadStoreFromDiskIfStale() {
  if (!store) return loadStoreFromDisk();
  if (useMysql()) return store;
  const mtime = getStoreFileMtimeMs();
  if (mtime == null) return store;
  if (storeFileMtimeMs == null || mtime > storeFileMtimeMs) {
    return reloadStoreFromDisk();
  }
  return store;
}

function persistStoreToMysql() {
  if (storeLoadFailed) {
    console.error('[db] MySQL 未成功加载，已拒绝写入以防覆盖正式数据');
    return false;
  }
  const tmp = path.join(os.tmpdir(), `hhg-mysql-save-${process.pid}.json`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
    runMysqlWorker('save', tmp);
    storeMysqlSyncedAt = Date.now();
    storeFileMtimeMs = storeMysqlSyncedAt;
    return true;
  } catch (e) {
    console.error('[db] MySQL 写入失败（数据仍在内存中）:', e.message);
    return false;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function persistStore() {
  if (useMysql()) return persistStoreToMysql();

  const file = getStorePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) backupJsonFile(file);
  const content = JSON.stringify(store);
  const tmp = file + '.tmp';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      try {
        fs.renameSync(tmp, file);
      } catch {
        // Windows 下 json 可能被占用，降级为直接覆盖写入
        fs.writeFileSync(file, content, 'utf8');
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      }
      storeFileMtimeMs = getStoreFileMtimeMs();
      return true;
    } catch (e) {
      if (attempt >= 2) {
        console.error('[db] 写入失败（数据仍在内存中）:', e.message);
        return false;
      }
    }
  }
  return false;
}

function getDb() {
  return getStore();
}

function rowToUser(row) {
  return { ...row };
}

function upsertUser(user) {
  const s = getStore();
  const idx = s.users.findIndex(u => u.id === user.id);
  if (idx >= 0) s.users[idx] = { ...s.users[idx], ...user };
  else s.users.push(user);
  persistStore();
}

function getAllUsers() {
  return [...getStore().users];
}

function findUserById(id) {
  return getStore().users.find(u => u.id === id) || null;
}

function findUserByDingTalkId(dingTalkUserId) {
  if (!dingTalkUserId) return null;
  return getStore().users.find(u =>
    u.dingTalkUserId === dingTalkUserId || u.id === dingTalkUserId
  ) || null;
}

function getAllProjects() {
  return [...getStore().projects];
}

function getAllTasks() {
  return [...getStore().tasks];
}

function getAllTaskDependencies() {
  return [...(getStore().taskDependencies || [])];
}

function getAllChangeLogs() {
  return [...getStore().changeLogs];
}

function getAllIssues() {
  const s = getStore();
  if (!Array.isArray(s.issues)) s.issues = [];
  return [...s.issues];
}

function mergeIssuesById(existing, incoming) {
  const map = new Map();
  (existing || []).forEach(item => {
    if (item?.id) map.set(String(item.id), item);
  });
  (incoming || []).forEach(item => {
    if (item?.id) map.set(String(item.id), item);
  });
  return [...map.values()].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  );
}

function getAllTransferLogs() {
  return [...getStore().transferLogs];
}

function getAllPushLogs(limit = 100) {
  return getStore().pushLogs.slice(0, limit);
}

function getAllSystemUpdates() {
  return [...(getStore().systemUpdates || [])];
}

function replaceAllData(payload) {
  const s = getStore();
  if (Array.isArray(payload.users)) s.users = payload.users;
  if (Array.isArray(payload.projects)) {
    s.projects = payload.projects;
    normalizeAllProjects(s.projects);
  }
  if (Array.isArray(payload.tasks)) s.tasks = payload.tasks;
  if (Array.isArray(payload.taskDependencies)) s.taskDependencies = payload.taskDependencies;
  if (Array.isArray(payload.changeLogs)) s.changeLogs = payload.changeLogs;
  if (Array.isArray(payload.transferLogs)) s.transferLogs = payload.transferLogs;
  if (Array.isArray(payload.pushLogs)) s.pushLogs = payload.pushLogs;
  if (Array.isArray(payload.issues)) s.issues = payload.issues;
  if (Array.isArray(payload.projectTemplates)) s.projectTemplates = payload.projectTemplates;
  if (payload.workCalendar && typeof payload.workCalendar === 'object') {
    s.workCalendar = payload.workCalendar;
  }
  if (Array.isArray(payload.staffDeptCatalog)) {
    s.staffDeptCatalog = normalizeStaffDeptCatalog(payload.staffDeptCatalog);
  }
  ensureStaffDeptCatalog(s);
  normalizeUserProfileKinds(s.users);
  try {
    const { ensureProjectTemplates, repairWmsM0FalseMilestones } = require('../services/projectTemplates');
    ensureProjectTemplates(s);
    repairWmsM0FalseMilestones(s);
  } catch (e) {
    console.warn('[db] replaceAllData templates/repair', e.message);
  }
  persistStore();
}

function getStaffDeptCatalog() {
  const s = getStore();
  ensureStaffDeptCatalog(s);
  return [...s.staffDeptCatalog];
}

function setStaffDeptCatalog(catalog) {
  const s = getStore();
  s.staffDeptCatalog = normalizeStaffDeptCatalog(catalog);
  return persistStore();
}

function getWorkCalendar() {
  return getStore().workCalendar || null;
}

function setWorkCalendar(calendar) {
  getStore().workCalendar = calendar;
  persistStore();
  return calendar;
}

function getRolePermissions() {
  return getStore().rolePermissions || null;
}

function setRolePermissions(matrix) {
  getStore().rolePermissions = matrix;
  persistStore();
  return matrix;
}

function getLlmSettings() {
  return getStore().llmSettings || null;
}

function setLlmSettings(settings) {
  getStore().llmSettings = settings;
  persistStore();
  return settings;
}

function isEmpty() {
  const s = getStore();
  return s.users.length === 0 && s.projects.length === 0;
}

function insertPushLog(entry) {
  const s = getStore();
  s.pushLogs.unshift(entry);
  if (s.pushLogs.length > 200) s.pushLogs = s.pushLogs.slice(0, 200);
  persistStore();
}

const MAX_NOTIFICATIONS = 2000;

function ensureNotificationsArray() {
  const s = getStore();
  if (!Array.isArray(s.notifications)) s.notifications = [];
  return s.notifications;
}

/** 写入应用内通知（每人一条），返回写入的条目 */
function insertNotifications(entries) {
  if (!Array.isArray(entries) || !entries.length) return [];
  const list = ensureNotificationsArray();
  const written = [];
  for (const entry of entries) {
    if (!entry || !entry.userId) continue;
    const row = {
      id: entry.id,
      userId: entry.userId,
      userName: entry.userName || '',
      eventType: entry.eventType || '',
      title: entry.title || '【恒慧管】通知',
      content: entry.content || '',
      taskId: entry.taskId || null,
      projectId: entry.projectId || null,
      read: false,
      createdAt: entry.createdAt || new Date().toISOString(),
      time: entry.time || new Date().toLocaleString('zh-CN'),
      pushLogId: entry.pushLogId || null,
      operator: entry.operator || '',
    };
    list.unshift(row);
    written.push(row);
  }
  if (list.length > MAX_NOTIFICATIONS) {
    list.splice(MAX_NOTIFICATIONS);
  }
  persistStore();
  return written;
}

function getNotificationsForUser(userId, { limit = 50, unreadOnly = false } = {}) {
  if (!userId) return [];
  let rows = ensureNotificationsArray().filter(n => n.userId === userId);
  if (unreadOnly) rows = rows.filter(n => !n.read);
  return rows.slice(0, Math.max(1, Math.min(Number(limit) || 50, 100)));
}

function countUnreadNotifications(userId) {
  if (!userId) return 0;
  return ensureNotificationsArray().filter(n => n.userId === userId && !n.read).length;
}

function markNotificationsRead(userId, { ids = null, all = false } = {}) {
  if (!userId) return { updated: 0 };
  const list = ensureNotificationsArray();
  let updated = 0;
  const idSet = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  for (const n of list) {
    if (n.userId !== userId || n.read) continue;
    if (all || (idSet && idSet.has(String(n.id)))) {
      n.read = true;
      updated++;
    }
  }
  if (updated) persistStore();
  return { updated };
}

function setUsers(users) {
  const cleaned = (users || []).filter(u => !String(u.id || '').startsWith('DT-'));
  normalizeUserProfileKinds(cleaned);
  getStore().users = cleaned;
  return persistStore();
}

function swapPersonName(value, oldName, newName) {
  return value === oldName ? newName : value;
}

function swapPersonNameList(list, oldName, newName) {
  if (!Array.isArray(list)) return { list, count: 0 };
  let count = 0;
  const next = list.map(item => {
    if (typeof item === 'string') {
      if (item === oldName) {
        count++;
        return newName;
      }
      return item;
    }
    if (item && typeof item === 'object') {
      const copy = { ...item };
      let touched = false;
      for (const key of ['name', 'userName', 'assignee', 'from', 'to', 'operator']) {
        if (copy[key] === oldName) {
          copy[key] = newName;
          touched = true;
        }
      }
      if (touched) count++;
      return copy;
    }
    return item;
  });
  return { list: next, count };
}

/**
 * 将业务数据中的人员显示名从 oldName 全部替换为 newName（任务/项目/日志等）
 * 不落盘；调用方随后 persistStore / setUsers。
 */
function renamePersonAcrossStore(oldName, newName) {
  if (!oldName || !newName || oldName === newName) {
    return { renamedRefs: 0 };
  }
  const s = getStore();
  let renamedRefs = 0;

  s.projects = (s.projects || []).map(p => {
    const next = { ...p };
    if (next.manager === oldName) { next.manager = newName; renamedRefs++; }
    if (next.creator === oldName) { next.creator = newName; renamedRefs++; }
    const team = swapPersonNameList(next.teamMembers, oldName, newName);
    next.teamMembers = team.list;
    renamedRefs += team.count;
    return normalizeProjectRecord(next);
  });

  s.tasks = (s.tasks || []).map(t => {
    const next = { ...t };
    if (next.assignee === oldName) { next.assignee = newName; renamedRefs++; }
    if (next.creator === oldName) { next.creator = newName; renamedRefs++; }
    for (const key of ['informCollaborators', 'assistCollaborators', 'collaborators']) {
      const r = swapPersonNameList(next[key], oldName, newName);
      next[key] = r.list;
      renamedRefs += r.count;
    }
    const entries = swapPersonNameList(next.collaboratorEntries, oldName, newName);
    next.collaboratorEntries = entries.list;
    renamedRefs += entries.count;
    return next;
  });

  s.changeLogs = (s.changeLogs || []).map(log => {
    const next = { ...log };
    if (next.operator === oldName) { next.operator = newName; renamedRefs++; }
    return next;
  });

  s.transferLogs = (s.transferLogs || []).map(log => {
    const next = { ...log };
    if (next.from === oldName) { next.from = newName; renamedRefs++; }
    if (next.to === oldName) { next.to = newName; renamedRefs++; }
    if (next.operator === oldName) { next.operator = newName; renamedRefs++; }
    return next;
  });

  s.pushLogs = (s.pushLogs || []).map(log => {
    const next = { ...log };
    if (typeof next.recipients === 'string' && next.recipients.includes(oldName)) {
      next.recipients = next.recipients
        .split(/[、,，]/)
        .map(part => (part.trim() === oldName ? newName : part.trim()))
        .filter(Boolean)
        .join('、');
      renamedRefs++;
    }
    return next;
  });

  return { renamedRefs };
}

/** 按用户新旧姓名列表批量替换引用 */
function applyPersonRenames(renames) {
  const list = Array.isArray(renames) ? renames.filter(r => r && r.from && r.to && r.from !== r.to) : [];
  let renamedRefs = 0;
  const applied = [];
  for (const r of list) {
    const result = renamePersonAcrossStore(r.from, r.to);
    renamedRefs += result.renamedRefs;
    applied.push({ from: r.from, to: r.to, refs: result.renamedRefs });
  }
  return { renamedRefs, applied };
}

function mergeTasksById(existing, incoming, predicate, options = {}) {
  const removeMissing = !!options.removeMissing;
  const map = new Map(existing.map(t => [t.id, t]));
  const incomingIds = new Set();
  for (const t of incoming) {
    if (predicate && !predicate(t)) continue;
    if (t?.id) incomingIds.add(t.id);
    pruneTaskCommentPendingFiles(t);
    const prev = map.get(t.id);
    if (prev && (prev.status === 'abolished' || prev.status === 'archived' || t.status === 'abolished' || t.status === 'archived')) {
      const status = (prev.status === 'abolished' || t.status === 'abolished')
        ? 'abolished'
        : 'archived';
      map.set(t.id, { ...prev, ...t, status, createdAt: prev.createdAt || t.createdAt });
    } else {
      map.set(t.id, prev ? { ...prev, ...t, createdAt: prev.createdAt || t.createdAt } : t);
    }
  }
  if (removeMissing) {
    for (const id of [...map.keys()]) {
      if (!incomingIds.has(id)) map.delete(id);
    }
  }
  for (const t of map.values()) pruneTaskCommentPendingFiles(t);
  return [...map.values()];
}

function pruneTaskCommentPendingFiles(task) {
  if (!task || !Array.isArray(task.commentPendingFiles) || !task.commentPendingFiles.length) return;
  const used = new Set();
  (task.comments || []).forEach(c => {
    (c.attachments || []).forEach(a => { if (a?.fileId) used.add(a.fileId); });
  });
  task.commentPendingFiles = task.commentPendingFiles.filter(f => f?.fileId && !used.has(f.fileId));
}

function mergeProjectsById(existing, incoming, predicate, options = {}) {
  const removeMissing = !!options.removeMissing;
  const map = new Map(existing.map(p => [p.id, p]));
  const incomingIds = new Set();
  for (const p of incoming) {
    if (predicate && !predicate(p)) continue;
    if (p?.id) incomingIds.add(p.id);
    const prev = map.get(p.id);
    if (prev) {
      const prevArchived = prev.archived === true || prev.status === 'archived';
      const nextArchived = p.archived === true || p.status === 'archived';
      // 与任务终态类似：任一侧已归档则保持归档，避免旧客户端 sync 把归档冲掉
      const keepArchived = prevArchived || nextArchived;
      const merged = {
        ...prev,
        ...p,
        documents: mergeProjectDocuments(prev.documents, p.documents),
      };
      if (keepArchived) {
        merged.archived = true;
        merged.status = 'archived';
      }
      map.set(p.id, normalizeProjectRecord(merged));
    } else {
      map.set(p.id, normalizeProjectRecord({ ...p }));
    }
  }
  if (removeMissing) {
    for (const id of [...map.keys()]) {
      if (!incomingIds.has(id)) map.delete(id);
    }
  }
  return [...map.values()];
}

const MAX_CHANGE_LOGS = 2000;
const MAX_TRANSFER_LOGS = 500;
const MAX_PUSH_LOGS = 200;

function parseLogTime(entry) {
  const raw = entry?.operateTime || entry?.time || entry?.createdAt || '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

/** 按 id 增量合并日志，新记录覆盖同 id，按时间倒序，超出上限截断 */
function mergeLogsById(existing, incoming, maxLen) {
  const map = new Map();
  (existing || []).forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  (incoming || []).forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  const merged = [...map.values()].sort((a, b) => parseLogTime(b) - parseLogTime(a));
  return merged.length > maxLen ? merged.slice(0, maxLen) : merged;
}

function mergeChangeLogsById(existing, incoming) {
  return mergeLogsById(existing, incoming, MAX_CHANGE_LOGS);
}

function mergeTransferLogsById(existing, incoming) {
  return mergeLogsById(existing, incoming, MAX_TRANSFER_LOGS);
}

function mergePushLogsById(existing, incoming) {
  return mergeLogsById(existing, incoming, MAX_PUSH_LOGS);
}

function appendChangeLogs(entries) {
  if (!Array.isArray(entries) || !entries.length) return getAllChangeLogs();
  const s = getStore();
  s.changeLogs = mergeChangeLogsById(s.changeLogs, entries);
  persistStore();
  return s.changeLogs;
}

function mergeTaskDependenciesById(existing, incoming) {
  const map = new Map();
  (existing || []).forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  (incoming || []).forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  return [...map.values()];
}

/**
 * 数据安全可视化：只返回集合数量与连接元信息，不含记录正文/密码
 */
function getDataSecuritySnapshot() {
  const s = getStore();
  const collections = {};
  Object.keys(DEFAULT_STORE).forEach((key) => {
    const v = s[key];
    if (Array.isArray(v)) {
      collections[key] = { type: 'array', count: v.length };
    } else if (v == null) {
      collections[key] = { type: 'null', count: 0 };
    } else if (typeof v === 'object') {
      collections[key] = { type: 'object', count: 1 };
    } else {
      collections[key] = { type: typeof v, count: v ? 1 : 0 };
    }
  });

  const mysql = useMysql();
  let file = null;
  if (!mysql) {
    const filePath = getStorePath();
    let sizeBytes = null;
    let mtime = null;
    try {
      if (fs.existsSync(filePath)) {
        const st = fs.statSync(filePath);
        sizeBytes = st.size;
        mtime = st.mtime.toISOString();
      }
    } catch {
      /* ignore */
    }
    file = {
      path: filePath,
      fileName: path.basename(filePath),
      sizeBytes,
      mtime,
    };
  }

  return {
    driver: mysql ? 'mysql' : 'json',
    connection: mysql
      ? {
          host: config.mysql.host,
          port: config.mysql.port,
          database: config.mysql.database,
          user: config.mysql.user,
        }
      : {
          host: null,
          port: null,
          database: null,
          user: null,
        },
    file,
    collections,
    memorySyncedAt: mysql ? storeMysqlSyncedAt : storeFileMtimeMs,
  };
}

module.exports = {
  getDb,
  getAllUsers,
  findUserById,
  findUserByDingTalkId,
  upsertUser,
  setUsers,
  renamePersonAcrossStore,
  applyPersonRenames,
  getAllProjects,
  getAllTasks,
  getAllTaskDependencies,
  getAllChangeLogs,
  getAllIssues,
  mergeIssuesById,
  getAllTransferLogs,
  getAllPushLogs,
  getAllSystemUpdates,
  insertNotifications,
  getNotificationsForUser,
  countUnreadNotifications,
  markNotificationsRead,
  replaceAllData,
  mergeTasksById,
  mergeProjectsById,
  normalizeProjectRecord,
  mergeTaskDependenciesById,
  mergeChangeLogsById,
  mergeTransferLogsById,
  mergePushLogsById,
  appendChangeLogs,
  getWorkCalendar,
  setWorkCalendar,
  getRolePermissions,
  setRolePermissions,
  getLlmSettings,
  setLlmSettings,
  getStaffDeptCatalog,
  setStaffDeptCatalog,
  isEmpty,
  isStoreLoadFailed,
  insertPushLog,
  persistStore,
  reloadStoreFromDisk,
  reloadStoreFromDiskIfStale,
  getDataSecuritySnapshot,
};
