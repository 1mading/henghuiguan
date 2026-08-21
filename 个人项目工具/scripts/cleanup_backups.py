#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cleanup_backups.py - 数据库备份清理工具
职责：清理超过 30 天的旧备份，防止 data 目录膨胀
维护者：Hermes
"""

import os
import time
from datetime import datetime

SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BACKUP_DIR = os.path.join(PROJECT_ROOT, "data", "backups")
RETENTION_DAYS = 30

def cleanup():
    """清理过期备份"""
    if not os.path.exists(BACKUP_DIR):
        print("[清理] 备份目录不存在，跳过。")
        return

    print(f"[清理] 开始扫描备份目录：{BACKUP_DIR}，保留最近 {RETENTION_DAYS} 天...")
    
    now = time.time()
    deleted_count = 0
    
    for filename in os.listdir(BACKUP_DIR):
        if filename.endswith(".db"):
            file_path = os.path.join(BACKUP_DIR, filename)
            file_age = now - os.path.getmtime(file_path)
            
            # 超过保留天数
            if file_age > RETENTION_DAYS * 86400:
                try:
                    os.remove(file_path)
                    deleted_count += 1
                    print(f"[清理] 🗑️ 已删除过期备份：{filename}")
                except Exception as e:
                    print(f"[清理] ❌ 删除失败 {filename}：{e}")
    
    print(f"[清理] ✅ 清理完成，共删除 {deleted_count} 个文件。")

if __name__ == "__main__":
    cleanup()
