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
  reloadStoreFromDisk,
} = require('../db/database');
const { getWorkCalendar } = require('../services/workCalendar');

const { isFullAccess } = require('../utils/roles');
const {
  isRelatedToTask,
  isRelatedToProject,
  canManageProject,
  canEditTask,
} = require('../utils/taskRelations');
const {
  mergeSeedIntoStore,
  loadSeedFile,
  getDefaultSeedPath,
} = require('../utils/mergeSeedData');
const {
  INFO_CENTER_DEPT,
  filterProjectsForUser,
  filterTasksForUser,
} = require('../utils/projectAccess');

const router = express.Router();

function filterDependenciesForUser(user, deps, allTasks, allProjects) {
  const visibleIds = new Set(filterTasksForUser(user, allTasks, allProjects).map(t => t.id));
  return (deps || []).filter(d =>
    visibleIds.has(d.predecessorTaskId) || visibleIds.has(d.successorTaskId)
  );
}

function filterByRole(user, data) {
  if (isFullAccess(user.role)) {
    return data;
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
  };

  if (user.role === 'manager') {
    return {
      ...visible,
      users: data.users.filter(u =>
        u.dept === user.dept ||
        isFullAccess(u.role) ||
        u.dept === INFO_CENTER_DEPT
      ),
    };
  }

  return {
    ...visible,
    users: data.users,
  };
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
    // 防止前端空 projects/tasks 误覆盖服务端已有业务数据（空数组在 JS 中为 truthy，此前会整表清空）
    const wipeRisk =
      store.projects.length > 0 &&
      incomingProjects.length === 0 &&
      incomingTasks.length === 0;
    if (wipeRisk) {
      console.warn('[sync] 拒绝空数据覆盖：服务端仍有项目/任务，已跳过 projects/tasks 清空');
    }
    replaceAllData({
      users: mergeUsersPreservingServerFields(store.users, Array.isArray(incoming.users) ? incoming.users : store.users),
      projects: wipeRisk ? store.projects : incomingProjects,
      tasks: wipeRisk ? store.tasks : incomingTasks,
      taskDependencies: wipeRisk ? store.taskDependencies : (
        Array.isArray(incoming.taskDependencies) ? incoming.taskDependencies : mergedTaskDependencies
      ),
      changeLogs: mergedChangeLogs,
      transferLogs: mergedTransferLogs,
      pushLogs: mergedPushLogs,
    });
    return;
  }

  if (user.role === 'manager') {
    const mergedTasks = mergeTasksById(store.tasks, incoming.tasks || [], t =>
      canEditTask(user, t, store.projects)
    );
    const mergedProjects = mergeProjectsById(store.projects, incoming.projects || [], p =>
      canManageProject(user, p)
    );
    replaceAllData({
      users: mergeManagerUserUpdates(store.users, user, incoming.userUpdates),
      projects: mergedProjects,
      tasks: mergedTasks,
      taskDependencies: mergedTaskDependencies,
      changeLogs: mergedChangeLogs,
      transferLogs: mergedTransferLogs,
      pushLogs: mergedPushLogs,
    });
    return;
  }

  const mergedTasks = mergeTasksById(store.tasks, incoming.tasks || [], t =>
    canEditTask(user, t, store.projects)
  );
  const mergedProjects = mergeProjectsById(store.projects, incoming.projects || [], p =>
    canManageProject(user, p)
  );
  replaceAllData({
    users: store.users,
    projects: mergedProjects,
    tasks: mergedTasks,
    taskDependencies: mergedTaskDependencies,
    changeLogs: mergedChangeLogs,
    transferLogs: mergedTransferLogs,
    pushLogs: store.pushLogs,
  });
}

router.get('/miniapp/bootstrap', requireApiKey, requireAuth, (req, res) => {
  reloadStoreFromDisk();
  const raw = {
    users: getAllUsers(),
    projects: getAllProjects(),
    tasks: getAllTasks(),
    taskDependencies: getAllTaskDependencies(),
    changeLogs: getAllChangeLogs(),
    transferLogs: getAllTransferLogs(),
    pushLogs: getAllPushLogs(100),
    workCalendar: getWorkCalendar(),
    serverTime: new Date().toISOString(),
  };
  writeOk(res, filterByRole(req.user, raw));
});

router.get('/data/bootstrap', requireAuth, (req, res) => {
  reloadStoreFromDisk();
  const raw = {
    users: getAllUsers(),
    projects: getAllProjects(),
    tasks: getAllTasks(),
    taskDependencies: getAllTaskDependencies(),
    changeLogs: getAllChangeLogs(),
    transferLogs: getAllTransferLogs(),
    pushLogs: getAllPushLogs(100),
    workCalendar: getWorkCalendar(),
  };
  const filtered = filterByRole(req.user, raw);
  res.json({
    success: true,
    ...filtered,
    serverTime: new Date().toISOString(),
    currentUserId: req.user.id,
    currentUserRole: req.user.role,
  });
});

router.put('/data/sync', requireAuth, (req, res) => {
  const body = req.body || {};
  const {
    projects,
    tasks,
    changeLogs,
    changeLogUpdates,
    transferLogs,
    transferLogUpdates,
    pushLogs,
    pushLogUpdates,
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
    if (isFullAccess(req.user.role) && Array.isArray(clientUsers)) {
      incoming.users = clientUsers;
    }
    if (req.user.role === 'manager' && Array.isArray(userUpdates)) {
      incoming.userUpdates = userUpdates;
    }
    mergeIncomingSync(req.user, incoming);
    res.json({
      success: true,
      message: '数据已同步',
      syncedAt: new Date().toISOString(),
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

module.exports = router;
module.exports.filterByRole = filterByRole;
