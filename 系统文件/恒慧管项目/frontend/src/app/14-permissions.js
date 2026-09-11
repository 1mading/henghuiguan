// ========== 权限管理 ==========
function clonePermMatrix(matrix) {
  const src = matrix || DEFAULT_ROLE_PERMISSIONS;
  return {
    full: { ...(src.full || {}) },
    manager: { ...(src.manager || {}) },
    staff: { ...(src.staff || {}) },
  };
}

async function loadPermissionsPage(force) {
  if (!canAccessPermissionsPage()) return;
  if (!force && state.permDraft && !state.permDirty) return;
  if (!ApiConfig.enabled || !authSession.token) {
    state.rolePermissions = state.rolePermissions || clonePermMatrix(DEFAULT_ROLE_PERMISSIONS);
    state.permCatalog = PERM_CAP_DEFS;
    state.permDraft = clonePermMatrix(state.rolePermissions);
    state.permCanEdit = canEditPermissionsMatrix();
    state.permError = null;
    state.permLoading = false;
    if (state.page === 'permissions') render();
    return;
  }
  if (state.permLoading) return;
  state.permLoading = true;
  state.permError = null;
  if (state.page === 'permissions') render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/permissions', {
      headers: { ...AuthService.getAuthHeaders() },
      signal: AbortSignal.timeout(ApiConfig.timeout),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || '加载失败');
    state.rolePermissions = json.matrix || DEFAULT_ROLE_PERMISSIONS;
    state.permCatalog = Array.isArray(json.catalog) && json.catalog.length ? json.catalog : PERM_CAP_DEFS;
    state.permDraft = clonePermMatrix(state.rolePermissions);
    state.permCanEdit = !!json.canEdit && canEditPermissionsMatrix();
    state.permDirty = false;
    state.permError = null;
  } catch (e) {
    state.permError = e.message || '加载失败';
    state.rolePermissions = state.rolePermissions || clonePermMatrix(DEFAULT_ROLE_PERMISSIONS);
    state.permCatalog = PERM_CAP_DEFS;
    state.permDraft = clonePermMatrix(state.rolePermissions);
    state.permCanEdit = canEditPermissionsMatrix();
  } finally {
    state.permLoading = false;
    if (state.page === 'permissions') render();
  }
}

function onPermCellChange(bucket, key, value) {
  if (!state.permCanEdit || !state.permDraft) return;
  if (!state.permDraft[bucket]) state.permDraft[bucket] = {};
  state.permDraft[bucket][key] = value;
  state.permDirty = true;
  render();
}

async function savePermissionsMatrix() {
  if (!state.permCanEdit || !state.permDraft) return;
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后再保存权限矩阵');
    return;
  }
  state.permSaving = true;
  render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify({ matrix: state.permDraft }),
      signal: AbortSignal.timeout(ApiConfig.timeout),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || '保存失败');
    state.rolePermissions = json.matrix || state.permDraft;
    state.permDraft = clonePermMatrix(state.rolePermissions);
    state.permDirty = false;
    alert('权限矩阵已保存，刷新后其他账号也会生效');
  } catch (e) {
    alert(e.message || '保存失败');
  } finally {
    state.permSaving = false;
    render();
  }
}

async function resetPermissionsMatrix() {
  if (!state.permCanEdit) return;
  if (!confirm('确定恢复为系统默认权限矩阵？未保存的修改将丢失。')) return;
  if (!ApiConfig.enabled || !authSession.token) {
    state.permDraft = clonePermMatrix(DEFAULT_ROLE_PERMISSIONS);
    state.permDirty = true;
    render();
    return;
  }
  state.permSaving = true;
  render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/permissions/reset', {
      method: 'POST',
      headers: { ...AuthService.getAuthHeaders() },
      signal: AbortSignal.timeout(ApiConfig.timeout),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || '重置失败');
    state.rolePermissions = json.matrix || DEFAULT_ROLE_PERMISSIONS;
    state.permDraft = clonePermMatrix(state.rolePermissions);
    state.permDirty = false;
    alert('已恢复默认权限');
  } catch (e) {
    alert(e.message || '重置失败');
  } finally {
    state.permSaving = false;
    render();
  }
}

function discardPermissionsDraft() {
  state.permDraft = clonePermMatrix(state.rolePermissions || DEFAULT_ROLE_PERMISSIONS);
  state.permDirty = false;
  render();
}

