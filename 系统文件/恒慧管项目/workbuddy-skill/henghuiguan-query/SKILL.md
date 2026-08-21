---
name: henghuiguan-query
description: "查询恒慧管项目与任务进度。触发词：恒慧管、项目进度、任务、待办、WorkBuddy 恒慧管"
---

# 恒慧管查询 Skill

通过 HTTP 只读接口查询恒慧管（企业工单/项目管控）数据。

## 环境变量（必填）

| 变量 | 说明 |
|------|------|
| `HENGHUIGUAN_BASE_URL` | 恒慧管根地址，无末尾斜杠，如 `http://192.168.1.10:3000` |
| `HENGHUIGUAN_API_KEY` | 与服务端 `WORKBUDDY_API_KEY` 或 `API_KEY` 相同 |

## 调用规则

1. 所有请求带 Header：`X-Api-Key: $HENGHUIGUAN_API_KEY`
2. 优先用脚本（传入查询串）：
   - Windows：`scripts/query.ps1 "type=summary"`
   - macOS/Linux：`scripts/query.sh "type=summary"`
3. 解析 JSON 的 `data` 字段后用中文向用户摘要；`code !== 200` 时原样说明错误

## 常用查询

- 总览：`GET {BASE}/api/workbuddy/query?type=summary`
- 项目：`GET {BASE}/api/workbuddy/query?type=projects&keyword=关键词`
- 任务：`GET {BASE}/api/workbuddy/query?type=tasks&assignee=姓名`
- 项目详情：`GET {BASE}/api/workbuddy/projects/{id}`
- 探活：`GET {BASE}/api/workbuddy/health`

完整参数见服务端文档 `server/docs/workbuddy.md`。

## 回答要求

- 用业务语言（进行中/待开始/已完成），少堆 JSON
- 条数多时只报最相关的若干条，并说明总数
- 无法连通时检查 Base URL、密钥与网络是否互通
