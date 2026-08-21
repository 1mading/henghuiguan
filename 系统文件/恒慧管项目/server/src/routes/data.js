const express = require('express');
const { requireAuth, requireApiKey } = require('../middleware/auth');
const { writeOk } = require('../utils/response');
const {
  getAllUsers,
  getAllProjects,
  getAllTasks,
  getAllTaskDependencies,
  getAllChangeLogs,
  getAllTransferLogs,
  getAllPushLogs,
  mergeTasksById,
  mergeProjectsById,
  mergeTaskDependenciesById,
  mergeChangeLogsById,
  mergeTransferLogsById,
  mergePushLogsById,
  replaceAllData,
  reloadStoreFromDiskIfStale,
  getDb,
  persistStore,
  getStaffDeptCatalog,
} = require('../db/database');
const { getWorkCalendar } = require('../services/workCalendar');
const { emitChange, getStoreRevision } = require('../services/realtime');

const { isFullAccess } = require('../utils/roles');
const {
  isRelatedToTask,
  isRelatedToProject,
  canManageProject,
  canUserSyncProject,
  canEditTask,
  canUserSyncTask,
} = require('../utils/taskRelations');
const {
  mergeSeedIntoStore,
  loadSeedFile,
  getDefaultSeedPath,
} = require('../utils/mergeSeedData');
const { backfillTaskAttachmentsToProjectDocuments, ensureTaskAttachmentsSyncedToProjects } = require('../utils/projectDocuments');
const {
  INFO_CENTER_DEPT,
  filterProjectsForUser,
  filterTasksForUser,
} = require('../utils/projectAccess');
const { isContactProfile, buildOrgForest } = require('../utils/staffProfile');

const router = express.Router();

function filterDependenciesForUser(user, deps, allTasks, allProjects) {
  const visibleIds = new Set(filterTasksForUser(user, allTasks, allProjects).map(t => t.id));
  return (deps || []).filter(d =>
    visibleIds.has(d.predecessorTaskId) || visibleIds.has(d.successorTaskId)
  );
}

function filterByRole(user, data) {
  const allUsers = data.users || [];
  const staffDeptCatalog = data.staffDeptCatalog || getStaffDeptCatalog();
  const orgForest = buildOrgForest(staffDeptCatalog);
  const withStaffDirectory = payload => ({
    ...payload,
    allUsers,
    staffDeptCatalog,
    orgForest,
  });

  if (isFullAccess(user.role)) {
    return withStaffDirectory(data);
  }

  const allTasks = data.tasks || [];
  const allProjects = data.projects || [];
  const projects = filterProjectsForUser(user, allProjects, allTasks);
  const tasks = filterTasksForUser(user, allTasks, allProjects);
  const taskDependencies = filterDependenciesForUser(user, data.taskDependencies || [], allTasks, allProjects);

  const visible = {
    ...data,
    projects,
    tasks,
    taskDependencies,
    changeLogs: data.changeLogs,
    transferLogs: data.transferLogs,
    pushLogs: data.pushLogs,
    staffDeptCatalog,
    orgForest,
  };

  if (user.role === 'manager') {
    return withStaffDirectory({
      ...visible,
      // 经理业务编辑范围不含通知联系人
      users: allUsers.filter(u =>
        !isContactProfile(u) && (
          u.dept === user.dept ||
          isFullAccess(u.role) ||
          u.dept === INFO_CENTER_DEPT
        )
      ),
    });
  }

  return withStaffDirectory({
    ...visible,
    // 执行人员本地 users 仅业务成员；全量档案走 allUsers（通知）
    users: allUsers.filter(u => !isContactProfile(u)),
  });
}

function canStaffTouchTask(user, task, allUsers) {
  return isRelatedToTask(user, task, []);
}

function canStaffManageProject(user, project) {
  return canManageProject(user, project);
}

function canStaffTouchProject(user, project, allTasks) {
  return isRelatedToProject(user, project, allTasks);
}

function canStaffTouchTaskExtended(user, task, allUsers, allProjects) {
  return isRelatedToTask(user, task, allProjects);
}

