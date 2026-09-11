# 恒慧管前端（小 B）

Vite + 原生 JS 多模块。入口仍由后端以 `/app` 发放；钉钉主页地址不变。

## 开发

```bash
cd frontend
npm install
npm run extract   # 可选：从根目录 恒慧管.html 重新抽出 CSS/JS 分片
npm run dev       # http://localhost:5173 ，/api 代理到 :3000
```

## 构建与切换

```bash
npm run build
# 在 server/.env：
# HHG_FRONTEND=built
# FRONTEND_DIST=../frontend/dist
```

回滚：`HHG_FRONTEND=legacy`（发放根目录 `恒慧管.html`）。

也可在 `server/` 执行：`npm run build:web`。

## 目录

| 路径 | 说明 |
|------|------|
| `src/styles/` | tokens / base / responsive / feedback |
| `src/app/NN-*.js` | 按原单文件 comment seam 拆分的业务分片 |
| `src/theme.js` | 夜间模式（`localStorage.hhg_theme`） |
| `src/feedback.js` | toast / 空状态 / 按钮 loading |
| `public/vendor/` | Font Awesome、xlsx、frappe-gantt 自托管 |
| `dist/` | 构建产物（gitignore） |

业务分片在运行时拼成**一条经典 script** 注入，以兼容大量 `onclick` 全局函数约定。