function renderPermissions() {
  if (!canAccessPermissionsPage()) {
    return `<div class="panel"><div class="panel-body" style="padding:24px;color:#9CA3AF;">无权查看权限管理</div></div>`;
  }
  const catalog = state.permCatalog || PERM_CAP_DEFS;
  const draft = state.permDraft || clonePermMatrix(state.rolePermissions || DEFAULT_ROLE_PERMISSIONS);
  const canEdit = !!state.permCanEdit;
  const buckets = [
    { id: 'full', label: '总经理/管理员' },
    { id: 'manager', label: '部门经理' },
    { id: 'staff', label: '执行人员' },
  ];
  let lastGroup = '';
  const rows = catalog.map(cap => {
    const groupRow = cap.group !== lastGroup
      ? `<tr class="perm-group-row"><td colspan="4">${escapeHtml(cap.group)}</td></tr>`
      : '';
    lastGroup = cap.group;
    const cells = buckets.map(b => {
      const val = draft[b.id]?.[cap.key] ?? DEFAULT_ROLE_PERMISSIONS[b.id]?.[cap.key] ?? '';
      const label = (cap.valueLabels && cap.valueLabels[val]) || val;
      if (!canEdit) {
        return `<td><span class="perm-ro">${escapeHtml(label)}</span></td>`;
      }
      const opts = (cap.values || []).map(v =>
        `<option value="${escapeHtml(v)}" ${v === val ? 'selected' : ''}>${escapeHtml((cap.valueLabels && cap.valueLabels[v]) || v)}</option>`
      ).join('');
      return `<td><select onchange="onPermCellChange('${b.id}','${cap.key}',this.value)">${opts}</select></td>`;
    }).join('');
    return `${groupRow}<tr><td>${escapeHtml(cap.label)}</td>${cells}</tr>`;
  }).join('');

  return `
    <div class="perm-page">
      <div class="perm-toolbar">
        <div class="perm-hint">
          按角色配置菜单与能力档位。归属规则（本人负责的项目/任务等）仍按业务关系生效。
          ${canEdit ? '' : '当前为只读（仅总经理/管理员可修改）。'}
          ${state.permDirty ? '<span class="perm-dirty">有未保存修改</span>' : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${canEdit ? `
            <button type="button" class="btn btn-ghost btn-sm" onclick="discardPermissionsDraft()" ${state.permDirty ? '' : 'disabled'}>撤销修改</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="resetPermissionsMatrix()" ${state.permSaving ? 'disabled' : ''}>恢复默认</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="savePermissionsMatrix()" ${state.permSaving || !state.permDirty ? 'disabled' : ''}>
              ${state.permSaving ? '保存中…' : '保存'}
            </button>
          ` : ''}
          <button type="button" class="btn btn-ghost btn-sm" onclick="loadPermissionsPage(true)"><i class="fas fa-sync-alt"></i> 刷新</button>
        </div>
      </div>
      ${state.permLoading ? `<div class="wb-empty" style="padding:24px;">加载中…</div>` : ''}
      ${state.permError ? `<div style="color:#B91C1C;font-size:13px;margin-bottom:10px;">${escapeHtml(state.permError)}</div>` : ''}
      <div class="perm-table-wrap">
        <table class="perm-table">
          <thead>
            <tr>
              <th style="width:28%;">能力</th>
              ${buckets.map(b => `<th>${escapeHtml(b.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ========== 数据安全（管理员）==========
async function loadDataSecurityOverview(force) {
  if (!capOn(currentUser, 'nav.dataSecurity')) return;
  if (!ApiConfig.enabled || !authSession.token) {
    state.dataSecurityError = '请连接服务端后查看数据安全';
    state.dataSecurityLoading = false;
    state.dataSecurityData = null;
    if (state.page === 'dataSecurity') render();
    return;
  }
  if (state.dataSecurityLoading) return;
  if (!force && state.dataSecurityData) return;
  state.dataSecurityLoading = true;
  state.dataSecurityError = null;
  if (state.page === 'dataSecurity') render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/data-security/overview', {
      headers: { Authorization: 'Bearer ' + authSession.token },
      signal: AbortSignal.timeout(ApiConfig.timeout || 15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `加载失败 (${res.status})`);
    }
    state.dataSecurityData = json.data || null;
    state.dataSecurityError = null;
  } catch (e) {
    state.dataSecurityError = e.message || '加载失败';
    state.dataSecurityData = null;
  } finally {
    state.dataSecurityLoading = false;
    if (state.page === 'dataSecurity') render();
  }
}

function setDataSecurityTab(tab) {
  state.dataSecurityTab = tab === 'api' ? 'api' : 'database';
  render();
}

function dsSensitivityLabel(key) {
  return ({ high: '高敏感', medium: '中敏感', low: '低敏感', critical: '极高' })[key] || key;
}

function renderDataSecurityDatabase(dbData) {
  if (!dbData) return '<div class="ds-loading">暂无数据</div>';
  const maxCount = Math.max(1, ...(dbData.collections || []).map(c => c.count || 0));
  const conn = dbData.connection || {};
  const file = dbData.file || null;
  const bars = (dbData.collections || []).slice(0, 12).map(c => {
    const pct = Math.round(((c.count || 0) / maxCount) * 100);
    return `
      <div class="ds-bar-row" title="${escapeHtml(c.note || '')}">
        <div class="ds-bar-name">${escapeHtml(c.label)}</div>
        <div class="ds-bar-track"><div class="ds-bar-fill is-${escapeHtml(c.sensitivity)}" style="width:${pct}%"></div></div>
        <div class="ds-bar-count">${c.count || 0}</div>
      </div>`;
  }).join('');

  const rows = (dbData.collections || []).map(c => `
    <tr>
      <td>${escapeHtml(c.label)}</td>
      <td><code>${escapeHtml(c.key)}</code></td>
      <td><code>${escapeHtml(c.table || '—')}</code></td>
      <td>${c.count || 0}</td>
      <td><span class="ds-badge is-${escapeHtml(c.sensitivity)}">${dsSensitivityLabel(c.sensitivity)}</span></td>
      <td>${escapeHtml(c.note || '')}</td>
    </tr>`).join('');

  const retiredList = dbData.retiredCollectionsList || [];
  const retiredRows = retiredList.map(c => `
    <tr>
      <td>${escapeHtml(c.label)} <span class="ds-badge is-medium">已下线</span></td>
      <td><code>${escapeHtml(c.key)}</code></td>
      <td><code>${escapeHtml(c.table || '—')}</code></td>
      <td>${c.count || 0}</td>
      <td><span class="ds-badge is-${escapeHtml(c.sensitivity)}">${dsSensitivityLabel(c.sensitivity)}</span></td>
      <td>${escapeHtml(c.note || '')}</td>
    </tr>`).join('');

  const retiredPanel = retiredList.length ? `
    <div class="ds-panel">
      <h3><i class="fas fa-box-archive" style="color:#9CA3AF;"></i>已下线残留（界面不可用）</h3>
      <div class="ds-stat-sub" style="margin:-4px 0 12px;">绩效管理、工作汇报功能已下线；以下仅为库内残留数据，不计入上方统计。</div>
      <div class="ds-table-wrap">
        <table class="ds-table">
          <thead>
            <tr><th>名称</th><th>键</th><th>表名</th><th>数量</th><th>敏感度</th><th>说明</th></tr>
          </thead>
          <tbody>${retiredRows}</tbody>
        </table>
      </div>
    </div>` : '';

  return `
    <div class="ds-stats">
      <div class="ds-stat">
        <div class="ds-stat-label">存储驱动</div>
        <div class="ds-stat-value" style="font-size:16px;">${escapeHtml(dbData.storageLabel || dbData.driver)}</div>
        <div class="ds-stat-sub">${escapeHtml(dbData.driver || '')}</div>
      </div>
      <div class="ds-stat">
        <div class="ds-stat-label">集合 / 表</div>
        <div class="ds-stat-value">${dbData.totalCollections || 0}</div>
        <div class="ds-stat-sub">在用业务数据</div>
      </div>
      <div class="ds-stat">
        <div class="ds-stat-label">记录总量</div>
        <div class="ds-stat-value">${dbData.totalRecords || 0}</div>
        <div class="ds-stat-sub">不含已下线残留</div>
      </div>
      <div class="ds-stat">
        <div class="ds-stat-label">高敏感集合</div>
        <div class="ds-stat-value">${(dbData.bySensitivity && dbData.bySensitivity.high) || 0}</div>
        <div class="ds-stat-sub">中 ${(dbData.bySensitivity && dbData.bySensitivity.medium) || 0} · 低 ${(dbData.bySensitivity && dbData.bySensitivity.low) || 0}</div>
      </div>
    </div>
    <div class="ds-panel">
      <h3><i class="fas fa-plug" style="color:var(--brand);"></i>连接信息</h3>
      <div class="ds-meta-grid">
        ${dbData.driver === 'mysql' ? `
          <div class="ds-meta-item"><span class="ds-meta-k">主机</span><span class="ds-meta-v">${escapeHtml(String(conn.host || '—'))}:${escapeHtml(String(conn.port || ''))}</span></div>
          <div class="ds-meta-item"><span class="ds-meta-k">数据库</span><span class="ds-meta-v">${escapeHtml(conn.database || '—')}</span></div>
          <div class="ds-meta-item"><span class="ds-meta-k">应用账号</span><span class="ds-meta-v">${escapeHtml(conn.user || '—')}</span></div>
          <div class="ds-meta-item"><span class="ds-meta-k">密码</span><span class="ds-meta-v">（不展示，见 .env）</span></div>
        ` : `
          <div class="ds-meta-item"><span class="ds-meta-k">文件</span><span class="ds-meta-v">${escapeHtml((file && file.fileName) || '—')}</span></div>
          <div class="ds-meta-item"><span class="ds-meta-k">大小</span><span class="ds-meta-v">${escapeHtml((file && file.sizeLabel) || '—')}</span></div>
          <div class="ds-meta-item"><span class="ds-meta-k">修改时间</span><span class="ds-meta-v">${escapeHtml((file && file.mtime) || '—')}</span></div>
          <div class="ds-meta-item"><span class="ds-meta-k">路径</span><span class="ds-meta-v">${escapeHtml((file && file.path) || '—')}</span></div>
        `}
      </div>
    </div>
    <div class="ds-panel">
      <h3><i class="fas fa-chart-bar" style="color:var(--brand);"></i>数据量分布</h3>
      <div class="ds-bar-list">${bars || '<div class="ds-loading">暂无集合</div>'}</div>
    </div>
    <div class="ds-panel">
      <h3><i class="fas fa-table" style="color:var(--brand);"></i>集合明细</h3>
      <div class="ds-table-wrap">
        <table class="ds-table">
          <thead>
            <tr><th>名称</th><th>键</th><th>表名</th><th>数量</th><th>敏感度</th><th>说明</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    ${retiredPanel}
    <div class="ds-panel">
      <h3><i class="fas fa-lock" style="color:var(--brand);"></i>安全提示</h3>
      <ul class="ds-notes">${(dbData.securityNotes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    </div>
  `;
}

function renderDataSecurityApis(apiData) {
  if (!apiData) return '<div class="ds-loading">暂无数据</div>';
  const authFilter = state.dataSecurityApiAuthFilter || 'all';
  const riskFilter = state.dataSecurityApiRiskFilter || 'all';
  const authOpts = ['all', ...((apiData.byAuth || []).map(a => a.key))];
  const riskOpts = ['all', 'low', 'medium', 'high', 'critical'];

  const chips = `
    <div class="ds-chip-row">
      ${(apiData.byAuth || []).map(a => `<span class="ds-chip">${escapeHtml(a.label)}<strong>${a.count}</strong></span>`).join('')}
    </div>
    <div class="ds-chip-row">
      ${(apiData.byRisk || []).map(r => `<span class="ds-chip">风险 ${escapeHtml(r.label)}<strong>${r.count}</strong></span>`).join('')}
      <span class="ds-chip">API_KEY ${apiData.apiKeyConfigured ? '已配置' : '未配置'}</span>
      <span class="ds-chip">演示登录 ${apiData.allowDemoLogin ? '开启' : '关闭'}</span>
    </div>`;

  const groupsHtml = (apiData.groups || []).map(g => {
    const eps = (g.endpoints || []).filter(ep => {
      if (authFilter !== 'all' && ep.auth !== authFilter) return false;
      if (riskFilter !== 'all' && ep.risk !== riskFilter) return false;
      return true;
    });
    if (!eps.length) return '';
    const rows = eps.map(ep => {
      const methodClass = String(ep.method || 'get').toLowerCase();
      return `
        <tr>
          <td><span class="ds-method is-${escapeHtml(methodClass)}">${escapeHtml(ep.method)}</span></td>
          <td><code>${escapeHtml(ep.path)}</code></td>
          <td>${escapeHtml(ep.authLabel || ep.auth)}</td>
          <td><span class="ds-badge is-${escapeHtml(ep.risk)}">${escapeHtml(ep.riskLabel || ep.risk)}</span></td>
          <td>${escapeHtml(ep.desc || '')}</td>
        </tr>`;
    }).join('');
    return `
      <div class="ds-group-title">
        <span>${escapeHtml(g.label)}</span>
        <span style="font-size:11px;color:#94A3B8;font-weight:500;">${eps.length} 个接口</span>
      </div>
      <div class="ds-table-wrap">
        <table class="ds-table">
          <thead>
            <tr><th>方法</th><th>路径</th><th>鉴权</th><th>风险</th><th>说明</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `
    <div class="ds-stats">
      <div class="ds-stat">
        <div class="ds-stat-label">接口总数</div>
        <div class="ds-stat-value">${apiData.totalEndpoints || 0}</div>
        <div class="ds-stat-sub">${apiData.totalGroups || 0} 个模块</div>
      </div>
      <div class="ds-stat">
        <div class="ds-stat-label">公开接口</div>
        <div class="ds-stat-value">${((apiData.byAuth || []).find(a => a.key === 'none') || {}).count || 0}</div>
        <div class="ds-stat-sub">无鉴权</div>
      </div>
      <div class="ds-stat">
        <div class="ds-stat-label">高 / 极高风险</div>
        <div class="ds-stat-value">${
          (((apiData.byRisk || []).find(r => r.key === 'high') || {}).count || 0)
          + (((apiData.byRisk || []).find(r => r.key === 'critical') || {}).count || 0)
        }</div>
        <div class="ds-stat-sub">需重点管控</div>
      </div>
      <div class="ds-stat">
        <div class="ds-stat-label">API Key</div>
        <div class="ds-stat-value" style="font-size:16px;">${apiData.apiKeyConfigured ? '已启用' : '未配置'}</div>
        <div class="ds-stat-sub">第三方写入</div>
      </div>
    </div>
    <div class="ds-panel">
      <h3><i class="fas fa-project-diagram" style="color:var(--brand);"></i>鉴权与风险分布</h3>
      ${chips}
      <div class="ds-toolbar">
        <select class="ds-filter" onchange="state.dataSecurityApiAuthFilter=this.value;render()">
          ${authOpts.map(k => {
            const label = k === 'all' ? '全部鉴权' : ((apiData.authLabels && apiData.authLabels[k]) || k);
            return `<option value="${escapeHtml(k)}" ${authFilter === k ? 'selected' : ''}>${escapeHtml(label)}</option>`;
          }).join('')}
        </select>
        <select class="ds-filter" onchange="state.dataSecurityApiRiskFilter=this.value;render()">
          ${riskOpts.map(k => {
            const label = k === 'all' ? '全部风险' : ((apiData.riskLabels && apiData.riskLabels[k]) || k);
            return `<option value="${escapeHtml(k)}" ${riskFilter === k ? 'selected' : ''}>${escapeHtml(label)}</option>`;
          }).join('')}
        </select>
      </div>
      ${groupsHtml || '<div class="ds-loading">无匹配接口</div>'}
    </div>
    <div class="ds-panel">
      <h3><i class="fas fa-lock" style="color:var(--brand);"></i>安全提示</h3>
      <ul class="ds-notes">${(apiData.securityNotes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    </div>
  `;
}

function renderDataSecurity() {
  if (!isFullAccess(currentUser.role)) {
    return `<div class="panel"><div class="panel-body" style="padding:24px;color:#9CA3AF;">仅管理员可查看数据安全</div></div>`;
  }
  const tab = state.dataSecurityTab === 'api' ? 'api' : 'database';
  const data = state.dataSecurityData;
  let body = '';
  if (state.dataSecurityLoading && !data) {
    body = '<div class="ds-loading"><i class="fas fa-spinner fa-spin"></i> 加载中…</div>';
  } else if (state.dataSecurityError && !data) {
    body = `<div class="ds-error">${escapeHtml(state.dataSecurityError)}</div>`;
  } else if (tab === 'api') {
    body = renderDataSecurityApis(data && data.apis);
  } else {
    body = renderDataSecurityDatabase(data && data.database);
  }
  return `
    <div class="ds-wrap">
      <div class="ds-tabs" role="tablist">
        <button type="button" class="ds-tab ${tab === 'database' ? 'active' : ''}" onclick="setDataSecurityTab('database')">
          <i class="fas fa-database"></i> 数据库可视化
        </button>
        <button type="button" class="ds-tab ${tab === 'api' ? 'active' : ''}" onclick="setDataSecurityTab('api')">
          <i class="fas fa-network-wired"></i> API 可视化
        </button>
      </div>
      <div class="ds-toolbar" style="margin-top:-6px;">
        <button type="button" class="btn btn-ghost btn-sm" onclick="loadDataSecurityOverview(true)">
          <i class="fas fa-rotate-right"></i> 刷新
        </button>
        ${state.dataSecurityError && data ? `<span style="font-size:12px;color:#B91C1C;">${escapeHtml(state.dataSecurityError)}</span>` : ''}
      </div>
      ${body}
    </div>
  `;
}

// ========== KPI 计划（实施交付部）==========
const kpiMonthlyResultMap = {
  not_done: { label: '未完成', color: '#6B7280', bg: '#F3F4F6' },
  doing: { label: '进行中', color: '#2563EB', bg: '#DBEAFE' },
  paused: { label: '暂停中', color: '#D97706', bg: '#FEF3C7' },
  done: { label: '已完成', color: '#059669', bg: '#D1FAE5' },
};

function kpiMonthlyResultLabel(key) {
  return kpiMonthlyResultMap[key]?.label || kpiMonthlyResultMap.not_done.label;
}

function renderKpiMonthlyResultTag(monthlyResult) {
  const key = monthlyResult || 'not_done';
  const st = kpiMonthlyResultMap[key] || kpiMonthlyResultMap.not_done;
  return `<span class="kpi-plan-tag" style="background:${st.bg};color:${st.color};">${st.label}</span>`;
}

function renderKpiMonthlyResultQuick(plan) {
  const key = plan.monthlyResult || 'not_done';
  const opts = Object.entries(kpiMonthlyResultMap).map(([k, v]) =>
    `<option value="${k}" ${key === k ? 'selected' : ''}>${v.label}</option>`
  ).join('');
  return `<select class="kpi-result-quick is-${key}" title="快速切换完成结果"
    onchange="quickSetKpiMonthlyResult('${plan.id}', this.value, this)">
    ${opts}
  </select>`;
}

async function quickSetKpiMonthlyResult(planId, monthlyResult, selectEl) {
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端');
    if (selectEl) KpiPlanService.load(state.kpiYearMonth);
    return;
  }
  const prev = (state.kpiPlans || []).find(p => p.id === planId)?.monthlyResult || 'not_done';
  if (selectEl) selectEl.disabled = true;
  try {
    const body = { monthlyResult };
    if (monthlyResult === 'done') body.progress = 100;
    const res = await fetch(ApiConfig.baseUrl + '/kpi-plans/' + encodeURIComponent(planId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '状态更新失败');
    const updated = data.data?.plan;
    if (updated) {
      state.kpiPlans = (state.kpiPlans || []).map(p => p.id === planId ? { ...p, ...updated } : p);
      render();
    } else {
      await KpiPlanService.load(state.kpiYearMonth);
    }
  } catch (e) {
    if (selectEl) {
      selectEl.value = prev;
      selectEl.className = `kpi-result-quick is-${prev}`;
      selectEl.disabled = false;
    }
    alert(e.message || '状态更新失败');
  }
}

const FIXED_KPI_TEMPLATE_ORDER = [
  'monthly_review', 'monthly_plan', 'task_closure', 'doc_archive',
  'issue_risk', 'responsibility', 'weekly_report',
];

function currentKpiYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function canEditKpiPlanRow(plan, user = currentUser) {
  if (!canAccessKpiPlans(user) || !plan) return false;
  if (canViewAllKpiPlans(user)) return true;
  return plan.assigneeId === user.id || plan.assignee === user.name;
}

function canDeleteKpiPlanRow(plan, user = currentUser) {
  return !!(plan && plan.type === 'custom' && canEditKpiPlanRow(plan, user));
}

function canReorderKpiPlanRow(plan, user = currentUser) {
  return !!(plan && plan.type === 'custom' && canEditKpiPlanRow(plan, user));
}

function kpiPlanAssigneeKey(plan) {
  return String(plan?.assigneeId || plan?.assignee || '');
}

function compareKpiPlansInList(a, b) {
  const deptCmp = String(a.dept || '').localeCompare(String(b.dept || ''), 'zh-CN');
  if (deptCmp !== 0) return deptCmp;
  const assigneeCmp = String(a.assignee || '').localeCompare(String(b.assignee || ''), 'zh-CN');
  if (assigneeCmp !== 0) return assigneeCmp;
  const keyCmp = kpiPlanAssigneeKey(a).localeCompare(kpiPlanAssigneeKey(b));
  if (keyCmp !== 0) return keyCmp;
  // 固定在前且按模板顺序；仅自定义计划使用 sortOrder
  if (a.type !== b.type) {
    if (a.type === 'fixed') return -1;
    if (b.type === 'fixed') return 1;
  }
  if (a.type === 'fixed' && b.type === 'fixed') {
    const ia = FIXED_KPI_TEMPLATE_ORDER.indexOf(a.templateKey || '');
    const ib = FIXED_KPI_TEMPLATE_ORDER.indexOf(b.templateKey || '');
    if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return (a.weekIndex ?? -1) - (b.weekIndex ?? -1);
  }
  const ao = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : null;
  const bo = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : null;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  const sa = String(a.planStartDate || '');
  const sb = String(b.planStartDate || '');
  if (sa !== sb) return sa.localeCompare(sb);
  return String(a.taskName || '').localeCompare(String(b.taskName || ''), 'zh-CN');
}

function getDefaultKpiAssigneeFilter() {
  return currentUser?.id || 'all';
}

function getFilteredKpiPlans() {
  let list = (state.kpiPlans || []).slice();
  const deptFilter = state.kpiDeptFilter || 'all';
  if (canViewAllKpiPlans() && deptFilter && deptFilter !== 'all') {
    list = list.filter(p => (p.dept || '') === deptFilter);
  }
  const filterId = state.kpiAssigneeFilter ?? getDefaultKpiAssigneeFilter();
  if (filterId && filterId !== 'all') {
    const member = (state.kpiMembers || []).find(u => u.id === filterId);
    list = list.filter(p =>
      p.assigneeId === filterId ||
      p.assignee === filterId ||
      (member && p.assignee === member.name)
    );
  }
  return list.filter(p => !p.isParent).sort(compareKpiPlansInList);
}

function renderKpiPlans() {
  if (!canAccessKpiPlans()) {
    return `<div class="panel"><div class="panel-body" style="padding:24px;color:#9CA3AF;">仅实施交付部成员及部门经理/管理员/总经理可使用 KPI 计划</div></div>`;
  }
  const list = getFilteredKpiPlans();
  const monthOpts = (state.kpiMonthOptions || [state.kpiYearMonth]).map(ym =>
    `<option value="${escapeHtml(ym)}" ${state.kpiYearMonth === ym ? 'selected' : ''}>${escapeHtml(ym)}</option>`
  ).join('');
  const assigneeFilter = state.kpiAssigneeFilter ?? getDefaultKpiAssigneeFilter();
  const deptFilter = state.kpiDeptFilter || 'all';
  const depts = (state.kpiDepts && state.kpiDepts.length)
    ? state.kpiDepts
    : [...new Set((state.kpiPlans || []).map(p => p.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const membersForAssignee = (state.kpiMembers || []).filter(u =>
    deptFilter === 'all' || (u.dept || '') === deptFilter
  );
  const deptOpts = state.kpiCanViewAll
    ? `<select class="select" onchange="state.kpiDeptFilter=this.value;if(!state._kpiAssigneeTouched)state.kpiAssigneeFilter=getDefaultKpiAssigneeFilter();render()">
        <option value="all" ${deptFilter === 'all' ? 'selected' : ''}>全部部门</option>
        ${depts.map(d => `<option value="${escapeHtml(d)}" ${deptFilter === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
      </select>`
    : '';
  const assigneeOpts = state.kpiCanViewAll
    ? `<select class="select" onchange="state.kpiAssigneeFilter=this.value;state._kpiAssigneeTouched=true;render()">
        <option value="${escapeHtml(currentUser?.id || '')}" ${assigneeFilter === currentUser?.id ? 'selected' : ''}>我（${escapeHtml(currentUser?.name || '')}）</option>
        <option value="all" ${assigneeFilter === 'all' ? 'selected' : ''}>全部责任人</option>
        ${membersForAssignee.filter(u => u.id !== currentUser?.id).map(u => `<option value="${escapeHtml(u.id)}" ${assigneeFilter === u.id ? 'selected' : ''}>${escapeHtml(u.dept ? `${u.name}（${u.dept}）` : u.name)}</option>`).join('')}
      </select>`
    : '';
  const showDeptCol = !!state.kpiCanViewAll;
  const colSpan = (showDeptCol ? 10 : 9) + 1;
  let lastDept = null;
  const rowsHtml = list.length ? list.map(p => {
    let deptHeader = '';
    if (showDeptCol && deptFilter === 'all' && p.dept && p.dept !== lastDept) {
      lastDept = p.dept;
      deptHeader = `<tr class="kpi-plan-dept-group"><td colspan="${colSpan}" style="background:var(--bg-muted);font-weight:600;color:#334155;padding:10px 12px;">${escapeHtml(p.dept)}</td></tr>`;
    }
    const canDelete = canDeleteKpiPlanRow(p);
    const canReorder = canReorderKpiPlanRow(p);
    return `${deptHeader}
      <tr class="kpi-plan-data-row ${p.parentId ? 'kpi-plan-row-child' : ''}" data-kpi-id="${escapeHtml(p.id)}" data-kpi-assignee="${escapeHtml(kpiPlanAssigneeKey(p))}" data-kpi-type="${escapeHtml(p.type || '')}"
        ondragover="onKpiPlanDragOver(event,'${p.id}')" ondragleave="onKpiPlanDragLeave(event)" ondrop="onKpiPlanDrop(event,'${p.id}')">
        <td class="kpi-col-drag">
          ${canReorder
            ? `<span class="kpi-plan-drag-handle" draggable="true" title="拖拽调整自定义计划顺序"
                ondragstart="onKpiPlanDragStart(event,'${p.id}')" ondragend="onKpiPlanDragEnd(event)">
                <i class="fas fa-grip-vertical"></i>
              </span>`
            : `<span class="kpi-plan-drag-handle" style="opacity:0.28;cursor:not-allowed;" title="${p.type === 'fixed' ? '固定计划不可拖拽' : '无权调整'}"><i class="fas fa-grip-vertical"></i></span>`}
        </td>
        ${showDeptCol ? `<td class="kpi-col-dept">${escapeHtml(p.dept || '')}</td>` : ''}
        <td class="kpi-col-type"><span class="kpi-plan-tag ${p.type === 'custom' ? 'is-custom' : 'is-fixed'}">${p.type === 'custom' ? '自定义' : '固定'}</span></td>
        <td class="kpi-col-project" title="${escapeHtml(p.projectName || '')}">${escapeHtml(p.projectName || '')}</td>
        <td class="kpi-col-task" title="${escapeHtml(p.taskName || '')}">${escapeHtml(p.taskName || '')}</td>
        <td class="kpi-col-deliverable kpi-plan-deliverable" title="${escapeHtml(p.targetDeliverable || '')}">${escapeHtml(p.targetDeliverable || '')}</td>
        <td class="kpi-col-period" title="${escapeHtml((p.planStartDate || '-') + ' ~ ' + (p.planEndDate || '-'))}">${escapeHtml((p.planStartDate || '-') + ' ~ ' + (p.planEndDate || '-'))}</td>
        <td class="kpi-col-assignee" title="${escapeHtml(p.assignee || '')}">${escapeHtml(p.assignee || '')}</td>
        <td class="kpi-col-progress">${p.progress ?? 0}%</td>
        <td class="kpi-col-result">${renderKpiMonthlyResultQuick(p)}</td>
        <td class="kpi-col-actions" style="white-space:nowrap;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="openKpiPlanEdit('${p.id}')" title="编辑"><i class="fas fa-edit"></i></button>
          ${canDelete ? `<button type="button" class="btn btn-ghost btn-sm" style="color:#DC2626;" onclick="deleteKpiPlan('${p.id}')" title="删除自定义计划"><i class="fas fa-trash-alt"></i></button>` : ''}
        </td>
      </tr>`;
  }).join('') : `<tr><td colspan="${colSpan}" style="padding:24px;color:#9CA3AF;text-align:center;">暂无计划，请选择月份或等待系统自动生成</td></tr>`;
  return `
    <div class="kpi-plan-wrap">
      <p class="content-intro" style="margin-bottom:12px;">
        KPI 计划按责任人部门区分。实施交付部首套从 ${escapeHtml(state.kpiFirstBootstrapMonth || '2026-08')} 起，项目管控部从 ${escapeHtml(state.kpiFirstBootstrapMonthPmo || '2026-09')} 起；部门经理/管理员/总经理可查看全部部门。
        自定义计划均可删除；仅自定义计划可拖拽左侧手柄调整上下顺序（固定计划不可拖拽）。
        周汇报固定 4 段：首段从当月第一个周一起（若月初空档 ≥3 天则从 1 号起并入首段），月末剩余天数并入第四段；仅 1~2 天空档由「项目整体节点主动汇报」父任务覆盖。
      </p>
      <div class="kpi-plan-toolbar">
        <select class="select" onchange="KpiPlanService.load(this.value)">
          ${monthOpts}
        </select>
        ${deptOpts}
        ${assigneeOpts}
        <button type="button" class="btn btn-ghost btn-sm" onclick="KpiPlanService.load(state.kpiYearMonth)"><i class="fas fa-rotate-right"></i> 刷新</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="openKpiPlanCreate()"><i class="fas fa-plus"></i> 自定义计划</button>
      </div>
      ${state.kpiPlansLoading ? '<p style="color:#9CA3AF;font-size:13px;">加载中…</p>' : ''}
      <div class="kpi-plan-table-card">
        <div class="todo-table-wrap">
          <table class="kpi-plan-table">
            <thead>
              <tr>
                <th class="kpi-col-drag" title="拖拽排序"></th>
                ${showDeptCol ? '<th class="kpi-col-dept">部门</th>' : ''}
                <th class="kpi-col-type">类型</th>
                <th class="kpi-col-project">项目名称</th>
                <th class="kpi-col-task">专项任务</th>
                <th class="kpi-col-deliverable">任务目标 & 交付物</th>
                <th class="kpi-col-period">计划周期</th>
                <th class="kpi-col-assignee">责任人</th>
                <th class="kpi-col-progress">进度</th>
                <th class="kpi-col-result">完成结果</th>
                <th class="kpi-col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function openKpiPlanEdit(planId) {
  if (!ApiConfig.enabled || !authSession.token) { alert('请连接服务端'); return; }
  try {
    const res = await fetch(ApiConfig.baseUrl + '/kpi-plans/' + encodeURIComponent(planId), {
      headers: { ...AuthService.getAuthHeaders() },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '加载失败');
    state.form = { ...data.data.plan };
    state.kpiPlanLogs = data.data.logs || [];
    state.showModal = 'kpiPlanEdit';
    render();
  } catch (e) {
    alert(e.message || '加载失败');
  }
}

function openKpiPlanCreate() {
  state.form = {
    yearMonth: state.kpiYearMonth,
    projectName: '',
    taskName: '',
    targetDeliverable: '',
    planStartDate: '',
    planEndDate: '',
    assigneeId: currentUser.id,
    assignee: currentUser.name,
    collaborators: [],
    riskMitigation: '',
    desc: '',
    progress: 0,
    monthlyResult: 'not_done',
  };
  state.kpiPlanLogs = [];
  state.showModal = 'kpiPlanCreate';
  render();
}

async function saveKpiPlanEdit() {
  const plan = state.form;
  if (!plan?.id) return;
  try {
    const body = collectKpiPlanFormFromDom(plan);
    const res = await fetch(ApiConfig.baseUrl + '/kpi-plans/' + encodeURIComponent(plan.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '保存失败');
    closeModal();
    await KpiPlanService.load(state.kpiYearMonth);
  } catch (e) {
    alert(e.message || '保存失败');
  }
}

async function saveKpiPlanCreate() {
  const body = collectKpiPlanFormFromDom(state.form || {});
  if (!body.taskName) { alert('请填写专项任务名称'); return; }
  try {
    const res = await fetch(ApiConfig.baseUrl + '/kpi-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '创建失败');
    closeModal();
    await KpiPlanService.load(state.kpiYearMonth);
  } catch (e) {
    alert(e.message || '创建失败');
  }
}

async function deleteKpiPlan(planId) {
  if (!ApiConfig.enabled || !authSession.token) { alert('请连接服务端'); return; }
  const plan = (state.kpiPlans || []).find(p => p.id === planId) || (state.form?.id === planId ? state.form : null);
  if (!canDeleteKpiPlanRow(plan)) {
    alert(plan && plan.type !== 'custom' ? '固定计划不可删除' : '无权删除该计划');
    return;
  }
  const label = plan?.taskName
    ? `「${[plan.projectName, plan.taskName].filter(Boolean).join(' / ')}」`
    : '';
  if (!confirm(`确定删除自定义 KPI 计划${label}？删除后不可恢复。`)) return;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/kpi-plans/' + encodeURIComponent(planId), {
      method: 'DELETE',
      headers: { ...AuthService.getAuthHeaders() },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '删除失败');
    if (state.showModal === 'kpiPlanEdit' && state.form?.id === planId) closeModal();
    await KpiPlanService.load(state.kpiYearMonth);
  } catch (e) {
    alert(e.message || '删除失败');
  }
}

function clearKpiPlanDropIndicators() {
  document.querySelectorAll('.kpi-plan-row-drop-before, .kpi-plan-row-drop-after, .kpi-plan-row-dragging').forEach(el => {
    el.classList.remove('kpi-plan-row-drop-before', 'kpi-plan-row-drop-after', 'kpi-plan-row-dragging');
  });
}

function onKpiPlanDragStart(event, planId) {
  const plan = (state.kpiPlans || []).find(p => p.id === planId);
  if (!canReorderKpiPlanRow(plan)) {
    event.preventDefault();
    return;
  }
  state._kpiDragId = planId;
  state._kpiDragAssignee = kpiPlanAssigneeKey(plan);
  try {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/kpi-plan-id', planId);
    event.dataTransfer.setData('text/plain', planId);
  } catch (_) { /* ignore */ }
  const row = event.target.closest('tr');
  if (row) setTimeout(() => row.classList.add('kpi-plan-row-dragging'), 0);
}

function onKpiPlanDragEnd() {
  state._kpiDragId = null;
  state._kpiDragAssignee = null;
  clearKpiPlanDropIndicators();
}

function onKpiPlanDragOver(event, targetId) {
  const dragId = state._kpiDragId;
  if (!dragId || dragId === targetId) return;
  const target = (state.kpiPlans || []).find(p => p.id === targetId);
  if (!canReorderKpiPlanRow(target) || kpiPlanAssigneeKey(target) !== state._kpiDragAssignee) return;
  event.preventDefault();
  try { event.dataTransfer.dropEffect = 'move'; } catch (_) { /* ignore */ }
  clearKpiPlanDropIndicators();
  const row = event.currentTarget;
  if (!row) return;
  const rect = row.getBoundingClientRect();
  const before = event.clientY < rect.top + rect.height / 2;
  row.classList.add(before ? 'kpi-plan-row-drop-before' : 'kpi-plan-row-drop-after');
  state._kpiDropBefore = before;
}

function onKpiPlanDragLeave(event) {
  const row = event.currentTarget;
  if (!row) return;
  row.classList.remove('kpi-plan-row-drop-before', 'kpi-plan-row-drop-after');
}

async function onKpiPlanDrop(event, targetId) {
  event.preventDefault();
  const dragId = state._kpiDragId || (() => {
    try { return event.dataTransfer.getData('text/kpi-plan-id') || event.dataTransfer.getData('text/plain'); }
    catch { return null; }
  })();
  clearKpiPlanDropIndicators();
  if (!dragId || dragId === targetId) return;
  const list = getFilteredKpiPlans();
  const dragPlan = list.find(p => p.id === dragId) || (state.kpiPlans || []).find(p => p.id === dragId);
  const targetPlan = list.find(p => p.id === targetId) || (state.kpiPlans || []).find(p => p.id === targetId);
  if (!dragPlan || !targetPlan) return;
  if (!canReorderKpiPlanRow(dragPlan) || !canReorderKpiPlanRow(targetPlan)) {
    alert('固定计划不可拖拽，仅可调整自定义计划顺序');
    return;
  }
  if (kpiPlanAssigneeKey(dragPlan) !== kpiPlanAssigneeKey(targetPlan)) {
    alert('只能在同一责任人的计划之间调整顺序');
    return;
  }
  const assigneeKey = kpiPlanAssigneeKey(dragPlan);
  const siblingIds = list
    .filter(p => kpiPlanAssigneeKey(p) === assigneeKey && p.type === 'custom')
    .map(p => p.id);
  const from = siblingIds.indexOf(dragId);
  const to = siblingIds.indexOf(targetId);
  if (from < 0 || to < 0) return;
  const next = siblingIds.slice();
  next.splice(from, 1);
  let insertAt = next.indexOf(targetId);
  if (insertAt < 0) return;
  const dropBefore = state._kpiDropBefore !== false;
  if (!dropBefore) insertAt += 1;
  next.splice(insertAt, 0, dragId);
  // 乐观更新本地 sortOrder（仅自定义）
  next.forEach((id, i) => {
    const p = (state.kpiPlans || []).find(x => x.id === id);
    if (p) p.sortOrder = i;
  });
  render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/kpi-plans/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() },
      body: JSON.stringify({ orderedIds: next }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '调整顺序失败');
    await KpiPlanService.load(state.kpiYearMonth);
  } catch (e) {
    alert(e.message || '调整顺序失败');
    await KpiPlanService.load(state.kpiYearMonth);
  }
}

function collectKpiPlanFormFromDom(plan) {
  const get = id => document.getElementById(id)?.value;
  const collRaw = get('kpiCollaborators');
  return {
    ...plan,
    projectName: get('kpiProjectName') ?? plan.projectName,
    taskName: get('kpiTaskName') ?? plan.taskName,
    targetDeliverable: get('kpiTargetDeliverable') ?? plan.targetDeliverable,
    planStartDate: get('kpiPlanStartDate') ?? plan.planStartDate,
    planEndDate: get('kpiPlanEndDate') ?? plan.planEndDate,
    assignee: get('kpiAssignee') ?? plan.assignee,
    collaborators: collRaw ? collRaw.split(/[,，、;；\n]/).map(s => s.trim()).filter(Boolean) : (plan.collaborators || []),
    riskMitigation: get('kpiRiskMitigation') ?? plan.riskMitigation,
    desc: get('kpiDesc') ?? plan.desc,
    actualStartDate: get('kpiActualStartDate') || null,
    actualEndDate: get('kpiActualEndDate') || null,
    progress: (() => {
      const monthlyResult = get('kpiMonthlyResult') ?? plan.monthlyResult ?? 'not_done';
      if (monthlyResult === 'done') return 100;
      return parseInt(get('kpiProgress'), 10) || 0;
    })(),
    monthlyResult: get('kpiMonthlyResult') ?? plan.monthlyResult ?? 'not_done',
    yearMonth: get('kpiYearMonth') ?? plan.yearMonth,
  };
}

function onKpiMonthlyResultChange() {
  const sel = document.getElementById('kpiMonthlyResult');
  const progress = document.getElementById('kpiProgress');
  if (sel?.value === 'done' && progress) progress.value = '100';
}

function renderKpiPlanFormFields(plan, opts = {}) {
  const isCustom = opts.isCustom || plan.type === 'custom';
  const dateReadonly = !isCustom && !canViewAllKpiPlans();
  const coll = (plan.collaborators || []).join('、');
  return `
    <div class="form-group"><label class="form-label">归属月份</label>
      <input class="input" id="kpiYearMonth" style="width:100%;" value="${escapeHtml(plan.yearMonth || state.kpiYearMonth || '')}" ${isCustom ? '' : 'readonly'}></div>
    <div class="form-group"><label class="form-label">项目名称</label>
      <input class="input" id="kpiProjectName" style="width:100%;" value="${escapeHtml(plan.projectName || '')}" ${isCustom ? '' : 'readonly'}></div>
    <div class="form-group"><label class="form-label">专项任务名称（核心工作）</label>
      <input class="input" id="kpiTaskName" style="width:100%;" value="${escapeHtml(plan.taskName || '')}" ${isCustom ? '' : 'readonly'}></div>
    <div class="form-group"><label class="form-label">任务目标 & 交付物</label>
      <textarea class="textarea" id="kpiTargetDeliverable" style="width:100%;min-height:64px;" ${isCustom ? '' : 'readonly'}>${escapeHtml(plan.targetDeliverable || '')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group"><label class="form-label">计划开始日期</label>
        <input class="input" type="date" id="kpiPlanStartDate" style="width:100%;" value="${escapeHtml(plan.planStartDate || '')}" ${dateReadonly ? 'readonly' : ''}></div>
      <div class="form-group"><label class="form-label">计划截止日期</label>
        <input class="input" type="date" id="kpiPlanEndDate" style="width:100%;" value="${escapeHtml(plan.planEndDate || '')}" ${dateReadonly ? 'readonly' : ''}></div>
    </div>
    <div class="form-group"><label class="form-label">部门</label>
      <input class="input" id="kpiDept" style="width:100%;" value="${escapeHtml(plan.dept || '')}" readonly></div>
    <div class="form-group"><label class="form-label">责任人</label>
      <input class="input" id="kpiAssignee" style="width:100%;" value="${escapeHtml(plan.assignee || '')}" readonly></div>
    <div class="form-group"><label class="form-label">协同人（逗号分隔）</label>
      <input class="input" id="kpiCollaborators" style="width:100%;" value="${escapeHtml(coll)}"></div>
    <div class="form-group"><label class="form-label">风险预判 & 应对措施</label>
      <textarea class="textarea" id="kpiRiskMitigation" style="width:100%;min-height:64px;">${escapeHtml(plan.riskMitigation || '')}</textarea></div>
    <div class="form-group"><label class="form-label">说明</label>
      <textarea class="textarea" id="kpiDesc" style="width:100%;min-height:64px;">${escapeHtml(plan.desc || '')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group"><label class="form-label">实际开始日期</label>
        <input class="input" type="date" id="kpiActualStartDate" style="width:100%;" value="${escapeHtml(plan.actualStartDate || '')}"></div>
      <div class="form-group"><label class="form-label">实际结束日期</label>
        <input class="input" type="date" id="kpiActualEndDate" style="width:100%;" value="${escapeHtml(plan.actualEndDate || '')}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group"><label class="form-label">完成百分比</label>
        <input class="input" type="number" min="0" max="100" id="kpiProgress" style="width:100%;" value="${plan.progress ?? 0}"></div>
      <div class="form-group"><label class="form-label">月度实际完成结果</label>
        <select class="select" id="kpiMonthlyResult" style="width:100%;" onchange="onKpiMonthlyResultChange()">
          ${Object.entries(kpiMonthlyResultMap).map(([k, v]) => `
            <option value="${k}" ${(plan.monthlyResult || 'not_done') === k ? 'selected' : ''}>${v.label}</option>
          `).join('')}
        </select></div>
    </div>
    ${(state.kpiPlanLogs || []).length ? `
      <div class="form-group">
        <label class="form-label">变更记录</label>
        <div class="kpi-plan-log-list">
          ${state.kpiPlanLogs.map(l => `
            <div class="kpi-plan-log-item">
              <div style="color:#6B7280;margin-bottom:4px;">${escapeHtml(l.operator || '')} · ${escapeHtml(l.operateTime || '')}</div>
              <div>${escapeHtml(l.before || '')} → ${escapeHtml(l.after || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderKpiPlanEditModal() {
  const plan = state.form || {};
  const canDelete = canDeleteKpiPlanRow(plan);
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:640px;max-height:90vh;overflow:auto;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-bullseye" style="color:var(--brand);margin-right:8px;"></i>编辑 KPI 计划</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">${renderKpiPlanFormFields(plan)}</div>
        <div class="modal-footer" style="justify-content:space-between;">
          ${canDelete
            ? `<button class="btn btn-ghost" style="color:#DC2626;" onclick="deleteKpiPlan('${escapeHtml(plan.id)}')"><i class="fas fa-trash-alt"></i> 删除</button>`
            : '<span></span>'}
          <div style="display:flex;gap:8px;">
            <button class="btn btn-ghost" onclick="closeModal()">取消</button>
            <button class="btn btn-primary" onclick="saveKpiPlanEdit()"><i class="fas fa-save"></i> 保存</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderKpiPlanCreateModal() {
  const plan = state.form || {};
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box" style="max-width:640px;max-height:90vh;overflow:auto;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title"><i class="fas fa-plus" style="color:var(--brand);margin-right:8px;"></i>新建自定义 KPI 计划</h3>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">${renderKpiPlanFormFields(plan, { isCustom: true })}</div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="saveKpiPlanCreate()"><i class="fas fa-save"></i> 创建</button>
        </div>
      </div>
    </div>
  `;
}
