/**
 * 项目模板库
 * 首个内置：WMS 实施模板（P07 / 王元斌）
 */
const { getDb, persistStore } = require('../db/database');

const TPL_WMS_ID = 'TPL-WMS';
const TPL_STD_ID = 'TPL-STD';

/**
 * WMS：M0 选型确认为里程碑；定型/商务/合同为其下普通任务（不是里程碑）
 * stages[].tasks = 普通任务；stages[].gates = 标准门禁任务（标题带【里程碑】）
 */
const WMS_STAGES = [
  {
    key: 'M0',
    label: 'M0 选型确认',
    milestoneSeq: 'M0',
    tasks: ['M0a 选型定型', 'M0b 商务谈判', 'M0c 合同签订'],
    gates: [],
  },
  { key: 'M1', label: 'M1 项目启动', milestoneSeq: 'M1', tasks: [], gates: [] },
  { key: 'M2', label: 'M2 蓝图确认', milestoneSeq: 'M2', tasks: [], gates: [] },
  { key: 'M3', label: 'M3 配置开发完成', milestoneSeq: 'M3', tasks: [], gates: [] },
  { key: 'M4', label: 'M4 测试通过', milestoneSeq: 'M4', tasks: [], gates: [] },
  { key: 'M5', label: 'M5 上线准备', milestoneSeq: 'M5', tasks: [], gates: [] },
  { key: 'M6', label: 'M6 系统上线', milestoneSeq: 'M6', tasks: [], gates: [] },
  { key: 'M7', label: 'M7 项目验收', milestoneSeq: 'M7', tasks: [], gates: [] },
];

/** 标准过程组：只保留标准里程碑 + 标准任务 */
const STD_STAGES = [
  {
    key: '00',
    label: '00-立项与选型阶段',
    milestoneSeq: 'M1',
    tasks: ['M1 厂商选型定标', 'M2 采购合同+SLA签订'],
    gates: [],
  },
  {
    key: '01',
    label: '01-启动过程组',
    milestoneSeq: 'M2',
    tasks: ['M3 项目启动会召开'],
    gates: [],
  },
  {
    key: '02',
    label: '02-规划过程组',
    milestoneSeq: 'M3',
    tasks: ['M4 需求确认签字', 'M5 实施计划审批'],
    gates: [],
  },
  { key: '03', label: '03-执行过程组', milestoneSeq: 'M4', tasks: [], gates: [] },
  { key: '04', label: '04-监控过程组', milestoneSeq: 'M5', tasks: [], gates: [] },
  {
    key: '05',
    label: '05-收尾过程组',
    milestoneSeq: 'M6',
    tasks: ['M6 验收签字', 'M7 运维交接+复盘'],
    gates: [],
  },
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeStage(s) {
  return {
    key: s.key,
    label: s.label,
    milestoneSeq: s.milestoneSeq,
    tasks: [...(s.tasks || [])],
    gates: [...(s.gates || [])],
    deliverables: s.deliverables || '',
    acceptanceCriteria: s.acceptanceCriteria || '',
  };
}

function builtinTemplates() {
  const now = '2026-09-10T10:30:00.000Z';
  return [
    {
      id: TPL_WMS_ID,
      name: 'WMS 实施模板',
      desc: '选型确认（下挂定型/商务/合同任务）→启动→蓝图→配置→测试→上线准备→上线→验收',
      source: 'P07 WMS / 王元斌',
      builtin: true,
      stages: WMS_STAGES.map(normalizeStage),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: TPL_STD_ID,
      name: '标准过程组模板',
      desc: '立项选型 + 启动/规划/执行/监控/收尾（标准里程碑与标准任务）',
      source: '恒慧管标准项目模板规范 v1.1',
      builtin: true,
      stages: STD_STAGES.map(normalizeStage),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function ensureProjectTemplates(store) {
  if (!store) return [];
  if (!Array.isArray(store.projectTemplates)) store.projectTemplates = [];
  const builtins = builtinTemplates();
  let dirty = false;
  for (const b of builtins) {
    const idx = store.projectTemplates.findIndex(t => String(t.id) === String(b.id));
    if (idx < 0) {
      store.projectTemplates.push({ ...b });
      dirty = true;
    } else if (store.projectTemplates[idx].builtin !== false) {
      const prev = store.projectTemplates[idx];
      const sameStages = JSON.stringify(prev.stages || []) === JSON.stringify(b.stages);
      if (!sameStages || prev.desc !== b.desc || prev.name !== b.name || prev.source !== b.source) {
        store.projectTemplates[idx] = {
          ...prev,
          name: b.name,
          stages: b.stages,
          desc: b.desc,
          source: b.source,
          builtin: true,
          updatedAt: b.updatedAt,
        };
        dirty = true;
      }
    }
  }
  return store.projectTemplates;
}

function listTemplates() {
  const store = getDb();
  return [...ensureProjectTemplates(store)].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'zh')
  );
}

function getTemplate(id) {
  if (!id) return null;
  return listTemplates().find(t => String(t.id) === String(id)) || null;
}

function publicTemplate(t) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    desc: t.desc || '',
    source: t.source || '',
    builtin: !!t.builtin,
    stageCount: Array.isArray(t.stages) ? t.stages.length : 0,
    stages: Array.isArray(t.stages) ? t.stages : [],
    createdAt: t.createdAt || '',
    updatedAt: t.updatedAt || '',
  };
}

