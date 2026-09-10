/**
 * 改造需求 v1.1：日期基线、阶段同步、交接、问题闭环
 */
const {
  getDb,
  persistStore,
  normalizeProjectRecord,
  appendChangeLogs,
  getAllTasks,
  getAllProjects,
} = require('../db/database');
const {
  assertScopedCanWriteProject,
  assertScopedCanReadProject,
  assertScopedCanWriteTask,
} = require('./scopedApiKeys');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeDate(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return s;
}

function nowLocale() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function ensureIssuesArray(store) {
  if (!Array.isArray(store.issues)) store.issues = [];
  return store.issues;
}

/**
 * 任务日期基线：首次改日写入 original*；已有原定后再次改日必须带 changeReason
 */
function applyTaskDateBaseline(prev, next, body = {}, opts = {}) {
  const reason = body.changeReason != null ? String(body.changeReason).trim() : undefined;
  let changed = false;

  if (body.planStartDate !== undefined) {
    const newStart = normalizeDate(body.planStartDate) || null;
    const oldStart = prev.planStartDate || null;
    if (newStart !== oldStart) {
      if (!prev.originalPlanStartDate && oldStart) {
        next.originalPlanStartDate = oldStart;
      }
      next.planStartDate = newStart;
      changed = true;
    }
  }
  if (body.dueDate !== undefined) {
    const newDue = normalizeDate(body.dueDate);
    const oldDue = prev.dueDate || '';
    if (newDue !== oldDue) {
      if (!prev.originalDueDate && oldDue) {
        next.originalDueDate = oldDue;
      }
      next.dueDate = newDue;
      changed = true;
    }
  }
  if (reason !== undefined) next.changeReason = reason;
  if (changed) {
    const hadBaseline = !!(prev.originalPlanStartDate || prev.originalDueDate);
    const reasonText = reason !== undefined
      ? reason
      : String(next.changeReason || body.reason || '').trim();
    if (hadBaseline && !reasonText && opts.requireReason !== false) {
      throw httpError(400, '已有原定日期，再次变更须填写变更原因');
    }
  }
  return changed;
}

/**
 * 项目最终完成日基线
 */
function applyProjectDateBaseline(prev, next, body = {}, opts = {}) {
  const reason = body.changeReason != null ? String(body.changeReason).trim() : undefined;
  let changed = false;
  if (body.endDate !== undefined) {
    const newEnd = normalizeDate(body.endDate);
    const oldEnd = prev.endDate || '';
    if (newEnd !== oldEnd) {
      if (!prev.originalEndDate && oldEnd) {
        next.originalEndDate = oldEnd;
      }
      next.endDate = newEnd;
      changed = true;
    }
  }
  if (reason !== undefined) next.changeReason = reason;
  if (changed && prev.originalEndDate) {
    const reasonText = reason !== undefined
      ? reason
      : String(next.changeReason || body.reason || '').trim();
    if (!reasonText && opts.requireReason !== false) {
      throw httpError(400, '已有原定完成日，再次变更须填写变更原因');
    }
  }
  return changed;
}

function milestoneDone(status) {
  return status === 'done' || status === 'archived';
}

/**
 * 取「当前未完成的最近里程碑」标题作为 currentPhase；全部完成则用最后一条
 */
function deriveCurrentPhaseFromMilestones(projectId, tasks) {
  const milestones = (tasks || [])
    .filter(t => t && String(t.projectId) === String(projectId) && t.isMilestone)
    .slice()
    .sort((a, b) => {
      const sa = String(a.milestoneSeq || a.planStartDate || a.title || '');
      const sb = String(b.milestoneSeq || b.planStartDate || b.title || '');
      return sa.localeCompare(sb, 'zh');
    });
  if (!milestones.length) {
    return { phase: '', driverMilestoneId: '', driverTitle: '' };
  }
  const open = milestones.find(m => !milestoneDone(m.status));
  const driver = open || milestones[milestones.length - 1];
  const title = String(driver.title || driver.milestoneSeq || '').trim();
  return {
    phase: title,
    driverMilestoneId: driver.id || '',
    driverTitle: title,
  };
}

