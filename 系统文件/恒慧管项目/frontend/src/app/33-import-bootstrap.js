// ========== 数据导入 ==========
const IMPORT_HEADER_MAP = {
  '项目名称': 'projectName', 'projectName': 'projectName', '项目': 'projectName',
  '项目描述': 'projectDesc', 'projectDesc': 'projectDesc',
  '所属部门': 'dept', 'dept': 'dept', '部门': 'dept',
  '项目负责人': 'manager', 'manager': 'manager',
  '项目开始日期': 'startDate', 'startDate': 'startDate', '开始日期': 'startDate',
  '项目结束日期': 'endDate', 'endDate': 'endDate', '结束日期': 'endDate',
  '一级任务': 'level1', 'level1': 'level1', '主任务': 'level1',
  '二级任务': 'level2', 'level2': 'level2', '子任务': 'level2',
  '三级任务': 'level3', 'level3': 'level3',
  '四级任务': 'level4', 'level4': 'level4',
  '任务标题': 'taskTitle', 'taskTitle': 'taskTitle', 'title': 'taskTitle', '任务名称': 'taskTitle',
  '任务描述': 'taskDesc', 'taskDesc': 'taskDesc', 'desc': 'taskDesc', '描述': 'taskDesc',
  '负责人': 'assignee', '任务负责人': 'assignee', 'assignee': 'assignee', '执行人': 'assignee',
  '协助人': 'collaboratorsRaw', 'collaborators': 'collaboratorsRaw', '协办人': 'collaboratorsRaw',
  '优先级': 'priority', 'priority': 'priority',
  '预计工时': 'estimatedHours', 'estimatedHours': 'estimatedHours', '工时': 'estimatedHours',
  '每日投入工时': 'dailyHours', '每日工时': 'dailyHours', 'dailyHours': 'dailyHours',
  '计划开始日期': 'planStartDate', 'planStartDate': 'planStartDate',
  '截止日期': 'dueDate', 'dueDate': 'dueDate', '计划截止日期': 'dueDate',
  '任务类型': 'taskType', 'taskType': 'taskType', '类型': 'taskType',
  '所属项目': 'projectName', '所属项目ID': 'projectId', 'projectId': 'projectId', '项目ID': 'projectId',
  '上级任务': 'parentId', '上级任务ID': 'parentId', 'parentId': 'parentId',
};

function normalizeImportRow(raw) {
  const row = {};
  Object.keys(raw).forEach(key => {
    const k = key.trim().replace(/^\uFEFF/, '');
    const mapped = IMPORT_HEADER_MAP[k] || k;
    row[mapped] = String(raw[key] || '').trim();
  });
  if (row.projectName && !row.name) row.name = row.projectName;
  if (row.taskTitle && !row.title) row.title = row.taskTitle;
  if (row.taskDesc && !row.desc) row.desc = row.taskDesc;
  if (row.projectDesc && !row.desc) row.desc = row.projectDesc;
  row.startDate = normalizeImportDate(row.startDate);
  row.endDate = normalizeImportDate(row.endDate);
  row.planStartDate = normalizeImportDate(row.planStartDate);
  row.dueDate = normalizeImportDate(row.dueDate);
  return row;
}

function normalizeImportDate(val) {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    return `${slash[1]}-${String(slash[2]).padStart(2, '0')}-${String(slash[3]).padStart(2, '0')}`;
  }
  const parsed = parseLocalDate(s);
  return parsed ? formatLocalDate(parsed) : s.slice(0, 10);
}

function parseImportCollaborators(raw, assignee) {
  if (!raw) return [];
  return String(raw).split(/[,，;；、|/\\]+/).map(s => s.trim()).filter(Boolean);
}

function applyImportCollaborators(task, raw, assignee) {
  const names = sanitizeTaskCollaborators(assignee, parseImportCollaborators(raw, assignee));
  ensureCollaboratorEntries(task);
  task.collaboratorEntries = (task.collaboratorEntries || []).filter(e => e.type !== COLLAB_TYPE_INFORM);
  names.forEach(name => {
    task.collaboratorEntries.push({
      id: genId('COL'),
      userName: name,
      type: COLLAB_TYPE_INFORM,
      status: COLLAB_STATUS_ACTIVE,
    });
  });
  syncCollaboratorsArray(task);
  return names;
}

function finalizeImportedTask(task, row) {
  task.priority = normalizePriority(row.priority || task.priority || 'normal');
  task.type = normalizeTaskType(row.taskType || task.type);
  task.estimatedHours = parseFloat(row.estimatedHours) || task.estimatedHours || 0;
  task.dailyHours = resolveDailyHours(row.dailyHours) ?? task.dailyHours ?? null;
  task.planStartDate = row.planStartDate || task.planStartDate || null;
  task.dueDate = row.dueDate || task.dueDate || '';
  applyImportCollaborators(task, row.collaboratorsRaw, task.assignee);
  if (task.planStartDate && task.estimatedHours > 0) {
    reconcileEffectivePlanStart(task);
    syncTaskScheduleFields(task);
  } else if (task.dueDate && !task.planStartDate) {
    task.planStartDate = task.dueDate;
  }
  return task;
}

function detectImportType(rows) {
  if (!rows.length) return 'unified';
  const keys = Object.keys(rows[0]).map(k => k.trim());
  const hasTaskLevels = keys.some(k => ['一级任务', '二级任务', '三级任务', '四级任务', 'level1', 'level2', 'level3', 'level4', '主任务'].includes(k));
  if (hasTaskLevels) return 'unified';
  if (keys.some(k => ['title', 'taskTitle', '任务标题', '任务名称'].includes(k))) return 'task';
  if (keys.some(k => ['name', 'projectName', '项目名称'].includes(k)) && keys.some(k => ['dept', '所属部门', '部门'].includes(k))) return 'project';
  return 'unified';
}

function normalizePriority(p) {
  const map = { '紧急': 'urgent', urgent: 'urgent', '高': 'urgent', '重要': 'important', important: 'important', '中': 'important', '普通': 'normal', normal: 'normal', '低': 'normal' };
  return map[p] || 'normal';
}

function normalizeTaskType(t) {
  if (!t) return 'normal';
  return (t === '临时' || t === 'temp') ? 'temp' : 'normal';
}

