/**
 * 将本地 henghuiguan.json 导入 MySQL app_store（方案 A）
 * 用法（在 server 目录）:
 *   node scripts/migrate-json-to-mysql.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { ensureSchema, savePayload, loadPayload, closePool } = require('../src/db/mysqlStore');

async function main() {
  const jsonPath = config.dbPath;
  if (!fs.existsSync(jsonPath)) {
    console.error('JSON 文件不存在:', jsonPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  console.log('读取', jsonPath);
  console.log('统计: users=%s projects=%s tasks=%s',
    (data.users || []).length,
    (data.projects || []).length,
    (data.tasks || []).length
  );

  await ensureSchema();
  await savePayload(data);
  const verify = await loadPayload();
  if (!verify) {
    console.error('导入后读取为空');
    process.exit(1);
  }
  console.log('已写入 MySQL %s.%s (app_store)', config.mysql.host, config.mysql.database);
  console.log('校验: users=%s projects=%s tasks=%s bytes≈%s',
    (verify.users || []).length,
    (verify.projects || []).length,
    (verify.tasks || []).length,
    Buffer.byteLength(JSON.stringify(verify), 'utf8')
  );
  await closePool();
}

main().catch(async (e) => {
  console.error(e);
  try { await closePool(); } catch { /* ignore */ }
  process.exit(1);
});
