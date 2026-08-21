const path = require('path');
const config = require('../config');

const EVIDENCE_TYPES = ['台账', '汇报', '复盘', '计划', '清单', '资料', '培训', '交接', '证书', '其他'];

/** 与《2026实施交付部项目经理通用绩效考核表_V4.xlsx》列文案、分区、分值展示保持一致 */
const V4_TEMPLATE = {
  id: 'TPL-V4-2026',
  name: '2026年恒田企业信息中心实施交付部项目经理通用绩效考核评分表_V4',
  version: 'V4',
  contentVersion: 3,
  bonusCap: 10,
  companyName: '信息中心',
  positionName: '项目经理（实施专员）',
  baseScoreTotal: 100,
  remark:
    '考核总分=第一部分+第二部分+第三部分-第四部分扣分项。第三部分加分项最高不超过10分。评分需结合台账、会议纪要、交付物及协同部门反馈。',
  indicators: [
    {
      key: 'value_responsibility',
      section: 'values',
      sectionTitle: '第一部分：价值观与管理目标考核（总分20分）',
      category: '价值观与责任心',
      title: '责任心与价值观评估',
      shortName: '责任心价值观',
      weight: 0.1,
      maxScore: 10,
      maxScoreLabel: '10',
      definition: '核心价值观考核：及时响应并处理现场问题，不推诿、不拖延；对项目结果负责，主动解决问题。',
      target: '现场问题及时响应率100%；无有效投诉；主动解决疑难问题。',
      scoringRule: '完全达成10分；响应延迟扣2分/次；推诿扯皮扣5分/次；因责任心缺失导致问题升级扣10分。',
      dataSource: '业务方/部门负责人',
    },
    {
      key: 'compliance_learning',
      section: 'values',
      sectionTitle: '第一部分：价值观与管理目标考核（总分20分）',
      category: '管理与组织指标',
      title: '标准学习与合规',
      shortName: '标准学习合规',
      weight: 0.1,
      maxScore: 10,
      maxScoreLabel: '10',
      definition: '遵守公司制度、项目规范、信息安全红线；按要求参加内训。',
      target: '内训参与率100%；无红线违规。',
      scoringRule: '完全达成10分；缺训扣2分/次；违规本项0分并进入扣分项。',
      dataSource: '人事/部门负责人',
    },
    {
      key: 'project_overview',
      section: 'duty',
      sectionTitle: '第二部分：岗位职能指标（总分80分）',
      category: '岗位指标',
      title: '项目全局理解与主动汇报',
      shortName: '全局理解汇报',
      weight: 0.15,
      maxScore: 12,
      maxScoreLabel: '12',
      definition: '掌握项目边界、干系人、系统依赖与风险；主动输出项目台账与全貌汇报。',
      target: '项目信息台账100%完整；主动汇报≥每周1次；需求覆盖率≥95%。',
      scoringRule: '完全达成12分；台账缺失扣2分/项；汇报不及时扣3分/次；需求遗漏扣5分/次。',
      dataSource: '业务负责人/部门负责人',
    },
    {
      key: 'plan_closure',
      section: 'duty',
      sectionTitle: '第二部分：岗位职能指标（总分80分）',
      category: '岗位指标',
      title: '计划任务跟进与闭环',
      shortName: '计划任务闭环',
      weight: 0.2,
      maxScore: 16,
      maxScoreLabel: '16',
      definition: '按里程碑计划推进，明确Owner与Deadline，验证并闭环。',
      target: '里程碑按期达成率≥90%；任务闭环率≥95%。',
      scoringRule: '完全达成16分；延期1-3天扣3分/项；延期>3天扣5分/项；无验收签字扣5分。',
      dataSource: '项目负责人/项目管控部',
    },
    {
      key: 'issue_risk',
      section: 'duty',
      sectionTitle: '第二部分：岗位职能指标（总分80分）',
      category: '岗位指标',
      title: '问题清单闭环与风险管控',
      shortName: '问题清单风险',
      weight: 0.2,
      maxScore: 16,
      maxScoreLabel: '16',
      definition: '结构化拆解问题（技术/业务/进度/资源/风险），明确Owner与路径；重大风险24h升级。',
      target: '问题清单日更；分类准确率≥90%；问题闭环率≥95%。',
      scoringRule: '完全达成16分；清单未更扣3分/次；无Owner/Deadline扣2分/项；应升未升扣5分/次。',
      dataSource: '项目负责人/部门负责人',
    },
    {
      key: 'doc_archive',
      section: 'duty',
      sectionTitle: '第二部分：岗位职能指标（总分80分）',
      category: '岗位指标',
      title: '项目资料完整沉淀',
      shortName: '资料沉淀',
      weight: 0.15,
      maxScore: 12,
      maxScoreLabel: '12',
      definition: '按项目管控部标准，沉淀项目全周期资料（需求、蓝图、测试、验收、SOP等），确保可追溯、可复用。',
      target: '资料齐套率100%；归档及时率≥95%；满足项目管控部标准。',
      scoringRule: '完全达成12分；缺失一项关键资料扣2分；归档逾期扣2分/次；不满足管控标准扣5分。',
      dataSource: '项目管控部/部门负责人',
    },
    {
      key: 'monthly_review',
      section: 'duty',
      sectionTitle: '第二部分：岗位职能指标（总分80分）',
      category: '岗位指标',
      title: '月度复盘与计划安排',
      shortName: '月度复盘',
      weight: 0.125,
      maxScore: 10,
      maxScoreLabel: '10',
      definition: '每月输出上月项目复盘报告（完成率、未闭环、风险、改善）及下月计划。',
      target: '每月1~5日提交上月任务的复盘；每月25~30日制定下月计划；计划可执行率≥90%。',
      scoringRule: '完全达成10分；未按时提交扣5分；复盘质量差/计划不可行扣3分。',
      dataSource: '部门负责人/项目管控部',
    },
    {
      key: 'milestone_report',
      section: 'duty',
      sectionTitle: '第二部分：岗位职能指标（总分80分）',
      category: '岗位指标',
      title: '关键节点主动汇报',
      shortName: '关键节点汇报',
      weight: 0.1,
      maxScore: 8,
      maxScoreLabel: '8',
      definition: '调研、蓝图、上线、验收等关键节点必须主动汇报并附交付物（签字/纪要/报告）。',
      target: '关键节点汇报率100%；交付物齐套率100%。',
      scoringRule: '完全达成8分；节点未汇报扣3分/次；无交付物扣3分/次。',
      dataSource: '业务负责人/部门负责人',
    },
    {
      key: 'training_handover',
      section: 'duty',
      sectionTitle: '第二部分：岗位职能指标（总分80分）',
      category: '岗位指标',
      title: '用户培训与运维衔接',
      shortName: '培训运维',
      weight: 0.075,
      maxScore: 6,
      maxScoreLabel: '6',
      definition: '编写SOP/手册，组织培训；上线驻场支持，完成运维交接清单。',
      target: '培训覆盖率≥95%；交接清单100%完成；无交接后返工。',
      scoringRule: '完全达成6分；覆盖率<95%扣2分；交接未完成扣2分；返工扣2分/次。',
      dataSource: '业务负责人/运维负责人',
    },
    {
      key: 'bonus_consulting',
      section: 'bonus',
      sectionTitle: '第三部分：加分项（最高+20分）',
      category: '加分项',
      title: '价值创造与咨询落地',
      shortName: '加分咨询落地',
      weight: null,
      weightLabel: '—',
      maxScore: 5,
      maxScoreLabel: '5',
      definition: '基于项目任务闭环，提供咨询级建议、流程优化或AI提效工具，产生显著业务价值。',
      target: '方案被业务方采纳并落地；输出可复用的咨询资产或AI应用。',
      scoringRule: '完全达成得3-5分；部分达成得1-2分；无实质价值不得分。',
      dataSource: '部门负责人/业务方',
    },
    {
      key: 'bonus_extra',
      section: 'bonus',
      sectionTitle: '第三部分：加分项（最高+20分）',
      category: '加分项',
      title: '额外付出与跨域协同',
      shortName: '加分跨域协同',
      weight: null,
      weightLabel: '—',
      maxScore: 5,
      maxScoreLabel: '5',
      definition: '在完成本职目标外，主动承担跨部门协同、带教新人、攻坚重难点等额外工作。',
      target: '获得协同部门/新人/团队认可或表扬。',
      scoringRule: '完全达成得3-5分；部分达成得1-2分。',
      dataSource: '部门负责人/协同部门',
    },
    {
      key: 'bonus_pmp',
      section: 'bonus',
      sectionTitle: '第三部分：加分项（最高+20分）',
      category: '加分项',
      title: 'PMP 证书 + PMP 实施方法',
      shortName: '加分PMP',
      weight: null,
      weightLabel: '—',
      maxScore: 10,
      maxScoreLabel: '10',
      definition: '已取得 PMP 项目管理专业认证，运用PMP管理方法论规范推进项目实施，保障项目目标可控落地',
      target: '获得PMP证书/标准实施认可。',
      scoringRule: '完全达成得10分；部分达成得5分。',
      dataSource: '部门负责人/协同部门',
    },
    {
      key: 'penalty_safety',
      section: 'penalty',
      sectionTitle: '第四部分：扣分项',
      category: '扣分项',
      title: '重大失误/安全合规',
      shortName: '扣分安全合规',
      weight: null,
      weightLabel: '—',
      maxScore: 100,
      maxScoreLabel: '10-100',
      definition: '重大安全事故、数据泄露、重大客诉、越权处理、隐瞒不报等。',
      target: '重大事故/违规/漏报。',
      scoringRule: '一般问题扣10-20；较大扣30-50；重大扣60-100；',
      dataSource: '安全/审计/部门',
    },
    {
      key: 'penalty_resource',
      section: 'penalty',
      sectionTitle: '第四部分：扣分项',
      category: '扣分项',
      title: '责任错位导致内部资源问题',
      shortName: '扣分责任错位',
      weight: null,
      weightLabel: '—',
      maxScore: 20,
      maxScoreLabel: '5-20',
      definition: '责任边界不清、推诿扯皮，导致信息中心内部资源冲突、重复建设、人员闲置或项目延误。',
      target: '职责清晰，资源调度顺畅，无内部投诉。',
      scoringRule: '出现责任推诿导致资源浪费或冲突，扣5-10分/次；严重影响其他项目进度或导致资源闲置，扣10-20分/次。',
      dataSource: '部门负责人/项目管控部',
    },
  ],
};

