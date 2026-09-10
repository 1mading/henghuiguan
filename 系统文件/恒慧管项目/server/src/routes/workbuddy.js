const express = require('express');
const { writeOk, writeErr } = require('../utils/response');
const {
  queryWorkbuddy,
  getProjectDetail,
  getTaskDetail,
  getProjectPlanLedger,
} = require('../services/workbuddyQuery');
const { requireWorkbuddyApiKey } = require('../middleware/apiKeyAuth');

const router = express.Router();

router.get('/workbuddy/health', requireWorkbuddyApiKey, (req, res) => {
  writeOk(res, {
    service: 'henghuiguan-workbuddy',
    time: new Date().toISOString(),
    keyKind: req.apiKeyKind || 'global',
    actor: req.scopedActor ? { id: req.scopedActor.id, name: req.scopedActor.name } : null,
  });
});

router.get('/workbuddy/query', requireWorkbuddyApiKey, (req, res) => {
  try {
    const data = queryWorkbuddy({
      type: req.query.type,
      keyword: req.query.keyword,
      status: req.query.status,
      assignee: req.query.assignee,
      projectId: req.query.projectId,
      limit: req.query.limit,
      includeArchived: req.query.includeArchived,
      includeDone: req.query.includeDone,
      actor: req.scopedActor || null,
    });
    writeOk(res, data);
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '查询失败');
  }
});

router.get('/workbuddy/projects/:id', requireWorkbuddyApiKey, (req, res) => {
  try {
    writeOk(res, getProjectDetail(String(req.params.id || '').trim(), { actor: req.scopedActor || null }));
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '查询失败');
  }
});

router.get('/workbuddy/projects/:id/plan-ledger', requireWorkbuddyApiKey, (req, res) => {
  try {
    writeOk(res, getProjectPlanLedger(String(req.params.id || '').trim(), { actor: req.scopedActor || null }));
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '查询失败');
  }
});

router.get('/workbuddy/tasks/:id', requireWorkbuddyApiKey, (req, res) => {
  try {
    writeOk(res, getTaskDetail(String(req.params.id || '').trim(), { actor: req.scopedActor || null }));
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '查询失败');
  }
});

module.exports = router;
