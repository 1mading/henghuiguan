const crypto = require('crypto');
const config = require('../config');

const WEAK_JWT = 'henghuiguan-dev-secret-change-me';
const WEAK_API_KEY = 'henghuiguan-dev-key';

function validateProductionConfig() {
  const warnings = [];
  const errors = [];

  if (config.isProduction) {
    if (config.jwtSecret === WEAK_JWT) {
      errors.push('JWT_SECRET 仍为开发默认值，正式环境必须更换');
    }
    if (config.apiKey === WEAK_API_KEY || !config.apiKey) {
      warnings.push('API_KEY 建议更换为随机强密钥');
    }
    if (config.allowDemoLogin) {
      warnings.push('ALLOW_DEMO_LOGIN=true，正式环境建议设为 false');
    }
    if (!config.publicBaseUrl) {
      warnings.push('未配置 PUBLIC_BASE_URL，工作通知跳转链接可能不完整');
    }
    if (!config.dingtalk.appSecret) {
      errors.push('钉钉 AppSecret 未配置，无法登录和推送');
    }
  }

  for (const msg of warnings) console.warn('[startup]', msg);
  for (const msg of errors) console.error('[startup]', msg);

  if (config.isProduction && errors.length) {
    console.error('[startup] 正式环境配置不完整，请检查 server/.env');
  }

  return { warnings, errors };
}

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { validateProductionConfig, generateSecret, WEAK_JWT, WEAK_API_KEY };
