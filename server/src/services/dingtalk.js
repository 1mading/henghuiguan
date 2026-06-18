const config = require('../config');
const { getAllUsers, setUsers, findUserByDingTalkId, upsertUser } = require('../db/database');

let cachedAccessToken = null;
let tokenExpiresAt = 0;

function isConfigured() {
  return !!(config.dingtalk.appKey && config.dingtalk.appSecret);
}

async function getAccessToken() {
  if (!isConfigured()) return null;
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(config.dingtalk.appKey)}&appsecret=${encodeURIComponent(config.dingtalk.appSecret)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`钉钉 gettoken 失败: ${data.errmsg}`);
  }
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 7200) * 1000;
  return cachedAccessToken;
}

function formatDingTalkApiError(path, data) {
  const code = data.errcode;
  const msg = String(data.errmsg || '');
  const applyUrl = msg.match(/https:\/\/open-dev\.dingtalk\.com[^\s\],]+/)?.[0] || '';
  const base = `钉钉 ${path} 失败: ${msg} (${code})`;

  if (code === 60011 || code === 88 || msg.includes('60011') || msg.includes('qyapi_get_department')) {
    let hint = '请在钉钉开放平台 → 应用 → 权限管理，搜索并开通「通讯录部门成员读」相关权限，保存后重新发布应用，等待 1～5 分钟再同步。';
    if (applyUrl) hint += `\n\n一键申请链接：\n${applyUrl}`;
    return base + '\n\n' + hint;
  }
  if (code === 50004 || msg.includes('50004') || msg.includes('not within the scope of authorization')) {
    return base + '。应用通讯录授权范围不包含该部门。若仅授权部分部门（如信息中心），请确认钉钉开放平台已勾选该部门；也可在 .env 设置 DINGTALK_SYNC_ROOT_DEPT_IDS 指定起始部门 ID。';
  }
  if (code === 60003 || msg.includes('权限')) {
    return base + '。请在钉钉开放平台为本应用开启「通讯录部门信息读」「通讯录成员信息读」并发布。';
  }
  if (code === 40014 || code === 40001) {
    return base + '。请检查 AppKey、AppSecret 是否正确，或稍后重试。';
  }
  if (msg.includes('登录')) {
    return base + '。请确认应用权限已开通，且服务器能访问 oapi.dingtalk.com。';
  }
  return base;
}

function nameCore(name) {
  return String(name || '').trim().split(/\s+/)[0];
}

function findUserIndexForSync(nextUsers, dingUserId, name) {
  let idx = nextUsers.findIndex(u => u.dingTalkUserId === dingUserId);
  if (idx >= 0) return idx;
  idx = nextUsers.findIndex(u => u.name === name);
  if (idx >= 0) return idx;
  const core = nameCore(name);
  if (!core) return -1;
  return nextUsers.findIndex(u =>
    u.name === core ||
    name.startsWith(u.name) ||
    u.name.startsWith(core) ||
    nameCore(u.name) === core
  );
}

async function dingTalkPost(accessToken, path, body) {
  const res = await fetch(`https://oapi.dingtalk.com${path}?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(formatDingTalkApiError(path, data));
  }
  return data.result;
}

async function getUserIdByAuthCode(authCode) {
  if (!isConfigured()) return null;
  const accessToken = await getAccessToken();
  const result = await dingTalkPost(accessToken, '/topapi/v2/user/getuserinfo', { code: authCode });
  return result?.userid || null;
}

async function sendWorkNotification({ dingTalkUserIds, title, content, url }) {
  const ids = [...new Set((dingTalkUserIds || []).map(String).filter(id => id && id !== 'demo'))];
  if (!ids.length) {
    throw new Error('无有效钉钉接收人（请先在人员档案绑定 userid）');
  }

  if (!isConfigured()) {
    return {
      success: true,
      mock: true,
      message: '钉钉未配置，演示模式已记录推送',
      dingTalkUserIds: ids,
      title,
    };
  }

  const agentId = parseInt(config.dingtalk.agentId, 10);
  if (!agentId) {
    throw new Error('DINGTALK_AGENT_ID 未配置');
  }

  const accessToken = await getAccessToken();
  const link = url || (config.publicBaseUrl ? `${config.publicBaseUrl}/app` : '');
  const textContent = `${title}\n${content}${link ? `\n${link}` : ''}`;

  const body = {
    agent_id: agentId,
    userid_list: ids.join(','),
    msg: {
      msgtype: 'text',
      text: { content: textContent },
    },
  };

  const res = await fetch(
    `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`钉钉推送失败: HTTP ${res.status}，响应非 JSON`);
  }

  if (data.errcode !== 0) {
    throw new Error(formatDingTalkApiError('message/corpconversation/asyncsend_v2', data));
  }
  return { success: true, taskId: data.task_id, dingTalkUserIds: ids };
}

async function getAuthScopes(accessToken) {
  const res = await fetch(`https://oapi.dingtalk.com/auth/scopes?access_token=${encodeURIComponent(accessToken)}`);
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(formatDingTalkApiError('/auth/scopes', data));
  }
  return data;
}