function canManagerTouchTask(user, task, allUsers, allProjects) {
  return isRelatedToTask(user, task, allProjects);
}

function mergeUsersPreservingServerFields(existing, incoming) {
  if (!Array.isArray(incoming)) return existing;
  const incomingMap = new Map(incoming.map(u => [u.id, u]));
  const merged = existing.map(u => {
    const patch = incomingMap.get(u.id);
    if (!patch) return u;
    return {
      ...patch,
      lastSeenSystemVersion: u.lastSeenSystemVersion,
    };
  });
  for (const u of incoming) {
    if (!existing.some(e => e.id === u.id)) merged.push(u);
  }
  return merged;
}

function mergeManagerUserUpdates(storeUsers, manager, updates) {
  if (!Array.isArray(updates) || !updates.length) return storeUsers;
  const patchMap = new Map(
    updates
      .filter(u => u && u.id && u.dept === manager.dept && u.role === 'staff')
      .map(u => [u.id, u])
  );
  if (!patchMap.size) return storeUsers;
  return storeUsers.map(u => {
    const patch = patchMap.get(u.id);
    if (!patch || u.dept !== manager.dept || u.role !== 'staff') return u;
    return {
      ...u,
      position: patch.position ?? u.position,
      leaderId: patch.leaderId ?? u.leaderId,
      standardWeekHours: patch.standardWeekHours ?? u.standardWeekHours,
    };
  });
}

function canUserSyncDependency(user, dep, allProjects, allTasks) {
  if (!dep) return false;
  if (isFullAccess(user.role)) return true;
  const pred = (allTasks || []).find(t => t.id === dep.predecessorTaskId);
  const succ = (allTasks || []).find(t => t.id === dep.successorTaskId);
  return (succ && canEditTask(user, succ, allProjects)) || (pred && canEditTask(user, pred, allProjects));
}

/**
 * sync 开始时会拷贝 tasks 快照；若期间 intake 等写入新任务，replaceAllData 会用旧合并结果整表覆盖。
 * 仅回收「快照之后新出现」的服务端记录，显式删除的 ID 不会被加回。
 */
function absorbConcurrentServerCreates(snapshot, next) {
  const live = getDb();
  if (!live) return;

  if (Array.isArray(next.tasks)) {
    const nextIds = new Set(next.tasks.map(t => t.id));
    for (const t of live.tasks || []) {
      if (!t?.id || nextIds.has(t.id) || snapshot.taskIds.has(t.id)) continue;
      next.tasks.push(t);
      nextIds.add(t.id);
    }
  }

  if (Array.isArray(next.projects)) {
    const nextIds = new Set(next.projects.map(p => p.id));
    for (const p of live.projects || []) {
      if (!p?.id || nextIds.has(p.id) || snapshot.projectIds.has(p.id)) continue;
      next.projects.push(p);
      nextIds.add(p.id);
    }
  }

  if (Array.isArray(next.pushLogs)) {
    const nextIds = new Set(next.pushLogs.map(l => l?.id).filter(Boolean));
    for (const l of live.pushLogs || []) {
      if (!l?.id || nextIds.has(l.id) || snapshot.pushLogIds.has(l.id)) continue;
      next.pushLogs.unshift(l);
      nextIds.add(l.id);
    }
  }
}

