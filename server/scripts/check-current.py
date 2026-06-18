import json
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'data' / 'henghuiguan.json'
d = json.loads(p.read_text(encoding='utf-8'))
print('current', len(d.get('projects', [])), len(d.get('tasks', [])), p.stat().st_size)
if d.get('projects'):
    print('projects:', ' | '.join(x.get('name', '') for x in d['projects']))
