const config = require('../config');
const { getLlmSettings, setLlmSettings } = require('../db/database');

const MAX_DRAFT_CHARS = 8000;
const MAX_EXTRA_CHARS = 2000;
const MAX_MODELS = 30;
const MAX_TEMPLATES = 50;
const MAX_TEMPLATE_NAME = 60;

const SCENES = [
  {
    id: 'dingtalk',
    label: '钉钉工作通知',
    system:
      '你是企业办公文案助手。将用户提供的口语草稿润色为可直接发送的钉钉工作通知正文。要求：语气正式简洁、结构清晰、诉求明确、可执行下一步清楚；不要使用 markdown；不要添加与草稿无关的内容；直接输出正文。',
  },
  {
    id: 'vendor',
    label: '对乙方/外部协作沟通',
    system:
      '你是企业对外协作文案助手。将用户草稿润色为致外部/乙方联系人的礼貌专业沟通正文。要求：有恰当称呼与感谢、说明背景与诉求、询问是否方便、明确若方便后的行动；语气克制专业；不要使用 markdown；直接输出正文。',
  },
  {
    id: 'urge',
    label: '内部催办',
    system:
      '你是企业内部催办文案助手。将用户草稿润色为对同事的催办消息。要求：礼貌但不拖沓、点明事项与期望时间/动作、可提醒影响但不指责；不要使用 markdown；直接输出正文。',
  },
  {
    id: 'email',
    label: '邮件正文',
    system:
      '你是企业邮件文案助手。将用户草稿润色为正式邮件正文（可不含主题行）。要求：开头称呼、事由清楚、分段简洁、结尾致谢与署名占位可选；不要使用 markdown；直接输出正文。',
  },
  {
    id: 'custom',
    label: '自定义',
    system:
      '你是企业文案润色助手。按用户草稿与补充要求改写为清晰、专业、可直接发送的中文正文。不要使用 markdown；不要编造草稿未提及的事实；直接输出正文。',
  },
];

