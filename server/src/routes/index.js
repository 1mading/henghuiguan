const express = require('express');
const authRoutes = require('./auth');
const dingtalkRoutes = require('./dingtalk');
const dataRoutes = require('./data');
const configRoutes = require('./config');
const workCalendarRoutes = require('./workCalendar');
const filesRoutes = require('./files');
const displayRoutes = require('./display');

const systemUpdatesRoutes = require('./systemUpdates');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'henghuiguan-api',
    time: new Date().toISOString(),
    production: require('../config').isProduction,
  });
});

router.use(configRoutes);
router.use(systemUpdatesRoutes);
router.use(workCalendarRoutes);
router.use(filesRoutes);
router.use(displayRoutes);
router.use(authRoutes);
router.use(dingtalkRoutes);
router.use(dataRoutes);

router.use((_req, res) => {
  res.status(404).json({ success: false, message: `接口不存在: ${_req.method} ${_req.originalUrl.replace(/^\/api/, '')}` });
});

module.exports = router;
