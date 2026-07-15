const express = require('express');
const multer = require('multer');
const path = require('path');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { getDb, persistStore } = require('../db/database');
const {
  saveUploadedFile,
  deleteStoredFile,
  resolveStoredPath,
} = require('../services/fileStorage');
const {
  canAccessProject,
  canEditProjectDocs,
  canAccessTask,
  canEditTaskAttachments,
  canPostTaskComment,
  findAttachmentMeta,
} = require('../utils/fileAccess');
const { getAllUsers, appendChangeLogs } = require('../db/database');
const {
  isConfigured,
  resolveWikiNodeForAttach,
  listWikiWorkspacesForStaffArchive,
  listWikiChildNodes,
  resolveWikiOperatorForWorkspace,
} = require('../services/dingtalk');
const {
  genDocId,
  syncTaskAttachmentToProjectDocuments,
} = require('../utils/projectDocuments');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

function isWikiAttachment(meta) {
  return meta?.source === 'dingtalk_wiki';
}

function buildWikiAttachmentItem(node, docUrl, userName, idPrefix) {
  return {
    id: genDocId(idPrefix),
    source: 'dingtalk_wiki',
    name: node.name || '钉钉文档',
    url: node.url || docUrl,
    workspaceId: node.workspaceId || '',
    nodeId: node.nodeId || '',
    docType: node.type || '',
    uploadedBy: userName,
    uploadedAt: new Date().toISOString(),
  };
}

function wikiAlreadyLinked(items, nodeId) {
  if (!nodeId) return false;
  return (items || []).some(item =>
    item?.source === 'dingtalk_wiki' && item.nodeId === nodeId
  );
}

function countStoredFileReferences(store, fileId) {
  if (!fileId) return 0;
  let count = 0;
  for (const project of store.projects || []) {
    for (const doc of project.documents || []) {
      if (doc.fileId === fileId) count += 1;
    }
  }
  for (const task of store.tasks || []) {
    for (const att of task.attachments || []) {
      if (att.fileId === fileId) count += 1;
    }
    for (const comment of task.comments || []) {
      for (const att of comment.attachments || []) {
        if (att.fileId === fileId) count += 1;
      }
    }
    for (const att of task.commentPendingFiles || []) {
      if (att.fileId === fileId) count += 1;
    }
  }
  return count;
}

function removeAttachmentFromEntity(store, entityType, entityId, refId) {
  if (entityType === 'project') {
    const project = store.projects.find(p => p.id === entityId);
    if (!project) return null;
    const meta = (project.documents || []).find(doc => matchAttachmentRef(doc, refId));
    if (!meta) return null;
    project.documents = (project.documents || []).filter(doc => !matchAttachmentRef(doc, refId));
    return { entityType: 'project', project, task: null, meta };
  }
  if (entityType === 'task') {
    const task = store.tasks.find(t => t.id === entityId);
    if (!task) return null;
    const meta = (task.attachments || []).find(att => matchAttachmentRef(att, refId));
    if (!meta) return null;
    task.attachments = (task.attachments || []).filter(att => !matchAttachmentRef(att, refId));
    const project = store.projects.find(p => p.id === task.projectId) || null;
    return { entityType: 'task', project, task, meta };
  }
  return null;
}

function matchAttachmentRef(meta, refId) {
  if (!meta || !refId) return false;
  return meta.fileId === refId || meta.id === refId;
}

function attachWikiDocToEntity(store, req, entityType, entityId, node, docUrl) {
  if (entityType === 'project') {
    const project = store.projects.find(p => p.id === entityId);
    if (!project) return { status: 404, body: { success: false, message: '项目不存在' } };
    if (!canEditProjectDocs(req.user, project)) {
      return { status: 403, body: { success: false, message: '无权上传项目文档' } };
    }
    if (wikiAlreadyLinked(project.documents, node.nodeId)) {
      return { status: 409, body: { success: false, message: '该钉钉文档已添加' } };
    }
    const item = buildWikiAttachmentItem(node, docUrl, req.user.name, 'DOC');
    if (!Array.isArray(project.documents)) project.documents = [];
    project.documents.push(item);
    appendChangeLog(store, {
      id: genDocId('L'),
      taskId: `PROJECT-${project.id}`,
      operator: req.user.name,
      operateTime: new Date().toLocaleString('zh-CN'),
      before: '-',
      after: `添加钉钉文档：${item.name}`,
      reason: '项目文档',
      project: project.name,
    });
    persistStore();
    return { status: 200, body: { success: true, item, entityType, entityId } };
  }

  if (entityType === 'task') {
    const task = store.tasks.find(t => t.id === entityId);
    if (!task) return { status: 404, body: { success: false, message: '任务不存在' } };
    if (!canEditTaskAttachments(req.user, task, store.projects)) {
      return { status: 403, body: { success: false, message: '无权上传任务附件' } };
    }
    if (wikiAlreadyLinked(task.attachments, node.nodeId)) {
      return { status: 409, body: { success: false, message: '该钉钉文档已添加' } };
    }
    const item = buildWikiAttachmentItem(node, docUrl, req.user.name, 'ATT');
    if (!Array.isArray(task.attachments)) task.attachments = [];
    task.attachments.push(item);
    const project = store.projects.find(p => p.id === task.projectId);
    if (project) syncTaskAttachmentToProjectDocuments(project, task, item);
    appendChangeLog(store, {
      id: genDocId('L'),
      taskId: task.id,
      operator: req.user.name,
      operateTime: new Date().toLocaleString('zh-CN'),
      before: '-',
      after: `添加钉钉文档：${item.name}`,
      reason: '任务附件',
      project: project?.name || '临时任务',
    });
    persistStore();
    return { status: 200, body: { success: true, item, entityType, entityId } };
  }

  return { status: 400, body: { success: false, message: 'entityType 无效' } };
}