function getUnifiedTaskLevels(row) {
  const levels = [row.level1, row.level2, row.level3, row.level4].filter(Boolean);
  if (row.taskTitle) {
    if (levels.length === 0) return [row.taskTitle];
    if (levels[levels.length - 1] !== row.taskTitle) levels.push(row.taskTitle);
  }
  return levels;
}

function validateUnifiedRow(row, projectCache) {
  const levels = getUnifiedTaskLevels(row);
  if (!row.projectName) return { valid: false, reason: '缺少项目名称' };
  if (levels.length === 0) return { valid: false, reason: '缺少任务层级' };
  if (!row.assignee) return { valid: false, reason: '缺少负责人' };
  const existing = projectCache[row.projectName] || projects.find(p => p.name === row.projectName);
  if (!existing && (!row.dept || !row.manager)) return { valid: false, reason: '新项目需填部门和负责人' };
  return { valid: true, levels };
}

function getOrCreateProject(row, cache) {
  if (cache[row.projectName]) return cache[row.projectName];
  let project = projects.find(p => p.name === row.projectName);
  if (!project) {
    project = {
      id: genId('PRJ'),
      name: row.projectName,
      desc: row.projectDesc || '',
      dept: row.dept,
      manager: row.manager,
      status: 'active',
      startDate: row.startDate || new Date().toISOString().split('T')[0],
      endDate: row.endDate || '',
      archived: false,
      creator: currentUser.name,
      createdAt: getNowCreatedAt(),
    };
    projects.push(project);
  } else {
    // 同名已存在时仍挂到该项目；用导入行补全空描述/日期，避免旧脏数据导致「导了却像没变」
    if (row.projectDesc && !project.desc) project.desc = row.projectDesc;
    if (row.dept && !project.dept) project.dept = row.dept;
    if (row.manager && !project.manager) project.manager = row.manager;
    if (row.startDate) project.startDate = row.startDate;
    if (row.endDate) project.endDate = row.endDate;
  }
  cache[row.projectName] = project;
  return project;
}

function findTaskByParent(projectId, parentId, title) {
  return tasks.find(t => t.projectId === projectId && t.parentId === parentId && t.title === title);
}

function ensureTaskPath(projectId, levels, taskMap, row) {
  let parentId = null;
  // 仅一级时：一级作里程碑，并在其下生成同名任务承载工时/负责人
  const workLevels = levels.length === 1 ? [levels[0], levels[0]] : levels;
  for (let i = 0; i < workLevels.length; i++) {
    const isMilestoneLevel = i === 0;
    const pathKey = projectId + '::' + workLevels.slice(0, i + 1).join(' / ') + (levels.length === 1 && i === 1 ? '::work' : '');
    if (taskMap[pathKey]) {
      parentId = taskMap[pathKey];
      continue;
    }
    const existing = findTaskByParent(projectId, parentId, workLevels[i]);
    if (existing && !(levels.length === 1 && i === 1 && isMilestoneTask(existing))) {
      if (isMilestoneLevel) existing.isMilestone = true;
      if (i === workLevels.length - 1 && !isMilestoneTask(existing)) finalizeImportedTask(existing, row);
      taskMap[pathKey] = existing.id;
      parentId = existing.id;
      continue;
    }
    const isLast = i === workLevels.length - 1;
    const assignee = isLast ? row.assignee : (row.assignee || row.manager || currentUser.name);
    const task = {
      id: genId('T'),
      projectId,
      parentId,
      title: workLevels[i],
      desc: isLast && !isMilestoneLevel ? (row.taskDesc || row.desc || '') : '',
      assignee,
      collaboratorEntries: [],
      creator: currentUser.name,
      status: 'todo',
      priority: 'normal',
      type: 'normal',
      isMilestone: isMilestoneLevel,
      dueDate: '',
      progress: 0,
      estimatedHours: 0,
      actualHours: 0,
      planStartDate: null,
      actualStartDate: null,
      actualEndDate: null,
      createdAt: getNowCreatedAt(),
    };
    if (isLast && !isMilestoneLevel) finalizeImportedTask(task, row);
    tasks.push(task);
    taskMap[pathKey] = task.id;
    parentId = task.id;
  }
}