function saveTemplateFromProject(projectId, opts = {}) {
  const store = getDb();
  const project = (store.projects || []).find(p => String(p.id) === String(projectId));
  if (!project) throw httpError(404, `项目不存在: ${projectId}`);
  const milestones = (store.tasks || [])
    .filter(t => String(t.projectId) === String(projectId) && t.isMilestone)
    .slice()
    .sort((a, b) => String(a.milestoneSeq || a.planStartDate || a.title || '')
      .localeCompare(String(b.milestoneSeq || b.planStartDate || b.title || ''), 'zh'));
  if (!milestones.length) throw httpError(400, '该项目没有里程碑，无法存为模板');

  const now = new Date().toISOString();
  const id = String(opts.id || '').trim() || `TPL-${Date.now().toString(36).toUpperCase()}`;
  if (getTemplate(id)) throw httpError(409, `模板已存在: ${id}`);

  const tpl = {
    id,
    name: String(opts.name || `${project.name} 模板`).trim(),
    desc: String(opts.desc || `从项目「${project.name}」另存`).trim(),
    source: `project:${project.id}`,
    builtin: false,
    stages: milestones.map((m, i) => {
      const children = (store.tasks || []).filter(t =>
        String(t.parentId) === String(m.id) && !t.isMilestone
      );
      const gates = [];
      const tasks = [];
      children.forEach((c) => {
        const title = String(c.title || '').trim();
        if (/^【里程碑】/.test(title)) gates.push(title.replace(/^【里程碑】/, ''));
        else tasks.push(title);
      });
      return {
        key: String(m.milestoneSeq || `S${i + 1}`),
        label: String(m.title || m.milestoneSeq || `阶段${i + 1}`),
        milestoneSeq: String(m.milestoneSeq || `M${i + 1}`),
        tasks,
        gates,
        deliverables: String(m.deliverables || '').trim(),
        acceptanceCriteria: String(m.acceptanceCriteria || '').trim(),
      };
    }),
    createdAt: now,
    updatedAt: now,
    createdBy: String(opts.createdBy || '').trim(),
  };
  ensureProjectTemplates(store);
  store.projectTemplates.push(tpl);
  persistStore();
  return publicTemplate(tpl);
}

