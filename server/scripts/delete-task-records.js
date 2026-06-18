/**
 * 删除指定任务及其关联日志（changeLogs / transferLogs / pushLogs）
 * 用法: node scripts/delete-task-records.js <taskId>
 */
const fs = require('fs');
const path = require('path');
const { backupJsonFile } = require('../src/utils/backup');

const taskId = process.argv[2];
if (!taskId) {
  console.error('用法: node scripts/delete-task-records.js <taskId>');
  process.exit(1);
}

const file = path.join(__dirname, '../data/henghuiguan.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const before = {
  tasks: data.tasks.length,
  changeLogs: (data.changeLogs || []).length,
  transferLogs: (data.transferLogs || []).length,
  pushLogs: (data.pushLogs || []).length,
};

const task = data.tasks.find(t => t.id === taskId);
if (!task) {
  console.error('未找到任务:', taskId);
  process.exit(1);
}

data.tasks = data.tasks.filter(t => t.id !== taskId && t.parentId !== taskId);
data.changeLogs = (data.changeLogs || []).filter(l => l.taskId !== taskId);
data.transferLogs = (data.transferLogs || []).filter(l => l.taskId !== taskId);
data.pushLogs = (data.pushLogs || []).filter(l => l.taskId !== taskId);

backupJsonFile(file);
fs.writeFileSync(file, JSON.stringify(data));

console.log('已删除任务:', taskId, task.title);
console.log('tasks:', before.tasks, '->', data.tasks.length);
console.log('changeLogs:', before.changeLogs, '->', data.changeLogs.length);
console.log('transferLogs:', before.transferLogs, '->', data.transferLogs.length);
console.log('pushLogs:', before.pushLogs, '->', data.pushLogs.length);
