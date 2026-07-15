const fs = require('fs');
const path = require('path');
const config = require('../config');
const { backupJsonFile } = require('../utils/backup');
const { mergeProjectDocuments } = require('../utils/projectDocuments');

const DEFAULT_STORE = {
  users: [],
  projects: [],
  tasks: [],
  taskDependencies: [],
  changeLogs: [],
  transferLogs: [],
  pushLogs: [],
  workCalendar: null,
  systemUpdates: [],
};

let store = null;
let storePath = null;

function getStorePath() {
  if (!storePath) {
    storePath = config.dbPath.endsWith('.json')
      ? config.dbPath
      : config.dbPath.replace(/\.db$/i, '.json');
  }
  return storePath;
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
  return project;
}

function normalizeAllProjects(projects) {
  (projects || []).forEach(normalizeProjectRecord);
}

function loadStoreFromDisk() {
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
    normalizeAllProjects(store.projects);
  } catch (e) {
    console.warn('[db] 读取失败，使用空库', e.message);
    store = structuredClone(DEFAULT_STORE);
  }
  return store;
}

function getStore() {
  if (!store) loadStoreFromDisk();
  return store;
}

/** 强制从磁盘重新加载（改库文件后或排查数据不一致时使用） */
function reloadStoreFromDisk() {
  store = null;
  return loadStoreFromDisk();
}

function persistStore() {
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
  if (payload.workCalendar && typeof payload.workCalendar === 'object') {
    s.workCalendar = payload.workCalendar;
  }
  persistStore();
}

function getWorkCalendar() {
  return getStore().workCalendar || null;
}

function setWorkCalendar(calendar) {
  getStore().workCalendar = calendar;
  persistStore();
  return calendar;
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

function setUsers(users) {
  const cleaned = (users || []).filter(u => !String(u.id || '').startsWith('DT-'));
  getStore().users = cleaned;
  return persistStore();
}

function mergeTasksById(existing, incoming, predicate) {
  const map = new Map(existing.map(t => [t.id, t]));
  for (const t of incoming) {
    if (predicate && !predicate(t)) continue;
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

function mergeProjectsById(existing, incoming, predicate) {
  const map = new Map(existing.map(p => [p.id, p]));
  for (const p of incoming) {
    if (predicate && !predicate(p)) continue;
    const prev = map.get(p.id);
    if (prev) {
      map.set(p.id, {
        ...prev,
        ...p,
        documents: mergeProjectDocuments(prev.documents, p.documents),
      });
    } else {
      map.set(p.id, p);
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

module.exports = {
  getDb,
  getAllUsers,
  findUserById,
  findUserByDingTalkId,
  upsertUser,
  setUsers,
  getAllProjects,
  getAllTasks,
  getAllTaskDependencies,
  getAllChangeLogs,
  getAllTransferLogs,
  getAllPushLogs,
  getAllSystemUpdates,
  replaceAllData,
  mergeTasksById,
  mergeProjectsById,
  mergeTaskDependenciesById,
  mergeChangeLogsById,
  mergeTransferLogsById,
  mergePushLogsById,
  appendChangeLogs,
  getWorkCalendar,
  setWorkCalendar,
  isEmpty,
  insertPushLog,
  persistStore,
  reloadStoreFromDisk,
};