function mergeIncomingSync(user, incoming) {
  const store = {
    users: getAllUsers(),
    projects: getAllProjects(),
    tasks: getAllTasks(),
    taskDependencies: getAllTaskDependencies(),
    changeLogs: getAllChangeLogs(),
    transferLogs: getAllTransferLogs(),
    pushLogs: getAllPushLogs(200),
  };
  const snapshot = {
    taskIds: new Set(store.tasks.map(t => t.id)),
    projectIds: new Set(store.projects.map(p => p.id)),
    pushLogIds: new Set((store.pushLogs || []).map(l => l?.id).filter(Boolean)),
  };

  const logUpdates = Array.isArray(incoming.changeLogUpdates)
    ? incoming.changeLogUpdates
    : (Array.isArray(incoming.changeLogs) ? incoming.changeLogs : []);
  const transferUpdates = Array.isArray(incoming.transferLogUpdates)
    ? incoming.transferLogUpdates
    : (Array.isArray(incoming.transferLogs) ? incoming.transferLogs : []);
  const pushUpdates = Array.isArray(incoming.pushLogUpdates)
    ? incoming.pushLogUpdates
    : (Array.isArray(incoming.pushLogs) ? incoming.pushLogs : []);

  const mergedChangeLogs = mergeChangeLogsById(store.changeLogs, logUpdates);
  const mergedTransferLogs = mergeTransferLogsById(store.transferLogs, transferUpdates);
  const mergedPushLogs = pushUpdates.length
    ? mergePushLogsById(store.pushLogs, pushUpdates)
    : store.pushLogs;
  const depUpdates = Array.isArray(incoming.taskDependencyUpdates)
    ? incoming.taskDependencyUpdates
    : (Array.isArray(incoming.taskDependencies) ? incoming.taskDependencies : []);
  const filteredDepUpdates = isFullAccess(user.role)
    ? depUpdates
    : depUpdates.filter(d => canUserSyncDependency(user, d, store.projects, store.tasks));
  const mergedTaskDependencies = mergeTaskDependenciesById(store.taskDependencies, filteredDepUpdates);

  if (isFullAccess(user.role)) {
    const incomingProjects = Array.isArray(incoming.projects) ? incoming.projects : store.projects;
    const incomingTasks = Array.isArray(incoming.tasks) ? incoming.tasks : store.tasks;
    const removedProjectIds = new Set(
      (Array.isArray(incoming.removedProjectIds) ? incoming.removedProjectIds : [])
        .filter(id => id != null && String(id).trim())
        .map(id => String(id))
    );
    const removedTaskIds = new Set(
      (Array.isArray(incoming.removedTaskIds) ? incoming.removedTaskIds : [])
        .filter(id => id != null && String(id).trim())
        .map(id => String(id))
    );
    const hasExplicitRemovals = removedProjectIds.size > 0 || removedTaskIds.size > 0;
    // 防止前端空 projects/tasks 误覆盖服务端已有业务数据（空数组在 JS 中为 truthy，此前会整表清空）
    // 若客户端显式传 removedProjectIds/removedTaskIds，允许删光最后一个项目
    const wipeRisk =
      !hasExplicitRemovals &&
      store.projects.length > 0 &&
      incomingProjects.length === 0 &&
      incomingTasks.length === 0;
    if (wipeRisk) {
      console.warn('[sync] 拒绝空数据覆盖：服务端仍有项目/任务，已跳过 projects/tasks 清空');
    }

    // 管理员同步禁止按「客户端缺项」删服务端数据：表单 intake 等写路径会先落库，
    // 若某管理员本地尚未 soft-pull 到该任务就 sync，removeMissing 会把刚写入的临时任务抹掉。
    // 真正删除只认显式 removedProjectIds / removedTaskIds（见前端删除项目）。
    let nextProjects = wipeRisk
      ? store.projects
      : mergeProjectsById(store.projects, incomingProjects, null, { removeMissing: false });
    let nextTasks = wipeRisk
      ? store.tasks
      : mergeTasksById(store.tasks, incomingTasks, null, { removeMissing: false });

    if (hasExplicitRemovals) {
      if (removedProjectIds.size) {
        nextProjects = nextProjects.filter(p => !removedProjectIds.has(String(p.id)));
        nextTasks = nextTasks.filter(t => !removedProjectIds.has(String(t.projectId)));
      }
      if (removedTaskIds.size) {
        nextTasks = nextTasks.filter(t => !removedTaskIds.has(String(t.id)));
      }
    }

    const removedTaskIdSet = new Set(nextTasks.map(t => t.id));
    // 相对 store 被删掉的任务，用于清理依赖
    const deletedTaskIds = new Set(
      store.tasks.filter(t => !removedTaskIdSet.has(t.id)).map(t => t.id)
    );
    if (removedTaskIds.size) {
      removedTaskIds.forEach(id => deletedTaskIds.add(id));
    }
    if (removedProjectIds.size) {
      store.tasks
        .filter(t => removedProjectIds.has(String(t.projectId)))
        .forEach(t => deletedTaskIds.add(t.id));
    }

    let nextDeps = wipeRisk
      ? store.taskDependencies
      : (Array.isArray(incoming.taskDependencies) ? incoming.taskDependencies : mergedTaskDependencies);
    if (deletedTaskIds.size) {
      nextDeps = (nextDeps || []).filter(d =>
        !deletedTaskIds.has(d.predecessorTaskId) && !deletedTaskIds.has(d.successorTaskId)
      );
    }

    const next = {
      users: mergeUsersPreservingServerFields(store.users, Array.isArray(incoming.users) ? incoming.users : store.users),
      projects: nextProjects,
      tasks: nextTasks,
      taskDependencies: nextDeps,
      changeLogs: mergedChangeLogs,
      transferLogs: mergedTransferLogs,
      pushLogs: mergedPushLogs,
    };
    absorbConcurrentServerCreates(snapshot, next);
    replaceAllData(next);
    return;
  }

  if (user.role === 'manager') {
    const next = {
      users: mergeManagerUserUpdates(store.users, user, incoming.userUpdates),
      projects: mergeProjectsById(store.projects, incoming.projects || [], p =>
        canUserSyncProject(user, p)
      ),
      tasks: mergeTasksById(store.tasks, incoming.tasks || [], t =>
        canUserSyncTask(user, t, store.projects)
      ),
      taskDependencies: mergedTaskDependencies,
      changeLogs: mergedChangeLogs,
      transferLogs: mergedTransferLogs,
      pushLogs: mergedPushLogs,
    };
    absorbConcurrentServerCreates(snapshot, next);
    replaceAllData(next);
    return;
  }

  const next = {
    users: store.users,
    projects: mergeProjectsById(store.projects, incoming.projects || [], p =>
      canUserSyncProject(user, p)
    ),
    tasks: mergeTasksById(store.tasks, incoming.tasks || [], t =>
      canUserSyncTask(user, t, store.projects)
    ),
    taskDependencies: mergedTaskDependencies,
    changeLogs: mergedChangeLogs,
    transferLogs: mergedTransferLogs,
    pushLogs: store.pushLogs,
  };
  absorbConcurrentServerCreates(snapshot, next);
  replaceAllData(next);
}

