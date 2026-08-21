#!/usr/bin/env python3
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1] / 'data'
backups = sorted((root / 'backups').glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)
best = None
best_score = (-1, -1, -1)
for b in backups:
    try:
        d = json.loads(b.read_text(encoding='utf-8'))
        sc = (len(d.get('projects', [])), len(d.get('tasks', [])), len(d.get('users', [])))
        if sc > best_score:
            best_score = sc
            best = b
        if sc[0] > 0 or sc[1] > 0:
            print(f"{b.name}: projects={sc[0]} tasks={sc[1]} users={sc[2]} size={b.stat().st_size}")
    except Exception as e:
        print(f"{b.name}: ERROR {e}")

print('BEST:', best.name if best else None, best_score)
