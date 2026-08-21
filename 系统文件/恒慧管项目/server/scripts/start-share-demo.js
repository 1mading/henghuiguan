/**
 * 分享演示一键启动（换电脑可用）
 * - 不依赖正式库 / 正式 .env
 * - 缺依赖时自动 npm install
 * - SHARE_DEMO=1：允许本地预演登录
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

const serverRoot = path.join(__dirname, '..');
const port = String(process.env.SHARE_DEMO_PORT || process.env.PORT || '3001');

function log(msg) {
  console.log(msg);
}

function canListen(portNum) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(portNum, '0.0.0.0');
  });
}

function ensureDependencies() {
  const marker = path.join(serverRoot, 'node_modules', 'express');
  if (fs.existsSync(marker)) return true;

  log('[deps] node_modules 缺失，正在 npm install …');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npmCmd, ['install', '--omit=dev'], {
    cwd: serverRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (r.status !== 0) {
    log('[ERROR] npm install 失败。请在本机安装 Node.js 18+ 后重试：');
    log('  https://nodejs.org/');
    return false;
  }
  return fs.existsSync(marker);
}

async function main() {
  process.chdir(serverRoot);

  log('');
  log('  HengHuiGuan Share Demo');
  log('  ======================');
  log('  Portable demo (other PCs OK)');
  log('  Team: 信息中心 only (财务中心 = contacts)');
  log('  Port ' + port);
  log('');

  if (!ensureDependencies()) process.exit(1);

  // 演示环境变量（dotenv 不会覆盖已有值；此处主动覆盖生产 .env 的关键项）
  process.env.PORT = port;
  process.env.DB_PATH = './data/henghuiguan-share-demo.json';
  process.env.ALLOW_DEMO_LOGIN = 'false';
  process.env.LOCAL_AS_SERVER = 'true';
  process.env.INTAKE_AITABLE_ENABLED = 'true';
  process.env.INTAKE_AITABLE_ASSIGNEE_NAME = process.env.INTAKE_AITABLE_ASSIGNEE_NAME || '王元斌 Martin';
  if (!process.env.INTAKE_AITABLE_API_SECRET) {
    process.env.INTAKE_AITABLE_API_SECRET = 'share-demo-intake-secret';
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 8) {
    process.env.JWT_SECRET = 'share-demo-jwt-not-for-production';
  }
  process.env.SHARE_DEMO_BASE_URL = `http://localhost:${port}`;
  process.env.PUBLIC_BASE_URL = `http://localhost:${port}`;
  process.env.SHARE_DEMO = '1';
  // 换电脑无钉钉密钥时，不强制走生产钉钉（演示库自包含）
  if (!process.env.SHARE_DEMO_KEEP_DINGTALK) {
    // 保留已有 DINGTALK_* 亦可；未配置时 auth 靠 SHARE_DEMO=1 放行
  }

  log('[1/3] Prepare demo data...');
  require('./prepare-share-demo.js').main();

  log('');
  log('[2/3] Check port ' + port + '...');
  const free = await canListen(Number(port));
  if (!free) {
    log('[ERROR] Port ' + port + ' is in use.');
    log('Close that process, or set SHARE_DEMO_PORT=3002');
    process.exit(1);
  }

  log('');
  log('[3/3] Starting server...');
  log('--------------------------------');
  log(' Open: http://localhost:' + port + '/app');
  log(' Click: 本地预演：进入工作台');
  log(' Team: 信息中心 members only');
  log(' Finance center: contacts for form intake only');
  log(' Simulate intake:');
  log('   node scripts/simulate-aitable-intake.js');
  log('--------------------------------');
  log('');

  const opener = spawn(process.execPath, [path.join(__dirname, 'open-share-demo.js')], {
    cwd: serverRoot,
    env: process.env,
    detached: true,
    stdio: 'ignore',
  });
  opener.unref();

  require('../src/index.js');
}

main().catch((e) => {
  console.error('[ERROR]', e && e.message ? e.message : e);
  process.exit(1);
});