router.get('/miniapp/bootstrap', requireApiKey, requireAuth, (req, res) => {
  reloadStoreFromDiskIfStale();
  const store = getDb();
  if (ensureTaskAttachmentsSyncedToProjects(store)) persistStore();
  const raw = {
    users: getAllUsers(),
    projects: getAllProjects(),
    tasks: getAllTasks(),
    taskDependencies: getAllTaskDependencies(),
    changeLogs: getAllChangeLogs(),
    transferLogs: getAllTransferLogs(),
    pushLogs: getAllPushLogs(100),
    workCalendar: getWorkCalendar(),
    staffDeptCatalog: getStaffDeptCatalog(),
    serverTime: new Date().toISOString(),
  };
  writeOk(res, {
    ...filterByRole(req.user, raw),
    storeRevision: getStoreRevision(),
  });
});

router.get('/data/bootstrap', requireAuth, (req, res) => {
  reloadStoreFromDiskIfStale();
  const store = getDb();
  if (ensureTaskAttachmentsSyncedToProjects(store)) persistStore();
  const raw = {
    users: getAllUsers(),
    projects: getAllProjects(),
    tasks: getAllTasks(),
    taskDependencies: getAllTaskDependencies(),
    changeLogs: getAllChangeLogs(),
    transferLogs: getAllTransferLogs(),
    pushLogs: getAllPushLogs(100),
    workCalendar: getWorkCalendar(),
    staffDeptCatalog: getStaffDeptCatalog(),
  };
  const filtered = filterByRole(req.user, raw);
  res.json({
    success: true,
    ...filtered,
    serverTime: new Date().toISOString(),
    storeRevision: getStoreRevision(),
    currentUserId: req.user.id,
    currentUserRole: req.user.role,
  });
});

