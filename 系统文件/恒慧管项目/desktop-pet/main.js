const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'pet-config.json');

const AUTH_DEFAULT = {
  mode: 'dingTalkUserId', // dingTalkUserId | demoLogin | pasteToken | customPost
  loginPath: '/dingtalk/auth/login-by-userid',
  bodyTemplate: { dingTalkUserId: '{{dingTalkUserId}}' },
  tokenPath: 'token',
  userNamePath: 'user.name',
};

const NOTIFY_DEFAULT = {
  listPath: '/notifications?limit=8&unreadOnly=1',
  markReadPath: '/notifications/mark-read',
  unreadPath: 'unreadCount',
  itemsPath: 'items',
  titlePath: 'title',
  bodyPath: 'content',
  eventTypePath: 'eventType',
  idPath: 'id',
};

const REALTIME_DEFAULT = {
  enabled: true,
  path: '/realtime/events',
  tokenQuery: 'token',
  eventName: 'change',
  triggerType: 'inbox.updated',
  pollSeconds: 60,
};

/** 内置预设：一键恢复恒慧管协议 */
const PRESETS = {
  henghuiguan: {
    presetId: 'henghuiguan',
    displayName: '恒慧管',
    apiBase: 'https://henghuiguan.handagroup.com/api',
    appUrl: 'https://henghuiguan.handagroup.com/app',
    userId: 'U018',
    dingTalkUserId: '669701617',
    auth: { ...AUTH_DEFAULT, bodyTemplate: { ...AUTH_DEFAULT.bodyTemplate } },
    notify: { ...NOTIFY_DEFAULT },
    realtime: { ...REALTIME_DEFAULT },
    authHeader: 'Bearer {{token}}',
  },
};

const DEFAULT_CONFIG = {
  presetId: 'henghuiguan',
  displayName: '恒慧管',
  apiBase: 'https://henghuiguan.handagroup.com/api',
  appUrl: 'https://henghuiguan.handagroup.com/app',
  userId: 'U018',
  dingTalkUserId: '669701617',
  token: '',
  userName: '',
  auth: { ...AUTH_DEFAULT, bodyTemplate: { ...AUTH_DEFAULT.bodyTemplate } },
  notify: { ...NOTIFY_DEFAULT },
  realtime: { ...REALTIME_DEFAULT },
  authHeader: 'Bearer {{token}}',
  bounds: null,
  mimicActivity: true,
  wanderEnabled: true,
  /** 不理宠物多久（分钟）后才开始溜达 */
  wanderIdleMinutes: 5,
  skinId: 'amber',
};

function cloneDefaults() {
  return {
    ...DEFAULT_CONFIG,
    auth: {
      ...DEFAULT_CONFIG.auth,
      bodyTemplate: { ...(DEFAULT_CONFIG.auth.bodyTemplate || {}) },
    },
    notify: { ...DEFAULT_CONFIG.notify },
    realtime: { ...DEFAULT_CONFIG.realtime },
  };
}

function mergeNested(base, patch) {
  if (!patch || typeof patch !== 'object') return { ...base };
  const next = { ...base, ...patch };
  if (base.bodyTemplate || patch.bodyTemplate) {
    next.bodyTemplate = {
      ...(base.bodyTemplate || {}),
      ...(patch.bodyTemplate || {}),
    };
  }
  return next;
}

function mergeConfig(saved) {
  const base = cloneDefaults();
  if (!saved || typeof saved !== 'object') return base;
  const next = { ...base, ...saved };
  next.auth = mergeNested(base.auth, saved.auth);
  next.notify = mergeNested(base.notify, saved.notify);
  next.realtime = mergeNested(base.realtime, saved.realtime);
  next.skinId = normalizeSkinId(next.skinId);
  return next;
}

const SKINS = [
  { id: 'amber', label: '琥珀猫' },
  { id: 'ash', label: '灰猫' },
  { id: 'snow', label: '白猫' },
  { id: 'fox', label: '小狐' },
];

function normalizeSkinId(id) {
  const ok = SKINS.some((s) => s.id === id);
  return ok ? id : 'amber';
}

let mainWindow = null;
let tray = null;
let settingsWindow = null;
let activityProc = null;
let lastActivityEmit = 0;
let wanderAnim = null;
let wanderPaused = false;
let persistTimer = null;
let wandering = false;
let lastAttentionAt = Date.now();
let idleCheckTimer = null;
/** 拖拽：光标相对窗口左上角的偏移 */
let dragOffset = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return mergeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
    }
  } catch (_) { /* ignore */ }
  return cloneDefaults();
}

