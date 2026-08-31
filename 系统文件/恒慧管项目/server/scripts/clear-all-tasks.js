/**
 * 清空全部任务及关联日志（changeLogs / transferLogs / pushLogs / taskDependencies）
 * 用法: node scripts/clear-all-tasks.js
 */
const fs = require('fs');
const path = require('path');
const { backupJsonFile } = require('../src/utils/backup');

const file = path.join(__dirname, '../data/henghuiguan.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const before = {
  tasks: (data.tasks || []).length,
  taskDependencies: (data.taskDependencies || []).length,
  changeLogs: (data.changeLogs || []).length,
  transferLogs: (data.transferLogs || []).length,
  pushLogs: (data.pushLogs || []).length,
};

data.tasks = [];
data.taskDependencies = [];
data.changeLogs = [];
data.transferLogs = [];
data.pushLogs = [];

backupJsonFile(file);
fs.writeFileSync(file, JSON.stringify(data));

console.log('tasks:', before.tasks, '->', data.tasks.length);
console.log('taskDependencies:', before.taskDependencies, '->', data.taskDependencies.length);
console.log('changeLogs:', before.changeLogs, '->', data.changeLogs.length);
console.log('transferLogs:', before.transferLogs, '->', data.transferLogs.length);
console.log('pushLogs:', before.pushLogs, '->', data.pushLogs.length);
