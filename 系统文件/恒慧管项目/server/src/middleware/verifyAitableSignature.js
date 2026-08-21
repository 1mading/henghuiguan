const crypto = require('crypto');
const config = require('../config');

/**
 * 计算钉钉 AI 表格 HTTP 请求签名（与官方文档一致）
 * signature = Base64(HmacSHA256(apiSecret, timestamp))
 */
function calcAitableSignature(apiSecret, timestamp) {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(String(timestamp))
    .digest('base64');
}

/**
 * 校验 AI 表格自动化 HTTP 请求的 x-ddpaas-signature Header
 */
function verifyAitableSignature(req, res, next) {
  const { enabled, apiSecret } = config.intakeAitable;

  if (!enabled) {
    return res.status(503).json({ success: false, message: 'AI 表格事项收集未启用' });
  }
  if (!apiSecret) {
    return res.status(503).json({ success: false, message: '未配置 INTAKE_AITABLE_API_SECRET' });
  }

  const timestamp = req.headers['x-ddpaas-signature-timestamp'];
  const signature = req.headers['x-ddpaas-signature'];

  if (!timestamp || !signature) {
    return res.status(401).json({ success: false, message: '缺少签名 Header' });
  }

  const expected = calcAitableSignature(apiSecret, timestamp);
  const sigBuf = Buffer.from(String(signature));
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ success: false, message: '签名验证失败' });
  }

  next();
}

module.exports = {
  verifyAitableSignature,
  calcAitableSignature,
};
