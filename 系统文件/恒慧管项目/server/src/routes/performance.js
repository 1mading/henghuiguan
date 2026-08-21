const express = require('express');
const multer = require('multer');
const path = require('path');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { getDb, persistStore, getAllUsers, getAllProjects, getAllTasks } = require('../db/database');
const { saveUploadedFile, deleteStoredFile, resolveStoredPath } = require('../services/fileStorage');
const { genDocId } = require('../utils/projectDocuments');
const {
  EVIDENCE_TYPES,
  isPerformanceAdmin,
  ensurePerformanceStore,
  getActiveTemplate,
  getIndicatorMap,
  calcAssessmentTotal,
  createAssessmentSkeleton,
  buildStandardFileName,
  nextEvidenceSeq,
  findEvidenceByFileId,
  countPerformanceFileRefs,
  genId,
  normalizeYearMonth,
  lastDayOfMonth,
  cycleYearMonth,
  findCycleByMonth,
  listMonthOptions,
} = require('../services/performance');
const { isRelatedToProject } = require('../utils/taskRelations');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

function listMyRelatedProjects(user) {
  const allTasks = getAllTasks();
  return getAllProjects()
    .filter(p => isRelatedToProject(user, p, allTasks))
    .map(p => ({
      id: p.id,
      name: p.name,
      manager: p.manager,
      dept: p.dept,
      status: p.status,
      archived: p.archived === true || p.status === 'archived',
    }));
}

function sanitizeAssessmentProjectIds(user, projectIds) {
  const allowed = new Set(listMyRelatedProjects(user).map(p => p.id));
  return (projectIds || []).map(String).filter(id => allowed.has(id));
}
function requirePerformanceAdmin(req, res, next) {
  if (!isPerformanceAdmin(req.user)) {
    return res.status(403).json({ success: false, message: '无权访问绩效管理' });
  }
  next();
}

function refreshAssessmentScores(assessment, template) {
  const summary = calcAssessmentTotal(assessment, template);
  assessment.scoreSummary = summary;
  assessment.total = summary.total;
  assessment.updatedAt = new Date().toISOString();
}

function syncEvidenceToProjects(store, assessment, evidence, indicatorKey) {
  const synced = [];
  for (const projectId of assessment.projectIds || []) {
    const project = (store.projects || []).find(p => p.id === projectId);
    if (!project) continue;
    if (!Array.isArray(project.documents)) project.documents = [];
    const already = project.documents.some(
      d => d.fileId === evidence.fileId && d.source === 'performance'
    );
    if (already) {
      synced.push(projectId);
      continue;
    }
    project.documents.push({
      id: genDocId('DOC'),
      fileId: evidence.fileId,
      name: evidence.name,
      size: evidence.size,
      mimeType: evidence.mimeType,
      uploadedBy: evidence.uploadedBy,
      uploadedAt: evidence.uploadedAt,
      source: 'performance',
      performanceRef: {
        assessmentId: assessment.id,
        indicatorKey,
        evidenceId: evidence.id,
      },
    });
    synced.push(projectId);
  }
  evidence.syncedProjectIds = synced;
}

router.get('/performance/access', requireAuth, (req, res) => {
  res.json({ success: true, canAccessPerformance: isPerformanceAdmin(req.user) });
});

router.get('/performance/bootstrap', requireAuth, requirePerformanceAdmin, (req, res) => {
  const store = getDb();
  if (ensurePerformanceStore(store)) persistStore();
  const template = getActiveTemplate(store);
  const myUserId = req.user.id;
  const myAssessments = (store.performanceAssessments || []).filter(a => a.userId === myUserId);
  const myCycleIds = new Set(myAssessments.map(a => a.cycleId));
  const myCycles = (store.performanceCycles || []).filter(c => myCycleIds.has(c.id));
  const users = getAllUsers()
    .filter(u => u.id === myUserId)
    .map(u => ({
      id: u.id,
      name: u.name,
      dept: u.dept,
      role: u.role,
      position: u.position || '',
    }));
  const projects = listMyRelatedProjects(req.user);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  res.json({
    success: true,
    template,
    cycles: myCycles,
    assessments: myAssessments,
    users,
    projects,
    evidenceTypes: EVIDENCE_TYPES,
    months: listMonthOptions(store, myCycles.map(c => cycleYearMonth(c))),
    currentMonth,
    myUserId,
  });
});

