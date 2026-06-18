const { isFullAccess } = require('./roles');

/** 是否与任务相关（负责人/协办人/创建人/项目负责人） */
function isRelatedToTask(user, task, allProjects) {
  if (!user || !task) return false;
  if (task.assignee === user.name) return true;
  if (Array.isArray(task.collaborators) && task.collaborators.includes(user.name)) return true;
  if (task.creator === user.name) return true;
  const project = (allProjects || []).find(p => p.id === task.projectId);
  if (project && (project.manager === user.name || project.creator === user.name)) return true;
  return false;
}

/** 是否与项目相关（负责人/创建人，或参与其下任务） */
function isRelatedToProject(user, project, allTasks) {
  if (!user || !project) return false;
  if (project.manager === user.name || project.creator === user.name) return true;
  return (allTasks || []).some(t =>
    t.projectId === project.id && isRelatedToTask(user, t, [project])
  );
}

/** 可管理项目（编辑、添加任务、归档等） */
function canManageProject(user, project) {
  if (!project || project.archived) return false;
  if (isFullAccess(user.role)) return true;
  return project.manager === user.name || project.creator === user.name;
}

/** 可编辑任务 */
function canEditTask(user, task, allProjects) {
  if (!task || task.status === 'archived' || task.status === 'abolished') return false;
  if (isFullAccess(user.role)) return true;
  return isRelatedToTask(user, task, allProjects);
}

module.exports = {
  isRelatedToTask,
  isRelatedToProject,
  canManageProject,
  canEditTask,
};
