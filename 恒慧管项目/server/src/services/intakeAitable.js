const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const {
  getAllUsers,
  getAllTasks,
  getDb,
  persistStore,
  insertPushLog,
  findUserByDingTalkId,
} = require('../db/database');
const { sendWorkNotification } = require('./dingtalk');
const { createInboxFromPush } = require('./appNotifications');
const { saveBufferAsFile } = require('./fileStorage');
const { genDocId } = require('../utils/projectDocuments');

const EVENT_TYPE = 'task_assigned';
const DEFAULT_CREATOR = 'AI表格提报';
const DINGTALK_RESOURCE_BASES = [
  'https://alidocs.dingtalk.com',
  'https://www.dingtalk.com',
  'https://dingtalk.com',
];

function genTaskId() {
  return 'T-' + Date.now().toString(36).slice(-4).toUpperCase();
}

function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function normalizePriority(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'normal';
  if (v === '紧急' || v === 'urgent') return 'urgent';
  if (v === '重要' || v === 'important') return 'important';
  if (v === '普通' || v === 'normal') return 'normal';
  return 'normal';
}

function normalizeDate(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  const parsed = Date.parse(v);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  return '';
}

/**
 * 解析 AI 表格「人员」字段：可能是姓名、userid、人员对象/数组
 * @returns {{ name: string, dingTalkUserId: string }}
 */
function parseSubmitterRaw(raw) {
  if (!raw) return { name: '', dingTalkUserId: '' };

  if (Array.isArray(raw)) {
    return parseSubmitterRaw(raw[0]);
  }

  if (typeof raw === 'object') {
    const name = String(
      raw.name || raw.userName || raw.displayName || raw['姓名'] || raw.nick || ''
    ).trim();
    const dingTalkUserId = String(
      raw.userid || raw.userId || raw.dingTalkUserId || raw['userid'] || raw.id || ''
    ).trim();
    return { name, dingTalkUserId };
  }

  const text = String(raw).trim();
  if (!text) return { name: '', dingTalkUserId: '' };

  // 纯数字 / 字母数字 userid（无中文名）→ 按钉钉 userid 处理
  if (/^[0-9A-Za-z_-]{4,64}$/.test(text) && !/[\u4e00-\u9fff]/.test(text)) {
    return { name: '', dingTalkUserId: text };
  }
  return { name: text, dingTalkUserId: '' };
}

function findUserByName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const users = getAllUsers();
  return users.find(u => u.name === n)
    || users.find(u => u.name && (u.name.startsWith(n) || n.startsWith(u.name.split(/\s+/)[0])))
    || users.find(u => u.name && u.name.includes(n))
    || null;
}

/** 按姓名或钉钉 userid 解析提单人 */
function resolveSubmitterUser(raw) {
  const parsed = parseSubmitterRaw(raw);
  let user = null;
  if (parsed.dingTalkUserId) {
    user = findUserByDingTalkId(parsed.dingTalkUserId);
  }
  if (!user && parsed.name) {
    user = findUserByName(parsed.name);
  }
  return {
    user,
    name: user?.name || parsed.name || '',
    dingTalkUserId: user?.dingTalkUserId || parsed.dingTalkUserId || '',
  };
}

function resolveAssignees() {
  const names = config.intakeAitable.assigneeNames.length
    ? config.intakeAitable.assigneeNames
    : (config.intakeAitable.assigneeName ? [config.intakeAitable.assigneeName] : []);
  const users = [];
  const missing = [];
  for (const name of names) {
    const user = findUserByName(name);
    if (user) users.push(user);
    else missing.push(name);
  }
  return { users, missing, assigneeName: users[0]?.name || names[0] || '' };
}

function findTaskByRecordId(recordId) {
  if (!recordId) return null;
  const id = String(recordId).trim();
  return getAllTasks().find(t =>
    t.intakeMeta?.source === 'aitable' && String(t.intakeMeta.recordId) === id
  ) || null;
}

function findTaskByClientToken(clientToken) {
  if (!clientToken) return null;
  const token = String(clientToken).trim();
  return getAllTasks().find(t =>
    t.intakeMeta?.source === 'aitable' && String(t.intakeMeta.clientToken) === token
  ) || null;
}

