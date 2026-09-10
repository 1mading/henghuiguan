/**
 * 创建/重置第三方与应用 MySQL 账号，并写入 data/mysql-third-party.local.txt
 * 需要可用的管理员连接（默认 root 空密码，或环境变量 MYSQL_ADMIN_*）
 *
 *   node scripts/setup-mysql-users.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const config = require('../src/config');

function genPass(len = 20) {
  return crypto.randomBytes(24).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, len);
}

async function main() {
  const admin = {
    host: process.env.MYSQL_ADMIN_HOST || config.mysql.host || '127.0.0.1',
    port: parseInt(process.env.MYSQL_ADMIN_PORT || String(config.mysql.port || 3306), 10),
    user: process.env.MYSQL_ADMIN_USER || 'root',
    password: process.env.MYSQL_ADMIN_PASSWORD != null
      ? String(process.env.MYSQL_ADMIN_PASSWORD)
      : '',
    multipleStatements: true,
  };

  const appPass = genPass();
  const roPass = genPass();
  const db = config.mysql.database || 'henghuiguan';

  const conn = await mysql.createConnection(admin);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    for (const host of ['%', 'localhost']) {
      const appUser = `'hhg_app'@'${host}'`;
      const roUser = `'hhg_readonly'@'${host}'`;
      await conn.query(`CREATE USER IF NOT EXISTS ${appUser} IDENTIFIED BY ?`, [appPass]);
      await conn.query(`ALTER USER ${appUser} IDENTIFIED BY ?`, [appPass]);
      await conn.query(`CREATE USER IF NOT EXISTS ${roUser} IDENTIFIED BY ?`, [roPass]);
      await conn.query(`ALTER USER ${roUser} IDENTIFIED BY ?`, [roPass]);
      await conn.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON \`${db}\`.* TO ${appUser}`
      );
      await conn.query(`GRANT SELECT ON \`${db}\`.* TO ${roUser}`);
    }
    await conn.query('FLUSH PRIVILEGES');
  } finally {
    await conn.end();
  }

  const outDir = path.join(__dirname, '../data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'mysql-third-party.local.txt');
  const text = `# 本地机密，勿提交 Git
# 生成时间: ${new Date().toISOString()}

[应用读写 hhg_app]
host=${admin.host}
port=${admin.port}
database=${db}
user=hhg_app
password=${appPass}

[第三方只读 hhg_readonly]
host=${admin.host}
port=${admin.port}
database=${db}
user=hhg_readonly
password=${roPass}

JDBC(只读)=jdbc:mysql://${admin.host}:${admin.port}/${db}?useSSL=false&characterEncoding=utf8
`;
  fs.writeFileSync(outFile, text, 'utf8');
  console.log('已写入', outFile);
  console.log('请将 .env 中 MYSQL_USER=hhg_app、MYSQL_PASSWORD=（见该文件）后重启服务');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
