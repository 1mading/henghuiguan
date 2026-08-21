const express = require('express');
const { verifyAitableSignature } = require('../middleware/verifyAitableSignature');
const { processAitableIntake } = require('../services/intakeAitable');
const { emitChange } = require('../services/realtime');

const router = express.Router();

router.post('/intake/aitable', verifyAitableSignature, async (req, res) => {
  const titleHint = String(req.body?.title || req.body?.['事项标题'] || '').trim().slice(0, 80);
  try {
    const body = { ...(req.body || {}) };
    const clientToken = String(req.headers['client-token'] || '').trim();
    if (clientToken && !body.clientToken) body.clientToken = clientToken;
    const result = await processAitableIntake(body);
    if (result?.success && result.taskId) {
      console.log(
        `[intake] ${result.duplicate ? 'duplicate' : 'created'} taskId=${result.taskId} title=${titleHint || '(empty)'}`
      );
      emitChange({
        type: 'task.fields',
        entityType: 'task',
        entityIds: [result.taskId],
        actorId: null,
        meta: { source: 'intake' },
      });
    } else {
      console.warn('[intake] unexpected result', result);
    }
    res.json(result);
  } catch (e) {
    const status = e.status || 500;
    console.error(`[intake] failed status=${status} title=${titleHint || '(empty)'} msg=${e.message}`);
    res.status(status).json({
      success: false,
      message: e.message || '处理失败',
    });
  }
});

module.exports = router;
