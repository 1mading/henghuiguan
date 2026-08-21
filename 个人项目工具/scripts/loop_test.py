#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One-shot Phase2 closed-loop test: insert overdue task -> run daemon jobs -> verify."""

from __future__ import annotations

import json
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from daemon import DaemonService  # noqa: E402

DB = ROOT / "data" / "project.db"


def main() -> None:
    conn = sqlite3.connect(str(DB))
    conn.row_factory = sqlite3.Row
    now = datetime.now().isoformat(timespec="seconds")
    due = (datetime.now() - timedelta(days=2)).isoformat(timespec="seconds")
    tid = f"t-loop-{uuid.uuid4().hex[:8]}"

    proj = conn.execute("SELECT id FROM projects WHERE id = ?", ("p-2",)).fetchone()
    if not proj:
        raise SystemExit("missing project p-2")

    conn.execute(
        """
        INSERT INTO tasks (
            id, project_id, title, description, status, priority,
            start_at, due_at, completed_at, is_overdue, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            tid,
            "p-2",
            "闭环测试逾期任务",
            "phase2 loop test",
            "todo",
            5,
            due,
            due,
            None,
            0,
            99,
            now,
            now,
        ),
    )
    conn.commit()
    print(f"[1] inserted overdue task {tid} due={due}")

    before_overdue = conn.execute(
        "SELECT COUNT(*) AS c FROM tasks WHERE is_overdue = 1"
    ).fetchone()["c"]
    before_alerts = conn.execute(
        "SELECT COUNT(*) AS c FROM alerts WHERE is_resolved = 0"
    ).fetchone()["c"]
    print(f"[1] before: overdue={before_overdue} open_alerts={before_alerts}")
    conn.close()

    daemon = DaemonService()
    conn = daemon.connect_db()
    if not conn:
        raise SystemExit("daemon cannot connect db")

    daemon.check_overdue_tasks(conn)
    daemon.calculate_project_progress(conn)
    daemon.heartbeat(conn)
    conn.close()
    print("[2] daemon jobs executed: overdue_scan + progress_calc + heartbeat")

    conn = sqlite3.connect(str(DB))
    conn.row_factory = sqlite3.Row
    task = conn.execute(
        "SELECT id, is_overdue, status FROM tasks WHERE id = ?", (tid,)
    ).fetchone()
    alerts = conn.execute(
        """
        SELECT id, alert_type, severity, title, source, is_resolved
        FROM alerts
        WHERE task_id = ?
        ORDER BY created_at DESC
        """,
        (tid,),
    ).fetchall()
    progress = conn.execute(
        "SELECT id, name, progress FROM projects WHERE id = ?", ("p-2",)
    ).fetchone()
    heartbeat = conn.execute(
        "SELECT value FROM daemon_state WHERE key = ?", ("last_heartbeat_at",)
    ).fetchone()
    jobs = conn.execute(
        """
        SELECT job_name, status, started_at
        FROM job_runs
        ORDER BY started_at DESC
        LIMIT 5
        """
    ).fetchall()

    print(f"[3] task.is_overdue={task['is_overdue']}")
    print(f"[3] alerts_for_task={len(alerts)}")
    for a in alerts:
        print(f"    - {a['alert_type']} {a['severity']} {a['title']} source={a['source']}")
    print(f"[3] project progress p-2={progress['progress']}")
    print(f"[3] heartbeat={heartbeat['value'] if heartbeat else None}")
    print("[3] recent job_runs:")
    for j in jobs:
        print(f"    - {j['job_name']} {j['status']} {j['started_at']}")

    ok = task["is_overdue"] == 1 and len(alerts) >= 1
    print(json.dumps({"loop_ok": ok, "task_id": tid}, ensure_ascii=False))
    conn.close()
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
