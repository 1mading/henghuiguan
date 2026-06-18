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
};
