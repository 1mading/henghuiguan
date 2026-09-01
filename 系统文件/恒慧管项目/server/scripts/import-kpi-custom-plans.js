/**
 * 从 JSON / CSV 导入 KPI 自定义计划
 *
 * 用法：
 *   node scripts/import-kpi-custom-plans.js data/kpi-import/2026-08.json
 *   node scripts/import-kpi-custom-plans.js data/kpi-import/aug.csv --year-month 2026-08
 *
 * JSON 格式：
 *   { "yearMonth": "2026-08", "rows": [ { "项目名称": "...", ... } ] }
 *   或直接 [ { ... }, ... ]（需配合 --year-month）
 *
 *   node scripts/import-kpi-custom-plans.js --from-dingtalk
 *
 * 钉钉 AI 表格在线读取需开放平台权限 Notable.Base.Read.All。
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { ensureKpiPlansForMonth, importCustomKpiPlans } = require('../src/services/kpiPlans');
const { fetchKpiCustomRowsFromNotable } = require('../src/services/dingtalkNotable');

const SHEET_YEAR_MONTH = {
  '项目任务跟踪（八月）': '2026-08',
  '项目任务跟踪（8月）': '2026-08',
  '项目任务跟踪（九月）': '2026-09',
  '项目任务跟踪（9月）': '2026-09',
};

function parseArgs(argv) {
  const files = [];
  let yearMonth = '';
  let sheetName = '';
  let updateExisting = true;
  let fromDingtalk = false;
  let fromDesktop = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--year-month') yearMonth = argv[++i] || '';
    else if (arg === '--sheet') sheetName = argv[++i] || '';
    else if (arg === '--skip-existing') updateExisting = false;
    else if (arg === '--from-dingtalk') fromDingtalk = true;
    else if (arg === '--from-desktop') fromDesktop = true;
    else if (!arg.startsWith('--')) files.push(arg);
  }
  return { files, yearMonth, sheetName, updateExisting, fromDingtalk, fromDesktop };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      cell = '';
      if (row.some(v => String(v).trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }
  row.push(cell);
  if (row.some(v => String(v).trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1).map(cols => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] != null ? String(cols[idx]).trim() : '';
    });
    return obj;
  });
}

function inferYearMonthFromName(name, fallback = '') {
  const base = path.basename(name, path.extname(name));
  if (/2026-08|202608|aug/i.test(base)) return '2026-08';
  if (/2026-09|202609|sep/i.test(base)) return '2026-09';
  const m = base.match(/(\d{4})[-_]?(\d{1,2})/);
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
  for (const [sheet, ym] of Object.entries(SHEET_YEAR_MONTH)) {
    if (base.includes(sheet) || name.includes(sheet)) return ym;
  }
  return fallback;
}

const { execFileSync } = require('child_process');

const DESKTOP_CANDIDATES = [
  '项目任务跟踪表.xlsx',
  '项目任务跟踪表.xls',
  '项目任务跟踪表.et',
  '项目任务跟踪表.csv',
];

function resolveDesktopExcelPath() {
  const roots = [
    process.env.USERPROFILE,
    process.env.OneDrive,
    'D:\\Users\\admin',
    'C:\\Users\\admin',
  ].filter(Boolean);
  const desktops = [...new Set(roots.map(r => path.join(r, 'Desktop')))];
  for (const desktop of desktops) {
    for (const name of DESKTOP_CANDIDATES) {
      const p = path.join(desktop, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function readExcelSheetsViaPowerShell(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`文件不存在：${abs}`);
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.csv') {
    const raw = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
    return { [path.basename(abs, ext)]: parseCsv(raw) };
  }
  const outJson = path.join(__dirname, '../data/kpi-import/.excel-cache.json');
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  const ps1 = path.join(__dirname, 'read-excel-sheets.ps1');
  execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1,
    '-Path', abs,
    '-OutJson', outJson,
  ], { stdio: 'pipe', encoding: 'utf8' });
  const parsed = JSON.parse(fs.readFileSync(outJson, 'utf8').replace(/^\uFEFF/, ''));
  const sheets = {};
  for (const [name, rows] of Object.entries(parsed)) {
    sheets[name] = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  }
  return sheets;
}

function matchSheetYearMonth(sheetName) {
  if (SHEET_YEAR_MONTH[sheetName]) return SHEET_YEAR_MONTH[sheetName];
  const normalized = String(sheetName || '').replace(/\s/g, '');
  for (const [key, ym] of Object.entries(SHEET_YEAR_MONTH)) {
    if (key.replace(/\s/g, '') === normalized) return ym;
  }
  if (/八月|8月/.test(sheetName)) return '2026-08';
  if (/九月|9月/.test(sheetName)) return '2026-09';
  return '';
}

function loadFile(filePath) {
  const abs = path.resolve(filePath);
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls' || ext === '.et') {
    return { sheets: readExcelSheetsViaPowerShell(abs), yearMonth: '', sheetName: path.basename(abs, ext) };
  }
  const raw = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  if (ext === '.csv') {
    return { rows: parseCsv(raw), yearMonth: '', sheetName: path.basename(abs, ext) };
  }
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { rows: parsed, yearMonth: '', sheetName: path.basename(abs, ext) };
  return {
    rows: parsed.rows || parsed.data || [],
    yearMonth: parsed.yearMonth || '',
    sheetName: parsed.sheetName || path.basename(abs, ext),
  };
}

async function importRowsForSheet(label, rows, ym, updateExisting) {
  ensureKpiPlansForMonth(ym);
  const result = importCustomKpiPlans(rows, {
    yearMonth: ym,
    operatorName: '钉钉表格导入',
    updateExisting,
  });
  console.log(`\n[${label}] ${ym} → 新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}`);
  if (result.errors.length) {
    console.log('  错误：');
    result.errors.forEach(err => console.log(`    第 ${err.row} 行：${err.message}`));
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const files = [...args.files];
  const { yearMonth: cliYearMonth, sheetName: cliSheet, updateExisting, fromDingtalk, fromDesktop } = args;

  let total = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (fromDesktop) {
    const desktopFile = resolveDesktopExcelPath();
    if (!desktopFile) {
      console.error('未在桌面找到「项目任务跟踪表」Excel 文件。');
      console.error(`请将文件保存为以下任一名称：${DESKTOP_CANDIDATES.join(' / ')}`);
      console.error(`桌面路径：${path.join(process.env.USERPROFILE || '', 'Desktop')}`);
      process.exit(1);
    }
    console.log('读取桌面文件：', desktopFile);
    files.push(desktopFile);
  }

  if (fromDingtalk) {
    console.log('正在从钉钉 AI 表格读取…');
    const payload = await fetchKpiCustomRowsFromNotable();
    console.log('表格 ID:', payload.baseId);
    console.log('可用数据表:', payload.availableSheets.join('、') || '（无）');
    for (const [sheetName, info] of Object.entries(payload.sheets)) {
      if (info.error) {
        console.error(`\n[${sheetName}] 读取失败：${info.error}`);
        continue;
      }
      const ym = cliYearMonth || SHEET_YEAR_MONTH[sheetName] || SHEET_YEAR_MONTH[info.sheetName];
      if (!ym) {
        console.error(`\n[${sheetName}] 无法识别月份`);
        continue;
      }
      const result = await importRowsForSheet(sheetName, info.rows, ym, updateExisting);
      total.created += result.created;
      total.updated += result.updated;
      total.skipped += result.skipped;
      total.errors.push(...result.errors);
    }
    console.log(`\n合计：新增 ${total.created}，更新 ${total.updated}，跳过 ${total.skipped}，错误 ${total.errors.length}`);
    if (total.errors.length) process.exit(2);
    return;
  }

  if (!files.length) {
    console.error('请指定 JSON/CSV/Excel 文件，或使用：');
    console.error('  node scripts/import-kpi-custom-plans.js --from-desktop');
    console.error('  node scripts/import-kpi-custom-plans.js --from-dingtalk');
    console.error('  node scripts/import-kpi-custom-plans.js data/kpi-import/2026-08.json');
    process.exit(1);
  }

  for (const file of files) {
    const payload = loadFile(file);
    if (payload.sheets) {
      console.log(`\n读取 Excel：${path.basename(file)}，共 ${Object.keys(payload.sheets).length} 个工作表`);
      for (const [sheet, rows] of Object.entries(payload.sheets)) {
        const ym = cliYearMonth || matchSheetYearMonth(sheet);
        if (!ym) {
          console.log(`  [${sheet}] 跳过（非 8/9 月任务跟踪表，${rows.length} 行）`);
          continue;
        }
        const result = await importRowsForSheet(sheet, rows, ym, updateExisting);
        total.created += result.created;
        total.updated += result.updated;
        total.skipped += result.skipped;
        total.errors.push(...result.errors);
      }
      continue;
    }
    const sheetName = cliSheet || payload.sheetName || '';
    const ym = cliYearMonth
      || payload.yearMonth
      || SHEET_YEAR_MONTH[sheetName]
      || inferYearMonthFromName(file, '');
    if (!ym) {
      console.error(`[${file}] 无法识别月份，请使用 --year-month 2026-08`);
      process.exit(1);
    }
    const result = await importRowsForSheet(path.basename(file), payload.rows, ym, updateExisting);
    total.created += result.created;
    total.updated += result.updated;
    total.skipped += result.skipped;
    total.errors.push(...result.errors);
  }

  console.log(`\n合计：新增 ${total.created}，更新 ${total.updated}，跳过 ${total.skipped}，错误 ${total.errors.length}`);
  if (total.errors.length) process.exit(2);
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
