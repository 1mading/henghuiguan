const fs = require('fs');
const path = require('path');

const MAX_BACKUPS = 30;

/**
 * 写入数据前备份 JSON 到 data/backups/
 */
function backupJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const dir = path.join(path.dirname(filePath), 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const base = path.basename(filePath, path.extname(filePath));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, `${base}-${stamp}.json`);
    fs.copyFileSync(filePath, dest);

    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(base + '-') && f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of files.slice(MAX_BACKUPS)) {
      try { fs.unlinkSync(path.join(dir, old.name)); } catch { /* ignore */ }
    }
    return true;
  } catch (e) {
    console.warn('[backup] 备份失败:', e.message);
    return false;
  }
}

module.exports = { backupJsonFile };
