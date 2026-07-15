#!/usr/bin/env node
/**
 * 将已有任务附件补同步到所属项目的 documents（幂等，可重复执行）
 * 用法：node server/scripts/sync-task-attachments-to-projects.js [--dry-run]
 */
const {
  getDb,
  persistStore,
} = require('../src/db/database');
const { backfillTaskAttachmentsToProjectDocuments } = require('../src/utils/projectDocuments');

const dryRun = process.argv.includes('--dry-run');
const store = getDb();
const result = backfillTaskAttachmentsToProjectDocuments(store);

console.log('任务附件 → 项目文档 补同步');
console.log('新增同步:', result.synced);
console.log('已存在跳过:', result.skipped);
console.log('涉及项目:', result.projectsTouched);
if (result.samples.length) {
  console.log('示例:');
  result.samples.forEach(s => {
    console.log(`  - [${s.projectName}] ${s.taskId} · ${s.attachmentName}`);
  });
}

if (dryRun) {
  console.log('(dry-run，未写入磁盘)');
  process.exit(0);
}

if (result.synced > 0) {
  const config = require('../src/config');
  persistStore();
  console.log('✓ 已写入', config.dbPath);
} else {
  console.log('无需写入，数据已同步');
}
