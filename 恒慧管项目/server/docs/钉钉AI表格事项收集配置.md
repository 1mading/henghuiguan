# 钉钉 AI 表格事项收集配置指南

他人通过钉钉 **AI 表格表单** 提报事项后，自动化流程会 HTTP 回调恒慧管，**直接生成你的临时任务**并发送钉钉工作通知。

## 一、恒慧管服务端配置

在 `恒慧管项目/server/.env` 中增加（参考 `.env.example`）：

```env
INTAKE_AITABLE_ENABLED=true
INTAKE_AITABLE_API_SECRET=请填写随机强密钥
INTAKE_AITABLE_ASSIGNEE_NAME=王元斌
```

| 配置项 | 说明 |
|--------|------|
| `INTAKE_AITABLE_ENABLED` | 设为 `true` 启用 |
| `INTAKE_AITABLE_API_SECRET` | 与 AI 表格自动化 HTTP 节点中的 APISecret **完全一致** |
| `INTAKE_AITABLE_ASSIGNEE_NAME` | 固定负责人姓名（须在人员档案中存在） |
| `INTAKE_AITABLE_ASSIGNEE_NAMES` | 可选，逗号分隔多人；留空则用 `ASSIGNEE_NAME` |

配置后重启后端：

```bash
cd 恒慧管项目/server
npm start
```

接口地址：

```
POST {PUBLIC_BASE_URL}/api/intake/aitable
```

### 网络要求

AI 表格在钉钉云端发 HTTP，**必须能访问你的 API 地址**：

- 若服务器仅内网 `192.168.x.x`，需公网域名/端口映射或内网穿透（frp、ngrok 等）
- 将 `PUBLIC_BASE_URL` 设为 AI 表格能访问的地址
- 可选：防火墙对白名单 IP 放行（钉钉文档网段：`203.119.128.0/17`、`59.82.0.0/16`、`140.205.0.0/16`、`106.11.0.0/16`）

---

## 二、钉钉 AI 表格建表

建议列名与接口字段对应：

| AI 表格列名 | 类型 | 说明 |
|-------------|------|------|
| 事项标题 | 文本 | 必填 |
| 详细说明 | 多行文本 | 可选 |
| 期望完成日期 | 日期 | 空则默认明天 |
| 优先级 | 单选：普通 / 重要 / 紧急 | 可选 |
| 提交人 | 人员 | 表单自动带出当前填写人 |
| 附件 | 附件 | 可选，支持图片/文档等（单文件 ≤20MB） |

> **提交人变量注意**：自动化里请插入「提交人」的 **姓名**，不要插 **userid**。  
> 若误传 userid，恒慧管会尝试按钉钉 userid 匹配人员档案；匹配不到就会提示「不在人员档案中」。  
> 人员档案里「朱贵乔」的 `dingTalkUserId` 须与钉钉一致（可重新同步通讯录）。

> 负责人**不要**放在表单里，由 `.env` 固定，避免填错。

---

## 三、发布表单

1. 在 AI 表格创建「表单视图」
2. 生成分享链接或二维码
3. 发到部门群、工作台或工作通知，同事在钉钉内打开填写

---

## 四、配置自动化流程

1. 打开 AI 表格 → **自动化** → 新建流程
2. **触发条件**：`表单提交时` → 选择上述表单
3. **执行动作**：`HTTP 请求`
   - 方法：`POST`
   - URL：`{PUBLIC_BASE_URL}/api/intake/aitable`
   - Header：`Content-Type: application/json`
   - **APISecret**：填写与 `.env` 中 `INTAKE_AITABLE_API_SECRET` 相同的密钥
   - 请求体（字段用 AI 表格「引用变量」插入）：

```json
{
  "recordId": "{{记录ID}}",
  "title": "{{事项标题}}",
  "desc": "{{详细说明}}",
  "dueDate": "{{期望完成日期}}",
  "priority": "{{优先级}}",
  "submitterName": "{{提交人姓名}}",
  "submittedAt": "{{提交时间}}",
  "附件名": {{附件.附件内容.附件名}},
  "附件临时链接": {{附件.附件内容.附件临时链接}},
  "附件大小": {{附件.附件内容.附件大小}},
  "附件类型": {{附件.附件内容.附件类型}}
}
```

> **附件变量怎么选（多数界面选不了「附件内容」整项，这是正常的）**  
> 展开：**附件 → 附件内容**，分别插入下面 4 个叶子字段（**不要加引号**）：
>
> | 请求体字段 | 插入变量路径 |
> |------------|--------------|
> | `附件名` | 附件 → 附件内容 → **附件名** |
> | `附件临时链接` | 附件 → 附件内容 → **附件临时链接** |
> | `附件大小` | 附件 → 附件内容 → **附件大小** |
> | `附件类型` | 附件 → 附件内容 → **附件类型** |
>
> 有文件时优先保证 **附件临时链接** 能插入成功；没有附件的提交也可以留空数组。

4. （可选）增加第二步 `发送消息`，给提交人回复「已收到，已生成任务」
5. **发布**自动化

钉钉会在请求 Header 自动附带：

- `x-ddpaas-signature-timestamp`
- `x-ddpaas-signature`

恒慧管据此验签，无需 JWT。

---

## 五、接口响应

成功创建：

```json
{
  "success": true,
  "taskId": "T-XXXX",
  "duplicate": false,
  "message": "临时任务已创建"
}
```

重复提交同一 `recordId`（幂等）：

```json
{
  "success": true,
  "taskId": "T-XXXX",
  "duplicate": true,
  "message": "该记录已生成任务"
}
```

失败示例：

| HTTP | 原因 |
|------|------|
| 401 | 签名错误或缺少 Header |
| 400 | 事项标题为空 |
| 503 | 未启用 / 未配置 Secret / 找不到负责人 |

---

## 六、验收步骤

1. `.env` 配置 Secret 与负责人，重启后端
2. 用 curl 模拟带签名的 POST（见下方示例）
3. 登录恒慧管：任务中心出现【临时】新任务，标签含「表单提报」
4. 检查钉钉工作通知 / 应用内铃铛
5. 在 AI 表格真实提交一条，验证端到端
6. 重复提交同一记录，确认不重复建任务

### curl 测试示例

```bash
# 将 SECRET、URL、时间戳替换为实际值
TS=$(date +%s)000
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256','你的SECRET').update('$TS').digest('base64'))")

curl -X POST "http://你的地址:3000/api/intake/aitable" \
  -H "Content-Type: application/json" \
  -H "x-ddpaas-signature-timestamp: $TS" \
  -H "x-ddpaas-signature: $SIG" \
  -d '{"recordId":"test-001","title":"测试表单提报","desc":"来自 curl","priority":"重要"}'
```

---

## 七、安全提醒

- **Webhook URL 与 APISecret 勿公开**，勿提交到 Git
- 生产环境务必配置强随机 `INTAKE_AITABLE_API_SECRET`
- 任务在恒慧管中标记 `intakeMeta.source = aitable`，便于溯源

---

## 八、常见问题

**Q：自动化显示 HTTP 失败？**

- 检查 `PUBLIC_BASE_URL` 是否公网可达
- 检查 APISecret 是否与 `.env` 一致
- 检查负责人姓名是否在人员档案中

**Q：任务创建了但没收到钉钉通知？**

- 确认负责人已绑定 `dingTalkUserId`
- 确认钉钉应用密钥已配置；未配置时仅写入应用内通知

**Q：同事提交后我看不到任务？**

- 临时任务仅负责人/创建人/相关人可见；确认 `ASSIGNEE_NAME` 是你本人
