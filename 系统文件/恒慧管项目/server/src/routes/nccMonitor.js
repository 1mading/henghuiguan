const express = require('express');
const { requireAuth, extractBearer } = require('../middleware/auth');
const { writeErr } = require('../utils/response');
const {
  LOOP_COOKIE_NAME,
  isProxyConfigured,
  loginToLoop,
  fetchLoop,
  ensureLoopSession,
  clearLoopSession,
  rewriteHtmlForProxy,
  buildMonitorPath,
  getLoopBaseUrl,
} = require('../services/nccMonitorProxy');

const router = express.Router();

function canViewNcc(user) {
  const role = String(user?.role || '');
  return role === 'admin' || role === 'gm';
}

/** iframe 无法自动带 Authorization，允许 ?access_token= */
function requireAuthAllowQueryToken(req, res, next) {
  if (!extractBearer(req)) {
    const q = String(req.query.access_token || req.query.token || '').trim();
    if (q) req.headers.authorization = `Bearer ${q}`;
  }
  return requireAuth(req, res, next);
}

function requireNccAdmin(req, res, next) {
  if (!canViewNcc(req.user)) {
    return writeErr(res, 403, '无权限查看 NCC 异常看板');
  }
  next();
}

function readBrowserLoopCookie(req) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map(s => s.trim());
  for (const p of parts) {
    if (p.startsWith(`${LOOP_COOKIE_NAME}=`)) {
      try {
        return decodeURIComponent(p.slice(LOOP_COOKIE_NAME.length + 1));
      } catch {
        return p.slice(LOOP_COOKIE_NAME.length + 1);
      }
    }
  }
  return '';
}

function setBrowserLoopCookie(res, cookieHeader) {
  const maxAge = 7 * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `${LOOP_COOKIE_NAME}=${encodeURIComponent(cookieHeader)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearBrowserLoopCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${LOOP_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function proxyPrefix(req) {
  return `${req.protocol}://${req.get('host')}/api/ncc-monitor/upstream`;
}

function resolveUpstreamCookie(req) {
  return readBrowserLoopCookie(req) || undefined;
}

router.get('/ncc-monitor/status', requireAuth, requireNccAdmin, (req, res) => {
  const hasBrowserSession = !!readBrowserLoopCookie(req);
  res.json({
    success: true,
    proxyConfigured: isProxyConfigured(),
    hasBrowserSession,
    canEmbed: isProxyConfigured() || hasBrowserSession,
    loopBaseUrl: getLoopBaseUrl(),
  });
});

router.post('/ncc-monitor/login', requireAuth, requireNccAdmin, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return writeErr(res, 400, '请输入用户名和密码');
  }
  try {
    const session = await loginToLoop(username, password);
    setBrowserLoopCookie(res, session.cookieHeader);
    res.json({ success: true, message: 'Loop 登录成功，看板可内嵌打开', expiresInDays: 7 });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message || '登录失败' });
  }
});

router.post('/ncc-monitor/logout', requireAuth, requireNccAdmin, (req, res) => {
  clearBrowserLoopCookie(res);
  res.json({ success: true });
});

router.get('/ncc-monitor/embed', requireAuthAllowQueryToken, requireNccAdmin, async (req, res) => {
  const browserCookie = readBrowserLoopCookie(req);
  const canFetch = isProxyConfigured() || !!browserCookie;
  const userid = String(req.query.userid || req.user.dingTalkUserId || '').trim();
  const token = extractBearer(req) || '';

  if (!canFetch) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(renderLoginShell({
      accessToken: token,
      userid,
      message: '',
    }));
  }

  try {
    const path = buildMonitorPath(userid);
    const upstream = await fetchLoop(path, {
      cookieHeader: resolveUpstreamCookie(req),
      accept: 'text/html,application/xhtml+xml',
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!upstream.ok) {
      if (upstream.status === 401) {
        clearBrowserLoopCookie(res);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(renderLoginShell({
          accessToken: token,
          userid,
          message: '登录已过期，请重新登录 Loop 平台',
        }));
      }
      return res.status(upstream.status).type('text/plain').send(
        buf.toString('utf8').slice(0, 800) || `上游错误 ${upstream.status}`
      );
    }
    const ctype = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    let body = buf.toString('utf8');
    if (/text\/html/i.test(ctype)) {
      body = rewriteHtmlForProxy(body, proxyPrefix(req));
      // 给后续相对请求带上 token（fetch 默认不带 query）；注入一小段补丁
      body = injectAuthTokenPatch(body, token);
    }
    res.setHeader('Content-Type', ctype);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(body);
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || '代理失败' });
  }
});

