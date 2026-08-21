require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'henghuiguan-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || './data/henghuiguan.json'),
  staticDir: process.env.STATIC_DIR
    ? path.resolve(__dirname, '..', process.env.STATIC_DIR)
    : path.resolve(__dirname, '../..'),
  dingtalk: {
    corpId: process.env.DINGTALK_CORP_ID || '',
    appKey: process.env.DINGTALK_APP_KEY || '',
    appSecret: process.env.DINGTALK_APP_SECRET || '',
    agentId: process.env.DINGTALK_AGENT_ID || '',
    miniAppId: process.env.DINGTALK_MINI_APP_ID || '',
    // 通讯录同步起始部门（逗号分隔 dept_id）；留空则自动读取钉钉授权范围
    syncRootDeptIds: (process.env.DINGTALK_SYNC_ROOT_DEPT_IDS || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n)),
    /** 知识库选择器：可选，仅展示名称包含以下关键词的知识库（逗号分隔）；留空则不过滤 */
    wikiWorkspaceKeywords: (process.env.DINGTALK_WIKI_WORKSPACE_KEYWORDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  allowDemoLogin: process.env.ALLOW_DEMO_LOGIN !== 'false',
  apiKey: process.env.API_KEY || '',
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  localAsServer: process.env.LOCAL_AS_SERVER === 'true',
  get isProduction() {
    return this.nodeEnv === 'production' || (!this.allowDemoLogin && !!this.publicBaseUrl);
  },
  get deployMode() {
    return this.localAsServer ? 'local' : (this.isProduction ? 'production' : 'development');
  },
  get allowHeaderAuth() {
    return this.allowDemoLogin;
  },
  uploadsDir: path.resolve(__dirname, '..', process.env.UPLOADS_DIR || './data/uploads'),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_MB || '20', 10) * 1024 * 1024,
  /** 绩效管理：仅指定一人可访问（优先匹配系统用户 id / 钉钉 userid，其次姓名） */
  performanceAdminUserId: (process.env.PERFORMANCE_ADMIN_USER_ID || '').trim(),
  performanceAdminUserName: (process.env.PERFORMANCE_ADMIN_USER_NAME || '').trim(),
  /** 每天定时提醒：待发版 / 待上传 GitHub（钉钉工作通知） */
  opsReminder: {
    enabled: process.env.OPS_REMINDER_ENABLED === 'true',
    hour: Math.min(23, Math.max(0, parseInt(process.env.OPS_REMINDER_HOUR || '16', 10) || 16)),
    minute: Math.min(59, Math.max(0, parseInt(process.env.OPS_REMINDER_MINUTE || '0', 10) || 0)),
    dingTalkUserIds: (process.env.OPS_REMINDER_DINGTALK_USER_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },
  /** 钉钉 AI 表格表单 → 临时任务收集 */
  intakeAitable: {
    enabled: process.env.INTAKE_AITABLE_ENABLED === 'true',
    apiSecret: (process.env.INTAKE_AITABLE_API_SECRET || '').trim(),
    assigneeName: (process.env.INTAKE_AITABLE_ASSIGNEE_NAME || '').trim(),
    assigneeNames: (process.env.INTAKE_AITABLE_ASSIGNEE_NAMES || process.env.INTAKE_AITABLE_ASSIGNEE_NAME || '')
      .split(/[,，]/)
      .map(s => s.trim())
      .filter(Boolean),
    maxAttachments: Math.min(20, Math.max(0, parseInt(process.env.INTAKE_AITABLE_MAX_ATTACHMENTS || '10', 10) || 10)),
    downloadTimeoutMs: Math.min(120000, Math.max(5000, parseInt(process.env.INTAKE_AITABLE_DOWNLOAD_TIMEOUT_MS || '30000', 10) || 30000)),
  },
};
