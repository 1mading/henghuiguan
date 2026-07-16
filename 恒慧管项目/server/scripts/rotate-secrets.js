/**
 * 生成 JWT_SECRET / API_KEY 并写入 .env（仅替换仍为开发默认值的项）
 */
const fs = require('fs');
const path = require('path');
const { generateSecret, WEAK_JWT, WEAK_API_KEY } = require('../src/utils/startupCheck');

const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.error('.env 不存在，请先复制 .env.example');
  process.exit(1);
}

let text = fs.readFileSync(envPath, 'utf8');
const updates = [];

function upsert(key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) {
    text = text.replace(re, `${key}=${value}`);
  } else {
    text += `\n${key}=${value}`;
  }
  updates.push(key);
}

if (/^JWT_SECRET=henghuiguan-dev-secret-change-me\s*$/m.test(text) || /^JWT_SECRET=\s*$/m.test(text)) {
  upsert('JWT_SECRET', generateSecret(32));
}
if (/^API_KEY=henghuiguan-dev-key\s*$/m.test(text) || /^API_KEY=\s*$/m.test(text)) {
  upsert('API_KEY', generateSecret(24));
}
if (!/^NODE_ENV=/m.test(text)) {
  upsert('NODE_ENV', 'production');
} else if (/^NODE_ENV=development\s*$/m.test(text)) {
  upsert('NODE_ENV', 'production');
}
if (!/^CORS_ORIGINS=/m.test(text)) {
  upsert('CORS_ORIGINS', 'https://henghuiguan.handagroup.com');
}

fs.writeFileSync(envPath, text, 'utf8');
console.log('已更新:', updates.join(', ') || '（无需更换，密钥已是正式值）');
