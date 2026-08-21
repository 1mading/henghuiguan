/**
 * 从 恒慧管.html 内嵌 users 种子导入服务端人员档案
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { setUsers, getAllUsers, setStaffDeptCatalog } = require('../src/db/database');
const {
  DEFAULT_MEMBER_DEPT_NAMES,
  defaultStaffDeptCatalog,
  PROFILE_KIND_MEMBER,
  PROFILE_KIND_CONTACT,
} = require('../src/utils/staffProfile');

const htmlPath = path.resolve(__dirname, '../../恒慧管.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const start = html.indexOf('let users = [');
if (start < 0) throw new Error('未找到 let users = [');
const arrStart = html.indexOf('[', start);
let depth = 0;
let end = -1;
for (let i = arrStart; i < html.length; i++) {
  const ch = html[i];
  if (ch === '[') depth++;
  else if (ch === ']') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end < 0) throw new Error('未能解析 users 数组');
const usersLiteral = html.slice(arrStart, end);
// eslint-disable-next-line no-new-func
const seedUsers = Function(`"use strict"; return (${usersLiteral});`)();

const memberDeptSet = new Set(DEFAULT_MEMBER_DEPT_NAMES);
const existing = getAllUsers();
const existingByDing = new Map(
  existing.filter(u => u.dingTalkUserId).map(u => [String(u.dingTalkUserId), u])
);
const existingById = new Map(existing.map(u => [u.id, u]));

const nextUsers = seedUsers.map((u) => {
  const prev = existingByDing.get(String(u.dingTalkUserId || '')) || existingById.get(u.id);
  const isMemberDept = memberDeptSet.has(u.dept);
  const profileKind = isMemberDept ? PROFILE_KIND_MEMBER : PROFILE_KIND_CONTACT;
  return {
    ...u,
    profileKind,
    active: true,
    // 保留已绑定的钉钉扩展字段 / 管理员角色
    dingTalkUnionId: prev?.dingTalkUnionId || u.dingTalkUnionId || '',
    dingTalkMobile: prev?.dingTalkMobile || u.dingTalkMobile || '',
    dingTalkAvatar: prev?.dingTalkAvatar || u.dingTalkAvatar || '',
    dingTalkJobNumber: prev?.dingTalkJobNumber || u.dingTalkJobNumber || '',
    role: prev?.role === 'admin' || u.role === 'admin' ? 'admin' : u.role,
    position: prev?.role === 'admin' || u.role === 'admin'
      ? (prev?.position || u.position || '管理员')
      : u.position,
  };
});

// 确保当前登录账号仍在（若种子缺失则追加）
for (const prev of existing) {
  if (!prev.dingTalkUserId) continue;
  if (String(prev.dingTalkUserId).startsWith('demo_')) continue;
  if (!nextUsers.some(u => String(u.dingTalkUserId) === String(prev.dingTalkUserId))) {
    nextUsers.push({ ...prev, active: true, profileKind: prev.profileKind || PROFILE_KIND_MEMBER });
  }
}

const catalog = defaultStaffDeptCatalog();
const known = new Set(catalog.map(d => d.name));
const contactDepts = [...new Set(nextUsers.map(u => u.dept).filter(d => d && !known.has(d)))];
for (const name of contactDepts) {
  catalog.push({
    name,
    kind: PROFILE_KIND_CONTACT,
    parentName: name.includes('财务') || name === '财务中心' ? '财务中心' : '',
    dingTalkDeptId: '',
  });
}
if (contactDepts.some(n => n === '财务中心' || n.includes('财务')) && !known.has('财务中心')) {
  // ensure 财务中心 root exists
  if (!catalog.some(d => d.name === '财务中心')) {
    catalog.unshift({
      name: '财务中心',
      kind: PROFILE_KIND_CONTACT,
      parentName: '',
      dingTalkDeptId: '',
    });
  }
  catalog.forEach(d => {
    if (d.name !== '财务中心' && (d.name.includes('财务') || ['账务管理组', '内部核算组', '海外管理组', '关务部', '成衣进出口组', '面辅料出运组', '财务核算组', '财务部'].includes(d.name))) {
      if (!d.parentName) d.parentName = '财务中心';
    }
  });
}

setUsers(nextUsers);
setStaffDeptCatalog(catalog);

console.log(JSON.stringify({
  ok: true,
  users: nextUsers.length,
  members: nextUsers.filter(u => u.profileKind === 'member').length,
  contacts: nextUsers.filter(u => u.profileKind === 'contact').length,
  catalog: catalog.length,
  admin: nextUsers.find(u => u.dingTalkUserId === '669701617'),
}, null, 2));