function toArray(val) {
  if (val == null || val === '') return [];
  return Array.isArray(val) ? val : [val];
}

/** 解析钉钉 AI 表格附件字段（并行数组结构，见自动化变量树） */
function parseAitableAttachmentContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return [];
  const inner = content['附件内容'] || content;
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return [];

  const names = toArray(inner['附件名'] || inner.filename || inner.name);
  const tempUrls = toArray(inner['附件临时链接'] || inner.tempUrl || inner.tempLinks);
  const sizes = toArray(inner['附件大小'] || inner.size);
  const types = toArray(inner['附件类型'] || inner.attachmentType);
  const docRes = inner.docRes && typeof inner.docRes === 'object' ? inner.docRes : {};
  const docUrls = toArray(docRes.url || inner.url);
  const docIds = toArray(docRes.id || inner.resourceId);
  const docTypes = toArray(docRes.type);
  const docLinks = toArray(docRes.docLink);

  const maxLen = Math.max(names.length, tempUrls.length, docUrls.length, 0);
  const items = [];
  for (let i = 0; i < maxLen; i++) {
    const url = String(tempUrls[i] || docUrls[i] || '').trim();
    const name = String(names[i] || '').trim();
    if (!url && !name) continue;
    items.push({
      filename: name,
      name,
      url,
      size: sizes[i],
      type: types[i] || docTypes[i] || '',
      resourceId: docIds[i] || '',
      docLink: docLinks[i],
    });
  }
  return items;
}

function extractAttachmentsPayload(body = {}) {
  const candidates = [
    body.attachments,
    body['附件'],
    body.attachment,
    body.attachmentContent,
    body['附件内容'],
  ];
  for (const c of candidates) {
    if (c != null && c !== '') return c;
  }
  if (body['附件名'] || body['附件临时链接'] || body.attachmentNames || body.attachmentUrls) {
    return {
      '附件内容': {
        '附件名': body['附件名'] || body.attachmentNames,
        '附件临时链接': body['附件临时链接'] || body.attachmentUrls,
        '附件大小': body['附件大小'] || body.attachmentSizes,
        '附件类型': body['附件类型'] || body.attachmentTypes,
        docRes: body.docRes || {
          url: body['docRes.url'],
          id: body['docRes.id'],
          type: body['docRes.type'],
        },
      },
    };
  }
  return null;
}

function parseAttachmentsRaw(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return parseAttachmentsRaw(parsed);
    } catch {
      if (/^https?:\/\//i.test(trimmed)) {
        return [{ url: trimmed, filename: trimmed.split('/').pop() || '附件' }];
      }
      return [];
    }
  }
  if (Array.isArray(raw)) {
    if (raw.length && (raw[0]?.['附件名'] != null || raw[0]?.['附件临时链接'] != null)) {
      return raw.flatMap(item => parseAitableAttachmentContent({ '附件内容': item }));
    }
    return raw;
  }
  if (typeof raw === 'object') {
    const aitable = parseAitableAttachmentContent(raw);
    if (aitable.length) return aitable;
    if (raw.url || raw.resourceUrl || raw.link || raw['附件临时链接'] || raw['附件名'] || raw.filename) {
      return [{
        filename: raw['附件名'] || raw.filename || raw.name,
        name: raw['附件名'] || raw.filename || raw.name,
        url: raw['附件临时链接'] || raw.url || raw.resourceUrl || raw.link,
        size: raw['附件大小'] || raw.size,
        type: raw['附件类型'] || raw.type,
        resourceId: raw.resourceId || raw.docRes?.id,
      }];
    }
  }
  return [];
}

function resolveAttachmentUrl(item) {
  const url = String(
    item?.url || item?.resourceUrl || item?.link || item?.['附件临时链接'] || ''
  ).trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) {
    for (const base of DINGTALK_RESOURCE_BASES) {
      return base.replace(/\/+$/, '') + url;
    }
  }
  return url;
}

function guessMimeType(item, filename) {
  const type = String(item?.type || item?.mimeType || '').trim().toLowerCase();
  if (type.includes('/')) return type;
  const ext = (filename || '').split('.').pop()?.toLowerCase();
  const map = {
    image: 'image/jpeg',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    zip: 'application/zip',
  };
  if (ext && map[ext]) return map[ext];
  if (type && map[type]) return map[type];
  return 'application/octet-stream';
}