/** 按月打开本人考核表：无周期/考核单则自动创建 */
router.post('/performance/ensure-month', requireAuth, requirePerformanceAdmin, (req, res) => {
  const store = getDb();
  ensurePerformanceStore(store);
  const yearMonth = normalizeYearMonth(req.body.yearMonth || req.body.month);
  if (!yearMonth) {
    return res.status(400).json({ success: false, message: '请选择有效月份（YYYY-MM）' });
  }
  const template = getActiveTemplate(store);
  let cycle = findCycleByMonth(store, yearMonth);
  let createdCycle = false;
  let dirty = false;
  if (!cycle) {
    cycle = {
      id: genId('PERF-C'),
      name: yearMonth,
      yearMonth,
      startDate: `${yearMonth}-01`,
      endDate: lastDayOfMonth(yearMonth),
      status: 'active',
      templateId: template.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.performanceCycles.push(cycle);
    createdCycle = true;
    dirty = true;
  } else if (!cycle.yearMonth) {
    cycle.yearMonth = yearMonth;
    cycle.updatedAt = new Date().toISOString();
    dirty = true;
  }

  const userId = req.user.id;
  let assessment = (store.performanceAssessments || []).find(
    a => a.cycleId === cycle.id && a.userId === userId
  );
  let createdAssessment = false;
  if (!assessment) {
    assessment = createAssessmentSkeleton(cycle.id, userId, template);
    refreshAssessmentScores(assessment, template);
    store.performanceAssessments.push(assessment);
    createdAssessment = true;
    dirty = true;
  }

  if (dirty) persistStore();

  res.json({
    success: true,
    yearMonth,
    cycle,
    assessment,
    createdCycle,
    createdAssessment,
    months: listMonthOptions(store, [yearMonth]),
  });
});

function requireOwnAssessment(req, res, assessment) {
  if (!assessment) {
    res.status(404).json({ success: false, message: '考核单不存在' });
    return false;
  }
  if (assessment.userId !== req.user.id) {
    res.status(403).json({ success: false, message: '只能查看与编辑本人的考核表' });
    return false;
  }
  return true;
}

router.post('/performance/cycles', requireAuth, requirePerformanceAdmin, (req, res) => {
  const store = getDb();
  ensurePerformanceStore(store);
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, message: '请填写周期名称' });
  const yearMonth = normalizeYearMonth(req.body.yearMonth) || normalizeYearMonth(name);
  const cycle = {
    id: genId('PERF-C'),
    name: yearMonth || name,
    yearMonth: yearMonth || undefined,
    startDate: String(req.body.startDate || '').trim() || (yearMonth ? `${yearMonth}-01` : ''),
    endDate: String(req.body.endDate || '').trim() || (yearMonth ? lastDayOfMonth(yearMonth) : ''),
    status: 'active',
    templateId: getActiveTemplate(store).id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.performanceCycles.push(cycle);
  persistStore();
  res.json({ success: true, cycle });
});

router.patch('/performance/cycles/:id', requireAuth, requirePerformanceAdmin, (req, res) => {
  const store = getDb();
  const cycle = (store.performanceCycles || []).find(c => c.id === req.params.id);
  if (!cycle) return res.status(404).json({ success: false, message: '周期不存在' });
  if (req.body.name != null) cycle.name = String(req.body.name).trim() || cycle.name;
  if (req.body.startDate != null) cycle.startDate = String(req.body.startDate).trim();
  if (req.body.endDate != null) cycle.endDate = String(req.body.endDate).trim();
  if (req.body.status != null) {
    const st = String(req.body.status).trim();
    if (['draft', 'active', 'archived'].includes(st)) cycle.status = st;
  }
  cycle.updatedAt = new Date().toISOString();
  persistStore();
  res.json({ success: true, cycle });
});

