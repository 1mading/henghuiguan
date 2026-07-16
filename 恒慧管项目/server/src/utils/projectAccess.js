const INFO_CENTER_DEPT = '信息中心';
const { isFullAccess } = require('./roles');
const { isRelatedToTask, isRelatedToProject } = require('./taskRelations');

function isInfoCenterMember(user) {
  return !!(user && user.dept === INFO_CENTER_DEPT);
}

function canViewAllProjects(user) {
  return !!(user && user.id);
}

function filterProjectsForUser(user, projects, allTasks) {
  if (canViewAllProjects(user)) return projects;
  return projects.filter(p => isRelatedToProject(user, p, allTasks));
}

function canViewProject(user, project, allTasks, allProjects) {
  if (!project) return false;
  if (canViewAllProjects(user)) return true;
  return isRelatedToProject(user, project, allTasks);
}

function filterTasksForUser(user, tasks, allProjects, viewableProjectIds) {
  if (!canViewAllProjects(user)) {
    const projectIds = viewableProjectIds || new Set(
      filterProjectsForUser(user, allProjects, tasks).map(p => p.id)
    );
    return tasks.filter(t => {
      if (t.type === 'temp' && !t.projectId) {
        return isRelatedToTask(user, t, allProjects);
      }
      if (t.projectId && projectIds.has(t.projectId)) return true;
      return isRelatedToTask(user, t, allProjects);
    });
  }
  // 全员可见项目任务；无项目归属的临时任务仍仅相关人可见
  return tasks.filter(t => {
    if (t.type === 'temp' && !t.projectId) {
      return isRelatedToTask(user, t, allProjects);
    }
    return true;
  });
}

function canViewTask(user, task, allProjects, allTasks) {
  if (!task) return false;
  if (task.type === 'temp' && !task.projectId) {
    return isRelatedToTask(user, task, allProjects);
  }
  const project = (allProjects || []).find(p => p.id === task.projectId);
  if (project) return canViewProject(user, project, allTasks || [], allProjects);
  return isRelatedToTask(user, task, allProjects);
}

module.exports = {
  INFO_CENTER_DEPT,
  isInfoCenterMember,
  canViewAllProjects,
  canViewProject,
  canViewTask,
  filterProjectsForUser,
  filterTasksForUser,
};
