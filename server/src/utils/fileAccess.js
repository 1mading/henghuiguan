const { isFullAccess } = require('./roles');
const {
  isRelatedToTask,
  canManageProject,
  canEditTask,
} = require('./taskRelations');
const { canViewProject, canViewTask } = require('./projectAccess');

function canAccessProject(user, project, allTasks, allUsers) {
  return canViewProject(user, project, allTasks, []);
}

function canEditProjectDocs(user, project) {
  return canManageProject(user, project);
}

function canAccessTask(user, task, allProjects, allTasks) {
  return canViewTask(user, task, allProjects, allTasks || []);
}

function canEditTaskAttachments(user, task, allProjects) {
  return canEditTask(user, task, allProjects);
}

/** 任务留言：与任务相关的人员可留言 */
function canPostTaskComment(user, task, allProjects, allUsers) {
  if (!task || task.status === 'archived' || task.status === 'abolished') return false;
  if (isFullAccess(user.role)) return true;
  return isRelatedToTask(user, task, allProjects);
}

function matchAttachmentRef(meta, refId) {
  if (!meta || !refId) return false;
  return meta.fileId === refId || meta.id === refId;
}

function findAttachmentMeta(store, refId) {
  for (const project of store.projects || []) {
    for (const doc of project.documents || []) {
      if (matchAttachmentRef(doc, refId)) {
        return { entityType: 'project', entityId: project.id, meta: doc, project, task: null };
      }
    }
  }
  for (const task of store.tasks || []) {
    for (const att of task.attachments || []) {
      if (matchAttachmentRef(att, refId)) {
        const project = (store.projects || []).find(p => p.id === task.projectId) || null;
        return { entityType: 'task', entityId: task.id, meta: att, project, task };
      }
    }
    for (const comment of task.comments || []) {
      for (const att of comment.attachments || []) {
        if (matchAttachmentRef(att, refId)) {
          const project = (store.projects || []).find(p => p.id === task.projectId) || null;
          return { entityType: 'task_comment', entityId: task.id, meta: att, project, task };
        }
      }
    }
    for (const att of task.commentPendingFiles || []) {
      if (matchAttachmentRef(att, refId)) {
        const project = (store.projects || []).find(p => p.id === task.projectId) || null;
        return { entityType: 'task_comment_pending', entityId: task.id, meta: att, project, task };
      }
    }
  }
  return null;
}

module.exports = {
  canAccessProject,
  canEditProjectDocs,
  canAccessTask,
  canEditTaskAttachments,
  canPostTaskComment,
  findAttachmentMeta,
};