async function getDepartmentDetail(accessToken, deptId) {
  try {
    return (await dingTalkPost(accessToken, '/topapi/v2/department/get', { dept_id: deptId })) || {};
  } catch {
    return {};
  }
}

async function resolveSyncRootDeptIds(accessToken) {
  const configured = (config.dingtalk.syncRootDeptIds || []).filter(Boolean);
  if (configured.length) return configured;

  try {
    const scopes = await getAuthScopes(accessToken);
    const authed = scopes?.auth_org_scopes?.authed_dept;
    if (Array.isArray(authed) && authed.length) {
      return [...new Set(authed.map(Number).filter(n => Number.isFinite(n)))];
    }
  } catch (e) {
    console.warn('[dingtalk] 获取通讯录授权范围失败，回退 dept_id=1:', e.message);
  }
  return [1];
}

async function listSubDepartments(accessToken, deptId) {
  try {
    return (await dingTalkPost(accessToken, '/topapi/v2/department/listsub', { dept_id: deptId })) || [];
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('60003') || msg.includes('50004')) return [];
    throw e;
  }
}

async function collectAllDepartments(accessToken, rootDeptIds = [1]) {
  const departments = [];
  const deptNameById = {};
  const roots = [...new Set((Array.isArray(rootDeptIds) ? rootDeptIds : [rootDeptIds]).filter(Boolean))];
  const queue = roots.length ? [...roots] : [1];
  const seen = new Set();

  while (queue.length) {
    const deptId = queue.shift();
    if (seen.has(deptId)) continue;
    seen.add(deptId);
    departments.push({ dept_id: deptId });
    const subs = await listSubDepartments(accessToken, deptId);
    for (const d of subs) {
      if (d.dept_id == null) continue;
      if (d.name) deptNameById[d.dept_id] = d.name;
      queue.push(d.dept_id);
    }
  }
  return { departments, deptNameById };
}

async function runConcurrent(items, limit, fn) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

function deptNameMatchesFilter(deptName, filterNames) {
  if (!filterNames?.length) return true;
  const name = String(deptName || '');
  return filterNames.some(n => n === name || name.includes(n) || n.includes(name));
}

function filterDepartmentsByNames(departments, deptNameById, filterNames) {
  if (!filterNames?.length) return departments;
  return departments.filter(d =>
    deptNameMatchesFilter(deptNameById[d.dept_id], filterNames)
  );
}

function mergeDingTalkPools(a, b) {
  const userIdSet = new Set(a.userIdSet);
  for (const id of b.userIdSet) userIdSet.add(id);
  return {
    userIdSet,
    basicById: { ...b.basicById, ...a.basicById },
    deptsToScan: [...a.deptsToScan, ...b.deptsToScan],
  };
}

async function collectDingTalkUsers(accessToken, departments, deptNameById, deptNamesFilter) {
  const deptsToScan = filterDepartmentsByNames(departments, deptNameById, deptNamesFilter);
  const userIdSet = new Set();
  const basicById = {};

  await runConcurrent(deptsToScan, 8, async (dept) => {
    const list = await listUsersInDepartment(accessToken, dept.dept_id);
    for (const u of list) {
      if (!u.userid) continue;
      userIdSet.add(u.userid);
      if (!basicById[u.userid]) basicById[u.userid] = u;
    }
  });

  return { userIdSet, basicById, deptsToScan };
}

/** 先按部门拉取；若指定了部门过滤但未拉到人，再全公司拉取并合并 */
async function collectDingTalkUsersPreferDept(accessToken, departments, deptNameById, deptNamesFilter) {
  if (!deptNamesFilter?.length) {
    return { ...(await collectDingTalkUsers(accessToken, departments, deptNameById, null)), scanMode: 'full' };
  }
  const deptPool = await collectDingTalkUsers(accessToken, departments, deptNameById, deptNamesFilter);
  if (deptPool.userIdSet.size > 0 && deptPool.deptsToScan.length > 0) {
    return { ...deptPool, scanMode: 'dept' };
  }
  const fullPool = await collectDingTalkUsers(accessToken, departments, deptNameById, null);
  return { ...mergeDingTalkPools(deptPool, fullPool), scanMode: 'dept+full' };
}

function buildDingTalkNameIndex(userIdSet, basicById) {
  const byCore = new Map();
  for (const dingUserId of userIdSet) {
    const basic = basicById[dingUserId];
    if (!basic?.name) continue;
    const core = nameCore(basic.name);
    if (core && !byCore.has(core)) byCore.set(core, { dingUserId, basic });
  }
  return byCore;
}

function findDingTalkMatch(local, userIdSet, basicById, nameIndex) {
  if (local.dingTalkUserId) {
    if (userIdSet.has(local.dingTalkUserId)) {
      return { dingUserId: local.dingTalkUserId, basic: basicById[local.dingTalkUserId] };
    }
    // 已有 userid 但不在当前部门扫描结果中，仍保留 userid 供后续 get 详情
    return { dingUserId: local.dingTalkUserId, basic: basicById[local.dingTalkUserId] || { name: local.name } };
  }
  const core = nameCore(local.name);
  if (core && nameIndex.has(core)) {
    const hit = nameIndex.get(core);
    if (namesMatch(local.name, hit.basic.name)) return hit;
  }
  for (const dingUserId of userIdSet) {
    const basic = basicById[dingUserId];
    if (basic?.name && namesMatch(local.name, basic.name)) {
      return { dingUserId, basic };
    }
  }
  return null;
}

