const config = require('../config');
const {
  getAllUsers,
  setUsers,
  findUserByDingTalkId,
  upsertUser,
  applyPersonRenames,
  getStaffDeptCatalog,
  setStaffDeptCatalog,
} = require('../db/database');
const {
  PROFILE_KIND_MEMBER,
  PROFILE_KIND_CONTACT,
  normalizeProfileKind,
  resolveProfileKindForUser,
  mergeDeptsIntoCatalog,
  catalogKindForDept,
  mergeOrgTreeIntoCatalog,
  buildOrgForest,
} = require('../utils/staffProfile');

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
  const first = String(name || '').trim().split(/\s+/)[0];
  if (!first) return '';
  const dash = first.indexOf('-');
  return dash > 0 ? first.slice(0, dash) : first;
}

/**
 * 本地名与钉钉最新名模糊匹配时，采用钉钉最新显示名；
 * 调用方需同步把任务/项目里的旧名引用改成新名。
 */
function resolveSyncedDisplayName(localName, dingName) {
  if (!dingName) return localName || '';
  if (!localName) return dingName;
  if (localName === dingName) return localName;
  if (namesMatch(localName, dingName)) return dingName;
  return dingName;
}

function collectNameRenames(previousUsers, nextUsers) {
  const prevById = new Map((previousUsers || []).map(u => [u.id, u]));
  const renames = [];
  for (const u of nextUsers || []) {
    const prev = prevById.get(u.id);
    if (prev?.name && u?.name && prev.name !== u.name) {
      renames.push({
        id: u.id,
        from: prev.name,
        to: u.name,
      });
    }
  }
  return renames;
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

/**
 * 工作通知跳转：在钉钉工作台内打开 H5，避免普通 https 被当外部网页用浏览器打开。
 * 企业内部应用 app_id = 0_{agentId}
 */
function buildWorkAppJumpUrl(pageUrl) {
  const corpId = String(config.dingtalk.corpId || '').trim();
  const agentId = String(config.dingtalk.agentId || '').trim();
  const redirect = String(pageUrl || '').trim();
  if (!corpId || !agentId || !redirect) return '';
  const appId = `0_${agentId}`;
  return (
    'dingtalk://dingtalkclient/action/openapp'
    + `?corpid=${encodeURIComponent(corpId)}`
    + `&container_type=work_platform`
    + `&app_id=${encodeURIComponent(appId)}`
    + `&redirect_type=jump`
    + `&redirect_url=${encodeURIComponent(redirect)}`
  );
}

function resolveWorkNotificationPageUrl(url) {
  const custom = String(url || '').trim();
  if (custom) return custom;
  if (config.publicBaseUrl) return `${config.publicBaseUrl}/app`;
  return '';
}

async function sendWorkNotification({ dingTalkUserIds, title, content, url, withLink = true }) {
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
      withLink: withLink !== false,
    };
  }

  const agentId = parseInt(config.dingtalk.agentId, 10);
  if (!agentId) {
    throw new Error('DINGTALK_AGENT_ID 未配置');
  }

  const accessToken = await getAccessToken();
  const pageUrl = resolveWorkNotificationPageUrl(url);
  const jumpUrl = withLink === false ? '' : buildWorkAppJumpUrl(pageUrl);
  const safeTitle = String(title || '【恒慧管】通知').slice(0, 64);
  const safeContent = String(content || '').trim();

  let msg;
  if (jumpUrl) {
    const markdown = safeContent
      ? `### ${safeTitle}\n\n${safeContent}`
      : `### ${safeTitle}`;
    msg = {
      msgtype: 'action_card',
      action_card: {
        title: safeTitle,
        markdown,
        single_title: '打开恒慧管',
        single_url: jumpUrl,
      },
    };
  } else {
    if (withLink !== false) {
      console.warn('[钉钉推送] 缺少 corpId/agentId/页面地址，降级为纯文本（链接可能在浏览器打开）');
    }
    // withLink:false 明确不附页面 URL；其它降级场景仍可附 pageUrl 便于排查
    const textContent = withLink === false
      ? `${safeTitle}\n${safeContent}`.trim()
      : `${safeTitle}\n${safeContent}${pageUrl ? `\n${pageUrl}` : ''}`.trim();
    msg = {
      msgtype: 'text',
      text: { content: textContent },
    };
  }

  const body = {
    agent_id: agentId,
    userid_list: ids.join(','),
    msg,
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
  return {
    success: true,
    taskId: data.task_id,
    dingTalkUserIds: ids,
    inAppJump: !!jumpUrl,
    withLink: withLink !== false,
  };
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
  const parentIdByDeptId = {};
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
      parentIdByDeptId[d.dept_id] = deptId;
      queue.push(d.dept_id);
    }
  }

  // listsub 只返回子部门名；授权根部门（如财务中心）必须单独 get，否则同步弹窗勾不到
  const missingIds = departments
    .map(d => d.dept_id)
    .filter(id => id != null && !deptNameById[id]);
  if (missingIds.length) {
    await runConcurrent(missingIds, 5, async (deptId) => {
      const detail = await getDepartmentDetail(accessToken, deptId);
      if (detail && detail.name) deptNameById[deptId] = detail.name;
      if (detail && detail.parent_id != null && parentIdByDeptId[deptId] == null) {
        parentIdByDeptId[deptId] = detail.parent_id;
      }
    });
  }

  return { departments, deptNameById, parentIdByDeptId };
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
    if (String(msg).includes('Wiki.Read') || String(msg).includes('mineWorkspaces')) {
      return base + '。请确认开放平台已开通「知识库读」权限（Wiki.Read），用于加载「我的文档」。';
    }
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

