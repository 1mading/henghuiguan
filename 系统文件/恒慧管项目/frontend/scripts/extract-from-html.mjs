/**
 * 从根目录 恒慧管.html 抽出 CSS/JS，拆成 frontend/src 工程源文件。
 * 用法：node scripts/extract-from-html.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const htmlPath = path.join(projectRoot, '恒慧管.html');

const htmlRaw = fs.readFileSync(htmlPath, 'utf8');
const html = htmlRaw.replace(/\r\n/g, '\n');

function between(src, startMark, endMark) {
  const a = src.indexOf(startMark);
  if (a < 0) throw new Error('missing start: ' + startMark);
  const start = a + startMark.length;
  const b = src.indexOf(endMark, start);
  if (b < 0) throw new Error('missing end: ' + endMark);
  return src.slice(start, b);
}

const css = between(html, '<style>\n', '\n  </style>\n</head>').replace(/^\n/, '');
const scriptOpen = html.indexOf('<script>\n');
const scriptClose = html.lastIndexOf('\n  </script>');
if (scriptOpen < 0 || scriptClose < 0) throw new Error('missing script block');
const js = html.slice(scriptOpen + '<script>\n'.length, scriptClose);

// --- CSS split ---
const stylesDir = path.join(frontendRoot, 'src', 'styles');
fs.mkdirSync(stylesDir, { recursive: true });

const mobileIdx = css.indexOf('/* ========== 移动端适配 ========== */');
function extractRootBlock(src) {
  const start = src.indexOf(':root');
  if (start < 0) return '';
  const brace = src.indexOf('{', start);
  if (brace < 0) return '';
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}
const tokensBlock = extractRootBlock(css);

const semanticTokens = `
:root {
  /* 语义色（状态 / 优先级 / 反馈） */
  --success: #059669;
  --success-soft: #ECFDF5;
  --warning: #D97706;
  --warning-soft: #FEF3C7;
  --danger: #DC2626;
  --danger-soft: #FEF2F2;
  --info: #2563EB;
  --info-soft: #EFF6FF;
  --status-pending: #9CA3AF;
  --status-active: #2563EB;
  --status-done: #059669;
  --status-paused: #D97706;
  --priority-high: #DC2626;
  --priority-medium: #D97706;
  --priority-low: #6B7280;
  --toast-bg: #1F2937;
  --toast-fg: #FFFFFF;
  --overlay: rgba(0, 0, 0, 0.45);
  --hhg-transition: background-color .2s ease, color .2s ease, border-color .2s ease;
}

html[data-theme="dark"] {
  --bg-page: #12141A;
  --bg-panel: #1C1F28;
  --sidebar-bg: #1C1F28;
  --text: #E8E8E6;
  --text-muted: #A0A4AE;
  --text-light: #7A7F8A;
  --brand: #8B9AE8;
  --brand-dark: #A8B4F0;
  --brand-soft: #2A3148;
  --accent-urgent: #E8A84A;
  --border: #2E3440;
  --border-light: #252A35;
  --shadow: 0 1px 3px rgba(0,0,0,0.35);
  --success: #34D399;
  --success-soft: #0F2E24;
  --warning: #FBBF24;
  --warning-soft: #3A2E12;
  --danger: #F87171;
  --danger-soft: #3A1A1A;
  --info: #60A5FA;
  --info-soft: #1A2740;
  --status-pending: #9CA3AF;
  --status-active: #60A5FA;
  --status-done: #34D399;
  --status-paused: #FBBF24;
  --priority-high: #F87171;
  --priority-medium: #FBBF24;
  --priority-low: #9CA3AF;
  --toast-bg: #0B0D12;
  --toast-fg: #F3F4F6;
  --overlay: rgba(0, 0, 0, 0.65);
}

html[data-theme="dark"] body {
  background: var(--bg-page);
  color: var(--text);
}

html[data-theme="dark"] .mobile-nav {
  background: rgba(28, 31, 40, 0.94) !important;
  border-top-color: var(--border) !important;
}

html[data-theme="dark"] #boot-splash {
  background: var(--bg-page) !important;
  color: var(--text-muted) !important;
}
`;

let baseCss = css;
let responsiveCss = '';
if (mobileIdx >= 0) {
  baseCss = css.slice(0, mobileIdx).trimEnd();
  responsiveCss = css.slice(mobileIdx).trim() + '\n';
}

// Remove :root from base (moved to tokens) — keep rest
const rootInBase = extractRootBlock(baseCss);
const baseWithoutRoot = rootInBase
  ? baseCss.replace(rootInBase, '/* tokens moved to tokens.css */')
  : baseCss;

fs.writeFileSync(path.join(stylesDir, 'tokens.css'), `/* DESIGN tokens + 语义色 + 暗色主题 */\n${tokensBlock}\n${semanticTokens}\n`, 'utf8');
fs.writeFileSync(path.join(stylesDir, 'base.css'), `/* 基础布局与组件（自单文件抽出） */\n${baseWithoutRoot}\n`, 'utf8');
fs.writeFileSync(path.join(stylesDir, 'responsive.css'), `/* 移动端 / 平板适配 */\n${responsiveCss}\n
/* 平板（768–960）：侧栏可收、内容区加宽 */
@media (min-width: 769px) and (max-width: 960px) {
  .sidebar { width: 200px; }
  .main-header { padding-left: 16px; padding-right: 16px; }
  .task-status-grid { grid-template-columns: repeat(2, 1fr); }
}

/* 统一过渡，减少主题切换闪烁 */
body, .sidebar, .main-area, .card, .modal, .settings-dropdown, .mobile-nav {
  transition: var(--hhg-transition);
}
`, 'utf8');

