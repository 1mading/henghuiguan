# WorkBuddy · 恒慧管查询接入

WorkBuddy（或任意 Agent）通过 **API Key** 调用恒慧管只读查询接口，无需登录 JWT。

## 前置条件

1. 后端 `.env` 配置 `API_KEY`（或单独的 `WORKBUDDY_API_KEY`）
2. 配置 `PUBLIC_BASE_URL` 为 WorkBuddy 能访问到的地址（内网 IP / 域名，需 HTTPS 时自行反代）
3. 重启后端服务

## 鉴权

| Header / Query | 说明 |
|----------------|------|
| `X-Api-Key: <密钥>` | 推荐 |
| `?key=<密钥>` | 备选（Skill 脚本不便加 Header 时） |

密钥优先匹配 `WORKBUDDY_API_KEY`，否则匹配 `API_KEY`。两者都未配置时接口返回 `503`。

亦支持**作用域 Key**（绑定人员档案，权限随该人一致）；见 [作用域Key接入说明.md](../作用域Key接入说明.md)。

## 接口一览

Base：`{PUBLIC_BASE_URL}/api`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/workbuddy/health` | 连通性 |
| GET | `/workbuddy/query` | 统一查询 |
| GET | `/workbuddy/projects/:id` | 项目详情 + 下属任务 |
| GET | `/workbuddy/projects/:id/plan-ledger` | 项目计划台账（管线格式） |
| GET | `/workbuddy/tasks/:id` | 任务详情 |
| GET | `/workbuddy/issues` | 问题列表（可筛 `projectId` / `status`） |
| GET | `/workbuddy/history` | 变更日志查询（`type` + `id`） |

### `/workbuddy/query` 参数

| 参数 | 说明 |
|------|------|
| `type` | `all`（默认）/ `projects` / `tasks` / `summary` |
| `keyword` | 名称/负责人/部门模糊搜 |
| `status` | 项目或任务状态，精确匹配 |
| `assignee` | 任务负责人（模糊） |
| `projectId` | 限定项目下的任务 |
| `limit` | 返回条数，默认 50，最大 200 |
| `includeArchived` | `1` 时含已归档项目 |
| `includeDone` | `1` 时任务列表含已完成（默认不含） |

### `/workbuddy/issues` 参数

| 参数 | 说明 |
|------|------|
| `projectId` | 按项目过滤 |
| `status` | `open` / `in_progress` / `resolved` / `verified` / `closed` |

### `/workbuddy/history` 参数

| 参数 | 说明 |
|------|------|
| `type` | `task` 或 `project`（作用域 Key **必填**） |
| `id` | 任务 ID 或项目 ID（作用域 Key **必填**） |
| `limit` | 默认 100 |

### 响应格式

```json
{
  "code": 200,
  "message": "ok",
  "data": { }
}
```

失败时 `code` 为 HTTP 状态码，`message` 为原因。

项目对象在查询结果中会包含：

- 推进字段：`currentPhase`、`nextPlan`、`blocker`
- 计划书字段：`objective`、`value`、`scope`、`outOfScope`、`endDate`、`planVerified` / `planVerifiedBy` / `planVerifiedAt`
- 基本信息：`desc`、`manager`、`status` 等

里程碑任务额外包含：`milestoneSeq`、`roleA`/`roleR`/`roleC`/`roleV`、`deliverables`、`acceptanceCriteria`、`outOfScope`、`completionEvidence`、`verification`/`feedback`/`leftover`、`depsRisks` 等。

### 计划台账

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/api/workbuddy/projects/PRJ-xxx/plan-ledger"
```

返回 `text`（可直接粘贴回复领导）与结构化 `rows`。

## 调用示例

```bash
BASE=https://你的域名
KEY=你的密钥

# 汇总
curl -s -H "X-Api-Key: $KEY" "$BASE/api/workbuddy/query?type=summary"

# 搜项目
curl -s -H "X-Api-Key: $KEY" "$BASE/api/workbuddy/query?type=projects&keyword=信息化"

# 某人未完成任务
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/api/workbuddy/query?type=tasks&assignee=张三&includeDone=0"

# 项目计划台账
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/api/workbuddy/projects/PRJ-xxx/plan-ledger"

# 问题列表
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/api/workbuddy/issues?projectId=PRJ-xxx&status=open"

# 项目变更历史
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/api/workbuddy/history?type=project&id=PRJ-xxx&limit=50"
```

## 在 WorkBuddy 中使用

### 方式 A：Skill（推荐）

将本仓库目录拷到 WorkBuddy skills 下：

`恒慧管项目/workbuddy-skill/henghuiguan-query/`

或在对话里安装该 Skill。环境变量：

- `HENGHUIGUAN_BASE_URL`：如 `https://henghuiguan.example.com`
- `HENGHUIGUAN_API_KEY`：与后端 `WORKBUDDY_API_KEY` / `API_KEY` 一致

然后对 WorkBuddy 说：「查一下恒慧管里进行中的项目」等，Skill 会按其调用上述接口。

### 方式 B：MCP 连接器

若已有 HTTP-MCP 桥，把同一组 URL + `X-Api-Key` 配进 `mcp.json` 即可；本仓库不强制附带 MCP Server。

## 安全说明

- 接口为**只读**，不写库
- 返回字段已裁剪（无完整 bootstrap、无私密工作汇报正文）
- 勿把真实密钥写进 Skill 仓库；用环境变量注入
- 写入能力见 [第三方写入接口.md](./第三方写入接口.md)

## 维护

功能变更后须与 `server/src/routes/workbuddy.js` 同步更新本文（仓库规则 `api-docs-sync`）。