router.post('/performance/assessments', requireAuth, requirePerformanceAdmin, (req, res) => {
  const store = getDb();
  ensurePerformanceStore(store);
  const cycleId = String(req.body.cycleId || '').trim();
  const userId = String(req.body.userId || req.user.id || '').trim();
  if (userId !== req.user.id) {
    return res.status(403).json({ success: false, message: '只能创建本人的考核表' });
  }
  const cycle = (store.performanceCycles || []).find(c => c.id === cycleId);
  if (!cycle) return res.status(404).json({ success: false, message: '周期不存在' });
  const user = getAllUsers().find(u => u.id === userId);
  if (!user) return res.status(404).json({ success: false, message: '人员不存在' });
  const exists = (store.performanceAssessments || []).find(
    a => a.cycleId === cycleId && a.userId === userId
  );
  if (exists) return res.status(409).json({ success: false, message: '该月已有考核单', assessment: exists });

  const template = getActiveTemplate(store);
  const assessment = createAssessmentSkeleton(cycleId, userId, template);
  if (Array.isArray(req.body.projectIds)) {
    assessment.projectIds = sanitizeAssessmentProjectIds(req.user, req.body.projectIds);
  }
  refreshAssessmentScores(assessment, template);
  store.performanceAssessments.push(assessment);
  persistStore();
  res.json({ success: true, assessment });
});

router.patch('/performance/assessments/:id', requireAuth, requirePerformanceAdmin, (req, res) => {
  const store = getDb();
  const template = getActiveTemplate(store);
  const assessment = (store.performanceAssessments || []).find(a => a.id === req.params.id);
  if (!requireOwnAssessment(req, res, assessment)) return;

  if (Array.isArray(req.body.projectIds)) {
    assessment.projectIds = sanitizeAssessmentProjectIds(req.user, req.body.projectIds);
  }
  if (req.body.remark != null) assessment.remark = String(req.body.remark);

  if (req.body.rows && typeof req.body.rows === 'object') {
    const indMap = getIndicatorMap(template);
    for (const [key, patch] of Object.entries(req.body.rows)) {
      if (!indMap.has(key)) continue;
      if (!assessment.rows[key]) assessment.rows[key] = { actualValue: '', selfScore: '', leaderScore: '', finalScore: '', note: '', evidences: [] };
      const row = assessment.rows[key];
      if (patch.actualValue != null) row.actualValue = String(patch.actualValue);
      if (patch.selfScore != null) row.selfScore = patch.selfScore === '' ? '' : Number(patch.selfScore);
      if (patch.leaderScore != null) row.leaderScore = patch.leaderScore === '' ? '' : Number(patch.leaderScore);
      if (patch.finalScore != null) row.finalScore = patch.finalScore === '' ? '' : Number(patch.finalScore);
      if (patch.note != null) row.note = String(patch.note);
      if (!Array.isArray(row.evidences)) row.evidences = [];
    }
  }

  refreshAssessmentScores(assessment, template);
  persistStore();
  res.json({ success: true, assessment });
});

