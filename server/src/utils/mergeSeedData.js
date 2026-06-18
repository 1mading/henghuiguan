const fs = require('fs');
const path = require('path');
const {
  mergeProjectsById,
  mergeTasksById,
} = require('../db/database');

/**
 * 将 seed 中缺失的 projects/tasks 合并进现有库（不覆盖已有 id，只补缺）
 */
function mergeSeedIntoStore(store, seed) {
  const beforeProjects = store.projects.length;
  const beforeTasks = store.tasks.length;

  const seedProjects = Array.isArray(seed.projects) ? seed.projects : [];
  const seedTasks = Array.isArray(seed.tasks) ? seed.tasks : [];

  const missingProjects = seedProjects.filter(p => p?.id && !store.projects.some(x => x.id === p.id));
  const missingTasks = seedTasks.filter(t => t?.id && !store.tasks.some(x => x.id === t.id));

  store.projects = mergeProjectsById(store.projects, missingProjects, null);
  store.tasks = mergeTasksById(store.tasks, missingTasks, null);

  return {
    beforeProjects,
    afterProjects: store.projects.length,
    addedProjects: store.projects.length - beforeProjects,
    beforeTasks,
    afterTasks: store.tasks.length,
    addedTasks: store.tasks.length - beforeTasks,
    missingProjectNames: missingProjects.map(p => p.name),
  };
}

function loadSeedFile(seedPath) {
  if (!fs.existsSync(seedPath)) {
    throw new Error(`种子文件不存在: ${seedPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  return {
    projects: raw.projects || [],
    tasks: raw.tasks || [],
  };
}

function getDefaultSeedPath() {
  return path.resolve(__dirname, '../../data/project-task-seed.json');
}

module.exports = {
  mergeSeedIntoStore,
  loadSeedFile,
  getDefaultSeedPath,
};