function normalizeAttachmentName(item, index) {
  const name = String(
    item?.filename || item?.name || item?.fileName || item?.['附件名'] || ''
  ).trim();
  if (name) return name;
  const url = resolveAttachmentUrl(item);
  if (url) {
    const fromUrl = url.split('?')[0].split('/').pop();
    if (fromUrl) return decodeURIComponent(fromUrl);
  }
  return `附件${index + 1}`;
}

async function downloadAttachmentBuffer(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'henghuiguan-intake/1.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error('空文件');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function buildAttachmentsFromIntake(raw, uploadedBy) {
  const items = parseAttachmentsRaw(raw).slice(0, config.intakeAitable.maxAttachments);
  if (!items.length) return { attachments: [], warnings: [] };

  const attachments = [];
  const warnings = [];
  const timeoutMs = config.intakeAitable.downloadTimeoutMs;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = normalizeAttachmentName(item, i);
    const url = resolveAttachmentUrl(item);
    const mimeType = guessMimeType(item, name);
    const now = new Date().toISOString();

    if (!url) {
      warnings.push(`附件「${name}」缺少下载地址，已跳过`);
      continue;
    }

    try {
      const buffer = await downloadAttachmentBuffer(url, timeoutMs);
      const saved = saveBufferAsFile(buffer, name, mimeType);
      attachments.push({
        id: genDocId('ATT'),
        fileId: saved.fileId,
        name: saved.name,
        size: saved.size,
        mimeType: saved.mimeType,
        uploadedBy: uploadedBy || DEFAULT_CREATOR,
        uploadedAt: now,
        source: 'aitable_intake',
        sourceUrl: url,
      });
    } catch (e) {
      attachments.push({
        id: genDocId('ATT'),
        name,
        size: Number(item?.size) || 0,
        mimeType,
        uploadedBy: uploadedBy || DEFAULT_CREATOR,
        uploadedAt: now,
        source: 'aitable_link',
        url,
        sourceUrl: url,
        downloadError: e.message,
      });
      warnings.push(`附件「${name}」未能下载入库，已保留外链：${e.message}`);
    }
  }

  return { attachments, warnings };
}

function formatTaskAssignedMessage(task, operator) {
  const lines = [
    '您有新任务待处理：',
    `[${task.id}] ${task.title}${task.dueDate ? `（截止 ${task.dueDate}）` : ''}（临时任务）`,
  ];
  if (task.desc) {
    lines.push(`说明：${task.desc}`);
  }
  if (Array.isArray(task.attachments) && task.attachments.length) {
    lines.push(`附件：${task.attachments.length} 个`);
  }
  return lines.join('\n');
}

async function notifyTaskAssigned(task, assigneeUsers, operator) {
  const title = '【恒慧管·新任务】';
  const content = formatTaskAssignedMessage(task, operator);
  const recipients = assigneeUsers.map(u => ({
    userId: u.id,
    userName: u.name,
    name: u.name,
    dingTalkUserId: u.dingTalkUserId || '',
  }));

  const logEntry = {
    id: `P-${uuidv4().slice(0, 8)}`,
    eventType: EVENT_TYPE,
    title,
    content,
    recipients: recipients.map(r => r.userName).join('、'),
    status: 'pending',
    time: new Date().toLocaleString('zh-CN'),
    payload: {
      taskId: task.id,
      taskTitle: task.title,
      assignee: task.assignee,
      dueDate: task.dueDate,
      intakeSource: 'aitable',
    },
    taskId: task.id,
    operator: operator || task.creator,
  };

  const inboxItems = createInboxFromPush({
    eventType: EVENT_TYPE,
    title,
    content,
    recipients,
    payload: logEntry.payload,
    operator: logEntry.operator,
    pushLogId: logEntry.id,
  });

  const dingTalkUserIds = recipients.map(r => r.dingTalkUserId).filter(Boolean);

  if (!dingTalkUserIds.length) {
    logEntry.status = 'inbox_only';
    logEntry.error = '接收人未绑定钉钉 userid，仅写入应用内通知';
    insertPushLog(logEntry);
    return { inboxCount: inboxItems.length, dingTalkSkipped: true };
  }

  try {
    const result = await sendWorkNotification({ dingTalkUserIds, title, content });
    logEntry.status = result.mock ? 'queued' : 'sent';
    logEntry.response = result;
    insertPushLog(logEntry);
    return { inboxCount: inboxItems.length, ...result };
  } catch (e) {
    logEntry.status = 'failed';
    logEntry.error = e.message;
    insertPushLog(logEntry);
    return { inboxCount: inboxItems.length, dingTalkFailed: true, error: e.message };
  }
}

