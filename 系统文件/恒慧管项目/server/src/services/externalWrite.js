/**
 * 第三方写入：项目 / 任务 / 评论 / 依赖 / 人员 / 工作日历 / 批量
 */
const { v4: uuidv4 } = require('uuid');
const {
  getDb,
  persistStore,
  getAllUsers,
  getAllProjects,
  getAllTasks,
  getAllTaskDependencies,
  findUserById,
  findUserByDingTalkId,
  upsertUser,
  setWorkCalendar,
  getWorkCalendar,
  appendChangeLogs,
  normalizeProjectRecord,
} = require('../db/database');
const { emitChange } = require('./realtime');
const { buildProjectPlanLedger } = require('../utils/projectPlanLedger');
const {
  assertScopedCanReadProject,
  assertScopedCanReadTask,
  assertScopedCanWriteProject,
  assertScopedCanWriteTask,
  assertScopedCanAbolishTask,
} = require('./scopedApiKeys');

const TASK_STATUSES = new Set(['todo', 'doing', 'paused', 'done', 'abolished', 'archived']);
const TASK_PRIORITIES = new Set(['urgent', 'important', 'normal']);
const PROJECT_STATUSES = new Set(['active', 'paused', 'done', 'archived']);
const DEP_TYPE_FS = 'finish_to_start';
const DEP_BLOCK_HARD = 'hard';
const DEP_BLOCK_SOFT = 'soft';
const DEP_STATUS_ACTIVE = 'active';
const DEP_STATUS_INACTIVE = 'inactive';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function denyScoped(actor, action) {
  if (actor) throw httpError(403, `作用域 Key 不能${action}，请使用可管理范围内的项目/任务接口`);
}

function scopedActorName(actor, fallback) {
  return (actor && actor.name) || fallback;
}

