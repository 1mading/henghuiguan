/**
 * 运维提醒：每天固定时刻检查「待发版」与「GitHub 待上传」，有待办时发钉钉工作通知。
 * 需后端常驻运行；默认关闭，配置 OPS_REMINDER_ENABLED=true 后生效。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../config');
const { getAllUsers } = require('../db/database');
const { RELEASES_DIR } = require('./systemUpdates');
const { sendWorkNotification, isConfigured } = require('./dingtalk');

const PENDING_FILE = path.join(RELEASES_DIR, '_pending.json');
const STATE_FILE = path.join(path.dirname(config.dbPath), '.ops-reminder-state.json');
const CHECK_INTERVAL_MS = 60 * 1000;

let timer = null;

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.warn('[opsReminder] 无法写入状态文件:', e.message);
  }
}

function readPendingItems() {
  try {
    if (!fs.existsSync(PENDING_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    return Array.isArray(raw.items) ? raw.items : [];
  } catch {
    return [];
  }
}

function findGitRoot() {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch (e) {
    const stderr = (e.stderr && String(e.stderr).trim()) || e.message;
    throw new Error(stderr);
  }
}

function inspectGit(repoRoot) {
  if (!repoRoot) {
    return { ok: false, reason: '未找到 Git 仓库', dirty: false, ahead: 0 };
  }
  try {
    const porcelain = runGit(['status', '--porcelain'], repoRoot);
    const dirty = porcelain.length > 0;
    let ahead = 0;
    try {
      const count = runGit(['rev-list', '--count', '@{u}..HEAD'], repoRoot);
      ahead = parseInt(count, 10) || 0;
    } catch {
      // 无上游分支时忽略 ahead
      ahead = 0;
    }
    return { ok: true, dirty, ahead, repoRoot };
  } catch (e) {
    return { ok: false, reason: e.message, dirty: false, ahead: 0 };
  }
}

function resolveRecipients() {
  const fromEnv = (config.opsReminder.dingTalkUserIds || []).filter(Boolean);
  if (fromEnv.length) return fromEnv;

  const users = getAllUsers() || [];
  const preferred = users.filter(
    u => (u.role === 'gm' || u.role === 'admin') && u.dingTalkUserId && u.dingTalkUserId !== 'demo'
  );
  const ids = preferred.map(u => String(u.dingTalkUserId));
  return [...new Set(ids)];
}

function buildMessage(pendingItems, gitInfo) {
  const lines = [];
  if (pendingItems.length) {
    lines.push(`待发版：${pendingItems.length} 条`);
    pendingItems.slice(0, 5).forEach((item, i) => {
      const t = item.type || 'improve';
      const text = item.text || '';
      lines.push(`  ${i + 1}. [${t}] ${text}`);
    });
    if (pendingItems.length > 5) {
      lines.push(`  …另有 ${pendingItems.length - 5} 条`);
    }
    lines.push('操作：在 Cursor 对话中回复「发版」确认发布。');
  }

  if (gitInfo.ok && (gitInfo.dirty || gitInfo.ahead > 0)) {
    const parts = [];
    if (gitInfo.dirty) parts.push('有未提交改动');
    if (gitInfo.ahead > 0) parts.push(`本地超前远程 ${gitInfo.ahead} 个提交`);
    lines.push(`上传 GitHub：${parts.join('；')}`);
    lines.push('操作：确认无敏感文件后，让我执行提交/推送。');
  } else if (!gitInfo.ok) {
    lines.push(`Git 状态检查失败：${gitInfo.reason || '未知错误'}`);
  }

  return lines.join('\n');
}

function hasActionable(pendingItems, gitInfo) {
  if (pendingItems.length > 0) return true;
  if (gitInfo.ok && (gitInfo.dirty || gitInfo.ahead > 0)) return true;
  return false;
}

function isAtOrPastReminderTime(now = new Date()) {
  const { hour, minute } = config.opsReminder;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= hour * 60 + minute;
}

/**
 * @param {{ force?: boolean }} [opts]
 */
async function runOpsReminder(opts = {}) {
  const force = !!opts.force;
  if (!config.opsReminder.enabled && !force) {
    return { skipped: true, reason: '未启用（OPS_REMINDER_ENABLED）' };
  }

  const state = readState();
  const today = todayKey();
  if (!force && state.lastSentDate === today) {
    return { skipped: true, reason: '今日已提醒' };
  }
  if (!force && !isAtOrPastReminderTime()) {
    return { skipped: true, reason: '未到提醒时刻' };
  }

  const pendingItems = readPendingItems();
  const gitInfo = inspectGit(findGitRoot());
  const actionable = hasActionable(pendingItems, gitInfo);
  if (!actionable && !force) {
    // 无待办也记一日，避免空闲日每分钟重复判断
    writeState({ ...state, lastSentDate: today, lastResult: 'idle' });
    return { skipped: true, reason: '无待发版且无 GitHub 待上传', pending: 0, git: gitInfo };
  }

  const recipients = resolveRecipients();
  if (!recipients.length) {
    console.warn('[opsReminder] 无接收人：请配置 OPS_REMINDER_DINGTALK_USER_IDS，或为 gm/admin 绑定钉钉 userid');
    return { skipped: true, reason: '无接收人', pending: pendingItems.length, git: gitInfo };
  }

  const title = '恒慧管 · 运维提醒';
  const content = actionable
    ? buildMessage(pendingItems, gitInfo)
    : '今日检查：无待发版、无 GitHub 待上传（测试触发）。';
  const result = await sendWorkNotification({
    dingTalkUserIds: recipients,
    title,
    content,
  });

  writeState({
    ...state,
    lastSentDate: today,
    lastResult: result.mock ? 'mock' : 'sent',
    lastSentAt: new Date().toISOString(),
  });

  console.log(
    '[opsReminder] 已发送',
    result.mock ? '(演示模式)' : '',
    `pending=${pendingItems.length}`,
    `dirty=${!!gitInfo.dirty}`,
    `ahead=${gitInfo.ahead || 0}`
  );
  return { sent: true, mock: !!result.mock, pending: pendingItems.length, git: gitInfo, recipients };
}

async function tick() {
  try {
    await runOpsReminder();
  } catch (e) {
    console.error('[opsReminder] 执行失败:', e.message || e);
  }
}

function startOpsReminderScheduler() {
  if (!config.opsReminder.enabled) {
    console.log('[opsReminder] 已关闭（设置 OPS_REMINDER_ENABLED=true 开启）');
    return;
  }
  if (timer) return;

  const { hour, minute } = config.opsReminder;
  console.log(
    `[opsReminder] 已开启：每天 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} 检查待发版/GitHub`
  );
  if (!isConfigured()) {
    console.warn('[opsReminder] 钉钉未配置，到点将走演示模式（不真正推送）');
  }

  // 启动后稍作延迟再检查一次（补发当日错过的提醒）
  setTimeout(() => tick(), 5000);
  timer = setInterval(() => tick(), CHECK_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

function stopOpsReminderScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startOpsReminderScheduler,
  stopOpsReminderScheduler,
  runOpsReminder,
  inspectGit,
  readPendingItems,
};
