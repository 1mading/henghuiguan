/**
 * Loop（handagroup.ai）NCC 看板同域代理：
 * 浏览器跨站 iframe 带不上 Loop Cookie，故由恒慧管代持登录态后回源。
 */
const config = require('../config');

const LOOP_COOKIE_NAME = 'hhg_loop_session';
const DEFAULT_BASE = 'https://www.handagroup.ai';

let memorySession = {
  cookieHeader: '',
  expiresAt: 0,
};

function getLoopBaseUrl() {
  return String(config.nccMonitor?.loopBaseUrl || DEFAULT_BASE).replace(/\/+$/, '');
}

function isProxyConfigured() {
  const u = String(config.nccMonitor?.loopUsername || '').trim();
  const p = String(config.nccMonitor?.loopPassword || '').trim();
  return !!(u && p);
}

function parseSetCookieHeaders(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie();
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function mergeCookieHeader(existing, setCookieList) {
  const map = new Map();
  String(existing || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(pair => {
      const i = pair.indexOf('=');
      if (i > 0) map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    });
  for (const raw of setCookieList || []) {
    const first = String(raw || '').split(';')[0];
    const i = first.indexOf('=');
    if (i > 0) {
      const name = first.slice(0, i).trim();
      const value = first.slice(i + 1).trim();
      if (!value || /^(?:Max-Age=0|)$/i.test(value)) map.delete(name);
      else map.set(name, value);
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginToLoop(username, password) {
  const base = getLoopBaseUrl();
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: base,
      Referer: `${base}/login`,
    },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Loop 登录失败 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const cookieHeader = mergeCookieHeader('', parseSetCookieHeaders(res));
  if (!cookieHeader) {
    const err = new Error('Loop 登录成功但未返回会话 Cookie');
    err.status = 502;
    throw err;
  }
  return {
    cookieHeader,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
}

async function ensureLoopSession(force = false) {
  if (!force && memorySession.cookieHeader && memorySession.expiresAt > Date.now() + 60 * 1000) {
    return memorySession.cookieHeader;
  }
  if (!isProxyConfigured()) {
    const err = new Error('未配置 LOOP 看板账号（NCC_MONITOR_LOOP_USERNAME / NCC_MONITOR_LOOP_PASSWORD）');
    err.status = 503;
    throw err;
  }
  const session = await loginToLoop(
    config.nccMonitor.loopUsername,
    config.nccMonitor.loopPassword
  );
  memorySession = session;
  return session.cookieHeader;
}

function clearLoopSession() {
  memorySession = { cookieHeader: '', expiresAt: 0 };
}

async function fetchLoop(pathnameWithQuery, opts = {}) {
  const base = getLoopBaseUrl();
  const path = pathnameWithQuery.startsWith('/') ? pathnameWithQuery : `/${pathnameWithQuery}`;
  const cookieHeader = opts.cookieHeader || (await ensureLoopSession(!!opts.forceLogin));
  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Accept: opts.accept || 'text/html,application/json,*/*',
      Cookie: cookieHeader,
      ...(opts.headers || {}),
    },
    redirect: 'manual',
    signal: opts.signal,
  });

  // 会话失效时自动重登一次
  if ((res.status === 401 || res.status === 303 || res.status === 302) && !opts._retried) {
    const loc = res.headers.get('location') || '';
    if (res.status === 401 || /login/i.test(loc)) {
      clearLoopSession();
      const fresh = await ensureLoopSession(true);
      return fetchLoop(pathnameWithQuery, { ...opts, cookieHeader: fresh, _retried: true });
    }
  }
  return res;
}

function rewriteHtmlForProxy(html, proxyPrefix) {
  const prefix = proxyPrefix.replace(/\/+$/, '');
  let out = String(html || '');
  // 绝对站内地址 → 走同域代理
  out = out.replace(/https?:\/\/www\.handagroup\.ai/gi, prefix);
  // 补 base，兜底相对路径
  if (!/<base\s/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><base href="${prefix}/">`);
  }
  return out;
}

function buildMonitorPath(userid) {
  const reportPath = String(config.nccMonitor?.reportPath || '/api/loop/reports/ncc-monitor/html');
  const u = String(userid || '').trim();
  if (!u) return reportPath;
  return reportPath.includes('?')
    ? `${reportPath}&userid=${encodeURIComponent(u)}`
    : `${reportPath}?userid=${encodeURIComponent(u)}`;
}

module.exports = {
  LOOP_COOKIE_NAME,
  getLoopBaseUrl,
  isProxyConfigured,
  loginToLoop,
  ensureLoopSession,
  clearLoopSession,
  fetchLoop,
  rewriteHtmlForProxy,
  buildMonitorPath,
};