function renderImport() {
  const importType = state.importType || 'unified';
  const importData = state.importData || [];
  const importStatus = state.importStatus || 'idle'; // idle, preview, importing, done
  const importResult = state.importResult || null;

  return `
    <div>
      <div style="margin-bottom:24px;">
        <h2 style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:8px;">数据导入</h2>
        <p style="font-size:13px;color:#6B7280;">推荐使用「一键导入」：上传一个文件，系统自动创建项目、主任务和子任务层级，无需分步导入或手动填写项目ID。</p>
      </div>

      ${isFullAccess(currentUser.role) ? `
      <div class="panel" style="margin-bottom:20px;border-color:#FDE68A;">
        <div class="panel-header">
          <span class="panel-title"><i class="fas fa-database" style="color:#D97706;"></i>全公司项目数据补全</span>
        </div>
        <div class="panel-body">
          <p style="font-size:13px;color:#6B7280;margin-bottom:12px;line-height:1.6;">
            若执行人员「项目管理」仅显示少量项目，通常是服务端库缺失历史项目。点击下方按钮，将系统内置的 <strong>${getViewableProjects().length >= 18 ? '18' : '全量'}</strong> 个项目种子<strong>补缺</strong>进服务端（不覆盖已有项目与任务）。
          </p>
          <button class="btn btn-primary" onclick="mergeSeedFromServer()" style="background:#D97706;border-color:#D97706;">
            <i class="fas fa-plus-circle"></i> 补全缺失项目数据
          </button>
        </div>
      </div>

      <div class="panel" style="margin-bottom:20px;border-color:#BFDBFE;">
        <div class="panel-header">
          <span class="panel-title"><i class="fas fa-paperclip" style="color:#2563EB;"></i>任务附件同步到项目文档</span>
        </div>
        <div class="panel-body">
          <p style="font-size:13px;color:#6B7280;margin-bottom:12px;line-height:1.6;">
            任务附件会在上传后<strong>自动同步</strong>到所属项目的「项目文档」。若历史数据未显示，可点击下方按钮手动补同步一次（可重复执行）。
          </p>
          <button class="btn btn-primary" onclick="syncTaskAttachmentsFromServer()" style="background:#2563EB;border-color:#2563EB;">
            <i class="fas fa-sync-alt"></i> 同步已有任务附件
          </button>
        </div>
      </div>
      ` : ''}

      <!-- 导入类型选择 -->
      <div class="panel" style="margin-bottom:20px;">
        <div class="panel-header">
          <span class="panel-title"><i class="fas fa-file-import" style="color:#10B981;"></i>选择导入类型</span>
        </div>
        <div class="panel-body">
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div onclick="state.importType='unified';state.importData=[];state.importStatus='idle';state.importResult=null;render()" style="flex:1;min-width:200px;padding:20px;border-radius:12px;border:2px solid ${importType === 'unified' ? '#10B981' : '#E5E7EB'};background:${importType === 'unified' ? '#ECFDF5' : '#fff'};cursor:pointer;text-align:center;transition:all 0.2s;position:relative;">
              ${importType === 'unified' ? '<span style="position:absolute;top:8px;right:8px;background:#10B981;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;">推荐</span>' : ''}
              <i class="fas fa-magic" style="font-size:32px;color:${importType === 'unified' ? '#10B981' : '#9CA3AF'};margin-bottom:8px;"></i>
              <div style="font-size:15px;font-weight:600;color:${importType === 'unified' ? '#10B981' : '#374151'};">一键导入</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:4px;">自动识别项目与任务层级</div>
            </div>
            <div onclick="state.importType='project';state.importData=[];state.importStatus='idle';state.importResult=null;render()" style="flex:1;min-width:200px;padding:20px;border-radius:12px;border:2px solid ${importType === 'project' ? '#10B981' : '#E5E7EB'};background:${importType === 'project' ? '#ECFDF5' : '#fff'};cursor:pointer;text-align:center;transition:all 0.2s;">
              <i class="fas fa-folder-open" style="font-size:32px;color:${importType === 'project' ? '#10B981' : '#9CA3AF'};margin-bottom:8px;"></i>
              <div style="font-size:15px;font-weight:600;color:${importType === 'project' ? '#10B981' : '#374151'};">仅导入项目</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:4px;">只创建项目，不含任务</div>
            </div>
            <div onclick="state.importType='task';state.importData=[];state.importStatus='idle';state.importResult=null;render()" style="flex:1;min-width:200px;padding:20px;border-radius:12px;border:2px solid ${importType === 'task' ? '#10B981' : '#E5E7EB'};background:${importType === 'task' ? '#ECFDF5' : '#fff'};cursor:pointer;text-align:center;transition:all 0.2s;">
              <i class="fas fa-tasks" style="font-size:32px;color:${importType === 'task' ? '#10B981' : '#9CA3AF'};margin-bottom:8px;"></i>
              <div style="font-size:15px;font-weight:600;color:${importType === 'task' ? '#10B981' : '#374151'};">仅导入任务</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:4px;">项目须已存在</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作区域 -->
      <div class="panel" style="margin-bottom:20px;">
        <div class="panel-header">
          <span class="panel-title"><i class="fas fa-upload" style="color:#2563EB;"></i>上传文件</span>
        </div>
        <div class="panel-body">
          <div style="display:flex;gap:16px;align-items:flex-start;">
            <div style="flex:1;">
              <div style="border:2px dashed #D1D5DB;border-radius:12px;padding:40px;text-align:center;background:var(--bg-muted);cursor:pointer;" onclick="document.getElementById('importFile').click()">
                <i class="fas fa-cloud-upload-alt" style="font-size:48px;color:#D1D5DB;margin-bottom:16px;"></i>
                <div style="font-size:15px;color:var(--text);margin-bottom:8px;">点击或拖拽文件到此处上传</div>
                <div style="font-size:13px;color:#9CA3AF;">支持 .xlsx, .xls, .csv 格式</div>
                <input type="file" id="importFile" accept=".xlsx,.xls,.csv" style="display:none;" onchange="handleImportFile(event)">
              </div>
            </div>
            <div style="width:280px;">
              <div style="padding:16px;background:var(--bg-muted);border-radius:12px;margin-bottom:12px;">
                <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">导入说明</div>
                <ul style="font-size:12px;color:#6B7280;line-height:1.8;padding-left:16px;">
                  ${importType === 'unified' ? `
                  <li>每行一条任务，填写「项目名称」和「一级/二级/三级/四级任务」列即可</li>
                  <li>末级任务请填写「计划开始日期」「预计工时」；截止日期可留空（系统按工作日历自动推算）</li>
                  <li>协助人填姓名，多人用逗号分隔；优先级填：紧急/重要/普通；任务类型填：常规/临时</li>
                  <li>系统自动创建项目、主任务、子任务层级</li>
                  <li>同一项目多行时，部门/负责人可只在首行填写</li>
                  <li>已存在的同名项目/任务会自动跳过，不会重复创建</li>
                  ` : importType === 'project' ? `
                  <li>请先下载模板，按格式填写项目数据</li>
                  <li>项目名称不可与已有项目重复</li>
                  ` : `
                  <li>项目须已存在于系统中（「所属项目」填项目名称或项目编号均可）</li>
                  <li>上级任务填任务名称；协助人、计划开始日期、任务类型见模板说明</li>
                  `}
                  <li>支持直接上传 .xlsx / .xls / .csv，无需另存转换</li>
                </ul>
              </div>
              <button class="btn btn-ghost" style="width:100%;" onclick="downloadTemplate()">
                <i class="fas fa-download"></i>下载${importType === 'unified' ? '一键导入' : importType === 'project' ? '项目' : '任务'}模板
              </button>
            </div>
          </div>
        </div>
      </div>

      ${importData.length > 0 ? `
      <!-- 数据预览 -->
      <div class="panel" style="margin-bottom:20px;">
        <div class="panel-header">
          <span class="panel-title"><i class="fas fa-eye" style="color:#10B981;"></i>数据预览</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-ghost btn-sm" onclick="state.importData=[];state.importStatus='idle';render()"><i class="fas fa-times"></i>取消</button>
            <button class="btn btn-primary btn-sm" onclick="executeImport()"><i class="fas fa-check"></i>确认导入 (${importData.length}条)</button>
          </div>
        </div>
        <div class="panel-body" style="padding:0;overflow-x:auto;">
          ${importType === 'unified' ? renderUnifiedImportPreview(importData) : importType === 'project' ? renderProjectImportPreview(importData) : renderTaskImportPreview(importData)}
        </div>
      </div>
      ` : ''}

      ${importResult ? `
      <!-- 导入结果 -->
      <div class="panel">
        <div class="panel-header" style="background:${importResult.success ? 'linear-gradient(90deg, #059669, #047857)' : 'linear-gradient(90deg, #DC2626, #B91C1C)'};">
          <span class="panel-title"><i class="fas ${importResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>${importResult.success ? '导入成功' : '导入失败'}</span>
        </div>
        <div class="panel-body">
          <div style="padding:16px;background:${importResult.success ? '#F0FDF4' : '#FEF2F2'};border-radius:8px;">
            <p style="color:${importResult.success ? '#166534' : '#991B1B'};">
              ${importResult.message}
            </p>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// 项目导入预览表格
function renderProjectImportPreview(data) {
  return `
    <table style="width:100%;border-collapse:collapse;min-width:800px;">
      <thead>
        <tr style="background:var(--bg-muted);border-bottom:2px solid #E5E7EB;">
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">项目名称 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">项目描述</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">所属部门 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">负责人 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">开始日期</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">结束日期</th>
          <th style="padding:12px 16px;text-align:center;font-size:12px;font-weight:600;color:#6B7280;">状态</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((row, index) => {
          const isValid = (row.name || row.projectName) && row.dept && row.manager;
          const displayName = row.name || row.projectName;
          return `
            <tr style="border-bottom:1px solid #F3F4F6;${!isValid ? 'background:#FEF2F2;' : ''}">
              <td style="padding:12px 16px;font-size:13px;">${displayName || '<span style="color:#DC2626;">必填</span>'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.desc || '-'}</td>
              <td style="padding:12px 16px;font-size:13px;">${row.dept || '<span style="color:#DC2626;">必填</span>'}</td>
              <td style="padding:12px 16px;font-size:13px;">${row.manager || '<span style="color:#DC2626;">必填</span>'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.startDate || '-'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.endDate || '-'}</td>
              <td style="padding:12px 16px;text-align:center;">
                <span style="color:${isValid ? '#059669' : '#DC2626'};">${isValid ? '✓ 有效' : '✗ 无效'}</span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// 一键导入预览表格
function renderUnifiedImportPreview(data) {
  const projectCache = {};
  return `
    <table style="width:100%;border-collapse:collapse;min-width:1100px;">
      <thead>
        <tr style="background:var(--bg-muted);border-bottom:2px solid #E5E7EB;">
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">项目名称 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">任务路径</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">负责人 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">部门/项目经理</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">优先级</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">工时</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">计划开始</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">截止日期</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">协助人</th>
          <th style="padding:12px 16px;text-align:center;font-size:12px;font-weight:600;color:#6B7280;">校验</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(row => {
          const v = validateUnifiedRow(row, projectCache);
          const path = v.levels ? v.levels.join(' → ') : '-';
          const projExists = projects.some(p => p.name === row.projectName);
          return `
            <tr style="border-bottom:1px solid #F3F4F6;${!v.valid ? 'background:#FEF2F2;' : ''}">
              <td style="padding:12px 16px;font-size:13px;">${row.projectName || '<span style="color:#DC2626;">必填</span>'}${projExists ? ' <span style="color:#6B7280;font-size:11px;">(已有)</span>' : ' <span style="color:#10B981;font-size:11px;">(新建)</span>'}</td>
              <td style="padding:12px 16px;font-size:13px;color:var(--text);">${path}</td>
              <td style="padding:12px 16px;font-size:13px;">${row.assignee || '<span style="color:#DC2626;">必填</span>'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.dept || '-'} / ${row.manager || '-'}</td>
              <td style="padding:12px 16px;font-size:13px;">${row.priority || '普通'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.estimatedHours || '-'}h</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.planStartDate || '-'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.dueDate || '自动推算'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.collaboratorsRaw || '-'}</td>
              <td style="padding:12px 16px;text-align:center;">
                <span style="color:${v.valid ? '#059669' : '#DC2626'};" title="${v.reason || ''}">${v.valid ? '✓ 有效' : '✗ ' + v.reason}</span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// 任务导入预览表格
function renderTaskImportPreview(data) {
  return `
    <table style="width:100%;border-collapse:collapse;min-width:1000px;">
      <thead>
        <tr style="background:var(--bg-muted);border-bottom:2px solid #E5E7EB;">
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">任务标题 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">所属项目 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">上级任务</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">负责人 *</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">协助人</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">优先级</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">工时</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">计划开始</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">截止日期</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;">类型</th>
          <th style="padding:12px 16px;text-align:center;font-size:12px;font-weight:600;color:#6B7280;">状态</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((row, index) => {
          const projectRef = row.projectId || row.projectName;
          const projectOk = projectRef && projects.some(p => p.id === projectRef || p.name === projectRef);
          const isValid = (row.title || row.taskTitle) && projectRef && row.assignee && projectOk;
          return `
            <tr style="border-bottom:1px solid #F3F4F6;${!isValid ? 'background:#FEF2F2;' : ''}">
              <td style="padding:12px 16px;font-size:13px;">${row.title || row.taskTitle || '<span style="color:#DC2626;">必填</span>'}</td>
              <td style="padding:12px 16px;font-size:13px;">${projectRef || '<span style="color:#DC2626;">必填</span>'}${projectRef && !projectOk ? ' <span style="color:#DC2626;font-size:11px;">(不存在)</span>' : ''}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.parentId || '主任务'}</td>
              <td style="padding:12px 16px;font-size:13px;">${row.assignee || '<span style="color:#DC2626;">必填</span>'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.collaboratorsRaw || '-'}</td>
              <td style="padding:12px 16px;font-size:13px;">${row.priority || '普通'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.estimatedHours || '-'}h</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.planStartDate || '-'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.dueDate || '自动推算'}</td>
              <td style="padding:12px 16px;font-size:13px;color:#6B7280;">${row.taskType || '常规'}</td>
              <td style="padding:12px 16px;text-align:center;">
                <span style="color:${isValid ? '#059669' : '#DC2626'};">${isValid ? '✓ 有效' : '✗ 无效'}</span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// 处理文件上传
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        processImportRows(parseCSV(e.target.result).map(normalizeImportRow));
      } catch (error) {
        alert('CSV 解析失败：' + error.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    try {
      await ensureXlsxLoaded();
    } catch (e) {
      alert('Excel 解析库加载失败，请检查网络后重试');
      return;
    }
    if (typeof XLSX === 'undefined') {
      alert('Excel 解析库未加载，请检查网络连接后重试');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        processImportRows(parseExcel(e.target.result));
      } catch (error) {
        alert('Excel 解析失败：' + error.message);
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('不支持的文件格式，请上传 .xlsx、.xls 或 .csv 文件');
  }
}

function processImportRows(rows) {
  const data = rows.filter(row => Object.values(row).some(v => String(v || '').trim()));
  if (!data.length) {
    alert('文件中没有有效数据，请检查表头和内容行');
    return;
  }
  state.importData = data;
  state.importType = detectImportType(data);
  state.importStatus = 'preview';
  state.importResult = null;
  render();
}

// 解析 Excel
function parseExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const preferred = ['统一导入', '导入', 'Sheet1'];
  const sheetName = preferred.find(n => workbook.SheetNames.includes(n)) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return json.map(row => {
    const raw = {};
    Object.keys(row).forEach(k => {
      raw[k.trim().replace(/^\uFEFF/, '')] = String(row[k] ?? '').trim();
    });
    return normalizeImportRow(raw);
  });
}

