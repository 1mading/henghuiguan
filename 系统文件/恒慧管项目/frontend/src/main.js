/**
 * 入口：样式 + 主题 + 反馈，再按 manifest 顺序注入经典脚本（共享全局作用域，兼容 onclick）。
 *
 * 业务 JS 按 comment seam 拆在 src/app/*.js；运行时拼成单一 classic script，
 * 避免 ESM 模块作用域切断 let/function 与 onclick 的全局约定。
 */
import './styles/index.css';
import { initTheme, exposeThemeGlobals } from './theme.js';
import { exposeFeedbackGlobals } from './feedback.js';
import manifest from './app/manifest.json';

initTheme();
exposeThemeGlobals();
exposeFeedbackGlobals();

/** Vite 静态分析：按序号分片载入（含 23a- 这类字母后缀分片） */
const rawModules = {
  ...import.meta.glob('./app/[0-9][0-9]-*.js', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob('./app/[0-9][0-9][a-z]-*.js', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
};

function loadAppParts() {
  const chunks = [];
  for (const file of manifest.parts) {
    const key = `./app/${file}`;
    const code = rawModules[key];
    if (typeof code !== 'string') {
      throw new Error(`缺少前端分片: ${file}`);
    }
    chunks.push(code);
  }
  const script = document.createElement('script');
  script.textContent = chunks.join('\n\n');
  document.body.appendChild(script);
}

try {
  loadAppParts();
} catch (err) {
  console.error('[hhg] 前端模块加载失败', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;text-align:center;font-family:sans-serif;">
        <div style="font-size:16px;font-weight:600;">恒慧管加载失败</div>
        <div style="font-size:13px;color:#6B6B6B;">${String(err && err.message || err)}</div>
        <button type="button" onclick="location.reload()" style="margin-top:8px;padding:8px 16px;border-radius:8px;border:1px solid #E8E8E4;background:#fff;cursor:pointer;">重新加载</button>
      </div>
    `;
  }
}
