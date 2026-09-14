// ========== 文案润色（管理员）==========

function syncTextPolishConfigDrafts(data) {
  data = data || {};
  state.textPolishModelsDraft = (data.models || []).join('\n');
  state.textPolishDefaultDraft = data.defaultModel || '';
  state.textPolishBaseUrlDraft = data.baseUrl || 'https://api.deepseek.com/v1';
  state.textPolishApiKeyDraft = data.apiKey || '';
}

async function loadTextPolishOptions(force) {
  if (!capOn(currentUser, 'nav.textPolish') || !isFullAccess(currentUser.role)) return;
  if (!ApiConfig.enabled || !authSession.token) {
    state.textPolishError = '请连接服务端后使用文案润色';
    state.textPolishOptions = null;
    state.textPolishOptionsLoaded = true;
    if (state.page === 'textPolish') render();
    return;
  }
  if (state.textPolishLoading && !force) return;
  if (!force && state.textPolishOptionsLoaded && state.textPolishOptions) return;

  state.textPolishError = null;
  try {
    const res = await fetch(ApiConfig.baseUrl + '/text-polish/options', {
      headers: { Authorization: 'Bearer ' + authSession.token },
      signal: AbortSignal.timeout(ApiConfig.timeout || 15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `加载失败 (${res.status})`);
    }
    const data = json.data || {};
    state.textPolishOptions = data;
    state.textPolishOptionsLoaded = true;
    if (!state.textPolishModel || !(data.models || []).includes(state.textPolishModel)) {
      state.textPolishModel = data.defaultModel || (data.models && data.models[0]) || '';
    }
    if (!state.textPolishScene && data.scenes && data.scenes[0]) {
      state.textPolishScene = data.scenes[0].id;
    }
    syncTextPolishConfigDrafts(data);
    state.textPolishError = null;
  } catch (e) {
    state.textPolishError = e.message || '加载失败';
    state.textPolishOptions = null;
    state.textPolishOptionsLoaded = true;
  }
  if (state.page === 'textPolish') render();
}

function onTextPolishDraftInput(value) {
  state.textPolishDraft = value;
}

function onTextPolishExtraInput(value) {
  state.textPolishExtra = value;
}

function onTextPolishSceneChange(value) {
  state.textPolishScene = value;
}

function onTextPolishModelChange(value) {
  state.textPolishModel = value;
}

function toggleTextPolishManage() {
  state.textPolishManageOpen = !state.textPolishManageOpen;
  if (state.textPolishManageOpen && state.textPolishOptions) {
    syncTextPolishConfigDrafts(state.textPolishOptions);
  }
  render();
}

function onTextPolishModelsDraftInput(value) {
  state.textPolishModelsDraft = value;
}

function onTextPolishDefaultDraftChange(value) {
  state.textPolishDefaultDraft = value;
}

function onTextPolishBaseUrlDraftInput(value) {
  state.textPolishBaseUrlDraft = value;
}

function onTextPolishApiKeyDraftInput(value) {
  state.textPolishApiKeyDraft = value;
}

async function saveTextPolishModels() {
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后再保存');
    return;
  }
  if (state.textPolishSavingModels) return;
  const models = String(state.textPolishModelsDraft || '')
    .split(/[\n,，;；]+/)
    .map(s => s.trim())
    .filter(Boolean);
  if (!models.length) {
    alert('请至少填写一个模型 ID');
    return;
  }
  const baseUrl = String(state.textPolishBaseUrlDraft || '').trim();
  if (!baseUrl) {
    alert('请填写接口地址（Base URL）');
    return;
  }
  const apiKey = String(state.textPolishApiKeyDraft || '').trim();
  if (!apiKey) {
    alert('请填写 API Key');
    return;
  }

  state.textPolishSavingModels = true;
  state.textPolishError = null;
  render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/text-polish/models', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authSession.token,
      },
      body: JSON.stringify({
        models,
        defaultModel: state.textPolishDefaultDraft || models[0],
        baseUrl,
        apiKey,
      }),
      signal: AbortSignal.timeout(ApiConfig.timeout || 15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `保存失败 (${res.status})`);
    }
    const data = json.data || {};
    state.textPolishOptions = {
      ...(state.textPolishOptions || {}),
      ...data,
      models: data.models || models,
      defaultModel: data.defaultModel || models[0],
      scenes: (state.textPolishOptions && state.textPolishOptions.scenes) || undefined,
    };
    state.textPolishModel = data.defaultModel || models[0];
    syncTextPolishConfigDrafts(state.textPolishOptions);
    state.textPolishManageOpen = false;
    alert('接口与模型配置已保存');
  } catch (e) {
    state.textPolishError = e.message || '保存失败';
    alert(state.textPolishError);
  } finally {
    state.textPolishSavingModels = false;
    if (state.page === 'textPolish') render();
  }
}