function genId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

/** @returns {string|null} YYYY-MM */
function normalizeYearMonth(ym) {
  const m = String(ym || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}`;
}

function lastDayOfMonth(yearMonth) {
  const [y, mo] = yearMonth.split('-').map(Number);
  const d = new Date(y, mo, 0);
  const day = String(d.getDate()).padStart(2, '0');
  return `${yearMonth}-${day}`;
}

function cycleYearMonth(cycle) {
  if (!cycle) return null;
  if (cycle.yearMonth) return normalizeYearMonth(cycle.yearMonth);
  const fromName = normalizeYearMonth(String(cycle.name || '').trim());
  if (fromName) return fromName;
  const start = String(cycle.startDate || '');
  if (/^\d{4}-\d{2}/.test(start)) return start.slice(0, 7);
  return null;
}

function findCycleByMonth(store, yearMonth) {
  const ym = normalizeYearMonth(yearMonth);
  if (!ym) return null;
  return (store.performanceCycles || []).find(c => cycleYearMonth(c) === ym) || null;
}

function listMonthOptions(store, extraMonths) {
  const set = new Set();
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  for (const c of store.performanceCycles || []) {
    const ym = cycleYearMonth(c);
    if (ym) set.add(ym);
  }
  for (const m of extraMonths || []) {
    const ym = normalizeYearMonth(m);
    if (ym) set.add(ym);
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}

function isPerformanceAdmin(user) {
  if (!user) return false;
  const idCfg = String(config.performanceAdminUserId || '').trim();
  const nameCfg = String(config.performanceAdminUserName || '').trim();
  if (idCfg) {
    if (String(user.id) === idCfg || String(user.dingTalkUserId || '') === idCfg) return true;
  }
  if (nameCfg) {
    const name = String(user.name || '').trim();
    // 精确匹配，或档案名为「配置名 + 空格后缀」（如 王元斌 / 王元斌 Martin）
    if (name === nameCfg || name.startsWith(nameCfg + ' ')) return true;
  }
  return false;
}

function ensurePerformanceStore(store) {
  if (!Array.isArray(store.performanceTemplates)) store.performanceTemplates = [];
  if (!Array.isArray(store.performanceCycles)) store.performanceCycles = [];
  if (!Array.isArray(store.performanceAssessments)) store.performanceAssessments = [];
  const existing = store.performanceTemplates.find(t => t.id === V4_TEMPLATE.id);
  if (!existing) {
    store.performanceTemplates.push(structuredClone(V4_TEMPLATE));
    return true;
  }
  const needRefresh =
    existing.version !== V4_TEMPLATE.version ||
    existing.contentVersion !== V4_TEMPLATE.contentVersion ||
    (existing.indicators || []).length !== V4_TEMPLATE.indicators.length;
  if (needRefresh) {
    const idx = store.performanceTemplates.findIndex(t => t.id === V4_TEMPLATE.id);
    store.performanceTemplates[idx] = structuredClone(V4_TEMPLATE);
    return true;
  }
  return false;
}

function getActiveTemplate(store) {
  ensurePerformanceStore(store);
  return store.performanceTemplates.find(t => t.id === V4_TEMPLATE.id) || V4_TEMPLATE;
}

function getIndicatorMap(template) {
  const map = new Map();
  (template.indicators || []).forEach(ind => map.set(ind.key, ind));
  return map;
}

function sanitizeNamePart(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|\s]+/g, '')
    .replace(/_+/g, '_')
    .slice(0, 40) || '未命名';
}

function parseScore(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcAssessmentTotal(assessment, template) {
  const indMap = getIndicatorMap(template);
  let values = 0;
  let duty = 0;
  let bonus = 0;
  let penalty = 0;
  for (const [key, row] of Object.entries(assessment.rows || {})) {
    const ind = indMap.get(key);
    if (!ind) continue;
    const score = parseScore(row.finalScore);
    if (score == null) continue;
    if (ind.section === 'values') values += score;
    else if (ind.section === 'duty') duty += score;
    else if (ind.section === 'bonus') bonus += score;
    else if (ind.section === 'penalty') penalty += score;
  }
  const bonusCap = template.bonusCap != null ? template.bonusCap : 10;
  const bonusCounted = Math.min(bonus, bonusCap);
  const total = values + duty + bonusCounted - penalty;
  return {
    valuesScore: values,
    dutyScore: duty,
    bonusRaw: bonus,
    bonusCounted,
    penaltyScore: penalty,
    total,
  };
}

function emptyRow() {
  return {
    actualValue: '',
    selfScore: '',
    leaderScore: '',
    finalScore: '',
    note: '',
    evidences: [],
  };
}

function createAssessmentSkeleton(cycleId, userId, template) {
  const rows = {};
  (template.indicators || []).forEach(ind => {
    rows[ind.key] = emptyRow();
  });
  return {
    id: genId('PERF-A'),
    cycleId,
    userId,
    projectIds: [],
    rows,
    remark: '',
    total: null,
    scoreSummary: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildStandardFileName({ cycleName, userName, shortName, evidenceType, seq, originalName }) {
  const ext = path.extname(originalName || '').toLowerCase() || '';
  const seqStr = String(seq).padStart(2, '0');
  return [
    sanitizeNamePart(cycleName),
    sanitizeNamePart(userName),
    sanitizeNamePart(shortName),
    sanitizeNamePart(evidenceType || '其他'),
    seqStr,
  ].join('_') + ext;
}

function nextEvidenceSeq(row) {
  const nums = (row.evidences || [])
    .map(e => {
      const m = String(e.name || '').match(/_(\d{2})\.[^.]+$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter(n => n > 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

function findEvidenceByFileId(store, fileId) {
  for (const a of store.performanceAssessments || []) {
    for (const [indicatorKey, row] of Object.entries(a.rows || {})) {
      for (const ev of row.evidences || []) {
        if (ev.fileId === fileId || ev.id === fileId) {
          return { assessment: a, indicatorKey, row, evidence: ev };
        }
      }
    }
  }
  return null;
}

function countPerformanceFileRefs(store, fileId) {
  let count = 0;
  for (const a of store.performanceAssessments || []) {
    for (const row of Object.values(a.rows || {})) {
      for (const ev of row.evidences || []) {
        if (ev.fileId === fileId) count += 1;
      }
    }
  }
  for (const project of store.projects || []) {
    for (const doc of project.documents || []) {
      if (doc.fileId === fileId) count += 1;
    }
  }
  return count;
}

module.exports = {
  V4_TEMPLATE,
  EVIDENCE_TYPES,
  genId,
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
  parseScore,
  sanitizeNamePart,
  normalizeYearMonth,
  lastDayOfMonth,
  cycleYearMonth,
  findCycleByMonth,
  listMonthOptions,
};