function syncProjectPhase(projectId, opts = {}) {
  const store = getDb();
  const idx = store.projects.findIndex(p => String(p.id) === String(projectId));
  if (idx < 0) throw httpError(404, `项目不存在: ${projectId}`);
  const prev = store.projects[idx];
  if (opts.actor) assertScopedCanWriteProject(opts.actor, prev);

  const derived = deriveCurrentPhaseFromMilestones(projectId, store.tasks);
  const next = {
    ...prev,
    currentPhase: derived.phase || prev.currentPhase || '',
    phaseSyncedAt: new Date().toISOString(),
    phaseDriverMilestoneId: derived.driverMilestoneId || '',
  };
  store.projects[idx] = normalizeProjectRecord(next);
  persistStore();

  const operator = opts.operator || (opts.actor && opts.actor.name) || 'system';
  if (prev.currentPhase !== next.currentPhase) {
    appendChangeLogs([{
      id: genId('CL'),
      taskId: `PROJECT-${projectId}`,
      operator,
      operateTime: nowLocale(),
      before: prev.currentPhase || '（空）',
      after: next.currentPhase || '（空）',
      reason: '同步当前阶段（随里程碑）',
      project: next.name,
    }]);
  }
  return {
    project: next,
    derived,
  };
}

/** 里程碑完成后自动尝试同步阶段（不抛错） */
function maybeAutoSyncPhaseAfterTaskUpdate(task, operator) {
  if (!task || !task.isMilestone || !task.projectId) return null;
  if (!milestoneDone(task.status)) return null;
  try {
    return syncProjectPhase(task.projectId, { operator: operator || 'system' });
  } catch (e) {
    console.warn('[governance] auto sync phase failed:', e.message);
    return null;
  }
}

function handoverProject(projectId, body = {}, opts = {}) {
  const store = getDb();
  const idx = store.projects.findIndex(p => String(p.id) === String(projectId));
  if (idx < 0) throw httpError(404, `项目不存在: ${projectId}`);
  const prev = store.projects[idx];
  if (opts.actor) assertScopedCanWriteProject(opts.actor, prev);

  const toName = String(body.to || body.toName || body.manager || '').trim();
  if (!toName) throw httpError(400, '请指定交接人 to');
  const note = String(body.note || '').trim();
  const operator = opts.operator || (opts.actor && opts.actor.name) || String(body.operator || '').trim() || 'system';
  const fromName = prev.manager || '';

  if (toName === fromName) throw httpError(400, '交接人与当前负责人相同');

  const record = {
    from: fromName,
    to: toName,
    at: new Date().toISOString(),
    note,
    by: operator,
  };
  const records = Array.isArray(prev.handoverRecords) ? [...prev.handoverRecords] : [];
  records.push(record);

  const team = [...new Set([...(prev.teamMembers || []), fromName].filter(n => n && n !== toName))];

  const next = normalizeProjectRecord({
    ...prev,
    manager: toName,
    teamMembers: team,
    handoverRecords: records,
  });
  store.projects[idx] = next;
  persistStore();

  appendChangeLogs([{
    id: genId('CL'),
    taskId: `PROJECT-${projectId}`,
    operator,
    operateTime: nowLocale(),
    before: fromName || '（空）',
    after: toName,
    reason: note ? `项目交接：${note}` : '项目交接',
    project: next.name,
  }]);

  return { project: next, handover: record };
}

const ISSUE_STATUSES = new Set(['open', 'in_progress', 'resolved', 'verified', 'closed']);

