// ========== 项目阶段（M0–M7）与结构化登记册 ==========

/** 默认阶段元数据：registers=系统表；slots=叙事/签批文档槽 */
const HHG_DEFAULT_PHASE_META = {
  M0: {
    label: 'M0 选型确认',
    hint: '厂商方案与会议纪要走文档槽',
    registers: [],
    slots: [
      { key: 'vendor_proposal', title: '厂商方案', ext: 'pdf', required: false },
      { key: 'meeting_md', title: '会议纪要', ext: 'md', required: false },
    ],
  },
  M1: {
    label: 'M1 项目启动',
    hint: '干系人=系统表格；项目章程=文档槽',
    registers: ['stakeholders'],
    slots: [
      { key: 'charter', title: '项目章程', ext: 'docx', required: true },
    ],
  },
  M2: {
    label: 'M2 蓝图确认',
    hint: '沟通/质量/风险/预算=系统表；功能蓝图等=文档槽；WBS=本页任务',
    registers: ['commPlans', 'qualityChecks', 'risks', 'budgetLines'],
    slots: [
      { key: 'blueprint', title: '功能蓝图', ext: 'docx', required: true },
      { key: 'blueprint_sign', title: '蓝图评审签字扫描件', ext: 'pdf', required: false },
    ],
  },
  M3: {
    label: 'M3 配置开发完成',
    hint: '以任务交付为主；配置说明等走文档槽',
    registers: [],
    slots: [
      { key: 'phase_accept', title: '阶段验收材料', ext: 'docx', required: false },
    ],
  },
  M4: {
    label: 'M4 测试通过',
    hint: '测试报告走文档槽；缺陷台账后续可结构化',
    registers: [],
    slots: [
      { key: 'test_report', title: '测试报告', ext: 'docx', required: false },
    ],
  },
  M5: {
    label: 'M5 上线准备',
    hint: '上线切换方案、培训材料',
    registers: [],
    slots: [
      { key: 'go_live_plan', title: '上线切换方案', ext: 'docx', required: true },
      { key: 'training', title: '培训材料', ext: 'docx', required: false },
    ],
  },
  M6: {
    label: 'M6 系统上线',
    hint: '上线记录',
    registers: [],
    slots: [
      { key: 'go_live_record', title: '上线记录', ext: 'docx', required: true },
    ],
  },
  M7: {
    label: 'M7 项目验收',
    hint: '验收报告与签批件',
    registers: [],
    slots: [
      { key: 'accept_report', title: '验收报告', ext: 'docx', required: true },
      { key: 'accept_sign', title: '验收签字扫描件', ext: 'pdf', required: false },
    ],
  },
};

const HHG_REGISTER_DEFS = {
  stakeholders: {
    id: 'stakeholders',
    title: '干系人登记册',
    phaseHint: 'M1',
    countLabel: (n) => `${n} 人`,
    fields: [
      { key: 'name', label: '姓名' },
      { key: 'role', label: '角色' },
      { key: 'dept', label: '部门' },
      { key: 'influence', label: '影响力', type: 'select', options: ['高', '中', '低'] },
      { key: 'focus', label: '关注点' },
      { key: 'freq', label: '沟通频率' },
      { key: 'contact', label: '联系方式' },
      { key: 'note', label: '备注' },
    ],
    emptyRow: () => ({ id: '', name: '', role: '', dept: '', influence: '中', focus: '', freq: '', contact: '', note: '' }),
  },
  commPlans: {
    id: 'commPlans',
    title: '沟通计划',
    phaseHint: 'M2',
    countLabel: (n) => `${n} 条`,
    fields: [
      { key: 'target', label: '对象' },
      { key: 'topic', label: '事项' },
      { key: 'channel', label: '方式', type: 'select', options: ['会议', '钉钉', '邮件', '电话'] },
      { key: 'freq', label: '频率' },
      { key: 'owner', label: '负责人' },
      { key: 'nextDate', label: '下次日期', type: 'date' },
      { key: 'status', label: '状态' },
    ],
    emptyRow: () => ({ id: '', target: '', topic: '', channel: '会议', freq: '', owner: '', nextDate: '', status: '未开始' }),
  },
  qualityChecks: {
    id: 'qualityChecks',
    title: '质量检查点',
    phaseHint: 'M2',
    countLabel: (n) => `${n} 项`,
    fields: [
      { key: 'point', label: '检查点' },
      { key: 'standard', label: '标准' },
      { key: 'owner', label: '责任人' },
      { key: 'planDate', label: '计划日期', type: 'date' },
      { key: 'result', label: '结果' },
      { key: 'status', label: '状态' },
    ],
    emptyRow: () => ({ id: '', point: '', standard: '', owner: '', planDate: '', result: '', status: '未开始' }),
  },
  risks: {
    id: 'risks',
    title: '风险登记册',
    phaseHint: 'M2',
    countLabel: (n) => `${n} 条`,
    fields: [
      { key: 'desc', label: '风险描述' },
      { key: 'level', label: '等级', type: 'select', options: ['高', '中', '低'] },
      { key: 'prob', label: '概率', type: 'select', options: ['高', '中', '低'] },
      { key: 'impact', label: '影响', type: 'select', options: ['高', '中', '低'] },
      { key: 'action', label: '应对' },
      { key: 'owner', label: '责任人' },
      { key: 'status', label: '状态' },
    ],
    emptyRow: () => ({ id: '', desc: '', level: '中', prob: '中', impact: '中', action: '', owner: '', status: '未开始' }),
  },
  budgetLines: {
    id: 'budgetLines',
    title: '预算明细（内部）',
    phaseHint: 'M2',
    countLabel: (n) => `${n} 行`,
    fields: [
      { key: 'item', label: '科目' },
      { key: 'amount', label: '预算金额' },
      { key: 'spent', label: '已发生' },
      { key: 'note', label: '备注' },
    ],
    emptyRow: () => ({ id: '', item: '', amount: '', spent: '', note: '' }),
  },
};