function saveConfig(partial) {
  const cur = loadConfig();
  const patch = partial || {};
  const merged = {
    ...cur,
    ...patch,
    auth: patch.auth ? mergeNested(cur.auth, patch.auth) : cur.auth,
    notify: patch.notify ? mergeNested(cur.notify, patch.notify) : cur.notify,
    realtime: patch.realtime ? mergeNested(cur.realtime, patch.realtime) : cur.realtime,
  };
  const next = mergeConfig(merged);
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function applyPreset(presetId) {
  const preset = PRESETS[presetId];
  if (!preset) return loadConfig();
  const cur = loadConfig();
  const next = mergeConfig({
    ...cur,
    presetId: preset.presetId,
    displayName: preset.displayName,
    apiBase: preset.apiBase,
    appUrl: preset.appUrl,
    authHeader: preset.authHeader,
    userId: preset.userId != null ? preset.userId : cur.userId,
    dingTalkUserId: preset.dingTalkUserId != null ? preset.dingTalkUserId : cur.dingTalkUserId,
    auth: { ...preset.auth, bodyTemplate: { ...(preset.auth.bodyTemplate || {}) } },
    notify: { ...preset.notify },
    realtime: { ...preset.realtime },
  });
  // 协议字段整表替换，避免自定义残留键混进预设
  next.auth = { ...preset.auth, bodyTemplate: { ...(preset.auth.bodyTemplate || {}) } };
  next.notify = { ...preset.notify };
  next.realtime = { ...preset.realtime };
  if (preset.userId != null) next.userId = preset.userId;
  if (preset.dingTalkUserId != null) next.dingTalkUserId = preset.dingTalkUserId;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function createTrayIcon() {
  // 16x16 amber circle as tray icon (no external asset required)
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const i = (y * size + x) * 4;
      if (dx * dx + dy * dy <= 49) {
        canvas[i] = 232; canvas[i + 1] = 155; canvas[i + 2] = 45; canvas[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function stopActivityWatcher() {
  if (!activityProc) return;
  try { activityProc.kill(); } catch (_) { /* ignore */ }
  activityProc = null;
}

function startActivityWatcher() {
  stopActivityWatcher();
  const cfg = loadConfig();
  if (cfg.mimicActivity === false) return;
  if (process.platform !== 'win32') return;

  const script = path.join(__dirname, 'activity-watcher.ps1');
  const ps = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';

  try {
    activityProc = require('child_process').spawn(ps, [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', script,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (_) {
    activityProc = null;
    return;
  }

  let buf = '';
  activityProc.stdout.setEncoding('utf8');
  activityProc.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    const now = Date.now();
    for (const line of lines) {
      const t = String(line || '').trim();
      if (t !== 'k' && t !== 'm') continue;
      // 限流，避免刷爆渲染进程
      if (now - lastActivityEmit < 120) continue;
      lastActivityEmit = now;
      if (t === 'k') touchAttention();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pet:activity', t === 'k' ? 'typing' : 'mouse');
      }
    }
  });
  activityProc.on('exit', () => {
    activityProc = null;
  });
}

function emitWander(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:wander', payload);
  }
}

function stopWander(reason) {
  if (wanderAnim) {
    clearInterval(wanderAnim);
    wanderAnim = null;
  }
  if (wandering) {
    wandering = false;
    emitWander({ active: false, reason: reason || 'stop' });
    schedulePersistBounds();
  }
}

function schedulePersistBounds() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
    if (wandering) return;
    const b = mainWindow.getBounds();
    saveConfig({ bounds: { x: b.x, y: b.y, width: b.width, height: b.height } });
  }, 400);
}

function touchAttention() {
  lastAttentionAt = Date.now();
}

function getWanderIdleMs() {
  const mins = Number(loadConfig().wanderIdleMinutes);
  const safe = Number.isFinite(mins) && mins > 0 ? mins : 5;
  return Math.max(0.5, Math.min(240, safe)) * 60 * 1000;
}

function isIgnoredLongEnough() {
  return Date.now() - lastAttentionAt >= getWanderIdleMs();
}

function clampBoundsToWorkArea(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;
  const width = Math.min(bounds.width, wa.width);
  const height = Math.min(bounds.height, wa.height);
  const x = Math.min(Math.max(bounds.x, wa.x), wa.x + wa.width - width);
  const y = Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - height);
  return { x: Math.round(x), y: Math.round(y), width, height };
}

