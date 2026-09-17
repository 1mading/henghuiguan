// ========== 渲染主框架 ==========
function captureUiScrollPositions() {
  const overlay = document.querySelector('.modal-overlay');
  const main = document.querySelector('.main-content');
  const liveMain = main ? main.scrollTop : 0;
  const liveWindow = window.scrollY || document.documentElement.scrollTop || 0;
  // 只在仍有有效滚动时更新记忆；弹窗打开后主区常被置 0，不能用 0 覆盖
  if (liveMain > 0) state.uiScrollMain = liveMain;
  if (liveWindow > 0) state.uiScrollWindow = liveWindow;
  const mainContent = liveMain > 0 ? liveMain : (Number(state.uiScrollMain) || 0);
  const windowY = liveWindow > 0 ? liveWindow : (Number(state.uiScrollWindow) || 0);
  return {
    mainContent,
    modalBox: overlay?.querySelector('.modal-box')?.scrollTop || 0,
    modalBody: overlay?.querySelector('.modal-body')?.scrollTop || 0,
    windowY,
    keepMain: mainContent > 0,
  };
}

function ensureMainScrollTracking() {
  const main = document.querySelector('.main-content');
  if (main && !main._scrollTracked) {
    main._scrollTracked = true;
    main.addEventListener('scroll', () => {
      if (main.scrollTop > 0) state.uiScrollMain = main.scrollTop;
    }, { passive: true });
  }
  if (!window._hhgWindowScrollTracked) {
    window._hhgWindowScrollTracked = true;
    window.addEventListener('scroll', () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y > 0) state.uiScrollWindow = y;
    }, { passive: true });
  }
}

