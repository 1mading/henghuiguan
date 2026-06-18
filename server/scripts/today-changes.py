#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from pathlib import Path
from datetime import datetime

DATA = Path(__file__).resolve().parents[1] / 'data' / 'henghuiguan.json'
today = datetime.now().strftime('%Y/%m/%d')
today2 = datetime.now().strftime('%Y-%m-%d')

d = json.loads(DATA.read_text(encoding='utf-8'))
logs = d.get('changeLogs', [])
push = d.get('pushLogs', [])

def is_today(s):
    if not s:
        return False
    return today in s or today2 in s or s.startswith(today2)

print('=== 操作日志（今天）===')
cl = [x for x in logs if is_today(x.get('operateTime', ''))]
print(f'共 {len(cl)} 条')
for x in cl[:50]:
    print(f"- [{x.get('operateTime')}] {x.get('operator')} | {x.get('project')} | {x.get('reason')} | {x.get('before')} -> {x.get('after')}")

print('\n=== 推送记录（今天）===')
pl = [x for x in push if is_today(x.get('time', ''))]
print(f'共 {len(pl)} 条')
for x in pl[:20]:
    print(f"- [{x.get('time')}] {x.get('eventType')} -> {x.get('recipients')} | {x.get('title')}")

print('\n=== 今天创建的任务 ===')
for t in d.get('tasks', []):
    ca = t.get('createdAt', '')
    if is_today(ca) or (ca and ca.startswith(today2)):
        print(f"- {t.get('id')} {t.get('title')} | {t.get('assignee')} | {t.get('status')}")

print('\n=== 今天创建的项目 ===')
for p in d.get('projects', []):
    ca = p.get('createdAt', '')
    if is_today(ca) or (ca and ca.startswith(today2)):
        print(f"- {p.get('id')} {p.get('name')} | {p.get('manager')} | {p.get('status')}")