/** 钉钉「我的文档」知识库（个人文档，需 Wiki.Read 权限） */
async function getMineWikiWorkspace(operatorUnionId) {
  const data = await dingTalkWikiGet('/v2.0/wiki/mineWorkspaces', { operatorId: operatorUnionId });
  const ws = data?.workspace;
  if (!ws?.workspaceId) return null;
  return mapWorkspaceForClient({
    ...ws,
    type: ws.type || 'PERSONAL',
    name: ws.name || '我的文档',
  });
}

/** 团队知识库 + 我的文档（去重合并） */
async function listWikiWorkspacesForOperator(operatorUnionId, options = {}) {
  const wsMap = new Map();
  for (const ws of await listWikiWorkspaces(operatorUnionId, options)) {
    wsMap.set(ws.workspaceId, ws);
  }
  try {
    const mine = await getMineWikiWorkspace(operatorUnionId);
    if (mine && !wsMap.has(mine.workspaceId)) {
      wsMap.set(mine.workspaceId, mine);
    }
  } catch {
    // mineWorkspaces 可能因权限未开通而失败，忽略
  }
  return [...wsMap.values()].sort((a, b) => {
    if (a.type === 'PERSONAL' && b.type !== 'PERSONAL') return -1;
    if (b.type === 'PERSONAL' && a.type !== 'PERSONAL') return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

function sortWikiWorkspacesForUser(workspaces, currentUser) {
  const list = [...(workspaces || [])];
  if (!currentUser?.name) {
    return list.sort((a, b) => {
      if (a.type === 'PERSONAL' && b.type !== 'PERSONAL') return -1;
      if (b.type === 'PERSONAL' && a.type !== 'PERSONAL') return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }
  return list.sort((a, b) => {
    const aMine = a.type === 'PERSONAL' && a.accessibleVia === currentUser.name;
    const bMine = b.type === 'PERSONAL' && b.accessibleVia === currentUser.name;
    if (aMine && !bMine) return -1;
    if (bMine && !aMine) return 1;
    if (a.type === 'PERSONAL' && b.type !== 'PERSONAL') return -1;
    if (b.type === 'PERSONAL' && a.type !== 'PERSONAL') return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

function registerWorkspaceInStaffIndex(index, ws, unionId, user) {
  if (!ws?.workspaceId || !index) return;
  index.operatorByWorkspaceId.set(ws.workspaceId, {
    unionId,
    userName: user.name,
    userId: user.id,
  });
  if (!index.workspaces.some(w => w.workspaceId === ws.workspaceId)) {
    index.workspaces.push({
      ...ws,
      accessibleVia: user.name,
    });
  }
}

async function ensureCurrentUserWorkspacesMerged(currentUser) {
  if (!currentUser || (!currentUser.dingTalkUserId && !currentUser.dingTalkUnionId)) return;
  try {
    const unionId = await resolveOperatorUnionId(currentUser);
    const list = await listWikiWorkspacesForOperator(unionId, { keywords: [] });
    const index = await refreshStaffWikiWorkspaceIndex();
    for (const ws of list) {
      if (!index.operatorByWorkspaceId.has(ws.workspaceId)) {
        registerWorkspaceInStaffIndex(index, ws, unionId, currentUser);
      } else if (ws.type === 'PERSONAL') {
        index.operatorByWorkspaceId.set(ws.workspaceId, {
          unionId,
          userName: currentUser.name,
          userId: currentUser.id,
        });
        const existing = index.workspaces.find(w => w.workspaceId === ws.workspaceId);
        if (existing) {
          existing.accessibleVia = currentUser.name;
          existing.type = ws.type || existing.type;
        }
      }
    }
    index.workspaces = sortWikiWorkspacesForUser(index.workspaces, currentUser);
  } catch {
    // 当前用户 unionId 不可用时忽略，仍可使用人员档案汇总结果
  }
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
      const list = await listWikiWorkspacesForOperator(unionId, { keywords: [] });
      for (const ws of list) {
        if (String(ws.type || '').toUpperCase() === 'PERSONAL') continue;
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

async function listWikiWorkspacesForStaffArchive(currentUser) {
  const personalWorkspaces = [];
  const teamWorkspaces = [];
  let mineError = null;
  let bindError = null;

  const index = await refreshStaffWikiWorkspaceIndex();

  if (currentUser) {
    try {
      const unionId = await resolveOperatorUnionId(currentUser);

      try {
        const mine = await getMineWikiWorkspace(unionId);
        if (mine) {
          const item = {
            ...mine,
            name: mine.name || '我的文档',
            type: 'PERSONAL',
            accessibleVia: currentUser.name,
            isOwn: true,
          };
          personalWorkspaces.push(item);
          registerWorkspaceInStaffIndex(index, item, unionId, currentUser);
        } else {
          mineError = '未获取到「我的文档」，请确认钉钉账号中已有个人文档';
        }
      } catch (e) {
        mineError = e.message || '加载「我的文档」失败';
      }

      const ownTeamList = await listWikiWorkspaces(unionId, { keywords: [] });
      for (const ws of ownTeamList) {
        if (String(ws.type || '').toUpperCase() === 'PERSONAL') {
          if (!personalWorkspaces.some(p => p.workspaceId === ws.workspaceId)) {
            const item = { ...ws, name: ws.name || '我的文档', accessibleVia: currentUser.name, isOwn: true };
            personalWorkspaces.push(item);
            registerWorkspaceInStaffIndex(index, item, unionId, currentUser);
          }
          continue;
        }
        if (!teamWorkspaces.some(t => t.workspaceId === ws.workspaceId)) {
          const item = { ...ws, accessibleVia: currentUser.name, isOwn: true };
          teamWorkspaces.push(item);
          registerWorkspaceInStaffIndex(index, item, unionId, currentUser);
        }
      }
    } catch (e) {
      bindError = e.message || '当前账号未绑定钉钉 userid/unionId';
    }
  }

  for (const ws of index.workspaces) {
    if (String(ws.type || '').toUpperCase() === 'PERSONAL') continue;
    if (!teamWorkspaces.some(t => t.workspaceId === ws.workspaceId)) {
      teamWorkspaces.push({
        ...ws,
        isOwn: ws.accessibleVia === currentUser?.name,
      });
    }
  }

  personalWorkspaces.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  teamWorkspaces.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return {
    personalWorkspaces,
    teamWorkspaces,
    workspaces: [...personalWorkspaces, ...teamWorkspaces],
    mineError,
    bindError,
    scannedUsers: index.scannedUsers,
    failedUsers: index.failedUsers,
  };
}

async function resolveWikiOperatorForWorkspace(workspaceId, fallbackUser) {
  if (fallbackUser) {
    try {
      await ensureCurrentUserWorkspacesMerged(fallbackUser);
      const unionId = await resolveOperatorUnionId(fallbackUser);
      const list = await listWikiWorkspacesForOperator(unionId, { keywords: [] });
      if (!workspaceId || list.some(ws => ws.workspaceId === workspaceId)) {
        return unionId;
      }
    } catch {
      // try staff index below
    }
  }
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
  throw new Error('该知识库不在可见范围内，请确认已绑定钉钉 unionId 或重新同步通讯录');
}

async function assertWikiWorkspaceAccessible(workspaceId, currentUser, options = {}) {
  if (!workspaceId) {
    if (options.operatorUnionIdUsed && currentUser) {
      const unionId = await resolveOperatorUnionId(currentUser).catch(() => null);
      if (unionId && unionId === options.operatorUnionIdUsed) return;
    }
    return;
  }
  if (currentUser) await ensureCurrentUserWorkspacesMerged(currentUser);
  const index = await refreshStaffWikiWorkspaceIndex();
  if (index.operatorByWorkspaceId.has(workspaceId)) return;

  if (currentUser && options.operatorUnionIdUsed) {
    const unionId = await resolveOperatorUnionId(currentUser).catch(() => null);
    if (unionId && unionId === options.operatorUnionIdUsed) {
      try {
        const mine = await getMineWikiWorkspace(unionId);
        if (mine?.workspaceId === workspaceId) {
          registerWorkspaceInStaffIndex(index, mine, unionId, currentUser);
          return;
        }
      } catch {
        // fall through
      }
      index.operatorByWorkspaceId.set(workspaceId, {
        unionId,
        userName: currentUser.name,
        userId: currentUser.id,
      });
      return;
    }
  }

  throw new Error('该文档不在可见范围内。请在左侧选择「我的文档」或团队知识库后再添加');
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
      throw new Error('无法获取文档信息，请确认您或人员档案中其他成员对该文档有访问权限');
    }
    await assertWikiWorkspaceAccessible(node.workspaceId, currentUser, { operatorUnionIdUsed: operatorUnionId });
    if (workspaceId && node.workspaceId && node.workspaceId !== workspaceId) {
      throw new Error('文档与所选知识库不匹配');
    }
    if (node.type === 'FOLDER') {
      throw new Error('请选择具体文档，不能选择文件夹');
    }
    return { node, docUrl: node.url || docUrl || '' };
  }

  if (!docUrl) {
    throw new Error('请从左侧选择「我的文档」或团队知识库，再选择具体文档');
  }
  if (!isDingTalkDocUrl(docUrl)) {
    throw new Error('链接格式不正确，请粘贴 alidocs.dingtalk.com 或 ding-doc.dingtalk.com 的文档链接');
  }

  await ensureCurrentUserWorkspacesMerged(currentUser);
  const index = await refreshStaffWikiWorkspaceIndex();
  let node = null;
  let resolvedOperatorUnionId = null;
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
      const hit = await resolveWikiNodeByUrl(docUrl, operatorUnionId);
      if (hit) {
        node = hit;
        resolvedOperatorUnionId = operatorUnionId;
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }
  if (!node) {
    throw lastError || new Error('无法解析该文档，请从左侧目录中选择具体文档');
  }
  if (String(node.type || '').toUpperCase() === 'FOLDER') {
    throw new Error('暂不支持添加文件夹，请选择具体文档');
  }
  await assertWikiWorkspaceAccessible(node.workspaceId, currentUser, {
    operatorUnionIdUsed: resolvedOperatorUnionId,
  });
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
 * 通知联系人（profileKind=contact）可绑定 userid，但调用方应拒绝其登录。
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
        name: resolveSyncedDisplayName(byName.name, name),
        // 不因登录尝试把联系人升级为业务成员
        profileKind: byName.profileKind || PROFILE_KIND_MEMBER,
      };
      if (byName.name && linked.name && byName.name !== linked.name) {
        applyPersonRenames([{ from: byName.name, to: linked.name }]);
      }
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
        profileKind: byMobile.profileKind || PROFILE_KIND_MEMBER,
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
    profileKind: PROFILE_KIND_MEMBER,
    position: '员工',
    leaderId: '',
    standardWeekHours: 60,
    ...profileFieldsFromDetail(detail, dingTalkUserId),
  };
  upsertUser(created);
  return created;
}

/** 列出钉钉授权范围内的部门（含父子），并合并进本地目录树 */
async function listDingTalkDepartments() {
  if (!isConfigured()) {
    return {
      success: false,
      message: '钉钉未配置',
      departments: [],
      catalog: getStaffDeptCatalog(),
      orgForest: buildOrgForest(getStaffDeptCatalog()),
    };
  }
  const accessToken = await getAccessToken();
  const { departments, deptNameById, parentIdByDeptId, rootDeptIds } = await loadDingTalkPool(accessToken);
  const treeNodes = [];
  for (const d of departments) {
    const name = deptNameById[d.dept_id];
    if (!name) continue;
    const parentId = parentIdByDeptId?.[d.dept_id];
    const parentName = parentId != null ? (deptNameById[parentId] || '') : '';
    treeNodes.push({
      name,
      parentName,
      dingTalkDeptId: String(d.dept_id),
    });
  }
  if (treeNodes.length) {
    const merged = mergeOrgTreeIntoCatalog(getStaffDeptCatalog(), treeNodes);
    setStaffDeptCatalog(merged);
  }
  const catalog = getStaffDeptCatalog();
  const names = [...new Set(treeNodes.map(n => n.name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const unnamedRoots = departments
    .map(d => d.dept_id)
    .filter(id => id != null && !deptNameById[id]);
  return {
    success: true,
    departments: names.map(name => ({
      name,
      kindHint: catalogKindForDept(catalog, name),
      parentName: (catalog.find(c => c.name === name) || {}).parentName || '',
    })),
    rootDeptIds,
    unnamedRootCount: unnamedRoots.length,
    message: names.length
      ? `已加载 ${names.length} 个钉钉部门`
      : '钉钉授权范围内未读到部门名称。请确认开放平台通讯录授权已包含目标部门（如财务中心），或配置 DINGTALK_SYNC_ROOT_DEPT_IDS。',
    catalog,
    orgForest: buildOrgForest(catalog),
  };
}

function namesMatch(localName, dingName) {
  const a = nameCore(localName);
  const b = nameCore(dingName);
  if (!a || !b) return false;
  return localName === dingName || a === b || String(dingName).startsWith(a) || String(localName).startsWith(b);
}

function mergeDingTalkIntoUser(nextUsers, idx, dingUserId, detail, basic, deptNameById) {
  const dingName = detail.name || basic?.name || '';
  if (idx >= 0) {
    const prev = nextUsers[idx];
    const nextName = dingName && namesMatch(prev.name, dingName)
      ? resolveSyncedDisplayName(prev.name, dingName)
      : prev.name;
    const prevUid = prev.dingTalkUserId;
    nextUsers[idx] = {
      ...prev,
      dingTalkUserId: dingUserId,
      name: nextName,
      ...profileFieldsFromDetail({ ...basic, ...detail }, dingUserId),
    };
    const changed = prevUid !== dingUserId || prev.name !== nextName;
    return { updated: changed ? 1 : 0, created: 0, bound: !!dingUserId };
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

function nextLocalUserId(users) {
  let max = 0;
  for (const u of users) {
    const m = String(u.id || '').match(/^U(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'U' + String(max + 1).padStart(3, '0');
}

function isPrivilegedStaffRole(role) {
  return role === 'gm' || role === 'admin' || role === 'manager';
}

function findLocalForDingReplace(dingUserId, dingName, nextUsers, claimedLocalIds) {
  const byUserId = nextUsers.find(
    u => u.dingTalkUserId && u.dingTalkUserId === dingUserId && !claimedLocalIds.has(u.id)
  );
  if (byUserId) return { local: byUserId, how: 'userid' };

  if (!dingName) return { local: null, how: 'none' };
  const nameHits = nextUsers.filter(
    u => !claimedLocalIds.has(u.id) && namesMatch(u.name, dingName)
  );
  if (nameHits.length === 1) return { local: nameHits[0], how: 'name' };
  if (nameHits.length > 1) {
    return {
      local: null,
      how: 'ambiguous',
      ambiguousLocals: nameHits.map(u => ({ id: u.id, name: u.name, dept: u.dept })),
    };
  }
  return { local: null, how: 'none' };
}

function applyDingTalkProfileToLocal(local, dingUserId, detail, basic, deptNameById, catalog) {
  const dingName = detail.name || basic?.name || local.name;
  const name = resolveSyncedDisplayName(local.name, dingName);
  const dept = resolveDeptName(detail.dept_id_list || basic?.dept_id_list, deptNameById);
  const position = detail.title || basic?.title || local.position || '执行人员';
  const profile = profileFieldsFromDetail({ ...basic, ...detail }, dingUserId);
  const role = isPrivilegedStaffRole(local.role) ? local.role : (local.role || 'staff');
  const resolvedDept = dept === '未分配部门' && local.dept ? local.dept : dept;
  const profileKind = local.profileKind
    ? (isPrivilegedStaffRole(role) ? PROFILE_KIND_MEMBER : normalizeProfileKind(local.profileKind))
    : resolveProfileKindForUser({
      dept: resolvedDept,
      role,
      catalog: catalog || getStaffDeptCatalog(),
    });
  return {
    ...local,
    name,
    dept: resolvedDept,
    position,
    active: true,
    role,
    profileKind,
    standardWeekHours: local.standardWeekHours || 60,
    ...profile,
  };
}

/**
 * 按勾选部门从钉钉名册替换本地人员档案：新建 / 更新 / 软停用
 * @param {object} options
 * @param {string[]} options.deptNames
 * @param {boolean} [options.dryRun]
 */
async function replaceUsersFromDingTalk(options = {}) {
  if (!isConfigured()) {
    return { success: false, message: '钉钉未配置，无法同步通讯录' };
  }

  const deptNames = Array.isArray(options.deptNames) ? options.deptNames.filter(Boolean) : [];
  if (!deptNames.length) {
    return { success: false, message: '请至少勾选一个部门' };
  }
  const dryRun = !!options.dryRun;

  const accessToken = await getAccessToken();
  const { departments, deptNameById } = await loadDingTalkPool(accessToken);
  const pool = await collectDingTalkUsers(accessToken, departments, deptNameById, deptNames);
  if (!pool.userIdSet.size) {
    return {
      success: false,
      message: '所选部门未拉取到钉钉成员，请检查部门名称是否与钉钉一致，或开放平台授权范围是否包含这些部门',
    };
  }

  // 勾选但未在目录中的部门，默认记为通知联系人部门
  const nextCatalog = mergeDeptsIntoCatalog(getStaffDeptCatalog(), deptNames, PROFILE_KIND_CONTACT);

  const dingIds = [...pool.userIdSet];
  const detailsById = {};
  await runConcurrent(dingIds, 6, async (dingUserId) => {
    const basic = pool.basicById[dingUserId] || {};
    detailsById[dingUserId] = await resolveDetailForSync(accessToken, dingUserId, basic);
  });

  const previousUsers = getAllUsers().map(u => ({ ...u }));
  const nextUsers = previousUsers.map(u => ({ ...u }));
  const claimedLocalIds = new Set();
  const coveredLocalIds = new Set();
  const toCreate = [];
  const toUpdate = [];
  const toDeactivate = [];
  const toRename = [];
  const ambiguous = [];
  let skippedInactive = 0;

  for (const dingUserId of dingIds) {
    const detail = detailsById[dingUserId] || pool.basicById[dingUserId] || {};
    const basic = pool.basicById[dingUserId] || detail;
    if (detail.active === false || basic.active === false) {
      skippedInactive++;
      continue;
    }
    const dingName = detail.name || basic.name || '';
    const match = findLocalForDingReplace(dingUserId, dingName, nextUsers, claimedLocalIds);

    if (match.how === 'ambiguous') {
      ambiguous.push({
        dingTalkUserId: dingUserId,
        name: dingName,
        locals: match.ambiguousLocals,
      });
      continue;
    }

    if (match.local) {
      const idx = nextUsers.findIndex(u => u.id === match.local.id);
      if (idx < 0) continue;
      const oldName = nextUsers[idx].name;
      const merged = applyDingTalkProfileToLocal(
        nextUsers[idx], dingUserId, detail, basic, deptNameById, nextCatalog
      );
      nextUsers[idx] = merged;
      claimedLocalIds.add(merged.id);
      coveredLocalIds.add(merged.id);
      if (oldName && merged.name && oldName !== merged.name) {
        toRename.push({ id: merged.id, from: oldName, to: merged.name });
      }
      toUpdate.push({
        id: merged.id,
        name: merged.name,
        dept: merged.dept,
        role: merged.role,
        profileKind: merged.profileKind,
        dingTalkUserId: merged.dingTalkUserId,
        how: match.how,
        renamedFrom: oldName !== merged.name ? oldName : undefined,
      });
      continue;
    }

    const dept = resolveDeptName(detail.dept_id_list || basic.dept_id_list, deptNameById);
    const profileKind = catalogKindForDept(nextCatalog, dept);
    const created = {
      id: nextLocalUserId(nextUsers),
      name: dingName || dingUserId,
      dept,
      role: 'staff',
      profileKind,
      position: detail.title || basic.title || '执行人员',
      leaderId: '',
      standardWeekHours: 60,
      active: true,
      ...profileFieldsFromDetail({ ...basic, ...detail }, dingUserId),
    };
    nextUsers.push(created);
    claimedLocalIds.add(created.id);
    coveredLocalIds.add(created.id);
    toCreate.push({
      id: created.id,
      name: created.name,
      dept: created.dept,
      role: created.role,
      profileKind: created.profileKind,
      dingTalkUserId: created.dingTalkUserId,
    });
  }

  for (const local of nextUsers) {
    if (coveredLocalIds.has(local.id)) continue;
    if (local.active === false) continue;
    const inScope = deptNames.some(d => deptNameMatchesFilter(local.dept, [d]));
    if (!inScope) continue;
    toDeactivate.push({
      id: local.id,
      name: local.name,
      dept: local.dept,
      role: local.role,
      profileKind: local.profileKind || PROFILE_KIND_MEMBER,
      dingTalkUserId: local.dingTalkUserId || '',
    });
    const idx = nextUsers.findIndex(u => u.id === local.id);
    if (idx >= 0) nextUsers[idx] = { ...nextUsers[idx], active: false };
  }

  const renames = toRename.length ? toRename : collectNameRenames(previousUsers, nextUsers);
  const summary = {
    create: toCreate,
    update: toUpdate,
    deactivate: toDeactivate,
    rename: renames,
    ambiguous,
    skippedInactive,
    dingTalkPulled: dingIds.length,
    depts: deptNames,
    staffDeptCatalog: nextCatalog,
  };

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      preview: summary,
      created: toCreate.length,
      updated: toUpdate.length,
      deactivated: toDeactivate.length,
      renamed: renames.length,
      ambiguous: ambiguous.length,
      message:
        `预览（部门：${deptNames.join('、')}）：将新增 ${toCreate.length}、更新 ${toUpdate.length}、改名 ${renames.length}、停用 ${toDeactivate.length}` +
        (ambiguous.length ? `，重名待处理 ${ambiguous.length}` : '') +
        `；钉钉拉取 ${dingIds.length} 人` +
        (skippedInactive ? `，跳过离职 ${skippedInactive}` : ''),
    };
  }

  // 移除历史误同步自动创建的 DT- 陌生人
  for (let i = nextUsers.length - 1; i >= 0; i--) {
    if (String(nextUsers[i].id || '').startsWith('DT-')) nextUsers.splice(i, 1);
  }

  const renameResult = applyPersonRenames(renames);
  setStaffDeptCatalog(nextCatalog);
  const persisted = setUsers(nextUsers);
  let htmlPersisted = false;
  if (persisted) {
    try {
      const { persistUsersToHtml } = require('../utils/persistHtmlUsers');
      htmlPersisted = persistUsersToHtml(nextUsers);
    } catch (e) {
      console.error('[replace-sync] 写入 HTML 失败:', e.message);
    }
  }

  const persistHint = persisted
    ? (htmlPersisted ? '' : '（JSON 已保存，HTML 写入失败请检查文件是否被占用）')
    : '（警告：未能写入磁盘，刷新后可能丢失，请关闭占用 data 文件的程序后重试）';

  return {
    success: true,
    dryRun: false,
    persisted,
    htmlPersisted,
    preview: {
      ...summary,
      renameApplied: renameResult.applied,
      renamedRefs: renameResult.renamedRefs,
    },
    created: toCreate.length,
    updated: toUpdate.length,
    deactivated: toDeactivate.length,
    renamed: renames.length,
    renamedRefs: renameResult.renamedRefs,
    ambiguous: ambiguous.length,
    bound: toUpdate.length + toCreate.length,
    skipped: ambiguous.length + skippedInactive,
    total: dingIds.length,
    mode: 'replace',
    scanMode: 'dept',
    message:
      `名册替换完成（部门：${deptNames.join('、')}）：新增 ${toCreate.length}、更新 ${toUpdate.length}、改名 ${renames.length}` +
      (renameResult.renamedRefs ? `（引用 ${renameResult.renamedRefs} 处）` : '') +
      `、停用 ${toDeactivate.length}` +
      (ambiguous.length ? `，重名跳过 ${ambiguous.length}` : '') +
      `；钉钉拉取 ${dingIds.length} 人${persistHint}`,
    allUsers: nextUsers,
    updatedUsers: [...toUpdate, ...toCreate].map(row => nextUsers.find(u => u.id === row.id)).filter(Boolean),
    staffDeptCatalog: nextCatalog,
  };
}

/**
 * 从钉钉拉取通讯录，写入 users
 * @param {object} options
 * @param {'all'|'departments'|'selected'|'replace'} options.mode
 * @param {string[]} [options.deptNames] 按部门名过滤（departments / selected / replace）
 * @param {string[]} [options.localUserIds] 仅同步这些本地人员 id（selected）
 * @param {boolean} [options.dryRun] 仅 replace 模式：预览不落盘
 */
async function syncUsersFromDingTalk(options = {}) {
  if (!isConfigured()) {
    return { success: false, message: '钉钉未配置，无法同步通讯录' };
  }

  const mode = options.mode || 'all';
  if (mode === 'replace') {
    return replaceUsersFromDingTalk(options);
  }

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

  const renames = collectNameRenames(existing, nextUsers);
  const renameResult = applyPersonRenames(renames);
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

  const renameHint = renames.length
    ? `，改名 ${renames.length} 人（引用 ${renameResult.renamedRefs} 处）`
    : '';

  return {
    success: true,
    persisted,
    htmlPersisted,
    message: `通讯录同步完成（${scope}，${scanMode}）：绑定 ${bound} 人，新更新 ${updated} 人，新增 ${created} 人，跳过 ${skipped} 人，钉钉拉取 ${userIdSet.size} 个账号${renameHint}${persistHint}`,
    synced: bound,
    bound,
    updated,
    created,
    skipped,
    renamed: renames.length,
    renamedRefs: renameResult.renamedRefs,
    renames: renameResult.applied,
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
  buildWorkAppJumpUrl,
  sendWorkNotification,
  syncUsersFromDingTalk,
  replaceUsersFromDingTalk,
  ensureUserForDingTalkLogin,
  listDingTalkDepartments,
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
