# 桌宠（开发源码）

通用桌面挂件壳：外观 / 溜达 / 打字模仿与业务解耦；**地址、登录方式、通知接口**可在设置里配置。内置「恒慧管」预设，一键对接现网协议。

源码目录。发给同事请用仓库根目录的 **`恒慧管桌宠/`** 封装包（若已同步）。

## 本机开发启动

```bat
启动桌宠.bat
```

需已有 `vendor\electron\electron.exe`（便携 Electron）。

## 同步到根目录封装包

```bat
powershell -ExecutionPolicy Bypass -File pack-dist.ps1
```

会更新：

- `系统文件/恒慧管桌宠/app/`（程序）
- `系统文件/恒慧管桌宠/启动桌宠.bat`
- `runtime/`（若尚无则从 `vendor\electron` 复制）

## 功能摘要

- 四套造型：琥珀猫 / 灰猫 / 白猫 / 小狐（设置或托盘切换）
- 闲置 N 分钟后满屏溜达（可配置，不出屏幕）
- 打字模仿；透明点击穿透
- **可配置数据源**：API 基址、主站 URL、登录方式、通知列表与 SSE

## 设置：地址 / 登录 / 通知

打开托盘 →「设置 / 登录」。

| 区块 | 说明 |
|------|------|
| 数据源预设 | `恒慧管`：写入现网路径与字段；`自定义`：自行改协议 |
| 地址 | `API 地址`、`主站地址`、`显示名称`（托盘「打开××」文案） |
| 登录 | **从主站登录（正式账号）**推荐；亦可演示登录 / 粘贴 Token / 自定义 POST |
| 通知 | 列表 path、字段映射；可选 SSE path / 事件名 / 触发 `type`；关闭 SSE 时用轮询（默认 60s） |

「测试连接」会走登录（或校验 Token）再拉通知列表，成功则保存 token。

配置落在 Electron `userData/pet-config.json`，升级后旧配置会与默认深合并，缺字段自动补全。

## 其它系统最小对接约定

对方后端需至少提供：

1. **登录（可选）**  
   - `POST {apiBase}{loginPath}`，JSON 体（可用 `{{userId}}` 模板）  
   - 响应中含 token（默认字段 `token`，可改 `tokenPath`）  
   - 或跳过登录，在设置里直接粘贴 Token

2. **通知列表**  
   - `GET {apiBase}{listPath}`，请求头 `Authorization: Bearer {token}`（模板可改）  
   - JSON 中含未读数与列表（默认 `unreadCount` / `items`，条目默认 `title` / `content` / `eventType`）

3. **实时推送（可选）**  
   - SSE：`GET {apiBase}{realtime.path}?token=…`  
   - 指定事件名（默认 `change`），payload 含 `type`（默认 `inbox.updated`）时刷新列表  
   - 无 SSE 时依赖轮询即可

恒慧管现网即上述约定的参考实现；不必改服务端，选预设即可。
