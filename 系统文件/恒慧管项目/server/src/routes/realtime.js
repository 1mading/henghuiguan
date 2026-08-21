const express = require('express');
const config = require('../config');
const { requireAuth, extractBearer, resolveUserByHeaderId, callerUserId } = require('../middleware/auth');
const { verifyToken } = require('../services/token');
const { findUserById } = require('../db/database');
const {
  attachSseHeaders,
  addClient,
  removeClient,
  getStoreRevision,
} = require('../services/realtime');

const router = express.Router();

function applyQueryToken(req) {
  if (extractBearer(req)) return;
  const q = String(req.query.token || '').trim();
  if (q) req.headers.authorization = `Bearer ${q}`;
}

function hasRealtimeApiKey(req) {
  const key = config.apiKey;
  if (!key) return false;
  const incoming = String(req.headers['x-api-key'] || req.query.key || '').trim();
  return incoming === key;
}

/**
 * SSE：JWT（Bearer 或 ?token=）或大屏 API Key（?key=）。
 * EventSource 无法带 Authorization 头，故支持 query token。
 */
function requireRealtimeAccess(req, res, next) {
  applyQueryToken(req);

  if (hasRealtimeApiKey(req)) {
    req.realtimeWall = true;
    req.user = null;
    return next();
  }

  const headerId = config.allowHeaderAuth ? callerUserId(req) : '';
  if (headerId) {
    const user = resolveUserByHeaderId(headerId);
    if (user && user.profileKind !== 'contact' && user.active !== false) {
      req.user = user;
      return next();
    }
  }

  const token = extractBearer(req) || String(req.query.token || '').trim();
  if (!token) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  try {
    const payload = verifyToken(token);
    const user = findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }
    if (user.profileKind === 'contact') {
      return res.status(403).json({ success: false, message: '通知联系人不可登录恒慧管' });
    }
    if (user.active === false) {
      return res.status(403).json({ success: false, message: '账号已停用' });
    }
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

router.get('/realtime/events', requireRealtimeAccess, (req, res) => {
  attachSseHeaders(res);
  const client = addClient(res, {
    userId: req.user?.id || null,
    wall: !!req.realtimeWall,
  });
  if (!client) return;

  const onClose = () => {
    removeClient(client);
    req.off?.('close', onClose);
    res.off?.('close', onClose);
  };
  req.on('close', onClose);
  res.on('close', onClose);
});

router.get('/realtime/revision', requireAuth, (_req, res) => {
  res.json({ success: true, rev: getStoreRevision() });
});

module.exports = router;
