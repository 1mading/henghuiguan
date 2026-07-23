const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { persistStore, getDb } = require('../db/database');
const {
  ensureWorkReportsStore,
  listWorkReportsForUser,
  findWorkReportById,
  canViewWorkReport,
  upsertWorkReport,
} = require('../services/workReports');

const router = express.Router();

router.get('/work-reports', requireAuth, (req, res) => {
  ensureWorkReportsStore(getDb());
  const type = req.query.type === 'weekly' || req.query.type === 'daily' ? req.query.type : '';
  let items = listWorkReportsForUser(req.user);
  if (type) items = items.filter(r => r.type === type);
  items = items.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  res.json({
    success: true,
    items,
    myUserId: req.user.id,
  });
});

router.get('/work-reports/:id', requireAuth, (req, res) => {
  const report = findWorkReportById(req.params.id);
  if (!report || !canViewWorkReport(req.user, report)) {
    return res.status(404).json({ success: false, message: '汇报不存在或无权查看' });
  }
  res.json({ success: true, report });
});

router.post('/work-reports', requireAuth, (req, res) => {
  try {
    const report = upsertWorkReport(req.user, req.body || {});
    res.json({ success: true, report });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message || '保存失败' });
  }
});

router.put('/work-reports/:id', requireAuth, (req, res) => {
  try {
    const report = upsertWorkReport(req.user, { ...(req.body || {}), id: req.params.id });
    res.json({ success: true, report });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message || '保存失败' });
  }
});

router.delete('/work-reports/:id', requireAuth, (req, res) => {
  const store = getDb();
  ensureWorkReportsStore(store);
  const idx = store.workReports.findIndex(r => r.id === req.params.id);
  if (idx < 0) {
    return res.status(404).json({ success: false, message: '汇报不存在' });
  }
  const report = store.workReports[idx];
  if (report.authorId !== req.user.id) {
    return res.status(403).json({ success: false, message: '只能删除本人的汇报' });
  }
  store.workReports.splice(idx, 1);
  persistStore();
  res.json({ success: true });
});

module.exports = router;
