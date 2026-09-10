/**
 * 方案 B：集合名 ↔ 表名映射与行编解码
 */
const crypto = require('crypto');

/** @type {{ storeKey: string, table: string, kind: 'entity'|'meta', metaKey?: string }[]} */
const COLLECTIONS = [
  { storeKey: 'users', table: 'users', kind: 'entity' },
  { storeKey: 'projects', table: 'projects', kind: 'entity' },
  { storeKey: 'tasks', table: 'tasks', kind: 'entity' },
  { storeKey: 'taskDependencies', table: 'task_dependencies', kind: 'entity' },
  { storeKey: 'changeLogs', table: 'change_logs', kind: 'entity' },
  { storeKey: 'transferLogs', table: 'transfer_logs', kind: 'entity' },
  { storeKey: 'pushLogs', table: 'push_logs', kind: 'entity' },
  { storeKey: 'notifications', table: 'notifications', kind: 'entity' },
  { storeKey: 'systemUpdates', table: 'system_updates', kind: 'entity' },
  { storeKey: 'performanceTemplates', table: 'performance_templates', kind: 'entity' },
  { storeKey: 'performanceCycles', table: 'performance_cycles', kind: 'entity' },
  { storeKey: 'performanceAssessments', table: 'performance_assessments', kind: 'entity' },
  { storeKey: 'workReports', table: 'work_reports', kind: 'entity' },
  { storeKey: 'kpiPlans', table: 'kpi_plans', kind: 'entity' },
  { storeKey: 'staffDeptCatalog', table: 'staff_dept_catalog', kind: 'entity' },
  { storeKey: 'apiKeys', table: 'api_keys', kind: 'entity' },
  { storeKey: 'issues', table: 'issues', kind: 'entity' },
  { storeKey: 'projectTemplates', table: 'project_templates', kind: 'entity' },
  { storeKey: 'workCalendar', table: 'app_meta', kind: 'meta', metaKey: 'workCalendar' },
  { storeKey: 'rolePermissions', table: 'app_meta', kind: 'meta', metaKey: 'rolePermissions' },
];

const ENTITY_TABLES = [...new Set(COLLECTIONS.filter(c => c.kind === 'entity').map(c => c.table))];

function stableCatalogId(item, index) {
  if (item && item.id) return String(item.id);
  const raw = JSON.stringify(item || {});
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  return `SDC-${hash}-${index}`;
}

function ensureEntityId(storeKey, item, index) {
  if (!item || typeof item !== 'object') return null;
  if (item.id) return String(item.id);
  if (storeKey === 'staffDeptCatalog') {
    const id = stableCatalogId(item, index);
    return id;
  }
  return null;
}

function parseDataColumn(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  return JSON.parse(String(raw));
}

function toJsonParam(obj) {
  return JSON.stringify(obj == null ? null : obj);
}

/** users / projects / tasks 冗余索引列 */
function extractUserCols(row) {
  return {
    name: row.name != null ? String(row.name) : null,
    dingTalkUserId: row.dingTalkUserId != null ? String(row.dingTalkUserId) : null,
    role: row.role != null ? String(row.role) : null,
  };
}

function extractProjectCols(row) {
  const archived = row.archived === true || row.status === 'archived' ? 1 : 0;
  return {
    name: row.name != null ? String(row.name) : null,
    status: row.status != null ? String(row.status) : null,
    manager: row.manager != null ? String(row.manager) : null,
    archived,
  };
}

function extractTaskCols(row) {
  let progress = row.progress;
  if (progress != null) {
    progress = Number(progress);
    if (!Number.isFinite(progress)) progress = null;
  } else {
    progress = null;
  }
  return {
    title: row.title != null ? String(row.title) : null,
    status: row.status != null ? String(row.status) : null,
    assignee: row.assignee != null ? String(row.assignee) : null,
    projectId: row.projectId != null ? String(row.projectId) : null,
    progress,
  };
}

module.exports = {
  COLLECTIONS,
  ENTITY_TABLES,
  stableCatalogId,
  ensureEntityId,
  parseDataColumn,
  toJsonParam,
  extractUserCols,
  extractProjectCols,
  extractTaskCols,
};
