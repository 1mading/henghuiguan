const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { isFullAccess } = require('../utils/roles');
const { requireAuth } = require('../middleware/auth');
const { insertPushLog, getAllPushLogs } = require('../db/database');
const { sendWorkNotification, syncUsersFromDingTalk, diagnoseDingTalkSync } = require('../services/dingtalk');

const router = express.Router();

router.get('/dingtalk/sync/diagnose', requireAuth, async (req, res) => {
  if (!isFullAccess(req.user.role)) {
    return res.status(403).json({ success: false, message: '仅总经理/管理员可诊断' });
  }
  try {
    const result = await diagnoseDingTalkSync();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/dingtalk/users/sync', requireAuth, async (req, res) => {
  if (!isFullAccess(req.user.role)) {
    return res.status(403).json({ success: false, message: '仅总经理/管理员可同步钉钉通讯录' });
  }
  try {
    const result = await syncUsersFromDingTalk(req.body || {});
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || '同步失败' });
  }
});

router.post('/dingtalk/push/work-notification', requireAuth, async (req, res) => {
  const body = req.body || {};
  const { eventType, message, recipients = [], payload } = body;
  const title = message?.title || '【恒慧管】通知';
  const content = message?.content || '';

  const dingTalkUserIds = recipients
    .map(r => r.dingTalkUserId)
    .filter(Boolean);

  if (!dingTalkUserIds.length) {
    return res.status(400).json({
      success: false,
      message: '接收人未绑定钉钉 userid，请先在人员档案同步通讯录',
    });
  }

  const logEntry = {
    id: `P-${uuidv4().slice(0, 8)}`,
    eventType,
    title,
    content,
    recipients: recipients.map(r => r.userName || r.name).join('、'),
    status: 'pending',
    time: new Date().toLocaleString('zh-CN'),
    payload,
    taskId: payload?.taskId || null,
    operator: body.operator,
  };

  try {
    const result = await sendWorkNotification({
      dingTalkUserIds,
      title,
      content,
    });
    logEntry.status = result.mock ? 'queued' : 'sent';
    logEntry.response = result;
    insertPushLog(logEntry);
    res.json({ success: true, ...result, logId: logEntry.id });
  } catch (e) {
    logEntry.status = 'failed';
    logEntry.error = e.message;
    insertPushLog(logEntry);
    res.status(500).json({ success: false, message: e.message, logId: logEntry.id });
  }
});

router.post('/dingtalk/push/batch', requireAuth, async (req, res) => {
  const items = req.body?.items || [];
  const results = [];
  for (const item of items) {
    try {
      const dingTalkUserIds = (item.recipients || [])
        .map(r => r.dingTalkUserId)
        .filter(Boolean);
      if (!dingTalkUserIds.length) {
        results.push({ success: false, eventType: item.eventType, message: '接收人未绑定 userid' });
        continue;
      }
      const result = await sendWorkNotification({
        dingTalkUserIds,
        title: item.message?.title || '【恒慧管】通知',
        content: item.message?.content || '',
      });
      results.push({ success: true, eventType: item.eventType, ...result });
    } catch (e) {
      results.push({ success: false, eventType: item.eventType, message: e.message });
    }
  }
  res.json({ success: true, count: results.length, results });
});

router.get('/dingtalk/push/status', requireAuth, (req, res) => {
  const logs = getAllPushLogs(50);
  res.json({ success: true, logs });
});

module.exports = router;
