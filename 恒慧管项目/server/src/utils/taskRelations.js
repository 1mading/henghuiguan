const { isFullAccess } = require('./roles');

/** 是否为项目团队成员 */
function isProjectTeamMember(user, project) {
  return !!(
    user &&
    project &&
    Array.isArray(project.teamMembers) &&
    project.teamMembers.includes(user.name)
  );
}

/** 是否与任务相关（负责人/协办人/创建人/项目负责人/项目团队成员） */
function isRelatedToTask(user, task, allProjects) {
  if (!user || !task) return false;
  if (task.assignee === user.name) return true;
  if (Array.isArray(task.collaborators) && task.collaborators.includes(user.name)) return true;
  if (task.creator === user.name) return true;
  const project = (allProjects || []).find(p => p.id === task.projectId);
  if (project && (project.manager === user.name || project.creator === user.name)) return true;
  if (project && isProjectTeamMember(user, project)) return true;
  return false;
}

/** 是否与项目相关（负责人/创建人/团队成员，或参与其下任务） */
function isRelatedToProject(user, project, allTasks) {
  if (!user || !project) return false;
  if (project.manager === user.name || project.creator === user.name) return true;
  if (isProjectTeamMember(user, project)) return true;
  return (allTasks || []).some(t =>
    t.projectId === project.id && isRelatedToTask(user, t, [project])
  );
}

/** 可管理项目（编辑、添加任务、归档等）— 不含已归档项目 */
function canManageProject(user, project) {
  if (!project || project.archived === true || project.status === 'archived') return false;
  if (isFullAccess(user.role)) return true;
  return project.manager === user.name || project.creator === user.name;
}

/** 同步时可提交的项目更新（含已归档，避免归档后无法写回服务端） */
function canUserSyncProject(user, project) {
  if (!project) return false;
  if (isFullAccess(user.role)) return true;
  return project.manager === user.name || project.creator === user.name;
}

/** 可编辑任务 */
function canEditTask(user, task, allProjects) {
  if (!task || task.status === 'archived' || task.status === 'abolished') return false;
  if (isFullAccess(user.role)) return true;
  return isRelatedToTask(user, task, allProjects);
}

/** 可作废任务：总经理/管理员、项目负责人、创建人 */
function canAbolishTask(user, task, allProjects) {
  if (!task) return false;
  if (isFullAccess(user.role)) return true;
  if (task.creator === user.name) return true;
  const project = (allProjects || []).find(p => p.id === task.projectId);
  if (project && (project.manager === user.name || project.creator === user.name)) return true;
  return false;
}

/** 同步时可提交的任务（含已作废/已归档，避免终态变更无法写回服务端） */
function canUserSyncTask(user, task, allProjects) {
  if (!task) return false;
  if (isFullAccess(user.role)) return true;
  if (canEditTask(user, task, allProjects)) return true;
  if (canAbolishTask(user, task, allProjects)) return true;
  return false;
}

module.exports = {
  isProjectTeamMember,
  isRelatedToTask,
  isRelatedToProject,
  canManageProject,
  canUserSyncProject,
  canEditTask,
  canAbolishTask,
  canUserSyncTask,
};
