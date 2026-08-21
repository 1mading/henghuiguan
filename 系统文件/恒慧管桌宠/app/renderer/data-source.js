/**
 * 可配置数据源：登录 / 通知列表 / SSE 实时推送
 * 归一化为桌宠壳消费的结构，协议细节来自 config.auth / notify / realtime
 */
(function (global) {
  function getByPath(obj, pathStr) {
    if (obj == null || pathStr == null || pathStr === '') return obj;
    const parts = String(pathStr).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function fillTemplate(str, vars) {
    return String(str == null ? '' : str).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      const v = vars[key];
      return v == null ? '' : String(v);
    });
  }

  function fillObjectTemplate(obj, vars) {
    if (obj == null) return obj;
    if (typeof obj === 'string') return fillTemplate(obj, vars);
    if (Array.isArray(obj)) return obj.map((x) => fillObjectTemplate(x, vars));
    if (typeof obj === 'object') {
      const out = {};
      Object.keys(obj).forEach((k) => {
        out[k] = fillObjectTemplate(obj[k], vars);
      });
      return out;
    }
    return obj;
  }

  function apiBaseOf(config) {
    return String((config && config.apiBase) || '').replace(/\/+$/, '');
  }

  function joinUrl(base, pathOrUrl) {
    const p = String(pathOrUrl || '');
    if (/^https?:\/\//i.test(p)) return p;
    const pathPart = p.startsWith('/') ? p : '/' + p;
    return base + pathPart;
  }

  function buildAuthHeader(config) {
    const token = (config && config.token) || '';
    if (!token) return null;
    const tpl = (config && config.authHeader) || 'Bearer {{token}}';
    return fillTemplate(tpl, { token, userId: (config && config.userId) || '' });
  }

  async function apiFetch(config, pathOrUrl, opts) {
    const options = opts || {};
    const base = apiBaseOf(config);
    if (!base && !/^https?:\/\//i.test(String(pathOrUrl || ''))) {
      throw new Error('未配置 API 地址');
    }
    const url = joinUrl(base, pathOrUrl);
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );
    if (!options.skipAuth) {
      const authVal = buildAuthHeader(config);
      if (authVal) headers.Authorization = authVal;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
    let timer = null;
    if (controller) {
      timer = setTimeout(() => {
        try { controller.abort(); } catch (_) { /* ignore */ }
      }, timeoutMs);
    }
    let res;
    try {
      res = await fetch(url, Object.assign({}, options, {
        headers,
        signal: controller ? controller.signal : undefined,
      }));
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('请求超时');
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || ('HTTP ' + res.status));
    }
    return data;
  }

  async function login(config) {
    const cfg = config || {};
    const auth = cfg.auth || {};
    let mode = auth.mode || 'demoLogin';

    // 有钉钉 userid 时优先走正式 userid 登录（Electron 无法钉钉免登）
    if (mode === 'dingTalkUserId' || (String(cfg.dingTalkUserId || '').trim() && mode !== 'pasteToken' && mode !== 'customPost' && mode !== 'demoLogin')) {
      mode = 'dingTalkUserId';
    }

    if (mode === 'pasteToken') {
      const token = String(cfg.token || '').trim();
      if (!token) throw new Error('请粘贴 Token');
      return {
        token,
        userName: String(cfg.userName || '').trim() || '已保存 Token',
      };
    }

    const vars = {
      userId: cfg.userId || '',
      dingTalkUserId: cfg.dingTalkUserId || '',
      token: cfg.token || '',
    };

    let loginPath = auth.loginPath;
    let bodyTemplate = auth.bodyTemplate;
    if (mode === 'dingTalkUserId') {
      if (!vars.dingTalkUserId) throw new Error('请填写钉钉 userid');
      loginPath = loginPath || '/dingtalk/auth/login-by-userid';
      bodyTemplate = bodyTemplate || { dingTalkUserId: '{{dingTalkUserId}}' };
      // 若仍是演示登录体，纠正为钉钉字段
      if (bodyTemplate.userId && !bodyTemplate.dingTalkUserId) {
        bodyTemplate = { dingTalkUserId: '{{dingTalkUserId}}' };
        loginPath = '/dingtalk/auth/login-by-userid';
      }
    } else if (mode === 'demoLogin') {
      loginPath = loginPath || '/auth/demo-login';
      bodyTemplate = bodyTemplate || { userId: '{{userId}}' };
    } else {
      loginPath = loginPath || '/auth/demo-login';
      bodyTemplate = bodyTemplate || { userId: '{{userId}}' };
    }

    const body = fillObjectTemplate(bodyTemplate, vars);
    const data = await apiFetch(cfg, loginPath, {
      method: 'POST',
      body: JSON.stringify(body),
      skipAuth: true,
    });
    const token = getByPath(data, auth.tokenPath || 'token');
    const userName = getByPath(data, auth.userNamePath || 'user.name');
    const userId = getByPath(data, 'user.id');
    if (!token) throw new Error('响应中未找到 token（检查 tokenPath）');
    return {
      token: String(token),
      userName: userName != null && userName !== '' ? String(userName) : String(cfg.userId || cfg.dingTalkUserId || ''),
      userId: userId != null ? String(userId) : (cfg.userId || ''),
      raw: data,
    };
  }

  function normalizeItem(raw, notify) {
    const n = notify || {};
    const title = getByPath(raw, n.titlePath || 'title');
    let body = getByPath(raw, n.bodyPath || 'content');
    if (body == null || body === '') body = raw.body || raw.content || '';
    const eventType = getByPath(raw, n.eventTypePath || 'eventType');
    const id = getByPath(raw, n.idPath || 'id');
    return {
      id: id != null ? String(id) : undefined,
      title: title != null ? String(title) : (eventType != null ? String(eventType) : '通知'),
      body: body != null ? String(body) : '',
      eventType: eventType != null ? String(eventType) : '',
      raw,
    };
  }

  function ensureUnreadOnlyPath(listPath) {
    const raw = String(listPath || '/notifications?limit=8');
    if (/[?&]unreadOnly=/i.test(raw)) return raw;
    return raw + (raw.indexOf('?') >= 0 ? '&' : '?') + 'unreadOnly=1';
  }

  async function fetchNotifications(config) {
    const cfg = config || {};
    if (!cfg.token) throw new Error('未登录');
    const notify = cfg.notify || {};
    const listPath = ensureUnreadOnlyPath(notify.listPath || '/notifications?limit=8');
    const data = await apiFetch(cfg, listPath, { method: 'GET' });
    const itemsRaw = getByPath(data, notify.itemsPath || 'items');
    const list = Array.isArray(itemsRaw) ? itemsRaw : [];
    const unreadRaw = getByPath(data, notify.unreadPath || 'unreadCount');
    return {
      unreadCount: Number(unreadRaw) || 0,
      items: list.map((item) => normalizeItem(item, notify)),
      raw: data,
    };
  }

  async function markNotificationsRead(config, opts) {
    const cfg = config || {};
    if (!cfg.token) throw new Error('未登录');
    const notify = cfg.notify || {};
    const path = notify.markReadPath || '/notifications/mark-read';
    const body = {};
    if (opts && opts.all) body.all = true;
    if (opts && Array.isArray(opts.ids)) body.ids = opts.ids;
    return apiFetch(cfg, path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  function connectRealtime(config, onTrigger) {
    const cfg = config || {};
    const rt = cfg.realtime || {};
    if (rt.enabled === false) {
      return { close: function () {}, active: false };
    }
    if (!cfg.token || typeof EventSource === 'undefined') {
      return { close: function () {}, active: false };
    }
    const base = apiBaseOf(cfg);
    if (!base) return { close: function () {}, active: false };

    let path = String(rt.path || '/realtime/events');
    const tokenQuery = rt.tokenQuery || 'token';
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    const url = joinUrl(base, path + sep + encodeURIComponent(tokenQuery) + '=' + encodeURIComponent(cfg.token));

    const es = new EventSource(url);
    const eventName = rt.eventName || 'change';
    const triggerType = rt.triggerType || 'inbox.updated';

    function handlePayload(raw) {
      let data = {};
      try { data = JSON.parse(raw || '{}'); } catch (_) { data = {}; }
      if (triggerType) {
        if (data.type !== triggerType) return;
      }
      if (typeof onTrigger === 'function') onTrigger(data);
    }

    if (eventName && eventName !== 'message') {
      es.addEventListener(eventName, (ev) => handlePayload(ev.data));
    } else {
      es.onmessage = (ev) => handlePayload(ev.data);
    }

    return {
      active: true,
      close: function () {
        try { es.close(); } catch (_) { /* ignore */ }
      },
    };
  }

  async function testConnection(config) {
    const cfg = Object.assign({}, config);
    let loginResult = null;
    const mode = (cfg.auth && cfg.auth.mode) || 'demoLogin';
    if (mode === 'pasteToken') {
      if (!cfg.token) throw new Error('请先填写 Token');
      loginResult = { token: cfg.token, userName: cfg.userName || 'Token' };
    } else {
      loginResult = await login(cfg);
      cfg.token = loginResult.token;
      cfg.userName = loginResult.userName;
    }
    const inbox = await fetchNotifications(cfg);
    return {
      token: loginResult.token,
      userName: loginResult.userName,
      unreadCount: inbox.unreadCount,
      sampleTitle: inbox.items[0] ? inbox.items[0].title : '',
      itemCount: inbox.items.length,
    };
  }

  global.PetDataSource = {
    getByPath,
    fillTemplate,
    fillObjectTemplate,
    apiFetch,
    login,
    fetchNotifications,
    markNotificationsRead,
    connectRealtime,
    testConnection,
  };
})(typeof window !== 'undefined' ? window : globalThis);