function ensureProjectRegisterArrays(project) {
  if (!project) return project;
  if (!Array.isArray(project.stakeholders)) project.stakeholders = [];
  if (!Array.isArray(project.commPlans)) project.commPlans = [];
  if (!Array.isArray(project.qualityChecks)) project.qualityChecks = [];
  if (!Array.isArray(project.risks)) project.risks = [];
  if (!Array.isArray(project.budgetLines)) project.budgetLines = [];
  if (!Array.isArray(project.documents)) project.documents = [];
  return project;
}

function getProjectPhaseStages(project) {
  const tpl = typeof resolveProjectTemplate === 'function'
    ? resolveProjectTemplate(project?.stageTemplateId || 'TPL-WMS')
    : null;
  const stages = Array.isArray(tpl?.stages) && tpl.stages.length
    ? tpl.stages
    : Object.keys(HHG_DEFAULT_PHASE_META).map(key => ({
      key,
      label: HHG_DEFAULT_PHASE_META[key].label || key,
      milestoneSeq: key,
    }));
  return stages.map((s, i) => {
    const key = String(s.key || s.milestoneSeq || `S${i + 1}`).trim();
    const meta = HHG_DEFAULT_PHASE_META[key] || {};
    const registers = Array.isArray(s.registers) && s.registers.length
      ? s.registers
      : (meta.registers || []);
    const slots = Array.isArray(s.slots) && s.slots.length
      ? s.slots
      : (meta.slots || []);
    return {
      key,
      label: String(s.label || s.name || meta.label || key).trim(),
      milestoneSeq: String(s.milestoneSeq || key).trim(),
      hint: meta.hint || '',
      registers: registers.map(r => (typeof r === 'string' ? r : r.key)).filter(k => HHG_REGISTER_DEFS[k]),
      slots: slots.map(slot => ({
        key: String(slot.key || '').trim(),
        title: String(slot.title || slot.key || '文档').trim(),
        ext: String(slot.ext || 'docx').trim(),
        required: !!slot.required,
      })).filter(slot => slot.key && slot.key !== 'vendor_minutes'),
    };
  });
}

function getPhaseStatus(project, stage) {
  const milestones = getProjectMilestones(project).filter(m => milestoneMatchesPhase(m, stage));
  if (!milestones.length) {
    const cur = String(project.currentPhase || '');
    if (cur.includes(stage.key) || cur.includes(stage.label)) return 'current';
    return 'todo';
  }
  const allDone = milestones.every(m => m.status === 'done' || m.status === 'completed');
  if (allDone) return 'done';
  const anyActive = milestones.some(m => m.status === 'active' || m.status === 'in_progress' || m.status === 'doing');
  const cur = String(project.currentPhase || '');
  if (anyActive || cur.includes(stage.key) || cur.includes(stage.label)) return 'current';
  const anyStarted = milestones.some(m => m.status && m.status !== 'todo' && m.status !== 'pending');
  return anyStarted ? 'current' : 'todo';
}

