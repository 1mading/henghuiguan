const express = require('express');
const config = require('../config');
const { isConfigured } = require('../services/dingtalk');
const { getLanIPv4List } = require('../utils/localNetwork');

const router = express.Router();

/** 前端初始化用（不含密钥） */
router.get('/config/public', (_req, res) => {
  res.json({
    success: true,
    corpId: config.dingtalk.corpId,
    appKey: config.dingtalk.appKey,
    agentId: config.dingtalk.agentId,
    publicBaseUrl: config.publicBaseUrl,
    allowDemoLogin: config.allowDemoLogin,
    isProduction: config.isProduction,
    localAsServer: config.localAsServer,
    deployMode: config.deployMode,
    lanAddresses: config.localAsServer ? getLanIPv4List() : [],
    dingtalkConfigured: isConfigured(),
    nccMonitorConfigured: !!(config.nccMonitor?.loopUsername && config.nccMonitor?.loopPassword),
    nccMonitorUrl: config.nccMonitor?.url || '',
    handaOmUrl: process.env.HANDA_OM_URL || '',
  });
});

module.exports = router;
