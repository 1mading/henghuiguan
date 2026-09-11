/**
 * 共享运行时状态说明（小 B 过渡期）。
 *
 * 业务数据与函数仍由 src/app/*.js 经典脚本注入到同一全局作用域。
 * 本文件供工程化入口与后续渐进 ESM 化引用，不重复声明业务状态。
 *
 * 主要全局（注入后可用）：
 * - state / currentUser / authSession
 * - users / projects / tasks / taskDependencies / changeLogs / issues / projectTemplates
 * - DataService / AuthService / DingTalkApi / NotificationService / render / goTo
 */
export const HHG_STORE_KEYS = [
  'state',
  'currentUser',
  'authSession',
  'users',
  'projects',
  'tasks',
  'taskDependencies',
  'changeLogs',
  'issues',
  'projectTemplates',
  'transferLogs',
  'staffDeptCatalog',
];

export function getStoreSnapshot() {
  const out = {};
  for (const key of HHG_STORE_KEYS) {
    if (typeof window !== 'undefined' && key in window) out[key] = window[key];
  }
  return out;
}