function genId(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${time}${rand}`;
}

function nowCreatedAt() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeDate(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const parsed = Date.parse(v);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().split('T')[0];
  return '';
}

function sanitizeTeamMembers(manager, teamMembers) {
  return [...new Set((teamMembers || []).filter(n => n && n !== manager))];
}

function findUserByName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const users = getAllUsers();
  return users.find(u => u.name === n)
    || users.find(u => u.name && (u.name.startsWith(n) || n.startsWith(String(u.name).split(/\s+/)[0])))
    || users.find(u => u.name && u.name.includes(n))
    || null;
}

function resolvePersonName(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object') {
    return resolvePersonName(raw.name || raw.userName || raw.displayName || raw.dingTalkUserId || raw.id);
  }
  const text = String(raw).trim();
  if (!text) return '';
  const byDing = findUserByDingTalkId(text);
  if (byDing) return byDing.name;
  const byId = findUserById(text);
  if (byId) return byId.name;
  const byName = findUserByName(text);
  if (byName) return byName.name;
  return text;
}

function findProject(id) {
  return getAllProjects().find(p => String(p.id) === String(id)) || null;
}

function findTask(id) {
  return getAllTasks().find(t => String(t.id) === String(id)) || null;
}

function findDependency(id) {
  return getAllTaskDependencies().find(d => String(d.id) === String(id)) || null;
}

function emitEntityChange(type, entityType, entity, actor) {
  return emitChange({
    type,
    entityType,
    entityIds: entity?.id ? [entity.id] : [],
    actorId: actor || 'external-api',
    meta: { source: 'external' },
  });
}

function persistOrThrow() {
  if (!persistStore()) throw httpError(500, '数据写入失败');
}

function createDefaultPhaseMilestones(project, creator, templateId) {
  const {
    getTemplate,
    TPL_STD_ID,
    TPL_WMS_ID,
    ensureProjectTemplates,
  } = require('./projectTemplates');
  ensureProjectTemplates(getDb());
  const tid = templateId === '' || templateId === false || templateId === 'none'
    ? null
    : String(templateId || TPL_WMS_ID).trim();
  // 默认新建用 WMS；显式传 TPL-STD 用旧过程组；none 不生成
  if (tid == null) return [];
  const tpl = getTemplate(tid) || getTemplate(TPL_WMS_ID) || getTemplate(TPL_STD_ID);
  if (!tpl || !Array.isArray(tpl.stages) || !tpl.stages.length) return [];

  const store = getDb();
  const created = [];
  let seq = 0;
  for (const stage of tpl.stages) {
    seq += 1;
    const milestone = {
      id: genId('T'),
      projectId: project.id,
      parentId: null,
      isMilestone: true,
      title: String(stage.label || stage.name || stage.key || `阶段${seq}`),
      type: 'normal',
      creator,
      assignee: project.manager,
      collaboratorEntries: [],
      collaborators: [],
      status: 'todo',
      priority: 'normal',
      progress: 0,
      estimatedHours: 0,
      actualHours: 0,
      planStartDate: project.startDate || null,
      dueDate: '',
      actualStartDate: null,
      actualEndDate: null,
      attachments: [],
      comments: [],
      desc: '',
      createdAt: nowCreatedAt(),
      phaseKey: String(stage.key || ''),
      milestoneSeq: String(stage.milestoneSeq || `M${seq}`),
      roleA: project.manager || '',
      roleR: project.manager || '',
      roleC: '',
      roleV: '',
      deliverables: String(stage.deliverables || '').trim(),
      acceptanceCriteria: String(stage.acceptanceCriteria || '').trim(),
      completionEvidence: '',
      verification: '',
      feedback: '',
      leftover: '',
      depsRisks: '',
      escalation: '',
      delayImpact: '',
      reopenConditions: '',
    };
    store.tasks.push(milestone);
    created.push(milestone);

    const pushChild = (title, { asGate }) => {
      const raw = String(title || '').trim();
      if (!raw) return;
      const childTitle = asGate
        ? (raw.startsWith('【') ? raw : `【里程碑】${raw}`)
        : raw;
      const child = {
        id: genId('T'),
        projectId: project.id,
        parentId: milestone.id,
        isMilestone: false,
        title: childTitle,
        type: 'normal',
        creator,
        assignee: project.manager,
        collaboratorEntries: [],
        collaborators: [],
        status: 'todo',
        priority: asGate ? 'important' : 'normal',
        progress: 0,
        estimatedHours: 0,
        actualHours: 0,
        planStartDate: project.startDate || null,
        dueDate: '',
        actualStartDate: null,
        actualEndDate: null,
        attachments: [],
        comments: [],
        desc: '',
        createdAt: nowCreatedAt(),
      };
      store.tasks.push(child);
      created.push(child);
    };

    for (const t of (stage.tasks || [])) pushChild(t, { asGate: false });
    for (const g of (stage.gates || [])) pushChild(g, { asGate: true });
  }
  return created;
}

function createProject(body = {}, opts = {}) {
  denyScoped(opts.actor, '新建项目');
  const name = String(body.name || body.title || '').trim();
  if (!name) throw httpError(400, '项目名称 name 不能为空');

  const manager = resolvePersonName(body.manager) || resolvePersonName(body.creator) || '外部系统';
  const creator = resolvePersonName(body.creator) || manager;
  const id = String(body.id || '').trim() || genId('PRJ');
  if (findProject(id)) throw httpError(409, `项目已存在: ${id}`);

  const status = String(body.status || 'active').trim();
  if (!PROJECT_STATUSES.has(status)) throw httpError(400, `无效项目状态: ${status}`);

  const project = {
    id,
    name,
    desc: String(body.desc || body.description || '').trim(),
    objective: String(body.objective || '').trim(),
    value: String(body.value || '').trim(),
    scope: String(body.scope || '').trim(),
    outOfScope: String(body.outOfScope || '').trim(),
    nextPlan: String(body.nextPlan || '').trim(),
    blocker: String(body.blocker || '').trim(),
    currentPhase: String(body.currentPhase || '').trim(),
    dept: String(body.dept || '').trim(),
    manager,
    teamMembers: sanitizeTeamMembers(manager, Array.isArray(body.teamMembers) ? body.teamMembers.map(resolvePersonName) : []),
    status,
    startDate: normalizeDate(body.startDate) || new Date().toISOString().split('T')[0],
    endDate: normalizeDate(body.endDate) || '',
    archived: status === 'archived' || body.archived === true,
    creator,
    createdAt: String(body.createdAt || nowCreatedAt()),
    documents: Array.isArray(body.documents) ? body.documents : [],
    planVerified: body.planVerified === true,
    planVerifiedBy: String(body.planVerifiedBy || '').trim(),
    planVerifiedAt: String(body.planVerifiedAt || '').trim(),
    stageTemplateId: String(body.stageTemplateId || body.templateId || '').trim(),
    externalMeta: body.externalMeta && typeof body.externalMeta === 'object' ? body.externalMeta : undefined,
  };
  if (!project.externalMeta) delete project.externalMeta;

  const store = getDb();
  store.projects.push(normalizeProjectRecord(project));
  let templateTasks = [];
  if (body.withTemplate !== false && body.withTemplate !== 'false') {
    const tplId = body.stageTemplateId != null || body.templateId != null
      ? (body.stageTemplateId ?? body.templateId)
      : require('./projectTemplates').TPL_WMS_ID;
    if (tplId !== '' && tplId !== 'none' && tplId !== false) {
      project.stageTemplateId = String(tplId);
      store.projects[store.projects.length - 1] = normalizeProjectRecord(project);
      templateTasks = createDefaultPhaseMilestones(project, creator, tplId);
    }
  }
  persistOrThrow();
  emitEntityChange('project.created', 'project', project, creator);
  return { project, templateTaskCount: templateTasks.length };
}

function updateProject(id, body = {}, opts = {}) {
  const store = getDb();
  const idx = store.projects.findIndex(p => String(p.id) === String(id));
  if (idx < 0) throw httpError(404, `项目不存在: ${id}`);
  const prev = store.projects[idx];
  if (opts.actor) assertScopedCanWriteProject(opts.actor, prev);
  const next = { ...prev };

  if (body.name != null) next.name = String(body.name).trim() || prev.name;
  if (body.desc != null || body.description != null) next.desc = String(body.desc ?? body.description ?? '').trim();
  if (body.objective != null) next.objective = String(body.objective).trim();
  if (body.value != null) next.value = String(body.value).trim();
  if (body.scope != null) next.scope = String(body.scope).trim();
  if (body.outOfScope != null) next.outOfScope = String(body.outOfScope).trim();
  if (body.nextPlan != null) next.nextPlan = String(body.nextPlan).trim();
  if (body.blocker != null) next.blocker = String(body.blocker).trim();
  if (body.currentPhase != null) next.currentPhase = String(body.currentPhase).trim();
  if (body.dept != null) next.dept = String(body.dept).trim();
  if (body.manager != null) next.manager = resolvePersonName(body.manager) || prev.manager;
  if (Array.isArray(body.teamMembers)) {
    next.teamMembers = sanitizeTeamMembers(next.manager, body.teamMembers.map(resolvePersonName));
  }
  if (body.status != null) {
    const status = String(body.status).trim();
    if (!PROJECT_STATUSES.has(status)) throw httpError(400, `无效项目状态: ${status}`);
    next.status = status;
    next.archived = status === 'archived';
  }
  if (body.archived != null) {
    next.archived = !!body.archived;
    if (next.archived) next.status = 'archived';
  }
  if (body.startDate != null) next.startDate = normalizeDate(body.startDate) || next.startDate;
  {
    const governance = require('./governance');
    if (body.endDate != null || body.changeReason != null || body.originalEndDate != null) {
      if (body.originalEndDate != null && !prev.originalEndDate) {
        next.originalEndDate = normalizeDate(body.originalEndDate) || next.originalEndDate;
      }
      governance.applyProjectDateBaseline(prev, next, {
        ...body,
        changeReason: body.changeReason != null ? body.changeReason : body.reason,
      });
    }
  }
  if (body.planVerified != null) next.planVerified = body.planVerified === true || body.planVerified === 'true';
  if (body.planVerifiedBy != null) next.planVerifiedBy = String(body.planVerifiedBy).trim();
  if (body.planVerifiedAt != null) next.planVerifiedAt = String(body.planVerifiedAt).trim();
  if (body.externalMeta && typeof body.externalMeta === 'object') {
    next.externalMeta = { ...(prev.externalMeta || {}), ...body.externalMeta };
  }

  next.teamMembers = sanitizeTeamMembers(next.manager, next.teamMembers);
  store.projects[idx] = normalizeProjectRecord(next);
  persistOrThrow();
  emitEntityChange('project.updated', 'project', next, resolvePersonName(body.operator) || 'external-api');
  return { project: next };
}

function deleteProject(id, { cascadeTasks = true, actor = null } = {}) {
  denyScoped(actor, '删除项目');
  const store = getDb();
  const idx = store.projects.findIndex(p => String(p.id) === String(id));
  if (idx < 0) throw httpError(404, `项目不存在: ${id}`);
  const [removed] = store.projects.splice(idx, 1);
  let removedTaskIds = [];
  if (cascadeTasks !== false) {
    const before = store.tasks.length;
    const keep = [];
    for (const t of store.tasks) {
      if (String(t.projectId) === String(id)) removedTaskIds.push(t.id);
      else keep.push(t);
    }
    store.tasks = keep;
    const removedSet = new Set(removedTaskIds);
    store.taskDependencies = (store.taskDependencies || []).filter(d =>
      !removedSet.has(d.predecessorTaskId) && !removedSet.has(d.successorTaskId)
    );
    if (removedTaskIds.length !== before - keep.length) {
      // no-op safeguard
    }
  }
  persistOrThrow();
  emitEntityChange('project.deleted', 'project', removed, 'external-api');
  return { project: removed, removedTaskIds };
}

function normalizeCollaboratorEntries(body, fallbackNames = []) {
  if (Array.isArray(body.collaboratorEntries)) {
    return body.collaboratorEntries.map(e => ({
      name: resolvePersonName(e.name || e),
      role: e.role === 'assist' ? 'assist' : 'inform',
    })).filter(e => e.name);
  }
  const inform = Array.isArray(body.informCollaborators) ? body.informCollaborators : [];
  const assist = Array.isArray(body.assistCollaborators) ? body.assistCollaborators : [];
  const fromLegacy = [
    ...inform.map(n => ({ name: resolvePersonName(n), role: 'inform' })),
    ...assist.map(n => ({ name: resolvePersonName(n), role: 'assist' })),
  ].filter(e => e.name);
  if (fromLegacy.length) return fromLegacy;
  return (fallbackNames || []).map(n => ({ name: resolvePersonName(n), role: 'inform' })).filter(e => e.name);
}

function createTask(body = {}, opts = {}) {
  const title = String(body.title || body.name || '').trim();
  if (!title) throw httpError(400, '任务标题 title 不能为空');

  const id = String(body.id || '').trim() || genId('T');
  if (findTask(id)) throw httpError(409, `任务已存在: ${id}`);

  const projectId = body.projectId != null ? String(body.projectId).trim() : '';
  if (projectId && !findProject(projectId)) throw httpError(400, `所属项目不存在: ${projectId}`);
  if (opts.actor) {
    if (!projectId) throw httpError(403, '作用域 Key 创建任务时必须指定可管理的 projectId');
    assertScopedCanWriteProject(opts.actor, findProject(projectId));
  }

  const parentId = body.parentId != null && body.parentId !== '' ? String(body.parentId).trim() : null;
  if (parentId && !findTask(parentId)) throw httpError(400, `父任务不存在: ${parentId}`);

  const status = String(body.status || 'todo').trim();
  if (!TASK_STATUSES.has(status)) throw httpError(400, `无效任务状态: ${status}`);
  const priority = String(body.priority || 'normal').trim().toLowerCase();
  const normalizedPriority = priority === '紧急' ? 'urgent'
    : priority === '重要' ? 'important'
      : TASK_PRIORITIES.has(priority) ? priority : 'normal';

  const creator = scopedActorName(opts.actor, resolvePersonName(body.creator) || '外部系统');
  const assignee = resolvePersonName(body.assignee) || creator;
  const collaboratorEntries = normalizeCollaboratorEntries(body, body.collaborators);
  const type = projectId
    ? (body.type === 'temp' ? 'temp' : (body.type || 'normal'))
    : (body.type || 'temp');

  const task = {
    id,
    title,
    desc: String(body.desc || body.description || '').trim(),
    type,
    projectId: projectId || '',
    parentId,
    isMilestone: body.isMilestone === true || body.isMilestone === 'true',
    assignee,
    collaboratorEntries,
    collaborators: collaboratorEntries.map(e => e.name),
    creator,
    createdAt: String(body.createdAt || nowCreatedAt()),
    status,
    priority: normalizedPriority,
    progress: Math.max(0, Math.min(100, Number(body.progress) || 0)),
    dueDate: normalizeDate(body.dueDate) || '',
    estimatedHours: Number(body.estimatedHours) || 0,
    actualHours: Number(body.actualHours) || 0,
    planStartDate: normalizeDate(body.planStartDate) || null,
    actualStartDate: normalizeDate(body.actualStartDate) || null,
    actualEndDate: normalizeDate(body.actualEndDate) || null,
    comments: Array.isArray(body.comments) ? body.comments : [],
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    milestoneSeq: String(body.milestoneSeq || '').trim(),
    roleA: String(body.roleA || '').trim(),
    roleR: String(body.roleR || '').trim() || assignee,
    roleC: String(body.roleC || '').trim(),
    roleV: String(body.roleV || '').trim(),
    deliverables: String(body.deliverables || '').trim(),
    acceptanceCriteria: String(body.acceptanceCriteria || '').trim(),
    completionEvidence: String(body.completionEvidence || '').trim(),
    verification: String(body.verification || '').trim(),
    feedback: String(body.feedback || '').trim(),
    leftover: String(body.leftover || '').trim(),
    depsRisks: String(body.depsRisks || '').trim(),
    escalation: String(body.escalation || '').trim(),
    delayImpact: String(body.delayImpact || '').trim(),
    reopenConditions: String(body.reopenConditions || '').trim(),
    originalPlanStartDate: normalizeDate(body.originalPlanStartDate) || null,
    originalDueDate: normalizeDate(body.originalDueDate) || '',
    changeReason: String(body.changeReason || '').trim(),
  };
  if (body.externalMeta && typeof body.externalMeta === 'object') {
    task.externalMeta = body.externalMeta;
  }
  if (body.intakeMeta && typeof body.intakeMeta === 'object') {
    task.intakeMeta = body.intakeMeta;
  }

  const store = getDb();
  store.tasks.push(task);
  persistOrThrow();
  emitEntityChange('task.created', 'task', task, creator);
  return { task };
}

const TASK_PATCHABLE = [
  'title', 'desc', 'description', 'type', 'projectId', 'parentId', 'isMilestone',
  'assignee', 'status', 'priority', 'progress', 'dueDate', 'estimatedHours', 'actualHours',
  'planStartDate', 'actualStartDate', 'actualEndDate', 'attachments', 'externalMeta', 'intakeMeta',
  'informCollaborators', 'assistCollaborators', 'collaboratorEntries', 'collaborators',
  'milestoneSeq', 'roleA', 'roleR', 'roleC', 'roleV',
  'deliverables', 'acceptanceCriteria', 'completionEvidence',
  'verification', 'feedback', 'leftover',
  'depsRisks', 'escalation', 'delayImpact', 'reopenConditions',
  'originalPlanStartDate', 'originalDueDate', 'changeReason',
];

function updateTask(id, body = {}, opts = {}) {
  const store = getDb();
  const idx = store.tasks.findIndex(t => String(t.id) === String(id));
  if (idx < 0) throw httpError(404, `任务不存在: ${id}`);
  const prev = store.tasks[idx];
  if (opts.actor) assertScopedCanWriteTask(opts.actor, prev);
  const next = { ...prev };

  if (body.title != null || body.name != null) {
    const title = String(body.title ?? body.name ?? '').trim();
    if (!title) throw httpError(400, '任务标题不能为空');
    next.title = title;
  }
  if (body.desc != null || body.description != null) {
    next.desc = String(body.desc ?? body.description ?? '').trim();
  }
  if (body.type != null) next.type = String(body.type).trim() || next.type;
  if (body.projectId != null) {
    const projectId = String(body.projectId).trim();
    if (projectId && !findProject(projectId)) throw httpError(400, `所属项目不存在: ${projectId}`);
    next.projectId = projectId;
  }
  if (body.parentId !== undefined) {
    const parentId = body.parentId == null || body.parentId === '' ? null : String(body.parentId).trim();
    if (parentId && !findTask(parentId)) throw httpError(400, `父任务不存在: ${parentId}`);
    if (parentId && parentId === String(id)) throw httpError(400, '父任务不能是自身');
    next.parentId = parentId;
  }
  if (body.isMilestone != null) next.isMilestone = body.isMilestone === true || body.isMilestone === 'true';
  if (body.assignee != null) next.assignee = resolvePersonName(body.assignee) || next.assignee;
  if (body.status != null) {
    const status = String(body.status).trim();
    if (!TASK_STATUSES.has(status)) throw httpError(400, `无效任务状态: ${status}`);
    next.status = status;
  }
  if (body.priority != null) {
    const priority = String(body.priority).trim().toLowerCase();
    next.priority = priority === '紧急' ? 'urgent'
      : priority === '重要' ? 'important'
        : TASK_PRIORITIES.has(priority) ? priority : next.priority;
  }
  if (body.progress != null) next.progress = Math.max(0, Math.min(100, Number(body.progress) || 0));
  if (body.estimatedHours != null) next.estimatedHours = Number(body.estimatedHours) || 0;
  if (body.actualHours != null) next.actualHours = Number(body.actualHours) || 0;
  if (body.actualStartDate != null) next.actualStartDate = normalizeDate(body.actualStartDate) || null;
  if (body.actualEndDate != null) next.actualEndDate = normalizeDate(body.actualEndDate) || null;
  {
    const governance = require('./governance');
    if (body.originalPlanStartDate != null && !prev.originalPlanStartDate) {
      next.originalPlanStartDate = normalizeDate(body.originalPlanStartDate) || null;
    }
    if (body.originalDueDate != null && !prev.originalDueDate) {
      next.originalDueDate = normalizeDate(body.originalDueDate) || '';
    }
    if (body.planStartDate != null || body.dueDate != null || body.changeReason != null || body.reason != null) {
      governance.applyTaskDateBaseline(prev, next, {
        ...body,
        changeReason: body.changeReason != null ? body.changeReason : body.reason,
      });
    }
  }
  if (Array.isArray(body.attachments)) next.attachments = body.attachments;
  if (body.externalMeta && typeof body.externalMeta === 'object') {
    next.externalMeta = { ...(prev.externalMeta || {}), ...body.externalMeta };
  }
  if (body.intakeMeta && typeof body.intakeMeta === 'object') {
    next.intakeMeta = { ...(prev.intakeMeta || {}), ...body.intakeMeta };
  }
  if (
    Array.isArray(body.collaboratorEntries)
    || Array.isArray(body.informCollaborators)
    || Array.isArray(body.assistCollaborators)
    || Array.isArray(body.collaborators)
  ) {
    next.collaboratorEntries = normalizeCollaboratorEntries(body, body.collaborators);
    next.collaborators = next.collaboratorEntries.map(e => e.name);
  }
  const planTextFields = [
    'milestoneSeq', 'roleA', 'roleR', 'roleC', 'roleV',
    'deliverables', 'acceptanceCriteria', 'completionEvidence',
    'verification', 'feedback', 'leftover',
    'depsRisks', 'escalation', 'delayImpact', 'reopenConditions',
  ];
  planTextFields.forEach((key) => {
    if (body[key] != null) next[key] = String(body[key]).trim();
  });
  if (body.roleR != null && String(body.roleR).trim() && !body.assignee) {
    next.assignee = resolvePersonName(body.roleR) || next.assignee;
  }

  store.tasks[idx] = next;
  persistOrThrow();
  const operator = resolvePersonName(body.operator) || 'external-api';
  emitEntityChange('task.updated', 'task', next, operator);
  if (body.status != null && next.isMilestone) {
    try {
      require('./governance').maybeAutoSyncPhaseAfterTaskUpdate(next, operator);
    } catch (e) {
      console.warn('[externalWrite] phase sync:', e.message);
    }
  }
  return { task: next, patchedFields: TASK_PATCHABLE.filter(k => body[k] !== undefined) };
}

function deleteTask(id, { cascadeChildren = true, actor = null } = {}) {
  const store = getDb();
  const target = store.tasks.find(t => String(t.id) === String(id));
  if (!target) throw httpError(404, `任务不存在: ${id}`);
  if (actor) assertScopedCanAbolishTask(actor, target);

  const toRemove = new Set([String(id)]);
  if (cascadeChildren !== false) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of store.tasks) {
        if (t.parentId && toRemove.has(String(t.parentId)) && !toRemove.has(String(t.id))) {
          toRemove.add(String(t.id));
          changed = true;
        }
      }
    }
  }

  const removed = store.tasks.filter(t => toRemove.has(String(t.id)));
  store.tasks = store.tasks.filter(t => !toRemove.has(String(t.id)));
  store.taskDependencies = (store.taskDependencies || []).filter(d =>
    !toRemove.has(String(d.predecessorTaskId)) && !toRemove.has(String(d.successorTaskId))
  );
  persistOrThrow();
  emitEntityChange('task.deleted', 'task', target, 'external-api');
  return { task: target, removedTaskIds: [...toRemove], removedCount: removed.length };
}

function addComment(taskId, body = {}, opts = {}) {
  const store = getDb();
  const task = store.tasks.find(t => String(t.id) === String(taskId));
  if (!task) throw httpError(404, `任务不存在: ${taskId}`);
  if (opts.actor) assertScopedCanWriteTask(opts.actor, task);
  const content = String(body.content || body.text || '').trim();
  if (!content && !(Array.isArray(body.attachments) && body.attachments.length)) {
    throw httpError(400, '评论 content 不能为空');
  }
  const author = scopedActorName(opts.actor, resolvePersonName(body.author || body.operator) || '外部系统');
  const comment = {
    id: String(body.id || '').trim() || genId('C'),
    author,
    content,
    mentions: Array.isArray(body.mentions) ? body.mentions.map(resolvePersonName).filter(Boolean) : [],
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    createdAt: String(body.createdAt || new Date().toLocaleString('zh-CN')),
  };
  if (!Array.isArray(task.comments)) task.comments = [];
  task.comments.push(comment);
  persistOrThrow();
  emitEntityChange('task.comment.created', 'task', task, author);
  return { taskId: task.id, comment };
}

function deleteComment(taskId, commentId, opts = {}) {
  const store = getDb();
  const task = store.tasks.find(t => String(t.id) === String(taskId));
  if (!task) throw httpError(404, `任务不存在: ${taskId}`);
  if (opts.actor) assertScopedCanWriteTask(opts.actor, task);
  if (!Array.isArray(task.comments)) throw httpError(404, '评论不存在');
  const idx = task.comments.findIndex(c => String(c.id) === String(commentId));
  if (idx < 0) throw httpError(404, `评论不存在: ${commentId}`);
  const [comment] = task.comments.splice(idx, 1);
  persistOrThrow();
  emitEntityChange('task.comment.deleted', 'task', task, 'external-api');
  return { taskId: task.id, comment };
}

function wouldCreateDependencyCycle(predecessorTaskId, successorTaskId) {
  if (!predecessorTaskId || !successorTaskId) return false;
  if (predecessorTaskId === successorTaskId) return true;
  // 若从后置任务沿依赖边已能走到前置任务，再加 pred→succ 会成环
  const deps = getAllTaskDependencies().filter(d => !d.status || d.status === DEP_STATUS_ACTIVE);
  const queue = [successorTaskId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === predecessorTaskId) return true;
    for (const d of deps) {
      if (d.predecessorTaskId === id) queue.push(d.successorTaskId);
    }
  }
  return false;
}

function createDependency(body = {}, opts = {}) {
  if (opts.actor) {
    const pred = findTask(body.predecessorTaskId);
    const succ = findTask(body.successorTaskId);
    if (pred) assertScopedCanWriteTask(opts.actor, pred);
    if (succ) assertScopedCanWriteTask(opts.actor, succ);
  }
  const predecessorTaskId = String(body.predecessorTaskId || body.fromTaskId || '').trim();
  const successorTaskId = String(body.successorTaskId || body.toTaskId || '').trim();
  if (!predecessorTaskId || !successorTaskId) {
    throw httpError(400, '需要 predecessorTaskId 与 successorTaskId');
  }
  if (!findTask(predecessorTaskId)) throw httpError(400, `前置任务不存在: ${predecessorTaskId}`);
  if (!findTask(successorTaskId)) throw httpError(400, `后置任务不存在: ${successorTaskId}`);
  if (wouldCreateDependencyCycle(predecessorTaskId, successorTaskId)) {
    throw httpError(400, '不能形成循环依赖');
  }
  const active = getAllTaskDependencies().filter(d => !d.status || d.status === DEP_STATUS_ACTIVE);
  if (active.some(d => d.predecessorTaskId === predecessorTaskId && d.successorTaskId === successorTaskId)) {
    throw httpError(409, '该依赖已存在');
  }

  const blockMode = body.blockMode === DEP_BLOCK_SOFT ? DEP_BLOCK_SOFT : DEP_BLOCK_HARD;
  const dep = {
    id: String(body.id || '').trim() || genId('DEP'),
    predecessorTaskId,
    successorTaskId,
    type: body.type || DEP_TYPE_FS,
    blockMode,
    note: String(body.note || '').trim(),
    status: DEP_STATUS_ACTIVE,
    createdBy: resolvePersonName(body.createdBy || body.operator) || '外部系统',
    createdAt: normalizeDate(body.createdAt) || new Date().toISOString().slice(0, 10),
  };
  if (findDependency(dep.id)) throw httpError(409, `依赖已存在: ${dep.id}`);

  const store = getDb();
  if (!Array.isArray(store.taskDependencies)) store.taskDependencies = [];
  store.taskDependencies.push(dep);
  persistOrThrow();
  emitEntityChange('dependency.created', 'dependency', dep, dep.createdBy);
  return { dependency: dep };
}

function updateDependency(id, body = {}, opts = {}) {
  if (opts.actor) {
    const dep = findDependency(id);
    if (dep) {
      const pred = findTask(dep.predecessorTaskId);
      const succ = findTask(dep.successorTaskId);
      if (pred) assertScopedCanWriteTask(opts.actor, pred);
      if (succ) assertScopedCanWriteTask(opts.actor, succ);
    }
  }
  const store = getDb();
  if (!Array.isArray(store.taskDependencies)) store.taskDependencies = [];
  const idx = store.taskDependencies.findIndex(d => String(d.id) === String(id));
  if (idx < 0) throw httpError(404, `依赖不存在: ${id}`);
  const prev = store.taskDependencies[idx];
  const next = { ...prev };
  if (body.note != null) next.note = String(body.note).trim();
  if (body.blockMode != null) {
    next.blockMode = body.blockMode === DEP_BLOCK_SOFT ? DEP_BLOCK_SOFT : DEP_BLOCK_HARD;
  }
  if (body.status != null) {
    const status = String(body.status).trim();
    if (status !== DEP_STATUS_ACTIVE && status !== DEP_STATUS_INACTIVE) {
      throw httpError(400, `无效依赖状态: ${status}`);
    }
    next.status = status;
  }
  store.taskDependencies[idx] = next;
  persistOrThrow();
  emitEntityChange('dependency.updated', 'dependency', next, 'external-api');
  return { dependency: next };
}

function deleteDependency(id, opts = {}) {
  if (opts.actor) {
    const dep = findDependency(id);
    if (dep) {
      const pred = findTask(dep.predecessorTaskId);
      const succ = findTask(dep.successorTaskId);
      if (pred) assertScopedCanWriteTask(opts.actor, pred);
      if (succ) assertScopedCanWriteTask(opts.actor, succ);
    }
  }
  const store = getDb();
  if (!Array.isArray(store.taskDependencies)) store.taskDependencies = [];
  const idx = store.taskDependencies.findIndex(d => String(d.id) === String(id));
  if (idx < 0) throw httpError(404, `依赖不存在: ${id}`);
  const [dep] = store.taskDependencies.splice(idx, 1);
  persistOrThrow();
  emitEntityChange('dependency.deleted', 'dependency', dep, 'external-api');
  return { dependency: dep };
}

function upsertExternalUser(body = {}, opts = {}) {
  denyScoped(opts.actor, '维护人员档案');
  const name = String(body.name || '').trim();
  if (!name) throw httpError(400, '人员姓名 name 不能为空');
  const dingTalkUserId = String(body.dingTalkUserId || body.userid || '').trim();
  let existing = null;
  if (body.id) existing = findUserById(String(body.id).trim());
  if (!existing && dingTalkUserId) existing = findUserByDingTalkId(dingTalkUserId);
  if (!existing) existing = findUserByName(name);

  const user = {
    ...(existing || {}),
    id: existing?.id || String(body.id || '').trim() || `U-EXT-${uuidv4().slice(0, 8)}`,
    name,
    role: body.role || existing?.role || 'member',
    dept: body.dept != null ? String(body.dept).trim() : (existing?.dept || ''),
    position: body.position != null ? String(body.position).trim() : (existing?.position || ''),
    dingTalkUserId: dingTalkUserId || existing?.dingTalkUserId || '',
    active: body.active == null ? (existing?.active !== false) : !!body.active,
    profileKind: body.profileKind || existing?.profileKind || 'staff',
  };
  upsertUser(user);
  emitEntityChange('user.upserted', 'user', user, 'external-api');
  return { user, created: !existing };
}

function updateWorkCalendar(calendar, opts = {}) {
  denyScoped(opts.actor, '修改工作日历');
  if (!calendar || typeof calendar !== 'object') throw httpError(400, '需要工作日历对象');
  const saved = setWorkCalendar(calendar);
  emitChange({
    type: 'work-calendar.updated',
    entityType: 'workCalendar',
    entityIds: [],
    actorId: 'external-api',
    meta: { source: 'external' },
  });
  return { workCalendar: saved || getWorkCalendar() };
}

function appendExternalChangeLogs(entries, opts = {}) {
  denyScoped(opts.actor, '批量写入变更日志');
  if (!Array.isArray(entries) || !entries.length) throw httpError(400, '需要 changeLogs 数组');
  const normalized = entries.map(e => ({
    id: e.id || genId('CL'),
    taskId: e.taskId || '',
    operator: resolvePersonName(e.operator) || '外部系统',
    operateTime: e.operateTime || new Date().toLocaleString('zh-CN'),
    before: e.before || '',
    after: e.after || '',
    reason: e.reason || '',
    project: e.project || '',
    ...e,
  }));
  appendChangeLogs(normalized);
  emitChange({
    type: 'change-logs.appended',
    entityType: 'changeLog',
    entityIds: normalized.map(e => e.id).slice(0, 50),
    actorId: 'external-api',
    meta: { source: 'external', count: normalized.length },
  });
  return { count: normalized.length, changeLogs: normalized };
}

/**
 * 批量写入：upsert projects/tasks/dependencies，支持显式删除
 */
function batchWrite(body = {}, opts = {}) {
  denyScoped(opts.actor, '批量写入');
  const result = {
    projectsUpserted: 0,
    tasksUpserted: 0,
    dependenciesUpserted: 0,
    projectsRemoved: 0,
    tasksRemoved: 0,
    dependenciesRemoved: 0,
    usersUpserted: 0,
  };

  for (const p of (Array.isArray(body.projects) ? body.projects : [])) {
    if (!p || typeof p !== 'object') continue;
    if (p.id && findProject(p.id)) {
      updateProject(p.id, { ...p, withTemplate: false });
    } else {
      createProject({ ...p, withTemplate: body.withTemplate === true });
    }
    result.projectsUpserted += 1;
  }

  for (const t of (Array.isArray(body.tasks) ? body.tasks : [])) {
    if (!t || typeof t !== 'object') continue;
    if (t.id && findTask(t.id)) updateTask(t.id, t);
    else createTask(t);
    result.tasksUpserted += 1;
  }

  for (const d of (Array.isArray(body.taskDependencies) ? body.taskDependencies : [])) {
    if (!d || typeof d !== 'object') continue;
    if (d.id && findDependency(d.id)) updateDependency(d.id, d);
    else createDependency(d);
    result.dependenciesUpserted += 1;
  }

  for (const u of (Array.isArray(body.users) ? body.users : [])) {
    if (!u || typeof u !== 'object') continue;
    upsertExternalUser(u);
    result.usersUpserted += 1;
  }

  for (const id of (Array.isArray(body.removedProjectIds) ? body.removedProjectIds : [])) {
    try {
      deleteProject(id, { cascadeTasks: true });
      result.projectsRemoved += 1;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  for (const id of (Array.isArray(body.removedTaskIds) ? body.removedTaskIds : [])) {
    try {
      deleteTask(id, { cascadeChildren: true });
      result.tasksRemoved += 1;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  for (const id of (Array.isArray(body.removedDependencyIds) ? body.removedDependencyIds : [])) {
    try {
      deleteDependency(id);
      result.dependenciesRemoved += 1;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  return result;
}

function getCatalog() {
  return {
    auth: 'Header X-Api-Key（环境变量 API_KEY）',
    base: '/api/external',
    projectFields: {
      objective: '项目目标',
      value: '项目价值',
      scope: '范围（做什么）',
      outOfScope: '不做范围',
      endDate: '最终完成时间',
      originalEndDate: '原定最终完成时间',
      changeReason: '日期变更原因',
      currentPhase: '当前阶段（可随里程碑同步）',
      nextPlan: '下一步计划',
      blocker: '当前卡点',
      planVerified: '计划台账是否已校验',
      planVerifiedBy: '校验人',
      planVerifiedAt: '校验时间',
      handoverRecords: '交接记录数组',
      stageTemplateId: '绑定的模板 ID',
    },
    milestoneFields: {
      milestoneSeq: 'M序号',
      roleA: 'A 唯一交付人',
      roleR: 'R 直接执行人',
      roleC: 'C 协作人',
      roleV: 'V 业务验收人',
      deliverables: '交付物',
      acceptanceCriteria: '验收标准',
      completionEvidence: '完成证据',
      verification: '验证记录',
      feedback: '业务反馈',
      leftover: '遗留问题',
      depsRisks: '依赖/风险',
      escalation: '升级条件',
      delayImpact: '延期影响',
      reopenConditions: '重开条件',
      originalPlanStartDate: '原定开始',
      originalDueDate: '原定截止',
      changeReason: '日期变更原因',
    },
    endpoints: [
      { method: 'GET', path: '/external/health', desc: '连通性' },
      { method: 'GET', path: '/external/catalog', desc: '接口目录' },
      { method: 'POST', path: '/external/projects', desc: '创建项目（默认套用 WMS 模板；可用 stageTemplateId / withTemplate）' },
      { method: 'GET', path: '/external/project-templates', desc: '模板库列表' },
      { method: 'POST', path: '/external/project-templates/from-project/:id', desc: '从项目另存为模板' },
      { method: 'PATCH', path: '/external/projects/:id', desc: '更新项目（含计划书字段）' },
      { method: 'POST', path: '/external/projects/:id/sync-phase', desc: '按里程碑同步 currentPhase' },
      { method: 'POST', path: '/external/projects/:id/handover', desc: '项目负责人交接' },
      { method: 'GET', path: '/external/projects/:id/plan-ledger', desc: '导出项目计划台账（管线格式）' },
      { method: 'POST', path: '/external/projects/:id/plan-verify', desc: '校验/取消校验项目计划台账' },
      { method: 'DELETE', path: '/external/projects/:id', desc: '删除项目（默认级联任务）' },
      { method: 'POST', path: '/external/tasks', desc: '创建任务/临时事项/里程碑（含 A/R/C/V）' },
      { method: 'PATCH', path: '/external/tasks/:id', desc: '更新任务/里程碑计划字段' },
      { method: 'DELETE', path: '/external/tasks/:id', desc: '删除任务（默认级联子任务）' },
      { method: 'POST', path: '/external/tasks/:id/comments', desc: '添加评论' },
      { method: 'DELETE', path: '/external/tasks/:taskId/comments/:commentId', desc: '删除评论' },
      { method: 'GET', path: '/external/issues', desc: '问题列表' },
      { method: 'POST', path: '/external/issues', desc: '创建问题' },
      { method: 'PATCH', path: '/external/issues/:id', desc: '更新问题' },
      { method: 'POST', path: '/external/projects/:id/issues/from-blocker', desc: '卡点升级为问题' },
      { method: 'GET', path: '/external/history', desc: '变更日志查询' },
      { method: 'POST', path: '/external/dependencies', desc: '创建任务依赖' },
      { method: 'PATCH', path: '/external/dependencies/:id', desc: '更新依赖' },
      { method: 'DELETE', path: '/external/dependencies/:id', desc: '删除依赖' },
      { method: 'POST', path: '/external/users', desc: '创建/更新人员' },
      { method: 'PUT', path: '/external/work-calendar', desc: '覆盖工作日历' },
      { method: 'POST', path: '/external/change-logs', desc: '追加变更日志' },
      { method: 'POST', path: '/external/batch', desc: '批量 upsert/删除' },
    ],
  };
}

function getExternalProjectPlanLedger(id, opts = {}) {
  const project = findProject(id);
  if (!project) throw httpError(404, `项目不存在: ${id}`);
  if (opts.actor) assertScopedCanReadProject(opts.actor, project);
  return buildProjectPlanLedger(project, getAllTasks());
}

/**
 * 校验 / 取消校验项目计划台账
 * body: { verified?: boolean, operator?: string }
 */
function verifyProjectPlan(id, body = {}, opts = {}) {
  const store = getDb();
  const idx = store.projects.findIndex(p => String(p.id) === String(id));
  if (idx < 0) throw httpError(404, `项目不存在: ${id}`);
  const prev = store.projects[idx];
  if (opts.actor) assertScopedCanWriteProject(opts.actor, prev);
  const operator = scopedActorName(opts.actor, resolvePersonName(body.operator) || 'external-api');
  const verified = body.verified === undefined
    ? true
    : (body.verified === true || body.verified === 'true' || body.verified === 1 || body.verified === '1');

  const next = { ...prev };
  if (verified) {
    next.planVerified = true;
    next.planVerifiedBy = operator;
    next.planVerifiedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  } else {
    next.planVerified = false;
    next.planVerifiedBy = '';
    next.planVerifiedAt = '';
  }
  store.projects[idx] = normalizeProjectRecord(next);
  persistOrThrow();
  appendChangeLogs([{
    id: genId('CL'),
    taskId: `PROJECT-${id}`,
    operator,
    operateTime: new Date().toLocaleString('zh-CN', { hour12: false }),
    before: prev.planVerified ? `已校验（${prev.planVerifiedBy || ''}）` : '未校验',
    after: next.planVerified ? `已校验（${next.planVerifiedBy}）` : '未校验',
    reason: '项目计划台账校验',
    project: next.name,
  }]);
  emitEntityChange('project.plan_verified', 'project', next, operator);
  return {
    project: next,
    ledger: buildProjectPlanLedger(next, getAllTasks()),
  };
}

function syncProjectPhase(id, body = {}, opts = {}) {
  const governance = require('./governance');
  return governance.syncProjectPhase(id, {
    ...opts,
    operator: scopedActorName(opts.actor, resolvePersonName(body.operator) || 'external-api'),
  });
}

function handoverProject(id, body = {}, opts = {}) {
  const governance = require('./governance');
  return governance.handoverProject(id, body, {
    ...opts,
    operator: scopedActorName(opts.actor, resolvePersonName(body.operator) || 'external-api'),
  });
}

function listIssues(query = {}, opts = {}) {
  return { issues: require('./governance').listIssues(query, opts) };
}

function createIssue(body = {}, opts = {}) {
  return require('./governance').createIssue(body, {
    ...opts,
    operator: scopedActorName(opts.actor, resolvePersonName(body.operator) || 'external-api'),
  });
}

function updateIssue(id, body = {}, opts = {}) {
  return require('./governance').updateIssue(id, body, {
    ...opts,
    operator: scopedActorName(opts.actor, resolvePersonName(body.operator) || 'external-api'),
  });
}

function createIssueFromBlocker(projectId, body = {}, opts = {}) {
  return require('./governance').createIssueFromBlocker(projectId, {
    ...opts,
    operator: scopedActorName(opts.actor, resolvePersonName(body.operator) || 'external-api'),
  });
}

function getHistory(query = {}, opts = {}) {
  const { getAllChangeLogs } = require('../db/database');
  let logs = getAllChangeLogs();
  const type = String(query.type || '').trim();
  const id = String(query.id || '').trim();
  if (type === 'task' && id) {
    const task = findTask(id);
    if (opts.actor && task) assertScopedCanReadTask(opts.actor, task);
    logs = logs.filter(l => String(l.taskId) === String(id));
  } else if (type === 'project' && id) {
    const project = findProject(id);
    if (opts.actor && project) assertScopedCanReadProject(opts.actor, project);
    logs = logs.filter(l => String(l.taskId) === `PROJECT-${id}`);
  } else if (opts.actor) {
    throw httpError(400, '作用域 Key 查询历史须带 type=task|project 与 id');
  }
  return { changeLogs: logs.slice(0, Number(query.limit) || 100) };
}

module.exports = {
  getCatalog,
  createProject,
  updateProject,
  deleteProject,
  createTask,
  updateTask,
  deleteTask,
  addComment,
  deleteComment,
  createDependency,
  updateDependency,
  deleteDependency,
  upsertExternalUser,
  updateWorkCalendar,
  appendExternalChangeLogs,
  batchWrite,
  getExternalProjectPlanLedger,
  verifyProjectPlan,
  syncProjectPhase,
  handoverProject,
  listIssues,
  createIssue,
  updateIssue,
  createIssueFromBlocker,
  getHistory,
};
