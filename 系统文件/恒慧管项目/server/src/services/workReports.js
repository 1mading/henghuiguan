const { v4: uuidv4 } = require('uuid');
const { getDb, persistStore } = require('../db/database');

function ensureWorkReportsStore(store = getDb()) {
  if (!Array.isArray(store.workReports)) {
    store.workReports = [];
    return true;
  }
  return false;
}

function getAllWorkReports() {
  const store = getDb();
  ensureWorkReportsStore(store);
  return store.workReports;
}

function findWorkReportById(id) {
  return getAllWorkReports().find(r => r && r.id === id) || null;
}

/** 仅本人可见、可改 */
function listWorkReportsForUser(user) {
  if (!user) return [];
  return getAllWorkReports().filter(r => r.authorId === user.id);
}

function canViewWorkReport(user, report) {
  return !!(user && report && report.authorId === user.id);
}

function canEditWorkReport(user, report) {
  return canViewWorkReport(user, report);
}

function upsertWorkReport(user, payload = {}) {
  const store = getDb();
  ensureWorkReportsStore(store);
  const now = new Date().toISOString();
  let report = null;

  if (payload.id) {
    report = store.workReports.find(r => r.id === payload.id);
    if (!report) {
      const err = new Error('汇报不存在');
      err.status = 404;
      throw err;
    }
    if (!canEditWorkReport(user, report)) {
      const err = new Error('无权编辑该汇报');
      err.status = 403;
      throw err;
    }
  } else {
    report = {
      id: `WR-${uuidv4().slice(0, 8).toUpperCase()}`,
      authorId: user.id,
      authorName: user.name || '',
      createdAt: now,
    };
    store.workReports.unshift(report);
  }

  const type = payload.type === 'weekly' ? 'weekly' : 'daily';
  report.type = type;
  report.periodStart = String(payload.periodStart || report.periodStart || '').slice(0, 10);
  report.periodEnd = String(payload.periodEnd || report.periodEnd || '').slice(0, 10);
  report.metrics = payload.metrics && typeof payload.metrics === 'object' ? payload.metrics : (report.metrics || {});
  report.status = 'saved';
  report.updatedAt = now;

  if (type === 'daily') {
    report.importantWork = String(payload.importantWork ?? report.importantWork ?? '');
    report.dailyWork = String(payload.dailyWork ?? report.dailyWork ?? '');
  } else {
    report.todayReport = String(payload.todayReport ?? report.todayReport ?? '');
    report.weekFocus = String(payload.weekFocus ?? report.weekFocus ?? '');
    report.weekIssues = String(payload.weekIssues ?? report.weekIssues ?? '');
    report.improvePlan = String(payload.improvePlan ?? report.improvePlan ?? '');
    report.sysSuggest = String(payload.sysSuggest ?? report.sysSuggest ?? '');
    report.collabSuggest = String(payload.collabSuggest ?? report.collabSuggest ?? '');
    report.weekLearning = String(payload.weekLearning ?? report.weekLearning ?? '');
  }

  persistStore();
  return report;
}

module.exports = {
  ensureWorkReportsStore,
  getAllWorkReports,
  findWorkReportById,
  listWorkReportsForUser,
  canViewWorkReport,
  canEditWorkReport,
  upsertWorkReport,
};
