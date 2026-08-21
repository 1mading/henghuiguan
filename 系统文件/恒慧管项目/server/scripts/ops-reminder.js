#!/usr/bin/env node
/**
 * 手动触发运维提醒（不校验时刻，便于测试）：
 *   npm run ops-reminder
 *   npm run ops-reminder -- --dry
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { runOpsReminder, readPendingItems, inspectGit } = require('../src/services/opsReminder');
const path = require('path');
const fs = require('fs');

function findGitRoot() {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const pending = readPendingItems();
  const git = inspectGit(findGitRoot());

  console.log('待发版条数:', pending.length);
  console.log(
    'Git:',
    git.ok ? `dirty=${git.dirty}, ahead=${git.ahead}` : `检查失败: ${git.reason}`
  );

  if (dry) {
    console.log('(--dry) 未发送');
    return;
  }

  const result = await runOpsReminder({ force: true });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
