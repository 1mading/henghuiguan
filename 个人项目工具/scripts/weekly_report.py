#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
weekly_report.py - 每周周报生成器
职责：汇总本周日志/任务数据，生成周报 Markdown
维护者：Hermes
"""

import os
import sys
import sqlite3
from datetime import datetime, timedelta

# 路径配置
SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "data", "project.db")
LOG_DIR = os.path.join(PROJECT_ROOT, "data", "logs", "weekly")

def generate_weekly_report(week_start=None):
    """
    生成本周周报
    :param week_start: 本周一日期 YYYY-MM-DD，默认自动计算
    """
    if not week_start:
        today = datetime.now()
        # 计算本周一
        week_start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
    
    week_end_dt = datetime.strptime(week_start, "%Y-%m-%d") + timedelta(days=6)
    week_end = week_end_dt.strftime("%Y-%m-%d")
    
    print(f"[周报] 正在生成 {week_start} 至 {week_end} 的周报...")
    
    if not os.path.exists(DB_PATH):
        print(f"[错误] 数据库不存在：{DB_PATH}")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        # TODO: 等待 Cursor 提供 schema.sql 后，补充汇总逻辑
        # 示例：
        # cursor = conn.cursor()
        # cursor.execute("SELECT COUNT(*) FROM tasks WHERE created_at BETWEEN ? AND ?", (week_start, week_end))
        # count = cursor.fetchone()[0]
        
        print("[周报] 数据库连接成功（等待表结构填充汇总逻辑）")
        
        # 生成 Markdown 内容
        content = f"# 周报 - {week_start} ~ {week_end}\n\n"
        content += "## 一、本周重点工作进展\n"
        content += "1. （待 Cursor 提供数据后自动填充）\n\n"
        content += "## 二、本周问题与风险汇总\n"
        content += "- \n\n"
        content += "## 三、下周计划\n"
        content += "- \n"
        
        # 保存文件
        os.makedirs(LOG_DIR, exist_ok=True)
        file_path = os.path.join(LOG_DIR, f"W{datetime.strptime(week_start, '%Y-%m-%d').isocalendar()[1]}_{week_start}.md")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"[周报] ✅ 已生成：{file_path}")
        
    except Exception as e:
        print(f"[错误] 生成失败：{e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    # 支持命令行调用：python weekly_report.py 2026-07-27
    target_date = sys.argv[1] if len(sys.argv) > 1 else None
    generate_weekly_report(target_date)