function ensureWanderLoop() {
  clearInterval(idleCheckTimer);
  idleCheckTimer = setInterval(() => {
    if (loadConfig().wanderEnabled === false) return;
    if (wandering || wanderPaused) return;
    if (!isIgnoredLongEnough()) return;
    startWander();
  }, 5000);
}

function compactPetWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  let b = mainWindow.getBounds();
  const w = 160;
  const h = 200;
  if (b.width > w + 20 || b.height > h + 20) {
    b = clampBoundsToWorkArea({
      x: b.x,
      y: Math.max(0, b.y + (b.height - h)),
      width: w,
      height: h,
    });
    mainWindow.setBounds(b);
  } else {
    b = clampBoundsToWorkArea(b);
    mainWindow.setBounds(b);
  }
  return mainWindow.getBounds();
}

function startWander(opts = {}) {
  if (wandering) return false;
  if (wanderPaused && !opts.force) return false;
  const cfg = loadConfig();
  if (cfg.wanderEnabled === false && !opts.force) return false;
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return false;

  // 非强制：必须「长时间不理」才溜达
  if (!opts.force && !isIgnoredLongEnough()) return false;

  if (opts.force) {
    wanderPaused = false;
  }

  let b = compactPetWindow();
  if (!b) return false;

  const display = screen.getDisplayMatching(b);
  const wa = display.workArea;
  const pad = 8;
  const minX = wa.x + pad;
  const maxX = Math.max(minX, wa.x + wa.width - b.width - pad);
  const minY = wa.y + pad;
  const maxY = Math.max(minY, wa.y + wa.height - b.height - pad);

  let targetX = b.x;
  let targetY = b.y;
  for (let i = 0; i < 8; i++) {
    targetX = Math.round(minX + Math.random() * (maxX - minX));
    targetY = Math.round(b.y + (Math.random() - 0.5) * Math.min(160, Math.max(40, (maxY - minY) * 0.35)));
    targetY = Math.min(maxY, Math.max(minY, targetY));
    if (Math.abs(targetX - b.x) > Math.min(260, wa.width * 0.28)) break;
  }
  targetX = Math.min(maxX, Math.max(minX, targetX));
  targetY = Math.min(maxY, Math.max(minY, targetY));

  const dir = targetX >= b.x ? 1 : -1;
  const speed = 5.2 + Math.random() * 2.2;
  const expressions = ['walk', 'walk', 'walk', 'love', 'sparkle', 'smug'];
  const expression = expressions[Math.floor(Math.random() * expressions.length)];

  wandering = true;
  emitWander({ active: true, dir, expression, targetX, targetY, moving: false });

  let lastEmitDir = dir;
  let lastEmitAt = 0;
  wanderAnim = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopWander('destroyed');
      return;
    }
    // 溜达中被搭理（打字等）则停
    if (!opts.force && Date.now() - lastAttentionAt < 800) {
      stopWander('attention');
      return;
    }
    const cur = mainWindow.getBounds();
    const dx = targetX - cur.x;
    const dy = targetY - cur.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      stopWander('arrived');
      // 仍被忽略时，短歇后再走一段；不会跑出屏幕
      if (loadConfig().wanderEnabled !== false && isIgnoredLongEnough()) {
        setTimeout(() => startWander(), 1800 + Math.random() * 2500);
      }
      return;
    }
    const stepX = Math.round((dx / dist) * speed) || (dx > 0 ? 1 : dx < 0 ? -1 : 0);
    const stepY = Math.round((dy / dist) * speed * 0.45) || (dy > 0 ? 1 : dy < 0 ? -1 : 0);
    const nextDir = stepX === 0 ? dir : (stepX > 0 ? 1 : -1);
    const next = clampBoundsToWorkArea({
      x: cur.x + stepX,
      y: cur.y + stepY,
      width: cur.width,
      height: cur.height,
    });
    mainWindow.setBounds(next);
    const now = Date.now();
    if (nextDir !== lastEmitDir || now - lastEmitAt > 400) {
      lastEmitDir = nextDir;
      lastEmitAt = now;
      emitWander({ active: true, dir: nextDir, expression, moving: true });
    }
  }, 30);

  return true;
}

