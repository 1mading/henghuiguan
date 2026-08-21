const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getNotificationsForUser,
  countUnreadNotifications,
  markNotificationsRead,
} = require('../db/database');

const router = express.Router();

/** 当前用户的应用内通知列表 */
router.get('/notifications', requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const unreadOnly = String(req.query.unreadOnly || '') === '1' || req.query.unreadOnly === 'true';
  const items = getNotificationsForUser(req.user.id, { limit, unreadOnly });
  const unreadCount = countUnreadNotifications(req.user.id);
  res.json({ success: true, items, unreadCount });
});

/** 未读数量（角标） */
router.get('/notifications/unread-count', requireAuth, (req, res) => {
  res.json({
    success: true,
    unreadCount: countUnreadNotifications(req.user.id),
  });
});

/** 标记已读：{ ids?: string[], all?: boolean } */
router.post('/notifications/mark-read', requireAuth, (req, res) => {
  const { ids, all } = req.body || {};
  const result = markNotificationsRead(req.user.id, {
    ids: Array.isArray(ids) ? ids : null,
    all: !!all,
  });
  res.json({
    success: true,
    ...result,
    unreadCount: countUnreadNotifications(req.user.id),
  });
});

module.exports = router;
