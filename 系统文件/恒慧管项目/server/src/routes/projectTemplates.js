const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { writeOk, writeErr } = require('../utils/response');
const { isFullAccess } = require('../utils/roles');
const { capOn } = require('../services/permissions');
const {
  listTemplates,
  publicTemplate,
  saveTemplateFromProject,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  resetBuiltinTemplate,
} = require('../services/projectTemplates');

const router = express.Router();

/** 与前端「可建项目」对齐：可管理模板库 */
function canManageTemplates(user) {
  if (!user) return false;
  if (isFullAccess(user.role)) return true;
  return capOn(user, 'projects.create');
}

function requireTemplateManager(req, res, next) {
  if (!canManageTemplates(req.user)) {
    return writeErr(res, 403, '无权管理模板库');
  }
  next();
}

router.get('/project-templates', requireAuth, (_req, res) => {
  writeOk(res, {
    templates: listTemplates().map(publicTemplate),
  });
});

router.get('/project-templates/:id', requireAuth, (req, res) => {
  const tpl = getTemplate(req.params.id);
  if (!tpl) return writeErr(res, 404, '模板不存在');
  writeOk(res, { template: publicTemplate(tpl) });
});

router.post('/project-templates', requireAuth, requireTemplateManager, (req, res) => {
  try {
    const tpl = createTemplate(req.body || {}, {
      createdBy: req.user?.name || req.user?.id || '',
    });
    writeOk(res, { template: tpl });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '创建失败');
  }
});

router.patch('/project-templates/:id', requireAuth, requireTemplateManager, (req, res) => {
  try {
    const tpl = updateTemplate(req.params.id, req.body || {}, {
      updatedBy: req.user?.name || req.user?.id || '',
    });
    writeOk(res, { template: tpl });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '更新失败');
  }
});

router.post('/project-templates/:id/reset', requireAuth, requireTemplateManager, (req, res) => {
  try {
    writeOk(res, { template: resetBuiltinTemplate(req.params.id) });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '恢复失败');
  }
});

/** 从现有项目另存为模板 */
router.post('/project-templates/from-project/:projectId', requireAuth, requireTemplateManager, (req, res) => {
  try {
    const tpl = saveTemplateFromProject(req.params.projectId, {
      name: req.body?.name,
      desc: req.body?.desc,
      id: req.body?.id,
      createdBy: req.user?.name || req.user?.id || '',
    });
    writeOk(res, { template: tpl });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '保存失败');
  }
});

router.delete('/project-templates/:id', requireAuth, requireTemplateManager, (req, res) => {
  try {
    const allowBuiltin = isFullAccess(req.user?.role) && req.query.force === '1';
    writeOk(res, deleteTemplate(req.params.id, { allowBuiltin }));
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '删除失败');
  }
});

module.exports = router;