function restoreUiScrollPositions(saved) {
  if (!saved) return;
  const targetMain = Number(saved.mainContent) || 0;
  const targetWindow = Number(saved.windowY) || 0;
  if (targetMain > 0) state.uiScrollMain = targetMain;
  if (targetWindow > 0) state.uiScrollWindow = targetWindow;

  const apply = () => {
    ensureMainScrollTracking();
    const main = document.querySelector('.main-content');
    if (main && targetMain > 0) {
      main.scrollTop = targetMain;
      // 勿用实际读回的 0 覆盖记忆（弹窗打开时主区可能暂时不可滚）
      if (main.scrollTop > 0) state.uiScrollMain = main.scrollTop;
      else state.uiScrollMain = targetMain;
    }
    const overlay = document.querySelector('.modal-overlay');
    const box = overlay?.querySelector('.modal-box');
    if (box) box.scrollTop = saved.modalBox || 0;
    const body = overlay?.querySelector('.modal-body');
    if (body) body.scrollTop = saved.modalBody || 0;
    if (targetWindow > 0) {
      window.scrollTo(0, targetWindow);
      state.uiScrollWindow = targetWindow;
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
  setTimeout(apply, 0);
  setTimeout(apply, 50);
  setTimeout(apply, 120);
  setTimeout(apply, 280);
}

function rememberMainScrollBeforeModal() {
  const main = document.querySelector('.main-content');
  if (main && main.scrollTop > 0) state.uiScrollMain = main.scrollTop;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  if (y > 0) state.uiScrollWindow = y;
}

/** 统一开弹窗：先记住滚动，再设 showModal 并 render */
function openAppModal(modalName, formPatch) {
  rememberMainScrollBeforeModal();
  if (formPatch && typeof formPatch === 'object') {
    state.form = { ...(state.form || {}), ...formPatch };
  }
  state.showModal = modalName;
  render();
}

/** 钉钉登录引导页（正式/分享演示：不展示演示账号切换） */
function renderDingTalkLoginGate() {
  const corpHint = DingTalkApi.corpId
    ? `<div style="margin-top:14px;font-size:12px;color:#94A3B8;">企业 CorpId 已配置，可从钉钉工作台免登进入</div>`
    : `<div style="margin-top:14px;font-size:12px;color:#F59E0B;">尚未读取到 CorpId，请确认后端钉钉配置后刷新</div>`;
  const err = state.authError
    ? `<div style="margin-top:18px;padding:12px 14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;color:#991B1B;font-size:13px;line-height:1.5;text-align:left;">
        <i class="fas fa-exclamation-circle" style="margin-right:6px;"></i>${state.authError}
      </div>`
    : '';
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const localPreviewBtn = isLocalHost
    ? `<button type="button" onclick="enterShareDemoPreview()" style="margin-top:12px;width:100%;padding:12px 16px;border:1px solid #0D9488;border-radius:10px;background:var(--bg-panel);color:#0D9488;font-size:14px;font-weight:600;cursor:pointer;">
          本地预演：进入工作台
        </button>
        <div style="margin-top:8px;font-size:11px;color:#94A3B8;line-height:1.5;">仅本机分享排练用；正式分享请从钉钉工作台打开</div>`
    : '';
  return `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px;background:linear-gradient(165deg,#0F766E 0%,#134E4A 42%,#0F172A 100%);font-family:inherit;">
      <div style="width:100%;max-width:420px;background:var(--bg-panel);border-radius:20px;padding:36px 32px 28px;box-shadow:0 24px 80px rgba(0,0,0,0.28);text-align:center;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,#14B8A6,#0D9488);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;">
          <i class="fas fa-comments"></i>
        </div>
        <div style="font-size:22px;font-weight:700;color:#0F172A;letter-spacing:0.02em;">恒慧管</div>
        <div style="margin-top:6px;font-size:13px;color:#64748B;">部门项目管控 · 钉钉登录</div>
        <div style="margin:22px 0 0;padding:16px;background:#F0FDFA;border:1px solid #99F6E4;border-radius:12px;text-align:left;font-size:13px;color:#115E59;line-height:1.7;">
          <div style="font-weight:600;margin-bottom:6px;"><i class="fas fa-shield-alt" style="margin-right:6px;"></i>请通过钉钉登录</div>
          <div>1. 打开钉钉 → 工作台 → 找到「恒慧管」</div>
          <div>2. 进入后自动完成免登，直达工作台</div>
          <div>3. 浏览器直接打开不会走钉钉身份，故无法登录</div>
        </div>
        ${err}
        ${corpHint}
        <button type="button" onclick="location.reload()" style="margin-top:22px;width:100%;padding:12px 16px;border:none;border-radius:10px;background:#0D9488;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">
          已从钉钉打开？点击刷新
        </button>
        ${localPreviewBtn}
        <div style="margin-top:14px;font-size:11px;color:#94A3B8;line-height:1.5;">正式入口：henghuiguan.handagroup.com</div>
      </div>
    </div>`;
}

async function enterShareDemoPreview() {
  try {
    const res = await fetch(ApiConfig.baseUrl + '/config/public', { signal: AbortSignal.timeout(8000) });
    const data = await parseJsonResponse(res);
    const uid = (data && data.shareDemoPreviewUserId) || '';
    if (!uid) {
      alert('未配置本地预演账号。请确认已用「启动分享演示」启动（端口 3001）。');
      return;
    }
    const result = await AuthService.loginByDingTalkUserId(uid, data.corpId || DingTalkApi.corpId);
    if (!result.success) {
      alert(result.message || '本地预演登录失败');
      return;
    }
    state.authError = null;
    if (ApiConfig.enabled && authSession.token && !DataService._serverReady) {
      await DataService.loadFromServer();
    }
    LiveRefresh.ensure();
    RealtimeService.ensure();
    render();
  } catch (e) {
    alert((e && e.message) || '本地预演进入失败');
  }
}

function render() {
  const app = document.getElementById('app');
  if (ApiConfig.enabled && AuthService.isDingTalkMode() && !authSession.token) {
    app.innerHTML = renderDingTalkLoginGate();
    return;
  }
  // 开弹窗前若尚未记住滚动，在整页重绘前再抓一次
  if (state.showModal) rememberMainScrollBeforeModal();
  const scrollPos = captureUiScrollPositions();
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-area">
        ${renderHeader()}
        <div class="main-content${state.page === 'nccMonitor' ? ' main-content--embed' : ''}">
          ${state.authError ? `
          <div class="alert-bar alert-danger" style="margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <span style="color:#991B1B;font-weight:500;"><i class="fas fa-user-lock" style="margin-right:6px;"></i>登录失败：${state.authError}</span>
              <button onclick="state.authError=null;render()" style="background:none;border:none;color:#991B1B;cursor:pointer;font-size:12px;">关闭</button>
            </div>
          </div>
          ` : ''}
          ${renderPage()}
        </div>
      </div>
    </div>
    ${state.showModal && !(state.showModal === 'taskEdit' && state.taskEditInline) ? renderModal() : ''}
    ${state.dingTalkSyncing ? `
    <div style="position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;">
      <div style="background:var(--bg-panel);border-radius:16px;padding:28px 32px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
        <i class="fas fa-sync-alt fa-spin" style="font-size:32px;color:#0D9488;margin-bottom:16px;display:block;"></i>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;">正在同步钉钉通讯录</div>
        <div style="font-size:13px;color:#6B7280;line-height:1.6;">人数较多时可能需要 1～3 分钟，请勿关闭页面</div>
      </div>
    </div>` : ''}
    ${renderMobileNav()}
  `;
  ensureMainScrollTracking();
  restoreUiScrollPositions(scrollPos);
  requestAnimationFrame(() => syncPersonSsUi());
  if (state.showModal === 'taskDetail' && state.form.taskId) {
    requestAnimationFrame(() => {
      hydrateAuthedImages(document.getElementById('app'));
      if (taskCommentMentionTaskId) positionTaskCommentMentionDropdown(taskCommentMentionTaskId);
    });
  } else {
    hideTaskCommentMentionDropdown();
  }
  if (state.page === 'projectDetail' && state.projectDetailTab === 'work') {
    requestAnimationFrame(() => {
      if (state.projectPlanView === 'gantt') mountProjectGantt();
      hydrateAuthedImages(document.getElementById('app'));
      if (state.inlineDeliveryEditId) {
        const el = document.getElementById('delivery-edit-anchor');
        if (el) el.scrollIntoView({ block: 'nearest' });
      }
    });
  }
  if (state.page === 'projectDetail' && state.planScrollAnchor) {
    const anchorId = state.planScrollAnchor;
    state.planScrollAnchor = null;
    requestAnimationFrame(() => {
      const el = document.getElementById(anchorId);
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }
}

function isLiteMorePage(page) {
  return ['more', 'staff', 'permissions', 'dataSecurity', 'archive', 'import', 'systemUpdates', 'kpiPlans'].includes(page);
}

function isProjectNavPage(page) {
  return page === 'projects' || page === 'projectDetail';
}

function isTeamNavPage(page) {
  return page === 'team';
}

function isTodoNavPage(page) {
  return page === 'tasks';
}

function isWorkbenchNavPage(page) {
  return page === 'dashboard';
}

function canShowTeamNav() {
  return getLiteMoreNavItems().some(i => i.key === 'team');
}

function getSettingsMenuItems() {
  return getLiteMoreNavItems().filter(item => item.key !== 'team' && item.key !== 'kpiPlans');
}

function toggleNavGroup(key) {
  if (!state.navOpen) state.navOpen = { todo: true, project: true, team: true, more: true };
  state.navOpen[key] = !state.navOpen[key];
  render();
}

function goToTodoView(mode) {
  state.todoViewMode = mode || 'all';
  state.todoPage = 1;
  state.taskScopeTab = 'mine';
  goTo('tasks');
}

function toggleSettingsMenu(ev) {
  if (ev) ev.stopPropagation();
  state.settingsOpen = !state.settingsOpen;
  if (state.settingsOpen) {
    state.inboxOpen = false;
    state.projectDetailMoreOpen = false;
    setTimeout(() => {
      document.addEventListener('click', closeSettingsOnOutsideClick, { once: true });
    }, 0);
  }
  render();
}

function closeSettingsMenu() {
  if (!state.settingsOpen) return;
  state.settingsOpen = false;
  render();
}

function closeSettingsOnOutsideClick() {
  if (state.settingsOpen) closeSettingsMenu();
}

function navigateFromSettings(page) {
  state.settingsOpen = false;
  goTo(page);
}

function renderSettingsDropdown() {
  const items = getSettingsMenuItems();
  const theme = (typeof getHhgTheme === 'function' ? getHhgTheme() : 'light');
  const themeLabel = theme === 'dark' ? '切换日间模式' : '切换夜间模式';
  const themeIcon = theme === 'dark' ? 'fa-sun' : 'fa-moon';
  return `
    <div class="settings-dropdown" onclick="event.stopPropagation()">
      <div class="settings-dropdown-hint">管理与辅助</div>
      ${items.map(item => `
        <button type="button" class="settings-dropdown-item" onclick="navigateFromSettings('${item.key}')">
          <i class="fas ${item.icon}"></i>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `).join('')}
      <div class="settings-dropdown-divider"></div>
      <div class="settings-dropdown-hint">外观</div>
      <button type="button" class="settings-dropdown-item" onclick="toggleHhgTheme();closeSettingsMenu();">
        <i class="fas ${themeIcon}"></i>
        <span>${themeLabel}</span>
      </button>
      ${AuthService.isDemoMode() ? `
        <div class="settings-dropdown-divider"></div>
        <div class="settings-dropdown-hint">演示账号</div>
        <select onchange="switchUser(this.value);closeSettingsMenu();">
          ${activeUsers().filter(u => !isContactProfile(u)).map(u => `<option value="${u.id}" ${u.id === currentUser.id ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.dept)})</option>`).join('')}
        </select>
      ` : `
        <div class="settings-dropdown-divider"></div>
        <div class="settings-dropdown-hint">钉钉 · ${escapeHtml(authSession.dingTalkUserId || currentUser.dingTalkUserId || '-')}</div>
      `}
    </div>
  `;
}

function renderSettingsGearButton(extraClass) {
  return `
    <div class="settings-gear-wrap ${extraClass || ''}">
      <button type="button" class="settings-gear-btn ${state.settingsOpen ? 'is-open' : ''}"
        onclick="toggleSettingsMenu(event)" title="设置" aria-label="设置">
        <i class="fas fa-cog"></i>
      </button>
      ${state.settingsOpen ? renderSettingsDropdown() : ''}
    </div>
  `;
}

function isUiSectionOpen(key) {
  return !!(state.uiSections && state.uiSections[key]);
}

function toggleUiSection(key) {
  if (!state.uiSections) state.uiSections = {};
  state.uiSections[key] = !state.uiSections[key];
  render();
}

function renderLiteAdvancedToggle(key, label, hint) {
  const open = isUiSectionOpen(key);
  return `
    <button type="button" class="lite-advanced-toggle" onclick="toggleUiSection('${key}')">
      <span><i class="fas fa-sliders-h" style="margin-right:6px;"></i>${label}${hint ? `<span style="font-weight:400;color:#9CA3AF;margin-left:8px;">${hint}</span>` : ''}</span>
      <i class="fas fa-chevron-${open ? 'up' : 'down'}"></i>
    </button>
  `;
}

function getLiteMoreNavItems() {
  const catalog = [
    { key: 'team', icon: 'fa-users', label: '团队管理', desc: currentUser.role === 'manager' ? '本部门看板' : '饱和度与成员看板', cap: 'nav.team' },
    { key: 'staff', icon: 'fa-address-book', label: '人员档案', desc: currentUser.role === 'manager' ? '本部门人员' : '通讯录与角色', cap: 'nav.staff' },
    { key: 'permissions', icon: 'fa-user-shield', label: '权限管理', desc: '角色能力矩阵', cap: 'nav.permissions' },
    { key: 'dataSecurity', icon: 'fa-shield-alt', label: '数据安全', desc: '库表与接口可视化', cap: 'nav.dataSecurity' },
    { key: 'archive', icon: 'fa-archive', label: '归档管理', desc: '已归档项目', cap: 'nav.archive' },
    { key: 'import', icon: 'fa-file-import', label: '数据导入', desc: 'Excel 导入', cap: 'nav.import' },
    { key: 'systemUpdates', icon: 'fa-bullhorn', label: '更新记录', desc: '版本说明', cap: 'nav.systemUpdates' },
  ];
  return catalog.filter(item => capOn(currentUser, item.cap));
}

function renderMobileNav() {
  const showTeam = canShowTeamNav();
  const items = [
    { key: 'dashboard', icon: 'fa-th-large', label: '工作台' },
    { key: 'projects', icon: 'fa-folder', label: '项目管理' },
    { key: 'tasks', icon: 'fa-check-square', label: '任务管理' },
    showTeam
      ? { key: 'team', icon: 'fa-users', label: '团队管理' }
      : { key: 'settings', icon: 'fa-cog', label: '设置', action: 'toggleSettingsMenu' },
  ];
  return `
    <nav class="mobile-nav">
      ${items.map(item => {
        if (item.action === 'toggleSettingsMenu') {
          const active = isLiteMorePage(state.page);
          return `<button type="button" onclick="toggleSettingsMenu(event)" class="mobile-nav-item ${active ? 'active' : ''}">
            <i class="fas ${item.icon}"></i><span>${item.label}</span>
          </button>`;
        }
        let active = false;
        if (item.key === 'dashboard') active = isWorkbenchNavPage(state.page);
        else if (item.key === 'tasks') active = isTodoNavPage(state.page);
        else if (item.key === 'projects') active = isProjectNavPage(state.page);
        else if (item.key === 'team') active = isTeamNavPage(state.page);
        return `<button type="button" onclick="goTo('${item.key}')" class="mobile-nav-item ${active ? 'active' : ''}">
          <i class="fas ${item.icon}"></i><span>${item.label}</span>
        </button>`;
      }).join('')}
    </nav>
  `;
}

function renderMorePage() {
  const items = getSettingsMenuItems();
  return `
    <p class="content-intro" style="margin-bottom:16px;">管理与辅助功能；日常请从「工作台」推进。</p>
    <div class="lite-more-grid">
      ${items.map(item => `
        <button type="button" class="lite-more-card" onclick="goTo('${item.key}')">
          <i class="fas ${item.icon}"></i>
          <span>${item.label}</span>
          <small>${item.desc || ''}</small>
        </button>
      `).join('')}
    </div>
  `;
}

function renderSidebar() {
  const showTeam = canShowTeamNav();
  const roleName = roleDisplayName(currentUser.role);
  const showNcc = capOn(currentUser, 'nav.ncc');
  const showSqlTools = capOn(currentUser, 'nav.sqlTools');
  const showTextPolish = capOn(currentUser, 'nav.textPolish');
  const primary = [
    {
      key: 'dashboard', label: '工作台', icon: 'fa-th-large',
      active: isWorkbenchNavPage(state.page),
      onclick: "goTo('dashboard')",
    },
    {
      key: 'tasks', label: '任务管理', icon: 'fa-check-square',
      active: isTodoNavPage(state.page),
      onclick: "goTo('tasks')",
    },
  ];
  if (canAccessKpiPlans()) {
    primary.push({
      key: 'kpiPlans', label: 'KPI计划', icon: 'fa-bullseye',
      active: state.page === 'kpiPlans',
      onclick: "goTo('kpiPlans')",
    });
  }

  const showTemplates = canCreateProject();

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
        <button type="button" class="nav-item nav-item--flat ${isWorkbenchNavPage(state.page) ? 'active' : ''}" onclick="goTo('dashboard')">
          <i class="fas fa-th-large"></i><span>工作台</span>
        </button>
        <button type="button" class="nav-item nav-item--flat ${isProjectNavPage(state.page) ? 'active' : ''}" onclick="goTo('projects')">
          <i class="fas fa-folder"></i><span>项目管理</span>
        </button>
        <button type="button" class="nav-item nav-item--flat ${isTodoNavPage(state.page) ? 'active' : ''}" onclick="goTo('tasks')">
          <i class="fas fa-check-square"></i><span>任务管理</span>
        </button>
        ${primary.filter(item => item.key !== 'dashboard' && item.key !== 'tasks' && item.key !== 'team').map(item => `
          <button type="button" class="nav-item nav-item--flat ${item.active ? 'active' : ''}" onclick="${item.onclick}">
            <i class="fas ${item.icon}"></i><span>${item.label}</span>
          </button>
        `).join('')}
        ${showTeam ? `
        <button type="button" class="nav-item nav-item--flat ${state.page === 'team' ? 'active' : ''}" onclick="goTo('team')">
          <i class="fas fa-users"></i><span>团队管理</span>
        </button>
        ` : ''}
        ${showTemplates ? `
        <button type="button" class="nav-item nav-item--flat ${state.page === 'projectTemplates' ? 'active' : ''}" onclick="goTo('projectTemplates')">
          <i class="fas fa-layer-group"></i><span>模版库</span>
        </button>
        ` : ''}
        ${(showNcc || showSqlTools || showTextPolish || isFullAccess(currentUser.role)) ? `
          <div class="nav-divider" role="separator"></div>
          ${showNcc ? `
          <button type="button" class="nav-item nav-item--flat ${state.page === 'nccMonitor' ? 'active' : ''}" onclick="goTo('nccMonitor')">
            <i class="fas fa-tower-broadcast"></i><span>NCC异常看板</span>
          </button>` : ''}
          ${showSqlTools ? `
          <button type="button" class="nav-item nav-item--flat ${state.page === 'sqlTools' ? 'active' : ''}" onclick="goTo('sqlTools')">
            <i class="fas fa-code"></i><span>SQL脚本</span>
          </button>` : ''}
          ${showTextPolish ? `
          <button type="button" class="nav-item nav-item--flat ${state.page === 'textPolish' ? 'active' : ''}" onclick="goTo('textPolish')">
            <i class="fas fa-wand-magic-sparkles"></i><span>文案润色</span>
          </button>` : ''}
          ${isFullAccess(currentUser.role) ? `
          <button type="button" class="nav-item nav-item--flat" onclick="openHandaOmExternal()">
            <i class="fas fa-server"></i><span>Handa-OM</span>
          </button>` : ''}
        ` : ''}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user-row">
          <div class="user-avatar">${escapeHtml(currentUser.name.charAt(0))}</div>
          <div class="sidebar-user-meta">
            <div class="user-name">${escapeHtml(currentUser.name)}</div>
            <div class="user-role">${escapeHtml(roleName)}</div>
          </div>
          ${renderSettingsGearButton()}
        </div>
      </div>
    </aside>
  `;
}

