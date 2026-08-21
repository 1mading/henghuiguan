#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
daily_log.py - 每日工作日志生成器
职责：读取当日任务数据，生成 Markdown 日志草稿
维护者：Hermes
"""

import os
import sys
import sqlite3
from datetime import datetime

# 路径配置
SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "data", "project.db")
LOG_DIR = os.path.join(PROJECT_ROOT, "data", "logs", "daily")

def generate_daily_log(date_str=None):
    """
    生成指定日期的日志
    :param date_str: 格式 YYYY-MM-DD，默认今天
    """
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
    
    print(f"[日志] 正在生成 {date_str} 的工作日志...")
    
    # 1. 连接数据库
    if not os.path.exists(DB_PATH):
        print(f"[错误] 数据库不存在：{DB_PATH}")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        # TODO: 等待 Cursor 提供 schema.sql 后，补充查询逻辑
        # 示例：
        # cursor = conn.cursor()
        # cursor.execute("SELECT title, status FROM tasks WHERE date(created_at) = ?", (date_str,))
        # tasks = cursor.fetchall()
        
        print("[日志] 数据库连接成功（等待表结构填充查询逻辑）")
        
        # 2. 生成 Markdown 内容
        content = f"# 工作日志 - {date_str}\n\n"
        content += "## 今日完成\n"
        content += "- [ ] （待 Cursor 提供数据后自动填充）\n\n"
        content += "## 明日计划\n"
        content += "- [ ] \n\n"
        content += "## 风险与问题\n"
        content += "- \n"
        
        # 3. 保存文件
        os.makedirs(LOG_DIR, exist_ok=True)
        file_path = os.path.join(LOG_DIR, f"{date_str}.md")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"[日志] ✅ 已生成：{file_path}")
        
    except Exception as e:
        print(f"[错误] 生成失败：{e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    # 支持命令行调用：python daily_log.py 2026-07-29
    target_date = sys.argv[1] if len(sys.argv) > 1 else None
    generate_daily_log(target_date)
