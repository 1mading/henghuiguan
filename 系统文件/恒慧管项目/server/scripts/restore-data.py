#!/usr/bin/env python3
"""从 backups 恢复 henghuiguan.json"""
from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
MAIN = DATA / 'henghuiguan.json'
BACKUPS = DATA / 'backups'

DEFAULT_SRC = BACKUPS / 'henghuiguan-2026-06-17T03-59-27-298Z.json'


def pick_best_backup() -> Path:
    best = None
    best_score = (-1, -1, -1)
    for b in sorted(BACKUPS.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            d = json.loads(b.read_text(encoding='utf-8'))
            sc = (len(d.get('projects', [])), len(d.get('tasks', [])), len(d.get('users', [])))
            if sc > best_score:
                best_score = sc
                best = b
        except Exception:
            continue
    if not best or best_score[0] == 0 and best_score[1] == 0:
        raise SystemExit('未找到含项目/任务的备份')
    return best


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        src = pick_best_backup()

    restored = json.loads(src.read_text(encoding='utf-8'))
    if MAIN.exists():
        stamp = int(time.time() * 1000)
        backup = DATA / f'henghuiguan.json.before-restore-{stamp}.json'
        shutil.copy2(MAIN, backup)
        print(f'已备份当前文件: {backup.name}')

    MAIN.write_text(json.dumps(restored, ensure_ascii=False), encoding='utf-8')
    print(
        f'已从 {src.name} 恢复 → henghuiguan.json | '
        f'projects={len(restored.get("projects", []))} '
        f'tasks={len(restored.get("tasks", []))} '
        f'users={len(restored.get("users", []))}'
    )


if __name__ == '__main__':
    main()
