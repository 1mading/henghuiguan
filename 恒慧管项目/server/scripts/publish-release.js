#!/usr/bin/env node
/**
 * 发布系统更新记录
 *
 * 从待发确认发版（推荐）:
 *   node scripts/publish-release.js
 *   node scripts/publish-release.js --pending --bump patch|minor|major
 *   node scripts/publish-release.js --pending --title "标题" --summary "摘要"
 *   node scripts/publish-release.js 1.2.0 --title "标题"
 *
 * 直接发布已有版本文件:
 *   node scripts/publish-release.js 1.1.0
 *   node scripts/publish-release.js path/to/file.json
 */
const fs = require('fs');
const path = require('path');
const {
  mergeReleasesFromDisk,
  appendRelease,
  getAllSystemUpdates,
  RELEASES_DIR,
} = require('../src/services/systemUpdates');
const { compareVersion, getLatestVersion } = require('../src/utils/versionCompare');

const PENDING_FILE = path.join(RELEASES_DIR, '_pending.json');

function parseArgs(argv) {
  const out = {
    pending: false,
    bump: 'patch',
    title: '',
    summary: '',
    version: '',
    file: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pending') {
      out.pending = true;
    } else if (a === '--bump' && argv[i + 1]) {
      out.bump = argv[++i];
    } else if (a.startsWith('--bump=')) {
      out.bump = a.slice('--bump='.length);
    } else if (a === '--title' && argv[i + 1]) {
      out.title = argv[++i];
    } else if (a.startsWith('--title=')) {
      out.title = a.slice('--title='.length);
    } else if (a === '--summary' && argv[i + 1]) {
      out.summary = argv[++i];
    } else if (a.startsWith('--summary=')) {
      out.summary = a.slice('--summary='.length);
    } else if (a.endsWith('.json')) {
      out.file = a;
    } else if (!a.startsWith('--')) {
      out.version = a;
    }
  }
  // 无位置参数且未指定文件时，默认从 pending 发版
  if (!out.file && !out.version) {
    out.pending = true;
  }
  return out;
}

function readPending() {
  if (!fs.existsSync(PENDING_FILE)) {
    return { items: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

function clearPending() {
  fs.writeFileSync(PENDING_FILE, `${JSON.stringify({ items: [] }, null, 2)}\n`, 'utf8');
}

function listReleaseVersionsOnDisk() {
  if (!fs.existsSync(RELEASES_DIR)) return [];
  return fs
    .readdirSync(RELEASES_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => f.replace(/\.json$/, ''));
}

function resolveLatestVersion() {
  const fromDb = getLatestVersion(getAllSystemUpdates());
  const fromDisk = listReleaseVersionsOnDisk().sort(compareVersion);
  const diskLatest = fromDisk.length ? fromDisk[fromDisk.length - 1] : null;
  if (fromDb && diskLatest) {
    return compareVersion(fromDb, diskLatest) >= 0 ? fromDb : diskLatest;
  }
  return fromDb || diskLatest || '0.0.0';
}

function bumpVersion(version, bump) {
  const parts = String(version || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  const [major, minor, patch] = parts;
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function loadEntryFromFileOrVersion(opts) {
  if (opts.file) {
    const file = path.isAbsolute(opts.file) ? opts.file : path.join(process.cwd(), opts.file);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const byVersion = path.join(RELEASES_DIR, `${opts.version}.json`);
  if (fs.existsSync(byVersion)) {
    return JSON.parse(fs.readFileSync(byVersion, 'utf8'));
  }
  return {
    version: opts.version,
    title: opts.title || `v${opts.version} 更新`,
    releaseDate: new Date().toISOString().slice(0, 10),
    summary: opts.summary || '',
    items: [],
  };
}

function buildEntryFromPending(opts) {
  const pending = readPending();
  if (!pending.items.length) {
    console.error('待发列表为空，请先用 record-change 记录变更，或指定已有版本文件');
    process.exit(1);
  }

  if (!['patch', 'minor', 'major'].includes(opts.bump)) {
    console.error(`--bump 须为 patch / minor / major，收到: ${opts.bump}`);
    process.exit(1);
  }

  const version = opts.version || bumpVersion(resolveLatestVersion(), opts.bump);
  const items = pending.items.map(({ type, text }) => ({
    type: type || 'improve',
    text: text || '',
  }));

  const title = opts.title || `v${version} 更新`;
  const summary =
    opts.summary ||
    items
      .slice(0, 3)
      .map(i => i.text)
      .filter(Boolean)
      .join('；') ||
    `发布 ${items.length} 项变更`;

  return {
    version,
    title,
    releaseDate: new Date().toISOString().slice(0, 10),
    summary,
    items,
    createdAt: new Date().toISOString(),
  };
}

const opts = parseArgs(process.argv.slice(2));
let entry;
let fromPending = false;

if (opts.pending && !opts.file) {
  // 指定了 version 但仍走 pending：用指定版本号打包 pending 内容
  entry = buildEntryFromPending(opts);
  fromPending = true;
} else {
  entry = loadEntryFromFileOrVersion(opts);
  if (opts.title) entry.title = opts.title;
  if (opts.summary) entry.summary = opts.summary;
}

const outFile = path.join(RELEASES_DIR, `${entry.version}.json`);
fs.writeFileSync(outFile, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');

appendRelease(entry);
mergeReleasesFromDisk();

if (fromPending) {
  clearPending();
}

console.log(`已发布系统更新 v${entry.version}`);
console.log(`已写入 ${outFile}`);
if (fromPending) console.log('已清空待发列表 _pending.json');
console.log('当前记录:', getAllSystemUpdates().map(u => u.version).join(', '));
