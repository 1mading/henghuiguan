# 恒慧管 · 部门内部项目管控系统

面向部门的项目与任务协作：权限分级、任务树、钉钉免登与通知、文档附件、系统更新记录。

## 仓库结构

根目录仅保留 AI 文件体系与工具配置；**全部业务在 `恒慧管项目/`**：

```text
Agent.md  Memory.md  Index.md  README.md  .ai/
恒慧管项目/   ← H5、后端、小程序、文档、启动脚本
```

`.git` / `.gitignore` / `.cursor` / `.githooks` 必须留在根目录（工具认固定路径，无法并入 Markdown）。规则正文已写入 `Agent.md`。

## 快速启动

**方式一**：双击 `恒慧管项目/启动恒慧管服务器.bat`

**方式二**：

```bash
cd 恒慧管项目/server
npm install
npm start
```

启动后：

- 前端：http://localhost:3000/恒慧管.html
- 健康检查：http://localhost:3000/api/health
- 会议室大屏：双击 `恒慧管项目/打开会议室大屏.bat`

## 主要入口

| 入口 | 说明 |
|------|------|
| `恒慧管项目/恒慧管.html` | PC / 浏览器 H5 主业务 |
| `恒慧管项目/server/miniapp/` | 钉钉小程序（开发者工具打开） |
| `恒慧管项目/server/docs/操作手册/` | 按角色用户手册 |
| `恒慧管项目/server/README.md` | 后端 API 与配置细节 |

首次配置：复制 `恒慧管项目/server/.env.example` → `.env`，`miniapp/config.js.example` → `config.js`（勿提交真实密钥）。

## 给协作者与 AI

1. [`Agent.md`](Agent.md) — AI 约束、发版与安全底线  
2. [`Memory.md`](Memory.md) — 目标、阶段、关键决策  
3. [`Index.md`](Index.md) — 目录归属与禁止行为  
4. [`.ai/devlog.md`](.ai/devlog.md) — 开发日志  

需求对照：[`恒慧管项目/恒慧管-需求整理.md`](恒慧管项目/恒慧管-需求整理.md)
