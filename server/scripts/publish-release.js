#!/usr/bin/env node
/**
 * 发布系统更新记录：node scripts/publish-release.js [version]
 * 若未指定 version，使用 server/releases/ 下最新 json 或指定文件路径
 */
const fs = require('fs');
const path = require('path');
const { mergeReleasesFromDisk, appendRelease, RELEASES_DIR } = require('../src/services/systemUpdates');
const { getAllSystemUpdates } = require('../src/services/systemUpdates');

const arg = process.argv[2];

function loadEntry() {
  if (!arg) {
    const files = fs.readdirSync(RELEASES_DIR).filter(f => f.endsWith('.json')).sort();
    if (!files.length) {
      console.error('releases 目录下没有 json 文件');
      process.exit(1);
    }
    const latest = files[files.length - 1];
    return JSON.parse(fs.readFileSync(path.join(RELEASES_DIR, latest), 'utf8'));
  }
  if (arg.endsWith('.json')) {
    const file = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const byVersion = path.join(RELEASES_DIR, `${arg}.json`);
  if (fs.existsSync(byVersion)) {
    return JSON.parse(fs.readFileSync(byVersion, 'utf8'));
  }
  return { version: arg, title: `v${arg} 更新`, releaseDate: new Date().toISOString().slice(0, 10), items: [] };
}

const entry = loadEntry();
appendRelease(entry);
mergeReleasesFromDisk();
console.log(`已发布系统更新 v${entry.version}`);
console.log('当前记录:', getAllSystemUpdates().map(u => u.version).join(', '));