router.put('/data/sync', requireAuth, (req, res) => {
  const body = req.body || {};
  const store = getDb();
  ensureTaskAttachmentsSyncedToProjects(store);
  const {
    projects,
    tasks,
    taskDependencies,
    changeLogs,
    changeLogUpdates,
    transferLogs,
    transferLogUpdates,
    pushLogs,
    pushLogUpdates,
    removedProjectIds,
    removedTaskIds,
    users: clientUsers,
    userUpdates,
  } = body;

  if (!Array.isArray(projects) || !Array.isArray(tasks)) {
    return res.status(400).json({ success: false, message: '缺少 projects 或 tasks' });
  }

  try {
    const incoming = {
      projects,
      tasks,
      changeLogs,
      changeLogUpdates,
      transferLogs,
      transferLogUpdates,
      pushLogs,
      pushLogUpdates,
    };
    if (Array.isArray(taskDependencies)) incoming.taskDependencies = taskDependencies;
    if (Array.isArray(removedProjectIds)) incoming.removedProjectIds = removedProjectIds;
    if (Array.isArray(removedTaskIds)) incoming.removedTaskIds = removedTaskIds;
    if (isFullAccess(req.user.role) && Array.isArray(clientUsers)) {
      incoming.users = clientUsers;
    }
    if (req.user.role === 'manager' && Array.isArray(userUpdates)) {
      incoming.userUpdates = userUpdates;
    }
    mergeIncomingSync(req.user, incoming);

    const taskIds = (tasks || []).map(t => t?.id).filter(Boolean).slice(0, 100);
    const projectIds = (projects || []).map(p => p?.id).filter(Boolean).slice(0, 100);
    const event = emitChange({
      type: 'data.sync',
      entityType: 'store',
      entityIds: [...new Set([...taskIds, ...projectIds])].slice(0, 200),
      actorId: req.user.id,
      meta: {
        taskIds,
        projectIds,
        sync: true,
      },
    });

    res.json({
      success: true,
      message: '数据已同步',
      syncedAt: new Date().toISOString(),
      storeRevision: event.rev,
      changeLogsCount: getAllChangeLogs().length,
      transferLogsCount: getAllTransferLogs().length,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'henghuiguan-api', time: new Date().toISOString() });
});

/** 管理员：将种子文件中缺失的项目/任务补入服务端（不覆盖已有数据） */
router.post('/data/admin/merge-seed', requireAuth, (req, res) => {
  if (!isFullAccess(req.user.role)) {
    return res.status(403).json({ success: false, message: '仅总经理/管理员可执行' });
  }
  try {
    const seedPath = req.body?.seedPath || getDefaultSeedPath();
    const seed = loadSeedFile(seedPath);
    const store = {
      users: getAllUsers(),
      projects: getAllProjects(),
      tasks: getAllTasks(),
      changeLogs: getAllChangeLogs(),
      transferLogs: getAllTransferLogs(),
      pushLogs: getAllPushLogs(200),
    };
    const result = mergeSeedIntoStore(store, seed);
    replaceAllData({
      users: store.users,
      projects: store.projects,
      tasks: store.tasks,
      changeLogs: store.changeLogs,
      transferLogs: store.transferLogs,
      pushLogs: store.pushLogs,
    });
    res.json({
      success: true,
      message: `已补全 ${result.addedProjects} 个项目、${result.addedTasks} 个任务`,
      ...result,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** 管理员：将已有任务附件补同步到所属项目文档（幂等） */
router.post('/data/admin/sync-task-attachments', requireAuth, (req, res) => {
  if (!isFullAccess(req.user.role)) {
    return res.status(403).json({ success: false, message: '仅总经理/管理员可执行' });
  }
  try {
    const store = getDb();
    const result = backfillTaskAttachmentsToProjectDocuments(store);
    if (result.synced > 0) {
      persistStore();
    }
    res.json({
      success: true,
      message: result.synced > 0
        ? `已同步 ${result.synced} 个任务附件到 ${result.projectsTouched} 个项目`
        : '无需同步，任务附件均已存在于项目文档中',
      ...result,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
module.exports.filterByRole = filterByRole;
