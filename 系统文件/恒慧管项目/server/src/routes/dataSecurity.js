const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { writeErr } = require('../utils/response');
const dataSecurity = require('../services/dataSecurity');

const router = express.Router();

function canViewDataSecurity(user) {
  try {
    const { capOn } = require('../services/permissions');
    return capOn(user, 'nav.dataSecurity');
  } catch {
    const role = String(user?.role || '');
    return role === 'admin' || role === 'gm';
  }
}

function requireDataSecurityAdmin(req, res, next) {
  if (!canViewDataSecurity(req.user)) {
    return writeErr(res, 403, '无权限查看数据安全');
  }
  next();
}

router.get('/data-security/overview', requireAuth, requireDataSecurityAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: dataSecurity.getOverview() });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '获取数据安全总览失败');
  }
});

/** 兼容误写 data_security */
router.get('/data_security/overview', requireAuth, requireDataSecurityAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: dataSecurity.getOverview() });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '获取数据安全总览失败');
  }
});

router.get('/data-security/database', requireAuth, requireDataSecurityAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: dataSecurity.getDatabaseOverview() });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '获取数据库概览失败');
  }
});

router.get('/data_security/database', requireAuth, requireDataSecurityAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: dataSecurity.getDatabaseOverview() });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '获取数据库概览失败');
  }
});

router.get('/data-security/apis', requireAuth, requireDataSecurityAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: dataSecurity.getApiCatalog() });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '获取 API 目录失败');
  }
});

router.get('/data_security/apis', requireAuth, requireDataSecurityAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: dataSecurity.getApiCatalog() });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '获取 API 目录失败');
  }
});

module.exports = router;