function milestoneMatchesPhase(m, stage) {
  if (!m || !stage) return false;
  const seq = String(m.milestoneSeq || '').trim().toUpperCase();
  const phaseKey = String(m.phaseKey || '').trim().toUpperCase();
  const key = String(stage.key || '').trim().toUpperCase();
  const mseq = String(stage.milestoneSeq || '').trim().toUpperCase();
  if (phaseKey && (phaseKey === key || phaseKey === mseq)) return true;
  if (seq && (seq === key || seq === mseq)) return true;
  const title = String(m.title || '').trim().toUpperCase();
  if (key && (title === key || title.startsWith(key + ' ') || title.startsWith(key))) return true;
  if (mseq && (title === mseq || title.startsWith(mseq + ' ') || title.startsWith(mseq))) return true;
  const label = String(stage.label || '').trim().toUpperCase();
  if (label && title && (title === label || title.startsWith(label) || label.startsWith(title))) return true;
  return false;
}

/** 里程碑对应的模板阶段（登记册/文档槽）；无匹配时返回 null */
function resolveStageForMilestone(project, milestone) {
  if (!milestone) return null;
  const stages = getProjectPhaseStages(project);
  const byKey = stages.find(s => String(s.key || '') === String(milestone.phaseKey || '').trim());
  if (byKey) return byKey;
  return stages.find(s => milestoneMatchesPhase(milestone, s)) || null;
}

function getMilestoneRailStatus(milestone, current, allDone) {
  if (!milestone) return 'todo';
  if (allDone || milestone.status === 'done' || milestone.status === 'archived') return 'done';
  const display = typeof getTaskDisplayStatus === 'function'
    ? getTaskDisplayStatus(milestone)
    : milestone.status;
  if (display === 'done' || milestone.status === 'done') return 'done';
  if (display === 'paused' || milestone.status === 'paused') return 'current';
  if (display === 'doing' || milestone.status === 'doing') return 'current';
  if (current && current.id === milestone.id) return 'current';
  const progress = Number(milestone.progress);
  if ((Number.isFinite(progress) && progress > 0)
    || milestone.actualStartDate
    || (typeof calcProgress === 'function' && calcProgress(milestone.id) > 0)) {
    return 'current';
  }
  return 'todo';
}

function formatMilestoneRailLabel(m, idx) {
  const seq = String(m?.milestoneSeq || '').trim();
  const title = String(m?.title || m?.id || `里程碑${(idx || 0) + 1}`).trim();
  if (seq && title && !title.toUpperCase().startsWith(seq.toUpperCase())) return `${seq} ${title}`;
  return title || seq || `里程碑${(idx || 0) + 1}`;
}

/** 保证详情页选中的里程碑/阶段与任务列表一致；优先真实里程碑 */
function ensureDetailPhaseKey(project) {
  const milestones = getProjectMilestones(project);
  const stages = getProjectPhaseStages(project);

  if (milestones.length) {
    let mid = String(state.detailMilestoneId || '').trim();
    if (!mid || mid === '__unassigned__' || !milestones.some(m => m.id === mid)) {
      const { current } = getCurrentAndNextMilestones(project);
      mid = (current || milestones[0]).id;
      state.detailMilestoneId = mid;
    }
    const m = milestones.find(x => x.id === mid);
    const stage = resolveStageForMilestone(project, m);
    state.detailPhaseKey = stage
      ? stage.key
      : String(m?.phaseKey || m?.milestoneSeq || mid).trim();
    return state.detailPhaseKey;
  }

  if (!stages.length) return '';
  let key = String(state.detailPhaseKey || '').trim();
  if (key && stages.some(s => s.key === key)) return key;
  const current = stages.find(s => getPhaseStatus(project, s) === 'current');
  key = (current || stages[0]).key;
  state.detailPhaseKey = key;
  state.detailMilestoneId = '';
  return key;
}

function selectProjectMilestone(milestoneId) {
  const mid = String(milestoneId || '').trim();
  state.projectDetailTab = 'work';
  if (normalizeProjectWorkView(state.projectPlanView) === 'gantt') {
    state.projectPlanView = 'table';
  }
  const pid = (state.form && state.form.projectId) || state.currentProjectId;
  const project = projects.find(p => p.id === pid);
  if (!project || !mid) {
    render();
    return;
  }
  const m = getProjectMilestones(project).find(x => x.id === mid);
  if (!m) {
    render();
    return;
  }
  state.detailMilestoneId = m.id;
  const stage = resolveStageForMilestone(project, m);
  state.detailPhaseKey = stage
    ? stage.key
    : String(m.phaseKey || m.milestoneSeq || m.id).trim();
  render();
}

