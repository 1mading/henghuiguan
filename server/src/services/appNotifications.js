const { v4: uuidv4 } = require('uuid');
const { insertNotifications } = require('../db/database');

/**
 * 根据推送收件人写入应用内通知（每人一条）。
 * 与钉钉 userid 是否绑定无关，只要有 userId / 能识别用户即可。
 */
function createInboxFromPush({
  eventType,
  title,
  content,
  recipients = [],
  payload = {},
  operator = '',
  pushLogId = null,
}) {
  const now = new Date();
  const createdAt = now.toISOString();
  const time = now.toLocaleString('zh-CN');
  const seen = new Set();
  const entries = [];

  for (const r of recipients) {
    const userId = r.userId || r.id;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    entries.push({
      id: `N-${uuidv4().slice(0, 8)}`,
      userId,
      userName: r.userName || r.name || '',
      eventType: eventType || '',
      title: title || '【恒慧管】通知',
      content: content || '',
      taskId: payload?.taskId || null,
      projectId: payload?.projectId || null,
      createdAt,
      time,
      pushLogId,
      operator: operator || '',
    });
  }

  return insertNotifications(entries);
}

module.exports = {
  createInboxFromPush,
};
