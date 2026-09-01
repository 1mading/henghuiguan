const { getAccessToken, resolveOperatorUnionId } = require('./dingtalk');
const { getAllUsers } = require('../db/database');

const DEFAULT_BASE_ID = 'mExel2BLV54MBY6YiPqoA41aWgk9rpMq';
const DEFAULT_DOC_URL = 'https://alidocs.dingtalk.com/i/nodes/mExel2BLV54MBY6YiPqoA41aWgk9rpMq';

function formatNotableError(status, data) {
  const msg = data?.message || data?.errmsg || '未知错误';
  const code = data?.code || '';
  const base = `钉钉 AI 表格 API 失败: ${msg}${code ? ` (${code})` : ''}`;
  if (String(msg).includes('Notable.Base.Read.All')) {
    return base + '。请在钉钉开放平台为恒慧管应用开通「AI 表格应用读权限 Notable.Base.Read.All」并重新发布应用。';
  }
  if (String(msg).includes('operatorId')) {
    return base + '。请确保操作人在系统人员档案中已绑定钉钉 unionId（重新同步通讯录或登录一次）。';
  }
  return base;
}

async function pickDefaultOperatorUser() {
  const users = getAllUsers();
  return users.find(u => u.dingTalkUnionId && u.dept === '实施交付部')
    || users.find(u => u.dingTalkUnionId && (u.role === 'admin' || u.role === 'gm'))
    || users.find(u => u.dingTalkUnionId)
    || users.find(u => u.dingTalkUserId)
    || null;
}

async function resolveNotableOperatorId(user) {
  const u = user || await pickDefaultOperatorUser();
  if (!u) throw new Error('找不到可用于读取 AI 表格的操作人，请先同步钉钉通讯录');
  return resolveOperatorUnionId(u);
}

async function notableGet(path, operatorId) {
  const accessToken = await getAccessToken();
  const url = `https://api.dingtalk.com${path}?operatorId=${encodeURIComponent(operatorId)}`;
  const res = await fetch(url, {
    headers: { 'x-acs-dingtalk-access-token': accessToken },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatNotableError(res.status, data));
  return data;
}

async function notablePost(path, operatorId, body = {}) {
  const accessToken = await getAccessToken();
  const url = `https://api.dingtalk.com${path}?operatorId=${encodeURIComponent(operatorId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': accessToken,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatNotableError(res.status, data));
  return data;
}

async function listNotableSheets(baseId, operatorId) {
  const data = await notableGet(`/v1.0/notable/bases/${encodeURIComponent(baseId)}/sheets`, operatorId);
  return data.value || data.sheets || [];
}

function flattenNotableFieldValue(val) {
  if (val == null) return '';
  if (Array.isArray(val)) {
    return val.map(item => flattenNotableFieldValue(item)).filter(Boolean).join('、');
  }
  if (typeof val === 'object') {
    return String(val.name || val.text || val.label || val.value || val.unionId || '').trim();
  }
  return String(val).trim();
}

function notableRecordToRow(record) {
  const fields = record?.fields || {};
  const row = {};
  for (const [key, val] of Object.entries(fields)) {
    row[key] = flattenNotableFieldValue(val);
  }
  row.__recordId = record?.id || '';
  return row;
}

async function listNotableRecords(baseId, sheetIdOrName, operatorId, options = {}) {
  const maxResults = options.maxResults || 100;
  const rows = [];
  let nextToken = '';
  do {
    const body = { maxResults };
    if (nextToken) body.nextToken = nextToken;
    const data = await notablePost(
      `/v1.0/notable/bases/${encodeURIComponent(baseId)}/sheets/${encodeURIComponent(sheetIdOrName)}/records/list`,
      operatorId,
      body,
    );
    for (const rec of data.records || []) rows.push(notableRecordToRow(rec));
    nextToken = data.hasMore ? (data.nextToken || '') : '';
  } while (nextToken);
  return rows;
}

async function fetchKpiCustomRowsFromNotable(options = {}) {
  const {
    baseId = DEFAULT_BASE_ID,
    sheetNames = ['项目任务跟踪（八月）', '项目任务跟踪（9月）'],
    operatorUser = null,
  } = options;
  const operatorId = await resolveNotableOperatorId(operatorUser);
  const sheets = await listNotableSheets(baseId, operatorId);
  const available = sheets.map(s => s.name || s.sheetName || s.id).filter(Boolean);
  const result = {};
  for (const name of sheetNames) {
    const matched = available.find(n => n === name)
      || available.find(n => n.replace(/\s/g, '') === name.replace(/\s/g, ''));
    if (!matched) {
      result[name] = { rows: [], error: `未找到数据表「${name}」，当前可用：${available.join('、') || '（无）'}` };
      continue;
    }
    try {
      const rows = await listNotableRecords(baseId, matched, operatorId);
      result[name] = { rows, sheetName: matched };
    } catch (e) {
      result[name] = { rows: [], error: e.message || String(e) };
    }
  }
  return { baseId, operatorId, availableSheets: available, sheets: result };
}

module.exports = {
  DEFAULT_BASE_ID,
  DEFAULT_DOC_URL,
  fetchKpiCustomRowsFromNotable,
  listNotableRecords,
  listNotableSheets,
  notableRecordToRow,
};
