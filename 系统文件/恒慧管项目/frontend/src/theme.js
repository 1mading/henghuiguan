/**
 * 主题：localStorage.hhg_theme = light | dark
 * 在经典脚本注入前执行，保证首屏不闪。
 */
const THEME_KEY = 'hhg_theme';

export function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch (_) { /* ignore */ }
  return 'light';
}

export function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (_) { /* ignore */ }
  return next;
}

export function toggleTheme() {
  return applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  applyTheme(getTheme());
}

/** 挂到 window，供 onclick / 经典脚本调用 */
export function exposeThemeGlobals() {
  window.getHhgTheme = getTheme;
  window.applyHhgTheme = applyTheme;
  window.toggleHhgTheme = () => {
    const next = toggleTheme();
    if (typeof window.render === 'function') window.render();
    else if (typeof window.showToast === 'function') {
      window.showToast(next === 'dark' ? '已切换夜间模式' : '已切换日间模式', 'success');
    }
    return next;
  };
}
