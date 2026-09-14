/**
 * 数据安全可视化：数据库概览 + API 目录（只读元数据，不含密钥/正文）
 */
const config = require('../config');
const db = require('../db/database');
const { COLLECTIONS } = require('../db/mysqlCollections');

const COLLECTION_META = {
  users: {
    label: '用户',
    table: 'users',
    sensitivity: 'high',
    note: '含姓名、角色、钉钉 userid 等人员信息',
  },
  projects: {
    label: '项目',
    table: 'projects',
    sensitivity: 'medium',
    note: '项目业务数据',
  },
  tasks: {
    label: '任务',
    table: 'tasks',
    sensitivity: 'medium',
    note: '任务树与进度',
  },
  taskDependencies: {
    label: '任务依赖',
    table: 'task_dependencies',
    sensitivity: 'low',
    note: '任务依赖关系',
  },
  changeLogs: {
    label: '变更日志',
    table: 'change_logs',
    sensitivity: 'medium',
    note: '操作审计',
  },
  transferLogs: {
    label: '转办日志',
    table: 'transfer_logs',
    sensitivity: 'medium',
    note: '任务转办记录',
  },
  pushLogs: {
    label: '推送日志',
    table: 'push_logs',
    sensitivity: 'medium',
    note: '钉钉推送记录',
  },
  notifications: {
    label: '站内通知',
    table: 'notifications',
    sensitivity: 'medium',
    note: '用户通知内容',
  },
  workCalendar: {
    label: '工作日历',
    table: 'app_meta',
    sensitivity: 'low',
    note: '节假日与工时规则（仍在用）',
  },
  rolePermissions: {
    label: '角色权限矩阵',
    table: 'app_meta',
    sensitivity: 'medium',
    note: '各角色菜单与能力配置',
  },
  llmSettings: {
    label: '文案润色配置',
    table: 'app_meta',
    sensitivity: 'high',
    note: '大模型网关、API Key、模型列表与润色模版',
  },
  systemUpdates: {
    label: '系统更新',
    table: 'system_updates',
    sensitivity: 'low',
    note: '发版记录',
  },
  performanceTemplates: {
    label: '绩效模板',
    table: 'performance_templates',
    sensitivity: 'medium',
    note: '功能已下线，仅残留数据',
    retired: true,
  },
  performanceCycles: {
    label: '绩效周期',
    table: 'performance_cycles',
    sensitivity: 'medium',
    note: '功能已下线，仅残留数据',
    retired: true,
  },
  performanceAssessments: {
    label: '绩效考核',
    table: 'performance_assessments',
    sensitivity: 'high',
    note: '功能已下线；含考核敏感信息',
    retired: true,
  },
  workReports: {
    label: '工作汇报',
    table: 'work_reports',
    sensitivity: 'medium',
    note: '功能已下线，仅残留数据',
    retired: true,
  },
  kpiPlans: {
    label: 'KPI 计划',
    table: 'kpi_plans',
    sensitivity: 'medium',
    note: '绩效考核计划',
  },
  staffDeptCatalog: {
    label: '部门目录',
    table: 'staff_dept_catalog',
    sensitivity: 'low',
    note: '组织架构目录',
  },
};

