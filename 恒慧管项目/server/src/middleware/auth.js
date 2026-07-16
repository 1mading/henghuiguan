const config = require('../config');
const { verifyToken } = require('../services/token');
const { findUserById, findUserByDingTalkId } = require('../db/database');
const { writeErr } = require('../utils/response');

function extractBearer(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function callerUserId(req) {
  return String(req.headers['x-user-id'] || '').trim();
}

/** FactoryCheckList 风格：校验 X-Api-Key（未配置 API_KEY 时跳过） */
function requireApiKey(req, res, next) {
  const key = config.apiKey;
  if (!key) return next();
  const incoming = String(req.headers['x-api-key'] || '').trim();
  if (incoming !== key) {
    return writeErr(res, 401, '未授权或密钥错误');
  }
  next();
}

function resolveUserByHeaderId(userId) {
  if (!userId) return null;
  return findUserByDingTalkId(userId) || findUserById(userId);
}

function optionalAuth(req, res, next) {
  const token = extractBearer(req);
  const headerId = config.allowHeaderAuth ? callerUserId(req) : '';
  if (headerId) {
    req.user = resolveUserByHeaderId(headerId);
    return next();
  }
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const payload = verifyToken(token);
    req.user = findUserById(payload.sub) || { id: payload.sub, ...payload };
    next();
  } catch {
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  const headerId = config.allowHeaderAuth ? callerUserId(req) : '';
  if (headerId) {
    const user = resolveUserByHeaderId(headerId);
    if (!user) {
      return writeErr(res, 403, 'not authorized', { user_id: headerId });
    }
    req.user = user;
    return next();
  }

  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  try {
    const payload = verifyToken(token);
    const user = findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

module.exports = {
  optionalAuth,
  requireAuth,
  requireApiKey,
  extractBearer,
  callerUserId,
  resolveUserByHeaderId,
};
