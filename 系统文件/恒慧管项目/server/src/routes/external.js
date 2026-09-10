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

router.get('/external/project-templates', requireExternalApiKey, (_req, res) => {
  handle(res, () => {
    const { listTemplates, publicTemplate } = require('../services/projectTemplates');
    return { templates: listTemplates().map(publicTemplate) };
  });
});

router.post('/external/project-templates/from-project/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => {
    const { saveTemplateFromProject } = require('../services/projectTemplates');
    if (req.scopedActor) {
      const err = new Error('作用域 Key 不能另存模板');
      err.status = 403;
      throw err;
    }
    return {
      template: saveTemplateFromProject(req.params.id, {
        name: req.body?.name,
        desc: req.body?.desc,
        id: req.body?.id,
        createdBy: 'external-api',
      }),
    };
  });
});

router.post('/external/projects', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createProject(req.body || {}, actorOpts(req)));
});

router.patch('/external/projects/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateProject(req.params.id, req.body || {}, actorOpts(req)));
});

router.post('/external/projects/:id/sync-phase', requireExternalApiKey, (req, res) => {
  handle(res, () => external.syncProjectPhase(req.params.id, req.body || {}, actorOpts(req)));
});

router.post('/external/projects/:id/handover', requireExternalApiKey, (req, res) => {
  handle(res, () => external.handoverProject(req.params.id, req.body || {}, actorOpts(req)));
});

router.post('/external/projects/:id/issues/from-blocker', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createIssueFromBlocker(req.params.id, req.body || {}, actorOpts(req)));
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

router.get('/external/history', requireExternalApiKey, (req, res) => {
  handle(res, () => external.getHistory(req.query || {}, actorOpts(req)));
});

router.get('/external/issues', requireExternalApiKey, (req, res) => {
  handle(res, () => external.listIssues(req.query || {}, actorOpts(req)));
});

router.post('/external/issues', requireExternalApiKey, (req, res) => {
  handle(res, () => external.createIssue(req.body || {}, actorOpts(req)));
});

router.patch('/external/issues/:id', requireExternalApiKey, (req, res) => {
  handle(res, () => external.updateIssue(req.params.id, req.body || {}, actorOpts(req)));
});

router.post('/external/batch', requireExternalApiKey, (req, res) => {
  handle(res, () => external.batchWrite(req.body || {}, actorOpts(req)));
});

module.exports = router;
