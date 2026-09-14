// ========== 后端 API & 钉钉推送（预留接口） ==========
const ApiConfig = {
  baseUrl: '/api',
  enabled: false,
  timeout: 10000,
};

/** NCC 异常看板（管理员内嵌）；可由 /config/public.nccMonitorUrl 覆盖 */
const NccMonitorConfig = {
  defaultUrl: 'https://www.handagroup.ai/api/loop/reports/ncc-monitor/html',
  url: 'https://www.handagroup.ai/api/loop/reports/ncc-monitor/html',
  /** Loop 平台自 2026-08-29 起整站需先登录；会话约 7 天 */
  loginUrl: 'https://www.handagroup.ai/login',
};

/** Handa-OM 运维门户（管理员新窗口打开，与 NCC 看板独立）；可由 /config/public.handaOmUrl 覆盖 */
const HandaOmConfig = {
  defaultUrl: 'http://192.168.0.160:18080/',
  url: 'http://192.168.0.160:18080/',
};

/** 登录模式：demo=侧边栏切换账号；dingtalk=钉钉 userid/免登（需 ApiConfig.enabled=true） */
const AuthConfig = {
  mode: 'demo',
};

function isPrivateHost(hostname) {
  return /^(localhost|127\.0\.0\.1)$/.test(hostname)
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

(function initApiConfig() {
  const { hostname, port } = window.location;
  const isLocalDev = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000';
  const isProduction = hostname === 'henghuiguan.handagroup.com' || hostname.endsWith('.handagroup.com');
  const isLanServer = isPrivateHost(hostname) && port === '3000';
  if (isLocalDev || isProduction || isLanServer) {
    ApiConfig.enabled = true;
    ApiConfig.baseUrl = '/api';
  }
  if (isProduction || isLanServer) {
    AuthConfig.mode = 'dingtalk';
  }
})();

/** 解析 API 响应；若返回 HTML（常见于后端未启动）则给出可读错误 */
async function parseJsonResponse(res) {
  const text = await res.text();
  if (!text || /^\s*</.test(text)) {
    throw new Error(
      '无法连接服务端，请确认后端已启动（server 目录执行 npm start），并通过 http://localhost:3000/app 访问'
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('服务端响应格式异常，请确认后端已正常启动');
  }
}

async function loadPublicConfig() {
  if (!ApiConfig.enabled) return;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/config/public', {
      signal: AbortSignal.timeout(8000),
    });
    const data = await parseJsonResponse(res);
    if (!data.success) return;
    if (data.corpId) DingTalkApi.corpId = data.corpId;
    if (data.appKey) DingTalkApi.appKey = data.appKey;
    if (data.agentId) DingTalkApi.agentId = data.agentId;
    if (data.nccMonitorUrl) {
      NccMonitorConfig.url = String(data.nccMonitorUrl).trim() || NccMonitorConfig.defaultUrl;
    }
    if (data.handaOmUrl) {
      HandaOmConfig.url = String(data.handaOmUrl).trim() || HandaOmConfig.defaultUrl;
    }
    if (data.localAsServer || data.isProduction || !data.allowDemoLogin) {
      AuthConfig.mode = 'dingtalk';
    }
  } catch (e) {
    console.warn('[配置] 无法加载公开配置', e);
  }
}

const DingTalkApi = {
  corpId: '',
  appKey: '',
  agentId: '',
  // appSecret 仅保存在后端 .env，前端不配置

  endpoints: {
    // —— 登录鉴权（后续钉钉 userid 跳转接入） ——
    loginByUserId: '/dingtalk/auth/login-by-userid',      // POST { dingTalkUserId, corpId? } → { success, user, token }
    webOAuthCallback: '/dingtalk/auth/oauth/callback',    // POST { authCode, corpId } →  H5/OAuth 免登
    miniAppLogin: '/dingtalk/miniapp/login',               // POST { authCode, corpId } →  小程序免登
    session: '/auth/session',                               // GET  当前会话（Header: Authorization）
    logout: '/auth/logout',                                 // POST 退出登录
    refreshToken: '/auth/refresh',                          // POST 刷新 token
    // —— 通讯录 & 推送 ——
    syncUsers: '/dingtalk/users/sync',                    // POST 同步通讯录（写入 dingTalkUserId）
    listDepartments: '/dingtalk/departments',             // GET 钉钉可见部门名
    deptCatalog: '/staff/dept-catalog',                   // GET/PUT 部门目录
    pushWorkNotification: '/dingtalk/push/work-notification', // POST 工作通知
    pushBatch: '/dingtalk/push/batch',                    // POST 批量推送
    queryPushStatus: '/dingtalk/push/status',             // GET  查询推送状态
    jsapiConfig: '/dingtalk/jsapi-config',                  // GET  H5 dd.config 签名
  },
};

