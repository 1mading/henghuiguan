const fs = require('fs');
const path = require('path');
const {
  getDb,
  persistStore,
  findUserById,
  upsertUser,
} = require('../db/database');
const { compareVersion, sortUpdatesByVersion, getLatestVersion } = require('../utils/versionCompare');

const RELEASES_DIR = path.join(__dirname, '../../releases');

function getAllSystemUpdates() {
  const list = getDb().systemUpdates || [];
  return sortUpdatesByVersion(list).reverse();
}

function getPendingUpdatesForUser(user) {
  const updates = getDb().systemUpdates || [];
  const latest = getLatestVersion(updates);
  const seen = user?.lastSeenSystemVersion;

  if (!seen) {
    if (latest) {
      upsertUser({ ...user, lastSeenSystemVersion: latest });
    }
    return { pending: [], initialized: true, latestVersion: latest };
  }

  const pending = sortUpdatesByVersion(
    updates.filter(u => compareVersion(u.version, seen) > 0)
  );
  return { pending, initialized: false, latestVersion: latest };
}

function markUpdatesRead(userId, version) {
  const user = findUserById(userId);
  if (!user) throw new Error('用户不存在');

  const updates = getDb().systemUpdates || [];
  const target = version || getLatestVersion(updates);
  if (!target) {
    return { lastSeenSystemVersion: user.lastSeenSystemVersion || null };
  }

  const exists = updates.some(u => u.version === target);
  if (!exists) throw new Error('版本不存在');

  const nextVersion = !user.lastSeenSystemVersion || compareVersion(target, user.lastSeenSystemVersion) > 0
    ? target
    : user.lastSeenSystemVersion;

  upsertUser({ ...user, lastSeenSystemVersion: nextVersion });
  return { lastSeenSystemVersion: nextVersion };
}

function mergeReleaseFile(entry) {
  if (!entry?.version) return false;
  const s = getDb();
  if (!Array.isArray(s.systemUpdates)) s.systemUpdates = [];

  const idx = s.systemUpdates.findIndex(u => u.version === entry.version);
  const normalized = {
    id: entry.id || `SU-${entry.version.replace(/\./g, '')}`,
    version: entry.version,
    title: entry.title || `v${entry.version} 更新`,
    releaseDate: entry.releaseDate || new Date().toISOString().slice(0, 10),
    summary: entry.summary || '',
    items: Array.isArray(entry.items) ? entry.items : [],
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  if (idx >= 0) {
    s.systemUpdates[idx] = { ...s.systemUpdates[idx], ...normalized };
  } else {
    s.systemUpdates.push(normalized);
  }
  persistStore();
  return true;
}

/** 启动时合并 server/releases/*.json 到数据库（只增/覆盖同版本，不删除） */
function mergeReleasesFromDisk() {
  if (!fs.existsSync(RELEASES_DIR)) return 0;
  const files = fs.readdirSync(RELEASES_DIR).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(RELEASES_DIR, file), 'utf8'));
      if (mergeReleaseFile(raw)) count++;
    } catch (e) {
      console.warn('[systemUpdates] 跳过无效发布文件:', file, e.message);
    }
  }
  return count;
}

function appendRelease(entry) {
  if (!entry?.version) throw new Error('缺少 version');
  mergeReleaseFile({
    ...entry,
    id: entry.id || `SU-${String(entry.version).replace(/\./g, '')}`,
    createdAt: entry.createdAt || new Date().toISOString(),
  });
  return getAllSystemUpdates();
}

module.exports = {
  getAllSystemUpdates,
  getPendingUpdatesForUser,
  markUpdatesRead,
  mergeReleasesFromDisk,
  appendRelease,
  RELEASES_DIR,
};
