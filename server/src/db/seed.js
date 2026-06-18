const path = require('path');
const fs = require('fs');
const { getDb, isEmpty, replaceAllData } = require('./database');

const seedPath = path.join(__dirname, 'seed-data.json');

function loadSeedData() {
  const raw = fs.readFileSync(seedPath, 'utf8');
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
