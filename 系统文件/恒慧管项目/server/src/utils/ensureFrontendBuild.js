/**
 * built 模式下：若 frontend/src 新于 dist，启动时自动 npm run build，
 * 避免「改了源码但页面仍是旧包」反复踩坑。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function walkNewestMtimeMs(dir, acc = { mtime: 0 }) {
  if (!dir || !fs.existsSync(dir)) return acc.mtime;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc.mtime;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkNewestMtimeMs(full, acc);
      continue;
    }
    try {
      const t = fs.statSync(full).mtimeMs;
      if (t > acc.mtime) acc.mtime = t;
    } catch {
      /* ignore */
    }
  }
  return acc.mtime;
}

function resolveFrontendRoot(config) {
  if (config.frontendDist) {
    return path.resolve(config.frontendDist, '..');
  }
  return path.resolve(__dirname, '../../../frontend');
}

function shouldAutoBuild(config) {
  const raw = process.env.HHG_AUTO_BUILD;
  if (raw != null && String(raw).trim() !== '') {
    const v = String(raw).trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }
  // 默认：built 且非严格生产（或本机当服务器）时自动构建
  if (config.frontendMode !== 'built') return false;
  if (config.localAsServer) return true;
  return config.nodeEnv !== 'production';
}

/**
 * @returns {{ ok: boolean, built?: boolean, skipped?: boolean, reason?: string }}
 */
function ensureFrontendBuild(config) {
  if (config.frontendMode !== 'built') {
    return { ok: true, skipped: true, reason: 'legacy' };
  }
  if (!shouldAutoBuild(config)) {
    return { ok: true, skipped: true, reason: 'HHG_AUTO_BUILD off' };
  }

  const frontendRoot = resolveFrontendRoot(config);
  const srcDir = path.join(frontendRoot, 'src');
  const distIndex = path.join(config.frontendDist, 'index.html');
  const pkgJson = path.join(frontendRoot, 'package.json');

  if (!fs.existsSync(pkgJson) || !fs.existsSync(srcDir)) {
    console.warn('[frontend] 未找到 frontend 工程，跳过自动构建:', frontendRoot);
    return { ok: true, skipped: true, reason: 'no-frontend' };
  }

  const srcNewest = Math.max(
    walkNewestMtimeMs(srcDir),
    walkNewestMtimeMs(path.join(frontendRoot, 'public')),
    fs.existsSync(path.join(frontendRoot, 'vite.config.js'))
      ? fs.statSync(path.join(frontendRoot, 'vite.config.js')).mtimeMs
      : 0,
    fs.existsSync(path.join(frontendRoot, 'index.html'))
      ? fs.statSync(path.join(frontendRoot, 'index.html')).mtimeMs
      : 0,
  );
  const distMtime = fs.existsSync(distIndex) ? fs.statSync(distIndex).mtimeMs : 0;

  if (distMtime > 0 && srcNewest <= distMtime + 500) {
    console.log('[frontend] dist 已是最新（相对 src）');
    return { ok: true, skipped: true, reason: 'fresh' };
  }

  console.log('[frontend] 源码新于 dist，自动执行 npm run build …');
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: frontendRoot,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error('[frontend] 自动构建失败，仍将尝试发放现有 dist（若存在）');
    return { ok: false, built: false, reason: 'build-failed' };
  }

  console.log('[frontend] 自动构建完成 →', config.frontendDist);
  return { ok: true, built: true };
}

module.exports = {
  ensureFrontendBuild,
  shouldAutoBuild,
  resolveFrontendRoot,
};
