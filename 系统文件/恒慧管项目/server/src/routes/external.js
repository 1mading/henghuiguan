const express = require('express');
const { writeOk, writeErr } = require('../utils/response');
const external = require('../services/externalWrite');
const { requireExternalApiKey } = require('../middleware/apiKeyAuth');

const router = express.Router();

function actorOpts(req) {
  return { actor: req.scopedActor || null };
}

function handle(res, fn) {
  try {
    const data = fn();
    writeOk(res, data);
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '写入失败');
  }
}

router.get('/external/health', requireExternalApiKey, (req, res) => {
  writeOk(res, {
    service: 'henghuiguan-external-write',
    time: new Date().toISOString(),
    keyKind: req.apiKeyKind || 'global',
    actor: req.scopedActor ? { id: req.scopedActor.id, name: req.scopedActor.name } : null,
  });
});

router.get('/external/catalog', requireExternalApiKey, (_req, res) => {
  writeOk(res, external.getCatalog());
});

router.post('/external/projects', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createProject(req.body || {}, actorOpts(req)));
});

router.patch('/external/projects/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateProject(req.params.id, req.body || {}, actorOpts(req)));
});

router.get('/external/projects/:id/plan-ledger', requireExternalApiKey, (req, res) => {
  handle(res, () => external.getExternalProjectPlanLedger(req.params.id, actorOpts(req)));
});

router.post('/external/projects/:id/plan-verify', requireExternalApiKey, (req, res) => {
  handle(res, () => external.verifyProjectPlan(req.params.id, req.body || {}, actorOpts(req)));
});

router.delete('/external/projects/:id', requireExternalApiKey, (req, res) => {
  const cascadeTasks = req.query.cascade !== 'false' && req.body?.cascadeTasks !== false;
  handle(res, () => external.deleteProject(req.params.id, { cascadeTasks, ...actorOpts(req) }));
});

router.post('/external/tasks', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createTask(req.body || {}, actorOpts(req)));
});

router.patch('/external/tasks/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateTask(req.params.id, req.body || {}, actorOpts(req)));
});

router.delete('/external/tasks/:id', requireExternalApiKey, (req, res) => {
  const cascadeChildren = req.query.cascade !== 'false' && req.body?.cascadeChildren !== false;
  handle(res, () => external.deleteTask(req.params.id, { cascadeChildren, ...actorOpts(req) }));
});

router.post('/external/tasks/:id/comments', requireExternalApiKey, (req, res) => {
  handle(res, () => external.addComment(req.params.id, req.body || {}, actorOpts(req)));
});

router.delete('/external/tasks/:taskId/comments/:commentId', requireExternalApiKey, (req, res) => {
  handle(res, () => external.deleteComment(req.params.taskId, req.params.commentId, actorOpts(req)));
});

router.post('/external/dependencies', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createDependency(req.body || {}, actorOpts(req)));
});

router.patch('/external/dependencies/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateDependency(req.params.id, req.body || {}, actorOpts(req)));
});

router.delete('/external/dependencies/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.deleteDependency(req.params.id, actorOpts(req)));
});

router.post('/external/users', requireExternalApiKey, (req, res) => {
  handle(res, () => external.upsertExternalUser(req.body || {}, actorOpts(req)));
});

router.put('/external/work-calendar', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateWorkCalendar(req.body?.workCalendar || req.body, actorOpts(req)));
});

router.post('/external/change-logs', requireExternalApiKey, (req, res) => {
  const entries = Array.isArray(req.body) ? req.body : (req.body?.changeLogs || []);
  handle(res, () => external.appendExternalChangeLogs(entries, actorOpts(req)));
});

router.post('/external/batch', requireExternalApiKey, (req, res) => {
  handle(res, () => external.batchWrite(req.body || {}, actorOpts(req)));
});

module.exports = router;
