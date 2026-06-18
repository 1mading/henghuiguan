const express = require('express');
const config = require('../config');
const { authResponse, signToken, verifyToken } = require('../services/token');
const { findUserByDingTalkId, findUserById } = require('../db/database');
const { getUserIdByAuthCode, ensureUserForDingTalkLogin } = require('../services/dingtalk');
const { requireAuth, requireApiKey } = require('../middleware/auth');
const { writeOk, writeErr, toProfileUser } = require('../utils/response');

const router = express.Router();

async function loginWithDingTalkUserId(dingTalkUserId) {
  let user = findUserByDingTalkId(dingTalkUserId);
  if (!user) {
    try {
      user = await ensureUserForDingTalkLogin(dingTalkUserId);
    } catch (e) {
      return { success: false, message: e.message };
    }
  }
  if (!user) {
    return {
      success: false,
      message: `未找到钉钉用户 ${dingTalkUserId}，请总经理同步通讯录或联系管理员`,
    };
  }
  return authResponse(user);
}

router.post('/dingtalk/auth/login-by-userid', async (req, res) => {
  const { dingTalkUserId, userid, corpId } = req.body || {};
  const id = dingTalkUserId || userid;
  if (!id) {
    return res.status(400).json({ success: false, message: '缺少 dingTalkUserId' });
  }

  if (!config.allowDemoLogin && !config.dingtalk.appSecret) {
    return res.status(503).json({ success: false, message: '钉钉登录未配置' });
  }

  try {
    const result = await loginWithDingTalkUserId(id);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/dingtalk/auth/oauth/callback', async (req, res) => {
  const { authCode, code, corpId } = req.body || {};
  const ac = authCode || code;
  if (!ac) {
    return res.status(400).json({ success: false, message: '缺少 authCode' });
  }
  try {
    let dingTalkUserId = null;
    try {
      dingTalkUserId = await getUserIdByAuthCode(ac);
    } catch (e) {
      if (config.allowDemoLogin) {
        dingTalkUserId = ac;
      } else {
        throw e;
      }
    }
    if (!dingTalkUserId) {
      return res.status(401).json({ success: false, message: '无法解析 authCode' });
    }
    const result = await loginWithDingTalkUserId(dingTalkUserId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/dingtalk/miniapp/login', async (req, res) => {
  const { authCode, corpId } = req.body || {};
  if (!authCode) {
    return res.status(400).json({ success: false, message: '缺少 authCode' });
  }
  try {
    let dingTalkUserId = null;
    try {
      dingTalkUserId = await getUserIdByAuthCode(authCode);
    } catch (e) {
      if (config.allowDemoLogin) {
        dingTalkUserId = authCode;
      } else {
        throw e;
      }
    }
    const result = await loginWithDingTalkUserId(dingTalkUserId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/auth/session', requireAuth, (req, res) => {
  const { token, expiresAt } = signToken(req.user);
  res.json({
    success: true,
    user: req.user,
    expiresAt,
    token,
  });
});

router.post('/auth/logout', requireAuth, (_req, res) => {
  res.json({ success: true, message: '已退出登录' });
});

router.post('/auth/refresh', (req, res) => {
  const header = req.headers.authorization || '';
  const old = header.startsWith('Bearer ') ? header.slice(7) : req.body?.refreshToken;
  if (!old) {
    return res.status(400).json({ success: false, message: '缺少 token' });
  }
  try {
    const payload = verifyToken(old);
    const user = findUserById(payload.sub);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    res.json(authResponse(user));
  } catch {
    res.status(401).json({ success: false, message: 'token 无效' });
  }
});

/** 演示登录：POST /api/auth/demo-login { userId: 'U018' } */
router.post('/auth/demo-login', (req, res) => {
  if (!config.allowDemoLogin) {
    return res.status(403).json({ success: false, message: '演示登录已关闭' });
  }
  const user = findUserById(req.body?.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  res.json(authResponse(user));
});

/**
 * FactoryCheckList 兼容：POST /api/auth/profile
 * body: { auth_code } 或 Header X-User-Id（SKIP 模式）
 */
router.post('/auth/profile', requireApiKey, async (req, res) => {
  const m = req.body || {};
  const authCode = m.auth_code || m.authCode || '';
  let uid = String(req.headers['x-user-id'] || '').trim();

  try {
    if (authCode) {
      if (!config.dingtalk.appKey || !config.dingtalk.appSecret) {
        return writeErr(res, 503, 'dingtalk oauth not configured');
      }
      try {
        uid = await getUserIdByAuthCode(authCode);
      } catch (e) {
        if (config.allowDemoLogin) uid = authCode;
        else return writeErr(res, 401, 'invalid auth code');
      }
    }

    if (!uid) {
      return writeErr(res, 400, 'missing user id or auth code');
    }

    const user = findUserByDingTalkId(uid);
    if (!user) {
      return writeErr(res, 403, 'not authorized', { user_id: uid });
    }

    writeOk(res, toProfileUser(user));
  } catch (e) {
    writeErr(res, 500, e.message);
  }
});

module.exports = router;