function formatBytes(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return '—';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function getDatabaseOverview() {
  const snapshot = db.getDataSecuritySnapshot();
  const collections = Object.keys(COLLECTION_META).map((key) => {
    const meta = COLLECTION_META[key];
    const raw = snapshot.collections[key];
    const count = raw ? raw.count : 0;
    const mysqlMap = COLLECTIONS.find((c) => c.storeKey === key);
    return {
      key,
      label: meta.label,
      table: mysqlMap?.table || meta.table,
      kind: mysqlMap?.kind || 'entity',
      count,
      sensitivity: meta.sensitivity,
      note: meta.note,
      retired: !!meta.retired,
    };
  });

  const active = collections.filter((c) => !c.retired).sort((a, b) => (b.count || 0) - (a.count || 0));
  const retired = collections.filter((c) => c.retired).sort((a, b) => (b.count || 0) - (a.count || 0));
  const totalRecords = active.reduce((sum, c) => sum + (c.count || 0), 0);
  const retiredRecords = retired.reduce((sum, c) => sum + (c.count || 0), 0);
  const bySensitivity = { high: 0, medium: 0, low: 0 };
  active.forEach((c) => {
    bySensitivity[c.sensitivity] = (bySensitivity[c.sensitivity] || 0) + 1;
  });

  return {
    driver: snapshot.driver,
    storageLabel: snapshot.driver === 'mysql' ? 'MySQL（方案 B 分表）' : 'JSON 文件库',
    connection: snapshot.connection,
    file: snapshot.file
      ? {
          ...snapshot.file,
          sizeLabel: formatBytes(snapshot.file.sizeBytes),
        }
      : null,
    totalCollections: active.length,
    totalRecords,
    retiredCollections: retired.length,
    retiredRecords,
    bySensitivity,
    collections: active,
    retiredCollectionsList: retired,
    securityNotes: [
      '本页仅展示结构与数量，不返回记录正文或密钥。',
      '生产环境密钥与密码仅存 .env，禁止写入 Git。',
      snapshot.driver === 'mysql'
        ? 'MySQL 建议使用 hhg_readonly 只读账号对接第三方 BI。'
        : 'JSON 模式下请定期备份 server/data/ 目录。',
      '对外写入请走 /api/external（X-Api-Key），勿直接暴露业务库写权限。',
      retiredRecords > 0
        ? `绩效管理 / 工作汇报已下线，库内仍有 ${retiredRecords} 条残留（界面已不可用）。`
        : '绩效管理 / 工作汇报已下线，当前无残留数据。',
    ],
    generatedAt: new Date().toISOString(),
  };
}

/** 维护型 API 目录：用于安全可视化，非运行时路由自省 */
const API_CATALOG = [
  {
    group: 'health',
    label: '健康检查',
    endpoints: [
      { method: 'GET', path: '/api/health', auth: 'none', risk: 'low', desc: '服务存活探测' },
      { method: 'GET', path: '/api/config/public', auth: 'none', risk: 'low', desc: '公开前端配置' },
    ],
  },
  {
    group: 'auth',
    label: '鉴权登录',
    endpoints: [
      { method: 'POST', path: '/api/auth/demo-login', auth: 'none', risk: 'medium', desc: '演示登录（可关闭）' },
      { method: 'POST', path: '/api/dingtalk/auth/login-by-userid', auth: 'none', risk: 'medium', desc: '钉钉 userid 登录' },
      { method: 'POST', path: '/api/dingtalk/auth/oauth/callback', auth: 'none', risk: 'medium', desc: '钉钉 OAuth 回调' },
      { method: 'POST', path: '/api/dingtalk/miniapp/login', auth: 'none', risk: 'medium', desc: '小程序登录' },
      { method: 'GET', path: '/api/auth/session', auth: 'jwt', risk: 'low', desc: '当前会话' },
      { method: 'POST', path: '/api/auth/refresh', auth: 'refresh', risk: 'medium', desc: '刷新 Token' },
      { method: 'POST', path: '/api/auth/logout', auth: 'jwt', risk: 'low', desc: '退出登录' },
      { method: 'POST', path: '/api/auth/profile', auth: 'apiKey', risk: 'high', desc: '第三方更新档案' },
    ],
  },
  {
    group: 'data',
    label: '业务同步',
    endpoints: [
      { method: 'GET', path: '/api/data/bootstrap', auth: 'jwt', risk: 'high', desc: '拉取全量业务数据' },
      { method: 'PUT', path: '/api/data/sync', auth: 'jwt', risk: 'high', desc: '同步写回业务数据' },
      { method: 'GET', path: '/api/miniapp/bootstrap', auth: 'jwt+apiKey', risk: 'high', desc: '小程序引导数据' },
      { method: 'POST', path: '/api/data/admin/merge-seed', auth: 'jwt-admin', risk: 'critical', desc: '管理员合并 seed' },
      { method: 'POST', path: '/api/data/admin/sync-task-attachments', auth: 'jwt-admin', risk: 'high', desc: '附件元数据同步' },
    ],
  },
  {
    group: 'external',
    label: '第三方写入',
    endpoints: [
      { method: 'GET', path: '/api/external/health', auth: 'apiKey', risk: 'low', desc: '外部写入健康检查' },
      { method: 'GET', path: '/api/external/catalog', auth: 'apiKey', risk: 'low', desc: '外部写入目录' },
      { method: 'POST', path: '/api/external/projects', auth: 'apiKey', risk: 'high', desc: '创建项目' },
      { method: 'PATCH', path: '/api/external/projects/:id', auth: 'apiKey', risk: 'high', desc: '更新项目' },
      { method: 'DELETE', path: '/api/external/projects/:id', auth: 'apiKey', risk: 'critical', desc: '删除项目' },
      { method: 'POST', path: '/api/external/tasks', auth: 'apiKey', risk: 'high', desc: '创建任务' },
      { method: 'PATCH', path: '/api/external/tasks/:id', auth: 'apiKey', risk: 'high', desc: '更新任务' },
      { method: 'DELETE', path: '/api/external/tasks/:id', auth: 'apiKey', risk: 'critical', desc: '删除任务' },
      { method: 'POST', path: '/api/external/batch', auth: 'apiKey', risk: 'critical', desc: '批量写入' },
    ],
  },
  {
    group: 'workbuddy',
    label: 'WorkBuddy 只读',
    endpoints: [
      { method: 'GET', path: '/api/workbuddy/health', auth: 'apiKey', risk: 'low', desc: '健康检查' },
      { method: 'GET', path: '/api/workbuddy/query', auth: 'apiKey', risk: 'medium', desc: '条件查询' },
      { method: 'GET', path: '/api/workbuddy/projects/:id', auth: 'apiKey', risk: 'medium', desc: '项目详情' },
      { method: 'GET', path: '/api/workbuddy/tasks/:id', auth: 'apiKey', risk: 'medium', desc: '任务详情' },
    ],
  },
  {
    group: 'intake',
    label: '表单接入',
    endpoints: [
      { method: 'POST', path: '/api/intake/aitable', auth: 'signature', risk: 'high', desc: 'AI 表格提单 → 临时任务' },
    ],
  },
  {
    group: 'dingtalk',
    label: '钉钉集成',
    endpoints: [
      { method: 'GET', path: '/api/dingtalk/sync/diagnose', auth: 'jwt', risk: 'medium', desc: '通讯录同步诊断' },
      { method: 'GET', path: '/api/dingtalk/departments', auth: 'jwt', risk: 'medium', desc: '部门列表' },
      { method: 'POST', path: '/api/dingtalk/users/sync', auth: 'jwt-admin', risk: 'high', desc: '同步通讯录' },
      { method: 'POST', path: '/api/dingtalk/push/work-notification', auth: 'jwt', risk: 'high', desc: '发送工作通知' },
      { method: 'POST', path: '/api/dingtalk/push/batch', auth: 'jwt', risk: 'high', desc: '批量推送' },
      { method: 'GET', path: '/api/dingtalk/push/status', auth: 'jwt', risk: 'low', desc: '推送状态' },
      { method: 'GET', path: '/api/staff/dept-catalog', auth: 'jwt', risk: 'low', desc: '部门目录' },
      { method: 'PUT', path: '/api/staff/dept-catalog', auth: 'jwt-admin', risk: 'medium', desc: '更新部门目录' },
    ],
  },
  {
    group: 'files',
    label: '文件附件',
    endpoints: [
      { method: 'POST', path: '/api/files/upload', auth: 'jwt', risk: 'high', desc: '上传附件' },
      { method: 'GET', path: '/api/files/:fileId', auth: 'jwt', risk: 'medium', desc: '下载/查看附件' },
      { method: 'DELETE', path: '/api/files/:fileId', auth: 'jwt', risk: 'high', desc: '删除附件' },
      { method: 'POST', path: '/api/files/link-dingtalk-doc', auth: 'jwt', risk: 'medium', desc: '关联钉钉文档' },
      { method: 'GET', path: '/api/files/wiki/workspaces', auth: 'jwt', risk: 'low', desc: '知识库列表' },
      { method: 'GET', path: '/api/files/wiki/nodes', auth: 'jwt', risk: 'low', desc: '知识库节点' },
    ],
  },
  {
    group: 'kpi',
    label: 'KPI 计划',
    endpoints: [
      { method: 'GET', path: '/api/kpi-plans', auth: 'jwt-kpi', risk: 'medium', desc: '计划列表' },
      { method: 'POST', path: '/api/kpi-plans', auth: 'jwt-kpi', risk: 'medium', desc: '新建计划' },
      { method: 'PATCH', path: '/api/kpi-plans/:id', auth: 'jwt-kpi', risk: 'medium', desc: '更新计划' },
      { method: 'DELETE', path: '/api/kpi-plans/:id', auth: 'jwt-kpi', risk: 'high', desc: '删除计划' },
    ],
  },
  {
    group: 'realtime',
    label: '实时同步',
    endpoints: [
      { method: 'GET', path: '/api/realtime/events', auth: 'jwt|header', risk: 'medium', desc: 'SSE 事件流' },
      { method: 'GET', path: '/api/realtime/revision', auth: 'jwt', risk: 'low', desc: '数据修订号' },
    ],
  },
  {
    group: 'display',
    label: '滚动大屏',
    endpoints: [
      { method: 'GET', path: '/api/display/wall', auth: 'wall', risk: 'medium', desc: '大屏聚合数据' },
    ],
  },
  {
    group: 'ncc',
    label: 'NCC 看板代理',
    endpoints: [
      { method: 'GET', path: '/api/ncc-monitor/status', auth: 'jwt-admin', risk: 'low', desc: '代理状态' },
      { method: 'POST', path: '/api/ncc-monitor/login', auth: 'jwt-admin', risk: 'high', desc: 'Loop 登录' },
      { method: 'GET', path: '/api/ncc-monitor/embed', auth: 'jwt-admin', risk: 'medium', desc: '内嵌看板' },
      { method: 'ALL', path: '/api/ncc-monitor/upstream/*', auth: 'jwt-admin', risk: 'high', desc: '上游资源代理' },
    ],
  },
  {
    group: 'dataSecurity',
    label: '数据安全',
    endpoints: [
      { method: 'GET', path: '/api/data-security/overview', auth: 'jwt-admin', risk: 'medium', desc: '数据库+API 总览' },
      { method: 'GET', path: '/api/data-security/database', auth: 'jwt-admin', risk: 'medium', desc: '数据库可视化' },
      { method: 'GET', path: '/api/data-security/apis', auth: 'jwt-admin', risk: 'low', desc: 'API 可视化' },
    ],
  },
  {
    group: 'permissions',
    label: '权限管理',
    endpoints: [
      { method: 'GET', path: '/api/permissions', auth: 'jwt', risk: 'medium', desc: '角色能力矩阵（需 nav.permissions）' },
      { method: 'GET', path: '/api/permissions/matrix', auth: 'jwt', risk: 'low', desc: '拉取矩阵供前端 can*' },
      { method: 'PUT', path: '/api/permissions', auth: 'jwt-admin', risk: 'high', desc: '保存角色能力矩阵' },
      { method: 'POST', path: '/api/permissions/reset', auth: 'jwt-admin', risk: 'high', desc: '恢复默认权限矩阵' },
    ],
  },
  {
    group: 'misc',
    label: '其它业务',
    endpoints: [
      { method: 'GET', path: '/api/notifications', auth: 'jwt', risk: 'low', desc: '站内通知' },
      { method: 'GET', path: '/api/system-updates', auth: 'jwt', risk: 'low', desc: '更新记录' },
      { method: 'GET', path: '/api/work-calendar', auth: 'jwt', risk: 'low', desc: '工作日历' },
      { method: 'PUT', path: '/api/work-calendar', auth: 'jwt', risk: 'medium', desc: '更新工作日历' },
    ],
  },
];

const AUTH_LABELS = {
  none: '公开',
  jwt: 'JWT 登录',
  'jwt-admin': 'JWT · 管理员',
  'jwt-kpi': 'JWT · KPI 权限',
  'jwt+apiKey': 'JWT + API Key',
  'jwt|header': 'JWT 或 Header',
  apiKey: 'X-Api-Key',
  refresh: 'Refresh Token',
  signature: '签名校验',
  wall: '大屏访问控制',
};

const RISK_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '极高',
};

