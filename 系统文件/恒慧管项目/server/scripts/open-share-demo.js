/**
 * 等待分享演示服务就绪后打开页面：
 * 1) 无参页 → 「钉钉登录」引导
 * 2) 带 userid → 本地预览工作台内容（模拟工作台免登）
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const port = process.env.PORT || '3001';
const dbPath = path.join(__dirname, '../data/henghuiguan-share-demo.json');
const base = `http://localhost:${port}/app`;
const health = `http://127.0.0.1:${port}/api/health`;

function openUrl(url) {
  const cmd = process.platform === 'win32'
    ? `cmd /c start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

async function waitReady(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(health, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch (_) { /* retry */ }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  const ok = await waitReady();
  if (!ok) {
    console.warn('[share-demo] 等待服务超时，仍尝试打开页面');
  }

  openUrl(base);

  let userid = '';
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const presenter = (db.users || []).find(u =>
      u.name === '王元斌 Martin' || (u.name && String(u.name).includes('王元斌'))
    );
    userid = presenter?.dingTalkUserId || '';
  } catch (_) { /* ignore */ }

  if (userid && !String(userid).startsWith('demo_')) {
    setTimeout(() => {
      openUrl(`${base}?userid=${encodeURIComponent(userid)}`);
      console.log('[share-demo] 已打开：钉钉引导页 + 业务预览页');
    }, 800);
  } else {
    console.log('[share-demo] 已打开钉钉引导页（无可用 userid）');
  }
}

main().catch((e) => {
  console.warn('[share-demo]', e.message || e);
});
