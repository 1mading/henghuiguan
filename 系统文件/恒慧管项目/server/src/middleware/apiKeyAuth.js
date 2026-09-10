/**
 * 统一解析全局 API_KEY / WORKBUDDY_API_KEY / 作用域 Key
 */
const config = require('../config');
const { writeErr } = require('../utils/response');
const { resolveScopedKey, touchScopedKeyPersist, CAP_READ } = require('../services/scopedApiKeys');

function readIncomingKey(req) {
  return String(req.headers['x-api-key'] || req.query.key || '').trim();
}

function applyScoped(req, resolved) {
  req.apiKeyKind = 'scoped';
  req.scopedActor = resolved.user;
  req.scopedKeyRecord = resolved.record;
  // 异步轻量落盘 lastUsedAt（失败忽略）
  try { touchScopedKeyPersist(); } catch { /* ignore */ }
}

/**
 * 外部写入：全局 API_KEY，或带 write 能力的作用域 Key
 */
function requireExternalApiKey(req, res, next) {
  const incoming = readIncomingKey(req);
  if (!incoming) {
    return writeErr(res, 401, '未授权或密钥错误（请设置 Header: X-Api-Key）');
  }

  const scoped = resolveScopedKey(incoming);
  if (scoped) {
    if (scoped.record.capability === CAP_READ) {
      return writeErr(res, 403, '该作用域 Key 为只读，不能调用写入接口');
    }
    applyScoped(req, scoped);
    return next();
  }

  const expected = String(config.apiKey || '').trim();
  if (!expected) {
    return writeErr(res, 503, '未配置 API_KEY，无法对外提供写入接口');
  }
  if (incoming !== expected) {
    return writeErr(res, 401, '未授权或密钥错误（请设置 Header: X-Api-Key）');
  }
  req.apiKeyKind = 'global';
  req.scopedActor = null;
  next();
}

/**
 * WorkBuddy 查询：WORKBUDDY_API_KEY / API_KEY，或任意有效作用域 Key
 */
function requireWorkbuddyApiKey(req, res, next) {
  const incoming = readIncomingKey(req);
  if (!incoming) {
    return writeErr(res, 401, '未授权或密钥错误（请设置 Header: X-Api-Key）');
  }

  const scoped = resolveScopedKey(incoming);
  if (scoped) {
    applyScoped(req, scoped);
    return next();
  }

  const expected = String(config.workbuddyApiKey || config.apiKey || '').trim();
  if (!expected) {
    return writeErr(res, 503, '未配置 WORKBUDDY_API_KEY 或 API_KEY，无法对外提供查询');
  }
  if (incoming !== expected) {
    return writeErr(res, 401, '未授权或密钥错误（请设置 Header: X-Api-Key）');
  }
  req.apiKeyKind = 'global';
  req.scopedActor = null;
  next();
}

module.exports = {
  requireExternalApiKey,
  requireWorkbuddyApiKey,
  readIncomingKey,
};
