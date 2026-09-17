# 恒慧管 · 作用域 Key 个人接入说明

面向个人助手 / 脚本 / 任意 AI 的通用接入方式。  
**不要**使用全局 `API_KEY` 或 MySQL 账号 `hhg_app`。

## 你需要的材料

管理员会通过钉钉**工作通知**发给你（也可当面交付）：

1. **服务地址**（Base URL），例如 `http://10.x.x.x:3000`
2. **作用域 Key**（形如 `hhg_sk_…`）
3. 本文档链接

## 鉴权

所有请求增加请求头：

```http
X-Api-Key: <你的作用域 Key>
```

权限与你在恒慧管人员档案中的身份一致：

- **可读**：你相关的项目与任务（管理员/经理可读全公司）  
- **可写（读写 Key）**：你可管理的项目、你可编辑的任务；**可新建项目**（若账号有新建权限）；**可增删改临时事项**；**不可删除项目**  
- 越权返回 **403**

## 常用接口

### 连通性

```http
GET /api/workbuddy/health
```

### 查询汇总 / 项目 / 任务

```http
GET /api/workbuddy/query?type=summary
GET /api/workbuddy/query?type=projects
GET /api/workbuddy/query?type=tasks&assignee=你的姓名
GET /api/workbuddy/projects/<项目ID>
GET /api/workbuddy/tasks/<任务ID>
```

### 写入（需读写 Key）

新建项目：

```http
POST /api/external/projects
Content-Type: application/json

{ "name": "示例项目", "manager": "你的姓名" }
```

临时事项（可不传 projectId）：

```http
POST /api/external/tasks
Content-Type: application/json

{ "title": "临时事项标题", "type": "temp", "assignee": "你的姓名" }
```

```http
PATCH /api/external/tasks/<任务ID>
Content-Type: application/json

{ "status": "doing", "progress": 50 }
```

```http
DELETE /api/external/tasks/<任务ID>
```

更多写入能力见服务端文档「第三方写入接口」。作用域 Key **不能删除项目**、不能改人员/日历等系统级数据。

## 安全

- Key 等同你的接口身份，勿转发  
- 泄露请联系管理员在人员档案吊销并重签  
- 旧 Key 在重新「发送接入包」后会作废