async function runTextPolish() {
  if (!isFullAccess(currentUser.role)) {
    alert('仅管理员可使用文案润色');
    return;
  }
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后再润色');
    return;
  }
  const draft = String(state.textPolishDraft || '').trim();
  if (!draft) {
    alert('请先输入草稿');
    return;
  }
  if (state.textPolishLoading) return;
  if (state.textPolishOptions && state.textPolishOptions.configured === false) {
    alert('未配置 API Key，请先点「接口配置」填写并保存');
    state.textPolishManageOpen = true;
    render();
    return;
  }

  state.textPolishLoading = true;
  state.textPolishError = null;
  render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/text-polish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authSession.token,
      },
      body: JSON.stringify({
        draft,
        scene: state.textPolishScene || 'vendor',
        model: state.textPolishModel || undefined,
        extra: state.textPolishExtra || '',
      }),
      signal: AbortSignal.timeout(Math.max(ApiConfig.timeout || 15000, 90000)),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `润色失败 (${res.status})`);
    }
    state.textPolishResult = (json.data && json.data.polished) || '';
    if (json.data && json.data.model) state.textPolishModel = json.data.model;
  } catch (e) {
    state.textPolishError = e.message || '润色失败';
    alert(state.textPolishError);
  } finally {
    state.textPolishLoading = false;
    if (state.page === 'textPolish') render();
  }
}

async function pickDingTalkConversation(corpId) {
  if (typeof dd === 'undefined') {
    throw new Error('请在钉钉客户端内打开恒慧管后再发送到群聊');
  }
  const id = String(corpId || '').trim();
  if (!id) {
    throw new Error('未加载企业 CorpId，请刷新页面后重试');
  }
  try {
    await AuthService.ensureDingTalkJsApiConfig(['chooseChat', 'biz.chat.pickConversation']);
  } catch (e) {
    const msg = String(e.message || e);
    if (/not authed|unauthorized|未授权|鉴权/i.test(msg)) {
      throw new Error('钉钉选群未授权：请确认应用已发布，并开通「选择会话/chooseChat」权限后重试');
    }
    throw e;
  }
  return new Promise(function(resolve, reject) {
    dd.ready(function() {
      if (typeof dd.chooseChat === 'function') {
        dd.chooseChat({
          corpId: id,
          isAllowCreateGroup: false,
          filterNotOwnerGroup: false,
          success: function(res) {
            const cid = (res && (res.cid || res.openConversationId)) || '';
            if (!cid) {
              reject(new Error('未获取到群会话，请重试'));
              return;
            }
            resolve({ cid: String(cid), title: (res && res.title) || '' });
          },
          fail: function(err) {
            const msg = (err && (err.errorMessage || err.message)) || '未选择群聊';
            reject(new Error(msg));
          },
        });
        return;
      }
      if (dd.biz && dd.biz.chat && typeof dd.biz.chat.pickConversation === 'function') {
        dd.biz.chat.pickConversation({
          corpId: id,
          isConfirm: true,
          onSuccess: function(res) {
            const cid = (res && res.cid) || '';
            if (!cid) {
              reject(new Error('未获取到群会话，请重试'));
              return;
            }
            resolve({ cid: String(cid), title: (res && res.title) || '' });
          },
          onFail: function(err) {
            const msg = typeof err === 'string' ? err : ((err && err.errorMessage) || '未选择群聊');
            reject(new Error(msg));
          },
        });
        return;
      }
      reject(new Error('当前钉钉版本不支持选群，请升级客户端或使用「复制」后手动粘贴'));
    });
  });
}