// 解析CSV
function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }

  return data;
}

// 执行导入
function executeImport() {
  const importType = state.importType || 'unified';

  if (importType === 'unified') {
    const validData = state.importData.filter(row => validateUnifiedRow(row, {}).valid);
    if (validData.length === 0) {
      alert('没有有效的数据可导入，请检查项目名称、任务层级和负责人是否填写完整');
      return;
    }
    const projectNames = [...new Set(validData.map(r => r.projectName))];
    if (!confirm(`确定一键导入？\n\n• ${validData.length} 条任务\n• ${projectNames.length} 个项目\n\n系统将自动创建项目并建立任务层级。`)) return;

    const projectsBefore = projects.length;
    const tasksBefore = tasks.length;
    const projectCache = {};
    const taskMap = {};
    let successCount = 0;
    let failCount = 0;

    validData.forEach(row => {
      try {
        const v = validateUnifiedRow(row, projectCache);
        if (!v.valid) { failCount++; return; }
        const project = getOrCreateProject(row, projectCache);
        ensureTaskPath(project.id, v.levels, taskMap, row);
        successCount++;
      } catch (e) {
        failCount++;
      }
    });

    const projectCreated = projects.length - projectsBefore;
    const taskCreated = tasks.length - tasksBefore;

    save();
    state.importResult = {
      success: failCount === 0,
      message: `导入完成！成功 ${successCount} 条任务，新建 ${projectCreated} 个项目、${taskCreated} 个任务节点${failCount > 0 ? '，失败 ' + failCount + ' 条' : ''}`
    };
    state.importData = [];
    state.importStatus = 'done';
    render();
    return;
  }

  const validData = state.importData.filter(row => {
    if (importType === 'project') {
      return (row.name || row.projectName) && row.dept && (row.manager || row.assignee);
    } else {
      const projectRef = row.projectId || row.projectName;
      return (row.title || row.taskTitle) && projectRef && row.assignee
        && projects.some(p => p.id === projectRef || p.name === projectRef);
    }
  });

  if (validData.length === 0) {
    alert('没有有效的数据可导入');
    return;
  }

  if (!confirm(`确定导入 ${validData.length} 条数据？`)) return;

  let successCount = 0;
  let failCount = 0;

  if (importType === 'project') {
    validData.forEach(row => {
      try {
        // 检查项目是否已存在
        const existing = projects.find(p => p.name === (row.name || row.projectName));
        if (existing) {
          failCount++;
          return;
        }

        projects.push({
          id: genId('PRJ'),
          name: row.name || row.projectName,
          desc: row.desc || row.projectDesc || '',
          dept: row.dept,
          manager: row.manager || row.assignee,
          status: 'active',
          startDate: row.startDate || new Date().toISOString().split('T')[0],
          endDate: row.endDate || '',
          archived: false,
          creator: currentUser.name,
          createdAt: getNowCreatedAt(),
        });
        successCount++;
      } catch (e) {
        failCount++;
      }
    });
  } else {
    // 任务导入需要先生成项目ID映射
    const projectIdMap = {};
    validData.forEach(row => {
      const ref = row.projectId || row.projectName;
      if (ref && !projectIdMap[ref]) {
        const existingProject = projects.find(p => p.id === ref || p.name === ref);
        if (existingProject) projectIdMap[ref] = existingProject.id;
      }
    });

    validData.forEach(row => {
      try {
        const ref = row.projectId || row.projectName;
        const projectId = projectIdMap[ref];
        const project = projects.find(p => p.id === projectId);
        if (!project) {
          failCount++;
          return;
        }

        // 查找上级任务
        let parentId = null;
        if (row.parentId) {
          const parentTask = tasks.find(t =>
            (t.id === row.parentId || t.title === row.parentId) && t.projectId === projectId
          );
          parentId = parentTask ? parentTask.id : null;
        }

        const task = {
          id: genId('T'),
          type: 'normal',
          projectId,
          parentId,
          title: row.title || row.taskTitle,
          desc: row.desc || row.taskDesc || '',
          assignee: row.assignee,
          collaborators: [],
          creator: currentUser.name,
          status: 'todo',
          priority: 'normal',
          dueDate: '',
          progress: 0,
          estimatedHours: 0,
          actualHours: 0,
          planStartDate: null,
          actualStartDate: null,
          actualEndDate: null,
          createdAt: getNowCreatedAt(),
        };
        finalizeImportedTask(task, row);
        tasks.push(task);
        successCount++;
      } catch (e) {
        failCount++;
      }
    });
  }

  save();

  state.importResult = {
    success: failCount === 0,
    message: `导入完成！成功 ${successCount} 条，失败 ${failCount} 条`
  };
  state.importData = [];
  state.importStatus = 'done';
  render();
}

