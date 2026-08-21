/* 恒慧管分享演示 · 交互逻辑（样式对齐正式版） */
(function () {
  const ME = {
    id: 'U018',
    name: '王元斌 Martin',
    dept: '信息中心',
    role: 'admin',
    position: '管理员',
  };

  const priorityMap = {
    urgent: { label: '紧急', color: '#DC2626' },
    important: { label: '重要', color: '#D97706' },
    normal: { label: '普通', color: '#6B7280' },
  };

  function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function mkTask(o) {
    return Object.assign({
      progress: 0,
      hours: 0,
      type: 'normal',
      intake: false,
      submitter: '',
      system: '',
      desc: '',
      dueDate: addDays(3),
      collaborators: [],
      parentId: '',
      isMilestone: false,
    }, o);
  }

  const SEED = {
    projects: [
      {
        id: 'PRJ-SHARE1',
        name: 'AI 协作试点 · 恒慧管分享版',
        desc: '用 AI 做出部门可落地的项目管控，并接入钉钉表单提报。',
        dept: '信息中心',
        manager: '王元斌 Martin',
        status: 'active',
        startDate: addDays(-20),
        endDate: addDays(14),
        members: ['演示信息中心经理', '演示实施工程师', '演示运维工程师'],
      },
      {
        id: 'PRJ-SHARE2',
        name: '部门数字化看板优化',
        desc: '工作台待办、团队饱和度、会议室大屏联动。',
        dept: '信息中心',
        manager: '演示信息中心经理',
        status: 'active',
        startDate: addDays(-10),
        endDate: addDays(5),
        members: ['王元斌 Martin', '演示实施工程师', '演示研发工程师'],
      },
      {
        id: 'PRJ-SHARE3',
        name: '财务系统联调支持',
        desc: '对接财务中心提报的 NCC / 单据类事项。',
        dept: '信息中心',
        manager: '王元斌 Martin',
        status: 'active',
        startDate: addDays(-5),
        endDate: addDays(30),
        members: ['演示实施工程师', '演示研发工程师'],
      },
      {
        id: 'PRJ-SHARE4',
        name: '知识库迁移规划',
        desc: '历史文档结构化与检索方案评估。',
        dept: '信息中心',
        manager: '演示信息中心经理',
        status: 'planning',
        startDate: todayStr(),
        endDate: addDays(45),
        members: ['演示研发工程师'],
      },
      {
        id: 'PRJ-SHARE5',
        name: '旧版工单归档',
        desc: '历史工单只读归档，已阶段性暂停。',
        dept: '信息中心',
        manager: '演示运维工程师',
        status: 'paused',
        startDate: addDays(-40),
        endDate: addDays(60),
        members: ['演示运维工程师'],
      },
      {
        id: 'PRJ-SHARE6',
        name: '会议室预约一期',
        desc: '一期已上线并完成验收。',
        dept: '信息中心',
        manager: '王元斌 Martin',
        status: 'done',
        startDate: addDays(-90),
        endDate: addDays(-20),
        members: ['演示实施工程师', '演示运维工程师'],
      },
    ],
    tasks: [
      mkTask({ id: 'MS-SH1', title: '里程碑：演示脚本就绪', projectId: 'PRJ-SHARE1', assignee: ME.name, status: 'doing', priority: 'important', progress: 50, hours: 0, isMilestone: true, dueDate: addDays(3), desc: '分享演示脚本与表单链路验收。' }),
      mkTask({ id: 'T-SH01', title: '梳理演示脚本与脱敏数据', projectId: 'PRJ-SHARE1', parentId: 'MS-SH1', assignee: ME.name, status: 'doing', priority: 'important', progress: 60, hours: 8, dueDate: addDays(0), desc: '准备 5 分钟分享：钉钉登录 → 工作台 → 表单提报。' }),
      mkTask({ id: 'T-SH02', title: '验收钉钉 AI 表格进工作台', projectId: 'PRJ-SHARE1', parentId: 'MS-SH1', assignee: ME.name, status: 'todo', priority: 'urgent', hours: 4, dueDate: addDays(-1), desc: '表单提交后应出现在「我的待办」，带「表单提报」标签。' }),
      mkTask({ id: 'MS-SH2', title: '里程碑：试点上线验收', projectId: 'PRJ-SHARE1', assignee: '演示运维工程师', status: 'todo', priority: 'normal', progress: 100, hours: 0, isMilestone: true, dueDate: addDays(10), desc: '权限与上线验收。' }),
      mkTask({ id: 'T-SH05', title: '已完成样例：权限分级验收', projectId: 'PRJ-SHARE1', parentId: 'MS-SH2', assignee: '演示运维工程师', status: 'done', priority: 'normal', progress: 100, hours: 6, dueDate: addDays(-10) }),
      mkTask({ id: 'T-SH03', title: '团队饱和度本周样例', projectId: 'PRJ-SHARE2', assignee: '演示实施工程师', status: 'doing', priority: 'normal', progress: 30, hours: 16 }),
      mkTask({ id: 'T-SH04', title: '研发联调接口清单', projectId: 'PRJ-SHARE2', assignee: '演示研发工程师', status: 'todo', priority: 'important', hours: 12, dueDate: addDays(4) }),
      mkTask({ id: 'T-SH06', title: '会议室大屏滚动联调', projectId: 'PRJ-SHARE2', assignee: '演示运维工程师', status: 'doing', priority: 'normal', progress: 40, hours: 10 }),
      mkTask({ id: 'T-SH07', title: 'NCC 对账差异排查', projectId: 'PRJ-SHARE3', assignee: '演示实施工程师', status: 'todo', priority: 'urgent', hours: 8, dueDate: addDays(1) }),
      mkTask({ id: 'T-SH08', title: '单据模板权限开通', projectId: 'PRJ-SHARE3', assignee: '演示研发工程师', status: 'doing', priority: 'important', progress: 55, hours: 14 }),
      mkTask({ id: 'T-SH09', title: '暂停样例：历史工单迁移核对', projectId: 'PRJ-SHARE5', assignee: '演示运维工程师', status: 'paused', priority: 'normal', progress: 20, hours: 6, dueDate: addDays(20) }),
      mkTask({ id: 'T-INTAKE1', title: '【样例】NCC 单据打印异常', projectId: '', assignee: ME.name, status: 'todo', priority: 'important', type: 'temp', intake: true, submitter: '演示财务联系人', system: 'NCC', dueDate: addDays(0), desc: '财务反馈打印预览空白。' }),
      mkTask({ id: 'T-INTAKE2', title: '【样例】费用报销单无法提交', projectId: '', assignee: ME.name, status: 'todo', priority: 'urgent', type: 'temp', intake: true, submitter: '演示会计', system: 'NCC', dueDate: addDays(-1), desc: '提交时报「预算科目缺失」。' }),
      mkTask({ id: 'T-INTAKE3', title: '【样例】总账结账提示异常', projectId: '', assignee: '演示实施工程师', status: 'doing', priority: 'normal', progress: 20, hours: 4, type: 'temp', intake: true, submitter: '演示财务经理', system: '总账' }),
    ],
    members: [
      { id: 'U001', name: '演示总经理', dept: '信息中心', role: 'gm', hours: 6, std: 40 },
      { id: 'U002', name: '演示信息中心经理', dept: '信息中心', role: 'manager', hours: 28, std: 40 },
      { id: 'U018', name: '王元斌 Martin', dept: '信息中心', role: 'admin', hours: 32, std: 40 },
      { id: 'U101', name: '演示实施工程师', dept: '信息中心', role: 'staff', hours: 36, std: 40 },
      { id: 'U102', name: '演示运维工程师', dept: '信息中心', role: 'staff', hours: 18, std: 40 },
      { id: 'U103', name: '演示研发工程师', dept: '信息中心', role: 'staff', hours: 24, std: 40 },
    ],
    contacts: [
      { name: '演示财务经理', dept: '财务中心' },
      { name: '演示会计', dept: '财务中心' },
      { name: '演示财务联系人', dept: '财务中心' },
    ],
  };

  let state = {
    loggedIn: false,
    page: 'dashboard',
    todoViewMode: 'all',
    taskSearch: '',
    taskTab: 'all',
    taskScopeTab: 'mine',
    projectFilter: 'all',
    projectSearch: '',
    projectDept: 'all',
    projectManager: 'all',
    projectRiskFilter: 'all',
    projectSort: 'default',
    todoListTab: 'all',
    todoViewLayout: 'board',
    todoTypeFilter: 'all',
    todoPriorityFilter: 'all',
    todoDueFilter: 'all',
    todoPage: 1,
    todoPageSize: 20,
    teamSearch: '',
    teamSort: 'saturation_desc',
    settingsOpen: false,
    modal: null,
    form: null,
    detailTaskId: null,
    detailProjectId: null,
    prevPage: null,
    projectPlanFilter: 'all',
    returnToMemberName: null,
    projects: [],
    tasks: [],
    members: [],
    contacts: [],
    activities: [],
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function roleDisplayName(r) {
    return ({ gm: '总经理', admin: '管理员', manager: '部门经理', staff: '执行人员' })[r] || r;
  }
  function roleBadgeClass(r) {
    return ({ gm: 'role-gm', admin: 'role-admin', manager: 'role-manager', staff: 'role-staff' })[r] || 'role-staff';
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function resetData(silent) {
    state.projects = clone(SEED.projects);
    state.tasks = clone(SEED.tasks);
    state.members = clone(SEED.members);
    state.contacts = clone(SEED.contacts);
    state.activities = [
      { icon: 'fa-file-alt', text: '财务联系人提报「NCC 单据打印异常」', meta: '表单提报 · 刚刚' },
      { icon: 'fa-file-alt', text: '演示会计提报「费用报销单无法提交」', meta: '表单提报 · 今天' },
      { icon: 'fa-check', text: '演示运维工程师完成「权限分级验收」', meta: '项目任务 · 本周' },
    ];
    if (!silent && state.loggedIn) render();
    if (!silent) toast('演示数据已重置');
  }

  function projectName(id) {
    if (!id) return '临时任务';
    const p = state.projects.find(x => x.id === id);
    return p ? p.name : id;
  }

  function isOverdue(t) {
    if (!t.dueDate || t.status === 'done') return false;
    return t.dueDate < todayStr();
  }
  function isDueSoon(t) {
    if (!t.dueDate || t.status === 'done' || isOverdue(t)) return false;
    const d = new Date(t.dueDate + 'T00:00:00');
    const now = new Date();
    const diff = (d - now) / 86400000;
    return diff >= 0 && diff <= 2;
  }

  function isMilestoneTask(t) { return !!(t && t.isMilestone); }

  function myTodos() {
    return state.tasks.filter(t => !isMilestoneTask(t) && t.assignee === ME.name && t.status !== 'done' && t.status !== 'abolished');
  }

  function goTo(page) {
    state.page = page;
    state.settingsOpen = false;
    state.detailTaskId = null;
    if (page !== 'projectDetail') state.detailProjectId = null;
    render();
  }

  function goBack() {
    const target = state.prevPage || 'projects';
    state.detailProjectId = null;
    state.prevPage = null;
    goTo(target);
  }

  function enterDemo() {
    state.loggedIn = true;
    resetData(true);
    goTo('dashboard');
    toast('已进入演示（模拟钉钉免登）');
  }

  function logout() {
    state.loggedIn = false;
    state.settingsOpen = false;
    state.modal = null;
    render();
  }

  function toggleSettings(ev) {
    if (ev) ev.stopPropagation();
    state.settingsOpen = !state.settingsOpen;
    render();
  }

  function renderDingTalkLoginGate() {
    return `
      <div class="share-login-wrap">
        <div class="share-login-card">
          <div class="share-login-mark"><i class="fas fa-comments"></i></div>
          <div style="font-size:22px;font-weight:700;color:#0F172A;">恒慧管</div>
          <div style="margin-top:6px;font-size:13px;color:#64748B;">部门项目管控 · 钉钉登录</div>
          <div class="share-login-tip">
            <div style="font-weight:600;margin-bottom:6px;"><i class="fas fa-shield-alt" style="margin-right:6px;"></i>请通过钉钉登录</div>
            <div>1. 打开钉钉 → 工作台 → 找到「恒慧管」</div>
            <div>2. 进入后自动完成免登，直达工作台</div>
            <div>3. 本页为单文件分享演示，可本地预演界面与流程</div>
          </div>
          <button type="button" class="share-login-btn" onclick="enterDemo()">本地预演：进入工作台</button>
          <div class="share-login-foot">正式入口：henghuiguan.handagroup.com<br>仅需拷贝本 HTML 到任意电脑双击打开</div>
        </div>
      </div>`;
  }

  function renderSidebar() {
    const primary = [
      { key: 'dashboard', label: '工作台', icon: 'fa-th-large', active: state.page === 'dashboard', onclick: "goTo('dashboard')" },
      { key: 'projects', label: '项目', icon: 'fa-folder', active: state.page === 'projects' || state.page === 'projectDetail', onclick: "goTo('projects')" },
      { key: 'tasks', label: '任务', icon: 'fa-check-square', active: state.page === 'tasks', onclick: "goTo('tasks')" },
      { key: 'team', label: '团队', icon: 'fa-users', active: state.page === 'team', onclick: "goTo('team')" },
    ];
    return `
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark">恒</div>
          <div class="brand-text">
            <strong>恒慧管</strong>
            <span>项目管理系统</span>
          </div>
        </div>
        <nav style="padding:12px 0;flex:1;overflow-y:auto;">
          ${primary.map(item => `
            <button type="button" class="nav-item nav-item--flat ${item.active ? 'active' : ''}" onclick="${item.onclick}">
              <i class="fas ${item.icon}"></i><span>${item.label}</span>
            </button>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user-row">
            <div class="user-avatar">${esc(ME.name.charAt(0))}</div>
            <div class="sidebar-user-meta">
              <div class="user-name">${esc(ME.name)}</div>
              <div class="user-role">${esc(roleDisplayName(ME.role))}</div>
            </div>
            <div class="settings-gear-wrap">
              <button type="button" class="settings-gear-btn ${state.settingsOpen ? 'is-open' : ''}" onclick="toggleSettings(event)">
                <i class="fas fa-cog"></i>
              </button>
              ${state.settingsOpen ? `
                <div class="settings-dropdown" onclick="event.stopPropagation()">
                  <div class="settings-dropdown-hint">演示操作</div>
                  <button type="button" class="settings-dropdown-item" onclick="openIntakeModal()"><i class="fas fa-file-alt"></i><span>模拟表单提报</span></button>
                  <button type="button" class="settings-dropdown-item" onclick="resetData()"><i class="fas fa-undo"></i><span>重置演示数据</span></button>
                  <div class="settings-dropdown-divider"></div>
                  <button type="button" class="settings-dropdown-item" onclick="logout()"><i class="fas fa-sign-out-alt"></i><span>退出演示</span></button>
                </div>` : ''}
            </div>
          </div>
        </div>
      </aside>`;
  }

  function renderHeader() {
    const titles = { dashboard: '工作台', projects: '项目列表', projectDetail: '项目详情', tasks: '任务中心', team: '团队管理' };
    let pageTitle = titles[state.page] || '工作台';
    if (state.page === 'projectDetail' && state.detailProjectId) {
      const p = state.projects.find(x => x.id === state.detailProjectId);
      if (p) pageTitle = p.name || pageTitle;
    }
    return `
      <div class="main-header">
        <div class="breadcrumb">
          <span>恒慧管</span>
          <span class="sep">/</span>
          <span class="current">${pageTitle}</span>
        </div>
        <div class="global-search">
          <i class="fas fa-search"></i>
          <input type="text" placeholder="全局搜索（项目、任务等）" value="${esc(state.taskSearch)}"
            onkeydown="if(event.key==='Enter'){state.taskSearch=this.value;state.page='tasks';render();}" />
        </div>
        <div class="main-header-actions">
          ${state.page === 'dashboard' || state.page === 'tasks' ? `
            <button class="btn btn-primary" onclick="openIntakeModal()"><i class="fas fa-plus"></i><span class="btn-text">模拟表单提报</span></button>
          ` : ''}
          ${state.page === 'projects' ? `<button class="btn btn-ghost hide-mobile" onclick="toast('演示版不支持导出')"><i class="fas fa-file-export"></i><span class="btn-text">导出</span></button>` : ''}
          <button type="button" class="topbar-user hide-mobile" title="${esc(ME.dept)} · ${esc(roleDisplayName(ME.role))}">
            <span class="avatar">${esc(ME.name.charAt(0))}</span>
            <span>${esc(ME.name)}</span>
          </button>
        </div>
      </div>`;
  }

  function renderWorkbenchTodoCard(task) {
    const overdue = isOverdue(task);
    const dueSoon = isDueSoon(task);
    const urgencyClass = overdue ? 'is-overdue' : (dueSoon ? 'is-duesoon' : '');
    const badge = overdue
      ? '<span class="wb-todo-badge is-overdue">已逾期</span>'
      : (dueSoon ? '<span class="wb-todo-badge is-duesoon">即将到期</span>' : '');
    const pr = priorityMap[task.priority] || priorityMap.normal;
    const prLabel = task.priority === 'urgent' ? '高' : (task.priority === 'important' ? '中' : '低');
    const projectLabel = task.projectId ? projectName(task.projectId) : '临时任务';
    const actions = [];
    if (task.status === 'todo') {
      actions.push(`<button type="button" class="btn btn-primary" onclick="event.stopPropagation();updateTaskStatus('${task.id}','doing')"><i class="fas fa-play"></i> 开始</button>`);
      actions.push(`<button type="button" class="btn btn-warning" onclick="event.stopPropagation();updateTaskStatus('${task.id}','paused')"><i class="fas fa-pause"></i> 暂停</button>`);
    } else if (task.status === 'doing') {
      actions.push(`<button type="button" class="btn btn-warning" onclick="event.stopPropagation();updateTaskStatus('${task.id}','paused')"><i class="fas fa-pause"></i> 暂停</button>`);
      actions.push(`<button type="button" class="btn btn-success" onclick="event.stopPropagation();updateTaskStatus('${task.id}','done')"><i class="fas fa-check"></i> 完成</button>`);
    } else if (task.status === 'paused') {
      actions.push(`<button type="button" class="btn btn-primary" onclick="event.stopPropagation();updateTaskStatus('${task.id}','doing')"><i class="fas fa-play"></i> 继续</button>`);
    }

    return `
      <div class="wb-todo-card ${urgencyClass}" onclick="viewTask('${task.id}')">
        <div class="wb-todo-bar">
          <div class="wb-todo-bar-main">
            <div class="wb-todo-top">
              <div class="wb-todo-title">${esc(task.title || '')}</div>
              ${badge}
            </div>
          </div>
          ${actions.length ? `<div class="wb-todo-actions">${actions.join('')}</div>` : ''}
        </div>
        ${task.desc ? `<div class="wb-todo-desc">${esc(task.desc)}</div>` : ''}
        <div class="wb-todo-meta">
          <span class="tag">${esc(projectLabel)}</span>
          ${task.intake ? `<span class="tag" style="background:#ECFDF5;color:#059669;"><i class="fas fa-file-alt"></i> 表单提报</span>` : ''}
          ${task.system ? `<span class="tag"><i class="fas fa-server"></i> 系统 ${esc(task.system)}</span>` : ''}
          ${task.submitter ? `<span class="tag"><i class="fas fa-user"></i> 提单人 ${esc(task.submitter)}</span>` : ''}
          ${task.dueDate ? `<span class="tag"><i class="far fa-calendar"></i> ${esc(task.dueDate)}</span>` : ''}
          <span class="tag" style="color:${pr.color};">${esc(prLabel)}</span>
        </div>
      </div>`;
  }

  function renderWorkbenchHome() {
    const activeProjects = state.projects.filter(p => p.status === 'active');
    const allOpenTasks = state.tasks.filter(t => t.status !== 'abolished');
    const completedTasks = allOpenTasks.filter(t => t.status === 'done');
    const highPriority = allOpenTasks.filter(t => (t.priority === 'urgent' || t.priority === 'important') && t.status !== 'done');
    const todos = myTodos();
    const overdueCount = todos.filter(isOverdue).length;
    const soonCount = todos.filter(t => !isOverdue(t) && isDueSoon(t)).length;
    const preview = todos.slice(0, 8);
    const weekDone = state.tasks.filter(t => t.assignee === ME.name && t.status === 'done');

    const stats = [
      { label: '进行中项目', value: activeProjects.length, accent: '#4F46E5', bg: '#EEF2FF', icon: 'fa-folder-open' },
      { label: '总任务数', value: allOpenTasks.length, accent: '#0EA5E9', bg: '#F0F9FF', icon: 'fa-list-check' },
      { label: '已完成', value: completedTasks.length, accent: '#10B981', bg: '#F0FDF4', icon: 'fa-circle-check' },
      { label: '高优先级', value: highPriority.length, accent: '#F59E0B', bg: '#FFFBEB', icon: 'fa-bolt' },
    ];

    return `
      <div class="wb-wrap">
        <div class="wb-stats">
          ${stats.map(s => `
            <div class="wb-stat-card">
              <div class="wb-stat-icon" style="background:${s.bg};color:${s.accent};"><i class="fas ${s.icon}"></i></div>
              <div>
                <div class="wb-stat-value">${s.value}</div>
                <div class="wb-stat-label">${s.label}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="wb-layout">
          <div>
            <button type="button" class="wb-new-btn" onclick="openIntakeModal()">
              <i class="fas fa-plus"></i> 模拟钉钉表单提报
            </button>
            <div class="wb-section-head">
              <div class="wb-section-title">
                我的待办
                <span class="wb-count">${todos.length}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="wb-urgency-chips">
                  ${overdueCount > 0 ? `<span class="wb-chip wb-chip--overdue">${overdueCount} 逾期</span>` : ''}
                  ${soonCount > 0 ? `<span class="wb-chip wb-chip--soon">${soonCount} 临期</span>` : ''}
                </div>
                <button type="button" class="wb-more-link" onclick="goTo('tasks')">查看全部</button>
              </div>
            </div>
            <div class="wb-todo-list">
              ${preview.length ? preview.map(renderWorkbenchTodoCard).join('') : `<div class="wb-empty">暂无待办任务，继续保持！</div>`}
            </div>
          </div>
          <div>
            <div class="wb-section-head"><div class="wb-section-title">最近动态</div></div>
            <div class="wb-activity-panel">
              ${state.activities.map(a => `
                <div class="wb-activity-item">
                  <div class="wb-activity-icon"><i class="fas ${a.icon}"></i></div>
                  <div class="wb-activity-body">
                    <div class="wb-activity-text">${esc(a.text)}</div>
                    <div class="wb-activity-meta">${esc(a.meta)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="wb-week-done">
              <div class="wb-section-head">
                <div class="wb-section-title">本周已完成 <span class="wb-count">${weekDone.length}</span></div>
              </div>
              <div class="wb-activity-panel">
                ${weekDone.length ? weekDone.map(t => `
                  <div class="wb-activity-item" onclick="viewTask('${t.id}')" style="cursor:pointer;">
                    <div class="wb-activity-icon is-done"><i class="fas fa-check"></i></div>
                    <div class="wb-activity-body">
                      <div class="wb-activity-text">${esc(t.title)}</div>
                      <div class="wb-activity-meta">${esc(projectName(t.projectId))}</div>
                    </div>
                  </div>
                `).join('') : `<div class="wb-empty" style="border:none;padding:20px 8px;">本周暂无已完成任务</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function avatarColor(name) {
    const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9', '#3D4A8C'];
    let h = 0;
    String(name || '').split('').forEach(c => { h = (h + c.charCodeAt(0)) % colors.length; });
    return colors[h];
  }

  function renderAvatarStack(names, max) {
    const list = (names || []).filter(Boolean);
    const show = list.slice(0, max || 3);
    const more = list.length - show.length;
    return `<div class="avatar-stack">${show.map(n =>
      `<span class="person-avatar" style="background:${avatarColor(n)};" title="${esc(n)}">${esc(String(n).charAt(0))}</span>`
    ).join('')}${more > 0 ? `<span class="avatar-stack-more">+${more}</span>` : ''}</div>`;
  }

  function renderEmptyState(opts) {
    const icon = (opts && opts.icon) || 'fa-inbox';
    const title = (opts && opts.title) || '暂无数据';
    const hint = (opts && opts.hint) || '';
    const panel = opts && opts.panel;
    return `
      <div class="empty-state${panel ? ' empty-state--panel' : ''}">
        <div class="empty-state-icon"><i class="fas ${icon}"></i></div>
        <div class="empty-state-title">${esc(title)}</div>
        ${hint ? `<div class="empty-state-hint">${esc(hint)}</div>` : ''}
      </div>`;
  }

  function getProjectAccentColor(p) {
    const colors = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#14B8A6'];
    let h = 0;
    String(p.id || p.name || '').split('').forEach(c => { h += c.charCodeAt(0); });
    return colors[h % colors.length];
  }

  function renderProjectIconTile(p) {
    const bg = getProjectAccentColor(p);
    return `<div class="project-card-icon-tile" style="background:${bg};">${esc(String(p.name || '项').charAt(0))}</div>`;
  }

  function renderProjectStatusDot(status) {
    const map = { active: ['进行中', '#10B981'], planning: ['规划中', '#6366F1'], paused: ['已暂停', '#6B7280'], done: ['已完成', '#059669'] };
    const m = map[status] || map.active;
    return `<span class="project-status-dot" style="color:${m[1]};">${m[0]}</span>`;
  }

  function projectHasOverdue(p) {
    return state.tasks.some(t => t.projectId === p.id && isOverdue(t) && t.status !== 'done');
  }

  function projectEndingSoon(p) {
    const end = p.endDate;
    if (!end) return false;
    const today = todayStr();
    const soon = addDays(7);
    return end >= today && end <= soon;
  }

  function getProjectListStats(p) {
    const all = state.tasks.filter(t => t.projectId === p.id && t.status !== 'abolished');
    const milestones = all.filter(isMilestoneTask);
    const leaves = all.filter(t => !isMilestoneTask(t));
    const mainCount = milestones.length || (leaves.length ? 1 : 0);
    const mainDone = milestones.length
      ? milestones.filter(m => {
          const kids = leaves.filter(t => t.parentId === m.id);
          return kids.length > 0 && kids.every(t => t.status === 'done');
        }).length
      : leaves.filter(t => t.status === 'done').length;
    const done = leaves.filter(t => t.status === 'done').length;
    const overdue = leaves.filter(t => isOverdue(t)).length;
    const pct = leaves.length ? Math.round(done / leaves.length * 100) : 0;
    return { mainCount, mainDone, mainProgress: pct, taskCount: leaves.length, taskDone: done, overdue };
  }

  function getFilteredProjects() {
    let list = state.projects.slice();
    const f = state.projectFilter || 'all';
    if (f !== 'all') list = list.filter(p => p.status === f);
    if (state.projectDept && state.projectDept !== 'all') {
      list = list.filter(p => p.dept === state.projectDept);
    }
    if (state.projectManager && state.projectManager !== 'all') {
      list = list.filter(p => p.manager === state.projectManager);
    }
    if (state.projectRiskFilter === 'overdue') list = list.filter(projectHasOverdue);
    if (state.projectRiskFilter === 'endingSoon') list = list.filter(projectEndingSoon);
    const q = (state.projectSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        (p.name + p.id + p.manager + p.dept + (p.desc || '')).toLowerCase().includes(q)
      );
    }
    const sort = state.projectSort || 'default';
    if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
    else if (sort === 'progress') {
      list.sort((a, b) => getProjectListStats(b).mainProgress - getProjectListStats(a).mainProgress);
    } else if (sort === 'endDate') {
      list.sort((a, b) => String(a.endDate || '9999').localeCompare(String(b.endDate || '9999')));
    }
    return list;
  }

  function resetProjectFilters() {
    state.projectFilter = 'all';
    state.projectSearch = '';
    state.projectDept = 'all';
    state.projectManager = 'all';
    state.projectRiskFilter = 'all';
    state.projectSort = 'default';
    render();
  }

  function formatBoardDate(d) {
    if (!d) return '-';
    const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[2])}月${Number(m[3])}日` : d;
  }

  function getTodoTaskType(task) {
    if (task.intake || task.type === 'temp' || !task.projectId) return 'temp';
    return 'project';
  }

  function getTodoTaskTypeLabel(type) {
    if (type === 'temp') return '临时任务';
    if (type === 'inform') return '告知协办';
    return '项目任务';
  }

  function matchesTodoDueFilter(task, dueFilter) {
    if (!dueFilter || dueFilter === 'all') return true;
    if (dueFilter === 'overdue') return isOverdue(task) && task.status !== 'done';
    if (dueFilter === 'today') return task.dueDate === todayStr() && task.status !== 'done';
    if (dueFilter === 'week') {
      const end = addDays(6 - ((new Date().getDay() + 6) % 7));
      const start = addDays(-((new Date().getDay() + 6) % 7));
      return task.dueDate && task.dueDate >= start && task.dueDate <= end && task.status !== 'done';
    }
    return true;
  }

  function sortTasksForCenter(list) {
    return list.slice().sort((a, b) => {
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
      if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
      if (isOverdue(a) && !isOverdue(b)) return -1;
      if (isOverdue(b) && !isOverdue(a)) return 1;
      return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
    });
  }

  function goToTodoView(mode) {
    state.todoViewMode = mode || 'all';
    state.todoPage = 1;
    render();
  }

  function setTodoListTab(tab) {
    state.todoListTab = tab || 'all';
    state.todoPage = 1;
    render();
  }

  function setTodoViewLayout(layout) {
    state.todoViewLayout = layout === 'list' ? 'list' : 'board';
    state.todoPage = 1;
    render();
  }

  function setTaskProjectTab(tabId) {
    state.taskTab = tabId || 'all';
    state.todoPage = 1;
    render();
  }

  function setTaskScopeTab(tab) {
    state.taskScopeTab = tab === 'dept' ? 'dept' : 'mine';
    state.todoPage = 1;
    render();
  }

  function resetTodoFilters() {
    state.taskSearch = '';
    state.todoTypeFilter = 'all';
    state.todoPriorityFilter = 'all';
    state.todoDueFilter = 'all';
    state.taskTab = 'all';
    state.todoPage = 1;
    render();
  }

  function setTodoPage(p) {
    state.todoPage = Math.max(1, Number(p) || 1);
    render();
  }

  function setTodoPageSize(n) {
    state.todoPageSize = Number(n) || 20;
    state.todoPage = 1;
    render();
  }

  function handleTodoBoardDrop(ev, status) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('is-drop-target');
    const id = ev.dataTransfer.getData('text/taskId');
    if (!id || !status) return;
    updateTaskStatus(id, status);
  }

  function renderTodoBoardCard(task) {
    const overdue = isOverdue(task) && task.status !== 'done';
    const dueSoon = !overdue && isDueSoon(task) && task.status !== 'done';
    const dueLabel = formatBoardDate(task.dueDate);
    const projectLabel = task.projectId ? projectName(task.projectId) : '临时任务';
    const type = getTodoTaskType(task);
    const typeLabel = getTodoTaskTypeLabel(type);
    const assignee = task.assignee || '-';
    const prKey = task.priority || 'normal';
    const children = state.tasks.filter(t => t.parentId === task.id);
    const childTotal = children.length;
    const childDone = children.filter(t => t.status === 'done').length;
    const childPct = childTotal ? Math.round(childDone / childTotal * 100) : 0;
    return `
      <div class="todo-board-card${overdue ? ' is-overdue' : ''}${dueSoon ? ' is-duesoon' : ''}"
        draggable="true"
        ondragstart="event.dataTransfer.setData('text/taskId','${task.id}')"
        onclick="viewTask('${task.id}')">
        <div class="todo-board-card-top">
          <div class="todo-board-card-title">${esc(task.title || '')}</div>
          <div class="todo-board-card-actions">
            <button type="button" title="编辑" onclick="event.stopPropagation();editTask('${task.id}')"><i class="fas fa-pen"></i></button>
            <button type="button" class="is-danger" title="作废" onclick="event.stopPropagation();abolishTask('${task.id}')"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
        ${task.desc ? `<div class="todo-board-card-desc">${esc(task.desc)}</div>` : ''}
        <div class="todo-board-card-tags">
          <span class="tag">${esc(projectLabel)}</span>
          <span class="tag">${esc(typeLabel)}</span>
          ${task.intake ? `<span class="tag" style="background:#ECFDF5;color:#059669;">表单提报</span>` : ''}
          ${task.system ? `<span class="tag">系统 ${esc(task.system)}</span>` : ''}
        </div>
        ${childTotal > 0 ? `
        <div class="todo-board-subtasks">
          <div class="todo-board-subtasks-head">
            <span><i class="fas fa-sitemap" style="margin-right:4px;"></i>子任务</span>
            <span>${childDone}/${childTotal}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${childPct}%;"></div></div>
        </div>` : ''}
        <div class="todo-board-card-footer">
          <span class="todo-board-avatar" style="background:${avatarColor(assignee)};">${esc(String(assignee).charAt(0))}</span>
          <span class="todo-board-assignee">${esc(assignee)}</span>
          <span class="todo-board-date">${esc(dueLabel)}</span>
          <span class="priority-dot priority-${prKey}" title="${esc((priorityMap[prKey] || priorityMap.normal).label)}"></span>
        </div>
      </div>`;
  }

  function renderTodoBoardView(list) {
    const columns = [
      { key: 'todo', label: '待开始', color: '#6366F1', icon: 'fa-circle', match: t => t.status === 'todo' },
      { key: 'doing', label: '进行中', color: '#8B5CF6', icon: 'fa-spinner', match: t => t.status === 'doing' },
      { key: 'paused', label: '已暂停', color: '#6B7280', icon: 'fa-pause-circle', match: t => t.status === 'paused' },
      { key: 'done', label: '已完成', color: '#10B981', icon: 'fa-check-circle', match: t => t.status === 'done' },
    ];
    const visibleCols = columns.map(col => ({
      ...col,
      tasks: sortTasksForCenter(list.filter(col.match)),
    })).filter(col => col.key !== 'paused' || col.tasks.length > 0 || list.some(t => t.status === 'paused'));

    if (!list.length) {
      return renderEmptyState({ icon: 'fa-check-circle', title: '暂无任务', hint: '当前筛选下没有任务' });
    }

    return `
      <div class="todo-status-kanban" style="--todo-kanban-cols:${Math.max(visibleCols.length, 1)};">
        ${visibleCols.map(col => `
          <div class="todo-kanban-col"
            ondragover="event.preventDefault();this.classList.add('is-drop-target')"
            ondragleave="this.classList.remove('is-drop-target')"
            ondrop="handleTodoBoardDrop(event, '${col.key}')">
            <div class="todo-kanban-col-head">
              <i class="fas ${col.icon}" style="color:${col.color};"></i>
              <span class="col-label">${col.label}</span>
              <span class="col-count" style="background:${col.color};">${col.tasks.length}</span>
            </div>
            ${col.tasks.length ? col.tasks.map(renderTodoBoardCard).join('') : `<div class="todo-kanban-empty">暂无</div>`}
          </div>
        `).join('')}
      </div>`;
  }

  function renderProjects() {
    const filtered = getFilteredProjects();
    const scopeProjects = state.projects.slice();
    const statusCounts = {
      planning: scopeProjects.filter(p => p.status === 'planning').length,
      active: scopeProjects.filter(p => p.status === 'active').length,
      paused: scopeProjects.filter(p => p.status === 'paused').length,
      done: scopeProjects.filter(p => p.status === 'done').length,
    };
    const totalAll = scopeProjects.length;
    const pf = state.projectFilter || 'all';
    const managers = [...new Set(state.projects.map(p => p.manager).filter(Boolean))];
    const depts = [...new Set(state.projects.map(p => p.dept).filter(Boolean))];
    const selectedDept = state.projectDept || 'all';
    const selectedManager = state.projectManager || 'all';
    const selectedRisk = state.projectRiskFilter || 'all';
    const selectedSort = state.projectSort || 'default';

    return `
      <div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
              <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">项目列表</h2>
              <div style="display:flex;align-items:center;gap:8px;">
                <button class="btn btn-primary btn-sm" onclick="showProjectModal()"><i class="fas fa-plus"></i>新建项目</button>
              </div>
            </div>
            <p class="content-intro" style="margin:0 0 12px;">查看与管理进行中的项目，点击卡片进入详情。</p>
            <div class="todo-tabs">
              <button type="button" class="todo-tab${pf === 'all' ? ' active' : ''}" onclick="state.projectFilter='all';render()">全部 <span class="count">(${totalAll})</span></button>
              <button type="button" class="todo-tab${pf === 'active' ? ' active' : ''}" onclick="state.projectFilter='active';render()">进行中 <span class="count">(${statusCounts.active})</span></button>
              <button type="button" class="todo-tab${pf === 'planning' ? ' active' : ''}" onclick="state.projectFilter='planning';render()">规划中 <span class="count">(${statusCounts.planning})</span></button>
              <button type="button" class="todo-tab${pf === 'paused' ? ' active' : ''}" onclick="state.projectFilter='paused';render()">已暂停 <span class="count">(${statusCounts.paused})</span></button>
              <button type="button" class="todo-tab${pf === 'done' ? ' active' : ''}" onclick="state.projectFilter='done';render()">已完成 <span class="count">(${statusCounts.done})</span></button>
            </div>
          </div>
        </div>

        <div class="todo-filter-bar">
          <div class="todo-field todo-field-grow">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="搜索项目名称、编号、负责人、部门" value="${esc(state.projectSearch || '')}"
              onchange="state.projectSearch=this.value;render()" />
          </div>
          <div class="todo-field">
            <select onchange="state.projectDept=this.value;render()">
              <option value="all" ${selectedDept === 'all' ? 'selected' : ''}>全部部门</option>
              ${depts.map(dept => `<option value="${esc(dept)}" ${selectedDept === dept ? 'selected' : ''}>${esc(dept)}</option>`).join('')}
            </select>
          </div>
          <div class="todo-field">
            <select onchange="state.projectManager=this.value;render()">
              <option value="all" ${selectedManager === 'all' ? 'selected' : ''}>负责人</option>
              ${managers.map(name => `<option value="${esc(name)}" ${selectedManager === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}
            </select>
          </div>
          <div class="todo-field">
            <select onchange="state.projectRiskFilter=this.value;render()">
              <option value="all" ${selectedRisk === 'all' ? 'selected' : ''}>异常情况</option>
              <option value="overdue" ${selectedRisk === 'overdue' ? 'selected' : ''}>有逾期任务</option>
              <option value="endingSoon" ${selectedRisk === 'endingSoon' ? 'selected' : ''}>7日内到期</option>
            </select>
          </div>
          <div class="todo-field">
            <select onchange="state.projectSort=this.value;render()">
              <option value="default" ${selectedSort === 'default' ? 'selected' : ''}>默认排序</option>
              <option value="endDate" ${selectedSort === 'endDate' ? 'selected' : ''}>按截止日</option>
              <option value="progress" ${selectedSort === 'progress' ? 'selected' : ''}>按进度</option>
              <option value="name" ${selectedSort === 'name' ? 'selected' : ''}>按名称</option>
            </select>
          </div>
          <button type="button" class="btn btn-ghost" onclick="resetProjectFilters()"><i class="fas fa-rotate-right"></i> 重置</button>
        </div>

        <div class="project-list-count">共 ${filtered.length} 条</div>
        <div class="project-card-grid">
          ${filtered.length === 0 ? renderEmptyState({ icon: 'fa-folder-open', title: '暂无项目', hint: '试试调整筛选，或新建一个项目', panel: true }) : ''}
          ${filtered.map(p => {
            const stats = getProjectListStats(p);
            const accent = getProjectAccentColor(p);
            const members = [p.manager].concat(p.members || []);
            return `
              <div class="project-card" onclick="viewProject('${p.id}')">
                <div class="project-card-head-row">
                  ${renderProjectIconTile(p)}
                  <div class="project-card-head-text">
                    <div class="project-card-name">${esc(p.name || '')}</div>
                    <div class="project-card-desc">${esc(p.desc || '暂无描述')}</div>
                  </div>
                  ${renderProjectStatusDot(p.status)}
                </div>
                <div class="project-card-progress-row">
                  <div class="progress-bar"><div class="progress-fill" style="width:${stats.mainProgress}%;background:${accent};"></div></div>
                  <span class="progress-pct">${stats.mainProgress}%</span>
                </div>
                <div class="project-card-foot">
                  ${renderAvatarStack(members, 3)}
                  <span class="project-card-task-count">${stats.mainDone}/${stats.mainCount} 里程碑</span>
                </div>
                <div class="project-card-actions" onclick="event.stopPropagation()">
                  <button type="button" class="btn btn-primary btn-sm" onclick="viewProject('${p.id}')"><i class="fas fa-eye"></i>详情</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="editProject('${p.id}')"><i class="fas fa-edit"></i>编辑</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function statusTag(s) {
    const map = {
      todo: ['待开始', 'status-todo'],
      doing: ['进行中', 'status-doing'],
      done: ['已完成', 'status-done'],
      paused: ['已暂停', 'status-paused'],
    };
    const m = map[s] || ['未知', 'status-todo'];
    return `<span class="tag ${m[1]}">${m[0]}</span>`;
  }

  function getTaskPool() {
    let list = state.tasks.filter(t => !isMilestoneTask(t) && t.status !== 'abolished' && t.status !== 'archived');
    const mode = state.todoViewMode || 'all';
    if (mode === 'mine') {
      list = list.filter(t => t.assignee === ME.name || t.submitter === ME.name || (t.collaborators || []).includes(ME.name));
    } else if (mode === 'created') {
      list = list.filter(t => t.submitter === ME.name || (t.intake && t.assignee === ME.name));
    } else if (mode === 'handled') {
      list = list.filter(t => t.assignee === ME.name);
    }
    if (state.taskScopeTab === 'dept' && (mode === 'all' || mode === 'mine')) {
      const names = new Set(state.members.map(m => m.name));
      list = list.filter(t => names.has(t.assignee));
    }
    return list;
  }

  function getTaskCenterProjectTabs(baseTasks) {
    const counts = new Map();
    baseTasks.forEach(t => {
      const key = t.projectId || '__temp__';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const tabs = [{ id: 'all', label: '全部', count: baseTasks.length }];
    const projectTabs = [];
    counts.forEach((count, key) => {
      if (key === '__temp__') return;
      const project = state.projects.find(p => p.id === key);
      projectTabs.push({ id: key, label: (project && project.name) || '未知项目', count });
    });
    projectTabs.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
    tabs.push(...projectTabs);
    if (counts.has('__temp__')) {
      tabs.push({ id: '__temp__', label: '临时任务', count: counts.get('__temp__') });
    }
    return tabs;
  }

  function renderTodoListView(list) {
    const pageSize = state.todoPageSize || 20;
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    if (state.todoPage > totalPages) state.todoPage = totalPages;
    if (state.todoPage < 1) state.todoPage = 1;
    const page = state.todoPage;
    const pageRows = list.slice((page - 1) * pageSize, page * pageSize);
    const pageButtons = [];
    for (let i = 1; i <= totalPages && i <= 7; i++) {
      pageButtons.push(`<button type="button" class="todo-page-btn${i === page ? ' active' : ''}" onclick="setTodoPage(${i})">${i}</button>`);
    }
    const rowsHtml = pageRows.length ? pageRows.map(task => {
      const type = getTodoTaskType(task);
      const pr = priorityMap[task.priority] || priorityMap.normal;
      const prKey = task.priority || 'normal';
      const prIcon = prKey === 'urgent' ? 'fa-arrow-up' : (prKey === 'important' ? 'fa-minus' : 'fa-arrow-down');
      const projectLabel = task.projectId ? projectName(task.projectId) : '—';
      const overdue = isOverdue(task) && task.status !== 'done';
      const dueSoon = !overdue && isDueSoon(task) && task.status !== 'done';
      const rowUrgency = overdue ? ' todo-row--overdue' : (dueSoon ? ' todo-row--duesoon' : '');
      return `
        <tr class="${rowUrgency.trim()}" onclick="viewTask('${task.id}')">
          <td class="col-check" onclick="event.stopPropagation()"><input type="checkbox" aria-label="选择任务" /></td>
          <td><span class="todo-task-title">${esc(task.title || '')}</span></td>
          <td style="color:var(--text-muted);">${esc(projectLabel)}</td>
          <td>${esc(getTodoTaskTypeLabel(type))}</td>
          <td><span class="todo-priority ${prKey}"><i class="fas ${prIcon}"></i> ${esc(pr.label)}</span></td>
          <td>-</td>
          <td>${esc(task.dueDate || '-')}</td>
          <td>${statusTag(task.status)}</td>
          <td>${esc(task.assignee || '-')}</td>
          <td class="col-actions" onclick="event.stopPropagation()">
            ${task.status === 'todo' ? `<button type="button" class="btn btn-primary btn-sm" onclick="updateTaskStatus('${task.id}','doing')"><i class="fas fa-play"></i></button>` : ''}
            ${task.status === 'doing' ? `<button type="button" class="btn btn-success btn-sm" onclick="updateTaskStatus('${task.id}','done')"><i class="fas fa-check"></i></button>` : ''}
            ${(task.status === 'doing' || task.status === 'todo') ? `<button type="button" class="btn btn-ghost btn-sm" onclick="updateTaskStatus('${task.id}','paused')"><i class="fas fa-pause"></i></button>` : ''}
            ${task.status === 'paused' ? `<button type="button" class="btn btn-primary btn-sm" onclick="updateTaskStatus('${task.id}','doing')"><i class="fas fa-play"></i></button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" onclick="viewTask('${task.id}')"><i class="fas fa-eye"></i></button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="editTask('${task.id}')"><i class="fas fa-pen"></i></button>
          </td>
        </tr>`;
    }).join('') : `<tr><td colspan="10">${renderEmptyState({ icon: 'fa-check-circle', title: '暂无任务', hint: '当前筛选下没有任务' })}</td></tr>`;

    return `
      <div class="todo-table-card">
        <div class="todo-table-wrap">
          <table class="todo-table">
            <thead>
              <tr>
                <th class="col-check"><input type="checkbox" aria-label="全选" onclick="event.stopPropagation()" /></th>
                <th>任务标题</th>
                <th>所属项目</th>
                <th>任务类型</th>
                <th>优先级</th>
                <th>计划开始时间</th>
                <th>到期时间</th>
                <th>状态</th>
                <th>负责人</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="todo-pager">
          <div class="todo-pager-info">共 ${list.length} 条</div>
          <div class="todo-pager-controls">
            <button type="button" class="todo-page-btn" ${page <= 1 ? 'disabled' : ''} onclick="setTodoPage(${page - 1})"><i class="fas fa-chevron-left"></i></button>
            ${pageButtons.join('')}
            <button type="button" class="todo-page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="setTodoPage(${page + 1})"><i class="fas fa-chevron-right"></i></button>
            <select class="todo-page-btn" style="width:auto;padding:0 8px;" onchange="setTodoPageSize(this.value)">
              <option value="10" ${pageSize === 10 ? 'selected' : ''}>10条/页</option>
              <option value="20" ${pageSize === 20 ? 'selected' : ''}>20条/页</option>
              <option value="50" ${pageSize === 50 ? 'selected' : ''}>50条/页</option>
            </select>
          </div>
        </div>
      </div>`;
  }

  function renderTasks() {
    const viewLayout = state.todoViewLayout === 'list' ? 'list' : 'board';
    const viewMode = state.todoViewMode || 'all';
    const scopeTab = state.taskScopeTab || 'mine';
    let list = getTaskPool();

    const q = (state.taskSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        (t.title + t.assignee + projectName(t.projectId) + (t.id || '')).toLowerCase().includes(q)
      );
    }

    const projectTabs = getTaskCenterProjectTabs(list);
    let projectTab = state.taskTab || 'all';
    if (!projectTabs.some(t => t.id === projectTab)) projectTab = 'all';

    if (projectTab === '__temp__') list = list.filter(t => !t.projectId);
    else if (projectTab !== 'all') list = list.filter(t => t.projectId === projectTab);

    if (state.todoTypeFilter === 'project') list = list.filter(t => getTodoTaskType(t) === 'project');
    else if (state.todoTypeFilter === 'temp') list = list.filter(t => getTodoTaskType(t) === 'temp');

    if (state.todoPriorityFilter && state.todoPriorityFilter !== 'all') {
      list = list.filter(t => (t.priority || 'normal') === state.todoPriorityFilter);
    }
    list = list.filter(t => matchesTodoDueFilter(t, state.todoDueFilter));

    const countAll = list.length;
    const countTodo = list.filter(t => t.status === 'todo').length;
    const countDoing = list.filter(t => t.status === 'doing').length;
    const countPaused = list.filter(t => t.status === 'paused').length;
    const countOverdue = list.filter(t => isOverdue(t) && t.status !== 'done' && t.status !== 'paused').length;
    const countDone = list.filter(t => t.status === 'done').length;

    let listTab = state.todoListTab || 'all';
    if ((listTab === 'done' || listTab === 'paused') && viewLayout !== 'board') {
      listTab = 'all';
      state.todoListTab = 'all';
    }
    if (listTab === 'todo') list = list.filter(t => t.status === 'todo');
    else if (listTab === 'doing') list = list.filter(t => t.status === 'doing');
    else if (listTab === 'paused') list = list.filter(t => t.status === 'paused');
    else if (listTab === 'overdue') list = list.filter(t => isOverdue(t) && t.status !== 'done' && t.status !== 'paused');
    else if (listTab === 'done') list = list.filter(t => t.status === 'done');

    list = sortTasksForCenter(list);

    const allScopeCount = state.tasks.filter(t => t.status !== 'abolished').length;
    const mineCount = state.tasks.filter(t => t.assignee === ME.name && t.status !== 'abolished').length;
    const deptCount = state.tasks.filter(t => state.members.some(m => m.name === t.assignee) && t.status !== 'abolished').length;

    const summaryItems = [
      { key: 'todo', label: '待开始', count: countTodo, color: '#6366F1' },
      { key: 'doing', label: '进行中', count: countDoing, color: '#8B5CF6' },
      { key: 'overdue', label: '已延期', count: countOverdue, color: '#F59E0B' },
    ];
    if (viewLayout === 'board') {
      summaryItems.splice(2, 0, { key: 'paused', label: '已暂停', count: countPaused, color: '#6B7280' });
      summaryItems.push({ key: 'done', label: '已完成', count: countDone, color: '#10B981' });
    }

    return `
      <div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <p class="content-intro" style="margin:0 0 12px;">任务中心默认看板视图，可按状态筛选；演示版支持看板拖拽改状态与列表切换。</p>
            <div class="scope-seg" style="margin-bottom:12px;">
              <button type="button" class="${viewMode === 'all' ? 'active' : ''}" onclick="goToTodoView('all')">全部</button>
              <button type="button" class="${viewMode === 'mine' ? 'active' : ''}" onclick="goToTodoView('mine')">与我相关</button>
              <button type="button" class="${viewMode === 'created' ? 'active' : ''}" onclick="goToTodoView('created')">我发起的</button>
              <button type="button" class="${viewMode === 'handled' ? 'active' : ''}" onclick="goToTodoView('handled')">我处理的</button>
            </div>
            <div class="todo-tabs">
              <button type="button" class="todo-tab${listTab === 'all' ? ' active' : ''}" onclick="setTodoListTab('all')">全部 <span class="count">(${countAll})</span></button>
              <button type="button" class="todo-tab${listTab === 'todo' ? ' active' : ''}" onclick="setTodoListTab('todo')">待开始 <span class="count">(${countTodo})</span></button>
              <button type="button" class="todo-tab${listTab === 'doing' ? ' active' : ''}" onclick="setTodoListTab('doing')">进行中 <span class="count">(${countDoing})</span></button>
              ${viewLayout === 'board' ? `<button type="button" class="todo-tab${listTab === 'paused' ? ' active' : ''}" onclick="setTodoListTab('paused')">已暂停 <span class="count">(${countPaused})</span></button>` : ''}
              <button type="button" class="todo-tab${listTab === 'overdue' ? ' active' : ''}" onclick="setTodoListTab('overdue')">已延期 <span class="count">(${countOverdue})</span></button>
              ${viewLayout === 'board' ? `<button type="button" class="todo-tab${listTab === 'done' ? ' active' : ''}" onclick="setTodoListTab('done')">已完成 <span class="count">(${countDone})</span></button>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${(viewMode === 'all' || viewMode === 'mine') ? `
            <div class="scope-seg">
              <button type="button" class="${scopeTab === 'mine' ? 'active' : ''}" onclick="setTaskScopeTab('mine')"><i class="fas fa-globe" style="margin-right:6px;"></i>${viewMode === 'all' ? '全量' : '本人'} ${viewMode === 'all' ? allScopeCount : mineCount}</button>
              <button type="button" class="${scopeTab === 'dept' ? 'active' : ''}" onclick="setTaskScopeTab('dept')"><i class="fas fa-users" style="margin-right:6px;"></i>部门 ${deptCount}</button>
            </div>` : ''}
            <div class="todo-view-toggle">
              <button type="button" class="${viewLayout === 'list' ? 'active' : ''}" onclick="setTodoViewLayout('list')" title="列表"><i class="fas fa-list"></i> 列表</button>
              <button type="button" class="${viewLayout === 'board' ? 'active' : ''}" onclick="setTodoViewLayout('board')" title="看板"><i class="fas fa-columns"></i> 看板</button>
            </div>
          </div>
        </div>

        <div class="todo-status-summary">
          ${summaryItems.map(s => `
            <button type="button" class="todo-status-summary-item${listTab === s.key ? ' active' : ''}" onclick="setTodoListTab('${s.key}')">
              <span class="todo-status-summary-dot" style="background:${s.color};"></span>
              <span>${s.label}</span>
              <span class="todo-status-summary-num">${s.count}</span>
            </button>
          `).join('')}
        </div>

        <div class="todo-filter-bar">
          <div class="todo-field todo-field-grow">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="请输入任务标题" value="${esc(state.taskSearch || '')}"
              onchange="state.taskSearch=this.value;state.todoPage=1;render()" />
          </div>
          <div class="todo-field">
            <select onchange="state.todoTypeFilter=this.value;state.todoPage=1;render()">
              <option value="all" ${state.todoTypeFilter === 'all' ? 'selected' : ''}>全部类型</option>
              <option value="project" ${state.todoTypeFilter === 'project' ? 'selected' : ''}>项目任务</option>
              <option value="temp" ${state.todoTypeFilter === 'temp' ? 'selected' : ''}>临时任务</option>
            </select>
          </div>
          <div class="todo-field">
            <select onchange="setTaskProjectTab(this.value)">
              ${projectTabs.map(tab => `<option value="${esc(String(tab.id))}" ${projectTab === tab.id ? 'selected' : ''}>${esc(tab.label)}（${tab.count}）</option>`).join('')}
            </select>
          </div>
          <div class="todo-field">
            <select onchange="state.todoPriorityFilter=this.value;state.todoPage=1;render()">
              <option value="all" ${state.todoPriorityFilter === 'all' ? 'selected' : ''}>全部优先级</option>
              <option value="urgent" ${state.todoPriorityFilter === 'urgent' ? 'selected' : ''}>紧急</option>
              <option value="important" ${state.todoPriorityFilter === 'important' ? 'selected' : ''}>重要</option>
              <option value="normal" ${state.todoPriorityFilter === 'normal' ? 'selected' : ''}>普通</option>
            </select>
          </div>
          <div class="todo-field">
            <select onchange="state.todoDueFilter=this.value;state.todoPage=1;render()">
              <option value="all" ${state.todoDueFilter === 'all' ? 'selected' : ''}>全部到期</option>
              <option value="today" ${state.todoDueFilter === 'today' ? 'selected' : ''}>今天</option>
              <option value="week" ${state.todoDueFilter === 'week' ? 'selected' : ''}>本周</option>
              <option value="overdue" ${state.todoDueFilter === 'overdue' ? 'selected' : ''}>已延期</option>
            </select>
          </div>
          <button type="button" class="btn btn-ghost" onclick="resetTodoFilters()"><i class="fas fa-rotate-right"></i> 重置</button>
        </div>

        <div class="project-list-count">共 ${list.length} 条</div>
        ${viewLayout === 'board'
          ? `<div class="todo-board-wrap">${renderTodoBoardView(list)}</div>`
          : renderTodoListView(list)}
      </div>`;
  }

  function setTeamSort(key) {
    state.teamSort = key;
    render();
  }

  function renderTeam() {
    let members = state.members.slice();
    const q = (state.teamSearch || '').trim().toLowerCase();
    if (q) members = members.filter(m => (m.name + m.dept).toLowerCase().includes(q));

    const memberStats = members.map(m => {
      const ut = state.tasks.filter(t => t.assignee === m.name);
      const total = ut.length;
      const doing = ut.filter(t => t.status === 'doing').length;
      const todo = ut.filter(t => t.status === 'todo').length;
      const done = ut.filter(t => t.status === 'done').length;
      const overdue = ut.filter(isOverdue).length;
      const weeklyHours = m.hours;
      const standardWeekHours = m.std;
      const saturation = Math.min(100, Math.round(weeklyHours / standardWeekHours * 100));
      const completionRate = total > 0 ? Math.round(done / total * 100) : 0;
      return { ...m, total, doing, todo, done, overdue, weeklyHours, standardWeekHours, saturation, completionRate, originalPlannedHours: Math.round(weeklyHours * 1.1) };
    });

    const sort = state.teamSort || 'saturation_desc';
    memberStats.sort((a, b) => {
      if (sort === 'saturation_asc') return a.saturation - b.saturation || a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'weeklyHours_desc') return b.weeklyHours - a.weeklyHours || a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'weeklyHours_asc') return a.weeklyHours - b.weeklyHours || a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      return b.saturation - a.saturation || b.weeklyHours - a.weeklyHours || a.name.localeCompare(b.name, 'zh-CN');
    });

    const allDeptTasks = state.tasks.filter(t => state.members.some(u => u.name === t.assignee));
    const totalTasks = allDeptTasks.length;
    const totalDone = allDeptTasks.filter(t => t.status === 'done').length;
    const totalDoing = allDeptTasks.filter(t => t.status === 'doing').length;
    const totalTodo = allDeptTasks.filter(t => t.status === 'todo').length;
    const totalOverdue = allDeptTasks.filter(isOverdue).length;
    const tempTasks = allDeptTasks.filter(t => t.type === 'temp').length;
    const normalTasks = allDeptTasks.filter(t => t.type === 'normal').length;
    const normalPct = totalTasks ? Math.round(normalTasks / totalTasks * 100) : 0;
    const tempPct = totalTasks ? Math.round(tempTasks / totalTasks * 100) : 0;
    const donePct = totalTasks ? Math.round(totalDone / totalTasks * 100) : 0;
    const weekStart = addDays(-((new Date().getDay() + 6) % 7));
    const weekEnd = addDays(6 - ((new Date().getDay() + 6) % 7));

    const teamSortOptions = [
      { key: 'saturation_desc', label: '当周饱和度从高到低' },
      { key: 'saturation_asc', label: '当周饱和度从低到高' },
      { key: 'weeklyHours_desc', label: '当周工时从高到低' },
      { key: 'weeklyHours_asc', label: '当周工时从低到高' },
      { key: 'name', label: '姓名 A-Z' },
    ];

    return `
      <div class="team-page">
        <div class="team-page-toolbar">
          <div class="team-filter-tabs">
            <button type="button" class="team-filter-tab is-active"><i class="fas fa-building" style="margin-right:4px;font-size:11px;"></i>信息中心 <span class="tab-count">${state.members.length}</span></button>
          </div>
          <div style="position:relative;">
            <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-light);font-size:13px;"></i>
            <input class="input" style="width:240px;padding-left:36px;" placeholder="搜索成员姓名..." value="${esc(state.teamSearch || '')}" onchange="state.teamSearch=this.value;render()">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:20px;">
          <div class="stat-card">
            <div class="stat-icon" style="background:var(--brand-soft);color:var(--brand);"><i class="fas fa-tasks"></i></div>
            <div class="stat-value">${totalTasks}</div>
            <div class="stat-label">总任务数</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background:#ECFDF5;color:#059669;"><i class="fas fa-check-circle"></i></div>
            <div class="stat-value">${totalDone}</div>
            <div class="stat-label">已完成</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background:#EFF6FF;color:#2563EB;"><i class="fas fa-spinner"></i></div>
            <div class="stat-value">${totalDoing}</div>
            <div class="stat-label">进行中</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background:var(--border-light);color:var(--text-muted);"><i class="fas fa-clock"></i></div>
            <div class="stat-value">${totalTodo}</div>
            <div class="stat-label">待开始</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background:#FEF2F2;color:#DC2626;"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="stat-value">${totalOverdue}</div>
            <div class="stat-label">已逾期</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div class="panel">
            <div class="panel-header">
              <span class="panel-title"><i class="fas fa-chart-pie" style="color:var(--brand);"></i>任务类型分布</span>
            </div>
            <div class="panel-body">
              <div style="display:flex;gap:14px;">
                <div class="team-type-chip">
                  <div class="chip-value">${normalTasks}</div>
                  <div class="chip-label">常规任务</div>
                  <div class="chip-bar"><span style="width:${normalPct}%;"></span></div>
                </div>
                <div class="team-type-chip is-temp">
                  <div class="chip-value">${tempTasks}</div>
                  <div class="chip-label">临时任务</div>
                  <div class="chip-bar"><span style="width:${tempPct}%;"></span></div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <span class="panel-title"><i class="fas fa-chart-bar" style="color:var(--brand);"></i>任务完成情况</span>
            </div>
            <div class="panel-body">
              <div style="text-align:center;margin-bottom:16px;">
                <div style="position:relative;width:120px;height:120px;margin:0 auto;">
                  <svg style="width:120px;height:120px;transform:rotate(-90deg);">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="12"/>
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand)" stroke-width="12"
                      stroke-dasharray="${2 * Math.PI * 50}" stroke-dashoffset="${2 * Math.PI * 50 * (1 - (totalTasks > 0 ? totalDone / totalTasks : 0))}"/>
                  </svg>
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
                    <span style="font-size:24px;font-weight:700;color:var(--text);">${donePct}%</span>
                    <span style="font-size:11px;color:var(--text-light);">完成率</span>
                  </div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="team-complete-mini is-done">
                  <div class="mini-value">${totalDone}</div>
                  <div class="mini-label">已完成</div>
                </div>
                <div class="team-complete-mini is-todo">
                  <div class="mini-value">${totalTasks - totalDone}</div>
                  <div class="mini-label">未完成</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-bottom:24px;">
          <div class="panel-header" style="flex-wrap:wrap;gap:12px;">
            <span class="panel-title"><i class="fas fa-users" style="color:var(--brand);"></i>团队成员工作饱和度 (信息中心)</span>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto;">
              <span style="font-size:12px;color:var(--text-light);white-space:nowrap;"><i class="fas fa-sort-amount-down" style="margin-right:4px;"></i>排序</span>
              ${teamSortOptions.map(opt => `
                <button type="button" class="team-sort-btn${sort === opt.key ? ' is-active' : ''}" onclick="setTeamSort('${opt.key}')">${opt.label}</button>
              `).join('')}
            </div>
          </div>
          <div class="team-period-note">
            统计周期：${weekStart} ~ ${weekEnd}（当周周一至周日）· 财务中心为通知联系人，不在团队页展示
          </div>
          <div class="panel-body" style="padding:16px;">
            <div class="team-member-grid">
              ${memberStats.map(m => {
                let satColor = '#059669';
                let satBg = 'rgba(5,150,105,0.12)';
                let satLabel = '空闲';
                if (m.saturation >= 80) { satColor = '#DC2626'; satBg = 'rgba(220,38,38,0.12)'; satLabel = '饱和'; }
                else if (m.saturation >= 50) { satColor = '#E8A84A'; satBg = 'rgba(232,168,74,0.16)'; satLabel = '适中'; }
                else if (m.saturation >= 20) { satColor = '#3D4A8C'; satBg = 'var(--brand-soft)'; satLabel = '正常'; }
                const rateColor = m.completionRate >= 80 ? '#059669' : m.completionRate >= 50 ? '#E8A84A' : '#DC2626';
                const isNonStaff = m.role !== 'staff';
                return `
                  <div class="team-member-card" onclick="showMemberKanban('${esc(m.name)}')" title="点击查看${esc(m.name)}的任务看板">
                    <div class="team-member-card-head">
                      <div class="team-member-avatar">${esc(m.name.charAt(0))}</div>
                      <div style="flex:1;min-width:0;">
                        <div class="team-member-name">${esc(m.name)}</div>
                        <div class="team-member-dept">${esc(m.dept)}</div>
                        <span class="role-badge ${roleBadgeClass(m.role)}" style="margin-top:4px;">${esc(roleDisplayName(m.role))}</span>
                      </div>
                      <span class="team-sat-tag" style="background:${satBg};color:${satColor};">${satLabel}</span>
                    </div>
                    <div style="margin-bottom:12px;">
                      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:12px;color:var(--text-muted);">当周工时饱和度</span>
                        <span style="font-size:12px;font-weight:600;color:${satColor};">${m.saturation}%</span>
                      </div>
                      <div class="team-sat-bar"><span style="width:${Math.min(m.saturation, 100)}%;background:${satColor};"></span></div>
                      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--text-light);flex-wrap:wrap;gap:4px;">
                        <span>本周原计划：${m.originalPlannedHours}h</span>
                        <span>标准：${m.standardWeekHours}h/周</span>
                      </div>
                      <div style="margin-top:2px;font-size:11px;color:var(--text-light);">
                        <span>当周待处理：${m.weeklyHours}h</span>
                      </div>
                    </div>
                    <div class="team-member-metrics">
                      <div class="team-metric">
                        <div class="metric-value">${m.total}</div>
                        <div class="metric-label">总任务</div>
                      </div>
                      <div class="team-metric">
                        <div class="metric-value" style="color:#2563EB;">${m.doing}</div>
                        <div class="metric-label">进行中</div>
                      </div>
                      <div class="team-metric">
                        <div class="metric-value" style="color:#059669;">${m.done}</div>
                        <div class="metric-label">已完成</div>
                      </div>
                      <div class="team-metric${m.overdue > 0 ? ' is-overdue' : ''}">
                        <div class="metric-value"${m.overdue > 0 ? '' : ' style="color:var(--text-light);"'}>${m.overdue}</div>
                        <div class="metric-label">已逾期</div>
                      </div>
                    </div>
                    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                      <span style="color:var(--text-light);">完成率</span>
                      <span style="font-weight:500;color:${rateColor};">${m.completionRate}%</span>
                    </div>
                    <div class="team-member-footer">
                      <i class="fas fa-columns" style="margin-right:4px;"></i>${isNonStaff ? '查看管理岗任务看板' : '查看任务看板'}
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>`;
  }

  function updateTaskStatus(id, status) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (isMilestoneTask(t)) {
      const kids = state.tasks.filter(x => x.parentId === t.id && x.status !== 'abolished');
      if (status === 'done' && kids.some(k => k.status !== 'done')) {
        alert('里程碑下仍有未完成任务，全部完成后方可完成里程碑');
        return;
      }
    }
    if (t.intake && (status === 'doing' || status === 'done') && !(t.hours > 0)) {
      const raw = prompt('表单提报任务须先填写预计工时（小时）：', '2');
      if (raw === null) return;
      const h = Number(String(raw).trim());
      if (!Number.isFinite(h) || h <= 0) { alert('请输入大于 0 的预计工时'); return; }
      t.hours = h;
    }
    t.status = status;
    if (status === 'doing') t.progress = Math.max(t.progress || 0, 10);
    if (status === 'done') t.progress = 100;
    if (status === 'paused') toast('已暂停：' + t.title);
    else if (status === 'done') toast('已完成：' + t.title);
    else toast('已开始：' + t.title);
    render();
  }

  function viewProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    state.prevPage = state.page === 'projectDetail' ? (state.prevPage || 'projects') : state.page;
    state.detailProjectId = id;
    state.projectPlanFilter = 'all';
    state.page = 'projectDetail';
    state.settingsOpen = false;
    render();
  }

  function updateProjectStatus(id, status) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    p.status = status;
    toast('项目状态已更新为：' + ({ planning: '规划中', active: '进行中', paused: '已暂停', done: '已完成' }[status] || status));
    render();
  }

  function showProjectModal() {
    state.form = {
      name: '',
      desc: '',
      dept: '信息中心',
      manager: ME.name,
      endDate: addDays(30),
      startDate: todayStr(),
      members: [],
    };
    state.modal = { type: 'projectCreate' };
    render();
  }

  function editProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    state.form = {
      id: p.id,
      name: p.name || '',
      desc: p.desc || '',
      dept: p.dept || '信息中心',
      manager: p.manager || ME.name,
      status: p.status || 'active',
      startDate: p.startDate || todayStr(),
      endDate: p.endDate || addDays(30),
      members: (p.members || []).slice(),
    };
    state.modal = { type: 'projectEdit' };
    render();
  }

  function saveProjectCreate() {
    const name = (document.getElementById('pfName') || {}).value;
    const desc = (document.getElementById('pfDesc') || {}).value;
    const manager = (document.getElementById('pfManager') || {}).value;
    const endDate = (document.getElementById('pfEnd') || {}).value;
    const title = String(name || '').trim();
    if (!title) { alert('请填写项目名称'); return; }
    const id = 'PRJ-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    state.projects.unshift({
      id,
      name: title,
      desc: String(desc || '').trim(),
      dept: '信息中心',
      manager: manager || ME.name,
      status: 'planning',
      startDate: todayStr(),
      endDate: endDate || addDays(30),
      members: [manager || ME.name].filter(Boolean),
    });
    state.modal = null;
    state.form = null;
    toast('已创建项目');
    viewProject(id);
  }

  function saveProjectEdit() {
    const f = state.form || {};
    const p = state.projects.find(x => x.id === f.id);
    if (!p) return;
    const name = (document.getElementById('pfName') || {}).value;
    const desc = (document.getElementById('pfDesc') || {}).value;
    const manager = (document.getElementById('pfManager') || {}).value;
    const endDate = (document.getElementById('pfEnd') || {}).value;
    const status = (document.getElementById('pfStatus') || {}).value;
    const title = String(name || '').trim();
    if (!title) { alert('请填写项目名称'); return; }
    p.name = title;
    p.desc = String(desc || '').trim();
    p.manager = manager || p.manager;
    p.endDate = endDate || p.endDate;
    p.status = status || p.status;
    state.modal = null;
    state.form = null;
    toast('已保存项目');
    render();
  }

  function renderProjectDetail() {
    const project = state.projects.find(p => p.id === state.detailProjectId);
    if (!project) return renderProjects();
    const stats = getProjectListStats(project);
    const accent = getProjectAccentColor(project);
    const memberNames = [project.manager].concat(project.members || []).filter((n, i, arr) => n && arr.indexOf(n) === i);
    const projectStatusMap = {
      planning: { label: '规划中', color: '#6366F1', bg: '#EEF2FF', icon: 'fa-drafting-compass' },
      active: { label: '进行中', color: '#10B981', bg: '#ECFDF5', icon: 'fa-play-circle' },
      paused: { label: '已暂停', color: '#6B7280', bg: '#F3F4F6', icon: 'fa-pause-circle' },
      done: { label: '已完成', color: '#059669', bg: '#D1FAE5', icon: 'fa-check-circle' },
    };
    const milestones = state.tasks.filter(t => t.projectId === project.id && isMilestoneTask(t) && t.status !== 'abolished');
    const leaves = state.tasks.filter(t => t.projectId === project.id && !isMilestoneTask(t) && t.status !== 'abolished');
    const filter = state.projectPlanFilter || 'all';
    const filterLeaves = (list) => (filter === 'mine' ? list.filter(t => t.assignee === ME.name) : list);

    const memberRows = memberNames.map(name => {
      const user = state.members.find(u => u.name === name);
      const isManager = project.manager === name;
      const roleLabel = isManager ? '项目经理' : (user ? roleDisplayName(user.role) : '团队成员');
      return `
        <div class="project-member-row">
          <span class="person-avatar" style="width:36px;height:36px;background:${avatarColor(name)};">${esc(String(name).charAt(0))}</span>
          <div style="min-width:0;flex:1;">
            <div class="project-member-name">${esc(name)}</div>
            <div class="project-member-role">${esc(roleLabel)}</div>
          </div>
        </div>`;
    }).join('');

    const renderLeafRow = (task) => `
      <div class="project-plan-task" onclick="viewTask('${task.id}')" style="cursor:pointer;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:#fff;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="priority-dot priority-${task.priority || 'normal'}"></span>
          <strong style="font-size:13px;">${esc(task.title)}</strong>
          ${statusTag(task.status)}
          ${isOverdue(task) ? '<span class="tag" style="background:#FEE2E2;color:#DC2626;">已逾期</span>' : ''}
        </div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;">
          <span><i class="fas fa-user" style="margin-right:4px;"></i>${esc(task.assignee || '-')}</span>
          <span><i class="fas fa-calendar" style="margin-right:4px;"></i>${esc(task.dueDate || '-')}</span>
          <span>进度 ${task.progress || 0}%</span>
        </div>
      </div>`;

    let planHtml = '';
    if (milestones.length) {
      planHtml = milestones.map(ms => {
        const kids = filterLeaves(leaves.filter(t => t.parentId === ms.id));
        return `
          <div class="panel" style="margin-bottom:12px;">
            <div class="panel-header" style="cursor:default;">
              <span class="panel-title"><i class="fas fa-flag" style="color:#2563EB;margin-right:6px;"></i>${esc(ms.title)} ${statusTag(ms.status)}</span>
              <button type="button" class="btn btn-ghost btn-sm" onclick="viewTask('${ms.id}')"><i class="fas fa-eye"></i></button>
            </div>
            <div class="panel-body" style="display:flex;flex-direction:column;gap:8px;">
              ${kids.length ? kids.map(renderLeafRow).join('') : '<div style="font-size:12px;color:#9CA3AF;">该里程碑下暂无任务</div>'}
            </div>
          </div>`;
      }).join('');
      const orphans = filterLeaves(leaves.filter(t => !t.parentId || !milestones.some(m => m.id === t.parentId)));
      if (orphans.length) {
        planHtml += `
          <div class="panel" style="margin-bottom:12px;">
            <div class="panel-header"><span class="panel-title">未归入里程碑的任务</span></div>
            <div class="panel-body" style="display:flex;flex-direction:column;gap:8px;">${orphans.map(renderLeafRow).join('')}</div>
          </div>`;
      }
    } else {
      const list = filterLeaves(leaves);
      planHtml = list.length
        ? `<div class="panel"><div class="panel-body" style="display:flex;flex-direction:column;gap:8px;">${list.map(renderLeafRow).join('')}</div></div>`
        : renderEmptyState({ icon: 'fa-flag', title: '暂无任务计划', hint: '可先新建里程碑，再在里程碑下添加任务' });
    }

    return `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="goBack()"><i class="fas fa-arrow-left"></i>返回项目列表</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-ghost btn-sm" onclick="editProject('${project.id}')" title="编辑项目"><i class="fas fa-edit"></i>编辑</button>
          </div>
        </div>

        <div class="project-hero">
          <div class="project-hero-top">
            <div class="project-hero-identity">
              ${renderProjectIconTile(project)}
              <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <h2 class="project-hero-title" style="margin:0;">${esc(project.name || '')}</h2>
                  ${renderProjectStatusDot(project.status)}
                </div>
                <div class="project-hero-desc" style="margin-top:6px;">${esc(project.desc || '暂无描述')}</div>
                <div class="project-hero-meta">
                  <span><i class="fas fa-building"></i>${esc(project.dept || '-')}</span>
                  <span><i class="fas fa-calendar"></i>${esc((project.startDate || '-') + ' ~ ' + (project.endDate || '-'))}</span>
                  <span style="font-family:monospace;font-size:12px;color:#9CA3AF;">${esc(project.id || '')}</span>
                </div>
              </div>
            </div>
            <div class="project-hero-stats-row">
              <div><div class="v">${stats.mainCount}</div><div class="l">里程碑</div></div>
              <div><div class="v">${stats.mainDone}</div><div class="l">已完成</div></div>
              <div><div class="v">${memberNames.length}</div><div class="l">成员</div></div>
            </div>
            ${stats.overdue ? `<p class="project-hero-overdue-hint"><i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>有 ${stats.overdue} 个延期任务</p>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:12px;color:var(--text-muted);">整体进度</span>
              <span style="font-size:12px;font-weight:600;">${stats.mainProgress}%</span>
            </div>
            <div class="progress-bar" style="height:8px;"><div class="progress-fill" style="width:${stats.mainProgress}%;background:${accent};"></div></div>
            <div style="margin-top:12px;padding:12px;background:#F9FAFB;border-radius:8px;">
              <div style="font-size:12px;color:#9CA3AF;margin-bottom:8px;">项目状态</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${Object.entries(projectStatusMap).map(([key, val]) => `
                  <button onclick="updateProjectStatus('${project.id}', '${key}')" style="padding:6px 14px;border-radius:6px;border:1px solid ${project.status === key ? val.color : '#E5E7EB'};background:${project.status === key ? val.bg : '#fff'};color:${project.status === key ? val.color : '#6B7280'};cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                    <i class="fas ${val.icon}"></i>${val.label}
                  </button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="project-detail-layout" style="display:grid;grid-template-columns:minmax(220px,260px) 1fr;gap:16px;margin-top:16px;">
          <div class="project-detail-side">
            <section>
              <h3 class="project-detail-section-title">项目成员</h3>
              <div class="project-member-panel">
                <div class="project-member-list">${memberRows || '<div class="project-member-row" style="color:var(--text-muted);font-size:12px;">暂无成员</div>'}</div>
              </div>
            </section>
          </div>
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:15px;">任务计划</h3>
              <div class="scope-seg">
                <button type="button" class="${filter === 'all' ? 'active' : ''}" onclick="state.projectPlanFilter='all';render()">全部任务</button>
                <button type="button" class="${filter === 'mine' ? 'active' : ''}" onclick="state.projectPlanFilter='mine';render()">我的任务</button>
              </div>
            </div>
            ${planHtml}
          </div>
        </div>
      </div>`;
  }

  function viewTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    state.modal = { type: 'task', taskId: id };
    render();
  }

  function viewTaskFromTeamKanban(id) {
    const m = state.modal && state.modal.type === 'memberKanban' ? state.modal.memberName : null;
    if (m) state.returnToMemberName = m;
    viewTask(id);
  }

  function editTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    state.form = {
      id: t.id,
      title: t.title || '',
      assignee: t.assignee || ME.name,
      priority: t.priority || 'normal',
      dueDate: t.dueDate || '',
      desc: t.desc || '',
      progress: t.progress || 0,
      hours: t.hours || 0,
    };
    state.modal = { type: 'taskEdit', taskId: id };
    render();
  }

  function saveTaskEdit() {
    const f = state.form || {};
    const t = state.tasks.find(x => x.id === f.id);
    if (!t) return;
    const title = String((document.getElementById('tfTitle') || {}).value || '').trim();
    if (!title) { alert('请填写任务标题'); return; }
    t.title = title;
    t.assignee = (document.getElementById('tfAssignee') || {}).value || t.assignee;
    t.priority = (document.getElementById('tfPriority') || {}).value || t.priority;
    t.dueDate = (document.getElementById('tfDue') || {}).value || t.dueDate;
    t.desc = String((document.getElementById('tfDesc') || {}).value || '').trim();
    const prog = Number((document.getElementById('tfProgress') || {}).value);
    if (Number.isFinite(prog)) t.progress = Math.max(0, Math.min(100, prog));
    const hours = Number((document.getElementById('tfHours') || {}).value);
    if (Number.isFinite(hours) && hours >= 0) t.hours = hours;
    state.modal = null;
    state.form = null;
    toast('已保存任务');
    render();
  }

  function abolishTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (!confirm('确认作废任务「' + t.title + '」？')) return;
    t.status = 'abolished';
    toast('已作废：' + t.title);
    if (state.modal && state.modal.taskId === id) state.modal = null;
    render();
  }

  function showMemberKanban(name) {
    state.returnToMemberName = null;
    state.modal = { type: 'memberKanban', memberName: name };
    render();
  }

  function openIntakeModal() {
    state.modal = { type: 'intake' };
    render();
  }

  function closeModal() {
    const back = state.returnToMemberName;
    state.modal = null;
    state.form = null;
    if (back) {
      state.returnToMemberName = null;
      state.modal = { type: 'memberKanban', memberName: back };
    }
    render();
  }

  function submitIntake() {
    const title = document.getElementById('fTitle').value.trim();
    if (!title) { alert('请填写事项标题'); return; }
    const system = document.getElementById('fSystem').value;
    const submitter = document.getElementById('fSubmitter').value;
    const priority = document.getElementById('fPri').value;
    const desc = document.getElementById('fDesc').value.trim();
    const id = 'T-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    state.tasks.unshift(mkTask({
      id, title, projectId: '', assignee: ME.name, status: 'todo', priority,
      type: 'temp', intake: true, submitter, system, desc, dueDate: addDays(1),
    }));
    state.activities.unshift({
      icon: 'fa-file-alt',
      text: `${submitter}提报「${title}」`,
      meta: '表单提报 · 刚刚',
    });
    state.modal = null;
    state.page = 'dashboard';
    render();
    toast('表单已提报 → 工作台新增待办');
  }

  function renderProjectFormModal(isEdit) {
    const f = state.form || {};
    const managers = state.members.map(m => m.name);
    return `
      <div class="modal-mask" onclick="if(event.target===this)closeModal()">
        <div class="modal-box">
          <div class="modal-header">
            <strong><i class="fas fa-folder" style="color:var(--brand);margin-right:8px;"></i>${isEdit ? '编辑项目' : '新建项目'}</strong>
            <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <div class="field"><label>项目名称</label><input class="input" id="pfName" value="${esc(f.name || '')}" placeholder="输入项目名称" /></div>
            <div class="field"><label>项目描述</label><textarea class="textarea" id="pfDesc">${esc(f.desc || '')}</textarea></div>
            <div class="field"><label>负责人</label><select class="select" id="pfManager">${managers.map(n => `<option value="${esc(n)}" ${(f.manager || ME.name) === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
            <div class="field"><label>截止日期</label><input class="input" id="pfEnd" type="date" value="${esc(f.endDate || '')}" /></div>
            ${isEdit ? `<div class="field"><label>状态</label><select class="select" id="pfStatus">
              <option value="planning" ${f.status === 'planning' ? 'selected' : ''}>规划中</option>
              <option value="active" ${f.status === 'active' ? 'selected' : ''}>进行中</option>
              <option value="paused" ${f.status === 'paused' ? 'selected' : ''}>已暂停</option>
              <option value="done" ${f.status === 'done' ? 'selected' : ''}>已完成</option>
            </select></div>` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal()">取消</button>
            <button class="btn btn-primary" onclick="${isEdit ? 'saveProjectEdit()' : 'saveProjectCreate()'}">保存</button>
          </div>
        </div>
      </div>`;
  }

  function renderMemberKanbanModal() {
    const name = state.modal.memberName;
    const member = state.members.find(m => m.name === name);
    if (!member) return '';
    const memberTasks = state.tasks.filter(t => !isMilestoneTask(t) && t.assignee === name && t.status !== 'abolished');
    const todoTasks = memberTasks.filter(t => t.status === 'todo');
    const doingTasks = memberTasks.filter(t => t.status === 'doing');
    const doneTasks = memberTasks.filter(t => t.status === 'done');
    const otherTasks = memberTasks.filter(t => !['todo', 'doing', 'done'].includes(t.status));
    const columns = [
      { key: 'todo', label: '待开始', tasks: todoTasks, color: '#6B7280', icon: 'fa-clock' },
      { key: 'doing', label: '进行中', tasks: doingTasks, color: '#2563EB', icon: 'fa-spinner' },
      { key: 'done', label: '已完成', tasks: doneTasks, color: '#059669', icon: 'fa-check-circle' },
      { key: 'other', label: '其他', tasks: otherTasks, color: '#D97706', icon: 'fa-ellipsis-h' },
    ];
    const weekStart = addDays(-((new Date().getDay() + 6) % 7));
    const weekEnd = addDays(6 - ((new Date().getDay() + 6) % 7));
    return `
      <div class="modal-mask" onclick="if(event.target===this)closeModal()">
        <div class="modal-box" style="max-width:1100px;width:95vw;">
          <div class="modal-header">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="member-kanban-avatar">${esc(member.name.charAt(0))}</div>
                <div>
                  <strong>${esc(member.name)} · 任务看板</strong>
                  <div style="font-size:12px;color:var(--text-light);margin-top:2px;">
                    ${esc(member.dept)} · <span class="role-badge ${roleBadgeClass(member.role)}">${esc(roleDisplayName(member.role))}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">统计周期：${weekStart} ~ ${weekEnd}</div>
                </div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-bottom:20px;">
              <div class="member-kanban-stat"><div class="stat-num">${memberTasks.length}</div><div class="stat-cap">总任务</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#2563EB;">${doingTasks.length}</div><div class="stat-cap">进行中</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#DC2626;">${memberTasks.filter(isOverdue).length}</div><div class="stat-cap">已逾期</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#059669;">${memberTasks.length ? Math.round(doneTasks.length / memberTasks.length * 100) : 0}%</div><div class="stat-cap">完成率</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:var(--brand);">${Math.round(member.hours * 1.1)}h</div><div class="stat-cap">本周原计划</div></div>
              <div class="member-kanban-stat"><div class="stat-num" style="color:#E8A84A;">${member.hours}h</div><div class="stat-cap">当周待处理</div></div>
            </div>
            ${memberTasks.length === 0 ? '<div style="text-align:center;padding:48px;color:#9CA3AF;">暂无相关任务</div>' : `
              <div class="kanban-board">
                ${columns.map(col => `
                  <div class="kanban-column">
                    <div class="kanban-column-header" style="border-top:3px solid ${col.color};">
                      <span><i class="fas ${col.icon}" style="color:${col.color};margin-right:6px;"></i>${col.label}</span>
                      <span class="kanban-count">${col.tasks.length}</span>
                    </div>
                    <div class="kanban-column-body">
                      ${col.tasks.length ? col.tasks.map(task => `
                        <div class="kanban-card" onclick="viewTaskFromTeamKanban('${task.id}')" style="${isOverdue(task) ? 'border-color:#FECACA;background:#FFFBFB;' : ''}">
                          <div class="kanban-card-header">
                            <span class="priority-dot priority-${task.priority || 'normal'}"></span>
                            <span class="kanban-card-title">${esc(task.title)}</span>
                            ${task.intake ? '<span class="tag" style="font-size:10px;background:#ECFDF5;color:#059669;">表单</span>' : ''}
                          </div>
                          <div class="kanban-card-meta">
                            <span><i class="fas fa-folder" style="margin-right:4px;"></i>${esc(projectName(task.projectId))}</span>
                            <span style="${isOverdue(task) ? 'color:#DC2626;' : ''}"><i class="fas fa-calendar" style="margin-right:4px;"></i>${esc(task.dueDate || '-')}</span>
                          </div>
                          <div class="kanban-card-footer">
                            ${statusTag(task.status)}
                            <span style="font-size:10px;color:#9CA3AF;">${task.hours || 0}h</span>
                          </div>
                        </div>`).join('') : '<div class="kanban-empty">暂无</div>'}
                    </div>
                  </div>`).join('')}
              </div>`}
          </div>
        </div>
      </div>`;
  }

  function renderModal() {
    if (!state.modal) return '';
    if (state.modal.type === 'intake') {
      return `
        <div class="modal-mask" onclick="if(event.target===this)closeModal()">
          <div class="modal-box">
            <div class="modal-header">
              <strong><i class="fas fa-file-alt" style="color:var(--brand);margin-right:8px;"></i>模拟钉钉 AI 表格提报</strong>
              <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <div class="field"><label>事项标题</label><input class="input" id="fTitle" value="【演示】现场提报 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}" /></div>
              <div class="field"><label>系统</label><select class="select" id="fSystem"><option>NCC</option><option>总账</option><option>其它</option></select></div>
              <div class="field"><label>提单人（财务联系人）</label><select class="select" id="fSubmitter">${state.contacts.map(c => `<option>${esc(c.name)}</option>`).join('')}</select></div>
              <div class="field"><label>优先级</label><select class="select" id="fPri"><option value="important">重要</option><option value="urgent">紧急</option><option value="normal">普通</option></select></div>
              <div class="field"><label>详细说明</label><textarea class="textarea" id="fDesc">来自单文件演示的模拟提报。</textarea></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="closeModal()">取消</button>
              <button class="btn btn-primary" onclick="submitIntake()">提交并进入工作台</button>
            </div>
          </div>
        </div>`;
    }
    if (state.modal.type === 'projectCreate') return renderProjectFormModal(false);
    if (state.modal.type === 'projectEdit') return renderProjectFormModal(true);
    if (state.modal.type === 'memberKanban') return renderMemberKanbanModal();
    if (state.modal.type === 'taskEdit') {
      const f = state.form || {};
      const assignees = state.members.map(m => m.name);
      return `
        <div class="modal-mask" onclick="if(event.target===this)closeModal()">
          <div class="modal-box">
            <div class="modal-header">
              <strong>编辑任务</strong>
              <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <div class="field"><label>任务标题</label><input class="input" id="tfTitle" value="${esc(f.title || '')}" /></div>
              <div class="field"><label>负责人</label><select class="select" id="tfAssignee">${assignees.map(n => `<option value="${esc(n)}" ${f.assignee === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
              <div class="field"><label>优先级</label><select class="select" id="tfPriority">
                <option value="urgent" ${f.priority === 'urgent' ? 'selected' : ''}>紧急</option>
                <option value="important" ${f.priority === 'important' ? 'selected' : ''}>重要</option>
                <option value="normal" ${f.priority === 'normal' ? 'selected' : ''}>普通</option>
              </select></div>
              <div class="field"><label>截止日期</label><input class="input" type="date" id="tfDue" value="${esc(f.dueDate || '')}" /></div>
              <div class="field"><label>进度 %</label><input class="input" type="number" min="0" max="100" id="tfProgress" value="${esc(String(f.progress || 0))}" /></div>
              <div class="field"><label>预计工时</label><input class="input" type="number" min="0" id="tfHours" value="${esc(String(f.hours || 0))}" /></div>
              <div class="field"><label>说明</label><textarea class="textarea" id="tfDesc">${esc(f.desc || '')}</textarea></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="closeModal()">取消</button>
              <button class="btn btn-primary" onclick="saveTaskEdit()">保存</button>
            </div>
          </div>
        </div>`;
    }
    if (state.modal.type === 'task') {
      const t = state.tasks.find(x => x.id === state.modal.taskId);
      if (!t) return '';
      const parent = t.parentId ? state.tasks.find(x => x.id === t.parentId) : null;
      const children = state.tasks.filter(x => x.parentId === t.id && x.status !== 'abolished');
      const backBtn = state.returnToMemberName
        ? `<button class="btn btn-ghost" onclick="closeModal()"><i class="fas fa-arrow-left"></i> 返回看板</button>`
        : `<button class="btn btn-ghost" onclick="closeModal()">关闭</button>`;
      return `
        <div class="modal-mask" onclick="if(event.target===this)closeModal()">
          <div class="modal-box" style="max-width:560px;">
            <div class="modal-header">
              <strong>任务详情</strong>
              <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;">
                ${t.isMilestone ? '<span class="tag" style="background:#EFF6FF;color:#2563EB;"><i class="fas fa-flag"></i>里程碑</span>' : ''}
                ${t.intake ? '<span class="tag" style="background:#ECFDF5;color:#059669;">表单提报</span>' : ''}
                ${t.type === 'temp' ? '<span class="tag tag-temp">临时</span>' : ''}
                ${statusTag(t.status)}
                <span class="tag">${esc((priorityMap[t.priority] || priorityMap.normal).label)}</span>
              </div>
              <div style="font-size:18px;font-weight:700;margin-bottom:10px;">${esc(t.title)}</div>
              <div style="font-size:13px;color:var(--text-muted);line-height:1.8;margin-bottom:12px;">
                项目：${esc(projectName(t.projectId))}<br>
                负责人：${esc(t.assignee)}<br>
                ${t.submitter ? '提单人：' + esc(t.submitter) + '<br>' : ''}
                ${t.system ? '系统：' + esc(t.system) + '<br>' : ''}
                截止：${esc(t.dueDate || '—')}<br>
                预计工时：${t.hours || 0}h<br>
                ${parent ? '上级：' + esc(parent.title) + '<br>' : ''}
                ${t.desc ? '说明：' + esc(t.desc) : ''}
              </div>
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <span style="color:var(--text-muted);">进度</span><span>${t.progress || 0}%</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${t.progress || 0}%;"></div></div>
              </div>
              ${children.length ? `
                <div style="margin-top:8px;">
                  <div style="font-size:12px;font-weight:600;margin-bottom:6px;">子任务（${children.filter(c => c.status === 'done').length}/${children.length}）</div>
                  ${children.map(c => `
                    <div style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;" onclick="viewTask('${c.id}')">
                      ${esc(c.title)} · ${statusTag(c.status)}
                    </div>`).join('')}
                </div>` : ''}
            </div>
            <div class="modal-footer" style="flex-wrap:wrap;">
              ${t.status === 'todo' ? `<button class="btn btn-primary" onclick="updateTaskStatus('${t.id}','doing')"><i class="fas fa-play"></i> 开始</button>` : ''}
              ${t.status === 'doing' ? `<button class="btn btn-warning" onclick="updateTaskStatus('${t.id}','paused')"><i class="fas fa-pause"></i> 暂停</button>` : ''}
              ${t.status === 'doing' ? `<button class="btn btn-success" onclick="updateTaskStatus('${t.id}','done')"><i class="fas fa-check"></i> 完成</button>` : ''}
              ${t.status === 'paused' ? `<button class="btn btn-primary" onclick="updateTaskStatus('${t.id}','doing')"><i class="fas fa-play"></i> 继续</button>` : ''}
              <button class="btn btn-ghost" onclick="editTask('${t.id}')"><i class="fas fa-pen"></i> 编辑</button>
              ${t.status !== 'done' && t.status !== 'abolished' ? `<button class="btn btn-ghost" style="color:#DC2626;" onclick="abolishTask('${t.id}')"><i class="fas fa-trash-alt"></i> 作废</button>` : ''}
              ${backBtn}
            </div>
          </div>
        </div>`;
    }
    return '';
  }

  function renderPage() {
    if (state.page === 'dashboard') return renderWorkbenchHome();
    if (state.page === 'projects') return renderProjects();
    if (state.page === 'projectDetail') return renderProjectDetail();
    if (state.page === 'tasks') return renderTasks();
    if (state.page === 'team') return renderTeam();
    return renderWorkbenchHome();
  }

  function render() {
    const app = document.getElementById('app');
    if (!state.loggedIn) {
      app.innerHTML = renderDingTalkLoginGate();
      return;
    }
    app.innerHTML = `
      <div class="app-layout">
        ${renderSidebar()}
        <div class="main-area">
          ${renderHeader()}
          <div class="main-content">${renderPage()}</div>
        </div>
      </div>
      ${renderModal()}
    `;
  }

  window.enterDemo = enterDemo;
  window.logout = logout;
  window.goTo = goTo;
  window.goBack = goBack;
  window.toggleSettings = toggleSettings;
  window.resetData = () => resetData(false);
  window.openIntakeModal = openIntakeModal;
  window.closeModal = closeModal;
  window.submitIntake = submitIntake;
  window.updateTaskStatus = updateTaskStatus;
  window.viewTask = viewTask;
  window.viewTaskFromTeamKanban = viewTaskFromTeamKanban;
  window.editTask = editTask;
  window.saveTaskEdit = saveTaskEdit;
  window.abolishTask = abolishTask;
  window.viewProject = viewProject;
  window.editProject = editProject;
  window.showProjectModal = showProjectModal;
  window.saveProjectCreate = saveProjectCreate;
  window.saveProjectEdit = saveProjectEdit;
  window.updateProjectStatus = updateProjectStatus;
  window.showMemberKanban = showMemberKanban;
  window.setTeamSort = setTeamSort;
  window.resetProjectFilters = resetProjectFilters;
  window.goToTodoView = goToTodoView;
  window.setTodoListTab = setTodoListTab;
  window.setTodoViewLayout = setTodoViewLayout;
  window.setTaskProjectTab = setTaskProjectTab;
  window.setTaskScopeTab = setTaskScopeTab;
  window.resetTodoFilters = resetTodoFilters;
  window.setTodoPage = setTodoPage;
  window.setTodoPageSize = setTodoPageSize;
  window.handleTodoBoardDrop = handleTodoBoardDrop;
  window.render = render;
  window.state = state;
  window.toast = toast;

  resetData(true);
  render();
})();
