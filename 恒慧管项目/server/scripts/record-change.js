#!/usr/bin/env node
/**
 * 将一条用户可见变更追加到待发版列表：
 * node scripts/record-change.js --type feature|fix|improve --text "说明"
 */
const fs = require('fs');
const path = require('path');
const { RELEASES_DIR } = require('../src/services/systemUpdates');

const PENDING_FILE = path.join(RELEASES_DIR, '_pending.json');
const ALLOWED_TYPES = new Set(['feature', 'fix', 'improve']);

function parseArgs(argv) {
  const out = { type: 'improve', text: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type' && argv[i + 1]) {
      out.type = argv[++i];
    } else if (a === '--text' && argv[i + 1]) {
      out.text = argv[++i];
    } else if (a.startsWith('--type=')) {
      out.type = a.slice('--type='.length);
    } else if (a.startsWith('--text=')) {
      out.text = a.slice('--text='.length);
    } else if (!a.startsWith('--') && !out.text) {
      out.text = a;
    }
  }
  return out;
}

function readPending() {
  if (!fs.existsSync(PENDING_FILE)) {
    return { items: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

function writePending(data) {
  fs.writeFileSync(PENDING_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const { type, text } = parseArgs(process.argv.slice(2));
const trimmed = String(text || '').trim();

if (!trimmed) {
  console.error('用法: node scripts/record-change.js --type feature|fix|improve --text "说明"');
  process.exit(1);
}
if (!ALLOWED_TYPES.has(type)) {
  console.error(`type 须为 feature / fix / improve，收到: ${type}`);
  process.exit(1);
}

const pending = readPending();
pending.items.push({
  type,
  text: trimmed,
  recordedAt: new Date().toISOString(),
});
writePending(pending);

console.log(`已记录待发变更 [${type}] ${trimmed}`);
console.log(`当前待发 ${pending.items.length} 条（确认发版前不会出现在「更新记录」）`);
