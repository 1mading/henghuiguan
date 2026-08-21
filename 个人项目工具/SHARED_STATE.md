# 📦 项目共享状态清单 (SHARED_STATE.md)
> 产品正式名：**棱镜项目工作台**（英文代号 Prism）
> 最后更新：2026-07-30 09:15（Cursor）
> 技术栈锁定：Tauri + React + TypeScript + Tailwind + SQLite
> 离线演示页：`棱镜项目工作台-演示.html`（单文件 Mock，可拷贝到其他电脑双击打开；不读写 SQLite）

## 🔒 契约区（双方必须遵守，修改需双方确认）
| 约定项 | 内容 | 状态 |
|--------|------|------|
| 数据库文件 | `data/project.db`（SQLite 单文件） | ✅ 锁定 |
| 表结构文件 | `schema/schema.sql`（由 Cursor 设计输出） | ✅ 锁定 |
| 后台脚本目录 | `scripts/daemon.py`（由 Hermes 维护） | ✅ 锁定 |
| 前端项目目录 | `frontend/`（Tauri 客户端） | ✅ 锁定 |
| 数据互通方式 | 仅通过 SQLite 读写，不引入中间文件/HTTP API | ✅ 锁定 |

> 说明：`frontend` 在 `npm run dev` 时使用本机 Vite 中间件 `/__sqlite/*` 访问同一个 `data/project.db`。这是 Cursor 前端的本地实现细节，**不是** Cursor↔Hermes 的数据互通协议；双方业务数据仍只落在 SQLite。

## 📊 进度区（完成一项打勾一项）
### Phase 1：独立开发
- [x] Cursor 输出 `schema/schema.sql` 初版（表结构+索引设计）
- [x] Hermes 确认表结构，开始编写 `scripts/daemon.py` 调度/回溯脚本（SQL 逻辑已填充）
- [x] Cursor 前端页面全部可运行（含 Mock 数据 + Tauri 基础环境）
- [ ] Hermes 完成 Windows 计划任务注册，测试开机自启/崩溃自恢复 ← **当前轮到 Hermes**
- [x] Hermes 输出 `DATA_FORMAT.md`（后台读取/写入的表列结构说明）

### Phase 2：合并联调（Cursor 全权主导）
- [x] Cursor 替换 Mock 数据，改读本地 SQLite
- [x] Hermes 只读验证：确认能正常读取 Cursor 写入的数据，服务稳定运行（验证通过）
- [x] Cursor 完成双向数据同步与页面刷新逻辑（前端读 projects/tasks/alerts/daemon_state/job_runs；可写 projects/tasks；可 resolve alerts；已加 8s 静默轮询）
- [x] 闭环测试通过：创建任务 → 写 DB → 后台扫描 → 预警刷新 → 前端显示（`scripts/loop_test.py` 通过：`is_overdue=1` + daemon alert + progress 回写）

### Phase 3：优化打包
- [ ] Cursor 完成 Tauri 打包，生成独立 EXE（需本机 Rust/MSVC）
- [ ] Hermes 验证 EXE 双击运行 + 后台服务自动注册 + 数据路径正确
- [ ] 最终验收交付

## 📥 交接记录
| 时间 | 交付方 | 交付内容 | 接收方确认 |
|------|--------|----------|-----------|
| 15:00 | Hermes | 初始化项目目录 + 共享清单 | ☑ Cursor |
| 14:45 | Cursor | `schema/schema.sql` 初版 | ☑ Hermes |
| 14:45 | Cursor | `frontend/` Tauri+React 骨架（Mock 首页） | ☑ Hermes（知悉即可） |
| 15:30 | Hermes | 确认表结构，`scripts/daemon.py` SQL 逻辑已填充 | ☑ Cursor |
| 15:30 | Hermes | `DATA_FORMAT.md` 数据格式说明 | ☑ Cursor |
| 15:20 | Cursor | `data/project.db` 已按 schema 初始化并写入种子数据；前端已对接读写 | ☑ Hermes（验证通过） |
| 15:20 | Cursor | `scripts/init_db.py`（可重建库） | ☑ Hermes（知悉即可） |
| 15:25 | Hermes | 只读验证通过：daemon.py 成功读取 Cursor 数据，进度计算/逾期扫描/心跳写入正常 | ☑ Cursor |
| 17:00 | Cursor | 闭环测试脚本 `scripts/loop_test.py` 通过；Phase 2 主体完成 | ☐ Hermes（知悉） |
| 09:15 | Cursor | 离线演示页 `棱镜项目工作台-演示.html`（可拷其他电脑双击预览 UI） | ☐ Hermes（知悉） |
| | Hermes | Windows 计划任务注册完成 | ☐ Cursor |
| | Cursor | Tauri 打包 EXE | ☐ Hermes |

## ⚠️ 问题反馈区
> 格式：[时间] [发现方] 问题描述 → [解决方] 解决方案

- [2026-07-29 14:40] [Cursor] 本机系统 Node 注册路径损坏（指向不存在的 D:\\），winget/管理员安装失败；已改用用户目录便携 Node `LocalAppData/nodejs-portable`。Rust/MSVC 尚未装好，`tauri dev` 需本机补齐 Rust 工具链后才能跑桌面壳；Web 端 `npm run dev` 可先行。
- [2026-07-29 14:45] [Cursor] 请 Hermes 确认 `schema/schema.sql`。 → [Hermes] 已确认。
- [2026-07-29 14:55] [Cursor] `DATA_FORMAT.md` 约定 Hermes 写入 `projects.progress`；Phase 1/2 采纳 Hermes 方案。
- [2026-07-29 15:20] [Cursor] Phase 2 前端已切 SQLite。验证方式：`python scripts/init_db.py` → `cd frontend && npm run dev` → 打开 http://localhost:1420/ ；健康检查 `GET /__sqlite/health`。请 Hermes 对同一 `data/project.db` 做只读验证（跑 daemon 扫描后看 alerts/progress 是否回写）。
- [2026-07-29 15:30] [先生] 项目正式命名：**棱镜项目工作台 (Prism)**。Cursor 正在更新 `tauri.conf.json` 等元数据文件。
- [2026-07-29 17:00] [Cursor] Phase 2 闭环已通过。下一步请 Hermes：完成 Windows 计划任务注册（开机自启 / 崩溃自恢复），并在清单勾选。完成后进入 Phase 3（Cursor 装 Rust 并打 EXE）。
