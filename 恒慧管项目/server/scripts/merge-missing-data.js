#!/usr/bin/env node
/**
 * 将 project-task-seed.json 中缺失的项目/任务合并进 live 数据库
 * 用法：node server/scripts/merge-missing-data.js [--seed path] [--dry-run]
 */
const path = require('path');
const {
  getDb,
  persistStore,
  getAllProjects,
  getAllTasks,
} = require('../src/db/database');
const {
  mergeSeedIntoStore,
  loadSeedFile,
  getDefaultSeedPath,
} = require('../src/utils/mergeSeedData');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const seedIdx = args.indexOf('--seed');
const seedPath = seedIdx >= 0 ? path.resolve(args[seedIdx + 1]) : getDefaultSeedPath();

const store = getDb();
const beforeP = getAllProjects().length;
const beforeT = getAllTasks().length;

const seed = loadSeedFile(seedPath);
const result = mergeSeedIntoStore(store, seed);

console.log('种子文件:', seedPath);
console.log('合并前:', beforeP, '项目,', beforeT, '任务');
console.log('新增:', result.addedProjects, '项目,', result.addedTasks, '任务');
console.log('合并后:', result.afterProjects, '项目,', result.afterTasks, '任务');
if (result.missingProjectNames.length) {
  console.log('补入项目:', result.missingProjectNames.join('、'));
}

if (dryRun) {
  console.log('(dry-run，未写入磁盘)');
  process.exit(0);
}

if (result.addedProjects || result.addedTasks) {
  const config = require('../src/config');
  persistStore();
  console.log('✓ 已写入', config.dbPath);
} else {
  console.log('无需补全，数据已完整');
}
