# 恒慧管后端服务

部门内部项目管控系统的 API 服务，对接 `恒慧管.html` 前端已预留的全部接口。

## 技术栈

- **Node.js 18+** + Express
- **JSON 文件存储**（开发默认，文件位于 `server/data/henghuiguan.json`，无原生依赖）
- **JWT** 登录鉴权
- **钉钉 API** 预留（未配置密钥时走演示模式）

## 快速启动

```bash
cd server
npm install
npm start
```

启动后访问：

- 前端页面：http://localhost:3000/恒慧管.html
- 健康检查：http://localhost:3000/api/health
- API 根路径：`/api`

## 钉钉小程序

小程序工程：`server/miniapp/`（用钉钉开发者工具打开）

配置说明：[docs/钉钉配置指南.md](docs/钉钉配置指南.md)

用户操作手册（按角色）：[docs/操作手册/README.md](docs/操作手册/README.md)

```bash
# 1. 复制并填写凭证
copy .env.example .env
copy miniapp\config.js.example miniapp\config.js

# 2. 启动后端后，开发者工具导入 server/miniapp
```

## 配置

复制环境变量模板：

```bash
copy .env.example .env
```

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口，默认 3000 |
| `JWT_SECRET` | JWT 密钥，生产必改 |
| `DB_PATH` | 数据文件路径（JSON） |
| `DINGTALK_*` | 钉钉应用凭证（可选） |
| `ALLOW_DEMO_LOGIN` | 允许演示登录，默认 true |

## API 一览

### 登录鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/dingtalk/auth/login-by-userid` | 钉钉 userid 跳转登录 |
| POST | `/api/dingtalk/miniapp/login` | 小程序 authCode 免登 |
| POST | `/api/dingtalk/auth/oauth/callback` | H5 OAuth 回调 |
| GET | `/api/auth/session` | 获取当前会话 |
| POST | `/api/auth/logout` | 退出登录 |
| POST | `/api/auth/refresh` | 刷新 token |
| POST | `/api/auth/demo-login` | 演示登录 `{ userId }` |

### 业务数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/data/bootstrap` | 拉取全量数据（按角色过滤） |
| PUT | `/api/data/sync` | 同步前端数据到服务端 |

### 钉钉

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/dingtalk/users/sync` | 同步通讯录 |
| POST | `/api/dingtalk/push/work-notification` | 工作通知 |
| POST | `/api/dingtalk/push/batch` | 批量推送 |
| GET | `/api/dingtalk/push/status` | 推送记录 |

## 前端启用后端

在 `恒慧管.html` 中，当通过 `http://localhost:3000` 访问时，会自动启用后端模式：

- 数据从 SQLite 加载/保存，不再依赖 localStorage
- 切换用户时同步登录后端获取 token

手动启用（部署到生产时）：

```javascript
ApiConfig.enabled = true;
ApiConfig.baseUrl = 'https://your-domain.com/api';
AuthConfig.mode = 'dingtalk';
```

## 数据库

首次启动自动执行 seed，写入演示用户/项目/任务。

重新初始化：

```bash
# 删除数据文件后重启
del data\henghuiguan.json
npm start
```

## 迁移到 MySQL

当前使用 JSON 文件便于本地开发。上线时可替换 `database.js` 中的存储层为 `mysql2`，接口保持不变即可。