function selectProjectPhase(phaseKey) {
  state.detailPhaseKey = String(phaseKey || '').trim();
  state.projectDetailTab = 'work';
  if (normalizeProjectWorkView(state.projectPlanView) === 'gantt') {
    state.projectPlanView = 'table';
  }
  const pid = (state.form && state.form.projectId) || state.currentProjectId;
  const project = projects.find(p => p.id === pid);
  if (project) {
    const stage = getProjectPhaseStages(project).find(s => s.key === state.detailPhaseKey);
    const ms = getProjectMilestones(project).filter(m => milestoneMatchesPhase(m, stage));
    // 无匹配时清空，避免回落到「第一个里程碑」导致切换阶段任务不变
    state.detailMilestoneId = ms[0] ? ms[0].id : '';
  }
  render();
}

function getRegisterRows(project, registerId) {
  ensureProjectRegisterArrays(project);
  return Array.isArray(project[registerId]) ? project[registerId] : [];
}

function openProjectRegisterModal(registerId) {
  const pid = (state.form && state.form.projectId) || state.currentProjectId;
  const project = projects.find(p => p.id === pid);
  if (!project) return;
  const def = HHG_REGISTER_DEFS[registerId];
  if (!def) return;
  ensureProjectRegisterArrays(project);
  const rows = (project[registerId] || []).map(r => ({ ...def.emptyRow(), ...r }));
  state.form = {
    ...(state.form || {}),
    projectId: project.id,
    registerId,
    registerRows: rows.length ? rows : [def.emptyRow()],
  };
  state.showModal = 'projectRegister';
  render();
}

function addProjectRegisterRow() {
  const def = HHG_REGISTER_DEFS[state.form?.registerId];
  if (!def) return;
  if (!Array.isArray(state.form.registerRows)) state.form.registerRows = [];
  state.form.registerRows.push(def.emptyRow());
  render();
}

function removeProjectRegisterRow(idx) {
  if (!Array.isArray(state.form.registerRows)) return;
  state.form.registerRows.splice(idx, 1);
  render();
}

function updateProjectRegisterCell(idx, key, value) {
  if (!state.form?.registerRows?.[idx]) return;
  state.form.registerRows[idx][key] = value;
}

