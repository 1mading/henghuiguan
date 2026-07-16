/** 总经理与管理员：业务权限相同，展示名称不同 */
function isFullAccess(role) {
  return role === 'gm' || role === 'admin';
}

module.exports = { isFullAccess };
