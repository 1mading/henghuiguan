/**
 * 供 database.js 同步调用的 MySQL 读写子进程。
 * 用法:
 *   node mysqlStoreWorker.js load <outJsonPath>
 *   node mysqlStoreWorker.js save <inJsonPath>
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const { loadPayload, savePayload, closePool, ensureSchema } = require('./mysqlStore');

async function main() {
  const cmd = process.argv[2];
  const file = process.argv[3];
  if (!cmd || !file) {
    console.error('usage: mysqlStoreWorker.js load|save <file>');
    process.exit(2);
  }
  await ensureSchema();
  if (cmd === 'load') {
    const data = await loadPayload();
    fs.writeFileSync(file, data == null ? 'null' : JSON.stringify(data), 'utf8');
  } else if (cmd === 'save') {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    await savePayload(data);
  } else {
    console.error('unknown cmd:', cmd);
    process.exit(2);
  }
  await closePool();
}

main().catch((e) => {
  console.error('[mysqlStoreWorker]', e.message || e);
  process.exit(1);
});
