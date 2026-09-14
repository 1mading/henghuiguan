const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { writeErr } = require('../utils/response');
const { isFullAccess } = require('../utils/roles');
const textPolish = require('../services/textPolish');
const { sendConversationMessage } = require('../services/dingtalk');

const router = express.Router();

function canUseTextPolish(user) {
  try {
    const { capOn } = require('../services/permissions');
    return capOn(user, 'nav.textPolish') && isFullAccess(user?.role);
  } catch {
    return isFullAccess(user?.role);
  }
}

function requireTextPolishAdmin(req, res, next) {
  if (!canUseTextPolish(req.user)) {
    return writeErr(res, 403, '仅管理员可使用文案润色');
  }
  next();
}

router.get('/text-polish/options', requireAuth, requireTextPolishAdmin, (_req, res) => {
  try {
    res.json({ success: true, data: textPolish.getOptions() });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '获取润色配置失败');
  }
});

router.put('/text-polish/models', requireAuth, requireTextPolishAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const models = Array.isArray(body.models) ? body.models : undefined;
    const saved = textPolish.saveSettings({
      models,
      defaultModel: body.defaultModel,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      clearApiKey: !!body.clearApiKey,
    });
    const opts = textPolish.getOptions();
    res.json({
      success: true,
      data: {
        models: saved.models,
        defaultModel: saved.defaultModel,
        configured: opts.configured,
        baseUrl: opts.baseUrl,
        hasApiKey: opts.hasApiKey,
        apiKey: opts.apiKey,
        apiKeySource: opts.apiKeySource,
        baseUrlSource: opts.baseUrlSource,
        templates: opts.templates || [],
      },
    });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '保存配置失败');
  }
});

router.post('/text-polish', requireAuth, requireTextPolishAdmin, async (req, res) => {
  try {
    const result = await textPolish.polish({
      draft: req.body?.draft,
      scene: req.body?.scene,
      model: req.body?.model,
      extra: req.body?.extra,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '润色失败');
  }
});

router.post('/text-polish/templates', requireAuth, requireTextPolishAdmin, (req, res) => {
  try {
    const row = textPolish.createTemplate({
      name: req.body?.name,
      content: req.body?.content,
      scene: req.body?.scene,
    });
    res.json({
      success: true,
      data: {
        template: row,
        templates: textPolish.listTemplates(),
      },
    });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '保存模版失败');
  }
});

router.post('/text-polish/send-chat', requireAuth, requireTextPolishAdmin, async (req, res) => {
  try {
    const cid = req.body?.cid;
    const content = req.body?.content;
    const result = await sendConversationMessage({
      senderUserId: req.user?.dingTalkUserId,
      cid,
      content,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '发送到群聊失败');
  }
});

router.delete('/text-polish/templates/:id', requireAuth, requireTextPolishAdmin, (req, res) => {
  try {
    const templates = textPolish.deleteTemplate(req.params.id);
    res.json({ success: true, data: { templates } });
  } catch (e) {
    writeErr(res, e.status || 500, e.message || '删除模版失败');
  }
});

module.exports = router;