/** 获取部门 userid 列表（备用：qyapi_get_member / 成员信息读） */
async function listUserIdsInDepartment(accessToken, deptId) {
  const result = await dingTalkPost(accessToken, '/topapi/user/listid', { dept_id: deptId });
  const ids = result?.userid_list || [];
  return ids.map(userid => ({ userid }));
}

/** 获取部门成员完整列表（优先 qyapi_get_department_member / v2/user/list） */
async function listUsersByDepartmentMemberRead(accessToken, deptId) {
  const all = [];
  let cursor = 0;
  for (let i = 0; i < 50; i++) {
    const result = await dingTalkPost(accessToken, '/topapi/v2/user/list', {
      dept_id: deptId,
      cursor,
      size: 100,
    });
    const list = result?.list || [];
    all.push(...list);
    if (!result?.has_more) break;
    cursor = result.next_cursor || 0;
  }
  return all;
}

/** 获取部门成员：优先部门成员读，失败时降级为成员信息读 listid */
async function listUsersInDepartment(accessToken, deptId) {
  try {
    return await listUsersByDepartmentMemberRead(accessToken, deptId);
  } catch {
    return listUserIdsInDepartment(accessToken, deptId);
  }
}

async function getUserDetail(accessToken, userid) {
  return dingTalkPost(accessToken, '/topapi/v2/user/get', { userid });
}

function resolveDeptName(deptIds, deptNameById) {
  if (!Array.isArray(deptIds) || !deptIds.length) return '未分配部门';
  for (const id of deptIds) {
    if (deptNameById[id]) return deptNameById[id];
  }
  return '未分配部门';
}

function genLocalUserId(dingUserId) {
  const safe = String(dingUserId).replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
  return 'DT-' + (safe || Date.now().toString(36).slice(-6).toUpperCase());
}

function profileFieldsFromDetail(detail, dingTalkUserId) {
  return {
    dingTalkUserId,
    dingTalkUnionId: detail.unionid || detail.unionId || '',
    dingTalkMobile: detail.mobile || '',
    dingTalkEmail: detail.email || '',
    dingTalkActive: detail.active !== false,
  };
}

function formatWikiApiError(status, data) {
  const code = data?.code || data?.errorCode || '';
  const msg = data?.message || data?.errorMsg || data?.errmsg || '未知错误';
  const base = `钉钉文档 API 失败: ${msg}${code ? ` (${code})` : ''}`;

  if (status === 403 || String(msg).includes('permission') || String(msg).includes('权限')) {
    return base + '。请确认：1) 开放平台已开通「知识库节点读」权限；2) 您对目标文档有查看权限。';
  }
  if (status === 404 || String(msg).includes('nodeNotExist') || String(msg).includes('不存在')) {
    return base + '。请检查链接是否正确，且您有该文档的访问权限。';
  }
  if (String(msg).includes('unionId') || String(msg).includes('operatorId')) {
    return base + '。请重新同步通讯录或重新登录后再试。';
  }
  return base;
}

function normalizeDingTalkDocUrl(raw) {
  let url = String(raw || '').trim().replace(/[\s\u200b]+/g, '');
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    if (/dingtalk\.com|alidocs\./i.test(url)) {
      url = 'https://' + url.replace(/^\/+/, '');
    }
  }
  return url;
}

function isDingTalkDocUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('alidocs.dingtalk.com') ||
      host.includes('ding-doc.dingtalk.com') ||
      host.includes('docs.dingtalk.com');
  } catch {
    return false;
  }
}

async function dingTalkWikiPost(path, query, body) {
  const accessToken = await getAccessToken();
  const qs = new URLSearchParams(query || {}).toString();
  const url = `https://api.dingtalk.com${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': accessToken,
    },
    body: JSON.stringify(body || {}),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`钉钉文档 API 失败: HTTP ${res.status}，响应非 JSON`);
  }
  if (!res.ok) {
    throw new Error(formatWikiApiError(res.status, data));
  }
  return data;
}

async function dingTalkWikiGet(path, query) {
  const accessToken = await getAccessToken();
  const qs = new URLSearchParams(query || {}).toString();
  const url = `https://api.dingtalk.com${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': accessToken,
    },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`钉钉文档 API 失败: HTTP ${res.status}，响应非 JSON`);
  }
  if (!res.ok) {
    throw new Error(formatWikiApiError(res.status, data));
  }
  return data;
}

function mapWikiNodeForClient(node) {
  const type = String(node?.type || '').toUpperCase();
  return {
    nodeId: node?.nodeId || '',
    workspaceId: node?.workspaceId || '',
    name: node?.name || '未命名',
    type,
    category: node?.category || '',
    extension: node?.extension || '',
    url: node?.url || '',
    hasChildren: type === 'FOLDER' || !!node?.hasChildren,
  };
}

function mapWorkspaceForClient(workspace) {
  return {
    workspaceId: workspace?.workspaceId || '',
    rootNodeId: workspace?.rootNodeId || '',
    name: workspace?.name || '未命名知识库',
    type: workspace?.type || '',
    url: workspace?.url || '',
  };
}