function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const cfg = loadConfig();
  const width = Math.min(220, Math.max(160, Number(cfg.bounds?.width) || 160));
  const height = Math.min(260, Math.max(180, Number(cfg.bounds?.height) || 200));
  let x = Number(cfg.bounds?.x);
  let y = Number(cfg.bounds?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    x = Math.round(workArea.x + workArea.width - width - 24);
    y = Math.round(workArea.y + workArea.height - height - 24);
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 140,
    minHeight: 160,
    maxWidth: 520,
    maxHeight: 720,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 默认点击穿透：透明区不挡下面窗口
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const persistBounds = () => {
    if (wandering) return;
    schedulePersistBounds();
  };
  mainWindow.on('resized', persistBounds);
  mainWindow.on('moved', persistBounds);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    touchAttention();
    ensureWanderLoop();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      stopWander('hide');
      schedulePersistBounds();
      mainWindow.hide();
    }
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 680,
    resizable: true,
    maximizable: false,
    title: '桌宠设置',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

/**
 * 打开主站窗口：带 userid 参数走正式登录，成功后从 localStorage 导入 token
 * （Electron 内无法钉钉 JSAPI 免登，必须带 userid）
 */
function loginViaAppWindow() {
  const cfg = loadConfig();
  const appUrl = String(cfg.appUrl || '').trim() || 'https://henghuiguan.handagroup.com/app';
  const dingtalkId = String(cfg.dingTalkUserId || '').trim();
  let target = appUrl;
  if (dingtalkId) {
    const sep = appUrl.indexOf('?') >= 0 ? '&' : '?';
    target = appUrl + sep + 'userid=' + encodeURIComponent(dingtalkId);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    const win = new BrowserWindow({
      width: 1100,
      height: 760,
      title: dingtalkId
        ? '主站登录中 · 成功后自动返回桌宠'
        : '请先在设置里填写钉钉 userid，否则无法拉取正式数据',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: 'persist:hhg-pet-app-login',
      },
    });

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      try {
        if (win && !win.isDestroyed()) win.close();
      } catch (_) { /* ignore */ }
      if (err) reject(err);
      else resolve(result);
    };

    const EXTRACT_JS = `(() => {
      try {
        const raw = localStorage.getItem('henghuiguan_data');
        if (!raw) return null;
        const data = JSON.parse(raw);
        const s = data.authSession || {};
        if (!s.token) return null;
        const uid = data.currentUserId || '';
        const users = Array.isArray(data.users) ? data.users : [];
        const u = users.find((x) => x && String(x.id) === String(uid));
        const projectCount = Array.isArray(data.projects) ? data.projects.length : 0;
        return {
          token: String(s.token),
          userId: uid ? String(uid) : '',
          userName: (u && u.name) ? String(u.name) : '',
          projectCount,
        };
      } catch (e) {
        return null;
      }
    })()`;

    const tryExtract = async () => {
      if (settled || !win || win.isDestroyed()) return;
      try {
        const session = await win.webContents.executeJavaScript(EXTRACT_JS, true);
        // 有 token 即导入；项目数可为 0（新账号），但仍算登录成功
        if (session && session.token) {
          finish(null, session);
        }
      } catch (_) { /* 页面未就绪，继续轮询 */ }
    };

    win.on('closed', () => {
      if (!settled) finish(new Error('已取消主站登录'));
    });

    // 清掉可能污染的空缓存，避免只显示本地默认「王元斌」却无 token
    const ses = win.webContents.session;
    Promise.resolve()
      .then(() => ses.clearStorageData({ storages: ['localstorage'] }))
      .catch(() => {})
      .then(() => win.loadURL(target))
      .catch((e) => finish(e || new Error('打开主站失败')));

    win.webContents.on('did-finish-load', () => { tryExtract(); });
    pollTimer = setInterval(tryExtract, 1200);
    setTimeout(() => {
      if (!settled) finish(new Error('登录超时。请确认已填钉钉 userid，或改用设置里的「正式登录」'));
    }, 10 * 60 * 1000);
  });
}

