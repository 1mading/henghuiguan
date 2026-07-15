function genDocId(prefix) {
  return prefix + '-' + Date.now().toString(36).slice(-4).toUpperCase();
}

function taskAttachmentAlreadySynced(project, item) {
  if (!project || !item) return false;
  return (project.documents || []).some(doc =>
    (item.fileId && doc.fileId === item.fileId) ||
    (item.nodeId && doc.source === 'dingtalk_wiki' && doc.nodeId === item.nodeId) ||
    (item.id && doc.syncedFromAttachmentId === item.id)
  );
}

function syncTaskAttachmentToProjectDocuments(project, task, item) {
  if (!project || !task?.projectId || task.projectId !== project.id || !item) return false;
  if (taskAttachmentAlreadySynced(project, item)) return false;
  if (!Array.isArray(project.documents)) project.documents = [];
  project.documents.push({
    ...item,
    id: genDocId('DOC'),
    syncedFromTaskId: task.id,
    syncedFromAttachmentId: item.id,
  });
  return true;
}

function documentMergeKey(doc) {
  if (!doc) return '';
  if (doc.fileId) return `file:${doc.fileId}`;
  if (doc.source === 'dingtalk_wiki' && doc.nodeId) return `wiki:${doc.nodeId}`;
  if (doc.syncedFromAttachmentId) return `sync:${doc.syncedFromAttachmentId}`;
  return doc.id ? `id:${doc.id}` : '';
}

/** 合并项目文档列表，避免前端同步时覆盖服务端已同步的附件 */
function mergeProjectDocuments(existingDocs, incomingDocs) {
  const merged = [...(existingDocs || [])];
  const seen = new Set(merged.map(documentMergeKey).filter(Boolean));
  for (const doc of incomingDocs || []) {
    const key = documentMergeKey(doc);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(doc);
  }
  return merged;
}

/** 确保 store 中任务附件已同步到项目文档；有变更时返回 true */
function ensureTaskAttachmentsSyncedToProjects(store) {
  const result = backfillTaskAttachmentsToProjectDocuments(store);
  return result.synced > 0;
}

/** 将已有任务附件补同步到所属项目的 documents（幂等，可重复执行） */
function backfillTaskAttachmentsToProjectDocuments(store) {
  const projects = store.projects || [];
  const tasks = store.tasks || [];
  const projectById = new Map(projects.map(p => [p.id, p]));
  let synced = 0;
  let skipped = 0;
  const projectIds = new Set();
  const samples = [];

  for (const task of tasks) {
    if (!task?.projectId || !Array.isArray(task.attachments) || !task.attachments.length) continue;
    const project = projectById.get(task.projectId);
    if (!project) continue;

    for (const item of task.attachments) {
      if (taskAttachmentAlreadySynced(project, item)) {
        skipped += 1;
        continue;
      }
      if (syncTaskAttachmentToProjectDocuments(project, task, item)) {
        synced += 1;
        projectIds.add(project.id);
        if (samples.length < 8) {
          samples.push({
            projectId: project.id,
            projectName: project.name,
            taskId: task.id,
            attachmentName: item.name || item.id,
          });
        }
      }
    }
  }

  return {
    synced,
    skipped,
    projectsTouched: projectIds.size,
    samples,
  };
}

module.exports = {
  genDocId,
  taskAttachmentAlreadySynced,
  syncTaskAttachmentToProjectDocuments,
  backfillTaskAttachmentsToProjectDocuments,
  documentMergeKey,
  mergeProjectDocuments,
  ensureTaskAttachmentsSyncedToProjects,
};
