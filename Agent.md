# Agent.md · AI 入口约束（P0）

新会话或大改动前，按顺序阅读：`Agent.md` → `Memory.md` → `Index.md`。  
改需求前对照 [`恒慧管项目/恒慧管-需求整理.md`](恒慧管项目/恒慧管-需求整理.md)：只做「待落地」，勿重复已实现功能。

项目代码与资源均在 **`恒慧管项目/`** 下；仓库根目录仅保留本文件体系与必要的 Git/Cursor 工具目录。

## 技术栈

| 层 | 路径 | 说明 |
|----|------|------|
| H5 前端 | `恒慧管项目/恒慧管.html` | 主业务逻辑（单文件） |
| 后端 | `恒慧管项目/server/` | Node.js 18+、Express |
| 存储 | `恒慧管项目/server/data/henghuiguan.json` | JSON 文件库（开发默认） |
| 小程序 | `恒慧管项目/server/miniapp/` | 钉钉小程序（免登 + 原生首页） |
| 大屏 | `恒慧管项目/滚动大屏.html` | 会议室滚动展示 |

鉴权：JWT。钉钉 API 未配置密钥时走演示模式。

## 编码规范

- 只改任务相关文件；不顺手大范围重构
- 风格与现有代码一致（命名、结构、注释密度）
- 配置走环境变量或 `.env`，禁止把密钥/密码/token/环境相关配置硬编码进代码
- 外部 API 调用必须设置超时，并做异常处理
- 用户可见的功能/修复完成后：按下方「发版待确认」执行
- 有用户可见改动时，可在 `.ai/devlog.md` 当日条目补一行（不替代发版流程）

## 发版待确认 → 更新记录

完成任何用户可见的功能/修复后，**必须**在同一次回复里做完下面两步，缺一不可：

1. 写入待发列表（二选一）：
   - `cd 恒慧管项目/server && npm run record-change -- --type feature|fix|improve --text "用户可读的说明"`
   - 或直接编辑 `恒慧管项目/server/releases/_pending.json` 的 `items`
2. **在回复末尾主动问一句**：「是否现在发版？」——即使只改了一处、也不要默认跳过

用户未明确说「发版 / 发布 / 确认发版」之前：

- 只累计到 `_pending.json`
- **不要**运行 `publish-release`
- **不要**把待发内容写进数据库或正式版本 json

用户确认发版后，在 `恒慧管项目/server` 目录执行：

```bash
npm run publish-release
```

约定：`feature` / `fix` / `improve`；文案面向业务用户；纯文档/注释/不影响用户的改动可不记 pending、无需询问发版。

## 安全红线（违反即阻断）

1. **禁止**将敏感信息提交到 Git（存储密钥 / 密码 / token）
2. 所有配置通过环境变量或 `.env` 文件管理
3. `.env` 必须在 `.gitignore` 中（仓库已配置；勿削弱该规则）
4. 外部 API 调用必须有超时设置和异常处理

## 安全底线（GitHub）

**禁止提交（永远不要 add/commit）：**

| 类型 | 路径 |
|------|------|
| 环境变量/密钥 | `恒慧管项目/server/.env`、`恒慧管项目/server/miniapp/config.js` |
| 业务数据库 | `恒慧管项目/server/data/` |
| 真实 seed | `恒慧管项目/server/src/db/seed-data.json`、`seed-data.local.json` |
| 证书/密钥文件 | `*.pem`、`*.key`、`*.p12` |

**允许提交的模板：** `.env.example`、`config.js.example`、`seed-data.example.json`。

AI 行为要求：

1. 不要把上述敏感文件加入 commit，不要在代码/文档写真实 AppSecret、JWT_SECRET、API_KEY
2. 用户要求 push 到 GitHub 前，先运行：`node 恒慧管项目/scripts/check-secrets.js --staged`
3. 若 `恒慧管.html` 或 seed 含大量真实 `dingTalkUserId`，提醒改用演示数据或 `git rm --cached`
4. 已从 Git 追踪的敏感文件，用 `git rm --cached <path>` 移除；**不要** `git push --force` 除非用户明确要求

本地真实数据：复制 example → 本地文件并填写（勿提交）。

## 工作方式

1. 先读本文件与 `Memory.md` / `Index.md`，再动手
2. 落地需求前核对 `恒慧管项目/恒慧管-需求整理.md` §一（已实现）与 §二（待落地）
3. 工具目录说明：`.git` / `.gitignore` / `.cursor` / `.githooks` **不能**并入 Markdown（工具要认固定路径）；规则正文已写入本文件，`.cursor/rules` 仅保留薄入口强制阅读本体系