async function sendTextPolishResultToChat() {
  const text = String(state.textPolishResult || '').trim();
  if (!text) {
    alert('暂无润色结果可发送');
    return;
  }
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后再发送');
    return;
  }
  if (!AuthService.isDingTalkClient()) {
    alert('发送到群聊请在钉钉客户端内打开恒慧管（手机或电脑钉钉均可）');
    return;
  }
  if (!currentUser || !currentUser.dingTalkUserId) {
    alert('当前账号未绑定钉钉 userid，请联系管理员同步通讯录');
    return;
  }
  if (state.textPolishSendingChat) return;

  state.textPolishSendingChat = true;
  render();
  try {
    if (!DingTalkApi.corpId) await loadPublicConfig();
    const picked = await pickDingTalkConversation(DingTalkApi.corpId);
    const res = await fetch(ApiConfig.baseUrl + '/text-polish/send-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authSession.token,
      },
      body: JSON.stringify({
        cid: picked.cid,
        content: text,
      }),
      signal: AbortSignal.timeout(ApiConfig.timeout || 15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `发送失败 (${res.status})`);
    }
    const title = picked.title ? `「${picked.title}」` : '群聊';
    alert(json.data && json.data.mock ? `演示模式：已模拟发送到${title}` : `已发送到${title}`);
  } catch (e) {
    alert(e.message || '发送到群聊失败');
  } finally {
    state.textPolishSendingChat = false;
    if (state.page === 'textPolish') render();
  }
}

async function copyTextPolishResult() {
  const text = String(state.textPolishResult || '').trim();
  if (!text) {
    alert('暂无润色结果可复制');
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
    alert('已复制润色结果');
  } catch (e) {
    alert('复制失败，请手动选中结果区复制');
  }
}

function applyTextPolishResultToDraft() {
  const text = String(state.textPolishResult || '').trim();
  if (!text) {
    alert('暂无润色结果');
    return;
  }
  state.textPolishDraft = text;
  render();
}

function getTextPolishTemplates() {
  return (state.textPolishOptions && Array.isArray(state.textPolishOptions.templates))
    ? state.textPolishOptions.templates
    : [];
}

function toggleTextPolishTemplates() {
  state.textPolishTemplatesOpen = !state.textPolishTemplatesOpen;
  render();
}

async function saveTextPolishResultAsTemplate() {
  const content = String(state.textPolishResult || '').trim();
  if (!content) {
    alert('暂无润色结果可存为模版');
    return;
  }
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后再保存模版');
    return;
  }
  if (state.textPolishSavingTemplate) return;
  const defaultName = content.slice(0, 24).replace(/\s+/g, ' ');
  const name = prompt('模版名称', defaultName);
  if (name == null) return;
  state.textPolishSavingTemplate = true;
  render();
  try {
    const res = await fetch(ApiConfig.baseUrl + '/text-polish/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authSession.token,
      },
      body: JSON.stringify({
        name: String(name || '').trim(),
        content,
        scene: state.textPolishScene || '',
      }),
      signal: AbortSignal.timeout(ApiConfig.timeout || 15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `保存失败 (${res.status})`);
    }
    const templates = (json.data && json.data.templates) || [];
    state.textPolishOptions = {
      ...(state.textPolishOptions || {}),
      templates,
    };
    state.textPolishTemplatesOpen = true;
    alert('模版已保存');
  } catch (e) {
    alert(e.message || '保存模版失败');
  } finally {
    state.textPolishSavingTemplate = false;
    if (state.page === 'textPolish') render();
  }
}

