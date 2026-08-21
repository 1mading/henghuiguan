# 📊 数据格式说明 (DATA_FORMAT.md)
> 维护方：Hermes
> 消费方：Cursor（前端读取/展示）
> 最后更新：2026-07-29 15:30

## 一、Hermes 写入的表（Cursor 可读）

### 1. `alerts` 表 - 预警/冲突记录
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | UUID 主键 |
| `project_id` | TEXT | 关联项目 ID |
| `task_id` | TEXT | 关联任务 ID |
| `alert_type` | TEXT | 类型：`overdue`（逾期）/ `conflict`（冲突）/ `risk`（风险） |
| `severity` | TEXT | 严重度：`low` / `medium` / `high` / `critical` |
| `title` | TEXT | 预警标题 |
| `message` | TEXT | 预警详情 |
| `payload_json` | TEXT | 扩展信息 JSON |
| `is_resolved` | INTEGER | 0=未解决 / 1=已解决 |
| `source` | TEXT | `app`（Cursor 写入）/ `daemon`（Hermes 写入） |
| `created_at` | TEXT | ISO 8601 时间戳 |
| `resolved_at` | TEXT | 解决时间（空=未解决） |

**Cursor UI 展示建议：**
- 读取 `is_resolved=0 AND source='daemon'` 的记录，在首页/项目页展示预警卡片
- 支持点击"标记已解决"（更新 `is_resolved=1`）

### 2. `tasks` 表 - `is_overdue` 字段
| 字段 | 类型 | 说明 |
|------|------|------|
| `is_overdue` | INTEGER | 0=未逾期 / 1=已逾期（Hermes 定时扫描/回溯补算更新） |

**Cursor UI 展示建议：**
- 读取 `is_overdue=1` 的任务，UI 标红/加逾期图标
- 任务完成时更新 `status='done'`，Hermes 会自动将 `is_overdue` 重置为 0

### 3. `projects` 表 - `progress` 字段
| 字段 | 类型 | 说明 |
|------|------|------|
| `progress` | REAL | 0-100 百分比（Hermes 定时根据任务完成情况计算更新） |

**Cursor UI 展示建议：**
- 3D 卡片上展示进度条/百分比
- 可手动覆盖（Cursor 写入），Hermes 下次计算会重新覆盖

### 4. `daemon_state` 表 - 运维状态（Hermes 主写）
| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | TEXT | 键名 |
| `value` | TEXT | 键值 |
| `updated_at` | TEXT | 更新时间 |

**常用键：**
| 键名 | 值示例 | 说明 |
|------|--------|------|
| `last_boot_at` | `2026-07-29T15:30:00` | 本次启动时间 |
| `last_shutdown_at` | `2026-07-29T14:00:00` | 上次关机时间 |
| `last_heartbeat_at` | `2026-07-29T15:35:00` | 最近心跳时间 |
| `daemon_version` | `1.0.0` | 脚本版本 |

**Cursor UI 展示建议：**
- 设置页展示"服务状态"：读取 `last_heartbeat_at`，超过 3 分钟未更新则显示"服务离线"

### 5. `job_runs` 表 - 任务执行记录
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | UUID |
| `job_name` | TEXT | 任务名：`overdue_scan` / `progress_calc` / `boot_backfill` / `backup` |
| `status` | TEXT | `running` / `success` / `failed` / `skipped` |
| `started_at` | TEXT | 开始时间 |
| `finished_at` | TEXT | 结束时间 |
| `detail_json` | TEXT | 执行详情 JSON |
| `error_message` | TEXT | 错误信息（成功时为空） |

**Cursor UI 展示建议：**
- 设置页"运行日志"区域，展示最近 20 条记录
- 状态为 `failed` 的记录标红

### 6. `backup_meta` 表 - 备份元数据
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | UUID |
| `backup_path` | TEXT | 备份文件路径 |
| `file_size` | INTEGER | 文件大小（bytes） |
| `checksum` | TEXT | SHA256 校验和 |
| `created_at` | TEXT | 创建时间 |
| `is_valid` | INTEGER | 0=无效 / 1=有效 |

**Cursor UI 展示建议：**
- 设置页"数据备份"区域，展示最近备份时间/大小
- 支持手动触发备份（Cursor 写入一条记录，Hermes 检测到后执行）

### 7. `memory_records` 表 - 跨会话记忆
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | UUID |
| `category` | TEXT | `habit` / `risk` / `review` / `note` |
| `project_id` | TEXT | 关联项目 ID（可为空） |
| `content` | TEXT | 记忆内容 |
| `meta_json` | TEXT | 扩展信息 |
| `created_at` | TEXT | 创建时间 |

**Cursor UI 展示建议：**
- 知识库/记忆页展示历史风险/复盘记录

---

## 二、Hermes 读取的表（Cursor 主写）

### 1. `tasks` 表
| 字段 | Hermes 用途 |
|------|------------|
| `due_at` | 判断是否逾期 |
| `status` | 排除已完成/已取消的任务 |
| `project_id` | 关联预警记录 |

### 2. `projects` 表
| 字段 | Hermes 用途 |
|------|------------|
| `status` | 仅计算活跃项目的进度 |
| `id` | 关联任务统计 |

---

## 三、数据流向图

```
Cursor 写入 tasks/projects → Hermes 读取 → 计算进度/扫描逾期 → 写入 alerts/daemon_state/job_runs
                                                              ↓
Cursor 读取 alerts/daemon_state/job_runs → 前端 UI 展示预警/服务状态/运行日志
```

---

## 四、注意事项

1. **时间格式统一**：所有时间字段使用 ISO 8601 格式（`YYYY-MM-DDTHH:MM:SS`）
2. **并发安全**：SQLite WAL 模式已启用，Hermes 和 Cursor 可同时读写
3. **外键约束**：已启用 `PRAGMA foreign_keys=ON`，删除项目会自动级联删除关联任务和预警
4. **不要手动修改 `daemon_state` / `job_runs`**：这些表由 Hermes 自动维护
