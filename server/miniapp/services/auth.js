/**
 * 钉钉免登 → 恒慧管后端 /api/dingtalk/miniapp/login
 */
var config = require('../config');
var api = require('./api');

function getAuthCode() {
  return new Promise(function(resolve, reject) {
    var corpId = String(config.DINGTALK_CORP_ID || '').trim();
    if (!corpId) {
      reject(new Error('请在 config.js 填写 DINGTALK_CORP_ID'));
      return;
    }
    var rt = typeof dd !== 'undefined' ? dd : my;
    if (!rt || !rt.getAuthCode) {
      reject(new Error('请在钉钉客户端或开发者工具中打开小程序'));
      return;
    }
    rt.getAuthCode({
      corpId: corpId,
      success: function(res) {
        var code = res && res.authCode ? String(res.authCode).trim() : '';
        if (!code) reject(new Error('getAuthCode 未返回 authCode'));
        else resolve(code);
      },
      fail: function(err) { reject(err || new Error('getAuthCode 失败')); },
    });
  });
}

function loginByAuthCode(authCode) {
  return api.post('/dingtalk/miniapp/login', {
    authCode: authCode,
    corpId: config.DINGTALK_CORP_ID,
  });
}

function ensureLogin() {
  if (config.SKIP_LOGIN_CHECK) {
    var dingId = config.DEV_MOCK_DINGTALK_USER_ID || 'dt_u018_wangyuanbin';
    return Promise.resolve({
      token: null,
      user: { id: config.DEV_MOCK_USER_ID || 'U018', dingTalkUserId: dingId },
      dingTalkUserId: dingId,
    });
  }
  return getAuthCode()
    .then(loginByAuthCode)
    .then(function(data) {
      return {
        token: data.token,
        user: data.user,
        dingTalkUserId: data.dingTalkUserId || (data.user && data.user.dingTalkUserId) || '',
      };
    });
}

function buildH5Url(session) {
  var base = String(config.H5_BASE_URL || '').replace(/\/+$/, '');
  var userid = session.dingTalkUserId || (session.user && session.user.dingTalkUserId) || '';
  if (!userid) throw new Error('缺少 dingTalkUserId');
  return base + '/app?userid=' + encodeURIComponent(userid) + '&v=1.1.0';
}

module.exports = { ensureLogin, buildH5Url };
