const express = require('express');
const config = require('../config');
const { writeOk, writeErr } = require('../utils/response');
const external = require('../services/externalWrite');

const router = express.Router();

/**
 * 第三方写入鉴权：必须携带 X-Api-Key，匹配 API_KEY。
 * 未配置 API_KEY 时返回 503，避免未鉴权写入。
 */
function requireExternalApiKey(req, res, next) {
  const expected = String(config.apiKey || '').trim();
  if (!expected) {
    return writeErr(res, 503, '未配置 API_KEY，无法对外提供写入接口');
  }
  const incoming = String(req.headers['x-api-key'] || req.query.key || '').trim();
  if (!incoming || incoming !== expected) {
    return writeErr(res, 401, '未授权或密钥错误（请设置 Header: X-Api-Key）');
  }
  next();
}

function handle(res, fn) {
  try {
    const data = fn();
    writeOk(res, data);
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '写入失败');
  }
}

router.get('/external/health', requireExternalApiKey, (_req, res) => {
  writeOk(res, {
    service: 'henghuiguan-external-write',
    time: new Date().toISOString(),
  });
});

router.get('/external/catalog', requireExternalApiKey, (_req, res) => {
  writeOk(res, external.getCatalog());
});

router.post('/external/projects', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createProject(req.body || {}));
});

router.patch('/external/projects/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateProject(req.params.id, req.body || {}));
});

router.delete('/external/projects/:id', requireExternalApiKey, (req, res) => {
  const cascadeTasks = req.query.cascade !== 'false' && req.body?.cascadeTasks !== false;
  handle(res, () => external.deleteProject(req.params.id, { cascadeTasks }));
});

router.post('/external/tasks', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createTask(req.body || {}));
});

router.patch('/external/tasks/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateTask(req.params.id, req.body || {}));
});

router.delete('/external/tasks/:id', requireExternalApiKey, (req, res) => {
  const cascadeChildren = req.query.cascade !== 'false' && req.body?.cascadeChildren !== false;
  handle(res, () => external.deleteTask(req.params.id, { cascadeChildren }));
});

router.post('/external/tasks/:id/comments', requireExternalApiKey, (req, res) => {
  handle(res, () => external.addComment(req.params.id, req.body || {}));
});

router.delete('/external/tasks/:taskId/comments/:commentId', requireExternalApiKey, (req, res) => {
  handle(res, () => external.deleteComment(req.params.taskId, req.params.commentId));
});

router.post('/external/dependencies', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createDependency(req.body || {}));
});

router.patch('/external/dependencies/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateDependency(req.params.id, req.body || {}));
});

router.delete('/external/dependencies/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.deleteDependency(req.params.id));
});

router.post('/external/users', requireExternalApiKey, (req, res) => {
  handle(res, () => external.upsertExternalUser(req.body || {}));
});

router.put('/external/work-calendar', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateWorkCalendar(req.body?.workCalendar || req.body));
});

router.post('/external/change-logs', requireExternalApiKey, (req, res) => {
  const entries = Array.isArray(req.body) ? req.body : (req.body?.changeLogs || []);
  handle(res, () => external.appendExternalChangeLogs(entries));
});

router.post('/external/batch', requireExternalApiKey, (req, res) => {
  handle(res, () => external.batchWrite(req.body || {}));
});

module.exports = router;