function appendChangeLog(store, entry) {
  appendChangeLogs([entry]);
}

router.post('/files/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择文件' });
    }

    const entityType = String(req.body.entityType || '').trim();
    const entityId = String(req.body.entityId || '').trim();
    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, message: '缺少 entityType 或 entityId' });
    }

    const store = getDb();
    const users = getAllUsers();
    let saved;

    if (entityType === 'project') {
      const project = store.projects.find(p => p.id === entityId);
      if (!project) return res.status(404).json({ success: false, message: '项目不存在' });
      if (!canEditProjectDocs(req.user, project)) {
        return res.status(403).json({ success: false, message: '无权上传项目文档' });
      }
      saved = saveUploadedFile(req.file, req.file.originalname);
      if (!Array.isArray(project.documents)) project.documents = [];
      const item = {
        id: genDocId('DOC'),
        fileId: saved.fileId,
        name: saved.name,
        size: saved.size,
        mimeType: saved.mimeType,
        uploadedBy: req.user.name,
        uploadedAt: new Date().toISOString(),
      };
      project.documents.push(item);
      appendChangeLog(store, {
        id: genDocId('L'),
        taskId: `PROJECT-${project.id}`,
        operator: req.user.name,
        operateTime: new Date().toLocaleString('zh-CN'),
        before: '-',
        after: `上传文档：${item.name}`,
        reason: '项目文档',
        project: project.name,
      });
      persistStore();
      return res.json({ success: true, item, entityType, entityId });
    }

    if (entityType === 'task') {
      const task = store.tasks.find(t => t.id === entityId);
      if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
      const uploadPurpose = String(req.body.uploadPurpose || 'attachment').trim();
      const isCommentImage = uploadPurpose === 'comment';

      if (isCommentImage) {
        if (!canPostTaskComment(req.user, task, store.projects, users)) {
          return res.status(403).json({ success: false, message: '无权上传留言图片' });
        }
      } else if (!canEditTaskAttachments(req.user, task, store.projects)) {
        return res.status(403).json({ success: false, message: '无权上传任务附件' });
      }

      saved = saveUploadedFile(req.file, req.file.originalname);
      const item = {
        id: genDocId(isCommentImage ? 'CIMG' : 'ATT'),
        fileId: saved.fileId,
        name: saved.name,
        size: saved.size,
        mimeType: saved.mimeType,
        uploadedBy: req.user.name,
        uploadedAt: new Date().toISOString(),
      };

      if (!isCommentImage) {
        if (!Array.isArray(task.attachments)) task.attachments = [];
        task.attachments.push(item);
        const project = store.projects.find(p => p.id === task.projectId);
        if (project) syncTaskAttachmentToProjectDocuments(project, task, item);
        appendChangeLog(store, {
          id: genDocId('L'),
          taskId: task.id,
          operator: req.user.name,
          operateTime: new Date().toLocaleString('zh-CN'),
          before: '-',
          after: `上传附件：${item.name}`,
          reason: '任务附件',
          project: project?.name || '临时任务',
        });
        persistStore();
      } else {
        if (!Array.isArray(task.commentPendingFiles)) task.commentPendingFiles = [];
        task.commentPendingFiles.push(item);
        persistStore();
      }

      return res.json({ success: true, item, entityType, entityId, uploadPurpose });
    }

    return res.status(400).json({ success: false, message: 'entityType 无效' });
  } catch (e) {
    const status = e.code === 'UNSUPPORTED_TYPE' || e.code === 'FILE_TOO_LARGE' ? 400 : 500;
    res.status(status).json({ success: false, message: e.message });
  }
});

