const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { writeErr } = require('../utils/response');
const { emitChange } = require('../services/realtime');
const {
  getRolePermissions,
  saveRolePermissions,
  resetRolePermissions,
  getCatalog,
  canAccessPermissionsPage,
  canEditPermissions,
  defaultMatrix,
} = require('../services/permissions');

const router = express.Router();

function requirePermissionsViewer(req, res, next) {
  if (!canAccessPermissionsPage(req.user)) {
    return writeErr(res, 403, '无权限查看权限管理');
  }
  next();
}

function requirePermissionsEditor(req, res, next) {
  if (!canEditPermissions(req.user)) {
    return writeErr(res, 403, '仅总经理/管理员可修改权限矩阵');
  }
  next();
}

router.get('/permissions', requireAuth, requirePermissionsViewer, (req, res) => {
  res.json({
    success: true,
    catalog: getCatalog(),
    matrix: getRolePermissions(),
    defaults: defaultMatrix(),
    canEdit: canEditPermissions(req.user),
  });
});

router.get('/permissions/matrix', requireAuth, (_req, res) => {
  // 登录用户均可拉取矩阵（前端 can* 依赖）；不含可编辑态
  res.json({
    success: true,
    matrix: getRolePermissions(),
    catalog: getCatalog(),
  });
});

router.put('/permissions', requireAuth, requirePermissionsEditor, (req, res) => {
  try {
    const body = req.body || {};
    const matrix = body.matrix != null ? body.matrix : body;
    const saved = saveRolePermissions(matrix);
    emitChange({ type: 'rolePermissions', entityType: 'rolePermissions' });
    res.json({ success: true, matrix: saved, message: '权限矩阵已保存' });
  } catch (e) {
    writeErr(res, 400, e.message || '保存失败');
  }
});

router.post('/permissions/reset', requireAuth, requirePermissionsEditor, (_req, res) => {
  try {
    const saved = resetRolePermissions();
    emitChange({ type: 'rolePermissions', entityType: 'rolePermissions' });
    res.json({ success: true, matrix: saved, message: '已恢复默认权限' });
  } catch (e) {
    writeErr(res, 400, e.message || '重置失败');
  }
});

module.exports = router;
