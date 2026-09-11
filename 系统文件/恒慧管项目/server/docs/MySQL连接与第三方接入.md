# MySQL 连接与第三方接入

恒慧管业务库：`henghuiguan`（方案 B：按模块分表）。  
存储驱动：`.env` 中 `DB_DRIVER=mysql`。

本地账号密码见（**勿提交 Git**）：

`server/data/mysql-third-party.local.txt`

若文件不存在，可执行：

```bash
npm run setup-mysql-users
```

---

## 一、直连 MySQL（HeidiSQL / 其他系统）

### 连接参数

| 项 | 本机 | 局域网第三方 |
|----|------|----------------|
| Host | `127.0.0.1` | `10.100.120.2`（本机内网 IP，以实际为准） |
| Port | `3306` | `3306`（需放行防火墙） |
| Database | `henghuiguan` | 同左 |
| 字符集 | `utf8mb4` | 同左 |

### 账号

| 账号 | 权限 | 用途 |
|------|------|------|
| `hhg_app` | 读写业务表 | 恒慧管后端（`.env` 的 `MYSQL_USER`） |
| `hhg_readonly` | 仅 SELECT | 第三方只读查询 / BI |

### HeidiSQL

1. 新建会话 → 网络类型 MySQL (TCP/IP)
2. 主机 / 用户 / 密码 / 端口按上表填写
3. 打开后展开库 `henghuiguan`，可见 `users`、`projects`、`tasks` 等表
4. 看数据：选中表 → 顶部 **「数据」** 页（不要停在「基本」结构页）

### 连接串示例

```text
mysql://hhg_readonly:密码@127.0.0.1:3306/henghuiguan
```

```text
jdbc:mysql://127.0.0.1:3306/henghuiguan?useSSL=false&characterEncoding=utf8&serverTimezone=Asia/Shanghai
```

### 主要业务表

| 表 | 说明 |
|----|------|
| `users` | 用户（含 name / role 索引列 + `data` JSON） |
| `projects` | 项目 |
| `tasks` | 任务 |
| `task_dependencies` | 任务依赖 |
| `change_logs` / `transfer_logs` / `push_logs` | 日志 |
| `notifications` | 站内通知 |
| `kpi_plans` | 绩效计划 |
| `app_meta` | 单例配置（如 `workCalendar`） |
| `app_store` | 方案 A 整库备份，可忽略 |

完整对象在每行的 `data` 字段（JSON）。

### 局域网访问注意

当前 MySQL 若仅监听本机，第三方电脑连不上。需要：

1. `my.ini` 中 `bind-address=0.0.0.0`（或注释掉）
2. 重启 MySQL
3. 防火墙放行 `3306`
4. 使用已授权 `'hhg_readonly'@'%'` 账号

---

## 二、HTTP 接口（`/api/external`）

适合：第三方系统不直连数据库，通过恒慧管 API 读写。

### 鉴权

请求头：

```http
X-Api-Key: <与 .env 中 API_KEY 相同>
```

未配置 `API_KEY` 时接口返回 503。

### Base URL

```text
{PUBLIC_BASE_URL}/api
```

本地示例：`http://127.0.0.1:3000/api`

### 常用接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/external/health` | 健康检查 |
| GET | `/external/catalog` | 可写资源目录（机器可读，最准） |
| GET | `/external/project-templates` | 模板库 |
| POST/PATCH/DELETE | `/external/projects` | 项目 |
| POST | `/external/projects/:id/sync-phase` | 同步阶段 |
| POST | `/external/projects/:id/handover` | 负责人交接 |
| GET | `/external/projects/:id/plan-ledger` | 计划台账导出 |
| POST | `/external/projects/:id/plan-verify` | 计划台账校验 |
| POST/PATCH/DELETE | `/external/tasks` | 任务 / 里程碑 |
| GET/POST/PATCH | `/external/issues` | 问题闭环 |
| GET | `/external/history` | 变更日志查询 |
| POST | `/external/tasks/:id/comments` | 评论 |
| POST/PATCH/DELETE | `/external/dependencies` | 依赖 |
| POST | `/external/users` | 用户 upsert |
| PUT | `/external/work-calendar` | 工作日历 |
| POST | `/external/change-logs` | 追加变更日志 |
| POST | `/external/batch` | 批量写入 |

完整字段与示例见：[第三方写入接口.md](./第三方写入接口.md)。

### 调用示例

```bash
curl -s -H "X-Api-Key: 你的API_KEY" http://127.0.0.1:3000/api/external/health
curl -s -H "X-Api-Key: 你的API_KEY" http://127.0.0.1:3000/api/external/catalog
```

只读查询另见 WorkBuddy：`GET /api/workbuddy/query`（`WORKBUDDY_API_KEY` 或共用 `API_KEY`），文档 [workbuddy.md](./workbuddy.md)。  
人员级权限可用作用域 Key：[作用域Key接入说明.md](../../作用域Key接入说明.md)。

---

## 三、运维命令

```bash
cd server
# 从 app_store / JSON 拆入分表
npm run migrate-mysql-tables

# （可选）仅从本地 JSON 导入
npm run migrate-mysql-tables -- --from-json

# 创建/重置 hhg_app、hhg_readonly（写入 data/mysql-third-party.local.txt）
npm run setup-mysql-users
```

后端必须 `DB_DRIVER=mysql` 且 `MYSQL_*` 指向可写账号（推荐 `hhg_app`）。
