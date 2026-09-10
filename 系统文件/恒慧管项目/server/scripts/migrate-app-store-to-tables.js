/**
 * 方案 B：将 app_store.payload（或本地 JSON）拆入分表
 * 用法（在 server 目录）:
 *   node scripts/migrate-app-store-to-tables.js
 *   node scripts/migrate-app-store-to-tables.js --from-json
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const config = require('../src/config');
const {
  ensureSchema,
  savePayload,
  loadPayload,
  closePool,
  getPool,
  COLLECTIONS,
} = require('../src/db/mysqlStore');

async function loadSource(fromJson) {
  if (fromJson) {
    const jsonPath = config.dbPath;
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON 不存在: ${jsonPath}`);
    }
    console.log('来源: JSON', jsonPath);
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }

  const p = await getPool();
  const [rows] = await p.query('SELECT payload FROM app_store WHERE id = 1 LIMIT 1');
  if (!rows.length || !rows[0].payload) {
    console.warn('app_store 无数据，回退本地 JSON');
    const jsonPath = config.dbPath;
    if (!fs.existsSync(jsonPath)) {
      throw new Error('app_store 与 JSON 均无数据');
    }
    console.log('来源: JSON', jsonPath);
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  console.log('来源: MySQL app_store');
  const raw = rows[0].payload;
  return typeof raw === 'object' ? raw : JSON.parse(String(raw));
}

function summarize(store) {
  const lines = [];
  for (const col of COLLECTIONS) {
    if (col.kind === 'meta') {
      lines.push(`  ${col.storeKey}: ${store[col.storeKey] == null ? 'null' : 'object'}`);
    } else {
      lines.push(`  ${col.storeKey}: ${(store[col.storeKey] || []).length}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const fromJson = process.argv.includes('--from-json');
  await ensureSchema();
  const data = await loadSource(fromJson);
  console.log('拆分前统计:\n' + summarize(data));

  await savePayload(data);

  const verify = await loadPayload();
  if (!verify) {
    throw new Error('拆分后 loadPayload 为空');
  }
  console.log('拆分后校验:\n' + summarize(verify));

  const p = await getPool();
  const [tables] = await p.query(
    `SELECT table_name AS t, table_rows AS approx_rows
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name IN (${COLLECTIONS.map(() => '?').join(',')}, 'app_meta')
     ORDER BY table_name`,
    [config.mysql.database, ...new Set(COLLECTIONS.map(c => c.table))]
  );
  console.log('information_schema 行数约值:', tables);

  console.log('完成。app_store 已保留作备份；业务读写走分表。');
  await closePool();
}

main().catch(async (e) => {
  console.error(e);
  try { await closePool(); } catch { /* ignore */ }
  process.exit(1);
});