function saveProjectRegisterModal() {
  const pid = state.form?.projectId;
  const registerId = state.form?.registerId;
  const project = projects.find(p => p.id === pid);
  const def = HHG_REGISTER_DEFS[registerId];
  if (!project || !def) {
    closeModal();
    return;
  }
  ensureProjectRegisterArrays(project);
  const rows = (state.form.registerRows || [])
    .map(r => {
      const row = { ...def.emptyRow(), ...r };
      if (!row.id) row.id = `REG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return row;
    })
    .filter(r => def.fields.some(f => String(r[f.key] || '').trim()));
  project[registerId] = rows;
  save({ immediateSync: true });
  closeModal();
  render();
}

function renderProjectRegisterModal() {
  const registerId = state.form?.registerId;
  const def = HHG_REGISTER_DEFS[registerId];
  if (!def) return '';
  const rows = Array.isArray(state.form.registerRows) ? state.form.registerRows : [];
  const fieldControl = (f, i, row) => {
    if (f.type === 'select') {
      return `<select class="input hhg-reg-field-ctrl" onchange="updateProjectRegisterCell(${i}, '${f.key}', this.value)">
        ${(f.options || []).map(o => `<option value="${escapeHtml(o)}" ${String(row[f.key]) === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select>`;
    }
    const inputType = f.type === 'date' ? 'date' : 'text';
    return `<input class="input hhg-reg-field-ctrl" type="${inputType}" value="${escapeHtml(row[f.key] || '')}" oninput="updateProjectRegisterCell(${i}, '${f.key}', this.value)" placeholder="${escapeHtml(f.label)}">`;
  };
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box hhg-register-modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-address-book" style="color:var(--brand);margin-right:8px;"></i>${escapeHtml(def.title)}</h3>
          <button type="button" onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p class="hhg-register-hint">按条目维护；空行保存时自动忽略。可随时增删改。</p>
          <div class="hhg-register-list">
            ${rows.length ? rows.map((row, i) => `
              <div class="hhg-register-card">
                <div class="hhg-register-card-head">
                  <span class="hhg-register-card-idx">#${i + 1}</span>
                  <button type="button" class="btn btn-ghost btn-sm" title="删除本条" onclick="removeProjectRegisterRow(${i})" style="color:#DC2626;"><i class="fas fa-trash-alt"></i></button>
                </div>
                <div class="hhg-register-fields">
                  ${def.fields.map(f => `
                    <label class="hhg-register-field${f.type === 'date' || f.type === 'select' ? ' is-narrow' : ''}">
                      <span class="hhg-register-field-label">${escapeHtml(f.label)}</span>
                      ${fieldControl(f, i, row)}
                    </label>
                  `).join('')}
                </div>
              </div>
            `).join('') : `
              <div class="hhg-register-empty">暂无条目，点击下方「增行」开始填写</div>
            `}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn" onclick="addProjectRegisterRow()"><i class="fas fa-plus"></i> 增行</button>
          <div style="flex:1;"></div>
          <button type="button" class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button type="button" class="btn btn-primary" onclick="saveProjectRegisterModal()"><i class="fas fa-save"></i> 保存</button>
        </div>
      </div>
    </div>
  `;
}

function findDocsForSlot(project, phaseKey, slotKey) {
  const docs = project.documents || [];
  const matched = docs.filter(d =>
    String(d.slotKey || '') === slotKey && (!d.phaseKey || String(d.phaseKey) === phaseKey)
  );
  if (matched.length) return matched;
  return docs.filter(d => String(d.slotKey || '') === slotKey);
}

/** @deprecated 单文件兼容；请用 findDocsForSlot */
function findDocForSlot(project, phaseKey, slotKey) {
  return findDocsForSlot(project, phaseKey, slotKey)[0] || null;
}

function slotDocsBadge(docs) {
  if (!docs.length) {
    return '<span class="badge" style="background:var(--warning-soft);color:var(--warning);">未交</span>';
  }
  const hasWiki = docs.some(d => slotDocState(d) === 'wiki');
  const hasFile = docs.some(d => slotDocState(d) === 'file');
  const count = `<span class="badge" style="background:var(--success-soft);color:var(--success);">${docs.length} 个</span>`;
  if (hasWiki && !hasFile) {
    return `<span class="badge" style="background:var(--brand-soft);color:var(--brand);">钉钉</span> ${count}`;
  }
  return count;
}

function slotDocState(doc) {
  if (!doc) return 'empty';
  if (doc.source === 'dingtalk_wiki' || (!doc.fileId && doc.url)) return 'wiki';
  return 'file';
}

function renderPhaseRegisterCards(project, stage) {
  const ids = stage.registers || [];
  if (!ids.length) return '';
  return `
    <section class="panel hhg-phase-panel">
      <div class="panel-body" style="padding:14px 16px;">
        <div class="hhg-phase-panel-head">
          <h3><i class="fas fa-address-book"></i>本阶段登记册</h3>
        </div>
        <div class="hhg-reg-grid">
          ${ids.map(id => {
            const def = HHG_REGISTER_DEFS[id];
            if (!def) return '';
            const n = getRegisterRows(project, id).length;
            return `
              <button type="button" class="hhg-reg-card" onclick="openProjectRegisterModal('${id}')">
                <div class="k">结构化功能 · ${escapeHtml(def.phaseHint || '')}</div>
                <div class="v">${escapeHtml(def.title)} · ${escapeHtml(def.countLabel(n))}</div>
                <div class="a">打开表格 →</div>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderSlotDocRow(project, stage, slot, doc, canManage) {
  const st = slotDocState(doc);
  const refKey = doc.fileId || doc.id || '';
  const openBtn = doc.fileId
    ? `<button type="button" class="btn btn-sm" onclick="downloadEntityFile('${escapeHtml(doc.fileId)}','${escapeHtml(doc.name || 'file')}')"><i class="fas fa-download"></i></button>`
    : (doc.url
      ? `<a class="btn btn-sm" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i></a>`
      : '');
  const removeBtns = canManage ? `
    <button type="button" class="btn btn-sm btn-ghost" title="移出本槽（保留项目文档）" onclick="unlinkProjectPhaseSlotDoc('${project.id}','${escapeHtml(refKey)}')">移出</button>
    ${refKey ? `<button type="button" class="btn btn-sm btn-ghost" title="删除文件" onclick="deleteEntityFile('project','${project.id}','${escapeHtml(refKey)}')"><i class="fas fa-trash"></i></button>` : ''}
  ` : '';
  return `
    <div class="hhg-slot-file">
      <div class="hhg-slot-file-main">
        <i class="fas ${st === 'wiki' ? 'fa-book' : 'fa-paperclip'}" style="color:var(--brand);"></i>
        <span class="hhg-slot-file-name" title="${escapeHtml(doc.name || '')}">${escapeHtml(doc.name || '未命名')}</span>
        <span class="hhg-slot-file-meta">${escapeHtml(doc.uploadedBy || '-')} · ${escapeHtml(String(doc.uploadedAt || '').slice(0, 10))}${st === 'wiki' ? ' · 钉钉' : ''}</span>
      </div>
      <div class="hhg-slot-file-actions">${openBtn}${removeBtns}</div>
    </div>
  `;
}

function togglePhaseDocSlots(phaseKey) {
  const key = String(phaseKey || '').trim();
  if (!key) return;
  if (!state.phaseDocSlotsExpanded || typeof state.phaseDocSlotsExpanded !== 'object') {
    state.phaseDocSlotsExpanded = {};
  }
  state.phaseDocSlotsExpanded[key] = !state.phaseDocSlotsExpanded[key];
  render();
}

function isPhaseDocSlotsExpanded(phaseKey) {
  const key = String(phaseKey || '').trim();
  return !!(state.phaseDocSlotsExpanded && state.phaseDocSlotsExpanded[key]);
}

function renderPhaseDocSlots(project, stage, canManage) {
  const slots = stage.slots || [];
  const expanded = isPhaseDocSlotsExpanded(stage.key);
  if (!slots.length) {
    return `
      <section class="panel hhg-phase-panel">
        <div class="panel-body" style="padding:14px 16px;">
          <div class="hhg-phase-panel-head"><h3><i class="fas fa-folder-open"></i>阶段文档槽</h3></div>
          <div style="font-size:13px;color:var(--text-muted);">本阶段无固定叙事文档槽；任务附件仍会同步到项目文档。</div>
        </div>
      </section>
    `;
  }
  const filled = slots.reduce((n, slot) => n + findDocsForSlot(project, stage.key, slot.key).length, 0);
  const requiredMissing = slots.filter(slot => slot.required && !findDocsForSlot(project, stage.key, slot.key).length).length;
  const summary = [
    `${slots.length} 个槽位`,
    filled ? `已挂 ${filled}` : '尚未挂载',
    requiredMissing ? `${requiredMissing} 个必交未交` : '',
  ].filter(Boolean).join(' · ');
  return `
    <section class="panel hhg-phase-panel hhg-phase-panel--collapsible">
      <div class="panel-body" style="padding:14px 16px;">
        <button type="button" class="hhg-phase-panel-toggle" onclick="togglePhaseDocSlots('${escapeHtml(stage.key)}')" aria-expanded="${expanded ? 'true' : 'false'}">
          <div class="hhg-phase-panel-head" style="margin:0;width:100%;">
            <h3><i class="fas fa-folder-open"></i>阶段文档槽</h3>
            <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(summary)}</span>
            <span class="hhg-phase-panel-chevron"><i class="fas fa-chevron-${expanded ? 'up' : 'down'}"></i></span>
          </div>
        </button>
        ${expanded ? `
          <div class="hhg-slot-list" style="margin-top:12px;">
            ${slots.map(slot => {
              const docs = findDocsForSlot(project, stage.key, slot.key);
              const badge = slotDocsBadge(docs);
              const ico = slot.ext === 'pdf' ? 'fa-file-pdf' : slot.ext === 'xlsx' ? 'fa-file-excel' : slot.ext === 'md' ? 'fa-file-code' : 'fa-file-word';
              const emptyHint = slot.required ? '必交 · 尚未上传' : '建议 · 可上传多个';
              const addActions = canManage ? `
                <label class="btn btn-sm" style="cursor:pointer;margin:0;">
                  <i class="fas fa-upload"></i> 上传
                  <input type="file" multiple hidden onchange="uploadProjectPhaseSlot('${project.id}','${stage.key}','${slot.key}',event)">
                </label>
                <button type="button" class="btn btn-sm" onclick="linkProjectPhaseSlotWiki('${project.id}','${stage.key}','${slot.key}')"><i class="fas fa-link"></i> 挂钉钉</button>
              ` : '';
              return `
                <div class="hhg-slot hhg-slot--multi">
                  <div class="hhg-slot-head">
                    <div class="hhg-slot-ico"><i class="fas ${ico}"></i></div>
                    <div class="hhg-slot-body">
                      <div class="hhg-slot-title">${escapeHtml(slot.title)}${slot.required ? ' <span style="color:var(--danger);">*</span>' : ''} ${badge}</div>
                      <div class="hhg-slot-meta">${docs.length ? `已挂 ${docs.length} 个` : emptyHint}</div>
                    </div>
                    <div class="hhg-slot-actions">${addActions}</div>
                  </div>
                  ${docs.length ? `
                    <div class="hhg-slot-files">
                      ${docs.map(d => renderSlotDocRow(project, stage, slot, d, canManage)).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

async function uploadProjectPhaseSlot(projectId, phaseKey, slotKey, event) {
  const files = Array.from(event?.target?.files || []);
  if (event?.target) event.target.value = '';
  if (!files.length) return;
  if (!state.phaseDocSlotsExpanded || typeof state.phaseDocSlotsExpanded !== 'object') {
    state.phaseDocSlotsExpanded = {};
  }
  state.phaseDocSlotsExpanded[phaseKey] = true;
  try {
    for (const file of files) {
      const item = await uploadFileToEntity('project', projectId, file, file.name, 'attachment');
      const p = projects.find(x => x.id === projectId);
      if (p && item) {
        ensureProjectRegisterArrays(p);
        const doc = (p.documents || []).find(d => d.fileId === item.fileId || d.id === item.id) || item;
        doc.phaseKey = phaseKey;
        doc.slotKey = slotKey;
        if (!(p.documents || []).some(d => d === doc || (doc.fileId && d.fileId === doc.fileId) || (doc.id && d.id === doc.id))) {
          p.documents.push(doc);
        }
      }
    }
    save({ immediateSync: true });
    render();
  } catch (e) {
    alert(e.message || '上传失败');
    render();
  }
}

function unlinkProjectPhaseSlotDoc(projectId, refKey) {
  const p = projects.find(x => x.id === projectId);
  if (!p || !Array.isArray(p.documents)) return;
  const doc = p.documents.find(d => d.fileId === refKey || d.id === refKey);
  if (!doc) return;
  if (!confirm(`将「${doc.name || '该文件'}」移出本槽？（文件仍保留在项目文档中）`)) return;
  doc.slotKey = '';
  doc.phaseKey = '';
  save({ immediateSync: true });
  render();
}

function linkProjectPhaseSlotWiki(projectId, phaseKey, slotKey) {
  state._phaseSlotLink = { projectId, phaseKey, slotKey };
  if (!state.phaseDocSlotsExpanded || typeof state.phaseDocSlotsExpanded !== 'object') {
    state.phaseDocSlotsExpanded = {};
  }
  state.phaseDocSlotsExpanded[phaseKey] = true;
  if (typeof showWikiDocPicker === 'function') {
    showWikiDocPicker('project', projectId, { linkPurpose: `phase:${phaseKey}:${slotKey}` });
  } else {
    alert('钉钉文档选择器不可用');
  }
}

function applyPhaseSlotMetaFromPurpose(doc, purpose) {
  const m = String(purpose || '').match(/^phase:([^:]+):(.+)$/);
  if (!m || !doc) return;
  doc.phaseKey = m[1];
  doc.slotKey = m[2];
}

function renderPhaseRail(project) {
  const canManage = canManageProject(project) && !isProjectArchived(project);
  const railHead = `
    <div class="hhg-phase-rail-title">
      <span>里程碑阶段</span>
      ${canManage ? `
        <button type="button" class="btn btn-ghost btn-sm hhg-phase-rail-add" onclick="showNewMilestoneModal('${project.id}')" title="新增里程碑">
          <i class="fas fa-plus"></i>
        </button>
      ` : ''}
    </div>
  `;
  const milestones = getProjectMilestones(project);
  if (milestones.length) {
    ensureDetailPhaseKey(project);
    const activeId = String(state.detailMilestoneId || '');
    const { current, allDone } = getCurrentAndNextMilestones(project);
    return `
      <div class="hhg-phase-rail">
        ${railHead}
        ${milestones.map((m, idx) => {
          const st = getMilestoneRailStatus(m, current, allDone);
          const active = m.id === activeId;
          const dotCls = st === 'done' ? 'is-done' : st === 'current' ? 'is-current' : 'is-todo';
          const sub = st === 'done' ? '已完成' : st === 'current' ? '进行中' : '未开始';
          const seq = String(m.milestoneSeq || '').trim();
          const num = seq.replace(/^M/i, '') || String(idx + 1);
          return `
            <button type="button" class="hhg-phase-item${active ? ' active' : ''}" onclick="selectProjectMilestone('${escapeHtml(m.id)}')">
              <span class="hhg-phase-dot ${dotCls}">${st === 'done' ? '<i class="fas fa-check"></i>' : escapeHtml(num)}</span>
              <span class="hhg-phase-text">
                <span class="hhg-phase-label">${escapeHtml(formatMilestoneRailLabel(m, idx))}</span>
                <span class="hhg-phase-sub">${sub}</span>
              </span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  const stages = getProjectPhaseStages(project);
  const activeKey = ensureDetailPhaseKey(project);
  return `
    <div class="hhg-phase-rail">
      ${railHead}
      ${stages.map(s => {
        const st = getPhaseStatus(project, s);
        const active = s.key === activeKey;
        const dotCls = st === 'done' ? 'is-done' : st === 'current' ? 'is-current' : 'is-todo';
        const sub = st === 'done' ? '已完成' : st === 'current' ? '进行中' : '未开始';
        const num = String(s.key || '').replace(/^M/i, '') || '·';
        return `
          <button type="button" class="hhg-phase-item${active ? ' active' : ''}" onclick="selectProjectPhase('${escapeHtml(s.key)}')">
            <span class="hhg-phase-dot ${dotCls}">${st === 'done' ? '<i class="fas fa-check"></i>' : escapeHtml(num)}</span>
            <span class="hhg-phase-text">
              <span class="hhg-phase-label">${escapeHtml(s.label)}</span>
              <span class="hhg-phase-sub">${sub}</span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderProjectPhaseWorkSplit(project, canManage) {
  const stages = getProjectPhaseStages(project);
  const milestones = getProjectMilestones(project);
  ensureDetailPhaseKey(project);
  const view = normalizeProjectWorkView(state.projectPlanView);
  if (view === 'gantt') {
    return `
      <div class="project-detail-tab-panel">
        <div class="project-work-gantt-wrap">
          ${renderProjectWorkToolbar(project)}
          ${renderProjectGanttSection(project)}
        </div>
      </div>
    `;
  }

  let stage = null;
  let activeMilestone = null;

  if (milestones.length) {
    activeMilestone = milestones.find(m => m.id === state.detailMilestoneId) || milestones[0];
    state.detailMilestoneId = activeMilestone.id;
    stage = resolveStageForMilestone(project, activeMilestone)
      || stages.find(s => s.key === state.detailPhaseKey)
      || null;
    if (stage) state.detailPhaseKey = stage.key;
  } else {
    const activeKey = state.detailPhaseKey;
    stage = stages.find(s => s.key === activeKey) || stages[0];
    state.detailMilestoneId = '';
  }

  const wbsSection = milestones.length
    ? (view === 'table'
      ? renderProjectMilestoneTabsSection(project, { hideTabs: true, milestoneId: state.detailMilestoneId })
      : `<div class="project-work-board-wrap">${renderProjectWorkToolbar(project)}${renderProjectDeliveryBoard(project, { hideTabs: true, milestoneId: state.detailMilestoneId })}</div>`)
    : `<div class="panel hhg-phase-panel" style="margin-top:4px;"><div class="panel-body">${renderEmptyState({
      icon: 'fa-flag',
      title: '本阶段暂无对应里程碑',
      hint: canManage ? '请先添加与本阶段对应的里程碑，或在模板中配置标准阶段' : '暂无任务',
    })}</div></div>`;

  return `
    <div class="project-detail-tab-panel">
      <div class="project-work-split hhg-phase-split">
        <aside class="project-work-rail">
          ${renderPhaseRail(project)}
          ${renderProjectFocusMini(project)}
        </aside>
        <div class="project-work-main">
          ${stage ? renderPhaseRegisterCards(project, stage) : ''}
          ${stage ? renderPhaseDocSlots(project, stage, canManage) : ''}
          <section class="panel hhg-phase-panel" style="margin-top:4px;margin-bottom:8px;">
            <div class="panel-body" style="padding:12px 16px;">
              <div class="hhg-phase-panel-head" style="margin-bottom:0;">
                <h3><i class="fas fa-sitemap"></i>WBS · 本阶段任务</h3>
              </div>
            </div>
          </section>
          <div>
            ${wbsSection}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderProjectRegistersTab(project) {
  ensureProjectRegisterArrays(project);
  const cards = Object.keys(HHG_REGISTER_DEFS).map(id => {
    const def = HHG_REGISTER_DEFS[id];
    const n = getRegisterRows(project, id).length;
    return `
      <button type="button" class="hhg-reg-card" onclick="openProjectRegisterModal('${id}')">
        <div class="k">${escapeHtml(def.phaseHint)} · 结构化功能</div>
        <div class="v">${escapeHtml(def.title)} · ${escapeHtml(def.countLabel(n))}</div>
        <div class="a">打开表格 →</div>
      </button>
    `;
  }).join('');
  return `
    <div class="project-detail-tab-panel">
      <section class="panel hhg-phase-panel">
        <div class="panel-body" style="padding:14px 16px;">
          <div class="hhg-phase-panel-head"><h3><i class="fas fa-book-open"></i>项目登记册汇总</h3></div>
          <div class="hhg-reg-grid">${cards}</div>
          <p style="margin:12px 0 0;font-size:12px;color:var(--text-muted);">
            能表格化的在本页「登记册」页签或阶段卡片中维护；章程、功能蓝图等叙事材料走文档槽。WBS 即下方「本阶段任务」树。
          </p>
        </div>
      </section>
    </div>
  `;
}
