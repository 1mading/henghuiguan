const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { writeOk, writeErr } = require('../utils/response');
const {
  canIssueScopedKeys,
  listKeysForUser,
  getActiveKeyStatusMap,
  issueKey,
  revokeKey,
  issueAndSendToUser,
  buildGuideUrls,
  CAP_READ,
  CAP_READ_WRITE,
} = require('../services/scopedApiKeys');
const { findUserById } = require('../db/database');

const router = express.Router();

function requireIssuer(req, res, next) {
  if (!canIssueScopedKeys(req.user)) {
    return writeErr(res, 403, '仅总经理/管理员可签发作用域 Key');
  }
  next();
}

router.get('/scoped-keys/guide', (_req, res) => {
  writeOk(res, {
    ...buildGuideUrls(),
    header: 'X-Api-Key',
    note: '作用域 Key 绑定人员档案；权限与该人员在系统内一致。勿使用全局 API_KEY 或 MySQL hhg_app。',
  });
});

/** 全员作用域 Key 状态一览（仅有效 Key） */
router.get('/scoped-keys/status', requireAuth, requireIssuer, (_req, res) => {
  writeOk(res, { byUserId: getActiveKeyStatusMap() });
});

router.get('/scoped-keys/users/:userId', requireAuth, requireIssuer, (req, res) => {
  const user = findUserById(req.params.userId);
  if (!user) return writeErr(res, 404, '人员不存在');
  writeOk(res, {
    userId: user.id,
    userName: user.name,
    dingTalkBound: !!(user.dingTalkUserId && String(user.dingTalkUserId).trim()),
    keys: listKeysForUser(user.id),
    guide: buildGuideUrls(),
  });
});

/** body: { capability?: 'read'|'read_write' } */
router.post('/scoped-keys/users/:userId/issue', requireAuth, requireIssuer, (req, res) => {
  try {
    const capability = req.body?.capability === CAP_READ ? CAP_READ : CAP_READ_WRITE;
    const result = issueKey({
      boundUserId: req.params.userId,
      capability,
      createdBy: req.user?.name || req.user?.id || '',
      revokeOthers: true,
    });
    writeOk(res, {
      ...result,
      guide: buildGuideUrls(),
      message: '已生成作用域 Key（明文仅此一次，请复制或发送给本人）',
    });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '签发失败');
  }
});

/** 重新签发并钉钉发送：文档说明 + Key + 接口地址 */
router.post('/scoped-keys/users/:userId/send', requireAuth, requireIssuer, async (req, res) => {
  try {
    const capability = req.body?.capability === CAP_READ ? CAP_READ : CAP_READ_WRITE;
    const result = await issueAndSendToUser({
      boundUserId: req.params.userId,
      capability,
      createdBy: req.user?.name || req.user?.id || '',
    });
    writeOk(res, {
      ...result,
      message: '已生成作用域 Key，并通过钉钉/站内信发送接入说明',
    });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '发送失败');
  }
});

router.post('/scoped-keys/:keyId/revoke', requireAuth, requireIssuer, (req, res) => {
  try {
    const record = revokeKey(req.params.keyId, req.user?.name || req.user?.id || '');
    writeOk(res, { record, message: '已吊销' });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '吊销失败');
  }
});

module.exports = router;
