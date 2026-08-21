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
} = require('../db/database');
const { emitChange } = require('./realtime');

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

function createDefaultPhaseMilestones(project, creator) {
  const phases = [
    { key: '00', name: '00-立项与选型阶段' },
    { key: '01', name: '01-启动过程组' },
    { key: '02', name: '02-规划过程组' },
    { key: '03', name: '03-执行过程组' },
    { key: '04', name: '04-监控过程组' },
    { key: '05', name: '05-收尾过程组' },
  ];
  const gates = {
    '00': ['M1 厂商选型定标', 'M2 采购合同+SLA签订'],
    '01': ['M3 项目启动会召开'],
    '02': ['M4 需求确认签字', 'M5 实施计划审批'],
    '05': ['M6 验收签字', 'M7 运维交接+复盘'],
  };
  const store = getDb();
  const created = [];
  for (const phase of phases) {
    const milestone = {
      id: genId('T'),
      projectId: project.id,
      parentId: null,
      isMilestone: true,
      title: phase.name,
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
      phaseKey: phase.key,
    };
    store.tasks.push(milestone);
    created.push(milestone);
    for (const gateTitle of (gates[phase.key] || [])) {
      const gate = {
        id: genId('T'),
        projectId: project.id,
        parentId: milestone.id,
        isMilestone: false,
        title: `【里程碑】${gateTitle}`,
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
      };
      store.tasks.push(gate);
      created.push(gate);
    }
  }
  return created;
}

function createProject(body = {}) {
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
    externalMeta: body.externalMeta && typeof body.externalMeta === 'object' ? body.externalMeta : undefined,
  };
  if (!project.externalMeta) delete project.externalMeta;

  const store = getDb();
  store.projects.push(project);
  let templateTasks = [];
  if (body.withTemplate !== false && body.withTemplate !== 'false') {
    templateTasks = createDefaultPhaseMilestones(project, creator);
  }
  persistOrThrow();
  emitEntityChange('project.created', 'project', project, creator);
  return { project, templateTaskCount: templateTasks.length };
}

function updateProject(id, body = {}) {
  const store = getDb();
  const idx = store.projects.findIndex(p => String(p.id) === String(id));
  if (idx < 0) throw httpError(404, `项目不存在: ${id}`);
  const prev = store.projects[idx];
  const next = { ...prev };

  if (body.name != null) next.name = String(body.name).trim() || prev.name;
  if (body.desc != null || body.description != null) next.desc = String(body.desc ?? body.description ?? '').trim();
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
  if (body.endDate != null) next.endDate = normalizeDate(body.endDate);
  if (body.externalMeta && typeof body.externalMeta === 'object') {
    next.externalMeta = { ...(prev.externalMeta || {}), ...body.externalMeta };
  }

  next.teamMembers = sanitizeTeamMembers(next.manager, next.teamMembers);
  store.projects[idx] = next;
  persistOrThrow();
  emitEntityChange('project.updated', 'project', next, resolvePersonName(body.operator) || 'external-api');
  return { project: next };
}