// 下载导入模板
function getTemplateData(importType) {
  if (importType === 'unified') {
    return {
      headers: ['项目名称', '所属部门', '项目负责人', '项目描述', '项目开始日期', '项目结束日期', '一级任务', '二级任务', '三级任务', '四级任务', '任务描述', '负责人', '协助人', '优先级', '预计工时', '计划开始日期', '截止日期', '任务类型'],
      rows: [
        ['项目管理系统1.0版本上线', '实施交付部', '王元斌', '内部项目管控系统', '2026-06-01', '2026-12-31', '需求整理收集', '', '', '梳理需求范围', '王元斌', '', '重要', '16', '2026-06-01', '', '常规'],
        ['项目管理系统1.0版本上线', '实施交付部', '王元斌', '', '', '', 'UI模板设计', '', '', '设计界面模板', '王元斌', '章志红', '重要', '24', '2026-06-16', '', '常规'],
        ['项目管理系统1.0版本上线', '实施交付部', '王元斌', '', '', '', '主方案自研系统开发', '', '', '核心功能开发', '王元斌', '', '紧急', '50', '2026-06-17', '', '常规'],
        ['项目管理系统1.0版本上线', '实施交付部', '王元斌', '', '', '', '主方案自研系统开发', '功能测试验证', '', '测试验证', '王元斌', '', '重要', '16', '2026-07-01', '', '常规'],
        ['MES点检表1.0版本上线', '实施交付部', '王元斌', 'MES点检模块', '2026-06-01', '2026-09-30', '需求调研', '', '', '现场调研', '朱贵乔', '', '普通', '8', '2026-06-10', '', '常规'],
        ['MES点检表1.0版本上线', '实施交付部', '王元斌', '', '', '', '临时支持', '', '', '客户临时需求', '王元斌', '', '紧急', '4', '2026-06-20', '2026-06-20', '临时'],
      ],
      filename: 'unified_import_template',
    };
  }
  if (importType === 'project') {
    return {
      headers: ['项目名称', '项目描述', '所属部门', '项目负责人', '开始日期', '结束日期'],
      rows: [['示例项目', '这是一个示例项目', '实施交付部', '王元斌', '2026-06-01', '2026-12-31']],
      filename: 'project_import_template',
    };
  }
  return {
    headers: ['任务标题', '任务描述', '所属项目', '上级任务', '负责人', '协助人', '优先级', '预计工时', '计划开始日期', '截止日期', '任务类型'],
    rows: [
      ['需求整理收集', '梳理需求范围', '项目管理系统1.0版本上线', '', '王元斌', '', '重要', '16', '2026-06-01', '', '常规'],
      ['功能测试验证', '测试验证', '项目管理系统1.0版本上线', '主方案自研系统开发', '王元斌', '章志红', '重要', '16', '2026-07-01', '', '常规'],
    ],
    filename: 'task_import_template',
  };
}