function listIssues(query = {}, opts = {}) {
  const store = getDb();
  let list = [...ensureIssuesArray(store)];
  if (query.projectId) {
    list = list.filter(i => String(i.projectId) === String(query.projectId));
  }
  if (query.status) {
    list = list.filter(i => i.status === query.status);
  }
  if (opts.actor) {
    const projects = getAllProjects();
    const allowed = new Set();
    for (const p of projects) {
      try {
        assertScopedCanReadProject(opts.actor, p);
        allowed.add(String(p.id));
      } catch {
        /* skip */
      }
    }
    list = list.filter(i => allowed.has(String(i.projectId)));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function createIssue(body = {}, opts = {}) {
  const projectId = String(body.projectId || '').trim();
  if (!projectId) throw httpError(400, 'projectId 不能为空');
  const project = getAllProjects().find(p => String(p.id) === projectId);
  if (!project) throw httpError(404, `项目不存在: ${projectId}`);
  if (opts.actor) assertScopedCanWriteProject(opts.actor, project);

  const title = String(body.title || '').trim();
  if (!title) throw httpError(400, 'title 不能为空');

  const taskId = body.taskId != null && body.taskId !== '' ? String(body.taskId).trim() : '';
  if (taskId) {
    const task = getAllTasks().find(t => String(t.id) === taskId);
    if (!task) throw httpError(400, `任务不存在: ${taskId}`);
    if (opts.actor) assertScopedCanWriteTask(opts.actor, task);
  }

  const now = new Date().toISOString();
  const issue = {
    id: String(body.id || '').trim() || genId('ISS'),
    projectId,
    taskId: taskId || undefined,
    title,
    status: ISSUE_STATUSES.has(body.status) ? body.status : 'open',
    fact: String(body.fact || '').trim(),
    cause: String(body.cause || '').trim(),
    impact: String(body.impact || '').trim(),
    solution: String(body.solution || '').trim(),
    supporter: String(body.supporter || '').trim(),
    assignee: String(body.assignee || '').trim(),
    expectedCloseDate: normalizeDate(body.expectedCloseDate) || '',
    verifiedAt: '',
    verifiedBy: '',
    closedAt: '',
    createdAt: now,
    updatedAt: now,
    createdBy: opts.operator || (opts.actor && opts.actor.name) || String(body.operator || '').trim() || '',
  };
  if (!issue.taskId) delete issue.taskId;

  const store = getDb();
  ensureIssuesArray(store).push(issue);
  persistStore();
  return { issue };
}

function updateIssue(id, body = {}, opts = {}) {
  const store = getDb();
  const list = ensureIssuesArray(store);
  const idx = list.findIndex(i => String(i.id) === String(id));
  if (idx < 0) throw httpError(404, `问题不存在: ${id}`);
  const prev = list[idx];
  const project = getAllProjects().find(p => String(p.id) === String(prev.projectId));
  if (opts.actor && project) assertScopedCanWriteProject(opts.actor, project);

  const next = { ...prev };
  ['title', 'fact', 'cause', 'impact', 'solution', 'supporter', 'assignee'].forEach((k) => {
    if (body[k] != null) next[k] = String(body[k]).trim();
  });
  if (body.expectedCloseDate != null) next.expectedCloseDate = normalizeDate(body.expectedCloseDate);
  if (body.taskId !== undefined) {
    next.taskId = body.taskId == null || body.taskId === '' ? undefined : String(body.taskId).trim();
    if (!next.taskId) delete next.taskId;
  }
  if (body.status != null) {
    const status = String(body.status).trim();
    if (!ISSUE_STATUSES.has(status)) throw httpError(400, `无效问题状态: ${status}`);
    next.status = status;
    const operator = opts.operator || (opts.actor && opts.actor.name) || String(body.operator || '').trim() || '';
    if (status === 'verified' || status === 'closed') {
      next.verifiedAt = body.verifiedAt || nowLocale();
      next.verifiedBy = String(body.verifiedBy || operator || '').trim();
      if (!next.verifiedBy) throw httpError(400, '关闭/验收须填写 verifiedBy');
    }
    if (status === 'closed') {
      next.closedAt = body.closedAt || new Date().toISOString();
    }
  }
  next.updatedAt = new Date().toISOString();
  list[idx] = next;
  persistStore();
  return { issue: next };
}

function createIssueFromBlocker(projectId, opts = {}) {
  const project = getAllProjects().find(p => String(p.id) === String(projectId));
  if (!project) throw httpError(404, `项目不存在: ${projectId}`);
  const blocker = String(project.blocker || '').trim();
  if (!blocker) throw httpError(400, '当前无卡点可升级');
  return createIssue({
    projectId,
    title: blocker.slice(0, 80),
    fact: blocker,
    status: 'open',
  }, opts);
}

module.exports = {
  applyTaskDateBaseline,
  applyProjectDateBaseline,
  deriveCurrentPhaseFromMilestones,
  syncProjectPhase,
  maybeAutoSyncPhaseAfterTaskUpdate,
  handoverProject,
  listIssues,
  createIssue,
  updateIssue,
  createIssueFromBlocker,
  ISSUE_STATUSES,
  normalizeDate,
};