function deleteProject(id, { cascadeTasks = true } = {}) {
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

function createTask(body = {}) {
  const title = String(body.title || body.name || '').trim();
  if (!title) throw httpError(400, '任务标题 title 不能为空');

  const id = String(body.id || '').trim() || genId('T');
  if (findTask(id)) throw httpError(409, `任务已存在: ${id}`);

  const projectId = body.projectId != null ? String(body.projectId).trim() : '';
  if (projectId && !findProject(projectId)) throw httpError(400, `所属项目不存在: ${projectId}`);

  const parentId = body.parentId != null && body.parentId !== '' ? String(body.parentId).trim() : null;
  if (parentId && !findTask(parentId)) throw httpError(400, `父任务不存在: ${parentId}`);

  const status = String(body.status || 'todo').trim();
  if (!TASK_STATUSES.has(status)) throw httpError(400, `无效任务状态: ${status}`);
  const priority = String(body.priority || 'normal').trim().toLowerCase();
  const normalizedPriority = priority === '紧急' ? 'urgent'
    : priority === '重要' ? 'important'
      : TASK_PRIORITIES.has(priority) ? priority : 'normal';

  const creator = resolvePersonName(body.creator) || '外部系统';
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
];

function updateTask(id, body = {}) {
  const store = getDb();
  const idx = store.tasks.findIndex(t => String(t.id) === String(id));
  if (idx < 0) throw httpError(404, `任务不存在: ${id}`);
  const prev = store.tasks[idx];
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
  if (body.dueDate != null) next.dueDate = normalizeDate(body.dueDate);
  if (body.estimatedHours != null) next.estimatedHours = Number(body.estimatedHours) || 0;
  if (body.actualHours != null) next.actualHours = Number(body.actualHours) || 0;
  if (body.planStartDate != null) next.planStartDate = normalizeDate(body.planStartDate) || null;
  if (body.actualStartDate != null) next.actualStartDate = normalizeDate(body.actualStartDate) || null;
  if (body.actualEndDate != null) next.actualEndDate = normalizeDate(body.actualEndDate) || null;
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

  store.tasks[idx] = next;
  persistOrThrow();
  emitEntityChange('task.updated', 'task', next, resolvePersonName(body.operator) || 'external-api');
  return { task: next, patchedFields: TASK_PATCHABLE.filter(k => body[k] !== undefined) };
}

function deleteTask(id, { cascadeChildren = true } = {}) {
  const store = getDb();
  const target = store.tasks.find(t => String(t.id) === String(id));
  if (!target) throw httpError(404, `任务不存在: ${id}`);

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

function addComment(taskId, body = {}) {
  const store = getDb();
  const task = store.tasks.find(t => String(t.id) === String(taskId));
  if (!task) throw httpError(404, `任务不存在: ${taskId}`);
  const content = String(body.content || body.text || '').trim();
  if (!content && !(Array.isArray(body.attachments) && body.attachments.length)) {
    throw httpError(400, '评论 content 不能为空');
  }
  const author = resolvePersonName(body.author || body.operator) || '外部系统';
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

function deleteComment(taskId, commentId) {
  const store = getDb();
  const task = store.tasks.find(t => String(t.id) === String(taskId));
  if (!task) throw httpError(404, `任务不存在: ${taskId}`);
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

function createDependency(body = {}) {
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

function updateDependency(id, body = {}) {
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

function deleteDependency(id) {
  const store = getDb();
  if (!Array.isArray(store.taskDependencies)) store.taskDependencies = [];
  const idx = store.taskDependencies.findIndex(d => String(d.id) === String(id));
  if (idx < 0) throw httpError(404, `依赖不存在: ${id}`);
  const [dep] = store.taskDependencies.splice(idx, 1);
  persistOrThrow();
  emitEntityChange('dependency.deleted', 'dependency', dep, 'external-api');
  return { dependency: dep };
}

function upsertExternalUser(body = {}) {
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

function updateWorkCalendar(calendar) {
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

function appendExternalChangeLogs(entries) {
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
function batchWrite(body = {}) {
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
    endpoints: [
      { method: 'GET', path: '/external/health', desc: '连通性' },
      { method: 'GET', path: '/external/catalog', desc: '接口目录' },
      { method: 'POST', path: '/external/projects', desc: '创建项目（默认带标准阶段模板）' },
      { method: 'PATCH', path: '/external/projects/:id', desc: '更新项目' },
      { method: 'DELETE', path: '/external/projects/:id', desc: '删除项目（默认级联任务）' },
      { method: 'POST', path: '/external/tasks', desc: '创建任务/临时事项/里程碑' },
      { method: 'PATCH', path: '/external/tasks/:id', desc: '更新任务' },
      { method: 'DELETE', path: '/external/tasks/:id', desc: '删除任务（默认级联子任务）' },
      { method: 'POST', path: '/external/tasks/:id/comments', desc: '添加评论' },
      { method: 'DELETE', path: '/external/tasks/:taskId/comments/:commentId', desc: '删除评论' },
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
};
