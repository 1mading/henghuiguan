const path = require('path');
const fs = require('fs');
const { getDb, isEmpty, replaceAllData } = require('./database');

const seedPath = path.join(__dirname, 'seed-data.json');
const seedLocalPath = path.join(__dirname, 'seed-data.local.json');
const seedExamplePath = path.join(__dirname, 'seed-data.example.json');

function resolveSeedPath() {
  for (const p of [seedLocalPath, seedPath, seedExamplePath]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('未找到 seed 数据文件，请复制 seed-data.example.json 为 seed-data.local.json');
}

function loadSeedData() {
  const file = resolveSeedPath();
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function seedIfEmpty() {
  getDb();
  if (!isEmpty()) {
    console.log('[seed] 数据库已有数据，跳过初始化');
    return false;
  }
  const data = loadSeedData();
  replaceAllData(data);
  console.log('[seed] 已写入演示数据:', {
    users: data.users.length,
    projects: data.projects.length,
    tasks: data.tasks.length,
    changeLogs: data.changeLogs.length,
  });
  return true;
}

if (require.main === module) {
  seedIfEmpty();
}

module.exports = { seedIfEmpty, loadSeedData };
