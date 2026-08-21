#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
daemon.py - 项目管理系统后台守护服务
职责：开机自启、进程保活、断点续跑、定时调度、数据备份
维护者：Hermes
"""

import os
import sys
import uuid
import time
import json
import logging
import sqlite3
import hashlib
import shutil
from datetime import datetime, timedelta

# ================= 配置区 =================
APP_NAME = "ProjectManagerDaemon"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "data", "project.db")
BACKUP_DIR = os.path.join(PROJECT_ROOT, "data", "backups")
LOG_PATH = os.path.join(PROJECT_ROOT, "data", "daemon.log")
CHECK_INTERVAL = 60          # 循环检查间隔（秒）
BACKUP_INTERVAL = 3600       # 数据库备份间隔（秒，默认 1 小时）
BACKUP_RETENTION_DAYS = 30   # 备份保留天数

# ================= 日志初始化 =================
os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_PATH, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(APP_NAME)

# ================= 核心类 =================
class DaemonService:
    def __init__(self):
        self.db_path = DB_PATH
        self.last_check_time = datetime.now()
        self.last_backup_time = datetime.now()
        logger.info(f"[初始化] 服务启动，数据库路径：{self.db_path}")

    def ensure_db_exists(self):
        """确保数据库文件存在"""
        if not os.path.exists(self.db_path):
            logger.warning(f"[数据库] 文件不存在，等待前端初始化：{self.db_path}")
            return False
        return True

    def connect_db(self):
        """连接 SQLite 数据库"""
        try:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            return conn
        except Exception as e:
            logger.error(f"[数据库] 连接失败：{e}")
            return None

    def record_job_run(self, conn, job_name, status, detail_json="{}", error_message=""):
        """记录任务执行日志到 job_runs 表"""
        try:
            conn.execute("""
                INSERT INTO job_runs (id, job_name, status, started_at, finished_at, detail_json, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                str(uuid.uuid4()),
                job_name,
                status,
                datetime.now().isoformat(),
                datetime.now().isoformat(),
                detail_json,
                error_message
            ))
            conn.commit()
        except Exception as e:
            logger.error(f"[记录] job_runs 写入失败：{e}")

    def update_daemon_state(self, conn, key, value):
        """更新 daemon_state 键值"""
        try:
            conn.execute("""
                INSERT OR REPLACE INTO daemon_state (key, value, updated_at)
                VALUES (?, ?, ?)
            """, (key, value, datetime.now().isoformat()))
            conn.commit()
        except Exception as e:
            logger.error(f"[状态] daemon_state 写入失败：{e}")

    def get_daemon_state(self, conn, key, default=None):
        """读取 daemon_state 键值"""
        try:
            row = conn.execute(
                "SELECT value FROM daemon_state WHERE key = ?", (key,)
            ).fetchone()
            return row["value"] if row else default
        except Exception:
            return default

    def boot_backfill(self, conn):
        """
        【开机回溯】补算关机期间到期的任务
        读取 last_shutdown_at，扫描期间所有逾期任务
        """
        logger.info("[回溯] 开始开机回溯补偿...")
        last_shutdown = self.get_daemon_state(conn, "last_shutdown_at")
        
        try:
            if last_shutdown:
                shutdown_dt = datetime.fromisoformat(last_shutdown)
                now = datetime.now()
                
                # 扫描关机期间到期的任务
                cursor = conn.execute("""
                    SELECT id, title, due_at FROM tasks 
                    WHERE due_at IS NOT NULL 
                      AND due_at >= ? 
                      AND due_at < ? 
                      AND status != 'done' 
                      AND status != 'cancelled'
                      AND is_overdue = 0
                """, (shutdown_dt.isoformat(), now.isoformat()))
                
                overdue_tasks = cursor.fetchall()
                count = len(overdue_tasks)
                
                if count > 0:
                    logger.info(f"[回溯] 发现 {count} 个关机期间到期任务")
                    
                    for task in overdue_tasks:
                        # 标记逾期
                        conn.execute("UPDATE tasks SET is_overdue = 1, updated_at = ? WHERE id = ?",
                                   (now.isoformat(), task["id"]))
                        
                        # 写入预警记录
                        conn.execute("""
                            INSERT INTO alerts (id, project_id, task_id, alert_type, severity, title, message, payload_json, source, created_at)
                            VALUES (?, NULL, ?, 'overdue', 'high', '任务逾期', '关机期间到期任务回溯标记', ?, 'daemon', ?)
                        """, (
                            str(uuid.uuid4()),
                            task["id"],
                            json.dumps({"title": task["title"], "due_at": task["due_at"]}),
                            now.isoformat()
                        ))
                    
                    conn.commit()
                    self.record_job_run(conn, "boot_backfill", "success",
                                      json.dumps({"overdue_count": count}))
                else:
                    self.record_job_run(conn, "boot_backfill", "success", "{}")
            else:
                logger.info("[回溯] 无上次关机记录，跳过回溯")
                self.record_job_run(conn, "boot_backfill", "success", "{}")
                
        except Exception as e:
            logger.error(f"[回溯] 失败：{e}")
            self.record_job_run(conn, "boot_backfill", "failed", error_message=str(e))

    def check_overdue_tasks(self, conn):
        """【定时扫描】检查当前逾期任务"""
        now = datetime.now().isoformat()
        
        try:
            # 扫描新逾期任务
            cursor = conn.execute("""
                SELECT id, project_id, title, due_at FROM tasks 
                WHERE due_at IS NOT NULL 
                  AND due_at < ? 
                  AND status NOT IN ('done', 'cancelled')
                  AND is_overdue = 0
            """, (now,))
            
            new_overdue = cursor.fetchall()
            
            if new_overdue:
                logger.info(f"[调度] 发现 {len(new_overdue)} 个新逾期任务")
                
                for task in new_overdue:
                    conn.execute("UPDATE tasks SET is_overdue = 1, updated_at = ? WHERE id = ?",
                               (now, task["id"]))
                    
                    conn.execute("""
                        INSERT INTO alerts (id, project_id, task_id, alert_type, severity, title, message, payload_json, source, created_at)
                        VALUES (?, ?, ?, 'overdue', 'high', '任务逾期', '定时扫描发现逾期', ?, 'daemon', ?)
                    """, (
                        str(uuid.uuid4()),
                        task["project_id"],
                        task["id"],
                        json.dumps({"title": task["title"], "due_at": task["due_at"]}),
                        now
                    ))
                
                conn.commit()
            
            # 清理已完成的逾期标记
            conn.execute("""
                UPDATE tasks SET is_overdue = 0, updated_at = ?
                WHERE status IN ('done', 'cancelled') AND is_overdue = 1
            """, (now,))
            conn.commit()
            
            self.record_job_run(conn, "overdue_scan", "success",
                              json.dumps({"new_overdue": len(new_overdue)}))
            
        except Exception as e:
            logger.error(f"[调度] 逾期扫描失败：{e}")
            self.record_job_run(conn, "overdue_scan", "failed", error_message=str(e))

    def calculate_project_progress(self, conn):
        """【定时计算】更新项目进度"""
        now = datetime.now().isoformat()
        
        try:
            # 获取所有活跃项目
            projects = conn.execute("""
                SELECT id FROM projects WHERE status = 'active'
            """).fetchall()
            
            updated_count = 0
            for project in projects:
                pid = project["id"]
                
                # 计算进度：已完成任务数 / 总任务数
                task_stats = conn.execute("""
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
                    FROM tasks WHERE project_id = ?
                """, (pid,)).fetchone()
                
                if task_stats["total"] > 0:
                    progress = round((task_stats["completed"] / task_stats["total"]) * 100, 1)
                    
                    conn.execute("""
                        UPDATE projects SET progress = ?, updated_at = ? WHERE id = ?
                    """, (progress, now, pid))
                    updated_count += 1
            
            conn.commit()
            logger.info(f"[调度] 进度计算完成，更新 {updated_count} 个项目")
            
            self.record_job_run(conn, "progress_calc", "success",
                              json.dumps({"updated_projects": updated_count}))
            
        except Exception as e:
            logger.error(f"[调度] 进度计算失败：{e}")
            self.record_job_run(conn, "progress_calc", "failed", error_message=str(e))

    def backup_database(self):
        """数据库定时备份"""
        if not self.ensure_db_exists():
            return

        now = datetime.now()
        if (now - self.last_backup_time).total_seconds() < BACKUP_INTERVAL:
            return

        os.makedirs(BACKUP_DIR, exist_ok=True)
        backup_name = f"project_backup_{now.strftime('%Y%m%d_%H%M%S')}.db"
        backup_path = os.path.join(BACKUP_DIR, backup_name)

        try:
            # 使用 VACUUM 确保备份一致性
            conn = self.connect_db()
            if conn:
                conn.execute("VACUUM")
                conn.close()
            
            shutil.copy2(self.db_path, backup_path)
            self.last_backup_time = now
            
            # 记录备份元数据
            file_size = os.path.getsize(backup_path)
            with open(backup_path, 'rb') as f:
                checksum = hashlib.sha256(f.read()).hexdigest()
            
            conn = self.connect_db()
            if conn:
                conn.execute("""
                    INSERT INTO backup_meta (id, backup_path, file_size, checksum, created_at, is_valid)
                    VALUES (?, ?, ?, ?, ?, 1)
                """, (str(uuid.uuid4()), backup_path, file_size, checksum, now.isoformat()))
                conn.commit()
                
                # 清理过期备份记录
                cutoff = (now - timedelta(days=BACKUP_RETENTION_DAYS)).isoformat()
                conn.execute("DELETE FROM backup_meta WHERE created_at < ?", (cutoff,))
                conn.commit()
                conn.close()
            
            # 清理磁盘上的旧备份文件
            self.cleanup_old_backups()
            
            logger.info(f"[备份] 成功创建快照：{backup_name} ({file_size} bytes)")
            
        except Exception as e:
            logger.error(f"[备份] 失败：{e}")

    def cleanup_old_backups(self):
        """清理超过保留天数的旧备份文件"""
        if not os.path.exists(BACKUP_DIR):
            return
        
        now = time.time()
        cutoff = now - (BACKUP_RETENTION_DAYS * 86400)
        
        for filename in os.listdir(BACKUP_DIR):
            if filename.endswith(".db"):
                file_path = os.path.join(BACKUP_DIR, filename)
                if os.path.getmtime(file_path) < cutoff:
                    try:
                        os.remove(file_path)
                        logger.info(f"[清理] 🗑️ 已删除过期备份：{filename}")
                    except Exception as e:
                        logger.error(f"[清理] ❌ 删除失败 {filename}：{e}")

    def heartbeat(self, conn):
        """更新心跳"""
        self.update_daemon_state(conn, "last_heartbeat_at", datetime.now().isoformat())

    def run_loop(self):
        """主循环"""
        logger.info("[循环] 进入主循环，开始常驻监控...")
        
        while True:
            try:
                if not self.ensure_db_exists():
                    time.sleep(CHECK_INTERVAL)
                    continue
                
                conn = self.connect_db()
                if conn:
                    # 开机回溯（首次运行）
                    if not self.get_daemon_state(conn, "last_boot_at"):
                        self.update_daemon_state(conn, "last_boot_at", datetime.now().isoformat())
                        self.boot_backfill(conn)
                    
                    # 定时任务
                    self.check_overdue_tasks(conn)
                    self.calculate_project_progress(conn)
                    self.heartbeat(conn)
                    
                    # 备份
                    self.backup_database()
                    
                    conn.close()

                self.last_check_time = datetime.now()
                time.sleep(CHECK_INTERVAL)

            except Exception as e:
                logger.error(f"[异常] 主循环出错：{e}，将在 {CHECK_INTERVAL} 秒后重试...")
                time.sleep(CHECK_INTERVAL)

    def on_shutdown(self):
        """关机前保存状态"""
        logger.info("[关机] 正在保存状态...")
        if self.ensure_db_exists():
            conn = self.connect_db()
            if conn:
                self.update_daemon_state(conn, "last_shutdown_at", datetime.now().isoformat())
                self.record_job_run(conn, "shutdown", "success", 
                                  json.dumps({"reason": "normal_shutdown"}))
                conn.close()
            logger.info("[关机] 状态已保存")

# ================= 入口 =================
if __name__ == "__main__":
    logger.info(f"=== {APP_NAME} 启动 ===")
    daemon = DaemonService()
    
    if not daemon.ensure_db_exists():
        logger.warning("[警告] 数据库文件尚未创建，服务将保持运行等待前端初始化")

    try:
        daemon.run_loop()
    except KeyboardInterrupt:
        logger.info("=== 服务收到中断信号 ===")
        daemon.on_shutdown()
    except Exception as e:
        logger.critical(f"=== 服务崩溃：{e} ===")
        daemon.on_shutdown()
        sys.exit(1)