function filterWikiWorkspacesByKeywords(workspaces, keywords) {
  if (!keywords?.length) return workspaces;
  return (workspaces || []).filter(ws => {
    const name = String(ws.name || '');
    return keywords.some(kw => kw && name.includes(kw));
  });
}

async function listWikiWorkspaces(operatorUnionId, options = {}) {
  const keywords = options.keywords !== undefined
    ? options.keywords
    : config.dingtalk.wikiWorkspaceKeywords;
  const all = [];
  let nextToken = '';
  for (let page = 0; page < 20; page++) {
    const query = { operatorId: operatorUnionId, maxResults: 30 };
    if (nextToken) query.nextToken = nextToken;
    const data = await dingTalkWikiGet('/v2.0/wiki/workspaces', query);
    for (const ws of data.workspaces || []) {
      all.push(mapWorkspaceForClient(ws));
    }
    nextToken = data.nextToken || '';
    if (!nextToken) break;
  }
  return filterWikiWorkspacesByKeywords(all, keywords);
}

const STAFF_WIKI_CACHE_MS = 5 * 60 * 1000;
let staffWikiCache = {
  expiresAt: 0,
  workspaces: [],
  operatorByWorkspaceId: new Map(),
  scannedUsers: 0,
  failedUsers: 0,
};

async function refreshStaffWikiWorkspaceIndex(force = false) {
  if (!force && staffWikiCache.expiresAt > Date.now()) {
    return staffWikiCache;
  }

  const users = getAllUsers().filter(u => u.dingTalkUserId || u.dingTalkUnionId);
  const operatorByWorkspaceId = new Map();
  const workspaces = [];
  let scannedUsers = 0;
  let failedUsers = 0;

  await runConcurrent(users, 4, async (user) => {
    try {
      const unionId = await resolveOperatorUnionId(user);
      scannedUsers++;
      const list = await listWikiWorkspaces(unionId, { keywords: [] });
      for (const ws of list) {
        if (!operatorByWorkspaceId.has(ws.workspaceId)) {
          operatorByWorkspaceId.set(ws.workspaceId, {
            unionId,
            userName: user.name,
            userId: user.id,
          });
          workspaces.push({
            ...ws,
            accessibleVia: user.name,
          });
        }
      }
    } catch {
      failedUsers++;
    }
  });

  workspaces.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  staffWikiCache = {
    expiresAt: Date.now() + STAFF_WIKI_CACHE_MS,
    workspaces,
    operatorByWorkspaceId,
    scannedUsers,
    failedUsers,
  };
  return staffWikiCache;
}

async function listWikiWorkspacesForStaffArchive() {
  const index = await refreshStaffWikiWorkspaceIndex();
  return {
    workspaces: index.workspaces,
    scannedUsers: index.scannedUsers,
    failedUsers: index.failedUsers,
  };
}

async function resolveWikiOperatorForWorkspace(workspaceId, fallbackUser) {
  if (!workspaceId) {
    if (!fallbackUser) throw new Error('缺少知识库信息');
    return resolveOperatorUnionId(fallbackUser);
  }
  const index = await refreshStaffWikiWorkspaceIndex();
  const hit = index.operatorByWorkspaceId.get(workspaceId);
  if (hit) return hit.unionId;
  if (fallbackUser) {
    try {
      return await resolveOperatorUnionId(fallbackUser);
    } catch {
      // fall through
    }
  }
  throw new Error('该知识库不在人员档案任一成员的可见范围内');
}

async function assertWikiWorkspaceInStaffArchive(workspaceId) {
  if (!workspaceId) return;
  const index = await refreshStaffWikiWorkspaceIndex();
  if (!index.operatorByWorkspaceId.has(workspaceId)) {
    throw new Error('该文档所属知识库不在人员档案任一成员的可见范围内');
  }
}

async function resolveWikiOperatorForNode(nodeId, workspaceId, currentUser) {
  if (workspaceId) {
    try {
      return await resolveWikiOperatorForWorkspace(workspaceId, currentUser);
    } catch {
      // try scan below
    }
  }
  try {
    return await resolveOperatorUnionId(currentUser);
  } catch {
    // try scan
  }
  const index = await refreshStaffWikiWorkspaceIndex();
  if (workspaceId && index.operatorByWorkspaceId.has(workspaceId)) {
    return index.operatorByWorkspaceId.get(workspaceId).unionId;
  }
  for (const [, op] of index.operatorByWorkspaceId) {
    try {
      const node = await getWikiNodeById(nodeId, op.unionId);
      if (node) return op.unionId;
    } catch {
      // continue
    }
  }
  throw new Error('无法访问该文档，请确认人员档案中有人对该知识库有权限');
}

async function listWikiChildNodes(parentNodeId, operatorUnionId) {
  const all = [];
  let nextToken = '';
  for (let page = 0; page < 20; page++) {
    const query = {
      parentNodeId,
      operatorId: operatorUnionId,
      maxResults: 50,
    };
    if (nextToken) query.nextToken = nextToken;
    const data = await dingTalkWikiGet('/v2.0/wiki/nodes', query);
    for (const node of data.nodes || []) {
      all.push(mapWikiNodeForClient(node));
    }
    nextToken = data.nextToken || '';
    if (!nextToken) break;
  }
  return all.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name, 'zh-CN');
    return a.type === 'FOLDER' ? -1 : 1;
  });
}