function normalizeIncomingStages(stages) {
  if (!Array.isArray(stages)) return [];
  return stages.map((s, i) => {
    const label = String(s.label || s.name || `里程碑${i + 1}`).trim();
    const key = String(s.key || s.milestoneSeq || `S${i + 1}`).trim();
    const milestoneSeq = String(s.milestoneSeq || key || `M${i + 1}`).trim();
    const tasks = Array.isArray(s.tasks)
      ? s.tasks.map(t => String(t || '').trim()).filter(Boolean)
      : String(s.tasksText || '')
        .split(/\n/)
        .map(t => t.trim())
        .filter(Boolean);
    const gates = Array.isArray(s.gates)
      ? s.gates.map(t => String(t || '').trim()).filter(Boolean)
      : String(s.gatesText || '')
        .split(/\n/)
        .map(t => t.trim())
        .filter(Boolean);
    return {
      key,
      label,
      milestoneSeq,
      tasks,
      gates,
      deliverables: String(s.deliverables || '').trim(),
      acceptanceCriteria: String(s.acceptanceCriteria || '').trim(),
    };
  }).filter(s => s.label);
}

function createTemplate(body = {}, opts = {}) {
  const store = getDb();
  ensureProjectTemplates(store);
  const name = String(body.name || '').trim();
  if (!name) throw httpError(400, '模板名称不能为空');
  const now = new Date().toISOString();
  const id = String(body.id || '').trim() || `TPL-${Date.now().toString(36).toUpperCase()}`;
  if (store.projectTemplates.some(t => String(t.id) === id)) {
    throw httpError(409, `模板已存在: ${id}`);
  }
  const stages = normalizeIncomingStages(body.stages);
  if (!stages.length) throw httpError(400, '至少添加一个里程碑');
  const tpl = {
    id,
    name,
    desc: String(body.desc || '').trim(),
    source: String(body.source || 'manual').trim(),
    builtin: false,
    stages,
    createdAt: now,
    updatedAt: now,
    createdBy: String(opts.createdBy || '').trim(),
  };
  store.projectTemplates.push(tpl);
  persistStore();
  return publicTemplate(tpl);
}

function updateTemplate(id, body = {}, opts = {}) {
  const store = getDb();
  ensureProjectTemplates(store);
  const idx = store.projectTemplates.findIndex(t => String(t.id) === String(id));
  if (idx < 0) throw httpError(404, '模板不存在');
  const prev = store.projectTemplates[idx];
  const next = { ...prev };
  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) throw httpError(400, '模板名称不能为空');
    next.name = name;
  }
  if (body.desc != null) next.desc = String(body.desc).trim();
  if (body.source != null) next.source = String(body.source).trim();
  if (body.stages != null) {
    const stages = normalizeIncomingStages(body.stages);
    if (!stages.length) throw httpError(400, '至少保留一个里程碑');
    next.stages = stages;
  }
  next.updatedAt = new Date().toISOString();
  next.updatedBy = String(opts.updatedBy || '').trim();
  // 用户改过的内置模板仍标记 builtin，但内容以库内为准
  store.projectTemplates[idx] = next;
  persistStore();
  return publicTemplate(next);
}

function deleteTemplate(id, opts = {}) {
  const store = getDb();
  ensureProjectTemplates(store);
  const idx = store.projectTemplates.findIndex(t => String(t.id) === String(id));
  if (idx < 0) throw httpError(404, '模板不存在');
  const tpl = store.projectTemplates[idx];
  if (tpl.builtin && opts.allowBuiltin !== true) {
    throw httpError(400, '内置模板不可删除；可编辑后使用，或新建副本');
  }
  store.projectTemplates.splice(idx, 1);
  persistStore();
  return { id };
}

function resetBuiltinTemplate(id) {
  const builtins = builtinTemplates();
  const src = builtins.find(t => String(t.id) === String(id));
  if (!src) throw httpError(404, '不是可恢复的内置模板');
  const store = getDb();
  ensureProjectTemplates(store);
  const idx = store.projectTemplates.findIndex(t => String(t.id) === String(id));
  if (idx < 0) {
    store.projectTemplates.push({ ...src });
  } else {
    store.projectTemplates[idx] = { ...src };
  }
  persistStore();
  return publicTemplate(getTemplate(id));
}

module.exports = {
  TPL_WMS_ID,
  TPL_STD_ID,
  WMS_STAGES,
  builtinTemplates,
  ensureProjectTemplates,
  listTemplates,
  getTemplate,
  publicTemplate,
  saveTemplateFromProject,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  resetBuiltinTemplate,
  normalizeIncomingStages,
};