function applyTextPolishTemplate(id, target) {
  const tpl = getTextPolishTemplates().find(t => t.id === id);
  if (!tpl) {
    alert('模版不存在');
    return;
  }
  if (tpl.scene) state.textPolishScene = tpl.scene;
  if (target === 'draft') {
    state.textPolishDraft = tpl.content || '';
  } else {
    state.textPolishResult = tpl.content || '';
  }
  render();
}

async function deleteTextPolishTemplate(id) {
  if (!id) return;
  if (!confirm('确定删除该模版？')) return;
  if (!ApiConfig.enabled || !authSession.token) {
    alert('请连接服务端后再删除');
    return;
  }
  try {
    const res = await fetch(ApiConfig.baseUrl + '/text-polish/templates/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + authSession.token },
      signal: AbortSignal.timeout(ApiConfig.timeout || 15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `删除失败 (${res.status})`);
    }
    const templates = (json.data && json.data.templates) || [];
    state.textPolishOptions = {
      ...(state.textPolishOptions || {}),
      templates,
    };
  } catch (e) {
    alert(e.message || '删除失败');
  }
  if (state.page === 'textPolish') render();
}

function clearTextPolishForm() {
  state.textPolishDraft = '';
  state.textPolishExtra = '';
  state.textPolishResult = '';
  state.textPolishError = null;
  render();
}