/**
 * 处理 AI 表格表单提交，创建临时任务并通知负责人
 */
async function processAitableIntake(body = {}) {
  const { enabled } = config.intakeAitable;
  if (!enabled) {
    const err = new Error('AI 表格事项收集未启用');
    err.status = 503;
    throw err;
  }

  const title = String(body.title || body['事项标题'] || '').trim();
  if (!title) {
    const err = new Error('事项标题不能为空');
    err.status = 400;
    throw err;
  }

  const recordId = String(body.recordId || body['记录ID'] || '').trim();
  const clientToken = String(body.clientToken || '').trim();

  if (recordId) {
    const existing = findTaskByRecordId(recordId);
    if (existing) {
      return {
        success: true,
        taskId: existing.id,
        duplicate: true,
        message: '该记录已生成任务',
      };
    }
  }

  if (clientToken) {
    const existingByToken = findTaskByClientToken(clientToken);
    if (existingByToken) {
      return {
        success: true,
        taskId: existingByToken.id,
        duplicate: true,
        message: '该记录已生成任务',
      };
    }
  }

  const { users: assigneeUsers, missing, assigneeName } = resolveAssignees();
  if (!assigneeUsers.length) {
    const err = new Error(`未找到负责人：${missing.join('、') || '未配置 INTAKE_AITABLE_ASSIGNEE_NAME'}`);
    err.status = 503;
    throw err;
  }

  const submitterRaw = body.submitterName
    ?? body['提交人']
    ?? body.submitter
    ?? body.submitterUserId
    ?? body['提交人userid']
    ?? body['提交人姓名']
    ?? '';
  const resolved = resolveSubmitterUser(submitterRaw);
  const submitterName = resolved.name;
  const submitterDingTalkUserId = resolved.dingTalkUserId;
  const creator = resolved.user?.name || submitterName || DEFAULT_CREATOR;

  const desc = String(body.desc || body['详细说明'] || '').trim();
  const dueDate = normalizeDate(body.dueDate || body['期望完成日期']) || tomorrowDateStr();
  const priority = normalizePriority(body.priority || body['优先级']);
  const submittedAt = String(body.submittedAt || body['提交时间'] || new Date().toISOString()).trim();
  const attachmentsRaw = extractAttachmentsPayload(body);
  const { attachments, warnings } = await buildAttachmentsFromIntake(attachmentsRaw, creator);

  const task = {
    id: genTaskId(),
    title,
    desc,
    type: 'temp',
    projectId: '',
    parentId: null,
    assignee: assigneeName,
    collaboratorEntries: [],
    collaborators: [],
    creator,
    createdAt: new Date().toISOString(),
    status: 'todo',
    priority,
    progress: 0,
    dueDate,
    estimatedHours: 0,
    actualHours: 0,
    planStartDate: null,
    actualStartDate: null,
    actualEndDate: null,
    comments: [],
    attachments,
    intakeMeta: {
      source: 'aitable',
      recordId: recordId || null,
      clientToken: clientToken || null,
      submittedAt,
      submitterName: submitterName || null,
      submitterDingTalkUserId: submitterDingTalkUserId || null,
    },
  };

  const store = getDb();
  store.tasks.push(task);
  if (!persistStore()) {
    store.tasks.pop();
    const err = new Error('任务写入失败');
    err.status = 500;
    throw err;
  }

  const notifyResult = await notifyTaskAssigned(task, assigneeUsers, creator);

  return {
    success: true,
    taskId: task.id,
    duplicate: false,
    message: '临时任务已创建',
    attachmentCount: attachments.length,
    attachmentWarnings: warnings,
    notification: notifyResult,
  };
}

module.exports = {
  processAitableIntake,
  calcAitableSignature: require('../middleware/verifyAitableSignature').calcAitableSignature,
};
