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
    registers: [],
    slots: [
      { key: 'vendor_proposal', title: '厂商方案', ext: 'pdf', required: false },
      { key: 'meeting_md', title: '会议纪要', ext: 'md', required: false },
    ],
  },
  {
    key: 'M1',
    label: 'M1 项目启动',
    milestoneSeq: 'M1',
    tasks: [],
    gates: [],
    registers: ['stakeholders'],
    slots: [{ key: 'charter', title: '项目章程', ext: 'docx', required: true }],
  },
  {
    key: 'M2',
    label: 'M2 蓝图确认',
    milestoneSeq: 'M2',
    tasks: [],
    gates: [],
    registers: ['commPlans', 'qualityChecks', 'risks', 'budgetLines'],
    slots: [
      { key: 'blueprint', title: '功能蓝图', ext: 'docx', required: true },
      { key: 'blueprint_sign', title: '蓝图评审签字扫描件', ext: 'pdf', required: false },
    ],
  },
  {
    key: 'M3',
    label: 'M3 配置开发完成',
    milestoneSeq: 'M3',
    tasks: [],
    gates: [],
    registers: [],
    slots: [{ key: 'phase_accept', title: '阶段验收材料', ext: 'docx', required: false }],
  },
  {
    key: 'M4',
    label: 'M4 测试通过',
    milestoneSeq: 'M4',
    tasks: [],
    gates: [],
    registers: [],
    slots: [{ key: 'test_report', title: '测试报告', ext: 'docx', required: false }],
  },
  {
    key: 'M5',
    label: 'M5 上线准备',
    milestoneSeq: 'M5',
    tasks: [],
    gates: [],
    registers: [],
    slots: [
      { key: 'go_live_plan', title: '上线切换方案', ext: 'docx', required: true },
      { key: 'training', title: '培训材料', ext: 'docx', required: false },
    ],
  },
  {
    key: 'M6',
    label: 'M6 系统上线',
    milestoneSeq: 'M6',
    tasks: [],
    gates: [],
    registers: [],
    slots: [{ key: 'go_live_record', title: '上线记录', ext: 'docx', required: true }],
  },
  {
    key: 'M7',
    label: 'M7 项目验收',
    milestoneSeq: 'M7',
    tasks: [],
    gates: [],
    registers: [],
    slots: [
      { key: 'accept_report', title: '验收报告', ext: 'docx', required: true },
      { key: 'accept_sign', title: '验收签字扫描件', ext: 'pdf', required: false },
    ],
  },
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
  const registers = Array.isArray(s.registers)
    ? s.registers.map(r => (typeof r === 'string' ? r : r?.key)).map(x => String(x || '').trim()).filter(Boolean)
    : [];
  const slots = Array.isArray(s.slots)
    ? s.slots.map(slot => ({
      key: String(slot.key || '').trim(),
      title: String(slot.title || slot.key || '').trim(),
      ext: String(slot.ext || 'docx').trim(),
      required: !!slot.required,
    })).filter(slot => slot.key)
    : [];
  return {
    key: s.key,
    label: s.label,
    milestoneSeq: s.milestoneSeq,
    tasks: [...(s.tasks || [])],
    gates: [...(s.gates || [])],
    deliverables: s.deliverables || '',
    acceptanceCriteria: s.acceptanceCriteria || '',
    registers,
    slots,
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
      registers: Array.isArray(s.registers)
        ? s.registers.map(r => (typeof r === 'string' ? r : r?.key)).map(x => String(x || '').trim()).filter(Boolean)
        : [],
      slots: Array.isArray(s.slots)
        ? s.slots.map(slot => ({
          key: String(slot.key || '').trim(),
          title: String(slot.title || slot.key || '').trim(),
          ext: String(slot.ext || 'docx').trim(),
          required: !!slot.required,
        })).filter(slot => slot.key)
        : [],
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

/** WMS：商务谈判/合同签订/选型定型应为 M0 下普通任务，不应是独立里程碑 */
const WMS_M0_TASK_TITLE_RE = /^(?:M0[abc]\s*)?(选型定型|商务谈判|合同签订)$/i;

function isWmsLikeProject(project) {
  if (!project) return false;
  if (String(project.stageTemplateId || '').trim() === TPL_WMS_ID) return true;
  if (String(project.id || '') === 'PRJ-GZ-WMS') return true;
  const name = String(project.name || '').trim();
  return name === 'WMS项目' || /^WMS\b/i.test(name);
}

function stripTaskTitlePrefix(title) {
  return String(title || '').trim()
    .replace(/^\d+[\.．、)\s]+/, '')
    .replace(/^M0[abc]\s*/i, '')
    .trim();
}

function findWmsM0Milestone(tasks) {
  return (tasks || []).find(t => {
    if (!t || t.status === 'abolished') return false;
    if (!t.isMilestone) return false;
    const seq = String(t.milestoneSeq || '').trim().toUpperCase();
    const phase = String(t.phaseKey || '').trim().toUpperCase();
    const title = String(t.title || '').trim().toUpperCase();
    return seq === 'M0' || phase === 'M0' || title === 'M0' || title.startsWith('M0 ');
  }) || null;
}

/**
 * 纠正误建成根级里程碑的 M0 子任务。
 * @returns {number} 变更条数
 */
function repairWmsM0FalseMilestones(store) {
  if (!store || !Array.isArray(store.tasks) || !Array.isArray(store.projects)) return 0;
  let changed = 0;
  for (const project of store.projects) {
    if (!isWmsLikeProject(project)) continue;
    if (!project.stageTemplateId) {
      project.stageTemplateId = TPL_WMS_ID;
      changed += 1;
    }
    const projectTasks = store.tasks.filter(t => String(t.projectId) === String(project.id));
    const m0 = findWmsM0Milestone(projectTasks);
    if (!m0) continue;

    const m0Children = projectTasks.filter(t =>
      String(t.parentId) === String(m0.id) && t.status !== 'abolished'
    );
    const hasSimilarChild = (coreTitle) => m0Children.some(c =>
      stripTaskTitlePrefix(c.title).toLowerCase() === String(coreTitle || '').toLowerCase()
    );

    for (const t of projectTasks) {
      if (!t || t.status === 'abolished') continue;
      if (!t.isMilestone) continue;
      if (String(t.id) === String(m0.id)) continue;
      const isRoot = !t.parentId || t.parentId === t.id;
      if (!isRoot) continue;
      const rawTitle = String(t.title || '').trim();
      const m = rawTitle.match(WMS_M0_TASK_TITLE_RE);
      if (!m) continue;
      const core = m[1];

      const kids = projectTasks.filter(c => String(c.parentId) === String(t.id) && c.status !== 'abolished');
      if (kids.length === 0 && hasSimilarChild(core)) {
        t.status = 'abolished';
        t.isMilestone = false;
        t.parentId = m0.id;
        changed += 1;
        continue;
      }

      // 降为 M0 下普通任务；若有子任务一并挂到其下
      t.isMilestone = false;
      t.parentId = m0.id;
      t.milestoneSeq = '';
      t.phaseKey = '';
      if (!/^M0[abc]\s/i.test(rawTitle) && !/^\d+[\.．、)]/.test(rawTitle)) {
        const prefix = core === '选型定型' ? 'M0a' : core === '商务谈判' ? 'M0b' : 'M0c';
        t.title = `${prefix} ${core}`;
      }
      changed += 1;
    }
  }
  return changed;
}

module.exports = {
  TPL_WMS_ID,
  TPL_STD_ID,
  WMS_STAGES,
  builtinTemplates,
  ensureProjectTemplates,
  repairWmsM0FalseMilestones,
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