router.post(
  '/performance/assessments/:id/evidences',
  requireAuth,
  requirePerformanceAdmin,
  upload.single('file'),
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: '请选择文件' });
      const store = getDb();
      const template = getActiveTemplate(store);
      const assessment = (store.performanceAssessments || []).find(a => a.id === req.params.id);
      if (!requireOwnAssessment(req, res, assessment)) return;

      const indicatorKey = String(req.body.indicatorKey || '').trim();
      const indMap = getIndicatorMap(template);
      const indicator = indMap.get(indicatorKey);
      if (!indicator) return res.status(400).json({ success: false, message: '指标无效' });

      let evidenceType = String(req.body.evidenceType || '其他').trim();
      if (!EVIDENCE_TYPES.includes(evidenceType)) evidenceType = '其他';

      const cycle = (store.performanceCycles || []).find(c => c.id === assessment.cycleId);
      const user = getAllUsers().find(u => u.id === assessment.userId);
      if (!assessment.rows[indicatorKey]) {
        assessment.rows[indicatorKey] = {
          actualValue: '', selfScore: '', leaderScore: '', finalScore: '', note: '', evidences: [],
        };
      }
      const row = assessment.rows[indicatorKey];
      if (!Array.isArray(row.evidences)) row.evidences = [];

      const saved = saveUploadedFile(req.file, req.file.originalname);
      const seq = nextEvidenceSeq(row);
      const standardName = buildStandardFileName({
        cycleName: cycle?.name || assessment.cycleId,
        userName: user?.name || assessment.userId,
        shortName: indicator.shortName,
        evidenceType,
        seq,
        originalName: req.file.originalname,
      });

      const evidence = {
        id: genId('EV'),
        fileId: saved.fileId,
        name: standardName,
        originalName: saved.name,
        evidenceType,
        size: saved.size,
        mimeType: saved.mimeType,
        uploadedBy: req.user.name,
        uploadedAt: new Date().toISOString(),
        syncedProjectIds: [],
      };
      row.evidences.push(evidence);
      syncEvidenceToProjects(store, assessment, evidence, indicatorKey);
      assessment.updatedAt = new Date().toISOString();
      persistStore();
      res.json({ success: true, evidence, assessment });
    } catch (e) {
      const status = e.code === 'UNSUPPORTED_TYPE' || e.code === 'FILE_TOO_LARGE' ? 400 : 500;
      res.status(status).json({ success: false, message: e.message });
    }
  }
);

router.delete(
  '/performance/assessments/:assessmentId/evidences/:evidenceId',
  requireAuth,
  requirePerformanceAdmin,
  (req, res) => {
    const store = getDb();
    const assessment = (store.performanceAssessments || []).find(a => a.id === req.params.assessmentId);
    if (!requireOwnAssessment(req, res, assessment)) return;

    let removed = null;
    let indicatorKey = null;
    for (const [key, row] of Object.entries(assessment.rows || {})) {
      const idx = (row.evidences || []).findIndex(
        e => e.id === req.params.evidenceId || e.fileId === req.params.evidenceId
      );
      if (idx >= 0) {
        removed = row.evidences[idx];
        indicatorKey = key;
        row.evidences.splice(idx, 1);
        break;
      }
    }
    if (!removed) return res.status(404).json({ success: false, message: '证据不存在' });

    for (const project of store.projects || []) {
      if (!Array.isArray(project.documents)) continue;
      project.documents = project.documents.filter(
        d => !(d.source === 'performance' && d.fileId === removed.fileId &&
          d.performanceRef?.evidenceId === removed.id)
      );
    }

    if (removed.fileId && countPerformanceFileRefs(store, removed.fileId) === 0) {
      deleteStoredFile(removed.fileId);
    }
    assessment.updatedAt = new Date().toISOString();
    persistStore();
    res.json({ success: true, message: '已删除', indicatorKey, assessment });
  }
);

router.get('/performance/files/:fileId', requireAuth, requirePerformanceAdmin, (req, res) => {
  const store = getDb();
  const found = findEvidenceByFileId(store, req.params.fileId);
  if (!found) {
    return res.status(404).json({ success: false, message: '文件不存在' });
  }
  if (found.assessment.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: '只能下载本人考核证据' });
  }
  const storedPath = resolveStoredPath(found.evidence.fileId);
  if (!storedPath) {
    return res.status(404).json({ success: false, message: '文件已丢失' });
  }
  res.setHeader('Content-Type', found.evidence.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(found.evidence.name)}`
  );
  res.sendFile(path.resolve(storedPath));
});

module.exports = router;
module.exports.requirePerformanceAdmin = requirePerformanceAdmin;
