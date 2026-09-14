/**
 * 方案 B：按模块分表读写整库对象
 * 对外仍由 database.js 的 getStore / persistStore 调用。
 */
const mysql = require('mysql2/promise');
const config = require('../config');
const {
  COLLECTIONS,
  ENTITY_TABLES,
  ensureEntityId,
  parseDataColumn,
  toJsonParam,
  extractUserCols,
  extractProjectCols,
  extractTaskCols,
} = require('./mysqlCollections');

let pool = null;
let schemaReady = false;

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(128) NULL,
    dingTalkUserId VARCHAR(128) NULL,
    role VARCHAR(64) NULL,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_users_name (name),
    KEY idx_users_ding (dingTalkUserId),
    KEY idx_users_role (role)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NULL,
    status VARCHAR(64) NULL,
    manager VARCHAR(128) NULL,
    archived TINYINT(1) NOT NULL DEFAULT 0,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_projects_status (status),
    KEY idx_projects_manager (manager),
    KEY idx_projects_archived (archived)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    title VARCHAR(512) NULL,
    status VARCHAR(64) NULL,
    assignee VARCHAR(128) NULL,
    projectId VARCHAR(64) NULL,
    progress INT NULL,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_tasks_status (status),
    KEY idx_tasks_assignee (assignee),
    KEY idx_tasks_project (projectId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS task_dependencies (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS change_logs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS transfer_logs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS push_logs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS system_updates (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS performance_templates (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS performance_cycles (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS performance_assessments (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS work_reports (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS kpi_plans (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS staff_dept_catalog (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS issues (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS project_templates (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    \`key\` VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_store (
    id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
    payload LONGTEXT NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

function mysqlCfg() {
  return {
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
  };
}

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(mysqlCfg());
  }
  return pool;
}

async function ensureSchema() {
  if (schemaReady) return;
  const p = await getPool();
  for (const stmt of CREATE_STATEMENTS) {
    await p.query(stmt);
  }
  schemaReady = true;
}

async function loadEntityTable(conn, table) {
  const [rows] = await conn.query(`SELECT id, data FROM \`${table}\``);
  return rows.map(r => {
    const data = parseDataColumn(r.data) || {};
    if (!data.id) data.id = r.id;
    return data;
  });
}

/**
 * @returns {Promise<object|null>}
 */
async function loadPayload() {
  await ensureSchema();
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    const store = {
      users: [],
      projects: [],
      tasks: [],
      taskDependencies: [],
      changeLogs: [],
      transferLogs: [],
      pushLogs: [],
      notifications: [],
      workCalendar: null,
      rolePermissions: null,
      llmSettings: null,
      systemUpdates: [],
      performanceTemplates: [],
      performanceCycles: [],
      performanceAssessments: [],
      workReports: [],
      kpiPlans: [],
      staffDeptCatalog: [],
      apiKeys: [],
      issues: [],
      projectTemplates: [],
    };

    let anyRow = false;
    for (const col of COLLECTIONS) {
      if (col.kind === 'meta') {
        const [rows] = await conn.query('SELECT data FROM app_meta WHERE `key` = ? LIMIT 1', [col.metaKey]);
        if (rows.length) {
          store[col.storeKey] = parseDataColumn(rows[0].data);
          anyRow = true;
        }
      } else {
        const list = await loadEntityTable(conn, col.table);
        store[col.storeKey] = list;
        if (list.length) anyRow = true;
      }
    }

    if (!anyRow) {
      try {
        const [rows] = await conn.query('SELECT payload FROM app_store WHERE id = 1 LIMIT 1');
        if (rows.length && rows[0].payload) {
          const raw = rows[0].payload;
          return typeof raw === 'object' ? raw : JSON.parse(String(raw));
        }
      } catch {
        /* ignore */
      }
      return null;
    }

    return store;
  } finally {
    conn.release();
  }
}

async function replaceEntityTable(conn, table, storeKey, list) {
  const items = Array.isArray(list) ? list : [];
  const ids = [];
  const rows = [];

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const id = ensureEntityId(storeKey, item, index);
    if (!id) return;
    ids.push(id);
    rows.push({ ...item, id });
  });

  if (!ids.length) {
    await conn.query(`DELETE FROM \`${table}\``);
    return;
  }

  const placeholders = ids.map(() => '?').join(',');
  await conn.query(`DELETE FROM \`${table}\` WHERE id NOT IN (${placeholders})`, ids);

  for (const row of rows) {
    const dataJson = toJsonParam(row);
    if (table === 'users') {
      const c = extractUserCols(row);
      await conn.query(
        `INSERT INTO users (id, name, dingTalkUserId, role, data)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           dingTalkUserId = VALUES(dingTalkUserId),
           role = VALUES(role),
           data = VALUES(data),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [row.id, c.name, c.dingTalkUserId, c.role, dataJson]
      );
    } else if (table === 'projects') {
      const c = extractProjectCols(row);
      await conn.query(
        `INSERT INTO projects (id, name, status, manager, archived, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           status = VALUES(status),
           manager = VALUES(manager),
           archived = VALUES(archived),
           data = VALUES(data),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [row.id, c.name, c.status, c.manager, c.archived, dataJson]
      );
    } else if (table === 'tasks') {
      const c = extractTaskCols(row);
      await conn.query(
        `INSERT INTO tasks (id, title, status, assignee, projectId, progress, data)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           status = VALUES(status),
           assignee = VALUES(assignee),
           projectId = VALUES(projectId),
           progress = VALUES(progress),
           data = VALUES(data),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [row.id, c.title, c.status, c.assignee, c.projectId, c.progress, dataJson]
      );
    } else {
      await conn.query(
        `INSERT INTO \`${table}\` (id, data)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           data = VALUES(data),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [row.id, dataJson]
      );
    }
  }
}

/**
 * @param {object} store
 */
async function savePayload(store) {
  if (!store || typeof store !== 'object') {
    throw new Error('savePayload: invalid store');
  }
  await ensureSchema();
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();

    for (const col of COLLECTIONS) {
      if (col.kind === 'meta') {
        const value = store[col.storeKey];
        if (value == null) {
          await conn.query('DELETE FROM app_meta WHERE `key` = ?', [col.metaKey]);
        } else {
          await conn.query(
            `INSERT INTO app_meta (\`key\`, data)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE
               data = VALUES(data),
               updated_at = CURRENT_TIMESTAMP(3)`,
            [col.metaKey, toJsonParam(value)]
          );
        }
      } else {
        await replaceEntityTable(conn, col.table, col.storeKey, store[col.storeKey]);
      }
    }

    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  schemaReady = false;
}

module.exports = {
  ensureSchema,
  loadPayload,
  savePayload,
  closePool,
  getPool,
  COLLECTIONS,
  ENTITY_TABLES,
};
