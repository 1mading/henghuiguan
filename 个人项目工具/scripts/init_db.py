#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Initialize data/project.db from schema/schema.sql and seed demo rows."""

from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "schema.sql"
DB_PATH = ROOT / "data" / "project.db"
NOW = "2026-07-29T15:00:00"


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))

    conn.executemany(
        """
        INSERT INTO projects (
            id, name, description, status, color, priority, progress,
            start_date, due_date, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "p-1",
                "个人知识库重构",
                "整理笔记结构、标签体系与本地检索流程。",
                "active",
                "#38bdf8",
                2,
                50.0,
                "2026-07-01",
                "2026-08-15",
                1,
                NOW,
                NOW,
            ),
            (
                "p-2",
                "桌面端多项目管理",
                "Cursor + Hermes 双引擎本地私有化工具。",
                "active",
                "#818cf8",
                5,
                20.0,
                "2026-07-20",
                "2026-08-05",
                0,
                NOW,
                NOW,
            ),
            (
                "p-3",
                "年度复盘看板",
                "自动汇总逾期、冲突与周复盘记录。",
                "paused",
                "#34d399",
                1,
                0.0,
                "2026-07-01",
                "2026-09-01",
                2,
                NOW,
                NOW,
            ),
        ],
    )

    conn.executemany(
        """
        INSERT INTO tasks (
            id, project_id, title, description, status, priority,
            start_at, due_at, completed_at, is_overdue, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "t-1",
                "p-1",
                "迁移旧笔记到统一目录",
                "",
                "done",
                2,
                "2026-07-20T09:00:00",
                "2026-07-25T18:00:00",
                "2026-07-24T12:00:00",
                0,
                0,
                NOW,
                NOW,
            ),
            (
                "t-2",
                "p-1",
                "设计标签与检索规则",
                "",
                "in_progress",
                3,
                "2026-07-26T09:00:00",
                "2026-07-30T18:00:00",
                None,
                0,
                1,
                NOW,
                NOW,
            ),
            (
                "t-3",
                "p-2",
                "完成 Phase1 Mock 全页面",
                "",
                "done",
                5,
                "2026-07-29T09:00:00",
                "2026-07-29T18:00:00",
                "2026-07-29T15:00:00",
                0,
                0,
                NOW,
                NOW,
            ),
            (
                "t-4",
                "p-2",
                "接入 SQLite 替换 Mock",
                "",
                "in_progress",
                4,
                "2026-07-29T15:00:00",
                "2026-07-31T18:00:00",
                None,
                0,
                1,
                NOW,
                NOW,
            ),
            (
                "t-5",
                "p-3",
                "起草复盘指标清单",
                "",
                "todo",
                1,
                "2026-07-10T09:00:00",
                "2026-07-20T18:00:00",
                None,
                1,
                0,
                NOW,
                NOW,
            ),
        ],
    )

    conn.execute(
        """
        INSERT INTO alerts (
            id, project_id, task_id, alert_type, severity, title, message,
            payload_json, is_resolved, source, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "a-1",
            "p-3",
            "t-5",
            "overdue",
            "high",
            "任务已逾期",
            "「起草复盘指标清单」已超过 due_at",
            "{}",
            0,
            "daemon",
            "2026-07-29T08:00:00",
            None,
        ),
    )

    conn.executemany(
        "INSERT INTO daemon_state (key, value, updated_at) VALUES (?, ?, ?)",
        [
            ("daemon_version", "1.0.0", NOW),
            ("last_boot_at", "2026-07-29T08:00:00", NOW),
            ("last_heartbeat_at", NOW, NOW),
        ],
    )

    conn.execute(
        """
        INSERT INTO job_runs (
            id, job_name, status, started_at, finished_at, detail_json, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "j-seed",
            "overdue_scan",
            "success",
            "2026-07-29T14:40:00",
            "2026-07-29T14:40:02",
            '{"seed":true}',
            "",
        ),
    )

    conn.commit()
    tables = [
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    ]
    print(f"DB={DB_PATH}")
    print(f"tables={tables}")
    print(f"projects={conn.execute('SELECT COUNT(*) FROM projects').fetchone()[0]}")
    print(f"tasks={conn.execute('SELECT COUNT(*) FROM tasks').fetchone()[0]}")
    conn.close()


if __name__ == "__main__":
    main()
