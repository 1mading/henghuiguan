/**
 * 统一反馈：toast / 空状态 HTML / 按钮 loading
 */
function ensureHost() {
  let host = document.getElementById('hhg-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'hhg-toast-host';
    host.className = 'hhg-toast-host';
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(message, type = 'info', ms = 2800) {
  const host = ensureHost();
  const el = document.createElement('div');
  el.className = `hhg-toast is-${type === 'error' || type === 'success' || type === 'info' ? type : 'info'}`;
  el.textContent = String(message || '');
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, ms);
}

export function emptyStateHtml({ icon = 'fa-inbox', title = '暂无数据', desc = '' } = {}) {
  return `
    <div class="hhg-empty">
      <i class="fas ${icon}"></i>
      <div class="hhg-empty-title">${title}</div>
      ${desc ? `<div class="hhg-empty-desc">${desc}</div>` : ''}
    </div>
  `;
}

export function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add('hhg-btn-loading');
    btn.setAttribute('disabled', 'disabled');
  } else {
    btn.classList.remove('hhg-btn-loading');
    btn.removeAttribute('disabled');
  }
}

export function exposeFeedbackGlobals() {
  window.showToast = showToast;
  window.hhgEmptyStateHtml = emptyStateHtml;
  window.setButtonLoading = setButtonLoading;
}
