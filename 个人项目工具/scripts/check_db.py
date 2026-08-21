import sqlite3
import os

db_path = "data/project.db"
if not os.path.exists(db_path):
    print(f"[错误] 数据库不存在：{db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
print("=== 表结构检查 ===")
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    print(f"  - {t[0]}")

print("\n=== 种子数据检查 ===")
print(f"  Projects: {conn.execute('SELECT COUNT(*) FROM projects').fetchone()[0]}")
print(f"  Tasks: {conn.execute('SELECT COUNT(*) FROM tasks').fetchone()[0]}")
print(f"  Alerts: {conn.execute('SELECT COUNT(*) FROM alerts').fetchone()[0]}")
print(f"  DaemonState: {conn.execute('SELECT COUNT(*) FROM daemon_state').fetchone()[0]}")
print(f"  JobRuns: {conn.execute('SELECT COUNT(*) FROM job_runs').fetchone()[0]}")

print("\n=== 数据样例 ===")
projects = conn.execute("SELECT id, name, status, progress FROM projects LIMIT 3").fetchall()
for p in projects:
    print(f"  项目: {p[1]} | 状态: {p[2]} | 进度: {p[3]}%")

tasks = conn.execute("SELECT id, title, status, is_overdue FROM tasks LIMIT 5").fetchall()
for t in tasks:
    print(f"  任务: {t[1]} | 状态: {t[2]} | 逾期: {t[3]}")

conn.close()
print("\n✅ 数据库检查完成")
