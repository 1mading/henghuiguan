const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { isFullAccess } = require('../utils/roles');
const {
  getWorkCalendar,
  saveWorkCalendar,
  calcEndDate,
  calcActualHours,
} = require('../services/workCalendar');

const router = express.Router();

router.get('/work-calendar', requireAuth, (_req, res) => {
  res.json({ success: true, workCalendar: getWorkCalendar() });
});

router.put('/work-calendar', requireAuth, (req, res) => {
  if (!isFullAccess(req.user.role)) {
    return res.status(403).json({ success: false, message: '仅管理员可修改工作日历' });
  }
  try {
    const saved = saveWorkCalendar(req.body || {});
    res.json({ success: true, workCalendar: saved, message: '工作日历已更新' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/work-calendar/calc-end-date', requireAuth, (req, res) => {
  const { startDate, hours, dailyHours } = req.body || {};
  res.json({
    success: true,
    endDate: calcEndDate(startDate, Number(hours), undefined, dailyHours),
  });
});

router.post('/work-calendar/calc-actual-hours', requireAuth, (req, res) => {
  const { startDate, endDate, dailyHours } = req.body || {};
  res.json({
    success: true,
    hours: calcActualHours(startDate, endDate || undefined, undefined, dailyHours),
  });
});

module.exports = router;