async function getWikiNodeById(nodeId, operatorUnionId) {
  const data = await dingTalkWikiGet(
    `/v2.0/wiki/nodes/${encodeURIComponent(nodeId)}`,
    { operatorId: operatorUnionId }
  );
  const node = data.node || data;
  return node?.nodeId ? mapWikiNodeForClient(node) : null;
}

async function resolveWikiNodeForAttach(body, currentUser) {
  const nodeId = String(body?.nodeId || '').trim();
  const workspaceId = String(body?.workspaceId || '').trim();
  const docUrl = normalizeDingTalkDocUrl(body?.url);

  if (nodeId) {
    const operatorUnionId = await resolveWikiOperatorForNode(nodeId, workspaceId, currentUser);
    const node = await getWikiNodeById(nodeId, operatorUnionId);
    if (!node) {
      throw new Error('无法获取文档信息，请确认人员档案中有人对该文档有访问权限');
    }
    await assertWikiWorkspaceInStaffArchive(node.workspaceId);
    if (workspaceId && node.workspaceId && node.workspaceId !== workspaceId) {
      throw new Error('文档与所选知识库不匹配');
    }
    if (node.type === 'FOLDER') {
      throw new Error('请选择具体文档，不能选择文件夹');
    }
    return { node, docUrl: node.url || docUrl || '' };
  }

  if (!docUrl) {
    throw new Error('请从知识库选择文档，或粘贴钉钉文档链接');
  }
  if (!isDingTalkDocUrl(docUrl)) {
    throw new Error('链接格式不正确，请粘贴 alidocs.dingtalk.com 或 ding-doc.dingtalk.com 的文档链接');
  }

  const index = await refreshStaffWikiWorkspaceIndex();
  let node = null;
  let lastError = null;
  const tryOperators = [];
  try {
    tryOperators.push(await resolveOperatorUnionId(currentUser));
  } catch (e) {
    lastError = e;
  }
  for (const [, op] of index.operatorByWorkspaceId) {
    if (!tryOperators.includes(op.unionId)) tryOperators.push(op.unionId);
  }
  for (const operatorUnionId of tryOperators) {
    try {
      node = await resolveWikiNodeByUrl(docUrl, operatorUnionId);
      if (node) break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!node) {
    throw lastError || new Error('无法解析该文档链接，请确认人员档案中有人对该文档有访问权限');
  }
  if (String(node.type || '').toUpperCase() === 'FOLDER') {
    throw new Error('暂不支持添加文件夹，请选择具体文档');
  }
  await assertWikiWorkspaceInStaffArchive(node.workspaceId);
  return { node: mapWikiNodeForClient(node), docUrl };
}

async function resolveOperatorUnionId(user) {
  if (user?.dingTalkUnionId) return user.dingTalkUnionId;
  if (!user?.dingTalkUserId) {
    throw new Error('当前账号未绑定钉钉 userid，无法添加钉钉文档');
  }
  const accessToken = await getAccessToken();
  const detail = await getUserDetail(accessToken, user.dingTalkUserId);
  const unionId = detail?.unionid || detail?.unionId;
  if (!unionId) {
    throw new Error('无法获取钉钉 unionId，请总经理重新同步通讯录后重试');
  }
  upsertUser({ ...user, dingTalkUnionId: unionId });
  return unionId;
}

async function resolveWikiNodeByUrl(docUrl, operatorUnionId) {
  const data = await dingTalkWikiPost(
    '/v2.0/wiki/nodes/queryByUrl',
    { operatorId: operatorUnionId },
    {
      url: docUrl,
      option: { withStatisticalInfo: false, withPermissionRole: true },
    }
  );
  return data.node || null;
}

/**
 * 钉钉登录时：按 userid 查库；若无则拉钉钉详情，按姓名/手机号匹配已有档案并绑定，否则新建 staff
 */
async function ensureUserForDingTalkLogin(dingTalkUserId) {
  if (!dingTalkUserId) return null;
  const existing = findUserByDingTalkId(dingTalkUserId);
  if (existing) return existing;
  if (!isConfigured()) return null;

  let detail;
  try {
    const accessToken = await getAccessToken();
    detail = await getUserDetail(accessToken, dingTalkUserId);
  } catch (e) {
    throw new Error(`无法从钉钉获取用户 ${dingTalkUserId}：${e.message}`);
  }

  const name = String(detail?.name || '').trim();
  const nameCore = name.split(/\s+/)[0];
  const allUsers = getAllUsers();

  if (name) {
    const byName = allUsers.find(u =>
      u.name === name ||
      u.name === nameCore ||
      name.startsWith(u.name) ||
      u.name.startsWith(nameCore)
    );
    if (byName) {
      const linked = {
        ...byName,
        ...profileFieldsFromDetail(detail, dingTalkUserId),
        name,
      };
      upsertUser(linked);
      return linked;
    }
  }

  if (detail.mobile) {
    const byMobile = allUsers.find(u => u.dingTalkMobile && u.dingTalkMobile === detail.mobile);
    if (byMobile) {
      const linked = {
        ...byMobile,
        ...profileFieldsFromDetail(detail, dingTalkUserId),
        name: name || byMobile.name,
      };
      upsertUser(linked);
      return linked;
    }
  }

  if (!config.allowDemoLogin) {
    throw new Error(`未找到钉钉用户 ${dingTalkUserId}（${name || '未知'}），请联系管理员在人员档案中同步绑定`);
  }

  const created = {
    id: genLocalUserId(dingTalkUserId),
    name: name || dingTalkUserId,
    dept: '未分配部门',
    role: 'staff',
    position: '员工',
    leaderId: '',
    standardWeekHours: 60,
    ...profileFieldsFromDetail(detail, dingTalkUserId),
  };
  upsertUser(created);
  return created;
}

function namesMatch(localName, dingName) {
  const a = nameCore(localName);
  const b = nameCore(dingName);
  if (!a || !b) return false;
  return localName === dingName || a === b || String(dingName).startsWith(a) || String(localName).startsWith(b);
}

function mergeDingTalkIntoUser(nextUsers, idx, dingUserId, detail, basic, deptNameById) {
  const name = detail.name || basic.name || dingUserId;
  const dept = resolveDeptName(detail.dept_id_list, deptNameById);
  if (idx >= 0) {
    const prev = nextUsers[idx].dingTalkUserId;
    nextUsers[idx] = {
      ...nextUsers[idx],
      dingTalkUserId: dingUserId,
    };
    return { updated: prev !== dingUserId ? 1 : 0, created: 0, bound: !!dingUserId };
  }
  // 不同步钉钉陌生人：仅绑定已有本地档案
  return { updated: 0, created: 0, bound: false, skipped: 1 };
}

async function loadDingTalkPool(accessToken) {
  const rootDeptIds = await resolveSyncRootDeptIds(accessToken);
  const pool = await collectAllDepartments(accessToken, rootDeptIds);
  for (const deptId of rootDeptIds) {
    if (pool.deptNameById[deptId]) continue;
    const detail = await getDepartmentDetail(accessToken, deptId);
    if (detail.name) pool.deptNameById[deptId] = detail.name;
  }
  pool.rootDeptIds = rootDeptIds;
  return pool;
}

async function resolveDetailForSync(accessToken, dingUserId, basic) {
  if (basic?.name) return basic;
  try {
    return await getUserDetail(accessToken, dingUserId);
  } catch {
    return basic || {};
  }
}

/**
 * 从钉钉拉取通讯录，写入 users
 * @param {object} options
 * @param {'all'|'departments'|'selected'} options.mode
 * @param {string[]} [options.deptNames] 按部门名过滤（departments / selected）
 * @param {string[]} [options.localUserIds] 仅同步这些本地人员 id（selected）
 */
async function syncUsersFromDingTalk(options = {}) {
  if (!isConfigured()) {
    return { success: false, message: '钉钉未配置，无法同步通讯录' };
  }

  const mode = options.mode || 'all';
  const deptNames = Array.isArray(options.deptNames) ? options.deptNames.filter(Boolean) : [];
  const localUserIds = Array.isArray(options.localUserIds) ? options.localUserIds.filter(Boolean) : [];

  const accessToken = await getAccessToken();
  const { departments, deptNameById } = await loadDingTalkPool(accessToken);

  let deptFilter = [];
  let scanMode = 'full';
  if (mode === 'departments') {
    if (!deptNames.length) {
      return { success: false, message: '请至少选择一个部门' };
    }
    deptFilter = deptNames;
  } else if (mode === 'selected') {
    if (!localUserIds.length) {
      return { success: false, message: '请至少勾选一名人员' };
    }
    const selectedLocalsPreview = getAllUsers().filter(u => localUserIds.includes(u.id));
    deptFilter = [...new Set(selectedLocalsPreview.map(u => u.dept).filter(Boolean))];
  }

  let userIdSet;
  let basicById;
  if (mode === 'all') {
    const pool = await collectDingTalkUsers(accessToken, departments, deptNameById, null);
    userIdSet = pool.userIdSet;
    basicById = pool.basicById;
    scanMode = 'full';
  } else if (mode === 'selected') {
    const deptPool = deptFilter.length
      ? await collectDingTalkUsers(accessToken, departments, deptNameById, deptFilter)
      : { userIdSet: new Set(), basicById: {}, deptsToScan: [] };
    const fullPool = await collectDingTalkUsers(accessToken, departments, deptNameById, null);
    const merged = mergeDingTalkPools(deptPool, fullPool);
    userIdSet = merged.userIdSet;
    basicById = merged.basicById;
    scanMode = deptPool.userIdSet.size ? 'dept+full' : 'full';
  } else {
    const pool = await collectDingTalkUsersPreferDept(accessToken, departments, deptNameById, deptFilter);
    userIdSet = pool.userIdSet;
    basicById = pool.basicById;
    scanMode = pool.scanMode;
  }

  if (!userIdSet.size && mode === 'departments') {
    return { success: false, message: '所选范围内未拉取到钉钉成员，请检查部门名称是否与钉钉一致' };
  }

  const existing = getAllUsers();
  let updated = 0;
  let created = 0;
  let skipped = 0;
  const nextUsers = [...existing];
  const changedUsers = [];
  const selectedLocals = mode === 'selected'
    ? existing.filter(u => localUserIds.includes(u.id))
    : [];

  if (mode === 'selected') {
    const needDetailIds = [];
    const boundIds = new Set();

    function tryMatchLocals(locals) {
      const nameIndex = buildDingTalkNameIndex(userIdSet, basicById);
      const pendingName = [];
      for (const local of locals) {
        const match = findDingTalkMatch(local, userIdSet, basicById, nameIndex);
        if (!match) {
          if (local.dingTalkUserId) needDetailIds.push({ local, dingUserId: local.dingTalkUserId });
          else pendingName.push(local);
          continue;
        }
        const { dingUserId, basic } = match;
        const detail = basic?.name ? basic : null;
        if (!detail) {
          needDetailIds.push({ local, dingUserId, basic });
          continue;
        }
        const idx = nextUsers.findIndex(u => u.id === local.id);
        if (idx < 0) { skipped++; continue; }
        const r = mergeDingTalkIntoUser(nextUsers, idx, dingUserId, detail, basic, deptNameById);
        if (r.skipped) skipped++;
        if (r.bound && !boundIds.has(local.id)) {
          boundIds.add(local.id);
          changedUsers.push({ ...nextUsers[idx] });
        }
        if (r.updated) updated++;
      }
      return pendingName;
    }

    const pendingName = tryMatchLocals(selectedLocals);
    skipped += pendingName.length;

    await runConcurrent(needDetailIds, 6, async (item) => {
      const local = item.local || item;
      const dingUserId = item.dingUserId || local.dingTalkUserId;
      if (!dingUserId) return;
      try {
        const detail = await getUserDetail(accessToken, dingUserId);
        const idx = nextUsers.findIndex(u => u.id === local.id);
        if (idx >= 0) {
          const r = mergeDingTalkIntoUser(nextUsers, idx, dingUserId, detail, detail, deptNameById);
          if (r.bound && !boundIds.has(local.id)) {
            boundIds.add(local.id);
            changedUsers.push({ ...nextUsers[idx] });
          }
          if (r.updated) updated++;
        }
      } catch {
        skipped++;
      }
    });
  } else {
    const targetLocals = mode === 'departments'
      ? existing.filter(u => deptFilter.some(d => deptNameMatchesFilter(u.dept, [d])))
      : existing;

    const needDetailIds = [];
    const boundIds = new Set();
    const nameIndex = buildDingTalkNameIndex(userIdSet, basicById);

    for (const local of targetLocals) {
      const match = findDingTalkMatch(local, userIdSet, basicById, nameIndex);
      if (!match) {
        if (local.dingTalkUserId) needDetailIds.push({ local, dingUserId: local.dingTalkUserId });
        else skipped++;
        continue;
      }
      const { dingUserId, basic } = match;
      const detail = basic?.name ? basic : null;
      if (!detail) {
        needDetailIds.push({ local, dingUserId, basic });
        continue;
      }
      const idx = nextUsers.findIndex(u => u.id === local.id);
      if (idx < 0) { skipped++; continue; }
      const r = mergeDingTalkIntoUser(nextUsers, idx, dingUserId, detail, basic, deptNameById);
      if (r.bound && !boundIds.has(local.id)) {
        boundIds.add(local.id);
        changedUsers.push({ ...nextUsers[idx] });
      }
      if (r.updated) updated++;
    }

    await runConcurrent(needDetailIds, 6, async (item) => {
      const local = item.local || item;
      const dingUserId = item.dingUserId || local.dingTalkUserId;
      if (!dingUserId) return;
      try {
        const detail = await getUserDetail(accessToken, dingUserId);
        const idx = nextUsers.findIndex(u => u.id === local.id);
        if (idx >= 0) {
          const r = mergeDingTalkIntoUser(nextUsers, idx, dingUserId, detail, detail, deptNameById);
          if (r.bound && !boundIds.has(local.id)) {
            boundIds.add(local.id);
            changedUsers.push({ ...nextUsers[idx] });
          }
          if (r.updated) updated++;
        }
      } catch {
        skipped++;
      }
    });
  }

  if (mode === 'selected') {
    changedUsers.length = 0;
    for (const id of localUserIds) {
      const u = nextUsers.find(x => x.id === id);
      if (u?.dingTalkUserId) changedUsers.push({ ...u });
    }
  } else if (mode === 'departments') {
    changedUsers.length = 0;
    const targetIds = new Set(
      existing.filter(u => deptFilter.some(d => deptNameMatchesFilter(u.dept, [d]))).map(u => u.id)
    );
    for (const id of targetIds) {
      const u = nextUsers.find(x => x.id === id);
      if (u?.dingTalkUserId) changedUsers.push({ ...u });
    }
  }

  // 移除历史误同步自动创建的 DT- 陌生人
  for (let i = nextUsers.length - 1; i >= 0; i--) {
    if (String(nextUsers[i].id || '').startsWith('DT-')) nextUsers.splice(i, 1);
  }

  const persisted = setUsers(nextUsers);
  let htmlPersisted = false;
  if (persisted) {
    try {
      const { persistUsersToHtml } = require('../utils/persistHtmlUsers');
      htmlPersisted = persistUsersToHtml(nextUsers);
    } catch (e) {
      console.error('[sync] 写入 HTML 失败:', e.message);
    }
  }

  const bound = changedUsers.length;
  const scope =
    mode === 'selected' ? `已选 ${localUserIds.length} 人` :
    mode === 'departments' ? `部门 ${deptNames.join('、')}` : '全公司';

  const persistHint = persisted
    ? (htmlPersisted ? '' : '（JSON 已保存，HTML 写入失败请检查文件是否被占用）')
    : '（警告：未能写入磁盘，刷新后可能丢失，请关闭占用 data 文件的程序后重试）';

  return {
    success: true,
    persisted,
    htmlPersisted,
    message: `通讯录同步完成（${scope}，${scanMode}）：绑定 ${bound} 人，新更新 ${updated} 人，新增 ${created} 人，跳过 ${skipped} 人，钉钉拉取 ${userIdSet.size} 个账号${persistHint}`,
    synced: bound,
    bound,
    updated,
    created,
    skipped,
    total: userIdSet.size,
    mode,
    scanMode,
    allUsers: nextUsers,
    updatedUsers: changedUsers,
  };
}

/**
 * 诊断通讯录同步所需权限（逐步测试，便于排查「已开通但仍报错」）
 */
async function diagnoseDingTalkSync() {
  const config = require('../config');
  const steps = [];
  if (!isConfigured()) {
    return { success: false, message: '钉钉未配置', steps };
  }

  steps.push({ step: 'config', ok: true, appKey: config.dingtalk.appKey });

  let accessToken;
  try {
    accessToken = await getAccessToken();
    steps.push({ step: 'gettoken', ok: true });
  } catch (e) {
    steps.push({ step: 'gettoken', ok: false, error: e.message });
    return { success: false, message: 'gettoken 失败', steps };
  }

  async function probe(name, path, body, method = 'POST') {
    const url = `https://oapi.dingtalk.com${path}?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    });
    const data = await res.json();
    const ok = data.errcode === 0;
    steps.push({
      step: name,
      ok,
      errcode: data.errcode,
      errmsg: data.errmsg,
      requiredScope: String(data.errmsg || '').match(/qyapi_[a-z_]+/)?.[0] || null,
    });
    return { ok, data };
  }

  let probeDeptId = 1;
  const scopeResult = await probe('auth_scopes', '/auth/scopes', null, 'GET');
  if (scopeResult.ok) {
    const authed = scopeResult.data?.auth_org_scopes?.authed_dept;
    if (Array.isArray(authed) && authed.length) {
      probeDeptId = authed[0];
      steps.push({ step: 'auth_scopes_dept', ok: true, authedDept: authed });
    }
  }

  await probe('department_listsub', '/topapi/v2/department/listsub', { dept_id: probeDeptId });
  const userListResult = await probe('user_list', '/topapi/v2/user/list', { dept_id: probeDeptId, cursor: 0, size: 1 });
  const deptMemberOk = userListResult.ok;
  if (!deptMemberOk) {
    await probe('user_listid_fallback', '/topapi/user/listid', { dept_id: probeDeptId });
  }
  await probe('user_get', '/topapi/v2/user/get', { userid: '669701617' });

  const failed = steps.find(s => s.ok === false && s.step !== 'user_list');
  const memberStep = steps.find(s => s.step === 'user_list');
  const fallbackStep = steps.find(s => s.step === 'user_listid_fallback');

  let message;
  if (memberStep?.ok) {
    message = '通讯录权限正常（使用部门成员读 qyapi_get_department_member），可执行同步';
  } else if (fallbackStep?.ok) {
    message = '部门成员读不可用，但成员信息读可用，同步将使用备用接口 listid';
  } else if (memberStep && !memberStep.ok) {
    message = [
      '无法读取部门成员列表。',
      '请开通「通讯录部门成员读」权限（qyapi_get_department_member），或备用「成员信息读」（qyapi_get_member）。',
      `缺少权限点：${memberStep.requiredScope || 'qyapi_get_department_member'}`,
      '企业管理员：钉钉工作台 → 应用管理 → 恒慧管 → 授权管理 → 重新授权',
    ].join('\n');
  } else {
    message = failed?.error || failed?.errmsg || '诊断未通过';
  }

  return { success: memberStep?.ok || fallbackStep?.ok || false, message, steps };
}

module.exports = {
  isConfigured,
  getAccessToken,
  getUserIdByAuthCode,
  sendWorkNotification,
  syncUsersFromDingTalk,
  ensureUserForDingTalkLogin,
  diagnoseDingTalkSync,
  normalizeDingTalkDocUrl,
  isDingTalkDocUrl,
  resolveOperatorUnionId,
  resolveWikiNodeByUrl,
  resolveWikiNodeForAttach,
  listWikiWorkspaces,
  listWikiWorkspacesForStaffArchive,
  listWikiChildNodes,
  resolveWikiOperatorForWorkspace,
  mapWikiNodeForClient,
};