function renderTextPolish() {
  if (!isFullAccess(currentUser.role)) {
    return `<div class="panel"><div class="panel-body" style="padding:24px;color:#9CA3AF;">仅管理员可使用文案润色</div></div>`;
  }

  const opts = state.textPolishOptions;
  const scenes = (opts && opts.scenes) || [
    { id: 'dingtalk', label: '钉钉工作通知' },
    { id: 'vendor', label: '对乙方/外部协作沟通' },
    { id: 'urge', label: '内部催办' },
    { id: 'email', label: '邮件正文' },
    { id: 'custom', label: '自定义' },
  ];
  const models = (opts && opts.models) || [];
  const manageModels = state.textPolishManageOpen
    ? String(state.textPolishModelsDraft || '')
      .split(/[\n,，;；]+/)
      .map(s => s.trim())
      .filter(Boolean)
    : models;
  const configured = opts ? !!opts.configured : true;
  const loadingOpts = !state.textPolishOptionsLoaded && !state.textPolishError;
  const keySourceHint = opts && opts.apiKeySource === 'env'
    ? '当前密钥来自服务端 .env；保存后将改存到业务库并由本页管理。'
    : (opts && opts.apiKeySource === 'ui' ? '当前密钥已保存在业务库。' : '');

  const sceneOptions = scenes.map(s =>
    `<option value="${escapeHtml(s.id)}" ${state.textPolishScene === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`,
  ).join('');

  const modelOptions = models.length
    ? models.map(m =>
      `<option value="${escapeHtml(m)}" ${state.textPolishModel === m ? 'selected' : ''}>${escapeHtml(m)}</option>`,
    ).join('')
    : `<option value="">（请先配置模型）</option>`;

  const defaultSelect = (manageModels.length ? manageModels : models).map(m =>
    `<option value="${escapeHtml(m)}" ${state.textPolishDefaultDraft === m ? 'selected' : ''}>${escapeHtml(m)}</option>`,
  ).join('');

  const result = String(state.textPolishResult || '');
  const busy = !!state.textPolishLoading;
  const templates = getTextPolishTemplates();
  const sceneLabelMap = Object.fromEntries(scenes.map(s => [s.id, s.label]));
  const templateListHtml = templates.length
    ? templates.map(t => {
      const preview = String(t.content || '').replace(/\s+/g, ' ').slice(0, 72);
      const sceneLabel = t.scene && sceneLabelMap[t.scene] ? sceneLabelMap[t.scene] : '';
      return `
        <div class="text-polish-tpl-item">
          <div class="text-polish-tpl-meta">
            <strong>${escapeHtml(t.name || '未命名')}</strong>
            ${sceneLabel ? `<span class="text-polish-tpl-scene">${escapeHtml(sceneLabel)}</span>` : ''}
            <div class="text-polish-tpl-preview">${escapeHtml(preview)}${String(t.content || '').length > 72 ? '…' : ''}</div>
          </div>
          <div class="text-polish-tpl-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick="applyTextPolishTemplate('${escapeHtml(t.id)}','result')" ${busy ? 'disabled' : ''}>选用</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="applyTextPolishTemplate('${escapeHtml(t.id)}','draft')" ${busy ? 'disabled' : ''}>到草稿</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="deleteTextPolishTemplate('${escapeHtml(t.id)}')" ${busy ? 'disabled' : ''} title="删除"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
    }).join('')
    : `<div class="sql-tool-desc" style="margin:0;">暂无模版。润色完成后可点「存为模版」。</div>`;

  return `
    <div class="text-polish-wrap">
      ${!configured ? `
        <div class="text-polish-banner text-polish-banner--warn">
          <i class="fas fa-triangle-exclamation"></i>
          未配置 API Key。请点击「接口配置」，填写 Base URL 与 API Key 后保存即可使用（无需改 .env）。
        </div>
      ` : ''}
      ${state.textPolishError && !busy ? `
        <div class="text-polish-banner text-polish-banner--err">
          <i class="fas fa-circle-exclamation"></i> ${escapeHtml(state.textPolishError)}
        </div>
      ` : ''}
      <div class="text-polish-grid">
        <div class="sql-tool-panel text-polish-panel">
          <h3><i class="fas fa-wand-magic-sparkles" style="color:var(--brand);margin-right:8px;"></i>草稿与参数</h3>
          <div class="sql-tool-desc">把口语想法写成正式通知/催办/邮件正文。系统提示词按场景固定；可追加补充要求。示例：钉钉个人账号迁企业号，联系乙方李思琪老师问是否方便，方便则按文件迁移下发。</div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">场景</label>
            <select class="select" style="width:100%;" onchange="onTextPolishSceneChange(this.value)" ${busy ? 'disabled' : ''}>
              ${sceneOptions}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">模型</label>
            <div class="text-polish-model-row">
              <select class="select" style="flex:1;min-width:0;" onchange="onTextPolishModelChange(this.value)" ${busy || !models.length ? 'disabled' : ''}>
                ${modelOptions}
              </select>
              <button type="button" class="btn btn-ghost btn-sm" onclick="toggleTextPolishManage()" ${busy ? 'disabled' : ''}>
                <i class="fas fa-sliders"></i> 接口配置
              </button>
            </div>
          </div>
          ${state.textPolishManageOpen ? `
            <div class="text-polish-manage">
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label">接口地址 Base URL</label>
                <input type="text" class="input" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;"
                  placeholder="https://api.deepseek.com/v1"
                  value="${escapeHtml(state.textPolishBaseUrlDraft || '')}"
                  oninput="onTextPolishBaseUrlDraftInput(this.value)" ${state.textPolishSavingModels ? 'disabled' : ''} />
                <div class="sql-tool-desc" style="margin:6px 0 0;">DeepSeek 请带 <code>/v1</code>（填根域也会自动补全）。</div>
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label">API Key</label>
                <input type="password" class="input" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;"
                  placeholder="sk-..."
                  value="${escapeHtml(state.textPolishApiKeyDraft || '')}"
                  oninput="onTextPolishApiKeyDraftInput(this.value)" ${state.textPolishSavingModels ? 'disabled' : ''}
                  autocomplete="off" />
                ${keySourceHint ? `<div class="sql-tool-desc" style="margin:6px 0 0;">${escapeHtml(keySourceHint)}</div>` : ''}
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label">模型 ID 列表（每行一个，或逗号分隔）</label>
                <textarea class="textarea" style="width:100%;min-height:88px;font-family:ui-monospace,monospace;font-size:12px;"
                  oninput="onTextPolishModelsDraftInput(this.value)" ${state.textPolishSavingModels ? 'disabled' : ''}>${escapeHtml(state.textPolishModelsDraft || '')}</textarea>
              </div>
              <div class="form-group" style="margin-bottom:10px;max-width:320px;">
                <label class="form-label">默认模型</label>
                <select class="select" style="width:100%;" onchange="onTextPolishDefaultDraftChange(this.value)" ${state.textPolishSavingModels ? 'disabled' : ''}>
                  ${defaultSelect || '<option value="">（无）</option>'}
                </select>
              </div>
              <div class="sql-tool-actions" style="margin-top:0;">
                <button type="button" class="btn btn-primary btn-sm" onclick="saveTextPolishModels()" ${state.textPolishSavingModels ? 'disabled' : ''}>
                  <i class="fas fa-save"></i> ${state.textPolishSavingModels ? '保存中…' : '保存配置'}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="toggleTextPolishManage()" ${state.textPolishSavingModels ? 'disabled' : ''}>取消</button>
              </div>
            </div>
          ` : ''}
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">草稿</label>
            <textarea class="textarea" style="width:100%;min-height:160px;"
              placeholder="用口语写下要表达的意思…"
              oninput="onTextPolishDraftInput(this.value)" ${busy ? 'disabled' : ''}>${escapeHtml(state.textPolishDraft || '')}</textarea>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">补充要求（可选）</label>
            <textarea class="textarea" style="width:100%;min-height:72px;"
              placeholder="例如：更简短、带称呼「李思琪老师」、结尾要感谢"
              oninput="onTextPolishExtraInput(this.value)" ${busy ? 'disabled' : ''}>${escapeHtml(state.textPolishExtra || '')}</textarea>
          </div>
          <div class="sql-tool-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="runTextPolish()" ${busy || loadingOpts || !configured ? 'disabled' : ''}>
              <i class="fas ${busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}"></i> ${busy ? '润色中…' : '润色'}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="clearTextPolishForm()" ${busy ? 'disabled' : ''}>
              <i class="fas fa-rotate-right"></i> 清空
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="loadTextPolishOptions(true)" ${busy ? 'disabled' : ''}>
              <i class="fas fa-rotate"></i> 刷新配置
            </button>
          </div>
        </div>
        <div class="sql-tool-panel text-polish-panel">
          <h3>润色结果</h3>
          <div class="sql-tool-desc">可直接「发送到群聊」（钉钉内选群）、复制到邮件/通知，或「存为模版」复用。</div>
          <pre class="sql-tool-output text-polish-output${result ? '' : ' is-empty'}">${escapeHtml(result || (busy ? '正在润色…' : '（点击「润色」后显示结果）'))}</pre>
          <div class="sql-tool-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="sendTextPolishResultToChat()" ${!result || busy || state.textPolishSendingChat ? 'disabled' : ''}>
              <i class="fas ${state.textPolishSendingChat ? 'fa-spinner fa-spin' : 'fa-paper-plane'}"></i> ${state.textPolishSendingChat ? '发送中…' : '发送到群聊'}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="copyTextPolishResult()" ${!result || busy ? 'disabled' : ''}>
              <i class="fas fa-copy"></i> 复制
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="applyTextPolishResultToDraft()" ${!result || busy ? 'disabled' : ''}>
              <i class="fas fa-arrow-left"></i> 采用到草稿
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="saveTextPolishResultAsTemplate()" ${!result || busy || state.textPolishSavingTemplate ? 'disabled' : ''}>
              <i class="fas ${state.textPolishSavingTemplate ? 'fa-spinner fa-spin' : 'fa-bookmark'}"></i> ${state.textPolishSavingTemplate ? '保存中…' : '存为模版'}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="toggleTextPolishTemplates()" ${busy ? 'disabled' : ''}>
              <i class="fas fa-folder-open"></i> 模版库${templates.length ? ` (${templates.length})` : ''}
            </button>
          </div>
          ${state.textPolishTemplatesOpen ? `
            <div class="text-polish-tpl-list">
              <div class="text-polish-tpl-title">已存模版</div>
              ${templateListHtml}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}
