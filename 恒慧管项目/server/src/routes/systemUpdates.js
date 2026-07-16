const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getAllSystemUpdates,
  getPendingUpdatesForUser,
  markUpdatesRead,
} = require('../services/systemUpdates');

const router = express.Router();

/** 全部系统更新记录（只读，全员可见） */
router.get('/system-updates', requireAuth, (_req, res) => {
  res.json({
    success: true,
    updates: getAllSystemUpdates(),
  });
});

/** 当前用户未展示的更新；首次登录静默初始化，不返回待弹内容 */
router.get('/system-updates/pending', requireAuth, (req, res) => {
  try {
    const result = getPendingUpdatesForUser(req.user);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

/** 标记已读（关闭弹框时调用） */
router.post('/system-updates/mark-read', requireAuth, (req, res) => {
  try {
    const { version } = req.body || {};
    const result = markUpdatesRead(req.user.id, version);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;
