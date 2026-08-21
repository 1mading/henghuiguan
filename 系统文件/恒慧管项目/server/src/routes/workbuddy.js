const express = require('express');
const config = require('../config');
const { writeOk, writeErr } = require('../utils/response');
const {
  queryWorkbuddy,
  getProjectDetail,
  getTaskDetail,
} = require('../services/workbuddyQuery');

const router = express.Router();

/**
 * WorkBuddy / 外部 Agent 专用鉴权：
 * 必须携带 X-Api-Key，匹配 WORKBUDDY_API_KEY（优先）或 API_KEY。
 * 未配置任一密钥时返回 503，避免未鉴权对外暴露。
 */
function requireWorkbuddyApiKey(req, res, next) {
  const expected = String(config.workbuddyApiKey || config.apiKey || '').trim();
  if (!expected) {
    return writeErr(res, 503, '未配置 WORKBUDDY_API_KEY 或 API_KEY，无法对外提供查询');
  }
  const incoming = String(req.headers['x-api-key'] || req.query.key || '').trim();
  if (!incoming || incoming !== expected) {
    return writeErr(res, 401, '未授权或密钥错误（请设置 Header: X-Api-Key）');
  }
  next();
}

/** 连通性探测（需密钥） */
router.get('/workbuddy/health', requireWorkbuddyApiKey, (_req, res) => {
  writeOk(res, {
    service: 'henghuiguan-workbuddy',
    time: new Date().toISOString(),
  });
});

/**
 * 统一查询
 * GET /api/workbuddy/query
 * Query: type=all|projects|tasks|summary
 *        keyword, status, assignee, projectId, limit
 *        includeArchived, includeDone
 */
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
    });
    writeOk(res, data);
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '查询失败');
  }
});

router.get('/workbuddy/projects/:id', requireWorkbuddyApiKey, (req, res) => {
  try {
    writeOk(res, getProjectDetail(String(req.params.id || '').trim()));
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '查询失败');
  }
});

router.get('/workbuddy/tasks/:id', requireWorkbuddyApiKey, (req, res) => {
  try {
    writeOk(res, getTaskDetail(String(req.params.id || '').trim()));
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '查询失败');
  }
});

module.exports = router;
