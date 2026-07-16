#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from pathlib import Path
from datetime import datetime

DATA = Path(__file__).resolve().parents[1] / 'data' / 'henghuiguan.json'
d = json.loads(DATA.read_text(encoding='utf-8'))
today = datetime.now()
td_slash = today.strftime('%Y/%m/%d').replace('/0', '/').replace('//', '/')
# match 2026/6/17 style
parts = today.strftime('%Y-%m-%d').split('-')
td_flex = f"{parts[0]}/{int(parts[1])}/{int(parts[2])}"
td_iso = today.strftime('%Y-%m-%d')

def match_day(s):
    if not s:
        return False
    return td_iso in s or td_flex in s or today.strftime('%Y/%m/%d') in s

print('DATE', td_iso, td_flex)
print('\n=== 王元斌 相关推送 ===')
for x in d.get('pushLogs', []):
    if not match_day(x.get('time', '')):
        continue
    op = x.get('operator') or x.get('payload', {}).get('operator', '')
    rec = x.get('recipients', '')
    if '王元斌' in rec or op == '王元斌' or '王元斌' in str(x.get('payload', '')):
        print(f"[{x.get('time')}] {x.get('eventType')} | {x.get('title')} | 接收:{rec} | 操作:{op}")

print('\n=== 今日完成任务 ===')
for t in d.get('tasks', []):
    end = t.get('actualEndDate') or ''
    if match_day(end) and t.get('status') == 'done':
        print(f"- {t['id']} {t['title']} | 负责人:{t.get('assignee')} | 完成日:{end}")

print('\n=== 今日开始/进行中任务(王元斌) ===')
for t in d.get('tasks', []):
    if t.get('assignee') != '王元斌':
        continue
    start = t.get('actualStartDate') or ''
    if match_day(start) or (t.get('status') == 'doing' and match_day(t.get('createdAt', ''))):
        print(f"- {t['id']} {t['title']} | {t.get('status')} | 开始:{start or '-'}")

print('\n=== 今日新建项目 ===')
for p in d.get('projects', []):
    if match_day(p.get('createdAt', '')):
        print(f"- {p['id']} {p['name']} | 负责人:{p.get('manager')} | 创建:{p.get('creator')}")

print('\n=== 今日新建任务(全部) ===')
for t in d.get('tasks', []):
    if match_day(t.get('createdAt', '')):
        print(f"- {t['id']} {t['title']} | {t.get('assignee')} | {t.get('status')}")

print('\n=== changeLogs ===')
for x in d.get('changeLogs', []):
    if match_day(x.get('operateTime', '')):
        print(x)
