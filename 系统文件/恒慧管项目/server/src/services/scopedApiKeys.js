/**
 * 作用域 API Key：绑定人员档案，读写范围随该用户身份走。
 * 明文仅在签发时返回一次；库内只存 sha256 哈希。
 */
const crypto = require('crypto');
const {
  getDb,
  persistStore,
  findUserById,
  getAllProjects,
  getAllTasks,
} = require('../db/database');
const { isFullAccess } = require('../utils/roles');
const {
  canManageProject,
  canEditTask,
  canAbolishTask,
} = require('../utils/taskRelations');
const {
  canViewProject,
  canViewTask,
  filterProjectsForUser,
  filterTasksForUser,
} = require('../utils/projectAccess');
const config = require('../config');
const { sendWorkNotification } = require('./dingtalk');
const { createInboxFromPush } = require('./appNotifications');

const KEY_PREFIX = 'hhg_sk_';
const CAP_READ = 'read';
const CAP_READ_WRITE = 'read_write';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function getApiKeys() {
  const s = getDb();
  if (!Array.isArray(s.apiKeys)) s.apiKeys = [];
  return s.apiKeys;
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest('hex');
}

function generateSecret() {
  return `${KEY_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
}

function genKeyId() {
  return `SK-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function publicRecord(rec) {
  if (!rec) return null;
  const readIds = Array.isArray(rec.projectIdsRead) ? rec.projectIdsRead.map(String) : [];
  const writeIds = Array.isArray(rec.projectIdsWrite) ? rec.projectIdsWrite.map(String) : [];
  return {
    id: rec.id,
    boundUserId: rec.boundUserId,
    boundUserName: rec.boundUserName || '',
    capability: rec.capability || CAP_READ_WRITE,
    projectScope: rec.projectScope || 'related',
    projectIdsRead: readIds,
    projectIdsWrite: writeIds,
    status: rec.status || 'active',
    keyPrefix: rec.keyPrefix || '',
    createdAt: rec.createdAt || '',
    createdBy: rec.createdBy || '',
    revokedAt: rec.revokedAt || '',
    lastUsedAt: rec.lastUsedAt || '',
    lastSentAt: rec.lastSentAt || '',
  };
}

function listKeysForUser(userId) {
  return getApiKeys()
    .filter(k => k.boundUserId === userId)
    .map(publicRecord)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function listActiveKeysForUser(userId) {
  return getApiKeys().filter(k => k.boundUserId === userId && k.status === 'active');
}

/** 管理员一览：userId → 当前有效 Key 摘要 */
function getActiveKeyStatusMap() {
  const map = {};
  getApiKeys().forEach(k => {
    if (!k || k.status !== 'active' || !k.boundUserId) return;
    const prev = map[k.boundUserId];
    if (!prev || String(k.createdAt || '') > String(prev.createdAt || '')) {
      map[k.boundUserId] = {
        hasActive: true,
        keyId: k.id,
        keyPrefix: k.keyPrefix || '',
        capability: k.capability || CAP_READ_WRITE,
        projectScope: k.projectScope || ((k.projectIdsRead || []).length || (k.projectIdsWrite || []).length ? 'whitelist' : 'related'),
        projectIdsRead: Array.isArray(k.projectIdsRead) ? k.projectIdsRead.map(String) : [],
        projectIdsWrite: Array.isArray(k.projectIdsWrite) ? k.projectIdsWrite.map(String) : [],
        createdAt: k.createdAt || '',
        lastSentAt: k.lastSentAt || '',
        lastUsedAt: k.lastUsedAt || '',
      };
    }
  });
  return map;
}

/**
 * @param {{ boundUserId: string, capability?: string, createdBy?: string, revokeOthers?: boolean, projectIdsRead?: string[], projectIdsWrite?: string[] }} opts
 */
function issueKey(opts = {}) {
  const boundUserId = String(opts.boundUserId || '').trim();
  const user = findUserById(boundUserId);
  if (!user) throw httpError(404, '人员不存在');
  if (user.active === false) throw httpError(400, '人员已停用，无法签发');

  const capability = opts.capability === CAP_READ ? CAP_READ : CAP_READ_WRITE;
  const secret = generateSecret();
  const now = new Date().toISOString();
  const keys = getApiKeys();
  const projectIdsRead = Array.isArray(opts.projectIdsRead)
    ? [...new Set(opts.projectIdsRead.map(id => String(id).trim()).filter(Boolean))]
    : [];
  const projectIdsWrite = Array.isArray(opts.projectIdsWrite)
    ? [...new Set(opts.projectIdsWrite.map(id => String(id).trim()).filter(Boolean))]
    : [];

  if (opts.revokeOthers !== false) {
    keys.forEach(k => {
      if (k.boundUserId === boundUserId && k.status === 'active') {
        k.status = 'revoked';
        k.revokedAt = now;
      }
    });
  }

  const rec = {
    id: genKeyId(),
    boundUserId: user.id,
    boundUserName: user.name || '',
    capability,
    projectScope: (projectIdsRead.length || projectIdsWrite.length) ? 'whitelist' : 'related',
    projectIdsRead,
    projectIdsWrite,
    status: 'active',
    secretHash: hashSecret(secret),
    keyPrefix: secret.slice(0, 12),
    createdAt: now,
    createdBy: String(opts.createdBy || '').trim(),
    revokedAt: '',
    lastUsedAt: '',
    lastSentAt: '',
  };
  keys.push(rec);
  persistStore();
  return { record: publicRecord(rec), secret };
}

function revokeKey(keyId, revokedBy = '') {
  const rec = getApiKeys().find(k => k.id === keyId);
  if (!rec) throw httpError(404, '密钥不存在');
  if (rec.status === 'revoked') return publicRecord(rec);
  rec.status = 'revoked';
  rec.revokedAt = new Date().toISOString();
  rec.revokedBy = String(revokedBy || '').trim();
  persistStore();
  return publicRecord(rec);
}

/**
 * @returns {{ kind: 'scoped', record: object, user: object } | null}
 */
function resolveScopedKey(incoming) {
  const raw = String(incoming || '').trim();
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null;
  const hash = hashSecret(raw);
  const rec = getApiKeys().find(k => k.status === 'active' && k.secretHash === hash);
  if (!rec) return null;
  const user = findUserById(rec.boundUserId);
  if (!user || user.active === false) return null;
  rec.lastUsedAt = new Date().toISOString();
  // 不每次 persist，避免高频查询打盘；由调用方可选 flush
  return { kind: 'scoped', record: rec, user };
}

function touchScopedKeyPersist() {
  persistStore();
}

function canIssueScopedKeys(actor) {
  return !!(actor && isFullAccess(actor.role));
}

function buildGuideUrls() {
  const base = String(config.publicBaseUrl || '').replace(/\/+$/, '') || '(请填写 PUBLIC_BASE_URL)';
  return {
    baseUrl: base,
    guideUrl: `${base}/作用域Key接入说明.md`,
    workbuddyHealth: `${base}/api/workbuddy/health`,
    workbuddyQuery: `${base}/api/workbuddy/query?type=summary`,
    externalHealth: `${base}/api/external/health`,
    externalCatalog: `${base}/api/external/catalog`,
  };
}

function buildDeliveryContent({ userName, secret, capability }) {
  const urls = buildGuideUrls();
  const capLabel = capability === CAP_READ ? '只读' : '读写';
  return [
    `【恒慧管·作用域 Key】`,
    `您好 ${userName || ''}，管理员为您签发了个人接口密钥（${capLabel}）。`,
    ``,
    `服务地址：${urls.baseUrl}`,
    `作用域 Key（请妥善保管，勿转发）：`,
    secret,
    ``,
    `请求头：X-Api-Key: <上面的 Key>`,
    `查询：GET ${urls.workbuddyQuery}`,
    capability === CAP_READ ? '' : `写入：见 ${urls.externalCatalog}`,
    `说明文档：${urls.guideUrl}`,
    ``,
    `权限范围：仅您相关/可管理的项目与任务；越权将返回 403。`,
    `如非本人操作请忽略，并联系管理员吊销。`,
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');
}

/**
 * 签发（或使用传入 secret）并通过钉钉+站内信发给绑定人
 */
async function issueAndSendToUser(opts = {}) {
  const boundUserId = String(opts.boundUserId || '').trim();
  const user = findUserById(boundUserId);
  if (!user) throw httpError(404, '人员不存在');

  const dingId = String(user.dingTalkUserId || '').trim();
  if (!dingId || dingId === 'demo') {
    throw httpError(400, '该人员未绑定钉钉 userid，无法发送。请先在人员档案同步/绑定钉钉。');
  }

  const issued = issueKey({
    boundUserId,
    capability: opts.capability,
    createdBy: opts.createdBy,
    revokeOthers: true,
    projectIdsRead: opts.projectIdsRead,
    projectIdsWrite: opts.projectIdsWrite,
  });

  const title = '【恒慧管】作用域 Key 与接口接入说明';
  const content = buildDeliveryContent({
    userName: user.name,
    secret: issued.secret,
    capability: issued.record.capability,
  });

  const pushResult = await sendWorkNotification({
    dingTalkUserIds: [dingId],
    title,
    content,
    withLink: true,
  });

  try {
    createInboxFromPush({
      eventType: 'scoped_api_key_delivered',
      title,
      content,
      recipients: [{ userId: user.id, id: user.id, userName: user.name, dingTalkUserId: dingId }],
    });
  } catch (e) {
    console.warn('[scopedApiKeys] inbox write failed:', e.message);
  }

  const rec = getApiKeys().find(k => k.id === issued.record.id);
  if (rec) {
    rec.lastSentAt = new Date().toISOString();
    persistStore();
  }

  return {
    record: publicRecord(rec || issued.record),
    secret: issued.secret,
    guide: buildGuideUrls(),
    dingTalk: pushResult,
  };
}

function assertProjectWhitelist(actor, project, mode) {
  const rec = actor && actor._scopedKeyRecord;
  if (!rec) return;
  const readIds = Array.isArray(rec.projectIdsRead) ? rec.projectIdsRead.map(String) : [];
  const writeIds = Array.isArray(rec.projectIdsWrite) ? rec.projectIdsWrite.map(String) : [];
  if (!readIds.length && !writeIds.length) return;
  const pid = String(project && project.id);
  if (mode === 'write') {
    if (writeIds.length && !writeIds.includes(pid)) {
      throw httpError(403, '该 Key 未授权写入此项目');
    }
    if (!writeIds.length && readIds.length && !readIds.includes(pid)) {
      throw httpError(403, '该 Key 未授权访问此项目');
    }
    return;
  }
  const allowed = new Set([...readIds, ...writeIds]);
  if (!allowed.has(pid)) throw httpError(403, '该 Key 未授权查看此项目');
}

function assertScopedCanReadProject(actor, project) {
  assertProjectWhitelist(actor, project, 'read');
  const tasks = getAllTasks();
  if (!canViewProject(actor, project, tasks, getAllProjects())) {
    throw httpError(403, '无权查看该项目');
  }
}

function assertScopedCanReadTask(actor, task) {
  const project = getAllProjects().find(p => String(p.id) === String(task && task.projectId));
  if (project) assertProjectWhitelist(actor, project, 'read');
  if (!canViewTask(actor, task, getAllProjects(), getAllTasks())) {
    throw httpError(403, '无权查看该任务');
  }
}

function assertScopedCanWriteProject(actor, project) {
  assertProjectWhitelist(actor, project, 'write');
  if (!canManageProject(actor, project)) {
    throw httpError(403, '无权修改该项目（需为项目负责人/创建人或管理员）');
  }
}

function assertScopedCanWriteTask(actor, task) {
  const project = getAllProjects().find(p => String(p.id) === String(task && task.projectId));
  if (project) assertProjectWhitelist(actor, project, 'write');
  if (!canEditTask(actor, task, getAllProjects())) {
    throw httpError(403, '无权修改该任务');
  }
}

function assertScopedCanAbolishTask(actor, task) {
  if (!canAbolishTask(actor, task, getAllProjects())) {
    throw httpError(403, '无权删除/作废该任务');
  }
}

function filterStoreForScopedActor(actor) {
  const projects = getAllProjects();
  const tasks = getAllTasks();
  const viewableProjects = filterProjectsForUser(actor, projects, tasks);
  const viewableIds = new Set(viewableProjects.map(p => p.id));
  const viewableTasks = filterTasksForUser(actor, tasks, projects, viewableIds);
  return { projects: viewableProjects, tasks: viewableTasks, projectIds: viewableIds };
}

module.exports = {
  CAP_READ,
  CAP_READ_WRITE,
  KEY_PREFIX,
  canIssueScopedKeys,
  listKeysForUser,
  listActiveKeysForUser,
  getActiveKeyStatusMap,
  issueKey,
  revokeKey,
  resolveScopedKey,
  touchScopedKeyPersist,
  issueAndSendToUser,
  buildGuideUrls,
  buildDeliveryContent,
  publicRecord,
  assertScopedCanReadProject,
  assertScopedCanReadTask,
  assertScopedCanWriteProject,
  assertScopedCanWriteTask,
  assertScopedCanAbolishTask,
  filterStoreForScopedActor,
  getApiKeys,
};