function renderInboxBell() {
  const items = getDisplayInboxItems();
  const unread = items.filter(n => !n.read).length;
  const badge = unread > 0
    ? `<span class="inbox-bell-badge">${unread > 99 ? '99+' : unread}</span>`
    : '';
  return `
    <div class="inbox-bell-wrap">
      <button type="button" class="inbox-bell-btn" onclick="toggleInboxPanel(event)" title="消息通知" aria-label="消息通知">
        <i class="fas fa-bell"></i>
        ${badge}
      </button>
      ${state.inboxOpen ? renderInboxPanel(items, unread) : ''}
    </div>
  `;
}

function renderInboxPanel(items, unread) {
  items = items || getDisplayInboxItems();
  unread = unread != null ? unread : items.filter(n => !n.read).length;
  return `
    <div class="inbox-panel" onclick="event.stopPropagation()">
      <div class="inbox-panel-header">
        <strong><i class="fas fa-bell" style="color:var(--brand);margin-right:6px;"></i>消息通知</strong>
        <div class="inbox-panel-actions">
          ${unread > 0 ? `<button type="button" onclick="markAllInboxRead()">全部已读</button>` : ''}
          <button type="button" onclick="closeInboxPanel()">关闭</button>
        </div>
      </div>
      <div class="inbox-panel-list">
        ${state.inboxLoading && !items.length ? `<div class="inbox-empty">加载中…</div>` : ''}
        ${!state.inboxLoading && !items.length ? `<div class="inbox-empty"><i class="fas fa-inbox" style="display:block;font-size:28px;margin-bottom:10px;opacity:0.45;"></i>暂无消息</div>` : ''}
        ${items.map(n => {
          const preview = String(n.content || '').replace(/\n+/g, ' ').trim();
          return `
            <button type="button" class="inbox-item${!n.read ? ' is-unread' : ''}" onclick='event.stopPropagation();openInboxNotification(${JSON.stringify(n.id)})'>
              <div class="inbox-item-title">
                <span>${escapeHtml(n.title || '通知')}</span>
                ${!n.read ? '<span class="dot"></span>' : ''}
              </div>
              <div class="inbox-item-preview">${escapeHtml(preview || '无内容')}</div>
              <div class="inbox-item-meta">${escapeHtml(n.time || '')}${n.operator ? ' · ' + escapeHtml(n.operator) : ''}</div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function getMissingDigestReadKey() {
  return `henghuiguan_miss_digest_read_${currentUser?.id || 'guest'}`;
}

function isMissingDigestReadRecently() {
  try {
    return isWithinDedupDays(localStorage.getItem(getMissingDigestReadKey()));
  } catch {
    return false;
  }
}

function markMissingDigestReadToday() {
  try {
    localStorage.setItem(getMissingDigestReadKey(), todayStr());
  } catch { /* ignore */ }
}

/** 有人员缺失时，小喇叭展示汇总提示（待办页不再重复红条）；一周内已读/已通知则不再当新消息弹出 */
function buildMissingStaffDigestItem(reports) {
  const today = todayStr();
  const summaryLine = reports
    .map(r => `「${r.missingName}」有 ${r.openCount} 项未完成任务`)
    .join('；') + '。';
  return {
    id: `N-MISS-${currentUser.id || 'me'}-${today}`,
    userId: currentUser.id,
    userName: currentUser.name,
    eventType: PushEventType.STAFF_ASSIGNEE_MISSING_DIGEST,
    title: '【恒慧管·人员缺失】',
    content: `下属/项目成员人员缺失：\n${summaryLine}\n请至「人员档案」处理，或转办任务。`,
    taskId: `missing-digest:${currentUser.id || currentUser.name}`,
    read: isMissingDigestReadRecently(),
    createdAt: `${today}T08:00:00.000Z`,
    time: new Date().toLocaleString('zh-CN'),
    operator: '系统',
    synthetic: true,
  };
}

function getDisplayInboxItems() {
  const items = [...(state.inboxItems || [])];
  let reports = [];
  try {
    reports = getMissingAssigneeReportsForCurrentUser() || [];
  } catch { /* 初始化早期可能尚未就绪 */ }
  if (!reports.length) return items;

  const dig = buildMissingStaffDigestItem(reports);
  const hasSame = items.some(n =>
    n.id === dig.id
    || String(n.taskId || '') === dig.taskId
    || (n.eventType === PushEventType.STAFF_ASSIGNEE_MISSING_DIGEST
      && isWithinDedupDays(String(n.createdAt || '').slice(0, 10)))
  );
  if (!hasSame) items.unshift(dig);
  return items;
}

function toggleInboxPanel(ev) {
  if (ev) ev.stopPropagation();
  state.inboxOpen = !state.inboxOpen;
  if (state.inboxOpen) state.settingsOpen = false;
  render();
  if (state.inboxOpen) {
    InboxService.refresh().then(() => {
      if (state.inboxOpen) render();
    });
    setTimeout(() => {
      document.addEventListener('click', closeInboxOnOutsideClick, { once: true });
    }, 0);
  }
}

function closeInboxPanel() {
  if (!state.inboxOpen) return;
  state.inboxOpen = false;
  render();
}

function closeInboxOnOutsideClick() {
  if (state.inboxOpen) closeInboxPanel();
}

async function markAllInboxRead() {
  markMissingDigestReadToday();
  await InboxService.markRead({ all: true });
  render();
}

/** 从小喇叭消息解析可跳转的任务/项目 id */
function resolveInboxJumpTarget(item) {
  if (!item) return { kind: 'none' };
  const eventType = item.eventType || '';
  const rawTaskId = String(item.taskId || '');
  const rawProjectId = String(item.projectId || '');
  const isMissingStaff = eventType === PushEventType.STAFF_ASSIGNEE_MISSING
    || eventType === PushEventType.STAFF_ASSIGNEE_MISSING_DIGEST
    || rawTaskId.startsWith('missing:')
    || rawTaskId.startsWith('missing-digest:');
  if (isMissingStaff) return { kind: 'staff' };

  let taskId = rawTaskId;
  let projectId = rawProjectId;
  if (taskId.startsWith('PROJECT-') && !projectId) {
    projectId = taskId.slice('PROJECT-'.length);
    taskId = '';
  }
  if (taskId && (taskId.startsWith('missing:') || taskId.startsWith('missing-digest:'))) {
    taskId = '';
  }
  if (taskId) {
    const t = tasks.find(x => x.id === taskId);
    if (t) {
      const toComments = eventType === PushEventType.TASK_COMMENT_MENTION;
      return { kind: toComments ? 'taskComment' : 'task', taskId };
    }
  }
  if (projectId) {
    const p = projects.find(x => x.id === projectId);
    if (p) return { kind: 'project', projectId };
  }
  return { kind: 'none' };
}

async function openInboxNotification(id) {
  const item = getDisplayInboxItems().find(n => String(n.id) === String(id));
  if (!item) return;

  // 单条点击：立即本地已读，再同步服务端
  if (item.synthetic || String(item.id || '').startsWith('N-MISS-')) {
    markMissingDigestReadToday();
    item.read = true;
  } else if (!item.read) {
    item.read = true;
    InboxService.syncLocalUnread();
    InboxService.persistLocal();
    await InboxService.markRead({ ids: [item.id] });
  }

  state.inboxOpen = false;
  const target = resolveInboxJumpTarget(item);
  if (target.kind === 'staff') {
    state.page = 'staff';
    state.showModal = null;
    render();
    return;
  }
  if (target.kind === 'taskComment') {
    viewTask(target.taskId);
    state.taskDetailTab = 'comments';
    render();
    return;
  }
  if (target.kind === 'task') {
    viewTask(target.taskId);
    return;
  }
  if (target.kind === 'project') {
    viewProject(target.projectId);
    return;
  }
  render();
}

function renderHeader() {
  const titles = {
    dashboard: '工作台',
    nccMonitor: 'NCC异常看板',
    sqlTools: 'SQL脚本生成',
    textPolish: '文案润色',
    dataSecurity: '数据安全',
    kpiPlans: 'KPI计划',
    tasks: getTodoViewTitle(),
    more: '更多',
    projects: '项目管理',
    projectTemplates: '模版库管理',
    staff: '人员档案',
    permissions: '权限管理',
    archive: '归档管理',
    team: '团队管理',
    import: '数据导入',
    systemUpdates: '更新记录',
    settings: '系统设置',
    projectDetail: '项目详情',
  };
  const roleName = roleDisplayName(currentUser.role);
  const pageTitle = titles[state.page] || '工作台';
  const isTodoPage = state.page === 'tasks';
  const crumbHome = state.page === 'dashboard'
    ? `<span class="current">恒慧管</span>`
    : `<button type="button" class="crumb-link" onclick="goBreadcrumbHome()" title="返回上一步">恒慧管</button>`;
  const crumbMiddle = state.page === 'projectDetail'
    ? `<span class="sep">/</span><button type="button" class="crumb-link" onclick="goBack()" title="返回项目管理">项目管理</button>`
    : '';
  return `
    <div class="main-header">
      <button type="button" class="topbar-toggle hide-mobile" aria-label="菜单"><i class="fas fa-bars"></i></button>
      <div class="breadcrumb">
        ${crumbHome}
        ${crumbMiddle}
        ${state.page === 'dashboard' ? '' : `<span class="sep">/</span><span class="current">${pageTitle}</span>`}
      </div>
      <div class="global-search">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="全局搜索（项目、任务等）" value="${escapeHtml(state.taskSearch || '')}"
          onkeydown="if(event.key==='Enter'){state.taskSearch=this.value;state.page='tasks';state.todoPage=1;render();}" />
      </div>
      <div class="main-header-actions">
        ${state.page === 'projects' || state.page === 'projectDetail' ? `
          <button class="btn btn-ghost hide-mobile" onclick="exportProjects()"><i class="fas fa-file-export"></i><span class="btn-text">导出</span></button>
          ${state.page === 'projectDetail' && state.form.projectId ? `
            <button class="btn btn-ghost hide-mobile" onclick="copyProjectPlanLedger('${state.form.projectId}')"><i class="fas fa-copy"></i><span class="btn-text">复制计划台账</span></button>
          ` : ''}
          ${canCreateProject() ? `<button class="btn btn-primary" onclick="showProjectModal()"><i class="fas fa-plus"></i><span class="btn-text">新建项目</span></button>` : ''}
        ` : ''}
        ${state.page === 'projectTemplates' ? `
          <button class="btn btn-ghost" onclick="goTo('projects')"><i class="fas fa-arrow-left"></i><span class="btn-text">返回</span></button>
          ${canManageProjectTemplates() ? `<button class="btn btn-primary" onclick="showProjectTemplateCreateModal()"><i class="fas fa-plus"></i><span class="btn-text">新建模板</span></button>` : ''}
        ` : ''}
        ${isTodoPage ? `
          <button class="btn btn-ghost hide-mobile" onclick="exportTasks()"><i class="fas fa-file-export"></i><span class="btn-text">导出</span></button>
          <button class="btn btn-primary" onclick="showQuickTempTaskModal()"><i class="fas fa-plus"></i><span class="btn-text">新建事项</span></button>
        ` : ''}
        ${state.page === 'team' ? `
          <button class="btn btn-ghost hide-mobile" onclick="exportTeam()"><i class="fas fa-file-export"></i><span class="btn-text">导出</span></button>
        ` : ''}
        ${state.page === 'staff' ? `
          ${capOn(currentUser, 'staff.dingSync') ? `<button class="btn btn-ghost" onclick="showDingTalkSyncModal()"><i class="fas fa-sync-alt"></i><span class="btn-text">同步钉钉</span></button>` : ''}
          ${resolveCap(currentUser, 'staff.edit') === 'all' ? `<button class="btn btn-primary" onclick="showAddStaffModal()"><i class="fas fa-plus"></i><span class="btn-text">添加人员</span></button>` : ''}
        ` : ''}
        ${renderInboxBell()}
        <span class="hide-desktop">${renderSettingsGearButton()}</span>
        <button type="button" class="topbar-user hide-mobile" title="${escapeHtml(currentUser.dept)} · ${roleName}">
          <span class="avatar">${escapeHtml(currentUser.name.charAt(0))}</span>
          <span>${escapeHtml(currentUser.name)}</span>
        </button>
      </div>
    </div>
  `;
}

function renderPage() {
  const titles = {
    more: '更多',
    projects: '项目管理',
    projectTemplates: '模版库管理',
    tasks: getTodoViewTitle(),
    staff: '人员档案',
    permissions: '权限管理',
    archive: '归档管理',
    team: '团队管理',
    import: '数据导入',
    sqlTools: 'SQL脚本生成',
    textPolish: '文案润色',
    dataSecurity: '数据安全',
    kpiPlans: 'KPI计划',
    systemUpdates: '更新记录',
    projectDetail: '项目详情',
  };
  let body = '';
  switch (state.page) {
    case 'dashboard': return renderWorkbenchHome();
    case 'nccMonitor': return renderNccMonitor();
    case 'sqlTools': body = renderSqlTools(); break;
    case 'textPolish': body = renderTextPolish(); break;
    case 'dataSecurity': body = renderDataSecurity(); break;
    case 'kpiPlans': body = renderKpiPlans(); break;
    case 'tasks': body = renderTasks(); break;
    case 'more': body = renderMorePage(); break;
    case 'projects': body = renderProjects(); break;
    case 'projectDetail': body = renderProjectDetail(); break;
    case 'projectTemplates': body = renderProjectTemplatesPage(); break;
    case 'staff': body = renderStaff(); break;
    case 'permissions': body = renderPermissions(); break;
    case 'archive': body = renderArchive(); break;
    case 'team': body = renderTeam(); break;
    case 'import': body = renderImport(); break;
    case 'systemUpdates': body = renderSystemUpdates(); break;
    default: return renderWorkbenchHome();
  }
  const title = titles[state.page];
  if (!title) return body;
  return `<div class="page-head"><h1 class="page-title">${title}</h1></div>${body}`;
}

function getNccMonitorBaseUrl() {
  const url = String(NccMonitorConfig.url || '').trim();
  return url || NccMonitorConfig.defaultUrl;
}

/** Loop 看板近期要求 userid，恒慧管内嵌/新窗口都要带上当前用户钉钉 userid */
function getNccMonitorViewerUserId() {
  const fromUser = String(currentUser?.dingTalkUserId || '').trim();
  if (fromUser) return fromUser;
  try {
    const q = new URLSearchParams(window.location.search || '');
    return String(q.get('userid') || q.get('userId') || q.get('dingTalkUserId') || '').trim();
  } catch {
    return '';
  }
}

function buildNccMonitorUrl(opts = {}) {
  const bustCache = opts.bustCache !== false;
  let url = getNccMonitorBaseUrl();
  const userid = getNccMonitorViewerUserId();
  if (userid && !/[?&]userid=/i.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'userid=' + encodeURIComponent(userid);
  }
  if (bustCache) {
    url += (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
  }
  return url;
}

function getNccMonitorEmbedUrl() {
  const userid = getNccMonitorViewerUserId();
  const token = String(authSession?.token || '').trim();
  const qs = new URLSearchParams();
  if (userid) qs.set('userid', userid);
  if (token) qs.set('access_token', token);
  qs.set('v', String(Date.now()));
  // 同域代理：在 iframe 内登录 Loop 后即可内嵌，不再依赖跨站 Cookie
  return `/api/ncc-monitor/embed?${qs.toString()}`;
}

function openNccMonitorExternal() {
  window.open(buildNccMonitorUrl({ bustCache: false }), '_blank', 'noopener,noreferrer');
}

function openNccMonitorLogin() {
  const url = String(NccMonitorConfig.loginUrl || 'https://www.handagroup.ai/login').trim();
  window.open(url, '_blank', 'noopener,noreferrer');
}

function reloadNccMonitorFrame() {
  if (state.page === 'nccMonitor') render();
}

function renderNccMonitor() {
  if (!isFullAccess(currentUser.role)) {
    return renderWorkbenchHome();
  }
  const userid = getNccMonitorViewerUserId();
  const src = escapeHtml(getNccMonitorEmbedUrl());
  const useridWarn = userid
    ? ''
    : `<div class="ncc-embed-warn">当前账号未绑定钉钉 userid，看板可能无法打开。请先在人员档案同步通讯录。</div>`;
  return `
    <div class="ncc-embed-wrap">
      <div class="ncc-embed-toolbar">
        <div class="ncc-embed-desc">环思 → 用友 NCC 传单异常监控：异常单据、原因分布、处理进度。</div>
        <div class="ncc-embed-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick="reloadNccMonitorFrame()">
            <i class="fas fa-rotate-right"></i> 刷新内嵌
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="openNccMonitorExternal()">
            <i class="fas fa-external-link-alt"></i> 浏览器打开
          </button>
        </div>
      </div>
      <div class="ncc-embed-tip">
        因浏览器跨站限制，在外部网站登录 <strong>不能</strong> 作用于恒慧管内嵌。
        请直接在下方看板区域登录 Loop（约 7 天有效），即可在本页内打开，无需新窗口。
      </div>
      ${useridWarn}
      <iframe class="ncc-embed-frame" src="${src}" title="NCC异常看板" allowfullscreen></iframe>
    </div>
  `;
}

function getHandaOmBaseUrl() {
  const url = String(HandaOmConfig.url || '').trim();
  return url || HandaOmConfig.defaultUrl;
}

function openHandaOmExternal() {
  if (!isFullAccess(currentUser.role)) return;
  window.open(getHandaOmBaseUrl(), '_blank', 'noopener,noreferrer');
  state.settingsOpen = false;
  render();
}

/** SQL 脚本工具：入库单子表 IsClearing 更新 */
const SQL_TOOL_INPUT_STOCK_TEMPLATE =
  "UPDATE db_Stock.dbo.tb_InputStockBill_Child SET IsClearing = {IsClearing} WHERE InputGuid = '{InputGuid}';";

function escapeSqlLiteral(value) {
  return String(value || '').replace(/'/g, "''");
}

function parseSqlToolGuids(text) {
  return String(text || '')
    .split(/[\s,;\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function buildInputStockClearingSql(guid, isClearing) {
  const clearing = String(isClearing) === '1' ? 1 : 0;
  return SQL_TOOL_INPUT_STOCK_TEMPLATE
    .replace('{IsClearing}', clearing)
    .replace('{InputGuid}', escapeSqlLiteral(guid));
}

function buildSqlToolScripts() {
  const guids = parseSqlToolGuids(state.sqlToolGuids);
  const isClearing = state.sqlToolIsClearing === '1' ? '1' : '0';
  if (!guids.length) return '';
  return guids.map(guid => buildInputStockClearingSql(guid, isClearing)).join('\n');
}

function updateSqlToolPreview() {
  const el = document.getElementById('sqlToolOutput');
  if (!el) return;
  const text = buildSqlToolScripts();
  el.textContent = text || '（请输入 InputGuid 后自动生成）';
  el.classList.toggle('is-empty', !text);
}

function onSqlToolGuidsInput(value) {
  state.sqlToolGuids = value;
  updateSqlToolPreview();
}

function onSqlToolClearingChange(value) {
  state.sqlToolIsClearing = value === '1' ? '1' : '0';
  updateSqlToolPreview();
}

async function copySqlToolScripts() {
  const text = buildSqlToolScripts();
  if (!text) {
    alert('请先输入至少一个 InputGuid');
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    alert(`已复制 ${parseSqlToolGuids(state.sqlToolGuids).length} 条 SQL 到剪贴板`);
  } catch (e) {
    alert('复制失败，请手动选中输出区复制');
  }
}

function renderSqlTools() {
  if (!isFullAccess(currentUser.role)) {
    return `<div class="panel"><div class="panel-body" style="padding:24px;color:#9CA3AF;">仅管理员可使用 SQL 脚本工具</div></div>`;
  }
  const output = buildSqlToolScripts();
  const templatePreview = SQL_TOOL_INPUT_STOCK_TEMPLATE
    .replace('{IsClearing}', '0')
    .replace('{InputGuid}', '{GUID}');
  return `
    <div class="sql-tool-wrap">
      <div class="sql-tool-panel">
        <h3><i class="fas fa-database" style="color:var(--brand);margin-right:8px;"></i>入库单 · 取消清账标记</h3>
        <div class="sql-tool-desc">
          根据 <code>InputGuid</code> 批量生成 UPDATE 语句。支持每行一个 GUID，或用逗号、分号分隔。
        </div>
        <div class="sql-tool-template">${escapeHtml(templatePreview).replace('{GUID}', '<span class="ph">{GUID}</span>')}</div>
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">InputGuid（可多个）</label>
          <textarea class="textarea" id="sqlToolGuids" style="width:100%;min-height:120px;font-family:ui-monospace,monospace;font-size:12px;"
            placeholder="每行一个 GUID，例如：&#10;xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            oninput="onSqlToolGuidsInput(this.value)">${escapeHtml(state.sqlToolGuids || '')}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:0;max-width:240px;">
          <label class="form-label">IsClearing 值</label>
          <select class="select" style="width:100%;" onchange="onSqlToolClearingChange(this.value)">
            <option value="0" ${state.sqlToolIsClearing !== '1' ? 'selected' : ''}>0（取消清账）</option>
            <option value="1" ${state.sqlToolIsClearing === '1' ? 'selected' : ''}>1（标记清账）</option>
          </select>
        </div>
        <div class="sql-tool-actions">
          <button type="button" class="btn btn-primary btn-sm" onclick="copySqlToolScripts()"><i class="fas fa-copy"></i> 复制脚本</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="state.sqlToolGuids='';state.sqlToolIsClearing='0';render()"><i class="fas fa-rotate-right"></i> 清空</button>
        </div>
      </div>
      <div class="sql-tool-panel">
        <h3>生成结果</h3>
        <div class="sql-tool-desc">输入 GUID 后实时生成，可直接复制到 SSMS 执行。</div>
        <pre id="sqlToolOutput" class="sql-tool-output${output ? '' : ' is-empty'}">${escapeHtml(output || '（请输入 InputGuid 后自动生成）')}</pre>
      </div>
    </div>
  `;
}
