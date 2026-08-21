const express = require('express');
const config = require('../config');
const { optionalAuth, extractBearer, resolveUserByHeaderId } = require('../middleware/auth');
const { verifyToken } = require('../services/token');
const { findUserById } = require('../db/database');
const { isFullAccess } = require('../utils/roles');
const { writeErr } = require('../utils/response');
const {
  reloadStoreFromDisk,
  getAllProjects,
  getAllTasks,
  getAllTaskDependencies,
} = require('../db/database');
const { buildDisplayWallPayload } = require('../services/displayWall');

const router = express.Router();

function resolveWallUser(req) {
  const headerId = config.allowHeaderAuth ? String(req.headers['x-user-id'] || '').trim() : '';
  if (headerId) return resolveUserByHeaderId(headerId);

  const token = extractBearer(req);
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return findUserById(payload.sub) || null;
  } catch {
    return null;
  }
}

function hasWallApiKey(req) {
  const key = config.apiKey;
  if (!key) return false;
  const incoming = String(req.headers['x-api-key'] || req.query.key || '').trim();
  return incoming === key;
}

function requireWallAccess(req, res, next) {
  if (hasWallApiKey(req)) {
    req.wallAccess = 'apiKey';
    return next();
  }
  const user = resolveWallUser(req);
  if (user && isFullAccess(user.role)) {
    req.user = user;
    req.wallAccess = 'admin';
    return next();
  }
  if (user) {
    req.user = user;
    req.wallAccess = 'user';
    return next();
  }
  return writeErr(res, 401, '未授权：请在 URL 添加 ?key=API密钥，或使用总经理账号登录后访问');
}

router.get('/display/wall', requireWallAccess, (req, res) => {
  reloadStoreFromDisk();
  const projects = getAllProjects();
  const tasks = getAllTasks();
  const taskDependencies = getAllTaskDependencies();
  const payload = buildDisplayWallPayload(projects, tasks, taskDependencies);

  res.json({
    success: true,
    access: req.wallAccess,
    ...payload,
  });
});

module.exports = router;