function buildTray() {
  if (tray) {
    try { tray.destroy(); } catch (_) { /* ignore */ }
    tray = null;
  }
  tray = new Tray(createTrayIcon());
  const cfg = loadConfig();
  const displayName = String(cfg.displayName || '').trim() || '桌宠';
  tray.setToolTip(displayName + '桌宠');
  const skinId = normalizeSkinId(cfg.skinId);
  const skinSubmenu = SKINS.map((s) => ({
    label: s.label,
    type: 'radio',
    checked: s.id === skinId,
    click: () => {
      const next = saveConfig({ skinId: s.id });
      mainWindow?.webContents.send('pet:configUpdated', next);
      buildTray();
    },
  }));
  const openLabel = displayName === '桌宠' ? '打开主站' : ('打开' + displayName);
  const menu = Menu.buildFromTemplate([
    {
      label: '显示挂件',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '设置 / 登录',
      click: () => createSettingsWindow(),
    },
    {
      label: openLabel,
      click: () => {
        const c = loadConfig();
        shell.openExternal(c.appUrl || 'http://localhost:3000/app');
      },
    },
    {
      label: '换造型',
      submenu: skinSubmenu,
    },
    {
      label: '模仿打字 / 活动',
      type: 'checkbox',
      checked: cfg.mimicActivity !== false,
      click: (item) => {
        saveConfig({ mimicActivity: !!item.checked });
        if (item.checked) startActivityWatcher();
        else stopActivityWatcher();
        mainWindow?.webContents.send('pet:configUpdated', loadConfig());
      },
    },
    {
      label: '满屏溜达',
      type: 'checkbox',
      checked: cfg.wanderEnabled !== false,
      click: (item) => {
        saveConfig({ wanderEnabled: !!item.checked });
        if (!item.checked) stopWander('disabled');
        mainWindow?.webContents.send('pet:configUpdated', loadConfig());
      },
    },
    { type: 'separator' },
    {
      label: '现在去溜达',
      click: () => {
        stopWander('manual');
        startWander({ force: true });
      },
    },
    {
      label: '模拟：新任务',
      click: () => mainWindow?.webContents.send('pet:simulate', 'task_assigned'),
    },
    {
      label: '模拟：逾期',
      click: () => mainWindow?.webContents.send('pet:simulate', 'task_overdue'),
    },
    {
      label: '模拟：完成',
      click: () => mainWindow?.webContents.send('pet:simulate', 'task_completed'),
    },
    {
      label: '模拟：打字中',
      click: () => mainWindow?.webContents.send('pet:activity', 'typing'),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        stopWander('quit');
        stopActivityWatcher();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.removeAllListeners('double-click');
  tray.on('double-click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createPetWindow();
    buildTray();
    startActivityWatcher();
  });
}

app.on('before-quit', () => {
  app.isQuitting = true;
  stopWander('quit');
  stopActivityWatcher();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

ipcMain.handle('pet:getConfig', () => loadConfig());
ipcMain.handle('pet:getPresets', () => {
  const list = Object.keys(PRESETS).map((id) => {
    const p = PRESETS[id];
        return {
          id,
          label: p.displayName,
          preset: {
            presetId: p.presetId,
            displayName: p.displayName,
            apiBase: p.apiBase,
            appUrl: p.appUrl,
            userId: p.userId,
            dingTalkUserId: p.dingTalkUserId,
            auth: { ...p.auth, bodyTemplate: { ...(p.auth.bodyTemplate || {}) } },
            notify: { ...p.notify },
            realtime: { ...p.realtime },
            authHeader: p.authHeader,
          },
        };
  });
  return list;
});
ipcMain.handle('pet:applyPreset', (_e, presetId) => {
  const next = applyPreset(presetId);
  buildTray();
  mainWindow?.webContents.send('pet:configUpdated', next);
  return next;
});
ipcMain.handle('pet:setConfig', (_e, partial) => {
  const patch = { ...(partial || {}) };
  if (patch.skinId != null) patch.skinId = normalizeSkinId(patch.skinId);
  const next = saveConfig(patch);
  if (Object.prototype.hasOwnProperty.call(partial || {}, 'mimicActivity')) {
    if (next.mimicActivity === false) stopActivityWatcher();
    else startActivityWatcher();
  }
  if (
    Object.prototype.hasOwnProperty.call(partial || {}, 'skinId')
    || Object.prototype.hasOwnProperty.call(partial || {}, 'displayName')
    || Object.prototype.hasOwnProperty.call(partial || {}, 'appUrl')
    || Object.prototype.hasOwnProperty.call(partial || {}, 'presetId')
  ) {
    buildTray();
  }
  mainWindow?.webContents.send('pet:configUpdated', next);
  return next;
});
ipcMain.handle('pet:openApp', (_e, url) => {
  const cfg = loadConfig();
  shell.openExternal(url || cfg.appUrl || 'http://localhost:3000/app');
});
ipcMain.handle('pet:loginViaApp', async () => {
  const session = await loginViaAppWindow();
  const next = saveConfig({
    token: session.token,
    userId: session.userId || loadConfig().userId,
    userName: session.userName || '',
    auth: {
      mode: 'pasteToken',
    },
  });
  buildTray();
  mainWindow?.webContents.send('pet:configUpdated', next);
  return {
    ok: true,
    userName: next.userName,
    userId: next.userId,
  };
});
ipcMain.handle('pet:openSettings', () => {
  createSettingsWindow();
});
ipcMain.handle('pet:quit', () => {
  app.isQuitting = true;
  app.quit();
});
ipcMain.on('pet:dragStart', (_e, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  touchAttention();
  stopWander('drag');
  wanderPaused = true;
  // 拖拽期间必须接收鼠标，否则透明穿透会中断拖动
  mainWindow.setIgnoreMouseEvents(false);
  const b = mainWindow.getBounds();
  const screenX = Number(payload && payload.screenX);
  const screenY = Number(payload && payload.screenY);
  if (Number.isFinite(screenX) && Number.isFinite(screenY)) {
    dragOffset = {
      x: screenX - b.x,
      y: screenY - b.y,
      width: b.width,
      height: b.height,
    };
  } else {
    dragOffset = { x: b.width / 2, y: b.height / 2, width: b.width, height: b.height };
  }
});

ipcMain.on('pet:dragMove', (_e, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || !dragOffset) return;
  const screenX = Number(payload && payload.screenX);
  const screenY = Number(payload && payload.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
  const next = clampBoundsToWorkArea({
    x: Math.round(screenX - dragOffset.x),
    y: Math.round(screenY - dragOffset.y),
    width: dragOffset.width,
    height: dragOffset.height,
  });
  mainWindow.setBounds(next);
});

/** 兼容旧 delta 拖拽 */
ipcMain.on('pet:drag', (_e, { dx, dy }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  touchAttention();
  stopWander('drag');
  wanderPaused = true;
  mainWindow.setIgnoreMouseEvents(false);
  const b = mainWindow.getBounds();
  const next = clampBoundsToWorkArea({
    x: b.x + (Number(dx) || 0),
    y: b.y + (Number(dy) || 0),
    width: b.width,
    height: b.height,
  });
  mainWindow.setBounds(next);
});

ipcMain.on('pet:dragEnd', () => {
  dragOffset = null;
  wanderPaused = false;
  touchAttention();
  schedulePersistBounds();
});

ipcMain.on('pet:noticeAttention', () => {
  touchAttention();
  stopWander('attention');
});

ipcMain.on('pet:setClickThrough', (_e, enabled) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (enabled) mainWindow.setIgnoreMouseEvents(true, { forward: true });
  else mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('pet:resizeBy', (_e, { dw, dh }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  touchAttention();
  stopWander('resize');
  const b = mainWindow.getBounds();
  const width = Math.min(520, Math.max(160, b.width + (Number(dw) || 0)));
  const height = Math.min(720, Math.max(180, b.height + (Number(dh) || 0)));
  mainWindow.setBounds(clampBoundsToWorkArea({ x: b.x, y: b.y, width, height }));
});

ipcMain.handle('pet:getBounds', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow.getBounds();
});

ipcMain.handle('pet:setBounds', (_e, bounds) => {
  if (!mainWindow || mainWindow.isDestroyed() || !bounds) return null;
  touchAttention();
  stopWander('setBounds');
  const width = Math.min(520, Math.max(160, Number(bounds.width) || 220));
  const height = Math.min(720, Math.max(180, Number(bounds.height) || 260));
  const cur = mainWindow.getBounds();
  mainWindow.setBounds(clampBoundsToWorkArea({
    x: Number.isFinite(bounds.x) ? Number(bounds.x) : cur.x,
    y: Number.isFinite(bounds.y) ? Number(bounds.y) : cur.y,
    width,
    height,
  }));
  return mainWindow.getBounds();
});

ipcMain.handle('pet:startWander', (_e, opts) => startWander(opts || {}));
ipcMain.handle('pet:stopWander', (_e, reason) => {
  stopWander(reason || 'ipc');
  return true;
});
ipcMain.handle('pet:setWanderPaused', (_e, paused) => {
  wanderPaused = !!paused;
  if (wanderPaused) stopWander('paused');
  return wanderPaused;
});