async function downloadTemplate() {
  const importType = state.importType || 'unified';
  const tpl = getTemplateData(importType);

  try {
    await ensureXlsxLoaded();
  } catch (e) {
    console.warn('[导入模板]', e);
  }

  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.aoa_to_sheet([tpl.headers, ...tpl.rows]);
    ws['!cols'] = tpl.headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '导入模板');
    XLSX.writeFile(wb, `${tpl.filename}.xlsx`);
    return;
  }

  const csvContent = [tpl.headers.join(','), ...tpl.rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${tpl.filename}.csv`;
  link.click();
}

const KpiPlanService = {
  async load(yearMonth) {
    if (!ApiConfig.enabled || !authSession.token || !canAccessKpiPlans()) return false;
    const ym = yearMonth || state.kpiYearMonth || currentKpiYearMonth();
    state.kpiPlansLoading = true;
    state.kpiYearMonth = ym;
    try {
      const res = await fetch(ApiConfig.baseUrl + '/kpi-plans?yearMonth=' + encodeURIComponent(ym), {
        headers: { ...AuthService.getAuthHeaders() },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || '加载失败');
      const payload = data.data || {};
      state.kpiPlans = payload.plans || [];
      state.kpiMonthOptions = payload.monthOptions || [ym];
      state.kpiCanViewAll = !!payload.canViewAll;
      state.kpiMembers = payload.members || [];
      state.kpiDepts = payload.depts || [];
      state.kpiFirstBootstrapMonth = payload.firstBootstrapMonth || '2026-08';
      state.kpiFirstBootstrapMonthPmo = payload.firstBootstrapMonthPmo || '2026-09';
      if (!state._kpiAssigneeTouched) {
        state.kpiAssigneeFilter = getDefaultKpiAssigneeFilter();
      }
      if (!state.kpiDeptFilter) state.kpiDeptFilter = 'all';
      render();
      return true;
    } catch (e) {
      console.warn('[KPI]', e);
      alert(e.message || 'KPI 计划加载失败');
      return false;
    } finally {
      state.kpiPlansLoading = false;
    }
  },
};

const SystemUpdateService = {
  async loadAll() {
    if (!ApiConfig.enabled || !authSession.token) return [];
    try {
      const res = await fetch(ApiConfig.baseUrl + '/system-updates', {
        headers: AuthService.getAuthHeaders(),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await res.json();
      if (!data.success) return [];
      state.systemUpdatesList = data.updates || [];
      return state.systemUpdatesList;
    } catch (e) {
      console.warn('[更新] 加载记录失败', e);
      return [];
    }
  },

  async checkPending() {
    if (!ApiConfig.enabled || !authSession.token) return;
    try {
      const res = await fetch(ApiConfig.baseUrl + '/system-updates/pending', {
        headers: AuthService.getAuthHeaders(),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await res.json();
      if (!data.success || data.initialized || !data.pending?.length) return;
      state.pendingSystemUpdates = data.pending;
      state.showModal = 'systemUpdate';
    } catch (e) {
      console.warn('[更新] 检查待展示更新失败', e);
    }
  },

  async markRead(version) {
    if (!ApiConfig.enabled || !authSession.token) return false;
    try {
      const res = await fetch(ApiConfig.baseUrl + '/system-updates/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
        body: JSON.stringify({ version: version || null }),
        signal: AbortSignal.timeout(ApiConfig.timeout),
      });
      const data = await res.json();
      return !!data.success;
    } catch (e) {
      console.warn('[更新] 标记已读失败', e);
      return false;
    }
  },
};

/** SSE 实时变更：写路径广播后 soft-pull；断线时回退 LiveRefresh 轮询 */
const RealtimeService = {
  _es: null,
  _connected: false,
  _retryMs: 1000,
  _retryTimer: null,
  _lastRev: 0,
  _busy: false,

  isConnected() {
    return this._connected;
  },

  ensure() {
    if (!ApiConfig.enabled || !authSession.token) return;
    if (this._es && this._connected) return;
    this.connect();
  },

  stop() {
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
    if (this._es) {
      try { this._es.close(); } catch (e) { /* ignore */ }
      this._es = null;
    }
    this._connected = false;
    if (typeof LiveRefresh !== 'undefined') {
      LiveRefresh.setIntervalMs(LiveRefresh.FALLBACK_MS);
    }
  },

  connect() {
    if (!ApiConfig.enabled || !authSession.token || typeof EventSource === 'undefined') return;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
    if (this._es) {
      try { this._es.close(); } catch (e) { /* ignore */ }
      this._es = null;
    }
    this._connected = false;
    const url = ApiConfig.baseUrl + '/realtime/events?token=' + encodeURIComponent(authSession.token);
    let es;
    try {
      es = new EventSource(url);
    } catch (e) {
      console.warn('[实时] EventSource 不可用', e);
      if (typeof LiveRefresh !== 'undefined') LiveRefresh.setIntervalMs(LiveRefresh.FALLBACK_MS);
      return;
    }
    this._es = es;
    es.addEventListener('hello', (ev) => {
      try {
        const data = JSON.parse(ev.data || '{}');
        if (data.rev != null) this._lastRev = Number(data.rev) || this._lastRev;
      } catch (e) { /* ignore */ }
    });
    es.addEventListener('change', (ev) => {
      try {
        const data = JSON.parse(ev.data || '{}');
        this.onChange(data);
      } catch (e) {
        console.warn('[实时] 事件解析失败', e);
      }
    });
    es.onopen = () => {
      this._connected = true;
      this._retryMs = 1000;
      if (typeof LiveRefresh !== 'undefined') LiveRefresh.setIntervalMs(LiveRefresh.SSE_OK_MS);
      console.log('[实时] SSE 已连接');
    };
    es.onerror = () => {
      this._connected = false;
      if (typeof LiveRefresh !== 'undefined') LiveRefresh.setIntervalMs(LiveRefresh.FALLBACK_MS);
      try { es.close(); } catch (e) { /* ignore */ }
      if (this._es === es) this._es = null;
      clearTimeout(this._retryTimer);
      const wait = this._retryMs;
      this._retryMs = Math.min(30000, this._retryMs * 2);
      this._retryTimer = setTimeout(() => {
        if (ApiConfig.enabled && authSession.token) this.connect();
      }, wait);
    };
  },

  focusedTaskId() {
    if (state.showModal === 'taskDetail' && state.form?.taskId) return state.form.taskId;
    return null;
  },

  focusedProjectId() {
    if (state.page === 'projectDetail' && state.form?.projectId) return state.form.projectId;
    return null;
  },

  concernsFocus(data) {
    if (!data) return false;
    const ids = new Set((data.entityIds || []).map(String));
    (data.taskIds || []).forEach(id => ids.add(String(id)));
    (data.projectIds || []).forEach(id => ids.add(String(id)));
    const taskId = this.focusedTaskId();
    const projectId = this.focusedProjectId();
    if (taskId && ids.has(String(taskId))) return true;
    if (projectId && ids.has(String(projectId))) return true;
    if (data.entityType === 'store' || data.type === 'data.sync') return true;
    if (!ids.size && String(data.type || '').startsWith('task.')) return !!taskId;
    if (!ids.size && String(data.type || '').startsWith('project.')) return !!projectId;
    return false;
  },

  async onChange(data) {
    if (!data) return;
    if (data.rev != null) {
      const rev = Number(data.rev);
      if (!Number.isNaN(rev)) {
        if (rev <= this._lastRev) return;
        this._lastRev = rev;
      }
    }

    const isSelf = data.actorId && currentUser && String(data.actorId) === String(currentUser.id);

    if (data.type === 'inbox.updated') {
      const userIds = data.userIds || [];
      if (userIds.length && currentUser && !userIds.map(String).includes(String(currentUser.id))) {
        return;
      }
      await LiveRefresh.handleInboxEvent();
      return;
    }

    if (isSelf && !this.concernsFocus(data)) return;

    await LiveRefresh.pullOnEvent(data, { fromSelf: isSelf });
  },
};

/** 周期刷新消息角标；SSE 正常时拉长间隔作兜底，并同步服务端任务 */
const LiveRefresh = {
  _timer: null,
  _busy: false,
  FALLBACK_MS: 30 * 1000,
  SSE_OK_MS: 90 * 1000,
  intervalMs: 30 * 1000,

  ensure() {
    if (this._timer) return;
    this._timer = setInterval(() => this.tick(), this.intervalMs);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.tick();
        if (!RealtimeService.isConnected()) RealtimeService.ensure();
      }
    });
  },

  setIntervalMs(ms) {
    const next = Math.max(10000, Number(ms) || this.FALLBACK_MS);
    if (next === this.intervalMs && this._timer) return;
    this.intervalMs = next;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = setInterval(() => this.tick(), this.intervalMs);
    }
  },

  /** 轻量指纹：含附件/留言/进度，避免贴图后判无变化 */
  tasksFingerprint() {
    return (tasks || []).map(t => {
      const atts = (t.attachments || []).map(a => a.fileId || a.id || '').join(',');
      const comments = t.comments || [];
      const lastC = comments.length
        ? `${comments.length}|${comments[comments.length - 1]?.createdAt || ''}|${(comments[comments.length - 1]?.attachments || []).length}`
        : '0';
      return `${t.id}|${t.status || ''}|${t.assignee || ''}|${t.progress ?? ''}|${t.actualEndDate || ''}|${t.createdAt || ''}|${t.updatedAt || ''}|${atts}|${lastC}`;
    }).join(';');
  },

  projectsFingerprint() {
    return (projects || []).map(p => {
      const docs = (p.documents || []).map(d => d.fileId || d.id || '').join(',');
      const team = (p.teamMembers || []).join(',');
      const focus = getProjectFocusFields(p);
      return [
        p.id,
        p.name || '',
        p.status || '',
        p.archived ? 1 : 0,
        p.manager || '',
        team,
        docs,
        focus.currentPhase,
        focus.nextPlan,
        focus.blocker,
        p.objective || '',
        p.value || '',
        p.scope || '',
        p.outOfScope || '',
        p.endDate || '',
        p.planVerified ? 1 : 0,
      ].join('|');
    }).join(';');
  },

  changeLogsFingerprint() {
    const list = changeLogs || [];
    const head = list.slice(0, 8).map(l => `${l.id || ''}:${l.after || ''}`).join(',');
    return `${list.length}|${head}`;
  },

  dataFingerprint() {
    return this.tasksFingerprint() + '||' + this.projectsFingerprint() + '||' + this.changeLogsFingerprint();
  },

  /** 允许在任务详情只读查看时拉取；编辑弹窗中跳过以免冲掉表单 */
  canPullTasks() {
    const modal = state.showModal;
    if (state.taskEditInline || state.inlineDeliveryEditId) return false;
    if (modal && modal !== 'taskDetail') return false;
    if (DataService._syncing) return false;
    if (DataService._saveTimer) return false;
    return true;
  },

  preserveCommentDraftText() {
    const taskId = state.showModal === 'taskDetail' ? state.form?.taskId : null;
    if (!taskId) return;
    const ta = document.getElementById('taskCommentInput-' + taskId);
    if (ta) ensureCommentDraft(taskId).text = ta.value;
  },

  async pullTasksIfSafe() {
    if (!this.canPullTasks()) return false;
    const before = this.dataFingerprint();
    this.preserveCommentDraftText();
    const ok = await DataService.loadFromServer({
      beforeApply: () => this.canPullTasks(),
    });
    if (!ok) return false;
    return this.dataFingerprint() !== before;
  },

  async handleInboxEvent() {
    if (document.hidden || !ApiConfig.enabled || !authSession.token) return;
    const prevUnread = state.inboxUnreadCount;
    await InboxService.refresh();
    const unreadIncreased = state.inboxUnreadCount > prevUnread;
    if (unreadIncreased && this.canPullTasks()) {
      await this.pullTasksIfSafe();
    }
    if (!state.showModal || state.showModal === 'taskDetail') render();
  },

  async pullOnEvent(data) {
    if (this._busy || document.hidden || !ApiConfig.enabled || !authSession.token) return;
    if (!this.canPullTasks()) return;
    this._busy = true;
    try {
      const page = state.page;
      const focused = RealtimeService.concernsFocus(data)
        || page === 'dashboard'
        || page === 'tasks'
        || page === 'projects'
        || page === 'projectDetail'
        || state.showModal === 'taskDetail';

      let changed = false;
      if (focused) {
        changed = await this.pullTasksIfSafe();
      }

      const type = data?.type || '';
      if (type === 'task.comments' || type === 'task.fields' || type === 'data.sync' || type === 'task.attachments') {
        const prevUnread = state.inboxUnreadCount;
        if (typeof InboxService.refreshQuiet === 'function') await InboxService.refreshQuiet();
        else await InboxService.refresh();
        if (state.inboxUnreadCount !== prevUnread) changed = true;
      }

      if (changed && (!state.showModal || state.showModal === 'taskDetail')) {
        render();
      }
    } catch (e) {
      console.warn('[实时] 拉取失败', e);
    } finally {
      this._busy = false;
    }
  },

  async tick() {
    if (this._busy || document.hidden || !ApiConfig.enabled || !authSession.token) return;
    if (state.showModal && state.showModal !== 'taskDetail') return;
    const page = state.page;
    this._busy = true;
    try {
      const prevUnread = state.inboxUnreadCount;
      await InboxService.refresh();
      await syncMissingStaffInboxAlert();
      const unreadIncreased = state.inboxUnreadCount > prevUnread;
      const inboxChanged = state.inboxUnreadCount !== prevUnread || state.inboxOpen;

      const shouldPullTasks = unreadIncreased
        || page === 'dashboard'
        || page === 'tasks'
        || page === 'projects'
        || page === 'projectDetail'
        || state.showModal === 'taskDetail';
      let tasksChanged = false;
      if (shouldPullTasks) {
        tasksChanged = await this.pullTasksIfSafe();
      }

      if (page === 'systemUpdates') {
        const before = JSON.stringify(state.systemUpdatesList || []);
        await SystemUpdateService.loadAll();
        const after = JSON.stringify(state.systemUpdatesList || []);
        if ((before !== after || inboxChanged || tasksChanged) && state.page === 'systemUpdates' && (!state.showModal || state.showModal === 'taskDetail')) render();
      } else if ((inboxChanged || tasksChanged) && (!state.showModal || state.showModal === 'taskDetail')) {
        render();
      }
    } catch (e) {
      console.warn('[实时刷新] 失败', e);
    } finally {
      this._busy = false;
    }
  },
};

// 初始化：本地/服务端数据、钉钉登录、扫描推送、渲染页面
async function bootstrapApp() {
  try {
    load();
    await loadPublicConfig();
    if (ApiConfig.enabled && !authSession.token && AuthService.isDemoMode()) {
      await AuthService.loginDemo(currentUser.id);
    }
    await AuthService.init();
    if (ApiConfig.enabled && !authSession.token && AuthService.isDingTalkMode() && !AuthService.isDingTalkClient()) {
      state.authError = '当前不在钉钉客户端内。请从钉钉工作台打开「恒慧管」完成免登。';
    }
    if (ApiConfig.enabled && authSession.token) {
      // 登录路径已拉过 bootstrap 时跳过，避免首开双倍全量请求
      if (!DataService._serverReady) {
        await DataService.loadFromServer();
      }
      tryRecoverFromLocalStorage();
      LiveRefresh.ensure();
      RealtimeService.ensure();
    } else {
      InboxService.loadLocal();
    }
    try {
      await NotificationService.scanScheduledPushes();
      await syncMissingStaffInboxAlert();
    } catch (e) {
      console.warn('[启动] 推送/站内信扫描失败', e);
    }
    render();
    // 次要接口不挡首屏；完成后刷新一次以展示更新弹窗/站内信角标
    if (ApiConfig.enabled && authSession.token) {
      Promise.all([
        SystemUpdateService.checkPending(),
        InboxService.refresh(),
      ]).then(() => { render(); }).catch(() => {});
    }
  } catch (e) {
    console.error('[启动] 初始化失败', e);
    state.authError = (e && e.message) ? e.message : '页面初始化失败，请稍后重试或联系管理员';
    try { render(); } catch (renderErr) {
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = '<div style="padding:48px 24px;text-align:center;font-family:sans-serif;color:#991B1B;">加载失败：'
          + String((e && e.message) || renderErr || '未知错误')
          + '<br><button onclick="location.reload()" style="margin-top:16px;padding:8px 16px;">刷新重试</button></div>';
      }
    }
  }
}
bootstrapApp();
