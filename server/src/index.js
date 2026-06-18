const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const apiRoutes = require('./routes');
const { seedIfEmpty } = require('./db/seed');
const { getAllUsers, setUsers } = require('./db/database');
const { persistUsersToHtml } = require('./utils/persistHtmlUsers');
const { ensureWorkCalendarInStore } = require('./services/workCalendar');
const { mergeReleasesFromDisk } = require('./services/systemUpdates');
const { validateProductionConfig } = require('./utils/startupCheck');
const { getLanIPv4List, getPrimaryLanIPv4 } = require('./utils/localNetwork');

function pruneAutoCreatedUsersOnBoot() {
  const users = getAllUsers();
  if (!users.some(u => String(u.id || '').startsWith('DT-'))) return;
  const cleaned = users.filter(u => !String(u.id || '').startsWith('DT-'));
  if (setUsers(cleaned)) {
    persistUsersToHtml(cleaned);
    console.log('[db] 已清理钉钉误同步的陌生人档案', users.length - cleaned.length, '条');
  }
}

const app = express();

const corsOptions = config.isProduction && config.corsOrigins.length
  ? { origin: config.corsOrigins, credentials: true }
  : {};
app.use(cors(corsOptions));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '10mb' }));

app.use('/api', apiRoutes);

if (config.staticDir) {
  const htmlPath = path.join(config.staticDir, '恒慧管.html');
  const serveApp = (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
      const stat = fs.statSync(htmlPath);
      res.setHeader('ETag', `"hhg-${stat.mtimeMs}"`);
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
    } catch (_) { /* ignore */ }
    res.sendFile(htmlPath);
  };

  // 无 .html 后缀的访问入口（钉钉首页推荐 /app）
  app.get('/', serveApp);
  app.get('/app', serveApp);
  app.get('/恒慧管.html', (req, res) => {
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, '/app' + q);
  });

  app.use(express.static(config.staticDir));
}

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ success: false, message: err.message || '服务器错误' });
});

seedIfEmpty();
ensureWorkCalendarInStore();
const mergedReleases = mergeReleasesFromDisk();
if (mergedReleases > 0) {
  console.log('[systemUpdates] 已合并发布记录', mergedReleases, '条');
}
pruneAutoCreatedUsersOnBoot();
validateProductionConfig();

app.listen(config.port, config.host, () => {
  const lanIps = getLanIPv4List();
  console.log('');
  console.log('  恒慧管后端已启动');
  console.log(`  部署:   ${config.localAsServer ? '本地服务器' : config.deployMode}`);
  console.log(`  API:    http://localhost:${config.port}/api`);
  console.log(`  健康检查: http://localhost:${config.port}/api/health`);
  if (config.staticDir) {
    console.log(`  本机访问: http://localhost:${config.port}/app`);
  }
  if (config.localAsServer && lanIps.length) {
    for (const ip of lanIps) {
      console.log(`  局域网:   http://${ip}:${config.port}/app`);
    }
  }
  if (config.publicBaseUrl) {
    console.log(`  对外地址: ${config.publicBaseUrl}/app`);
  }
  if (config.localAsServer) {
    const primary = getPrimaryLanIPv4();
    console.log('');
    console.log('  钉钉应用首页请设为: http://<本机IP>:' + config.port + '/app');
    if (primary) console.log(`  推荐:     http://${primary}:${config.port}/app`);
  }
  console.log('');
});