router.post('/files/link-dingtalk-doc', requireAuth, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: '钉钉未配置，无法添加钉钉文档' });
    }

    const entityType = String(req.body.entityType || '').trim();
    const entityId = String(req.body.entityId || '').trim();
    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, message: '缺少 entityType 或 entityId' });
    }

    const { node, docUrl } = await resolveWikiNodeForAttach(req.body, req.user);
    const store = getDb();
    const result = attachWikiDocToEntity(store, req, entityType, entityId, node, docUrl);
    return res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/files/wiki/workspaces', requireAuth, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: '钉钉未配置' });
    }
    const { workspaces, personalWorkspaces, teamWorkspaces, mineError, bindError, scannedUsers, failedUsers } =
      await listWikiWorkspacesForStaffArchive(req.user);
    res.json({
      success: true,
      workspaces,
      personalWorkspaces,
      teamWorkspaces,
      mineError,
      bindError,
      staffArchiveMode: true,
      scannedUsers,
      failedUsers,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/files/wiki/nodes', requireAuth, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: '钉钉未配置' });
    }
    const parentNodeId = String(req.query.parentNodeId || '').trim();
    const workspaceId = String(req.query.workspaceId || '').trim();
    if (!parentNodeId) {
      return res.status(400).json({ success: false, message: '缺少 parentNodeId' });
    }
    const operatorUnionId = await resolveWikiOperatorForWorkspace(workspaceId, req.user);
    const nodes = await listWikiChildNodes(parentNodeId, operatorUnionId);
    res.json({ success: true, nodes, parentNodeId, workspaceId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/files/:fileId', requireAuth, (req, res) => {
  const store = getDb();
  const found = findAttachmentMeta(store, req.params.fileId);
  if (!found) {
    return res.status(404).json({ success: false, message: '文件不存在' });
  }

  if (isWikiAttachment(found.meta)) {
    return res.status(400).json({ success: false, message: '钉钉文档请使用「打开」在钉钉中查看' });
  }

  const users = getAllUsers();
  if (found.entityType === 'project') {
    if (!canAccessProject(req.user, found.project, store.tasks, users)) {
      return res.status(403).json({ success: false, message: '无权访问' });
    }
  } else if (!canAccessTask(req.user, found.task, store.projects, store.tasks)) {
    return res.status(403).json({ success: false, message: '无权访问' });
  }

  const storedPath = resolveStoredPath(req.params.fileId);
  if (!storedPath) {
    return res.status(404).json({ success: false, message: '文件已丢失' });
  }

  res.setHeader('Content-Type', found.meta.mimeType || 'application/octet-stream');
  const isImage = /^image\//i.test(found.meta.mimeType || '');
  res.setHeader(
    'Content-Disposition',
    isImage
      ? 'inline'
      : `attachment; filename*=UTF-8''${encodeURIComponent(found.meta.name)}`
  );
  res.sendFile(path.resolve(storedPath));
});

router.delete('/files/:fileId', requireAuth, (req, res) => {
  const store = getDb();
  const refId = req.params.fileId;
  const scopedEntityType = String(req.query.entityType || '').trim();
  const scopedEntityId = String(req.query.entityId || '').trim();

  let found = null;
  if (scopedEntityType && scopedEntityId) {
    found = removeAttachmentFromEntity(store, scopedEntityType, scopedEntityId, refId);
  } else {
    found = findAttachmentMeta(store, refId);
  }

  if (!found) {
    return res.status(404).json({ success: false, message: '文件不存在' });
  }

  const canDelete =
    found.entityType === 'project'
      ? canEditProjectDocs(req.user, found.project)
      : canEditTaskAttachments(req.user, found.task, store.projects) ||
        found.meta.uploadedBy === req.user.name;

  if (!canDelete) {
    return res.status(403).json({ success: false, message: '无权删除' });
  }

  if (!scopedEntityType || !scopedEntityId) {
    if (found.entityType === 'project') {
      found.project.documents = (found.project.documents || []).filter(d =>
        !matchAttachmentRef(d, refId)
      );
    } else {
      found.task.attachments = (found.task.attachments || []).filter(a =>
        !matchAttachmentRef(a, refId)
      );
    }
  }

  if (found.entityType === 'project') {
    appendChangeLog(store, {
      id: genDocId('L'),
      taskId: `PROJECT-${found.project.id}`,
      operator: req.user.name,
      operateTime: new Date().toLocaleString('zh-CN'),
      before: found.meta.name,
      after: '已删除',
      reason: isWikiAttachment(found.meta) ? '删除项目钉钉文档' : '删除项目文档',
      project: found.project.name,
    });
  } else {
    appendChangeLog(store, {
      id: genDocId('L'),
      taskId: found.task.id,
      operator: req.user.name,
      operateTime: new Date().toLocaleString('zh-CN'),
      before: found.meta.name,
      after: '已删除',
      reason: isWikiAttachment(found.meta) ? '删除任务钉钉文档' : '删除任务附件',
      project: found.project?.name || '临时任务',
    });
  }

  if (!isWikiAttachment(found.meta) && found.meta.fileId) {
    const remainingRefs = countStoredFileReferences(store, found.meta.fileId);
    if (remainingRefs === 0) {
      deleteStoredFile(found.meta.fileId);
    }
  }
  persistStore();
  res.json({ success: true, message: '已删除' });
});

router.get('/files-info/types', requireAuth, (_req, res) => {
  res.json({
    success: true,
    maxUploadMB: Math.round(config.maxUploadBytes / 1024 / 1024),
    allowedExt: [...require('../services/fileStorage').ALLOWED_EXT],
  });
});

module.exports = router;