function uniqModels(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

function readStored() {
  const stored = getLlmSettings();
  return stored && typeof stored === 'object' ? stored : {};
}

/** 规范化 OpenAI 兼容 Base URL；DeepSeek 根域缺 /v1 时自动补上 */
function normalizeBaseUrl(raw) {
  let bu = String(raw || '').trim().replace(/\/+$/, '');
  if (!bu) return '';
  try {
    const u = new URL(bu);
    const host = String(u.hostname || '').toLowerCase();
    const path = String(u.pathname || '').replace(/\/+$/, '');
    if (host === 'api.deepseek.com' && (!path || path === '/')) {
      bu = `${u.origin}/v1`;
    }
  } catch {
    // keep trimmed string
  }
  return bu.replace(/\/+$/, '');
}

function seedModelsFromEnv() {
  const models = uniqModels(
    (config.llm.models && config.llm.models.length
      ? config.llm.models
      : [config.llm.defaultModel]).filter(Boolean),
  );
  const defaultModel =
    (config.llm.defaultModel && models.includes(config.llm.defaultModel)
      ? config.llm.defaultModel
      : models[0]) || '';
  return { models, defaultModel };
}

function resolveSettings() {
  const stored = readStored();
  if (Array.isArray(stored.models) && stored.models.length) {
    const models = uniqModels(stored.models);
    const defaultModel =
      (stored.defaultModel && models.includes(String(stored.defaultModel).trim())
        ? String(stored.defaultModel).trim()
        : models[0]) || '';
    return { models, defaultModel };
  }
  return seedModelsFromEnv();
}

/** 页面保存的密钥优先，其次 .env */
function resolveCredentials() {
  const stored = readStored();
  const apiKey = String(stored.apiKey || '').trim() || String(config.llm.apiKey || '').trim();
  const baseUrl = normalizeBaseUrl(stored.baseUrl || '') || normalizeBaseUrl(config.llm.baseUrl || '');
  const apiKeySource = String(stored.apiKey || '').trim() ? 'ui' : (config.llm.apiKey ? 'env' : 'none');
  const baseUrlSource = String(stored.baseUrl || '').trim() ? 'ui' : (config.llm.baseUrl ? 'env' : 'none');
  return { apiKey, baseUrl, apiKeySource, baseUrlSource };
}

function isConfigured() {
  const { apiKey, baseUrl } = resolveCredentials();
  return !!(apiKey && baseUrl);
}

function listScenes() {
  return SCENES.map(s => ({ id: s.id, label: s.label }));
}

function listTemplates() {
  const stored = readStored();
  const list = Array.isArray(stored.templates) ? stored.templates : [];
  return list
    .filter(t => t && t.id && t.content)
    .map(t => ({
      id: String(t.id),
      name: String(t.name || '未命名模版').slice(0, MAX_TEMPLATE_NAME),
      content: String(t.content || ''),
      scene: String(t.scene || ''),
      createdAt: t.createdAt || null,
    }))
    .slice(0, MAX_TEMPLATES);
}

function persistTemplates(templates) {
  const prev = readStored();
  const next = { ...prev, templates };
  // 保证 models 等关键字段仍在
  if (!Array.isArray(next.models) || !next.models.length) {
    const seed = seedModelsFromEnv();
    next.models = seed.models;
    next.defaultModel = next.defaultModel || seed.defaultModel;
  }
  setLlmSettings(next);
  return listTemplates();
}

function createTemplate({ name, content, scene } = {}) {
  const text = String(content || '').trim();
  if (!text) {
    const err = new Error('模版内容不能为空');
    err.status = 400;
    throw err;
  }
  if (text.length > MAX_DRAFT_CHARS) {
    const err = new Error(`模版内容过长（最多 ${MAX_DRAFT_CHARS} 字）`);
    err.status = 400;
    throw err;
  }
  let title = String(name || '').trim().slice(0, MAX_TEMPLATE_NAME);
  if (!title) {
    title = text.slice(0, 24).replace(/\s+/g, ' ') + (text.length > 24 ? '…' : '');
  }
  const list = listTemplates();
  if (list.length >= MAX_TEMPLATES) {
    const err = new Error(`模版最多 ${MAX_TEMPLATES} 条，请先删除旧模版`);
    err.status = 400;
    throw err;
  }
  const row = {
    id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: title,
    content: text,
    scene: String(scene || '').trim(),
    createdAt: new Date().toISOString(),
  };
  list.unshift(row);
  persistTemplates(list);
  return row;
}

function deleteTemplate(id) {
  const tid = String(id || '').trim();
  if (!tid) {
    const err = new Error('缺少模版 id');
    err.status = 400;
    throw err;
  }
  const list = listTemplates();
  const next = list.filter(t => t.id !== tid);
  if (next.length === list.length) {
    const err = new Error('模版不存在');
    err.status = 404;
    throw err;
  }
  return persistTemplates(next);
}

function getOptions() {
  const settings = resolveSettings();
  const cred = resolveCredentials();
  return {
    configured: isConfigured(),
    baseUrl: cred.baseUrl || '',
    /** 管理员回显当前生效密钥（页面或 .env），便于直接查看/修改 */
    apiKey: cred.apiKey || '',
    hasApiKey: !!cred.apiKey,
    apiKeySource: cred.apiKeySource,
    baseUrlSource: cred.baseUrlSource,
    models: settings.models,
    defaultModel: settings.defaultModel,
    scenes: listScenes(),
    templates: listTemplates(),
    maxDraftChars: MAX_DRAFT_CHARS,
    maxExtraChars: MAX_EXTRA_CHARS,
  };
}

function saveSettings({ models, defaultModel, apiKey, baseUrl, clearApiKey } = {}) {
  const prev = readStored();
  const cleaned = uniqModels(models != null ? models : prev.models);
  const seed = seedModelsFromEnv();
  const finalModels = cleaned.length ? cleaned : seed.models;
  if (!finalModels.length) {
    const err = new Error('至少保留一个模型 ID');
    err.status = 400;
    throw err;
  }
  let def = String(defaultModel != null ? defaultModel : prev.defaultModel || '').trim();
  if (!def || !finalModels.includes(def)) def = finalModels[0];

  const next = {
    models: finalModels,
    defaultModel: def,
  };

  if (baseUrl !== undefined) {
    const bu = normalizeBaseUrl(baseUrl);
    if (bu) next.baseUrl = bu;
    else if (prev.baseUrl) next.baseUrl = normalizeBaseUrl(prev.baseUrl);
  } else if (prev.baseUrl) {
    next.baseUrl = normalizeBaseUrl(prev.baseUrl);
  }

  if (clearApiKey) {
    // 显式清空页面密钥，回退 .env
  } else if (apiKey !== undefined) {
    const key = String(apiKey || '').trim();
    if (key) next.apiKey = key;
    else if (prev.apiKey) next.apiKey = String(prev.apiKey).trim();
  } else if (prev.apiKey) {
    next.apiKey = String(prev.apiKey).trim();
  }

  if (Array.isArray(prev.templates)) {
    next.templates = prev.templates;
  }

  return setLlmSettings(next);
}

/** @deprecated 兼容旧调用名 */
function saveModels(payload) {
  return saveSettings(payload);
}

function findScene(sceneId) {
  return SCENES.find(s => s.id === sceneId) || SCENES.find(s => s.id === 'custom');
}

async function polish({ draft, scene, model, extra } = {}) {
  const cred = resolveCredentials();
  if (!cred.apiKey || !cred.baseUrl) {
    const err = new Error('未配置 API Key：请在本页「接口配置」填写并保存，或在服务端 .env 设置 LLM_API_KEY');
    err.status = 503;
    throw err;
  }
  const text = String(draft || '').trim();
  if (!text) {
    const err = new Error('请输入待润色草稿');
    err.status = 400;
    throw err;
  }
  if (text.length > MAX_DRAFT_CHARS) {
    const err = new Error(`草稿过长（最多 ${MAX_DRAFT_CHARS} 字）`);
    err.status = 400;
    throw err;
  }
  const extraText = String(extra || '').trim();
  if (extraText.length > MAX_EXTRA_CHARS) {
    const err = new Error(`补充要求过长（最多 ${MAX_EXTRA_CHARS} 字）`);
    err.status = 400;
    throw err;
  }

  const settings = resolveSettings();
  let useModel = String(model || '').trim() || settings.defaultModel;
  if (!useModel || !settings.models.includes(useModel)) {
    const err = new Error('所选模型不在已配置列表中，请先在「接口配置」中添加');
    err.status = 400;
    throw err;
  }

  const sceneDef = findScene(String(scene || 'custom').trim());
  const userParts = [`【草稿】\n${text}`];
  if (extraText) userParts.push(`【补充要求】\n${extraText}`);

  const url = `${cred.baseUrl}/chat/completions`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cred.apiKey}`,
      },
      body: JSON.stringify({
        model: useModel,
        temperature: 0.4,
        messages: [
          { role: 'system', content: sceneDef.system },
          { role: 'user', content: userParts.join('\n\n') },
        ],
      }),
      signal: AbortSignal.timeout(config.llm.timeoutMs),
    });
  } catch (e) {
    const msg =
      e && e.name === 'TimeoutError'
        ? '大模型请求超时，请稍后重试或调大 LLM_TIMEOUT_MS'
        : `无法连接大模型服务：${e.message || e}`;
    const err = new Error(msg);
    err.status = 502;
    throw err;
  }

  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const upstream =
      (json && (json.error?.message || json.message || json.error)) ||
      raw.slice(0, 200) ||
      `HTTP ${res.status}`;
    const err = new Error(`大模型返回错误：${typeof upstream === 'string' ? upstream : JSON.stringify(upstream)}`);
    err.status = 502;
    throw err;
  }

  const polished = String(
    json?.choices?.[0]?.message?.content ||
      json?.choices?.[0]?.text ||
      '',
  ).trim();
  if (!polished) {
    const err = new Error('大模型未返回有效正文');
    err.status = 502;
    throw err;
  }

  return {
    polished,
    model: useModel,
    scene: sceneDef.id,
  };
}

module.exports = {
  MAX_DRAFT_CHARS,
  MAX_EXTRA_CHARS,
  getOptions,
  saveSettings,
  saveModels,
  listTemplates,
  createTemplate,
  deleteTemplate,
  polish,
  isConfigured,
  resolveSettings,
  resolveCredentials,
};
