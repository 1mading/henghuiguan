# 恒慧管 · Windows 服务器部署（第 4 步）

域名：`https://henghuiguan.handagroup.com`

---

## 一、目录结构（服务器上）

建议把整个项目放到例如：

```
D:\apps\henghuiguan\
├── 恒慧管.html          ← H5 前端
├── server\              ← Node 后端
│   ├── .env
│   ├── data\
│   └── src\
```

---

## 二、安装 Node.js

1. 安装 **Node.js 18 LTS** 或更高：https://nodejs.org/
2. 命令行验证：

```powershell
node -v
npm -v
```

---

## 三、配置 `.env`

编辑 `server\.env`（生产环境关键项）：

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
PUBLIC_BASE_URL=https://henghuiguan.handagroup.com
CORS_ORIGINS=https://henghuiguan.handagroup.com
ALLOW_DEMO_LOGIN=false
STATIC_DIR=..

# 生产密钥（勿提交 git，可用 npm run rotate-secrets 生成）
JWT_SECRET=<随机强密钥>
API_KEY=<随机强密钥>

# 钉钉 H5 应用凭证
DINGTALK_CORP_ID=...
DINGTALK_APP_KEY=...
DINGTALK_APP_SECRET=...
DINGTALK_AGENT_ID=...
```

> **端口说明**：若运维把 `10057` 反向代理到本机 `3000`，则 `PORT` 保持 `3000`。若 Node 直接监听 `10057`，改为 `PORT=10057`。

---

## 四、安装依赖并启动

```powershell
cd D:\apps\henghuiguan\server
npm install
npm start
```

本机验证：

- http://127.0.0.1:3000/api/health
- http://127.0.0.1:3000/app

---

## 五、反向代理（由运维配置）

域名 `henghuiguan.handagroup.com` 需转发到 Node 服务，例如：

| 外网 | 内网 |
|------|------|
| `https://henghuiguan.handagroup.com/app` | `http://127.0.0.1:3000/app` |
| `https://henghuiguan.handagroup.com/api/` | `http://127.0.0.1:3000/api/` |

可用 **IIS + ARR** 或 **Nginx for Windows**。

---

## 六、开机自启（可选）

用 **NSSM** 或 **pm2-windows** 把 `node src/index.js` 注册为 Windows 服务。

NSSM 示例：

```powershell
nssm install HenghuiGuan "C:\Program Files\nodejs\node.exe" "D:\apps\henghuiguan\server\src\index.js"
nssm set HenghuiGuan AppDirectory D:\apps\henghuiguan\server
nssm start HenghuiGuan
```

---

## 七、钉钉开放平台（第 5 步）

在 H5 应用里配置：

| 项 | 值 |
|----|-----|
| 应用首页 | `https://henghuiguan.handagroup.com/app` |
| PC 首页 | 同上 |
| HTTP 安全域名 | `henghuiguan.handagroup.com` |
| 服务器出口 IP | **公网出口 IP**（见下方说明） |

### 关于出口 IP

`192.168.9.80` 是**内网地址**，不能填到钉钉「服务器出口 IP」。

请让运维提供：**服务器访问钉钉 API 时使用的公网出口 IP**（可在服务器上访问 https://api.ipify.org 查看）。

---

## 八、上线验证

1. 浏览器打开：`https://henghuiguan.handagroup.com/app`
2. 打开：`https://henghuiguan.handagroup.com/api/health`
3. 手机钉钉 → 工作台 → 恒慧管 → 应自动免登（账号须在 users 表有 dingTalkUserId）

---

## 九、常见问题

| 现象 | 处理 |
|------|------|
| 页面 502/404 | 检查反向代理是否指向 Node 端口 |
| 钉钉打不开 | 检查安全域名、应用是否发布 |
| 免登失败 | 检查 AppSecret、用户 dingTalkUserId |
| 仍显示演示切账号 | 确认域名是 henghuiguan.handagroup.com（生产自动切 dingtalk 模式） |
