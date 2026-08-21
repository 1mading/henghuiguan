/**
 * 模拟钉钉 AI 表格表单提报 → 恒慧管临时任务（进工作台「我的待办」）
 *
 * 需先启动分享演示服务。默认打本机：
 *   node scripts/simulate-aitable-intake.js
 *   node scripts/simulate-aitable-intake.js "现场演示：发票查重失败"
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');

const baseUrl = (process.env.SHARE_DEMO_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3001')
  .replace(/\/+$/, '');
const secret = (process.env.INTAKE_AITABLE_API_SECRET || process.env.SHARE_DEMO_INTAKE_SECRET || 'share-demo-intake-secret').trim();
const title = process.argv[2] || `【演示】钉钉表单提报 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;

function calcSignature(apiSecret, timestamp) {
  return crypto.createHmac('sha256', apiSecret).update(String(timestamp)).digest('base64');
}

async function main() {
  const ts = String(Date.now());
  const signature = calcSignature(secret, ts);
  const recordId = `share-demo-${Date.now()}`;
  const body = {
    recordId,
    title,
    system: 'NCC',
    desc: '由 simulate-aitable-intake.js 模拟钉钉 AI 表格提交，用于分享演示。',
    priority: '重要',
    submitterName: '演示财务联系人',
    submittedAt: new Date().toISOString(),
  };

  const url = `${baseUrl}/api/intake/aitable`;
  console.log('[intake-demo] POST', url);
  console.log('[intake-demo] title:', title);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ddpaas-signature-timestamp': ts,
      'x-ddpaas-signature': signature,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('[intake-demo] 非 JSON 响应:', text.slice(0, 300));
    process.exit(1);
  }

  if (!res.ok || !data.success) {
    console.error('[intake-demo] 失败:', res.status, data);
    console.error('提示: 确认已启动分享演示，且 INTAKE_AITABLE_ENABLED=true、API Secret 与脚本一致。');
    process.exit(1);
  }

  console.log('[intake-demo] 成功 → 任务已进工作台待办');
  console.log(JSON.stringify(data, null, 2));
  console.log('请用钉钉登录后打开工作台，查看带「表单提报」标签的新待办。');
}

main().catch((e) => {
  console.error('[intake-demo]', e.message || e);
  process.exit(1);
});