const AuthService = {
  urlParamKeys: {
    userId: ['userid', 'userId', 'dingTalkUserId', 'ding_userid'],
    authCode: ['authCode', 'code'],
    corpId: ['corpId', 'corpid'],
  },

  isDemoMode() {
    return AuthConfig.mode === 'demo' || !ApiConfig.enabled;
  },

  isDingTalkMode() {
    return AuthConfig.mode === 'dingtalk' && ApiConfig.enabled;
  },

  isDingTalkClient() {
    if (typeof dd !== 'undefined') return true;
    return /DingTalk|dingtalk/i.test(navigator.userAgent || '');
  },

  /** 钉钉 H5 调用 chooseChat 等 JSAPI 前必须先 dd.config（否则 API not authed） */
  async ensureDingTalkJsApiConfig(jsApiList) {
    if (typeof dd === 'undefined') {
      throw new Error('请在钉钉客户端内打开恒慧管');
    }
    if (!ApiConfig.enabled || !authSession.token) {
      throw new Error('请连接服务端后再使用钉钉选群');
    }
    if (!DingTalkApi.corpId || !DingTalkApi.agentId) {
      await loadPublicConfig();
    }
    const list = Array.isArray(jsApiList) && jsApiList.length
      ? jsApiList
      : ['chooseChat', 'biz.chat.pickConversation'];
    const pageUrl = location.href.split('#')[0];
    const res = await fetch(
      ApiConfig.baseUrl + DingTalkApi.endpoints.jsapiConfig + '?url=' + encodeURIComponent(pageUrl),
      {
        headers: { Authorization: 'Bearer ' + authSession.token },
        signal: AbortSignal.timeout(ApiConfig.timeout || 15000),
      },
    );
    const json = await parseJsonResponse(res);
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `JSAPI 签名失败 (${res.status})`);
    }
    const cfg = json.data || {};
    await new Promise(function(resolve, reject) {
      dd.config({
        agentId: String(cfg.agentId || DingTalkApi.agentId || ''),
        corpId: String(cfg.corpId || DingTalkApi.corpId || ''),
        timeStamp: cfg.timeStamp,
        nonceStr: cfg.nonceStr,
        signature: cfg.signature,
        type: 0,
        jsApiList: list,
      });
      dd.ready(function() { resolve(); });
      dd.error(function(err) {
        const msg = (err && (err.errorMessage || err.message)) || 'dd.config 失败';
        reject(new Error(msg));
      });
    });
  },

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const pick = (keys) => {
      for (const k of keys) {
        const v = params.get(k);
        if (v) return v.trim();
      }
      return null;
    };
    return {
      dingTalkUserId: pick(this.urlParamKeys.userId),
      authCode: pick(this.urlParamKeys.authCode),
      corpId: pick(this.urlParamKeys.corpId) || DingTalkApi.corpId || '',
    };
  },

  cleanAuthUrlParams() {
    const url = new URL(window.location.href);
    [...this.urlParamKeys.userId, ...this.urlParamKeys.authCode, ...this.urlParamKeys.corpId]
      .forEach(k => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
  },

  findUserByDingTalkId(dingTalkUserId) {
    if (!dingTalkUserId) return null;
    return users.find(u =>
      u.dingTalkUserId === dingTalkUserId ||
      u.id === dingTalkUserId
    ) || null;
  },

  mergeUserFromServer(serverUser) {
    if (!serverUser) return null;
    const idx = users.findIndex(u => u.id === serverUser.id || u.dingTalkUserId === serverUser.dingTalkUserId);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...serverUser };
      return users[idx];
    }
    users.push(serverUser);
    return serverUser;
  },

  applySession(user, session = {}) {
    if (!user) return { success: false, message: '用户不存在' };
    currentUser = user;
    authSession = {
      ...authSession,
      token: session.token ?? authSession.token,
      refreshToken: session.refreshToken ?? authSession.refreshToken,
      dingTalkUserId: session.dingTalkUserId ?? user.dingTalkUserId ?? authSession.dingTalkUserId,
      loginSource: session.loginSource || authSession.loginSource || 'demo',
      expiresAt: session.expiresAt ?? authSession.expiresAt,
    };
    state.authError = null;
    state.page = 'dashboard';
    save();
    return { success: true, user };
  },

  /** 演示模式：侧边栏切换账号（后端启用时走 /api/auth/demo-login） */
  async loginDemo(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return { success: false, message: '用户不存在' };

    if (ApiConfig.enabled) {
      try {
        const res = await fetch(ApiConfig.baseUrl + '/auth/demo-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
          signal: AbortSignal.timeout(ApiConfig.timeout),
        });
        const data = await parseJsonResponse(res);
        if (!data.success) return data;
        const merged = users.find(u => u.id === data.user?.id) || this.mergeUserFromServer(data.user);
        const result = this.applySession(merged, {
          loginSource: 'demo',
          dingTalkUserId: merged.dingTalkUserId || null,
          token: data.token,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        });
        await DataService.loadFromServer();
        if (typeof LiveRefresh !== 'undefined') LiveRefresh.ensure();
        if (typeof RealtimeService !== 'undefined') {
          RealtimeService.stop();
          RealtimeService.ensure();
        }
        return result;
      } catch (e) {
        console.warn('[登录] 演示登录接口失败，降级本地', e);
      }
    }

    return this.applySession(user, {
      loginSource: 'demo',
      dingTalkUserId: user.dingTalkUserId || null,
      token: null,
      refreshToken: null,
    });
  },

  /**
   * 钉钉 userid 跳转登录（工作台/链接带 ?userid=xxx）
   * 后端接入：POST /api/dingtalk/auth/login-by-userid
   * 演示模式：按用户档案 dingTalkUserId 本地匹配
   */
  async loginByDingTalkUserId(dingTalkUserId, corpId) {
    if (!dingTalkUserId) return { success: false, message: '缺少钉钉 userid' };

    if (this.isDingTalkMode()) {
      const url = ApiConfig.baseUrl + DingTalkApi.endpoints.loginByUserId;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
          body: JSON.stringify({ dingTalkUserId, corpId: corpId || DingTalkApi.corpId }),
          signal: AbortSignal.timeout(ApiConfig.timeout),
        });
        const data = await parseJsonResponse(res);
        if (!data.success) return data;
        const user = users.find(u => u.id === data.user?.id) || this.mergeUserFromServer(data.user);
        const result = this.applySession(user, {
          token: data.token,
          refreshToken: data.refreshToken,
          dingTalkUserId,
          loginSource: 'dingtalk_userid',
          expiresAt: data.expiresAt,
        });
        await DataService.loadFromServer();
        return result;
      } catch (e) {
        console.warn('[登录] userid 接口失败:', e);
        return { success: false, message: e.message || '登录接口异常' };
      }
    }

    const user = this.findUserByDingTalkId(dingTalkUserId);
    if (!user) {
      console.warn('[登录预留] 未匹配 userid:', dingTalkUserId);
      return { success: false, message: `未找到钉钉用户 ${dingTalkUserId}，请先同步通讯录` };
    }
    console.log('[登录预留] 演示模式 userid 匹配:', dingTalkUserId, '→', user.name);
    return this.applySession(user, {
      loginSource: 'dingtalk_userid',
      dingTalkUserId,
      token: null,
    });
  },

  /** 小程序 / H5 authCode 免登 */
  async loginByAuthCode(authCode, corpId) {
    if (!authCode) return { success: false, message: '缺少 authCode' };
    const endpoint = DingTalkApi.endpoints.miniAppLogin;
    const url = ApiConfig.baseUrl + endpoint;

    if (!ApiConfig.enabled) {
      console.log('[登录预留] POST', url, { authCode, corpId });
      return { success: false, message: '后端未接入，无法 authCode 免登' };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authCode, corpId: corpId || DingTalkApi.corpId }),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await parseJsonResponse(res);
      if (!data.success) return data;
      const user = users.find(u => u.id === data.user?.id) || this.mergeUserFromServer(data.user);
      const result = this.applySession(user, {
        token: data.token,
        refreshToken: data.refreshToken,
        dingTalkUserId: data.user?.dingTalkUserId || data.dingTalkUserId,
        loginSource: 'dingtalk_miniapp',
        expiresAt: data.expiresAt,
      });
      await DataService.loadFromServer();
      return result;
    } catch (e) {
      return { success: false, message: e.message || '登录接口异常' };
    }
  },

  async fetchSession() {
    if (!authSession.token) return { success: false, message: '无 token' };
    const url = ApiConfig.baseUrl + DingTalkApi.endpoints.session;
    try {
      const res = await fetch(url, {
        headers: { ...this.getAuthHeaders() },
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await parseJsonResponse(res);
      if (!data.success) return data;
      const user = users.find(u => u.id === data.user?.id) || this.mergeUserFromServer(data.user);
      return this.applySession(user, {
        token: authSession.token,
        dingTalkUserId: data.user?.dingTalkUserId,
        loginSource: authSession.loginSource,
        expiresAt: data.expiresAt,
      });
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  async logout() {
    if (typeof RealtimeService !== 'undefined') RealtimeService.stop();
    if (ApiConfig.enabled && authSession.token) {
      try {
        await fetch(ApiConfig.baseUrl + DingTalkApi.endpoints.logout, {
          method: 'POST',
          headers: { ...this.getAuthHeaders() },
          signal: AbortSignal.timeout(ApiConfig.timeout),
        });
      } catch (e) {
        console.warn('[登录] 退出接口失败:', e);
      }
    }
    authSession = { token: null, refreshToken: null, dingTalkUserId: null, loginSource: 'demo', expiresAt: null };
    const fallback = users.find(u => u.name === '王元斌') || users[0];
    currentUser = fallback;
    state.authError = null;
    save();
    render();
  },

  getAuthHeaders() {
    return authSession.token ? { Authorization: 'Bearer ' + authSession.token } : {};
  },

  /** 钉钉客户端内 H5 免登：requestAuthCode → 后端换 userid */
  tryDingTalkJsApiLogin() {
    if (!this.isDingTalkMode() || typeof dd === 'undefined') {
      return Promise.resolve(null);
    }
    const corpId = DingTalkApi.corpId;
    if (!corpId) return Promise.resolve(null);
    const self = this;
    return new Promise(function(resolve) {
      var finished = false;
      function finish(val) {
        if (finished) return;
        finished = true;
        resolve(val);
      }
      var timer = setTimeout(function() { finish(null); }, 6000);
      try {
        dd.ready(function() {
          dd.runtime.permission.requestAuthCode({
            corpId: corpId,
            onSuccess: async function(res) {
              clearTimeout(timer);
              var code = res && res.code ? String(res.code).trim() : '';
              if (!code) { finish(null); return; }
              finish(await self.loginByAuthCode(code, corpId));
            },
            onFail: function() {
              clearTimeout(timer);
              finish(null);
            },
          });
        });
        dd.error(function() {
          clearTimeout(timer);
          finish(null);
        });
      } catch (e) {
        clearTimeout(timer);
        finish(null);
      }
    });
  },

  /** 应用启动：URL 参数 → 钉钉客户端 JSAPI（当前点开人）→ 已保存会话 → 兜底免登 */
  async init() {
    const urlParams = this.parseUrlParams();

    if (urlParams.dingTalkUserId) {
      const result = await this.loginByDingTalkUserId(urlParams.dingTalkUserId, urlParams.corpId);
      if (result.success) {
        this.cleanAuthUrlParams();
        return result;
      }
      state.authError = result.message || '钉钉 userid 登录失败';
    }

    if (urlParams.authCode) {
      const result = await this.loginByAuthCode(urlParams.authCode, urlParams.corpId);
      if (result.success) {
        this.cleanAuthUrlParams();
        return result;
      }
      state.authError = result.message || '钉钉免登失败';
    }

    // 钉钉客户端内优先免登为「当前点开人」，避免旧会话显示错账号
    if (this.isDingTalkMode() && this.isDingTalkClient() && !urlParams.dingTalkUserId && !urlParams.authCode) {
      const jsResult = await this.tryDingTalkJsApiLogin();
      if (jsResult && jsResult.success) return jsResult;
      if (jsResult && !jsResult.success) {
        state.authError = jsResult.message || '钉钉免登失败';
      }
    }

    if (authSession.token && this.isDingTalkMode()) {
      const result = await this.fetchSession();
      if (result.success) return result;
      authSession.token = null;
      authSession.refreshToken = null;
    }

    if (this.isDingTalkMode() && !urlParams.dingTalkUserId && !urlParams.authCode && !this.isDingTalkClient()) {
      const jsResult = await this.tryDingTalkJsApiLogin();
      if (jsResult && jsResult.success) return jsResult;
      if (jsResult && !jsResult.success) {
        state.authError = jsResult.message || '钉钉免登失败';
      }
    }

    return { success: true, source: authSession.loginSource || 'persisted' };
  },
};

// 挂载到 window 供钉钉小程序 webview / 后端联调
window.HengHuiGuanAuth = AuthService;

const PushEventType = {
  PROJECT_ASSIGNED: 'project_assigned', // 指定项目负责人
  TASK_ASSIGNED: 'task_assigned',       // 新任务分配
  TASK_TRANSFER: 'task_transfer',       // 任务转办
  TASK_REJECTED: 'task_rejected',       // 任务驳回
  TASK_DUE_SOON: 'task_due_soon',       // 即将到期
  TASK_OVERDUE: 'task_overdue',         // 已逾期
  TASK_COMPLETED: 'task_completed',     // 任务完成（挂项目：通知项目负责人+上级；未挂项目临时任务：不自动推送，可确认后通知提单人，无需理由）
  TASK_PAUSED: 'task_paused',           // 表单提报临时任务暂停：可确认后通知提单人（须写明原因）
  TASK_COMMENT_MENTION: 'task_comment_mention', // 留言 @ 提及
  TASK_COLLAB_ASSIST_REQUEST: 'task_collab_assist_request', // 辅助性协办邀请
  TASK_COLLAB_PROPOSED: 'task_collab_proposed', // 协办时段待审批
  TASK_COLLAB_APPROVED: 'task_collab_approved', // 协办时段已批准
  TASK_COLLAB_REJECTED: 'task_collab_rejected', // 协办未接受
  TASK_DEPENDENCY_ADDED: 'task_dependency_added',
  TASK_DEPENDENCY_UNBLOCKED: 'task_dependency_unblocked',
  DEPT_DAILY_SUMMARY: 'dept_daily_summary', // 部门日报汇总
  STAFF_ASSIGNEE_MISSING: 'staff_assignee_missing', // 任务负责人在档案中缺失/已停用
  STAFF_ASSIGNEE_MISSING_DIGEST: 'staff_assignee_missing_digest', // 当前用户可见的人员缺失汇总（同待办红条）
};

let pushLogs = [];
let pushSentKeys = new Set();
/** 定时类消息（临期/逾期/人员缺失等）同一事项一周内不重复通知 */
const PUSH_DEDUP_DAYS = 7;

/** 从推送日志解析 YYYY-MM-DD */
function pushLogDateStr(log) {
  if (!log) return '';
  if (log.timestamp) return normalizeDateStr(String(log.timestamp).slice(0, 10));
  if (log.createdAt) return normalizeDateStr(String(log.createdAt).slice(0, 10));
  const t = String(log.time || '');
  const m = t.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

/** 推送日志中：同类型同任务在 days 天内是否已成功推送 */
function wasPushedWithinDays(eventType, taskId, days = PUSH_DEDUP_DAYS) {
  if (!taskId) return false;
  const today = todayStr();
  return pushLogs.some(l => {
    if (l.eventType !== eventType || String(l.taskId || '') !== String(taskId)) return false;
    if (l.status === 'failed' || l.status === 'skipped') return false;
    const d = pushLogDateStr(l);
    if (!d) return false;
    const diff = diffCalendarDays(d, today);
    return diff != null && diff >= 0 && diff < days;
  });
}

/**
 * pushSentKeys 形如 prefix:YYYY-MM-DD；判断 prefix 在 days 天内是否已记过。
 * 兼容旧的「按天」键，也覆盖本会话刚写入的键。
 */
function hasPushSentWithinDays(keyPrefix, days = PUSH_DEDUP_DAYS) {
  if (!keyPrefix) return false;
  const today = todayStr();
  const needle = `${keyPrefix}:`;
  for (const key of pushSentKeys) {
    if (key === keyPrefix) return true;
    if (!String(key).startsWith(needle)) continue;
    const datePart = normalizeDateStr(String(key).slice(needle.length));
    if (!datePart) continue;
    const diff = diffCalendarDays(datePart, today);
    if (diff != null && diff >= 0 && diff < days) return true;
  }
  return false;
}

/** 日期是否落在最近 days 天内（含今天） */
function isWithinDedupDays(dateStr, days = PUSH_DEDUP_DAYS) {
  const d = normalizeDateStr(dateStr);
  if (!d) return false;
  const diff = diffCalendarDays(d, todayStr());
  return diff != null && diff >= 0 && diff < days;
}

/**
 * 创建人与任务负责人或项目负责人相同时，不向创建人推送（避免自己通知自己）
 */
function filterPushRecipientNames(names, payload = {}) {
  const list = [...new Set((names || []).filter(Boolean))];
  if (!list.length) return list;

  let task = null;
  let project = null;
  if (payload.taskId) task = tasks.find(t => t.id === payload.taskId);
  if (payload.projectId) project = projects.find(p => p.id === payload.projectId);
  if (!project && task?.projectId) project = projects.find(p => p.id === task.projectId);

  const creator = task?.creator || project?.creator;
  if (!creator) return list;

  const assignee = task?.assignee;
  const projectManager = project?.manager || payload.projectManager;
  const creatorIsAssignee = !!(assignee && creator === assignee);
  const creatorIsProjectManager = !!(projectManager && creator === projectManager);

  if (!creatorIsAssignee && !creatorIsProjectManager) return list;

  return list.filter(name => {
    if (name !== creator) return true;
    if (creatorIsAssignee && name === assignee) return false;
    if (creatorIsProjectManager && name === projectManager) return false;
    return true;
  });
}

/** 短时窗内同类型、同接收人合并为一条（标 1、2、3） */
const PUSH_AGGREGATE_MS = 800;
const PUSH_AGGREGATABLE = new Set([
  PushEventType.PROJECT_ASSIGNED,
  PushEventType.TASK_ASSIGNED,
  PushEventType.TASK_TRANSFER,
  PushEventType.TASK_REJECTED,
  PushEventType.TASK_DUE_SOON,
  PushEventType.TASK_OVERDUE,
  PushEventType.TASK_COMPLETED,
  PushEventType.TASK_PAUSED,
  PushEventType.TASK_COMMENT_MENTION,
  PushEventType.TASK_COLLAB_ASSIST_REQUEST,
  PushEventType.TASK_COLLAB_PROPOSED,
  PushEventType.TASK_COLLAB_APPROVED,
  PushEventType.TASK_COLLAB_REJECTED,
  PushEventType.TASK_DEPENDENCY_ADDED,
  PushEventType.TASK_DEPENDENCY_UNBLOCKED,
  PushEventType.STAFF_ASSIGNEE_MISSING,
]);

const PushFormat = {
  itemsOf(d) {
    return Array.isArray(d.items) && d.items.length ? d.items : [d];
  },
  /** 通知展示用提交人：无中文名 / userid / 占位则视为不可展示 */
  displaySubmitter(d) {
    const name = String(d.submitterName || d.creator || '').trim();
    if (!name || name === 'AI表格提报' || name === '表单提报' || name === '表单') return '';
    if (!/[\u4e00-\u9fff]/.test(name)) return '';
    return name;
  },
  isTempTask(d) {
    if (d.isTempTask === true) return true;
    if (d.isTempTask === false) return false;
    if (d.projectId) return false;
    const pn = d.projectName || '';
    return !pn || pn === '临时任务';
  },
  /**
   * 任务通知正文卡片：
   * 任务：编号，标题
   * 类型：临时任务 | 项目任务
   * 提交人：…（仅临时且可识别） / 项目：…（仅项目任务）
   * 截止：YYYY-MM-DD（有则写）
   */
  taskBlock(d) {
    const id = d.taskId || '';
    const title = d.taskTitle || '未命名任务';
    const lines = [id ? `任务：${id}，${title}` : `任务：${title}`];
    if (this.isTempTask(d)) {
      lines.push('类型：临时任务');
      const submitter = this.displaySubmitter(d);
      if (submitter) lines.push(`提交人：${submitter}`);
    } else {
      lines.push('类型：项目任务');
      const project = d.projectName && d.projectName !== '临时任务' ? d.projectName : '';
      if (project) lines.push(`项目：${project}`);
    }
    if (d.dueDate) lines.push(`截止：${d.dueDate}`);
    if (d.daysOverdue != null && d.daysOverdue !== '') {
      lines.push(`逾期：${d.daysOverdue} 天`);
    }
    return lines.join('\n');
  },
  /** @deprecated 兼容旧调用，等同 taskBlock */
  taskLine(d) {
    return this.taskBlock(d);
  },
  projectLine(d) {
    const id = d.projectId ? `[${d.projectId}] ` : '';
    const name = d.projectName || '未命名项目';
    const bits = [];
    if (d.projectDept) bits.push(d.projectDept);
    if (d.planStartDate) bits.push(`开始 ${d.planStartDate}`);
    if (d.dueDate) bits.push(`结束 ${d.dueDate}`);
    const suffix = bits.length ? `（${bits.join(' · ')}）` : '';
    return `${id}${name}${suffix}`;
  },
  collabLine(d) {
    const block = this.taskBlock(d);
    const bits = [];
    if (d.collabStartDate || d.collabEndDate) {
      bits.push(`${d.collabStartDate || '?'}~${d.collabEndDate || '?'}`);
    }
    if (d.collabHours != null && d.collabHours !== '') bits.push(`${d.collabHours}h`);
    if (!bits.length) return block;
    return `${block}\n协助：${bits.join(' · ')}`;
  },
  numbered(items, lineFn) {
    return items.map((it, i) => `${i + 1}. ${lineFn(it)}`).join('\n\n');
  },
  listOrOne(items, lineFn) {
    if (items.length === 1) return lineFn(items[0]);
    return this.numbered(items, lineFn);
  },
  withNote(block, note, label = '原因') {
    if (!note) return block;
    if (!label) return `${block}\n${note}`;
    return `${block}\n${label}：${note}`;
  },
  compose(parts) {
    return parts.filter(Boolean).join('\n').trim();
  },
  /** 联系人完成通知：仅任务名 + 已完成 */
  contactTaskCompletedLine(d) {
    const id = d.taskId || '';
    const title = d.taskTitle || '';
    const name = id && title ? `${id}，${title}` : (id || title || '未命名任务');
    return `任务：${name} 已完成`;
  },
  /** 联系人暂停通知：任务名 + 已暂停 + 原因 */
  contactTaskPausedLine(d) {
    const id = d.taskId || '';
    const title = d.taskTitle || '';
    const name = id && title ? `${id}，${title}` : (id || title || '未命名任务');
    const reason = String(d.reason || '').trim();
    return reason ? `任务：${name} 已暂停\n原因：${reason}` : `任务：${name} 已暂停`;
  },
};

const PushTemplates = {
  [PushEventType.PROJECT_ASSIGNED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·新项目】',
      content: PushFormat.compose([
        n === 1 ? '您被指定为项目负责人：' : `您被指定为 ${n} 个项目的负责人：`,
        PushFormat.listOrOne(items, it => PushFormat.projectLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_ASSIGNED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·新任务】',
      content: PushFormat.compose([
        n === 1 ? '您有新任务待处理：' : `您有 ${n} 条新任务待处理：`,
        PushFormat.listOrOne(items, it => PushFormat.taskLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_TRANSFER]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务转办】',
      content: PushFormat.compose([
        n === 1 ? '以下任务已转办给您：' : `以下 ${n} 条任务已转办给您：`,
        PushFormat.listOrOne(items, it => PushFormat.withNote(PushFormat.taskLine(it), it.reason)),
      ]),
    };
  },
  [PushEventType.TASK_REJECTED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务驳回】',
      content: PushFormat.compose([
        n === 1 ? '任务已被驳回，请尽快整改：' : `以下 ${n} 条任务已被驳回，请尽快整改：`,
        PushFormat.listOrOne(items, it => PushFormat.withNote(PushFormat.taskLine(it), it.reason)),
      ]),
    };
  },
  [PushEventType.TASK_DUE_SOON]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·即将到期】',
      content: PushFormat.compose([
        n === 1 ? '任务即将到期，请及时处理：' : `以下 ${n} 条任务即将到期：`,
        PushFormat.listOrOne(items, it => PushFormat.taskLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_OVERDUE]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务逾期】',
      content: PushFormat.compose([
        n === 1 ? '任务已逾期，请立即处理：' : `以下 ${n} 条任务已逾期：`,
        PushFormat.listOrOne(items, it => PushFormat.taskLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_COMPLETED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务完成】',
      content: PushFormat.compose([
        n === 1 ? '任务已完成：' : `以下 ${n} 条任务已完成：`,
        PushFormat.listOrOne(items, it => {
          const block = PushFormat.taskBlock(it);
          return it.assignee ? `${block}\n负责人：${it.assignee}` : block;
        }),
      ]),
    };
  },
  [PushEventType.TASK_PAUSED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务暂停】',
      content: PushFormat.compose([
        n === 1 ? '任务已暂停：' : `以下 ${n} 条任务已暂停：`,
        PushFormat.listOrOne(items, it => {
          const block = PushFormat.taskBlock(it);
          const withAssignee = it.assignee ? `${block}\n负责人：${it.assignee}` : block;
          return PushFormat.withNote(withAssignee, it.reason);
        }),
      ]),
    };
  },
  [PushEventType.TASK_COMMENT_MENTION]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    const who = items[0]?.operator || '同事';
    return {
      title: '【恒慧管·留言提及】',
      content: PushFormat.compose([
        n === 1
          ? `${who} 在任务留言中提到了您：`
          : `${who} 等在 ${n} 条任务留言中提到了您：`,
        PushFormat.listOrOne(items, it => PushFormat.withNote(
          PushFormat.taskLine(it),
          it.commentPreview || '（图片）',
          '内容'
        )),
      ]),
    };
  },
  [PushEventType.TASK_COLLAB_ASSIST_REQUEST]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·协助邀请】',
      content: PushFormat.compose([
        n === 1
          ? '您被邀请为辅助性协办人，请填写可协助时段：'
          : `您有 ${n} 条协助邀请，请填写可协助时段：`,
        PushFormat.listOrOne(items, it => PushFormat.taskLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_COLLAB_PROPOSED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    const who = items[0]?.collaboratorName || '协办人';
    return {
      title: '【恒慧管·协办待审】',
      content: PushFormat.compose([
        n === 1
          ? `${who} 提交了协助时段，请审批：`
          : `有 ${n} 条协助时段待审批：`,
        PushFormat.listOrOne(items, it => PushFormat.collabLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_COLLAB_APPROVED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·协办已接受】',
      content: PushFormat.compose([
        n === 1 ? '您的协助时段已被接受：' : `您有 ${n} 条协助时段已被接受：`,
        PushFormat.listOrOne(items, it => PushFormat.collabLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_COLLAB_REJECTED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·协办未接受】',
      content: PushFormat.compose([
        n === 1 ? '协助未被接受：' : `以下 ${n} 条协助未被接受：`,
        PushFormat.listOrOne(items, it => PushFormat.withNote(
          PushFormat.taskLine(it),
          it.reason || '请与负责人沟通后更换安排',
          '说明'
        )),
      ]),
    };
  },
  [PushEventType.TASK_DEPENDENCY_ADDED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·新增依赖】',
      content: PushFormat.compose([
        n === 1 ? '任务新增了前置依赖：' : `以下 ${n} 条任务新增了前置依赖：`,
        PushFormat.listOrOne(items, it => {
          const pred = it.predecessorTitle
            ? `依赖 ${it.predecessorProject ? it.predecessorProject + '/' : ''}${it.predecessorTitle}`
            : '';
          return PushFormat.withNote(PushFormat.taskLine(it), pred, '');
        }),
      ]),
    };
  },
  [PushEventType.TASK_DEPENDENCY_UNBLOCKED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·依赖解除】',
      content: PushFormat.compose([
        n === 1 ? '前置任务已完成，本任务可继续：' : `以下 ${n} 条任务已解除阻塞：`,
        PushFormat.listOrOne(items, it => {
          const pred = it.predecessorTitle ? `前置 ${it.predecessorTitle} 已完成` : '';
          return PushFormat.withNote(PushFormat.taskLine(it), pred, '');
        }),
      ]),
    };
  },
  [PushEventType.DEPT_DAILY_SUMMARY]: (d) => ({
    title: '【恒慧管·部门日报】',
    content: PushFormat.compose([
      `进行中 ${d.doing} · 待开始 ${d.todo} · 已逾期 ${d.overdue} · 今日到期 ${d.dueToday}`,
    ]),
  }),
  [PushEventType.STAFF_ASSIGNEE_MISSING]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·人员缺失】',
      content: PushFormat.compose([
        n === 1 ? '下属/项目成员人员缺失：' : `以下 ${n} 人档案缺失/停用但仍有未完成任务：`,
        PushFormat.listOrOne(items, it => {
          const proj = it.projectNames ? ` · ${it.projectNames}` : '';
          return `「${it.missingName}」未完成 ${it.openCount} 项${proj}`;
        }),
        '请至「人员档案」处理，或转办任务。',
      ]),
    };
  },
  [PushEventType.STAFF_ASSIGNEE_MISSING_DIGEST]: (d) => ({
    title: '【恒慧管·人员缺失】',
    content: PushFormat.compose([
      d.summaryLine || '有成员档案缺失/已停用但仍有未完成任务。',
      '请至「人员档案」处理，或转办任务。',
    ]),
  }),
};

const NotificationService = {
  _pushQueue: [],
  _flushTimer: null,

  /**
   * 统一推送入口：钉钉工作通知 + 应用内小喇叭。
   * 同类型且同接收人在短时窗内合并为一条（1、2、3…）。
   */
  async send(eventType, payload) {
    if (!PUSH_AGGREGATABLE.has(eventType) || payload?.items) {
      return this._deliver(eventType, payload);
    }
    return new Promise((resolve) => {
      this._pushQueue.push({ eventType, payload, resolve });
      if (this._flushTimer) clearTimeout(this._flushTimer);
      this._flushTimer = setTimeout(() => this._flushPushQueue(), PUSH_AGGREGATE_MS);
    });
  },

  /** 立即刷出队列（定时扫描等批量场景可先入队再 flush） */
  async flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    return this._flushPushQueue();
  },

  async _flushPushQueue() {
    this._flushTimer = null;
    const batch = this._pushQueue.splice(0);
    if (!batch.length) return;

    const groups = new Map();
    for (const item of batch) {
      const rawNames = item.payload.recipientNames
        || (item.payload.recipientName ? [item.payload.recipientName] : []);
      const filtered = filterPushRecipientNames(rawNames, item.payload);
      const key = `${item.eventType}::${[...filtered].sort().join('\0')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...item, filteredNames: filtered, rawNames });
    }

    for (const group of groups.values()) {
      const { eventType } = group[0];
      let result;
      if (group.length === 1) {
        const g = group[0];
        result = await this._deliver(eventType, {
          ...g.payload,
          recipientNames: g.filteredNames.length ? g.filteredNames : g.payload.recipientNames,
        });
      } else {
        const payloads = group.map(g => g.payload);
        const recipientNames = group[0].filteredNames.length
          ? group[0].filteredNames
          : (payloads[0].recipientNames || []);
        const merged = {
          ...payloads[0],
          items: payloads,
          recipientNames,
          taskId: payloads.map(p => p.taskId).filter(Boolean)[0] || null,
          projectId: payloads.map(p => p.projectId).filter(Boolean)[0] || null,
        };
        result = await this._deliver(eventType, merged);
      }
      group.forEach(g => g.resolve(result));
    }
  },

  /** 实际下发（不经过聚合队列） */
  async _deliver(eventType, payload) {
    const template = PushTemplates[eventType];
    if (!template) {
      console.warn('[推送] 未知事件类型:', eventType);
      return { success: false, reason: 'unknown_event' };
    }
    const rawNames = payload.recipientNames || (payload.recipientName ? [payload.recipientName] : []);
    const filteredNames = filterPushRecipientNames(rawNames, payload);
    if (!filteredNames.length) {
      const logEntry = {
        id: genId('P'),
        eventType,
        title: template(payload).title,
        recipients: (rawNames || []).join('、') || '-',
        status: 'skipped',
        error: '创建人与项目负责人或任务负责人相同，已跳过推送',
        time: new Date().toLocaleString(),
        taskId: payload.taskId || payload.projectId || null,
      };
      pushLogs.unshift(logEntry);
      if (pushLogs.length > 100) pushLogs = pushLogs.slice(0, 100);
      return logEntry;
    }
    const recipients = this.resolveRecipients(eventType, { ...payload, recipientNames: filteredNames });
    if (!recipients.length) {
      const logEntry = {
        id: genId('P'),
        eventType,
        title: template(payload).title,
        recipients: filteredNames.join('、'),
        status: 'skipped',
        error: '接收人未在人员档案中找到',
        time: new Date().toLocaleString(),
        taskId: payload.taskId || payload.projectId || null,
      };
      pushLogs.unshift(logEntry);
      if (pushLogs.length > 100) pushLogs = pushLogs.slice(0, 100);
      return logEntry;
    }

    // 任务完成：联系人短文案无链接；业务成员保持原卡片
    if (eventType === PushEventType.TASK_COMPLETED) {
      const contactRecipients = recipients.filter(isContactProfile);
      const memberRecipients = recipients.filter(r => !isContactProfile(r));
      let lastLog = null;
      if (contactRecipients.length) {
        const items = PushFormat.itemsOf(payload);
        const content = items.length === 1
          ? PushFormat.contactTaskCompletedLine(items[0])
          : items.map((it, i) => `${i + 1}. ${PushFormat.contactTaskCompletedLine(it)}`).join('\n');
        lastLog = await this._deliverToRecipients(eventType, payload, contactRecipients, {
          title: '【恒慧管·任务完成】',
          content,
        }, { withLink: false });
      }
      if (memberRecipients.length) {
        lastLog = await this._deliverToRecipients(
          eventType,
          payload,
          memberRecipients,
          template(payload),
          { withLink: true }
        );
      }
      return lastLog;
    }

    // 任务暂停：联系人短文案（含原因）无链接；业务成员保持原卡片
    if (eventType === PushEventType.TASK_PAUSED) {
      const contactRecipients = recipients.filter(isContactProfile);
      const memberRecipients = recipients.filter(r => !isContactProfile(r));
      let lastLog = null;
      if (contactRecipients.length) {
        const items = PushFormat.itemsOf(payload);
        const content = items.length === 1
          ? PushFormat.contactTaskPausedLine(items[0])
          : items.map((it, i) => `${i + 1}. ${PushFormat.contactTaskPausedLine(it)}`).join('\n');
        lastLog = await this._deliverToRecipients(eventType, payload, contactRecipients, {
          title: '【恒慧管·任务暂停】',
          content,
        }, { withLink: false });
      }
      if (memberRecipients.length) {
        lastLog = await this._deliverToRecipients(
          eventType,
          payload,
          memberRecipients,
          template(payload),
          { withLink: true }
        );
      }
      return lastLog;
    }

    return this._deliverToRecipients(eventType, payload, recipients, template(payload), { withLink: true });
  },

  async _deliverToRecipients(eventType, payload, recipients, message, opts = {}) {
    const withLink = opts.withLink !== false;
    const body = {
      eventType,
      message,
      recipients: recipients.map(r => ({
        userId: r.id,
        userName: r.name,
        dingTalkUserId: r.dingTalkUserId || '',
        dept: r.dept,
        role: r.role,
        profileKind: r.profileKind || '',
      })),
      payload,
      appInboxOnly: !!payload.appInboxOnly,
      withLink,
      operator: currentUser.name,
      operatorId: currentUser.id,
      timestamp: new Date().toISOString(),
    };

    const logEntry = {
      id: genId('P'),
      eventType,
      title: message.title,
      recipients: recipients.map(r => r.name).join('、'),
      status: 'pending',
      time: new Date().toLocaleString(),
      taskId: payload.taskId || payload.projectId || null,
    };

    if (ApiConfig.enabled) {
      try {
        const result = await this.callPushApi(body);
        logEntry.status = result.success
          ? (result.dingTalkSkipped || payload.appInboxOnly ? 'inbox_only' : 'sent')
          : 'failed';
        logEntry.response = result;
        if (result.success) {
          InboxService.refreshQuiet();
        } else if (payload.appInboxOnly) {
          InboxService.addLocalFromPush(body);
        }
      } catch (e) {
        logEntry.status = 'failed';
        logEntry.error = e.message;
        console.warn('[推送] API 调用失败:', e);
        if (payload.appInboxOnly) InboxService.addLocalFromPush(body);
      }
    } else {
      logEntry.status = 'queued';
      InboxService.addLocalFromPush(body);
      console.log('[推送预留]', eventType, message, '→', recipients.map(r => r.name).join('、'), withLink ? '' : '(无链接)');
    }

    pushLogs.unshift(logEntry);
    if (pushLogs.length > 100) pushLogs = pushLogs.slice(0, 100);
    return logEntry;
  },

  /** 调用后端钉钉推送接口 */
  async callPushApi(body) {
    const url = ApiConfig.baseUrl + DingTalkApi.endpoints.pushWorkNotification;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ApiConfig.timeout),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  /** 批量推送（定时任务场景，由后端调度，前端预留调用） */
  async sendBatch(items) {
    const url = ApiConfig.baseUrl + DingTalkApi.endpoints.pushBatch;
    if (!ApiConfig.enabled) {
      console.log('[推送预留] 批量推送', items.length, '条');
      return { success: true, queued: items.length };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(ApiConfig.timeout),
    });
    return response.json();
  },

  resolveRecipients(eventType, payload) {
    const names = payload.recipientNames || (payload.recipientName ? [payload.recipientName] : []);
    return names.map(name => {
      const list = getStaffDirectoryUsers();
      return list.find(u => u.name === name) || list.find(u => isSamePersonName(u.name, name));
    }).filter(Boolean);
  },

  getTaskPayload(task, extra = {}) {
    const project = projects.find(p => p.id === task.projectId);
    return {
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId || '',
      projectName: project ? project.name : '临时任务',
      projectManager: project?.manager || '',
      projectDept: project?.dept || '',
      assignee: task.assignee,
      planStartDate: task.planStartDate || '',
      dueDate: resolveTaskDueDate(task),
      isTempTask: !project,
      submitterName: typeof getTaskSubmitterName === 'function' ? getTaskSubmitterName(task) : (task.creator || ''),
      creator: task.creator || '',
      ...extra,
    };
  },

  /** 扫描临期/逾期任务并触发推送（正式环境：同一任务一周内只推一次） */
  async scanScheduledPushes() {
    if (!ApiConfig.enabled || !authSession.token) return;
    const today = todayStr();
    const items = [];

    tasks.forEach(task => {
      if (task.status === 'done' || task.status === 'archived' || task.status === 'abolished') return;
      if (!task.dueDate || !task.assignee) return;

      const effectiveDueDate = resolveTaskDueDate(task);
      if (!effectiveDueDate) return;

      const duePrefix = `due:${task.id}`;
      const overduePrefix = `overdue:${task.id}`;
      const dueKey = `${duePrefix}:${today}`;
      const overdueKey = `${overduePrefix}:${today}`;

      if (
        isOverdue(task)
        && !hasPushSentWithinDays(overduePrefix)
        && !wasPushedWithinDays(PushEventType.TASK_OVERDUE, task.id)
      ) {
        items.push({
          eventType: PushEventType.TASK_OVERDUE,
          payload: {
            ...this.getTaskPayload(task),
            recipientNames: [task.assignee],
            daysOverdue: getDaysOverdue(task),
            operator: '系统',
          },
          sentKey: overdueKey,
        });
      } else if (
        isDueSoon(task)
        && !hasPushSentWithinDays(duePrefix)
        && !wasPushedWithinDays(PushEventType.TASK_DUE_SOON, task.id)
      ) {
        items.push({
          eventType: PushEventType.TASK_DUE_SOON,
          payload: {
            ...this.getTaskPayload(task),
            recipientNames: [task.assignee],
            operator: '系统',
          },
          sentKey: dueKey,
        });
      }
    });

    // 任务负责人在档案中缺失/停用 → 通知上级与项目负责人（同一缺失人一周内一次）
    getMissingAssigneeReports().forEach(report => {
      const taskId = `missing:${report.missingName}`;
      const keyPrefix = `missing:${report.missingName}`;
      const sentKey = `${keyPrefix}:${today}`;
      if (hasPushSentWithinDays(keyPrefix) || wasPushedWithinDays(PushEventType.STAFF_ASSIGNEE_MISSING, taskId)) return;
      if (!report.leaderNames.length) return;
      items.push({
        eventType: PushEventType.STAFF_ASSIGNEE_MISSING,
        payload: {
          taskId,
          missingName: report.missingName,
          openCount: report.openCount,
          projectNames: report.projectNames.join('、'),
          recipientNames: report.leaderNames,
          operator: '系统',
        },
        sentKey,
      });
    });

    // 先全部入队再 flush，同接收人同类型合并为一条编号列表
    const sends = items.map(item => {
      pushSentKeys.add(item.sentKey);
      return this.send(item.eventType, item.payload);
    });
    await this.flush();
    await Promise.all(sends);
    if (items.length) save({ skipUsers: true });
  },

  getRecentLogs(limit = 10) {
    return pushLogs.slice(0, limit);
  },
};

/** 应用内消息通知（小喇叭） */
const InboxService = {
  _refreshing: false,

  async refresh() {
    if (this._refreshing) return;
    if (!ApiConfig.enabled || !authSession.token) {
      this.loadLocal();
      this.syncLocalUnread();
      return;
    }
    this._refreshing = true;
    state.inboxLoading = true;
    try {
      const res = await fetch(ApiConfig.baseUrl + '/notifications?limit=50', {
        headers: AuthService.getAuthHeaders(),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await parseJsonResponse(res);
      if (data.success) {
        const serverItems = data.items || [];
        const localOnly = (state.inboxItems || []).filter(local => {
          if (!local?.id || !String(local.id).startsWith('N-')) return false;
          if (serverItems.some(s => s.id === local.id)) return false;
          // 同事件同日已有服务端记录则不再保留本地副本
          const day = String(local.createdAt || '').slice(0, 10);
          return !serverItems.some(s =>
            s.eventType === local.eventType &&
            String(s.taskId || '') === String(local.taskId || '') &&
            String(s.createdAt || '').slice(0, 10) === day
          );
        });
        state.inboxItems = [...localOnly, ...serverItems].slice(0, 50);
        state.inboxUnreadCount = Math.max(
          Number(data.unreadCount) || 0,
          state.inboxItems.filter(n => !n.read).length
        );
      }
    } catch (e) {
      console.warn('[消息] 加载失败，保留本地收件箱', e);
      this.loadLocal();
      this.syncLocalUnread();
    } finally {
      state.inboxLoading = false;
      this._refreshing = false;
    }
  },

  async refreshQuiet() {
    const prevUnread = state.inboxUnreadCount;
    await this.refresh();
    if (state.inboxUnreadCount !== prevUnread && !state.showModal) render();
  },

  async markRead({ ids = null, all = false } = {}) {
    if (!ApiConfig.enabled || !authSession.token) {
      if (all) {
        (state.inboxItems || []).forEach(n => { n.read = true; });
      } else if (Array.isArray(ids)) {
        (state.inboxItems || []).forEach(n => {
          if (ids.includes(n.id)) n.read = true;
        });
      }
      this.syncLocalUnread();
      this.persistLocal();
      return true;
    }
    try {
      const res = await fetch(ApiConfig.baseUrl + '/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
        body: JSON.stringify({ ids, all: !!all }),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        if (all) {
          (state.inboxItems || []).forEach(n => { n.read = true; });
        } else if (Array.isArray(ids)) {
          const set = new Set(ids);
          (state.inboxItems || []).forEach(n => {
            if (set.has(n.id)) n.read = true;
          });
        }
        state.inboxUnreadCount = data.unreadCount ?? (state.inboxItems || []).filter(n => !n.read).length;
        return true;
      }
    } catch (e) {
      console.warn('[消息] 标记已读失败', e);
    }
    return false;
  },

  /** 演示/离线：写入当前用户本地收件箱 */
  addLocalFromPush(body) {
    const meId = currentUser?.id;
    if (!meId) return;
    const recipients = body.recipients || [];
    const isForMe = recipients.some(r => r.userId === meId || r.userName === currentUser.name);
    if (!isForMe) return;
    const item = {
      id: genId('N'),
      userId: meId,
      userName: currentUser.name,
      eventType: body.eventType || '',
      title: body.message?.title || '【恒慧管】通知',
      content: body.message?.content || '',
      taskId: body.payload?.taskId || null,
      projectId: body.payload?.projectId || null,
      read: false,
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleString('zh-CN'),
      operator: body.operator || '',
    };
    state.inboxItems = [item, ...(state.inboxItems || [])].slice(0, 50);
    this.syncLocalUnread();
    this.persistLocal();
    if (!state.showModal) render();
  },

  syncLocalUnread() {
    state.inboxUnreadCount = (state.inboxItems || []).filter(n => !n.read).length;
  },

  persistLocal() {
    try {
      const key = 'henghuiguan_inbox_' + (currentUser?.id || 'guest');
      localStorage.setItem(key, JSON.stringify({
        items: (state.inboxItems || []).slice(0, 50),
      }));
    } catch { /* ignore */ }
  },

  loadLocal() {
    try {
      const key = 'henghuiguan_inbox_' + (currentUser?.id || 'guest');
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.items)) {
        state.inboxItems = data.items;
        this.syncLocalUnread();
      }
    } catch { /* ignore */ }
  },
};

/** 未完成任务的负责人在人员档案中不存在或已停用（用全量档案，避免经理过滤 users 误报他部在职） */
function getMissingAssigneeReports() {
  const openStatuses = new Set(['todo', 'doing', 'paused', 'rejected', 'blocked']);
  const directory = getStaffDirectoryUsers();
  const byName = new Map();
  tasks.forEach(task => {
    if (!task.assignee || !openStatuses.has(task.status)) return;
    const activeHit = directory.find(u => isStaffActive(u) && isSamePersonName(u.name, task.assignee));
    if (activeHit) return;
    if (!byName.has(task.assignee)) {
      byName.set(task.assignee, { missingName: task.assignee, openTasks: [], projectIds: new Set() });
    }
    const row = byName.get(task.assignee);
    row.openTasks.push(task);
    if (task.projectId) row.projectIds.add(task.projectId);
  });

  return [...byName.values()].map(row => {
    const leaderSet = new Set();
    const inactive = directory.find(u => !isStaffActive(u) && isSamePersonName(u.name, row.missingName));
    if (inactive?.leaderId) {
      const leader = directory.find(u => u.id === inactive.leaderId && isStaffActive(u));
      if (leader) leaderSet.add(leader.name);
    }
    row.projectIds.forEach(pid => {
      const p = projects.find(x => x.id === pid);
      if (p?.manager) {
        const mgr = directory.find(u => isStaffActive(u) && isSamePersonName(u.name, p.manager));
        if (mgr) leaderSet.add(mgr.name);
        else leaderSet.add(p.manager);
      }
    });
    // 兜底：通知总经理
    if (!leaderSet.size) {
      directory.filter(u => isStaffActive(u) && u.role === 'gm').forEach(u => leaderSet.add(u.name));
    }
    const projectNames = [...row.projectIds]
      .map(pid => projects.find(p => p.id === pid)?.name)
      .filter(Boolean);
    return {
      missingName: row.missingName,
      openCount: row.openTasks.length,
      projectNames,
      leaderNames: [...leaderSet],
    };
  });
}

function getMissingAssigneeReportsForCurrentUser() {
  const all = getMissingAssigneeReports();
  if (isFullAccess(currentUser.role)) return all;
  return all.filter(r => r.leaderNames.some(n => isSamePersonName(n, currentUser.name)));
}

/**
 * 将人员缺失写入服务端收件箱（可选）。小喇叭展示已由 getDisplayInboxItems 保证。
 */
async function syncMissingStaffInboxAlert() {
  const reports = getMissingAssigneeReportsForCurrentUser();
  if (!reports.length || !currentUser?.name) return;
  if (!ApiConfig.enabled || !authSession.token) return;

  const today = todayStr();
  const digestTaskId = `missing-digest:${currentUser.id || currentUser.name}`;
  const keyPrefix = `missing-digest-api:${currentUser.id || currentUser.name}`;
  const sentKey = `${keyPrefix}:${today}`;
  if (hasPushSentWithinDays(keyPrefix) || wasPushedWithinDays(PushEventType.STAFF_ASSIGNEE_MISSING_DIGEST, digestTaskId)) return;

  // 一周内服务端已有同类记录则不再写入
  const hasServerItem = (state.inboxItems || []).some(n =>
    !n.synthetic
    && n.eventType === PushEventType.STAFF_ASSIGNEE_MISSING_DIGEST
    && isWithinDedupDays(String(n.createdAt || '').slice(0, 10))
  );
  if (hasServerItem) {
    pushSentKeys.add(sentKey);
    return;
  }

  const summaryLine = reports
    .map(r => `「${r.missingName}」有 ${r.openCount} 项未完成任务`)
    .join('；') + '。';

  try {
    await NotificationService.send(PushEventType.STAFF_ASSIGNEE_MISSING_DIGEST, {
      taskId: digestTaskId,
      summaryLine,
      recipientNames: [currentUser.name],
      operator: '系统',
      appInboxOnly: true,
    });
  } catch (e) {
    console.warn('[消息] 人员缺失入库失败', e);
  }
  pushSentKeys.add(sentKey);
}

// 业务事件 → 推送（在各操作函数中调用）
function notifyProjectManagerAssigned(project) {
  const manager = project.manager;
  if (!manager) return;
  NotificationService.send(PushEventType.PROJECT_ASSIGNED, {
    projectId: project.id,
    projectName: project.name,
    projectDept: project.dept || '',
    projectManager: manager,
    planStartDate: project.startDate || '',
    dueDate: project.endDate || '',
    recipientNames: [manager],
    operator: currentUser.name,
  });
}

function notifyTaskAssigned(task) {
  NotificationService.send(PushEventType.TASK_ASSIGNED, {
    ...NotificationService.getTaskPayload(task),
    recipientNames: [task.assignee],
    operator: currentUser.name,
  });
}

function notifyTaskTransfer(task, toName, reason) {
  NotificationService.send(PushEventType.TASK_TRANSFER, {
    ...NotificationService.getTaskPayload(task),
    recipientNames: [toName],
    reason,
    operator: currentUser.name,
  });
}

function notifyTaskRejected(task, reason) {
  NotificationService.send(PushEventType.TASK_REJECTED, {
    ...NotificationService.getTaskPayload(task),
    recipientNames: [task.assignee],
    reason,
    operator: currentUser.name,
  });
}

function getCollaboratorAssistPushPayload(task, entry) {
  return {
    ...NotificationService.getTaskPayload(task),
    collaboratorName: entry?.userName,
    collabStartDate: entry?.planStartDate,
    collabEndDate: entry?.planEndDate,
    collabHours: entry?.estimatedHours,
    collabNote: entry?.proposedNote,
  };
}

function notifyCollaboratorAssistRequest(task, entry) {
  if (!entry?.userName) return;
  NotificationService.send(PushEventType.TASK_COLLAB_ASSIST_REQUEST, {
    ...getCollaboratorAssistPushPayload(task, entry),
    recipientNames: [entry.userName],
    operator: currentUser.name,
  });
}

function notifyCollaboratorAssistProposed(task, entry) {
  const payload = {
    ...getCollaboratorAssistPushPayload(task, entry),
    operator: currentUser.name,
  };
  NotificationService.send(PushEventType.TASK_COLLAB_PROPOSED, {
    ...payload,
    recipientNames: getCollaboratorProposalReviewers(task),
  });
}

function notifyCollaboratorAssistApproved(task, entry) {
  NotificationService.send(PushEventType.TASK_COLLAB_APPROVED, {
    ...getCollaboratorAssistPushPayload(task, entry),
    recipientNames: [entry.userName],
    operator: currentUser.name,
  });
}

function notifyCollaboratorAssistRejected(task, entry, reason) {
  NotificationService.send(PushEventType.TASK_COLLAB_REJECTED, {
    ...getCollaboratorAssistPushPayload(task, entry),
    recipientNames: [entry.userName],
    reason,
    operator: currentUser.name,
  });
}

function submitCollaboratorAssistProposal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  const entry = getCollaboratorEntry(task, COLLAB_TYPE_ASSIST, currentUser.name);
  if (!task || !entry || entry.status !== COLLAB_STATUS_PENDING) {
    alert('当前无法提交协助时段');
    return;
  }
  const startEl = document.getElementById('collab-start-' + taskId);
  const endEl = document.getElementById('collab-end-' + taskId);
  const noteEl = document.getElementById('collab-note-' + taskId);
  const planStartDate = startEl?.value || '';
  const planEndDate = endEl?.value || '';
  const proposedNote = noteEl?.value?.trim() || '';
  if (!planStartDate || !planEndDate) {
    alert('请填写协助开始与截止时间');
    return;
  }
  if (parseLocalDate(planStartDate) > parseLocalDate(planEndDate)) {
    alert('协助开始日期不能晚于截止日期');
    return;
  }
  const estimatedHours = calcAssistEntryEstimatedHours(planStartDate, planEndDate);
  if (estimatedHours <= 0) {
    alert('协助时段内需至少包含一个有效工作日');
    return;
  }
  entry.planStartDate = planStartDate;
  entry.planEndDate = planEndDate;
  entry.estimatedHours = estimatedHours;
  entry.proposedNote = proposedNote;
  entry.proposedAt = new Date().toLocaleString();
  entry.status = COLLAB_STATUS_PROPOSED;
  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: '待填写协助时段',
    after: `${planStartDate} ~ ${planEndDate}（${estimatedHours}h）`,
    reason: '协办人提交协助时段',
    project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
  });
  notifyCollaboratorAssistProposed(task, entry);
  save();
  alert('协助时段已提交，等待任务负责人或项目负责人审批');
  render();
}

function approveCollaboratorAssist(taskId, entryId) {
  const task = tasks.find(t => t.id === taskId);
  const entry = getCollaboratorEntries(task).find(e => e.id === entryId);
  if (!task || !entry || entry.status !== COLLAB_STATUS_PROPOSED) return;
  if (!canReviewCollaboratorProposal(task)) {
    alert('您无权审批该协办时段');
    return;
  }
  entry.status = COLLAB_STATUS_APPROVED;
  entry.reviewedBy = currentUser.name;
  entry.reviewedAt = new Date().toLocaleString();
  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: '待审批',
    after: `已批准 ${entry.userName} 协助 ${entry.planStartDate}~${entry.planEndDate}（${entry.estimatedHours}h）`,
    reason: '批准协办时段',
    project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
  });
  notifyCollaboratorAssistApproved(task, entry);
  save();
  state.showModal = 'taskDetail';
  state.form = { taskId };
  render();
}

function rejectCollaboratorAssist(taskId, entryId) {
  const task = tasks.find(t => t.id === taskId);
  const entry = getCollaboratorEntries(task).find(e => e.id === entryId);
  if (!task || !entry || entry.status !== COLLAB_STATUS_PROPOSED) return;
  if (!canReviewCollaboratorProposal(task)) {
    alert('您无权审批该协办时段');
    return;
  }
  const reason = prompt('请填写未接受协助的原因（将通知原协办人）：', '') || '';
  entry.status = COLLAB_STATUS_REJECTED;
  entry.reviewedBy = currentUser.name;
  entry.reviewedAt = new Date().toLocaleString();
  entry.reviewNote = reason;
  syncCollaboratorsArray(task);
  appendChangeLogEntry({
    taskId: task.id,
    operator: currentUser.name,
    operateTime: new Date().toLocaleString(),
    before: `${entry.userName} 协助 ${entry.planStartDate}~${entry.planEndDate}`,
    after: '未接受协助',
    reason: reason || '负责人未接受协助',
    project: projects.find(p => p.id === task.projectId)?.name || '临时任务',
  });
  notifyCollaboratorAssistRejected(task, entry, reason || '项目负责人或任务负责人未接受您的协助');
  save();
  alert('已拒绝该协办时段，可在任务编辑中调整辅助性协办人');
  state.showModal = 'taskDetail';
  state.form = { taskId };
  render();
}

function renderCollaboratorAssistPreview(taskId) {
  const startEl = document.getElementById('collab-start-' + taskId);
  const endEl = document.getElementById('collab-end-' + taskId);
  const previewEl = document.getElementById('collab-hours-' + taskId);
  if (!startEl || !endEl || !previewEl) return;
  const hours = calcAssistEntryEstimatedHours(startEl.value, endEl.value);
  previewEl.textContent = hours > 0 ? `预计协助工时：${hours} 小时（按工作日历）` : '请填写有效的工作日时段';
}

function renderCollabAssistCard(task) {
  const entry = getCollaboratorEntry(task, COLLAB_TYPE_ASSIST, currentUser.name);
  if (!entry) return '';
  const project = projects.find(p => p.id === task.projectId);
  const statusColor = {
    pending_schedule: '#D97706',
    proposed: '#2563EB',
    approved: '#059669',
    rejected: '#9CA3AF',
  }[entry.status] || '#6B7280';

  let body = '';
  if (entry.status === COLLAB_STATUS_PENDING) {
    body = `
      <div style="font-size:12px;color:#6B7280;margin:8px 0;">请填写您可协助的开始与截止时间，提交后将同步给任务负责人/项目负责人审批。</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div>
          <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">协助开始</div>
          <input class="input" type="date" id="collab-start-${task.id}" style="width:100%;" onchange="renderCollaboratorAssistPreview('${task.id}')">
        </div>
        <div>
          <div style="font-size:11px;color:#9CA3AF;margin-bottom:4px;">协助截止</div>
          <input class="input" type="date" id="collab-end-${task.id}" style="width:100%;" onchange="renderCollaboratorAssistPreview('${task.id}')">
        </div>
      </div>
      <div style="font-size:12px;color:#059669;margin-bottom:8px;" id="collab-hours-${task.id}">填写日期后自动计算协助工时</div>
      <textarea class="textarea" id="collab-note-${task.id}" style="width:100%;height:56px;margin-bottom:8px;" placeholder="补充说明（选填）"></textarea>
      <button class="btn btn-primary btn-sm" onclick="submitCollaboratorAssistProposal('${task.id}')"><i class="fas fa-paper-plane"></i> 提交协助时段</button>
    `;
  } else if (entry.status === COLLAB_STATUS_PROPOSED) {
    body = `<div style="font-size:12px;color:#2563EB;margin-top:8px;">已提交 ${entry.planStartDate} ~ ${entry.planEndDate}（${entry.estimatedHours}h），等待审批</div>`;
  } else if (entry.status === COLLAB_STATUS_APPROVED) {
    body = `<div style="font-size:12px;color:#059669;margin-top:8px;">已批准协助 ${entry.planStartDate} ~ ${entry.planEndDate}（${entry.estimatedHours}h），计入当周饱和度</div>`;
  } else if (entry.status === COLLAB_STATUS_REJECTED) {
    body = `<div style="font-size:12px;color:#9CA3AF;margin-top:8px;">协助未被接受${entry.reviewNote ? '：' + escapeHtml(entry.reviewNote) : ''}</div>`;
  }

  return `
    <div style="padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:var(--bg-panel);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
        <div>
          <div style="font-weight:600;color:var(--text);">${escapeHtml(task.title)}</div>
          <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">${project?.name || '临时任务'} · 负责人 ${escapeHtml(task.assignee)}</div>
        </div>
        <span class="tag" style="background:#FEF3C7;color:${statusColor};font-size:10px;">辅助性 · ${collabStatusLabel(entry)}</span>
      </div>
      <div style="font-size:12px;color:#6B7280;margin-top:6px;">任务计划：${task.planStartDate || '-'} ~ ${resolveTaskDueDate(task) || '-'} · ${task.estimatedHours || 0}h</div>
      ${body}
      <div style="margin-top:10px;"><button class="btn btn-ghost btn-sm" onclick="viewTask('${task.id}')">查看任务详情</button></div>
    </div>
  `;
}

function renderCollaboratorReviewBlock(task) {
  const pending = getCollaboratorEntries(task, { type: COLLAB_TYPE_ASSIST })
    .filter(e => e.status === COLLAB_STATUS_PROPOSED);
  if (!pending.length || !canReviewCollaboratorProposal(task)) return '';
  return `
    <div style="margin-bottom:16px;padding:12px;background:#EFF6FF;border-radius:8px;border:1px solid #BFDBFE;">
      <div style="font-size:13px;font-weight:600;color:#1D4ED8;margin-bottom:8px;"><i class="fas fa-user-clock" style="margin-right:6px;"></i>协办时段待审批</div>
      ${pending.map(entry => `
        <div style="padding:10px;background:var(--bg-panel);border-radius:8px;border:1px solid #DBEAFE;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:500;">${escapeHtml(entry.userName)} · ${entry.planStartDate} ~ ${entry.planEndDate} · ${entry.estimatedHours}h</div>
          ${entry.proposedNote ? `<div style="font-size:12px;color:#6B7280;margin-top:4px;">说明：${escapeHtml(entry.proposedNote)}</div>` : ''}
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button class="btn btn-primary btn-sm" onclick="approveCollaboratorAssist('${task.id}', '${entry.id}')"><i class="fas fa-check"></i> 同意</button>
            <button class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="rejectCollaboratorAssist('${task.id}', '${entry.id}')"><i class="fas fa-times"></i> 不同意并更换协办人</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCollaboratorSummary(task) {
  ensureCollaboratorEntries(task);
  const entries = getCollaboratorEntries(task);
  if (!entries.length) return '';
  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:8px;">协办人</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${entries.map(entry => `
          <div style="padding:8px 10px;background:var(--bg-muted);border-radius:8px;font-size:12px;">
            <span style="font-weight:600;">${escapeHtml(entry.userName)}</span>
            <span class="tag" style="margin-left:6px;background:${entry.type === COLLAB_TYPE_ASSIST ? '#FEF3C7' : '#F3F4F6'};color:${entry.type === COLLAB_TYPE_ASSIST ? '#D97706' : '#6B7280'};font-size:10px;">${collabTypeLabel(entry.type)}</span>
            <span style="margin-left:6px;color:#9CA3AF;">${collabStatusLabel(entry)}</span>
            ${entry.type === COLLAB_TYPE_ASSIST && entry.planStartDate ? `<div style="margin-top:4px;color:#6B7280;">协助时段：${entry.planStartDate} ~ ${entry.planEndDate || '-'} · ${entry.estimatedHours || 0}h</div>` : ''}
            ${entry.type === COLLAB_TYPE_INFORM ? `<div style="margin-top:4px;color:#6B7280;">仅接收任务/项目进展通知，不计入工时</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function isStandaloneTempTask(task) {
  return !!(task && task.type === 'temp' && !task.projectId);
}

function isPlaceholderSubmitterName(name) {
  const n = String(name || '').trim();
  return !n
    || n === 'AI表格提报'
    || n === '表单提报'
    || n === '表单'
    || n === '提交人'
    || n === '提单人'
    || n === '记录创建人';
}

function getTaskSubmitterName(task) {
  if (!task) return '';
  const staff = resolveTaskSubmitterStaff(task);
  if (staff?.name) return staff.name;
  const fromMeta = unwrapTemplateDisplay(task.intakeMeta?.submitterName || '');
  if (fromMeta && !isPlaceholderSubmitterName(fromMeta) && /[\u4e00-\u9fff]/.test(fromMeta)) return fromMeta;
  const creator = unwrapTemplateDisplay(task.creator || '');
  if (creator && !isPlaceholderSubmitterName(creator) && /[\u4e00-\u9fff]/.test(creator)) return creator;
  if (fromMeta && !isPlaceholderSubmitterName(fromMeta)) return fromMeta;
  if (creator && !isPlaceholderSubmitterName(creator)) return creator;
  return '';
}

/** 待办/详情展示用提单人：无中文名 / userid / 占位则不展示 */
function displayTaskSubmitterName(task) {
  if (task?.projectId) return '';
  const name = String(getTaskSubmitterName(task) || '').trim();
  if (isPlaceholderSubmitterName(name)) return '';
  if (!/[\u4e00-\u9fff]/.test(name)) return '';
  return name;
}

/** 提单人可能是姓名，也可能是钉钉 userid（AI 表格人员字段常见） */
function resolveTaskSubmitterStaff(task) {
  if (!task) return null;
  const list = getStaffDirectoryUsers();
  const metaName = unwrapTemplateDisplay(task.intakeMeta?.submitterName || '');
  const creatorName = unwrapTemplateDisplay(task.creator || '');
  const dingId = String(
    unwrapTemplateDisplay(task.intakeMeta?.submitterDingTalkUserId || '')
    || (/^[0-9A-Za-z_-]{4,64}$/.test(metaName) ? metaName : '')
    || (/^[0-9A-Za-z_-]{4,64}$/.test(creatorName) ? creatorName : '')
    || ''
  ).trim();
  if (dingId) {
    const byDing = list.find(u =>
      String(u.dingTalkUserId || '') === dingId || String(u.id || '') === dingId
    );
    if (byDing) return byDing;
  }
  const nameCandidates = [metaName, creatorName].filter(n => n && !isPlaceholderSubmitterName(n));
  for (const name of nameCandidates) {
    const hit = list.find(u => isSamePersonName(u.name, name) || u.name === name)
      || list.find(u => u.name && (u.name.startsWith(name) || name.startsWith(u.name.split(/\s+/)[0])));
    if (hit) return hit;
  }
  return null;
}

function notifyTaskCompleted(task) {
  // 未挂项目的临时任务：不通知项目负责人 / 执行人上级
  if (isStandaloneTempTask(task)) return;

  const project = projects.find(p => p.id === task.projectId);
  const assigneeUser = users.find(u => u.name === task.assignee);
  const names = new Set();
  if (project?.manager) names.add(project.manager);
  if (assigneeUser?.leaderId) {
    const leader = users.find(u => u.id === assigneeUser.leaderId);
    if (leader?.name) names.add(leader.name);
  }
  const recipients = [...names];
  if (!recipients.length) return;
  NotificationService.send(PushEventType.TASK_COMPLETED, {
    ...NotificationService.getTaskPayload(task),
    recipientNames: recipients,
    operator: currentUser.name,
  });
}

/** 未挂项目的临时任务完成时：弹窗确认是否通知提单人（无需理由） */
function maybeAskNotifySubmitterOnTempDone(task) {
  if (!isStandaloneTempTask(task)) return;
  const prepared = prepareSubmitterNotify(task);
  if (!prepared) return;
  if (prepared.unmatched) {
    alert(prepared.unmatchedTip);
    return;
  }
  const { staff, displayName } = prepared;
  const tip = staff.dingTalkUserId
    ? `是否通知提单人「${displayName}」：任务已完成？\n（将发送钉钉工作通知）`
    : `是否通知提单人「${displayName}」：任务已完成？\n（该人员未绑定钉钉 userid，仅写入应用内通知）`;
  if (!confirm(tip)) return;

  applySubmitterNameFix(task, staff);
  NotificationService.send(PushEventType.TASK_COMPLETED, {
    ...NotificationService.getTaskPayload(task),
    recipientNames: [staff.name],
    operator: currentUser.name,
  });
  save({ skipUsers: true });
}

/**
 * 表单提报临时任务暂停时：弹窗确认是否通知提单人；若推送须写明原因。
 * @param {object} task
 * @param {string} [defaultReason] 编辑保存时的修改原因，可作为默认暂停原因
 */
function maybeAskNotifySubmitterOnTempPaused(task, defaultReason = '') {
  if (!isStandaloneTempTask(task) || !isAitableIntakeTask(task)) return;
  const prepared = prepareSubmitterNotify(task);
  if (!prepared) return;
  if (prepared.unmatched) {
    alert(prepared.unmatchedTip);
    return;
  }
  const { staff, displayName } = prepared;
  const tip = staff.dingTalkUserId
    ? `是否通知提单人「${displayName}」：任务已暂停？\n（将发送钉钉工作通知，须填写暂停原因）`
    : `是否通知提单人「${displayName}」：任务已暂停？\n（该人员未绑定钉钉 userid，仅写入应用内通知；须填写暂停原因）`;
  if (!confirm(tip)) return;

  let reason = String(defaultReason || '').trim();
  while (!reason) {
    const raw = prompt('请填写暂停原因（将通知提单人）：', '');
    if (raw === null) return; // 取消推送，任务仍保持已暂停
    reason = String(raw).trim();
    if (!reason) alert('推送提单人时必须写明暂停原因');
  }

  applySubmitterNameFix(task, staff);
  NotificationService.send(PushEventType.TASK_PAUSED, {
    ...NotificationService.getTaskPayload(task),
    recipientNames: [staff.name],
    operator: currentUser.name,
    reason,
  });
  save({ skipUsers: true });
}

/** 解析提单人并校验是否可推送；返回 null 表示无需弹窗 */
function prepareSubmitterNotify(task) {
  const staff = resolveTaskSubmitterStaff(task);
  const rawLabel = getTaskSubmitterName(task);
  if (!rawLabel && !staff) return null;
  if (staff && isSamePersonName(staff.name, currentUser.name)) return null;
  if (!staff && isSamePersonName(rawLabel, currentUser.name)) return null;

  const displayName = staff?.name || rawLabel;
  if (!staff) {
    return {
      unmatched: true,
      unmatchedTip: `提单人「${displayName}」无法匹配人员档案（可能是钉钉 userid 未同步）。\n请在人员档案确认该人员已同步，或让表单「提交人」传姓名后再试。`,
    };
  }
  return { staff, displayName };
}

function applySubmitterNameFix(task, staff) {
  if (!task || !staff) return;
  if (task.creator && task.creator !== staff.name && /^[0-9A-Za-z_-]+$/.test(task.creator)) {
    task.creator = staff.name;
  }
  if (task.intakeMeta) {
    task.intakeMeta.submitterName = staff.name;
    if (staff.dingTalkUserId) task.intakeMeta.submitterDingTalkUserId = staff.dingTalkUserId;
  }
}

/** 任务刚变为已完成时的通知入口 */
function onTaskMarkedDone(task) {
  notifyTaskCompleted(task);
  maybeAskNotifySubmitterOnTempDone(task);
}

/** 任务刚变为已暂停时的通知入口（表单提报临时任务可推送提单人） */
function onTaskMarkedPaused(task, defaultReason = '') {
  maybeAskNotifySubmitterOnTempPaused(task, defaultReason);
}

// 钉钉人员同步
const DingTalkConfig = {
  ...DingTalkApi,
  syncFromDingTalk: async (payload = {}) => {
    const url = ApiConfig.baseUrl + DingTalkApi.endpoints.syncUsers;
    if (!ApiConfig.enabled) {
      return { success: false, message: '后端未接入' };
    }
    if (!authSession.token) {
      return {
        success: false,
        message: '请先完成钉钉登录后再同步（当前无登录凭证，需总经理账号）',
      };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let res;
    try {
      res = JSON.parse(text);
    } catch {
      return {
        success: false,
        message: `服务器返回异常（HTTP ${response.status}）：${text.slice(0, 150)}`,
      };
    }
    if (!response.ok && res && !res.success) {
      res.message = res.message || `请求失败（HTTP ${response.status}）`;
    }
    return res;
  },
  listDepartments: async () => {
    if (!ApiConfig.enabled || !authSession.token) {
      return { success: false, departments: [], message: '后端未接入或未登录' };
    }
    const response = await fetch(ApiConfig.baseUrl + DingTalkApi.endpoints.listDepartments, {
      headers: { ...AuthService.getAuthHeaders() },
    });
    return response.json();
  },
  saveDeptCatalog: async (catalog) => {
    if (!ApiConfig.enabled || !authSession.token) {
      return { success: false, message: '后端未接入或未登录' };
    }
    const response = await fetch(ApiConfig.baseUrl + DingTalkApi.endpoints.deptCatalog, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify({ staffDeptCatalog: catalog }),
    });
    return response.json();
  },
};

function countStaffInDeptExact(deptName, pool) {
  return (pool || []).filter(u => (u.dept || '') === deptName).length;
}

function countStaffInSubtree(node, pool) {
  let n = countStaffInDeptExact(node.name, pool);
  (node.children || []).forEach(ch => { n += countStaffInSubtree(ch, pool); });
  return n;
}

function ensureStaffExpandedDefaults() {
  if (!state.staffExpandedDepts || typeof state.staffExpandedDepts !== 'object') {
    state.staffExpandedDepts = { '信息中心': true, '财务中心': true };
  }
  if (!state.staffSelectedDept) state.staffSelectedDept = '信息中心';
}

function toggleStaffDeptExpand(deptName, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  ensureStaffExpandedDefaults();
  state.staffExpandedDepts[deptName] = !state.staffExpandedDepts[deptName];
  render();
}

function selectStaffDept(deptName) {
  state.staffSelectedDept = deptName;
  render();
}

function findStaffUserById(id) {
  if (!id) return null;
  return users.find(u => u.id === id) || allStaffUsers.find(u => u.id === id) || null;
}

function getDirectReports(userId, opts = {}) {
  if (!userId) return [];
  const includeInactive = !!opts.includeInactive;
  const pool = includeInactive ? users : users.filter(isStaffActive);
  return pool.filter(u => u.leaderId === userId && !isContactProfile(u));
}

/** 向上汇报链：本人 → 上级 → …（最多 maxLevels 人，含本人） */
function buildLeaderChain(user, maxLevels = 3) {
  const chain = [];
  let cur = user;
  const seen = new Set();
  while (cur && chain.length < maxLevels && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    if (!cur.leaderId) break;
    cur = findStaffUserById(cur.leaderId);
  }
  return chain;
}

function getScopedKeyStatus(userId) {
  return (state.scopedKeyStatusByUser && state.scopedKeyStatusByUser[userId]) || null;
}

function renderScopedKeyBadge(userId) {
  if (!isFullAccess(currentUser.role)) return '';
  const st = getScopedKeyStatus(userId);
  if (st && st.hasActive) {
    const tip = [
      st.capability === 'read' ? '只读' : '读写',
      st.projectScope === 'whitelist' || (st.projectIdsRead || []).length || (st.projectIdsWrite || []).length
        ? `项目白名单${new Set([...(st.projectIdsRead || []), ...(st.projectIdsWrite || [])]).size}项`
        : '相关项目',
      st.keyPrefix ? st.keyPrefix + '…' : '',
      st.lastSentAt ? '已发送' : '未发送',
    ].filter(Boolean).join(' · ');
    return `<span class="staff-key-badge is-on" title="${escapeHtml(tip)}">Key已签发</span>`;
  }
  return `<span class="staff-key-badge is-off" title="尚未签发有效作用域 Key">Key未签发</span>`;
}

async function loadScopedKeyStatus(force = false) {
  if (!isFullAccess(currentUser.role)) return;
  if (!ApiConfig.enabled || !authSession.token) return;
  if (state.scopedKeyStatusLoaded && !force) return;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/scoped-keys/status', {
      headers: { ...AuthService.getAuthHeaders() },
      signal: AbortSignal.timeout(ApiConfig.timeout),
    });
    const raw = await parseApiJsonResponse(res, '加载 Key 状态失败');
    if (!res.ok || (raw.code && raw.code !== 200)) return;
    const payload = raw.data || raw;
    state.scopedKeyStatusByUser = payload.byUserId || {};
    state.scopedKeyStatusLoaded = true;
    if (state.page === 'staff') render();
  } catch (e) {
    console.warn('[scoped-keys] status load failed', e);
  }
}

function openStaffDetail(userId, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  state.staffDetailId = userId || null;
  render();
}

function closeStaffDetail() {
  state.staffDetailId = null;
  render();
}

function jumpToStaffLeader(leaderId, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  const leader = findStaffUserById(leaderId);
  if (!leader) return;
  ensureStaffExpandedDefaults();
  if (leader.dept) {
    state.staffSelectedDept = leader.dept;
    state.staffExpandedDepts[leader.dept] = true;
    const parent = getStaffDeptCatalog().find(d => d.name === leader.dept)?.parentName;
    if (parent) state.staffExpandedDepts[parent] = true;
  }
  state.staffDetailId = leader.id;
  render();
}

function renderStaffDetailDrawer(user) {
  if (!user) return '';
  const inactive = !isStaffActive(user);
  const isContact = isContactProfile(user);
  const chain = buildLeaderChain(user, 3);
  const reports = getDirectReports(user.id, { includeInactive: !!state.staffShowInactive });
  const canEdit = canEditStaff(user);
  const dingBound = !!(user.dingTalkUserId && String(user.dingTalkUserId).trim());
  const avatarBg = isContact ? 'linear-gradient(135deg,#F59E0B,#D97706)' : 'linear-gradient(135deg,#10B981,#059669)';
  return `
    <div class="staff-drawer-mask" onclick="closeStaffDetail()"></div>
    <aside class="staff-drawer" role="dialog" aria-label="人员详情" onclick="event.stopPropagation()">
      <div class="staff-drawer-head">
        <div style="width:48px;height:48px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:600;flex-shrink:0;">${escapeHtml(user.name.charAt(0))}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:600;color:var(--text);">${escapeHtml(user.name)}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px;">${escapeHtml(user.position || '未设职位')} · ${escapeHtml(user.dept || '未设部门')}</div>
        </div>
        <button type="button" onclick="closeStaffDetail()" style="background:none;border:none;color:#9CA3AF;cursor:pointer;font-size:18px;padding:4px;" aria-label="关闭"><i class="fas fa-times"></i></button>
      </div>
      <div class="staff-drawer-body">
        <div class="staff-drawer-section">
          <h4>身份</h4>
          <div>
            <span class="staff-chip" style="background:${isContact ? '#FEF3C7' : '#ECFDF5'};color:${isContact ? '#B45309' : '#059669'};">${isContact ? '通知联系人' : '业务成员'}</span>
            <span class="staff-chip role-badge ${roleBadgeClass(user.role)}" style="margin-top:0;">${roleDisplayName(user.role)}</span>
            <span class="staff-chip" style="background:${inactive ? '#FEE2E2' : '#ECFDF5'};color:${inactive ? '#B91C1C' : '#047857'};">${inactive ? '已停用' : '在职'}</span>
            <span class="staff-chip" style="background:${dingBound ? '#ECFDF5' : '#F3F4F6'};color:${dingBound ? '#047857' : '#6B7280'};">钉钉${dingBound ? '已绑定' : '未绑定'}</span>
            ${!isContact ? (() => {
              const st = getScopedKeyStatus(user.id);
              if (st && st.hasActive) {
                return `<span class="staff-chip" style="background:#ECFDF5;color:#047857;">作用域Key已签发${st.lastSentAt ? '·已发送' : ''}</span>`;
              }
              return `<span class="staff-chip" style="background:var(--bg-muted);color:#6B7280;">作用域Key未签发</span>`;
            })() : ''}
          </div>
        </div>
        ${isContact ? '' : `
        <div class="staff-drawer-section">
          <h4>汇报关系</h4>
          <div class="staff-chain">
            ${chain.map((u, i) => `
              <button type="button" class="staff-chain-item" ${u.id === user.id ? 'disabled' : ''} onclick="openStaffDetail('${u.id}')">
                <span class="staff-chain-dot" style="${i === 0 ? '' : 'background:#9CA3AF;box-shadow:none;'}"></span>
                <span>
                  <span style="font-size:13px;font-weight:${i === 0 ? '600' : '500'};color:var(--text);">${escapeHtml(u.name)}${i === 0 ? '（本人）' : ''}</span>
                  <span style="display:block;font-size:11px;color:#9CA3AF;">${escapeHtml(u.position || roleDisplayName(u.role))}</span>
                </span>
              </button>
            `).join('')}
            ${chain.length === 1 && !user.leaderId ? '<div style="font-size:12px;color:#9CA3AF;padding:4px 0 0 24px;">本部门负责人（无上级）</div>' : ''}
          </div>
        </div>
        <div class="staff-drawer-section">
          <h4>直属下属${reports.length ? `（${reports.length}）` : ''}</h4>
          ${reports.length ? `
          <div class="staff-report-list">
            ${reports.map(r => `
              <button type="button" class="staff-report-item" onclick="openStaffDetail('${r.id}')">
                <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#10B981,#059669);color:#fff;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${escapeHtml(r.name.charAt(0))}</div>
                <div style="min-width:0;">
                  <div style="font-size:13px;font-weight:500;color:var(--text);">${escapeHtml(r.name)}</div>
                  <div style="font-size:11px;color:#9CA3AF;">${escapeHtml(r.position || roleDisplayName(r.role))}</div>
                </div>
              </button>
            `).join('')}
          </div>` : '<div style="font-size:12px;color:#9CA3AF;">暂无直属下属</div>'}
        </div>
        `}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="editStaff('${user.id}')"><i class="fas fa-edit"></i>编辑</button>` : ''}
          ${isFullAccess(currentUser.role) && !inactive && !isContact ? `
            <button class="btn btn-ghost btn-sm" onclick="issueScopedApiKey('${user.id}')"><i class="fas fa-key"></i>生成作用域Key</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--brand);" onclick="sendScopedApiKeyPackage('${user.id}')"><i class="fas fa-paper-plane"></i>发送接入包</button>
          ` : ''}
          ${canToggleStaffActive(user) ? (
            inactive
              ? `<button class="btn btn-ghost btn-sm" style="color:#059669;" onclick="toggleStaffActive('${user.id}')"><i class="fas fa-user-check"></i>恢复</button>`
              : `<button class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="toggleStaffActive('${user.id}')"><i class="fas fa-user-slash"></i>停用</button>`
          ) : ''}
        </div>
        ${isFullAccess(currentUser.role) && !isContact ? `
        <div class="staff-drawer-section" style="margin-top:12px;">
          <h4>钉钉 userid</h4>
          <div style="font-size:12px;color:#6B7280;word-break:break-all;font-family:monospace;">${dingBound ? escapeHtml(String(user.dingTalkUserId)) : '未绑定（发送接入包前请先同步钉钉）'}</div>
        </div>` : ''}
      </div>
    </aside>
  `;
}

function renderStaffTableRows(list, highlightSet, roleClass, roleName, emptyHint) {
  if (!list.length) {
    return `
      <tr>
        <td colspan="4" style="padding:40px;text-align:center;color:#9CA3AF;">
          ${escapeHtml(emptyHint || '该部门暂无人员（父级仅含本级挂靠人员；子部门请点左侧子项）')}
        </td>
      </tr>`;
  }
  const detailId = state.staffDetailId;
  return list.map((u, index) => {
    const leader = findStaffUserById(u.leaderId);
    const canEdit = canEditStaff(u);
    const inactive = !isStaffActive(u);
    const isContact = isContactProfile(u);
    const rowActive = detailId === u.id;
    const avatarBg = isContact ? 'linear-gradient(135deg,#F59E0B,#D97706)' : 'linear-gradient(135deg,#10B981,#059669)';
    return `
      <tr class="staff-row ${rowActive ? 'is-active-row' : ''}" style="opacity:${inactive ? '0.55' : '1'};${highlightSet.has(u.id) ? 'background:#ECFDF5;' : (index % 2 === 0 || rowActive ? '' : 'background:var(--bg-muted);')}"
        onclick="openStaffDetail('${u.id}')">
        <td style="padding:12px 16px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:600;flex-shrink:0;">${escapeHtml(u.name.charAt(0))}</div>
            <div style="min-width:0;">
              <div class="staff-name">${escapeHtml(u.name)}${inactive ? ' <span class="tag" style="background:#FEE2E2;color:#B91C1C;margin-left:4px;">已停用</span>' : ''}${isContact ? ' <span class="tag" style="background:#FEF3C7;color:#B45309;margin-left:4px;">联系人</span>' : ''}${!isContact ? renderScopedKeyBadge(u.id) : ''}</div>
              <div class="staff-pos">${escapeHtml(u.position || '未设职位')}</div>
            </div>
          </div>
        </td>
        <td style="padding:12px 16px;">
          <span class="role-badge ${roleClass(u.role)}" style="margin-top:0;">${roleName(u.role)}</span>
        </td>
        <td style="padding:12px 16px;font-size:13px;color:#6B7280;">
          ${leader
            ? `<button type="button" class="staff-leader-link" onclick="jumpToStaffLeader('${leader.id}', event)">${escapeHtml(leader.name)}</button>`
            : (isContact ? '—' : '本部门负责人')}
        </td>
        <td class="staff-col-ops" style="padding:12px 12px;text-align:center;" onclick="event.stopPropagation()">
          <div class="staff-ops">
            ${canEdit ? `<button class="btn btn-ghost btn-sm" onclick="editStaff('${u.id}')" title="编辑"><i class="fas fa-edit"></i></button>` : '<span style="color:#9CA3AF;font-size:12px;">—</span>'}
            ${isFullAccess(currentUser.role) && !inactive && !isContact ? `
              <button class="btn btn-ghost btn-sm" onclick="issueScopedApiKey('${u.id}')" title="生成作用域 Key"><i class="fas fa-key"></i></button>
              <button class="btn btn-ghost btn-sm" style="color:var(--brand);" onclick="sendScopedApiKeyPackage('${u.id}')" title="发送：说明文档 + Key + 接口"><i class="fas fa-paper-plane"></i></button>
            ` : ''}
            ${canToggleStaffActive(u) ? (
              inactive
                ? `<button class="btn btn-ghost btn-sm" style="color:#059669;" onclick="toggleStaffActive('${u.id}')" title="恢复"><i class="fas fa-user-check"></i></button>`
                : `<button class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="toggleStaffActive('${u.id}')" title="停用"><i class="fas fa-user-slash"></i></button>`
            ) : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderOrgTreeNode(node, pool, depth) {
  ensureStaffExpandedDefaults();
  const hasChildren = !!(node.children && node.children.length);
  const expanded = !!state.staffExpandedDepts[node.name];
  const selected = state.staffSelectedDept === node.name;
  const exact = countStaffInDeptExact(node.name, pool);
  const total = countStaffInSubtree(node, pool);
  const pad = 10 + depth * 16;
  let html = `
    <div class="staff-tree-node ${selected ? 'is-selected' : ''}" style="padding-left:${pad}px;"
      onclick="selectStaffDept('${escapeDeptAttr(node.name)}')">
      ${hasChildren ? `
      <button type="button" onclick="toggleStaffDeptExpand('${escapeDeptAttr(node.name)}', event)" style="width:22px;height:22px;border:none;background:transparent;color:#9CA3AF;cursor:pointer;padding:0;flex-shrink:0;">
        <i class="fas fa-chevron-${expanded ? 'down' : 'right'}" style="font-size:11px;"></i>
      </button>` : '<span style="width:22px;display:inline-block;flex-shrink:0;"></span>'}
      <div style="flex:1;min-width:0;">
        <div class="staff-tree-name" style="font-weight:${depth === 0 ? '600' : '500'};">${escapeHtml(node.name)}</div>
        <div class="staff-tree-meta">${hasChildren ? `本级 ${exact} · 含下级 ${total}` : `${exact}人`}</div>
      </div>
    </div>`;
  if (hasChildren && expanded) {
    html += (node.children || []).map(ch => renderOrgTreeNode(ch, pool, depth + 1)).join('');
  }
  return html;
}

function renderStaff() {
  if (!canAccessStaffPage()) {
    return '<div style="padding:40px;text-align:center;color:#9CA3AF;">无权访问人员档案</div>';
  }
  if (isFullAccess(currentUser.role) && ApiConfig.enabled && authSession.token && !state.scopedKeyStatusLoaded) {
    loadScopedKeyStatus(false);
  }
  ensureStaffExpandedDefaults();
  const isStaffAdmin = isFullAccess(currentUser.role);
  const showInactive = !!state.staffShowInactive;
  const kindFilter = state.staffKindFilter || 'all';
  let pool = isStaffAdmin
    ? users.slice()
    : getDeptScopeUsers(true, { includeContacts: true });
  if (!showInactive) pool = pool.filter(isStaffActive);
  if (kindFilter === 'member') pool = pool.filter(u => !isContactProfile(u));
  if (kindFilter === 'contact') pool = pool.filter(u => isContactProfile(u));

  if (state.staffSearch) {
    const q = state.staffSearch.toLowerCase();
    const hit = pool.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.position || '').toLowerCase().includes(q) ||
      (u.dept || '').toLowerCase().includes(q)
    );
    if (hit.length === 1) {
      state.staffSelectedDept = hit[0].dept || state.staffSelectedDept;
      if (hit[0].dept) state.staffExpandedDepts[hit[0].dept] = true;
      const parent = getStaffDeptCatalog().find(d => d.name === hit[0].dept)?.parentName;
      if (parent) state.staffExpandedDepts[parent] = true;
    }
  }

  let forest = buildClientOrgForest(getStaffDeptCatalog());
  if (!isStaffAdmin) {
    const dept = currentUser.dept;
    forest = [{
      name: dept,
      kind: 'member',
      parentName: '',
      children: [],
    }];
    state.staffSelectedDept = dept;
  }

  const selectedDept = state.staffSelectedDept || (forest[0] && forest[0].name) || '';
  let tablePool = pool.filter(u => (u.dept || '') === selectedDept);
  if (state.staffSearch) {
    const q = state.staffSearch.toLowerCase();
    const searchHits = pool.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.position || '').toLowerCase().includes(q) ||
      (u.dept || '').toLowerCase().includes(q)
    );
    if (searchHits.length) tablePool = searchHits;
  }

  const roleClass = (role) => roleBadgeClass(role);
  const roleName = (role) => roleDisplayName(role);
  const highlightSet = new Set(state.syncHighlightIds || []);
  const fb = state.syncFeedback;
  const missingReports = getMissingAssigneeReportsForCurrentUser();
  const kindTabs = [
    { id: 'all', label: '全部' },
    { id: 'member', label: '业务成员' },
    { id: 'contact', label: '通知联系人' },
  ];
  const emptyHint = kindFilter === 'contact'
    ? '该部门暂无通知联系人（在编辑人员中将档案类型设为「通知联系人」）'
    : kindFilter === 'member'
      ? '该部门暂无业务成员'
      : '该部门暂无人员（父级仅含本级挂靠人员；子部门请点左侧子项）';
  const detailUser = state.staffDetailId ? findStaffUserById(state.staffDetailId) : null;

  return `
    <div class="staff-page">
      ${missingReports.length ? `
      <div style="margin-bottom:12px;padding:12px 14px;border-radius:10px;border:1px solid #FECACA;background:#FEF2F2;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="font-size:12px;color:#7F1D1D;line-height:1.7;">
          <div style="font-size:13px;font-weight:600;color:#B91C1C;margin-bottom:6px;">
            <i class="fas fa-user-slash" style="margin-right:6px;"></i>任务负责人缺失提醒
          </div>
          以下人员不存在或已停用但仍有未完成任务，请恢复档案或转办：
          <ul style="margin:6px 0 0 18px;padding:0;">
            ${missingReports.map(r => `
              <li><strong>${escapeHtml(r.missingName)}</strong> — 未完成 ${r.openCount} 项
                ${r.projectNames.length ? `（项目：${escapeHtml(r.projectNames.join('、'))}）` : ''}
                ${r.leaderNames.length ? `<span style="color:#9F1239;"> · 已提醒：${escapeHtml(r.leaderNames.join('、'))}</span>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      </div>` : ''}
      ${!isStaffAdmin ? `
      <div style="margin-bottom:10px;font-size:12px;color:#6B7280;line-height:1.5;">
        正在查看 <strong style="color:var(--text);">${escapeHtml(currentUser.dept)}</strong> · 可编辑本部门执行人员的职位与上级
      </div>` : ''}
      ${fb && isStaffAdmin ? `
      <div style="margin-bottom:12px;padding:12px 14px;border-radius:10px;border:1px solid ${fb.type === 'success' ? '#86EFAC' : '#FDE68A'};background:${fb.type === 'success' ? '#F0FDF4' : '#FFFBEB'};display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="font-size:13px;color:${fb.type === 'success' ? '#166534' : '#92400E'};line-height:1.6;">
          <strong>${fb.type === 'success' ? '同步成功' : '同步完成（无绑定）'}</strong>
          — 绑定 ${fb.updated} 人，跳过 ${fb.skipped} 人
          ${fb.htmlPersisted === false ? ' · <span style="color:#DC2626">HTML 未写入</span>' : fb.htmlPersisted ? ' · 已写入 JSON+HTML' : ''}
          ${fb.loaded === false ? ' · <span style="color:#DC2626">服务端刷新失败</span>' : ''}
          ${fb.names && fb.names.length ? `<div style="margin-top:6px;font-family:monospace;font-size:12px;">${fb.names.join('<br>')}</div>` : ''}
        </div>
        <button onclick="state.syncFeedback=null;state.syncHighlightIds=[];render()" style="background:none;border:none;color:#9CA3AF;cursor:pointer;font-size:16px;"><i class="fas fa-times"></i></button>
      </div>` : ''}

      <div class="staff-toolbar">
        <div class="staff-seg">
          ${kindTabs.map(t => `
            <button type="button" class="${kindFilter === t.id ? 'is-active' : ''}"
              onclick="state.staffKindFilter='${t.id}';render()">${t.label}</button>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <label style="font-size:12px;color:#6B7280;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;">
            <input type="checkbox" ${showInactive ? 'checked' : ''} onchange="state.staffShowInactive=this.checked;render()">
            显示已停用
          </label>
          <div style="position:relative;">
            <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9CA3AF;font-size:13px;"></i>
            <input class="input" style="width:200px;padding-left:36px;" placeholder="搜索姓名、职位、部门..." value="${escapeHtml(state.staffSearch || '')}" onchange="state.staffSearch=this.value;render()">
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:${isStaffAdmin ? 'minmax(240px,300px) 1fr' : '1fr'};gap:16px;align-items:start;">
        ${isStaffAdmin ? `
        <div class="panel" style="overflow:hidden;">
          <div style="padding:12px 14px;background:var(--bg-muted);border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:600;color:var(--text);">
            <i class="fas fa-sitemap" style="margin-right:6px;color:var(--brand);"></i>组织部门
          </div>
          <div style="padding:8px;max-height:calc(100vh - 260px);overflow:auto;">
            ${forest.length
              ? forest.map(n => renderOrgTreeNode(n, pool, 0)).join('')
              : '<div style="padding:16px;color:#9CA3AF;font-size:12px;">暂无部门，请先同步钉钉</div>'}
          </div>
        </div>
        ` : ''}

        <div class="panel" style="overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #E5E7EB;background:var(--bg-muted);">
            <div style="font-size:14px;font-weight:600;color:var(--text);">
              ${escapeHtml(selectedDept || '请选择部门')}
              <span style="font-size:12px;font-weight:500;color:#6B7280;margin-left:8px;">
                ${state.staffSearch ? `搜索结果 ${tablePool.length} 人` : `本级 ${countStaffInDeptExact(selectedDept, pool)} 人`}
              </span>
            </div>
          </div>
          <div class="panel-body" style="padding:0;overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;min-width:640px;">
              <thead>
                <tr style="background:var(--bg-muted);border-bottom:1px solid #E5E7EB;">
                  <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">人员</th>
                  <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">角色</th>
                  <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">汇报给</th>
                  <th class="staff-col-ops" style="padding:10px 16px;text-align:center;font-size:12px;font-weight:600;color:#6B7280;">操作</th>
                </tr>
              </thead>
              <tbody>
                ${renderStaffTableRows(tablePool, highlightSet, roleClass, roleName, emptyHint)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      ${isStaffAdmin ? `
      <details class="staff-ding-fold" ${state.staffDingTalkOpen ? 'open' : ''} ontoggle="state.staffDingTalkOpen=this.open">
        <summary>
          <i class="fas fa-bell" style="color:#1677FF;"></i>
          钉钉
          <span class="tag" style="background:${AuthService.isDemoMode() ? '#FEF3C7' : '#D1FAE5'};color:${AuthService.isDemoMode() ? '#D97706' : '#059669'};">${AuthService.isDemoMode() ? '演示模式' : '正式环境'}</span>
          <span style="margin-left:auto;font-size:12px;color:#9CA3AF;font-weight:400;">推送与说明</span>
        </summary>
        <div class="staff-ding-body">
          ${AuthService.isDemoMode() ? `
          <p style="font-size:12px;color:#6B7280;line-height:1.6;margin-bottom:12px;">
            当前为<strong>演示模式</strong>，可通过侧边栏切换账号。正式使用请从钉钉工作台打开应用。
          </p>
          ` : `
          <p style="font-size:12px;color:#6B7280;line-height:1.6;margin-bottom:12px;">
            点选部门查看本级人员；业务/联系人在「编辑人员 → 档案类型」设置。日常同步：勾选部门 → 设同步默认类型 → 预览 → 确认。手工停用的账号同步时不会更新或恢复。
          </p>
          `}
          ${NotificationService.getRecentLogs(5).length ? `
          <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">最近推送记录</div>
          ${NotificationService.getRecentLogs(5).map(log => `
            <div style="font-size:11px;color:#6B7280;padding:6px 0;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;gap:8px;">
              <span>${log.title} → ${log.recipients || '—'}</span>
              <span style="color:${log.status === 'sent' ? '#059669' : log.status === 'failed' ? '#DC2626' : log.status === 'skipped' ? '#9CA3AF' : '#D97706'};flex-shrink:0;">${log.status}</span>
            </div>
          `).join('')}
          ` : '<p style="font-size:11px;color:#9CA3AF;">暂无推送记录</p>'}
        </div>
      </details>
      ` : ''}

      ${detailUser ? renderStaffDetailDrawer(detailUser) : ''}
    </div>
  `;
}

const LAST_SYNC_DEPTS_KEY = 'henghuiguan_last_sync_depts';

function loadLastSyncDepts() {
  try {
    const raw = localStorage.getItem(LAST_SYNC_DEPTS_KEY);
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list) && list.length) return list.map(String).filter(Boolean);
  } catch { /* ignore */ }
  return null;
}

function saveLastSyncDepts(deptNames) {
  try {
    localStorage.setItem(LAST_SYNC_DEPTS_KEY, JSON.stringify(deptNames || []));
  } catch { /* ignore */ }
}

function escapeDeptAttr(dept) {
  return String(dept || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function showDingTalkSyncModal() {
  if (!isFullAccess(currentUser.role)) {
    alert('仅总经理/管理员可同步钉钉通讯录');
    return;
  }
  if (!authSession.token) {
    alert('请先完成钉钉登录后再同步');
    return;
  }
  const catalogDepts = getStaffDeptOptions();
  const remembered = loadLastSyncDepts();
  let initialChecked = catalogDepts.slice();
  if (remembered && remembered.length) {
    const overlap = remembered.filter(d => catalogDepts.includes(d));
    if (overlap.length) initialChecked = overlap;
  }
  state.form = {
    syncMode: 'replace',
    syncSelectedIds: users.map(u => u.id),
    syncDeptNames: initialChecked,
    syncSearch: '',
    replacePreview: null,
    dingDeptOptions: catalogDepts.slice(),
    dingDeptLoading: true,
    dingDeptHint: '',
    syncAdvancedOpen: false,
  };
  state.showModal = 'dingTalkSync';
  render();
  DingTalkConfig.listDepartments().then(res => {
    if (!state.showModal || state.showModal !== 'dingTalkSync') return;
    state.form.dingDeptLoading = false;
    if (res && res.success) {
      if (Array.isArray(res.catalog)) {
        applyStaffDeptCatalog(res.catalog);
        syncDepartmentsAlias();
      }
      const fromDing = (res.departments || []).map(d => d.name || d).filter(Boolean);
      const merged = [...new Set([...getStaffDeptOptions(), ...fromDing])];
      state.form.dingDeptOptions = merged;
      const hasFinance = merged.some(d => String(d).includes('财务'));
      if (!fromDing.length) {
        state.form.dingDeptHint = res.message
          || '钉钉未返回部门。请在开放平台扩大通讯录授权，或配置 DINGTALK_SYNC_ROOT_DEPT_IDS。';
      } else if (!hasFinance) {
        state.form.dingDeptHint = `已加载 ${fromDing.length} 个部门，但未包含「财务中心」。请在钉钉开放平台把财务中心加入本应用通讯录授权范围，或在 .env 配置 DINGTALK_SYNC_ROOT_DEPT_IDS=财务中心部门ID 后重启服务。`;
      } else {
        state.form.dingDeptHint = `已从钉钉加载 ${fromDing.length} 个部门，可勾选「财务中心」等。`;
      }
      // 若上次记忆的部门中有钉钉新部门，补进勾选
      const rememberedNow = loadLastSyncDepts();
      if (rememberedNow && rememberedNow.length) {
        state.form.syncDeptNames = rememberedNow.filter(d => merged.includes(d));
        if (!state.form.syncDeptNames.length) state.form.syncDeptNames = getStaffDeptOptions().slice();
      }
    } else {
      state.form.dingDeptHint = (res && res.message) || '加载钉钉部门失败';
    }
    render();
  }).catch((e) => {
    if (!state.form) return;
    state.form.dingDeptLoading = false;
    state.form.dingDeptHint = '加载钉钉部门失败：' + (e.message || e);
    render();
  });
}

function setSyncMode(mode) {
  state.form.syncMode = mode;
  state.form.replacePreview = null;
  if (mode !== 'replace') state.form.syncAdvancedOpen = true;
  render();
}

function toggleSyncAdvanced() {
  state.form.syncAdvancedOpen = !state.form.syncAdvancedOpen;
  if (!state.form.syncAdvancedOpen) {
    state.form.syncMode = 'replace';
    state.form.replacePreview = null;
  }
  render();
}

function toggleSyncSelectAll(checked) {
  const q = (state.form.syncSearch || '').trim().toLowerCase();
  const list = q
    ? users.filter(u => u.name.toLowerCase().includes(q) || u.dept.toLowerCase().includes(q))
    : users;
  const ids = list.map(u => u.id);
  const set = new Set(state.form.syncSelectedIds || []);
  ids.forEach(id => { if (checked) set.add(id); else set.delete(id); });
  state.form.syncSelectedIds = [...set];
  render();
}

function toggleSyncUser(userId, checked) {
  const set = new Set(state.form.syncSelectedIds || []);
  if (checked) set.add(userId); else set.delete(userId);
  state.form.syncSelectedIds = [...set];
  render();
}

function toggleSyncDept(dept, checked) {
  const set = new Set(state.form.syncDeptNames || []);
  if (checked) set.add(dept); else set.delete(dept);
  state.form.syncDeptNames = [...set];
  state.form.replacePreview = null;
  render();
}

function toggleSyncDeptGroup(depts, checked) {
  const set = new Set(state.form.syncDeptNames || []);
  (depts || []).forEach(d => { if (checked) set.add(d); else set.delete(d); });
  state.form.syncDeptNames = [...set];
  state.form.replacePreview = null;
  render();
}

async function toggleSyncDeptKind(dept, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  const next = catalogKindForDept(dept) === 'contact' ? 'member' : 'contact';
  await setCatalogDeptKind(dept, next);
  if (state.showModal === 'dingTalkSync') {
    state.form.replacePreview = null;
    render();
  }
}

function formatReplacePreviewLines(preview) {
  if (!preview) return '';
  const lines = [];
  (preview.create || []).slice(0, 20).forEach(u => {
    const kind = u.profileKind || catalogKindForDept(u.dept);
    const tag = kind === 'contact' ? ' · 联系人' : '';
    lines.push(`＋新增 ${u.name}（${u.dept}${tag}）`);
  });
  if ((preview.create || []).length > 20) lines.push(`＋…共 ${(preview.create || []).length} 人`);
  (preview.rename || []).slice(0, 30).forEach(r => lines.push(`✎改名 ${r.from} → ${r.to}`));
  if ((preview.rename || []).length > 30) lines.push(`✎…共 ${(preview.rename || []).length} 人`);
  (preview.update || []).slice(0, 20).forEach(u => {
    const rename = u.renamedFrom ? `（原 ${u.renamedFrom}）` : '';
    lines.push(`↻更新 ${u.name}${rename}（${u.dept}）`);
  });
  if ((preview.update || []).length > 20) lines.push(`↻…共 ${(preview.update || []).length} 人`);
  (preview.deactivate || []).slice(0, 20).forEach(u => lines.push(`－停用 ${u.name}（${u.dept}）`));
  if ((preview.deactivate || []).length > 20) lines.push(`－…共 ${(preview.deactivate || []).length} 人`);
  (preview.ambiguous || []).forEach(a => {
    const names = (a.locals || []).map(l => l.name).join('、');
    lines.push(`?重名跳过 ${a.name} → 本地：${names}`);
  });
  if (preview.skippedManualInactive) {
    lines.push(`○跳过已停用 ${preview.skippedManualInactive} 人（手工停用不做处理）`);
  }
  return lines.join('\n');
}

function renderSyncPreviewPanel(preview) {
  if (!preview) return '';
  const stats = [
    { label: '新增', n: preview.create?.length || 0, color: '#059669', bg: '#ECFDF5' },
    { label: '更新', n: preview.update?.length || 0, color: '#2563EB', bg: '#EFF6FF' },
    { label: '改名', n: preview.rename?.length || 0, color: '#7C3AED', bg: '#F5F3FF' },
    { label: '停用', n: preview.deactivate?.length || 0, color: '#DC2626', bg: '#FEF2F2' },
  ];
  const amb = (preview.ambiguous || []).length;
  return `
    <div style="margin-top:14px;padding:14px;background:var(--bg-muted);border:1px solid var(--border);border-radius:12px;">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;">
        <i class="fas fa-chart-bar" style="margin-right:6px;color:#10B981;"></i>预览变化
        ${amb ? `<span style="margin-left:8px;font-size:12px;font-weight:500;color:#B45309;">重名待处理 ${amb}</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">
        ${stats.map(s => `
          <div style="padding:10px 8px;border-radius:10px;background:${s.bg};text-align:center;">
            <div style="font-size:20px;font-weight:700;color:${s.color};">${s.n}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:2px;">${s.label}</div>
          </div>
        `).join('')}
      </div>
      <pre style="margin:0;white-space:pre-wrap;font-size:11px;color:#6B7280;max-height:160px;overflow:auto;font-family:ui-monospace,monospace;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:10px;">${escapeHtml(formatReplacePreviewLines(preview))}</pre>
    </div>`;
}

function renderSyncDeptRow(dept, deptSet, opts = {}) {
  const count = users.filter(u => u.dept === dept && isStaffActive(u)).length;
  const inCatalog = getStaffDeptOptions().includes(dept);
  const kind = inCatalog ? catalogKindForDept(dept) : 'contact';
  const isContact = kind === 'contact';
  const checked = deptSet.has(dept);
  const uncategorized = !!opts.uncategorized;
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid ${checked ? (isContact ? '#FDE68A' : '#A7F3D0') : '#E5E7EB'};border-radius:10px;background:${checked ? (isContact ? '#FFFBEB' : '#ECFDF5') : '#fff'};">
      <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer;margin:0;">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleSyncDept('${escapeDeptAttr(dept)}', this.checked)">
        <span style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${escapeHtml(dept)}
          <span style="color:#9CA3AF;margin-left:4px;">(${count})</span>
          ${uncategorized ? '<span style="font-size:10px;color:#B45309;margin-left:4px;">新部门</span>' : ''}
        </span>
      </label>
      <button type="button" class="btn btn-ghost btn-sm" style="flex-shrink:0;padding:4px 8px;font-size:11px;color:${isContact ? '#B45309' : '#059669'};border:1px solid ${isContact ? '#FDE68A' : '#A7F3D0'};background:${isContact ? '#FFFBEB' : '#ECFDF5'};"
        onclick="toggleSyncDeptKind('${escapeDeptAttr(dept)}', event)"
        title="同步时新建人员的默认档案类型（不改已有人员）">
        ${isContact ? '默认同联系人' : '默认同业务'}
      </button>
    </div>`;
}

function renderSyncDeptGroups(deptSet) {
  const allOpts = state.form.dingDeptOptions || getStaffDeptOptions();
  const catalogNames = new Set(getStaffDeptOptions());
  const memberDepts = allOpts.filter(d => catalogNames.has(d) && catalogKindForDept(d) === 'member');
  const contactDepts = allOpts.filter(d => catalogNames.has(d) && catalogKindForDept(d) === 'contact');
  const newDepts = allOpts.filter(d => !catalogNames.has(d));
  const section = (title, hint, depts, uncategorized) => {
    if (!depts.length) return '';
    const allChecked = depts.every(d => deptSet.has(d));
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text);">${title}</div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${hint}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;"
            onclick='toggleSyncDeptGroup(${JSON.stringify(depts)}, ${!allChecked})'>
            ${allChecked ? '取消全选' : '全选'}
          </button>
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:6px;">
          ${depts.map(d => renderSyncDeptRow(d, deptSet, { uncategorized })).join('')}
        </div>
      </div>`;
  };
  return `
    ${state.form.dingDeptLoading ? '<div style="font-size:12px;color:#9CA3AF;margin-bottom:10px;"><i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>正在加载钉钉部门…</div>' : ''}
    ${section('默认同业务', '勾选后同步进来的新人默认设为业务成员（可登录）；已有人员类型不变', memberDepts, false)}
    ${section('默认同联系人', '勾选后同步进来的新人默认设为通知联系人（不可登录）；已有人员类型不变', contactDepts, false)}
    ${section('钉钉新部门（默认同联系人）', '勾选同步后写入目录；可先点右侧改为「默认同业务」', newDepts, true)}
    ${!memberDepts.length && !contactDepts.length && !newDepts.length && !state.form.dingDeptLoading
      ? '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:13px;">暂无部门，请检查钉钉授权范围</div>' : ''}
  `;
}

async function previewDingTalkReplace() {
  const deptNames = state.form.syncDeptNames || [];
  if (!deptNames.length) {
    alert('请至少勾选一个部门');
    return;
  }
  DataService.cancelScheduledSave();
  state.dingTalkSyncing = true;
  render();
  try {
    const res = await DingTalkConfig.syncFromDingTalk({
      mode: 'replace',
      deptNames,
      dryRun: true,
    });
    if (res && res.success) {
      state.form.replacePreview = res.preview || null;
      state.form.syncMode = 'replace';
      state.showModal = 'dingTalkSync';
    } else {
      alert((res && res.message) || '预览失败');
    }
  } catch (e) {
    alert('预览失败：' + (e.message || e));
  } finally {
    state.dingTalkSyncing = false;
    render();
  }
}

async function confirmDingTalkSync() {
  const mode = state.form.syncMode || 'replace';
  const payload = { mode };
  if (mode === 'selected') {
    payload.localUserIds = state.form.syncSelectedIds || [];
    if (!payload.localUserIds.length) {
      alert('请至少勾选一名人员');
      return;
    }
  } else if (mode === 'departments' || mode === 'replace') {
    payload.deptNames = state.form.syncDeptNames || [];
    if (!payload.deptNames.length) {
      alert('请至少选择一个部门');
      return;
    }
  } else if (mode === 'all') {
    if (!confirm('全量同步会拉取全公司钉钉通讯录，可能耗时较长，确定继续？')) return;
  }

  if (mode === 'replace') {
    if (!state.form.replacePreview) {
      alert('请先点击「预览变化」查看名单，再确认同步');
      return;
    }
    const p = state.form.replacePreview;
    const tip = `将新增 ${p.create?.length || 0}、更新 ${p.update?.length || 0}、改名 ${p.rename?.length || 0}、停用 ${p.deactivate?.length || 0} 人。\n\n确定执行同步？`;
    if (!confirm(tip)) return;
  }

  const deptsToRemember = mode === 'replace' || mode === 'departments'
    ? (state.form.syncDeptNames || []).slice()
    : null;

  state.showModal = null;
  DataService.cancelScheduledSave();
  state.dingTalkSyncing = true;
  render();
  try {
    const res = await DingTalkConfig.syncFromDingTalk(payload);
    if (ApiConfig.enabled && res && res.success) {
      if (res.persisted === false) {
        alert('同步未能写入服务端磁盘，刷新后数据会丢失。请关闭占用 data 文件的程序后重试。');
      } else {
        if (Array.isArray(res.allUsers) && res.allUsers.length) {
          DataService.applyAllUsersFromServer(res.allUsers);
        } else if (Array.isArray(res.updatedUsers) && res.updatedUsers.length) {
          DataService.applyUserUpdates(res.updatedUsers);
        }
        if (Array.isArray(res.staffDeptCatalog)) {
          applyStaffDeptCatalog(res.staffDeptCatalog);
          syncDepartmentsAlias();
        }
        if (deptsToRemember) saveLastSyncDepts(deptsToRemember);
        const loaded = Array.isArray(res.allUsers)
          ? true
          : await DataService.loadFromServer({ timeout: 120000 });
        const boundList = res.updatedUsers || (res.allUsers || []).filter(u => u.dingTalkUserId);
        const updatedIds = boundList.map(u => u.id);
        state.syncHighlightIds = updatedIds;
        state.syncFeedback = {
          type: (res.bound || res.updated || res.created || 0) > 0 ? 'success' : 'warn',
          message: res.message || '',
          updated: res.bound || res.updated || 0,
          skipped: res.skipped || 0,
          loaded,
          htmlPersisted: res.htmlPersisted,
          names: mode === 'replace'
            ? [
                `新增 ${res.created || 0}`,
                `更新 ${res.updated || 0}`,
                `停用 ${res.deactivated || 0}`,
                ...(res.preview?.deactivate || []).slice(0, 8).map(u => `停用 ${u.name}`),
              ]
            : boundList.map(u => `${u.name} → ${u.dingTalkUserId || '未绑定'}`),
        };
        state.page = 'staff';
        if (mode === 'replace') {
          alert(res.message || '同步完成');
        } else {
          const bound = res.bound || boundList.length || 0;
          if (bound === 0) {
            alert('同步完成，但没有人员被绑定 userid。\n\n' + (res.message || '') + '\n\n可能原因：钉钉姓名与本地不一致，或权限未拉取到成员列表。');
          } else {
            const list = boundList.map(u => `${u.name}: ${u.dingTalkUserId}`).join('\n');
            const htmlNote = res.htmlPersisted ? '\n\n已同步写入后端 JSON 与 HTML 文件。' : '\n\n已写入后端 JSON（HTML 写入失败，请检查文件占用）。';
            alert(`已绑定 ${bound} 人：\n${list}${htmlNote}`);
          }
        }
      }
    } else {
      const msg = (res && res.message) || '同步失败，请检查钉钉权限与 AppSecret';
      alert(msg.length > 800 ? msg.slice(0, 800) + '…' : msg);
    }
  } catch (e) {
    alert('同步失败：' + (e.message || e));
  } finally {
    state.dingTalkSyncing = false;
    render();
  }
}

function renderDingTalkSyncModal() {
  const mode = state.form.syncMode || 'replace';
  const advancedOpen = !!state.form.syncAdvancedOpen || mode !== 'replace';
  const selectedSet = new Set(state.form.syncSelectedIds || []);
  const deptSet = new Set(state.form.syncDeptNames || []);
  const preview = state.form.replacePreview;
  const q = (state.form.syncSearch || '').trim().toLowerCase();
  const filtered = q
    ? users.filter(u => u.name.toLowerCase().includes(q) || u.dept.toLowerCase().includes(q) || (u.position || '').toLowerCase().includes(q))
    : users;
  const allFilteredChecked = filtered.length > 0 && filtered.every(u => selectedSet.has(u.id));
  const isMainReplace = mode === 'replace';

  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:560px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-sync-alt" style="color:#10B981;margin-right:8px;"></i>同步钉钉通讯录</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          ${isMainReplace ? `
          <p style="font-size:13px;color:#4B5563;line-height:1.6;margin:0 0 14px;">
            勾选要同步的部门；右侧可设<strong>同步默认类型</strong>（仅影响新人）。财务中心等需在钉钉授权范围内才会出现。
          </p>
          ${state.form.dingDeptHint ? `
          <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#EFF6FF;border:1px solid #BFDBFE;font-size:12px;color:#1E40AF;line-height:1.55;">
            <i class="fas fa-info-circle" style="margin-right:6px;"></i>${escapeHtml(state.form.dingDeptHint)}
          </div>` : ''}
          ${renderSyncDeptGroups(deptSet)}
          ${renderSyncPreviewPanel(preview)}
          ` : ''}

          <div style="margin-top:${isMainReplace ? '16' : '0'}px;border:1px solid var(--border);border-radius:10px;overflow:hidden;">
            <button type="button" onclick="toggleSyncAdvanced()" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-muted);border:none;cursor:pointer;text-align:left;">
              <span style="font-size:13px;font-weight:500;color:var(--text);">
                <i class="fas fa-sliders-h" style="margin-right:6px;color:#9CA3AF;"></i>高级：仅绑定 userid（不新建、不停用）
              </span>
              <i class="fas fa-chevron-${advancedOpen ? 'up' : 'down'}" style="color:#9CA3AF;"></i>
            </button>
            ${advancedOpen ? `
            <div style="padding:12px 14px;border-top:1px solid #E5E7EB;">
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                ${[
                  { id: 'selected', label: '勾选人员' },
                  { id: 'departments', label: '按部门绑定' },
                  { id: 'all', label: '全量绑定' },
                  { id: 'replace', label: '返回按部门导入' },
                ].map(opt => `
                  <button type="button" onclick="setSyncMode('${opt.id}')" style="padding:6px 12px;border-radius:16px;font-size:12px;border:1px solid ${mode === opt.id ? '#10B981' : '#E5E7EB'};background:${mode === opt.id ? '#ECFDF5' : '#fff'};color:${mode === opt.id ? '#059669' : '#6B7280'};cursor:pointer;">
                    ${opt.label}
                  </button>
                `).join('')}
              </div>
              ${mode === 'selected' ? `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <label style="font-size:13px;color:var(--text);display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" ${allFilteredChecked ? 'checked' : ''} onchange="toggleSyncSelectAll(this.checked)">
                  全选当前列表（${selectedSet.size}/${users.length}）
                </label>
                <input class="input" style="width:180px;" placeholder="搜索姓名、部门..." value="${state.form.syncSearch || ''}" oninput="state.form.syncSearch=this.value;render()">
              </div>
              <div style="border:1px solid var(--border);border-radius:10px;max-height:240px;overflow-y:auto;">
                ${filtered.map(u => `
                  <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #F3F4F6;cursor:pointer;">
                    <input type="checkbox" ${selectedSet.has(u.id) ? 'checked' : ''} onchange="toggleSyncUser('${u.id}', this.checked)">
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13px;font-weight:500;color:var(--text);">${escapeHtml(u.name)} <span style="color:#9CA3AF;font-weight:400;">· ${escapeHtml(u.dept)}</span></div>
                      <div style="font-size:11px;color:${u.dingTalkUserId ? '#6B7280' : '#DC2626'};font-family:monospace;">${escapeHtml(u.dingTalkUserId || '未绑定 userid')}</div>
                    </div>
                  </label>
                `).join('')}
                ${filtered.length === 0 ? '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px;">无匹配人员</div>' : ''}
              </div>
              ` : ''}
              ${mode === 'departments' ? `
              <div style="font-size:12px;color:#6B7280;margin-bottom:8px;">勾选部门后仅绑定已有档案的 userid，不新建不停用。</div>
              ${renderSyncDeptGroups(deptSet)}
              ` : ''}
              ${mode === 'all' ? `
              <div style="padding:12px;background:#FEF3C7;border-radius:8px;border:1px solid #FDE68A;font-size:12px;color:#92400E;line-height:1.6;">
                将拉取全公司钉钉通讯录并尽量绑定已有档案（不新建、不停用）。人数多时可能较慢。
              </div>
              ` : ''}
            </div>
            ` : ''}
          </div>
        </div>
        <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid #E5E7EB;">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          ${isMainReplace ? `
          <button class="btn btn-ghost" onclick="previewDingTalkReplace()" ${state.dingTalkSyncing ? 'disabled' : ''}><i class="fas fa-eye"></i>预览变化</button>
          <button class="btn btn-primary" onclick="confirmDingTalkSync()" ${state.dingTalkSyncing ? 'disabled' : ''}><i class="fas fa-check"></i>确认同步</button>
          ` : `
          <button class="btn btn-primary" onclick="confirmDingTalkSync()" ${state.dingTalkSyncing ? 'disabled' : ''}><i class="fas fa-link"></i>开始绑定</button>
          `}
        </div>
      </div>
    </div>
  `;
}

// 从钉钉同步人员数据（保留入口，实际由弹窗触发）
async function syncFromDingTalk() {
  showDingTalkSyncModal();
}

function showAddStaffModal() {
  if (!isFullAccess(currentUser.role)) {
    alert('仅总经理/管理员可添加人员');
    return;
  }
  state.form = {
    dept: currentUser.dept,
    role: 'staff',
    profileKind: catalogKindForDept(currentUser.dept),
    standardWeekHours: 60,
  };
  state.showModal = 'staffEdit';
  render();
}

/** @param {string} memberName
 *  @param {{ start: string, end: string }|null} weekRange 传入时仅保留计划窗口与该周有工作日重叠的任务 */
function getMemberTasks(memberName, weekRange = null) {
  return tasks
    .filter(t => {
      if (t.assignee !== memberName || t.status === 'archived' || t.status === 'abolished') return false;
      if (weekRange) return taskOverlapsWeek(t, weekRange.start, weekRange.end);
      return true;
    })
    .sort((a, b) => {
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
      if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
      if (isOverdue(a) && !isOverdue(b)) return -1;
      if (isOverdue(b) && !isOverdue(a)) return 1;
      return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
    });
}

function canViewMemberKanban(member) {
  if (!member || currentUser.role === 'staff') return false;
  if (isFullAccess(currentUser.role)) return true;
  return member.dept === currentUser.dept;
}

function showMemberKanban(userId) {
  const member = users.find(u => u.id === userId);
  if (!canViewMemberKanban(member)) return;
  state.form = { memberUserId: userId };
  state.showModal = 'memberKanban';
  render();
}

function renderKanbanCard(task) {
  const displayStatus = getTaskDisplayStatus(task);
  const st = statusMap[displayStatus] || statusMap[task.status];
  const progress = getDisplayProgress(task);
  return `
    <div class="kanban-card" onclick="viewTaskFromTeamKanban('${task.id}')" style="${isOverdue(task) ? 'border-color:#FECACA;background:#FFFBFB;' : ''}">
      ${renderTaskCardContext(task)}
      <div class="kanban-card-header">
        <span class="priority-dot priority-${task.priority}"></span>
        <span class="kanban-card-title">${task.title}${renderDependencyBadges(task, true)}</span>
        ${task.type === 'temp' ? '<span class="tag tag-temp" style="font-size:10px;"><i class="fas fa-bolt"></i></span>' : ''}
        ${renderIntakeSourceTag(task, true)}
        ${renderIntakeHoursHint(task, true)}
      </div>
      <div class="kanban-card-meta" style="flex-wrap:wrap;">
        <span><i class="fas fa-clock" style="margin-right:4px;"></i>${formatTaskCreatedAt(task.createdAt)}</span>
        <span style="${isOverdue(task) ? 'color:#DC2626;' : ''}"><i class="fas fa-calendar" style="margin-right:4px;"></i>${task.dueDate || '-'}</span>
      </div>
      ${task.status !== 'done' && task.status !== 'abolished' ? `
      <div style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:10px;color:#9CA3AF;">进度</span>
          <span style="font-size:10px;font-weight:500;">${progress}%</span>
        </div>
        <div class="progress-bar" style="height:4px;"><div class="progress-fill" style="width:${progress}%;"></div></div>
      </div>
      ` : ''}
      <div class="kanban-card-footer">
        <span class="status-tag status-${displayStatus}" style="font-size:10px;padding:2px 6px;">
          <i class="fas ${st.icon}"></i>${st.label}
        </span>
        <span style="font-size:10px;color:#9CA3AF;">${task.estimatedHours || 0}h</span>
      </div>
    </div>
  `;
}

function renderMemberKanbanModal() {
  const member = users.find(u => u.id === state.form.memberUserId);
  if (!member) return '';
  const weekRange = getCurrentWeekRange();
  const memberTasks = getMemberTasks(member.name, weekRange);
  const todoTasks = memberTasks.filter(t => t.status === 'todo');
  const doingTasks = memberTasks.filter(t => t.status === 'doing');
  const doneTasks = memberTasks.filter(t => t.status === 'done');
  const otherTasks = memberTasks.filter(t => !['todo', 'doing', 'done'].includes(t.status));
  const weeklyBreakdown = getMemberWeeklyHoursBreakdown(member.name, weekRange);
  const originalPlannedHours = weeklyBreakdown.originalPlannedHours || 0;
  const weeklyHours = weeklyBreakdown.totalHours || 0;
  const roleClass = roleBadgeClass(member.role);
  const roleName = roleDisplayName(member.role);
  const columns = [
    { key: 'todo', label: '待开始', tasks: todoTasks, color: '#6B7280', icon: 'fa-clock' },
    { key: 'doing', label: '进行中', tasks: doingTasks, color: '#2563EB', icon: 'fa-spinner' },
    { key: 'done', label: '已完成', tasks: doneTasks, color: '#059669', icon: 'fa-check-circle' },
    { key: 'other', label: '其他', tasks: otherTasks, color: '#D97706', icon: 'fa-ellipsis-h' },
  ];

  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:1100px;width:95vw;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
              <div class="member-kanban-avatar">${member.name.charAt(0)}</div>
              <div>
                <h3 class="modal-title" style="margin:0;">${member.name} · 任务看板</h3>
                <div style="font-size:12px;color:var(--text-light);margin-top:2px;">
                  ${member.dept} · ${member.position}
                  <span class="role-badge ${roleClass}" style="margin-left:6px;">${roleName}</span>
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">统计周期：${weekRange.start} ~ ${weekRange.end}（当周周一至周日）</div>
              </div>
            </div>
          </div>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--text-light);font-size:18px;" title="关闭"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-bottom:20px;">
            <div class="member-kanban-stat">
              <div class="stat-num">${memberTasks.length}</div>
              <div class="stat-cap">总任务</div>
            </div>
            <div class="member-kanban-stat">
              <div class="stat-num" style="color:#2563EB;">${doingTasks.length}</div>
              <div class="stat-cap">进行中</div>
            </div>
            <div class="member-kanban-stat">
              <div class="stat-num" style="color:#DC2626;">${memberTasks.filter(t => isOverdue(t)).length}</div>
              <div class="stat-cap">已逾期</div>
            </div>
            <div class="member-kanban-stat">
              <div class="stat-num" style="color:#059669;">${memberTasks.length > 0 ? Math.round(doneTasks.length / memberTasks.length * 100) : 0}%</div>
              <div class="stat-cap">完成率</div>
            </div>
            <div class="member-kanban-stat">
              <div class="stat-num" style="color:var(--brand);">${originalPlannedHours}h</div>
              <div class="stat-cap">本周原计划</div>
            </div>
            <div class="member-kanban-stat">
              <div class="stat-num" style="color:#E8A84A;">${weeklyHours}h</div>
              <div class="stat-cap">当周待处理</div>
            </div>
          </div>
          ${memberTasks.length === 0 ? `
            <div style="text-align:center;padding:48px;color:#9CA3AF;">
              <i class="fas fa-inbox" style="font-size:40px;margin-bottom:12px;opacity:0.4;display:block;"></i>
              本统计周期内暂无相关任务
            </div>
          ` : `
            <div class="kanban-board">
              ${columns.map(col => `
                <div class="kanban-column">
                  <div class="kanban-column-header">
                    <div class="kanban-column-title">
                      <i class="fas ${col.icon}" style="color:${col.color};"></i>${col.label}
                    </div>
                    <span class="kanban-column-count" style="background:${col.color};">${col.tasks.length}</span>
                  </div>
                  <div class="kanban-column-body">
                    ${col.tasks.map(t => renderKanbanCard(t)).join('')}
                    ${col.tasks.length === 0 ? '<div style="text-align:center;padding:24px 8px;color:#CBD5E1;font-size:11px;">暂无</div>' : ''}
                  </div>
                </div>
              `).join('')}
            </div>
            <p style="margin-top:12px;font-size:12px;color:#9CA3AF;text-align:center;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>仅展示计划窗口与统计周期有重叠的主责任务；点击卡片可查看详情（只读）</p>
          `}
        </div>
      </div>
    </div>
  `;
}
