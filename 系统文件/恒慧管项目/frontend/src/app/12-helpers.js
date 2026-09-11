// ========== 辅助函数 ==========
/** 是否为末级任务（无下级子任务；里程碑不计为待办任务） */
function isLeafTask(task) {
  if (!task || isMilestoneTask(task)) return false;
  return !tasks.some(t => t.parentId === task.id && t.status !== 'abolished');
}

function filterLeafTasks(taskList) {
  return (taskList || []).filter(isLeafTask);
}

function getChildrenCount(taskId, _visited) {
  const visited = _visited || new Set();
  if (!taskId || visited.has(taskId)) return 0;
  visited.add(taskId);
  const children = tasks.filter(t => t.parentId === taskId && t.parentId !== t.id);
  let count = children.length;
  children.forEach(c => { count += getChildrenCount(c.id, visited); });
  return count;
}

function getChildrenDoneCount(taskId, _visited) {
  const visited = _visited || new Set();
  if (!taskId || visited.has(taskId)) return 0;
  visited.add(taskId);
  const children = tasks.filter(t => t.parentId === taskId && t.parentId !== t.id);
  let count = children.filter(c => c.status === 'done').length;
  children.forEach(c => { count += getChildrenDoneCount(c.id, visited); });
  return count;
}

function calcProgress(taskId, _visited) {
  const visited = _visited || new Set();
  if (!taskId || visited.has(taskId)) return 0;
  visited.add(taskId);
  const children = tasks.filter(t => t.parentId === taskId && t.parentId !== t.id && t.status !== 'abolished');
  if (children.length === 0) {
    const t = tasks.find(x => x.id === taskId);
    if (!t || t.status === 'abolished') return 0;
    if (t.status === 'done' || t.status === 'archived') return 100;
    return Math.max(0, Math.min(100, Number(t.progress) || 0));
  }
  let total = 0;
  children.forEach(c => { total += calcProgress(c.id, visited); });
  return Math.round(total / children.length);
}

/** 界面展示用进度：已完成/已归档按 100%；有子任务按子项汇总 */
function getDisplayProgress(task) {
  if (!task) return 0;
  if (task.status === 'done' || task.status === 'archived') return 100;
  return calcProgress(task.id);
}

/** 纠正已完成但 progress 未写满的脏数据 */
function normalizeDoneTaskProgress(list = tasks) {
  let changed = 0;
  (list || []).forEach(t => {
    if (!t) return;
    if ((t.status === 'done' || t.status === 'archived') && Number(t.progress) !== 100) {
      t.progress = 100;
      changed += 1;
    }
  });
  return changed;
}

/** 标记完成时的进度与工时字段（实际完成日始终记为当天，避免旧值导致「本周已完成」漏计） */
function applyTaskDoneFields(task) {
  task.progress = 100;
  const today = todayStr();
  task.actualEndDate = today;
  if (task.actualStartDate) {
    task.actualHours = calcActualHours(task.actualStartDate, task.actualEndDate, task.dailyHours);
  }
}

let _genIdSeq = 0;
function genId(prefix) {
  _genIdSeq = (_genIdSeq + 1) % 1e6;
  const time = Date.now().toString(36).toUpperCase();
  const seq = _genIdSeq.toString(36).toUpperCase().padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${time}${seq}${rand}`;
}

/** 任务创建时间（只读，保存时写入） */
function getNowCreatedAt() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTaskCreatedAt(value) {
  if (!value) return '未知';
  return String(value).replace('T', ' ').slice(0, 19);
}

function isTerminalTaskStatus(status) {
  return status === 'abolished' || status === 'archived';
}