router.all('/ncc-monitor/upstream/*', requireAuthAllowQueryToken, requireNccAdmin, async (req, res) => {
  const browserCookie = readBrowserLoopCookie(req);
  if (!isProxyConfigured() && !browserCookie) {
    return writeErr(res, 401, '未登录 Loop');
  }
  const star = req.params[0] || '';
  const qsIdx = req.url.indexOf('?');
  const qs = qsIdx >= 0 ? req.url.slice(qsIdx) : '';
  const path = `/${star}${qs}`;

  try {
    const headers = {};
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

    let cookieHeader = browserCookie;
    if (!cookieHeader && isProxyConfigured()) {
      cookieHeader = await ensureLoopSession();
    }

    const doFetch = async (cookie) => {
      const init = {
        method: req.method,
        headers: {
          ...headers,
          Cookie: cookie || '',
          Accept: req.headers.accept || '*/*',
        },
        redirect: 'manual',
      };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
          init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
          init.body = JSON.stringify(req.body);
        }
      }
      return fetch(`${getLoopBaseUrl()}${path}`, init);
    };

    let finalRes = await doFetch(cookieHeader);
    if (finalRes.status === 401 && isProxyConfigured() && !browserCookie) {
      clearLoopSession();
      cookieHeader = await ensureLoopSession(true);
      finalRes = await doFetch(cookieHeader);
    }

    const buf = Buffer.from(await finalRes.arrayBuffer());
    const ctype = finalRes.headers.get('content-type') || 'application/octet-stream';
    res.status(finalRes.status);
    res.setHeader('Content-Type', ctype);
    res.setHeader('Cache-Control', 'no-store');
    if (/text\/html/i.test(ctype)) {
      const token = extractBearer(req) || '';
      return res.send(injectAuthTokenPatch(
        rewriteHtmlForProxy(buf.toString('utf8'), proxyPrefix(req)),
        token
      ));
    }
    return res.send(buf);
  } catch (e) {
    return writeErr(res, e.status || 500, e.message || '回源失败');
  }
});

function injectAuthTokenPatch(html, token) {
  if (!token) return html;
  const patch = `<script>(function(){try{var t=${JSON.stringify(token)};
var _f=window.fetch;window.fetch=function(i,init){init=init||{};init.headers=new Headers(init.headers||{});
if(!init.headers.has('Authorization'))init.headers.set('Authorization','Bearer '+t);return _f.call(this,i,init);};
}catch(e){}})();</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${patch}</head>`);
  return patch + html;
}

function renderLoginShell({ accessToken = '', userid = '', message = '' } = {}) {
  const msg = String(message || '').replace(/[<>&"]/g, s => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;',
  }[s]));
  const token = String(accessToken || '').replace(/[<>&"]/g, '');
  const uid = String(userid || '').replace(/[<>&"]/g, '');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>登录 Loop 看板</title>
  <style>
    body { margin:0; font-family: "PingFang SC","Microsoft YaHei",sans-serif; background:#F8FAFC; color:#0F172A; }
    .wrap { max-width: 420px; margin: 48px auto; padding: 24px; background:#fff; border:1px solid #E2E8F0; border-radius:12px; }
    h1 { font-size:18px; margin:0 0 8px; }
    p { font-size:13px; color:#64748B; line-height:1.55; margin:0 0 16px; }
    label { display:block; font-size:12px; margin:0 0 6px; color:#334155; }
    input { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #CBD5E1; border-radius:8px; margin-bottom:12px; font-size:14px; }
    button { width:100%; padding:10px 12px; border:0; border-radius:8px; background:#3D4A8C; color:#fff; font-size:14px; font-weight:600; cursor:pointer; }
    button:disabled { opacity:.6; cursor:default; }
    .err { color:#B91C1C; font-size:12px; min-height:18px; margin-bottom:8px; }
    .ok { color:#047857; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>登录 Loop 看板平台</h1>
    <p>自 8 月 29 日起 handagroup.ai 需登录。请在此登录一次（约 7 天有效），即可在恒慧管内嵌打开，无需新窗口。</p>
    <div class="err" id="err">${msg}</div>
    <form id="f">
      <label for="username">用户名</label>
      <input id="username" name="username" autocomplete="username" required />
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit" id="btn">登录并打开看板</button>
    </form>
  </div>
  <script>
    const ACCESS_TOKEN = ${JSON.stringify(token)};
    const USERID = ${JSON.stringify(uid)};
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('err');
      const btn = document.getElementById('btn');
      err.textContent = '';
      err.className = 'err';
      btn.disabled = true;
      btn.textContent = '登录中…';
      try {
        const res = await fetch('/api/ncc-monitor/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(ACCESS_TOKEN ? { Authorization: 'Bearer ' + ACCESS_TOKEN } : {}),
          },
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || '登录失败');
        err.className = 'ok';
        err.textContent = '登录成功，正在加载看板…';
        try { parent.postMessage({ type: 'ncc-monitor-login-ok' }, '*'); } catch {}
        const next = new URL('/api/ncc-monitor/embed', location.origin);
        if (USERID) next.searchParams.set('userid', USERID);
        if (ACCESS_TOKEN) next.searchParams.set('access_token', ACCESS_TOKEN);
        location.replace(next.toString());
      } catch (ex) {
        err.className = 'err';
        err.textContent = ex.message || '登录失败';
        btn.disabled = false;
        btn.textContent = '登录并打开看板';
      }
    });
  </script>
</body>
</html>`;
}

module.exports = router;
