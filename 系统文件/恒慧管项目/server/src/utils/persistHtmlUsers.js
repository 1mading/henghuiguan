const fs = require('fs');
const path = require('path');
const config = require('../config');

function escJs(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function userToJsLine(u) {
  const parts = [
    `id: '${escJs(u.id)}'`,
    `name: '${escJs(u.name)}'`,
    `dept: '${escJs(u.dept)}'`,
    `role: '${escJs(u.role)}'`,
    `position: '${escJs(u.position || '')}'`,
    `leaderId: '${escJs(u.leaderId || '')}'`,
    `standardWeekHours: ${Number(u.standardWeekHours) || 60}`,
  ];
  if (u.dingTalkUserId) parts.push(`dingTalkUserId: '${escJs(u.dingTalkUserId)}'`);
  return `      { ${parts.join(', ')} }`;
}

/**
 * 将 users 写回 恒慧管.html 内嵌种子数据，刷新页面时与后端保持一致
 */
function persistUsersToHtml(users) {
  try {
    const htmlPath = path.join(config.staticDir, '恒慧管.html');
    if (!fs.existsSync(htmlPath)) {
      console.warn('[persistHtmlUsers] HTML 不存在:', htmlPath);
      return false;
    }
    let html = fs.readFileSync(htmlPath, 'utf8');
    const marker = '// 用户数据 - 信息中心组织架构';
    const startIdx = html.indexOf(marker);
    if (startIdx < 0) return false;

    const arrayStart = html.indexOf('let users = [', startIdx);
    const legacyStart = arrayStart < 0 ? html.indexOf('const users = [', startIdx) : arrayStart;
    if (legacyStart < 0) return false;
    const arrayEnd = html.indexOf('\n    ];', legacyStart);
    if (arrayEnd < 0) return false;

    const lines = (users || []).map(userToJsLine);
    const newBlock = `${marker}\n    let users = [\n${lines.join(',\n')},\n    ];`;
    html = html.slice(0, startIdx) + newBlock + html.slice(arrayEnd + '\n    ];'.length);
    fs.writeFileSync(htmlPath, html, 'utf8');
    return true;
  } catch (e) {
    console.error('[persistHtmlUsers] 写入失败:', e.message);
    return false;
  }
}

module.exports = { persistUsersToHtml };