function getApiCatalog() {
  const groups = API_CATALOG.map((g) => ({
    ...g,
    endpoints: g.endpoints.map((ep) => ({
      ...ep,
      authLabel: AUTH_LABELS[ep.auth] || ep.auth,
      riskLabel: RISK_LABELS[ep.risk] || ep.risk,
    })),
  }));

  const all = groups.flatMap((g) => g.endpoints);
  const byAuth = {};
  const byRisk = {};
  all.forEach((ep) => {
    byAuth[ep.auth] = (byAuth[ep.auth] || 0) + 1;
    byRisk[ep.risk] = (byRisk[ep.risk] || 0) + 1;
  });

  return {
    totalEndpoints: all.length,
    totalGroups: groups.length,
    byAuth: Object.entries(byAuth).map(([key, count]) => ({
      key,
      label: AUTH_LABELS[key] || key,
      count,
    })),
    byRisk: Object.entries(byRisk).map(([key, count]) => ({
      key,
      label: RISK_LABELS[key] || key,
      count,
    })),
    authLabels: AUTH_LABELS,
    riskLabels: RISK_LABELS,
    groups,
    securityNotes: [
      '公开接口尽量只读且无敏感字段；写入必须鉴权。',
      'API_KEY / JWT_SECRET 仅存环境变量，轮换后旧密钥立即失效。',
      'critical 级接口（删除/批量写/merge-seed）建议限制来源 IP 或仅内网。',
      '本目录为维护清单，新增路由后请同步更新。',
    ],
    apiKeyConfigured: !!String(config.apiKey || '').trim(),
    allowDemoLogin: config.allowDemoLogin !== false,
    generatedAt: new Date().toISOString(),
  };
}

function getOverview() {
  return {
    database: getDatabaseOverview(),
    apis: getApiCatalog(),
  };
}

module.exports = {
  getOverview,
  getDatabaseOverview,
  getApiCatalog,
  AUTH_LABELS,
  RISK_LABELS,
};