fs.writeFileSync(path.join(stylesDir, 'feedback.css'), `/* 统一反馈：toast / 空状态 / loading */
.hhg-toast-host {
  position: fixed; z-index: 9999; right: 16px; bottom: 16px;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.hhg-toast {
  pointer-events: auto; min-width: 200px; max-width: 360px;
  padding: 10px 14px; border-radius: 10px;
  background: var(--toast-bg); color: var(--toast-fg);
  box-shadow: var(--shadow); font-size: 13px; line-height: 1.4;
  animation: hhg-toast-in .2s ease;
}
.hhg-toast.is-success { border-left: 3px solid var(--success); }
.hhg-toast.is-error { border-left: 3px solid var(--danger); }
.hhg-toast.is-info { border-left: 3px solid var(--info); }
@keyframes hhg-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.hhg-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 48px 20px; color: var(--text-muted); text-align: center;
}
.hhg-empty i { font-size: 28px; color: var(--text-light); }
.hhg-empty-title { font-size: 15px; font-weight: 600; color: var(--text); }
.hhg-empty-desc { font-size: 13px; max-width: 320px; }

.hhg-btn-loading { position: relative; pointer-events: none; opacity: .75; }
.hhg-btn-loading::after {
  content: ''; width: 14px; height: 14px; margin-left: 8px;
  border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 50%; display: inline-block; vertical-align: -2px;
  animation: hhg-spin .7s linear infinite;
}
`, 'utf8');

fs.writeFileSync(path.join(stylesDir, 'index.css'), `/* 恒慧管样式入口 */
@import './tokens.css';
@import './base.css';
@import './responsive.css';
@import './feedback.css';
`, 'utf8');

// --- JS split by section markers ---
const appDir = path.join(frontendRoot, 'src', 'app');
fs.mkdirSync(appDir, { recursive: true });

const sectionRe = /^[ \t]*\/\/ ========== .+ ========== *[ \t]*$/gm;
const markers = [];
let m;
while ((m = sectionRe.exec(js)) !== null) {
  markers.push({ index: m.index, title: m[0].replace(/^[ \t]*\/\/ ========== | ========== *[ \t]*$/g, '').trim() });
}

function slugify(title, i) {
  const map = {
    '基础数据': '01-base-data',
    '工作日历（由服务端下发，前端仅做运行时计算）': '02-work-calendar',
    '任务依赖（跨项目 FS）': '03-task-dependencies-core',
    '项目数据': '04-project-data',
    '任务数据': '05-task-data',
    '任务依赖': '06-task-deps-data',
    '修改日志': '07-change-logs',
    '问题/风险': '08-issues',
    '项目模板库': '09-project-templates',
    '转办记录': '10-transfer-logs',
    '系统状态': '11-system-state',
    '辅助函数': '12-helpers',
    '渲染主框架': '13-shell-render',
    '权限管理': '14-permissions',
    '数据安全（管理员）': '15-data-security',
    'KPI 计划（实施交付部）': '16-kpi-plans',
    '工作台（扣子模板布局）+ 任务中心': '17-dashboard',
    '任务卡片': '18-task-card',
    '数据导出': '19-export',
    '项目列表': '20-project-list',
    '项目甘特图（只读）': '21-gantt',
    '任务中心': '22-task-center',
    '项目详情': '23-project-detail',
    '归档管理': '24-archive',
    '人员档案': '25-staff',
    '后端 API & 钉钉推送（预留接口）': '26-api-dingtalk',
    '团队管理': '27-team',
    '任务依赖 UI': '28-deps-ui',
    '弹窗渲染': '29-modals-render',
    '任务详情弹窗': '30-task-detail-modal',
    '其他弹窗简化实现': '31-other-modals',
    '操作函数': '32-actions',
    '数据导入': '33-import-bootstrap',
  };
  return map[title] || `${String(i + 1).padStart(2, '0')}-section`;
}

const parts = [];
for (let i = 0; i < markers.length; i++) {
  const start = markers[i].index;
  const end = i + 1 < markers.length ? markers[i + 1].index : js.length;
  const body = js.slice(start, end).replace(/\n    $/,'\n').replace(/^/gm, '').replace(/^ {4}/gm, '');
  const name = slugify(markers[i].title, i);
  const file = `${name}.js`;
  fs.writeFileSync(path.join(appDir, file), body.trimEnd() + '\n', 'utf8');
  parts.push(file);
}

// Also keep full legacy for reference (not bundled)
const archiveDir = path.join(appDir, '_archive');
fs.mkdirSync(archiveDir, { recursive: true });
fs.writeFileSync(path.join(archiveDir, 'legacy-all.js'), js.replace(/^ {4}/gm, ''), 'utf8');

const manifest = {
  generatedAt: new Date().toISOString(),
  source: '恒慧管.html',
  parts,
};
fs.writeFileSync(path.join(appDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log('CSS → src/styles/');
console.log('JS parts:', parts.length, '→ src/app/');
console.log('Done.');
