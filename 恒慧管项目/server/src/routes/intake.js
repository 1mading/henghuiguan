const express = require('express');
const { verifyAitableSignature } = require('../middleware/verifyAitableSignature');
const { processAitableIntake } = require('../services/intakeAitable');

const router = express.Router();

router.post('/intake/aitable', verifyAitableSignature, async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    const clientToken = String(req.headers['client-token'] || '').trim();
    if (clientToken && !body.clientToken) body.clientToken = clientToken;
    const result = await processAitableIntake(body);
    res.json(result);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({
      success: false,
      message: e.message || '处理失败',
    });
  }
});

module.exports = router;
