/** FactoryCheckList 兼容响应格式 */
function writeOk(res, data) {
  res.json({ code: 200, message: 'ok', data: data ?? null });
}

function writeErr(res, status, message, data) {
  res.status(status).json({ code: status, message: message || 'error', data: data ?? null });
}

function toProfileUser(user) {
  if (!user) return null;
  return {
    user_id: user.dingTalkUserId || user.id,
    display_name: user.name,
    role: user.role,
    dept: user.dept,
    position: user.position,
    internal_id: user.id,
    ding_talk_user_id: user.dingTalkUserId || '',
  };
}

module.exports = { writeOk, writeErr, toProfileUser };
