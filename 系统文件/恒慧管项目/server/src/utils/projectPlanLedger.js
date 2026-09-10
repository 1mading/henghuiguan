/**
 * 项目计划台账（领导要求的管线格式）
 * 字段：项目名称 | 目标 | 范围/不做范围 | 最终完成时间 | M序号 | 里程碑名称 | 开始 | 结束 | A | R | C | V | 交付物 | 验收标准 | 依赖/风险
 */

const LEDGER_HEADER =
  '项目名称 | 目标 | 范围/不做范围 | 最终完成时间 | M序号 | 里程碑名称 | 开始日期 | 完成日期 | A | R | C | V | 交付物 | 验收标准 | 依赖/风险';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isMilestoneTask(task) {
  if (!task) return false;
  if (task.isMilestone === true) return true;
  if (task.isMilestone === false) return false;
  return !task.parentId;
}

function getProjectRootTasks(projectTasks) {
  const ids = new Set(projectTasks.map(t => t.id));
  return projectTasks.filter(t => !t.parentId || t.parentId === t.id || !ids.has(t.parentId));
}

function sortMilestones(list) {
  return list.slice().sort((a, b) => {
    const sa = String(a.milestoneSeq || '').trim();
    const sb = String(b.milestoneSeq || '').trim();
    const na = (sa.match(/(\d+)/) || [])[1];
    const nb = (sb.match(/(\d+)/) || [])[1];
    if (na != null && nb != null && Number(na) !== Number(nb)) return Number(na) - Number(nb);
    if (sa && sb && sa !== sb) return sa.localeCompare(sb, 'zh');
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh');
  });
}

function getProjectMilestones(projectId, tasks) {
  const all = (tasks || []).filter(t => t.projectId === projectId && t.status !== 'abolished');
  return sortMilestones(getProjectRootTasks(all).filter(isMilestoneTask));
}

function formatScopeCombo(project) {
  const scope = String(project?.scope || '').trim();
  const out = String(project?.outOfScope || '').trim();
  if (scope && out) return `${scope} / 不做：${out}`;
  if (scope) return scope;
  if (out) return `不做：${out}`;
  return '';
}

function pickDate(...vals) {
  for (const v of vals) {
    const s = String(v || '').trim();
    if (s) return s;
  }
  return '';
}

function extractMilestonePlanFromDesc(desc) {
  const text = String(desc || '').trim();
  if (!text) return { deliverables: '', acceptanceCriteria: '' };
  let deliverables = '';
  let acceptanceCriteria = '';
  const dIdx = text.indexOf('【交付物】');
  const aIdx = text.indexOf('【验收】');
  if (dIdx >= 0) {
    const start = dIdx + '【交付物】'.length;
    const end = aIdx > dIdx ? aIdx : text.length;
    deliverables = text.slice(start, end).replace(/^[｜|\s]+|[｜|\s]+$/g, '').trim();
  }
  if (aIdx >= 0) {
    acceptanceCriteria = text.slice(aIdx + '【验收】'.length).replace(/^[｜|\s]+|[｜|\s]+$/g, '').trim();
  }
  return { deliverables, acceptanceCriteria };
}

function resolveDeliverables(m) {
  const direct = String(m?.deliverables || '').trim();
  if (direct) return direct;
  return extractMilestonePlanFromDesc(m?.desc).deliverables;
}

function resolveAcceptance(m) {
  const direct = String(m?.acceptanceCriteria || '').trim();
  if (direct) return direct;
  return extractMilestonePlanFromDesc(m?.desc).acceptanceCriteria;
}

function buildDepsRisksText(m) {
  return [
    String(m.depsRisks || '').trim(),
    String(m.escalation || '').trim() ? `升级：${String(m.escalation).trim()}` : '',
    String(m.delayImpact || '').trim() ? `延期影响：${String(m.delayImpact).trim()}` : '',
    String(m.reopenConditions || '').trim() ? `重开：${String(m.reopenConditions).trim()}` : '',
  ].filter(Boolean).join('；');
}

function buildProjectPlanLedger(project, tasks) {
  if (!project) throw httpError(404, '项目不存在');
  const milestones = getProjectMilestones(project.id, tasks);
  const objective = String(project.objective || project.desc || '').trim();
  const scopeCombo = formatScopeCombo(project);
  const finalDue = pickDate(project.endDate);
  const projectName = String(project.name || '').trim();

  const rows = (milestones.length ? milestones : [null]).map((m, idx) => {
    if (!m) {
      return {
        projectName,
        objective,
        scopeCombo,
        finalDue,
        milestoneSeq: '',
        milestoneName: '',
        startDate: '',
        endDate: '',
        roleA: '',
        roleR: '',
        roleC: '',
        roleV: '',
        deliverables: '',
        acceptanceCriteria: '',
        depsRisks: '',
        completionEvidence: '',
        escalation: '',
        delayImpact: '',
        reopenConditions: '',
        line: [projectName, objective, scopeCombo, finalDue, '', '', '', '', '', '', '', '', '', '', ''].join(' | '),
      };
    }
    const row = {
      projectName,
      objective,
      scopeCombo,
      finalDue,
      milestoneSeq: String(m.milestoneSeq || `M${idx + 1}`).trim(),
      milestoneName: String(m.title || '').trim(),
      startDate: pickDate(m.planStartDate, m.effectivePlanStart),
      endDate: pickDate(m.dueDate, m.planEndDate),
      roleA: String(m.roleA || '').trim(),
      roleR: String(m.roleR || m.assignee || '').trim(),
      roleC: String(m.roleC || '').trim(),
      roleV: String(m.roleV || '').trim(),
      deliverables: resolveDeliverables(m),
      acceptanceCriteria: resolveAcceptance(m),
      depsRisks: String(m.depsRisks || '').trim(),
      completionEvidence: String(m.completionEvidence || '').trim(),
      escalation: String(m.escalation || '').trim(),
      delayImpact: String(m.delayImpact || '').trim(),
      reopenConditions: String(m.reopenConditions || '').trim(),
    };
    row.line = [
      row.projectName,
      row.objective,
      row.scopeCombo,
      row.finalDue,
      row.milestoneSeq,
      row.milestoneName,
      row.startDate,
      row.endDate,
      row.roleA,
      row.roleR,
      row.roleC,
      row.roleV,
      row.deliverables,
      row.acceptanceCriteria,
      buildDepsRisksText(m),
    ].join(' | ');
    return row;
  });

  return {
    projectId: project.id,
    projectName,
    header: LEDGER_HEADER,
    lines: rows.map(r => r.line),
    text: [LEDGER_HEADER, ...rows.map(r => r.line)].join('\n'),
    rows,
    planVerified: project.planVerified === true,
    planVerifiedBy: String(project.planVerifiedBy || '').trim(),
    planVerifiedAt: String(project.planVerifiedAt || '').trim(),
    objective: String(project.objective || '').trim(),
    value: String(project.value || '').trim(),
    scope: String(project.scope || '').trim(),
    outOfScope: String(project.outOfScope || '').trim(),
    endDate: finalDue,
    milestoneCount: milestones.length,
  };
}

module.exports = {
  LEDGER_HEADER,
  buildProjectPlanLedger,
  getProjectMilestones,
  formatScopeCombo,
  isMilestoneTask,
};
