/** 任务依赖（跨项目 FS）校验工具 */

const DEP_STATUS_ACTIVE = 'active';
const DEP_TYPE_FS = 'finish_to_start';

function isPredecessorDone(task) {
  return task && task.status === 'done';
}

function isPredecessorAbnormal(task) {
  return task && (task.status === 'abolished' || task.status === 'archived');
}

function getActiveDependencies(deps) {
  return (deps || []).filter(d => !d.status || d.status === DEP_STATUS_ACTIVE);
}

function getPredecessorDeps(taskId, deps) {
  return getActiveDependencies(deps).filter(d => d.successorTaskId === taskId);
}

function getSuccessorDeps(taskId, deps) {
  return getActiveDependencies(deps).filter(d => d.predecessorTaskId === taskId);
}

function wouldCreateDependencyCycle(deps, predecessorTaskId, successorTaskId) {
  if (!predecessorTaskId || !successorTaskId) return false;
  if (predecessorTaskId === successorTaskId) return true;
  const active = getActiveDependencies(deps);
  const visited = new Set();
  const stack = [successorTaskId];
  while (stack.length) {
    const id = stack.pop();
    if (id === predecessorTaskId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    active
      .filter(d => d.predecessorTaskId === id)
      .forEach(d => stack.push(d.successorTaskId));
  }
  return false;
}

function isTaskBlocked(task, deps, tasksById) {
  if (!task || task.status === 'done' || task.status === 'abolished' || task.status === 'archived') {
    return false;
  }
  return getPredecessorDeps(task.id, deps).some(dep => {
    const pred = tasksById.get(dep.predecessorTaskId);
    if (!pred || isPredecessorAbnormal(pred)) return true;
    return !isPredecessorDone(pred);
  });
}

function mergeTaskDependenciesById(existing, incoming) {
  const map = new Map();
  (existing || []).forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  (incoming || []).forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  return [...map.values()];
}

module.exports = {
  DEP_STATUS_ACTIVE,
  DEP_TYPE_FS,
  getActiveDependencies,
  getPredecessorDeps,
  getSuccessorDeps,
  wouldCreateDependencyCycle,
  isTaskBlocked,
  mergeTaskDependenciesById,
};
