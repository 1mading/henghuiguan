-- =============================================================================
-- 多项目本地管理工具 · SQLite Schema 初版
-- 维护方：Cursor（业务表结构唯一维护者）
-- 消费方：Cursor（CRUD/UI）+ Hermes daemon（只读业务表，读写运维表）
-- 契约：data/project.db ；修改本文件需双方确认
-- =============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------------------------------------------------------------------------
-- 业务表（仅 Cursor 可改结构；Hermes 可读，除明确约定外不写）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,                 -- UUID
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    color           TEXT NOT NULL DEFAULT '#3B82F6',
    priority        INTEGER NOT NULL DEFAULT 0,      -- 越大越优先
    progress        REAL NOT NULL DEFAULT 0          -- 0–100，由 Cursor 计算写入
                    CHECK (progress >= 0 AND progress <= 100),
    start_date      TEXT,                            -- ISO date YYYY-MM-DD
    due_date        TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,                   -- ISO datetime
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    priority        INTEGER NOT NULL DEFAULT 0,
    start_at        TEXT,                            -- ISO datetime，甘特图用
    due_at          TEXT,                            -- ISO datetime
    completed_at    TEXT,
    is_overdue      INTEGER NOT NULL DEFAULT 0       -- 0/1，可由 Cursor 或 daemon 回溯补算更新
                    CHECK (is_overdue IN (0, 1)),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_files (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    file_path       TEXT NOT NULL,                   -- 本地绝对/相对路径
    mime_type       TEXT NOT NULL DEFAULT '',
    file_size       INTEGER NOT NULL DEFAULT 0,
    archived_at     TEXT,                            -- 归档时间；空=未归档
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id              TEXT PRIMARY KEY,
    project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    notes           TEXT NOT NULL DEFAULT '',
    start_at        TEXT NOT NULL,
    end_at          TEXT,
    all_day         INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- 预警/冲突结果表：Cursor UI 读取；daemon 回溯/定时扫描可写入
CREATE TABLE IF NOT EXISTS alerts (
    id              TEXT PRIMARY KEY,
    project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
    task_id         TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    alert_type      TEXT NOT NULL
                    CHECK (alert_type IN ('overdue', 'conflict', 'risk', 'review', 'info')),
    severity        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title           TEXT NOT NULL,
    message         TEXT NOT NULL DEFAULT '',
    payload_json    TEXT NOT NULL DEFAULT '{}',      -- 扩展信息 JSON
    is_resolved     INTEGER NOT NULL DEFAULT 0 CHECK (is_resolved IN (0, 1)),
    source          TEXT NOT NULL DEFAULT 'app'
                    CHECK (source IN ('app', 'daemon')),
    created_at      TEXT NOT NULL,
    resolved_at     TEXT
);

-- ---------------------------------------------------------------------------
-- 运维表（Hermes daemon 主写；Cursor 可读用于开机同步/状态展示）
-- 字段语义变更需双方确认
-- ---------------------------------------------------------------------------

-- 键值状态：上次关机时间、daemon 版本、心跳等
CREATE TABLE IF NOT EXISTS daemon_state (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- 定时/回溯任务执行记录
CREATE TABLE IF NOT EXISTS job_runs (
    id              TEXT PRIMARY KEY,
    job_name        TEXT NOT NULL,                   -- e.g. overdue_scan, backup, boot_backfill
    status          TEXT NOT NULL
                    CHECK (status IN ('running', 'success', 'failed', 'skipped')),
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    detail_json     TEXT NOT NULL DEFAULT '{}',
    error_message   TEXT NOT NULL DEFAULT ''
);

-- 数据库备份元数据
CREATE TABLE IF NOT EXISTS backup_meta (
    id              TEXT PRIMARY KEY,
    backup_path     TEXT NOT NULL,
    file_size       INTEGER NOT NULL DEFAULT 0,
    checksum        TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    is_valid        INTEGER NOT NULL DEFAULT 1 CHECK (is_valid IN (0, 1))
);

-- 跨会话记忆 / 风险历史（Hermes 主写）
CREATE TABLE IF NOT EXISTS memory_records (
    id              TEXT PRIMARY KEY,
    category        TEXT NOT NULL
                    CHECK (category IN ('habit', 'risk', 'review', 'note')),
    project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
    content         TEXT NOT NULL,
    meta_json       TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 索引
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tasks(is_overdue);

CREATE INDEX IF NOT EXISTS idx_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_project ON calendar_events(project_id);

CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts(is_resolved, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_project ON alerts(project_id);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_time ON job_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_meta(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_records(category, created_at DESC);

-- ---------------------------------------------------------------------------
-- daemon_state 建议键（约定，非强制约束）
--   last_shutdown_at   上次干净关机时间 ISO
--   last_boot_at       本次启动时间 ISO
--   last_heartbeat_at  心跳
--   daemon_version     脚本版本
--   backfill_cursor    回溯进度标记
-- ---------------------------------------------------------------------------
