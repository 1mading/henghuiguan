const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const cssPath = path.join(root, 'data/_share-demo-extract.css');
const outPath = path.join(root, '..', '恒慧管-分享演示.html');
const css = fs.readFileSync(cssPath, 'utf8')
  .replace(/<\/?style[^>]*>/gi, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<\/?head[^>]*>/gi, '')
  .replace(/<\/?body[^>]*>/gi, '');

const extraCss = `
    /* share-demo login gate (same as formal) */
    .share-login-wrap {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 32px 20px;
      background: linear-gradient(165deg, #0F766E 0%, #134E4A 42%, #0F172A 100%);
    }
    .share-login-card {
      width: 100%; max-width: 420px; background: #fff; border-radius: 20px;
      padding: 36px 32px 28px; box-shadow: 0 24px 80px rgba(0,0,0,.28); text-align: center;
    }
    .share-login-mark {
      width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 16px;
      background: linear-gradient(135deg, #14B8A6, #0D9488);
      color: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px;
    }
    .share-login-tip {
      margin: 22px 0 0; padding: 16px; background: #F0FDFA; border: 1px solid #99F6E4;
      border-radius: 12px; text-align: left; font-size: 13px; color: #115E59; line-height: 1.7;
    }
    .share-login-btn {
      margin-top: 22px; width: 100%; padding: 12px 16px; border: none; border-radius: 10px;
      background: #0D9488; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
    }
    .share-login-btn:hover { background: #0F766E; }
    .share-login-foot { margin-top: 14px; font-size: 11px; color: #94A3B8; line-height: 1.5; }
    .toast {
      position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
      background: #0F172A; color: #fff; padding: 10px 16px; border-radius: 10px;
      font-size: 13px; z-index: 999; opacity: 0; transition: opacity .2s; pointer-events: none;
    }
    .toast.show { opacity: 1; }
    .modal-mask {
      position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 200;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .modal-box {
      background: #fff; border-radius: 16px; width: 100%; max-width: 520px;
      max-height: 90vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.2);
    }
    .modal-box .modal-header {
      padding: 18px 22px; border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-box .modal-body { padding: 18px 22px; }
    .modal-box .modal-footer {
      padding: 14px 22px; border-top: 1px solid var(--border);
      display: flex; justify-content: flex-end; gap: 8px;
    }
    .field { margin-bottom: 14px; }
    .field label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
    .field .input, .field .select, .field .textarea {
      width: 100%; height: auto; min-height: 38px; padding: 8px 12px;
    }
    .field .textarea { min-height: 80px; resize: vertical; }
    .todo-board-avatar {
      width: 22px; height: 22px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      color: #fff; font-size: 10px; font-weight: 600; flex-shrink: 0;
    }
    .breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); }
    .breadcrumb .sep { color: var(--text-light); }
    .breadcrumb .current { color: var(--text); font-weight: 600; }
    .global-search {
      flex: 1; max-width: 360px; margin: 0 16px; position: relative;
    }
    .global-search i {
      position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      color: var(--text-light); font-size: 13px;
    }
    .global-search input {
      width: 100%; height: 36px; border: 1px solid var(--border); border-radius: 8px;
      padding: 0 12px 0 34px; font-size: 13px; font-family: inherit; background: #fff;
    }
    .topbar-user {
      display: inline-flex; align-items: center; gap: 8px; border: none; background: transparent;
      font-family: inherit; color: var(--text); font-size: 13px; cursor: default;
    }
    .topbar-user .avatar {
      width: 28px; height: 28px; border-radius: 50%; background: var(--brand);
      color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;
    }
    .topbar-toggle { display: none; }
    .hide-mobile {}
    .status-todo { background: #F3F4F6; color: #6B7280; }
    .status-doing { background: #DBEAFE; color: #2563EB; }
    .status-done { background: #D1FAE5; color: #059669; }
    .status-paused { background: #FEF3C7; color: #D97706; }
    .content-intro { font-size: 13px; color: var(--text-muted); line-height: 1.6; }
`;

const js = fs.readFileSync(path.join(__dirname, '_share-demo-app.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>恒慧管 - 分享演示</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
${css}
${extraCss}
  </style>
</head>
<body>
  <div id="toast" class="toast"></div>
  <div id="app"></div>
  <script>
${js}
  </script>
</body>
</html>
`;

// UTF-8 BOM：双击 file:// 打开时避免被当成 GBK 导致中文乱码
const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
fs.writeFileSync(outPath, Buffer.concat([bom, Buffer.from(html, 'utf8')]));
console.log('wrote', outPath, 'bytes', bom.length + Buffer.byteLength(html), '(utf-8 bom)');
