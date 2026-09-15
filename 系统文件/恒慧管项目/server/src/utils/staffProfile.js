/** 人员档案：以钉钉通讯录为准；全员可登录（默认执行人员） */

const PROFILE_KIND_MEMBER = 'member';
/** @deprecated 存量兼容；新部门/新人一律 member，加载时会迁成 member */
const PROFILE_KIND_CONTACT = 'contact';
const INFO_CENTER_DEPT = '信息中心';

/** 信息中心业务部门缺省清单（与历史前端 STAFF_DEPT_OPTIONS 一致） */
const DEFAULT_MEMBER_DEPT_NAMES = [
  '信息中心',
  '规划建设部',
  '实施交付部',
  '研发集成部',
  '网络运维部',
  'AI创新部',
  '项目管控部',
];

function defaultStaffDeptCatalog() {
  return DEFAULT_MEMBER_DEPT_NAMES.map(name => ({
    name,
    kind: PROFILE_KIND_MEMBER,
    parentName: name === INFO_CENTER_DEPT ? '' : INFO_CENTER_DEPT,
  }));
}

function normalizeProfileKind(kind) {
  // 取消通知联系人：历史 contact 一律视为 member
  return PROFILE_KIND_MEMBER;
}

function isContactProfile(user) {
  return false;
}

function isBusinessMember(user) {
  return !!(user && user.active !== false);
}

function normalizeCatalogEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const name = entry.trim();
    if (!name) return null;
    return {
      name,
      kind: PROFILE_KIND_MEMBER,
      parentName: name === INFO_CENTER_DEPT
        ? ''
        : (DEFAULT_MEMBER_DEPT_NAMES.includes(name) && name !== INFO_CENTER_DEPT ? INFO_CENTER_DEPT : ''),
    };
  }
  const name = String(entry.name || '').trim();
  if (!name) return null;
  let parentName = entry.parentName != null ? String(entry.parentName).trim() : '';
  if (!parentName && name !== INFO_CENTER_DEPT && DEFAULT_MEMBER_DEPT_NAMES.includes(name)) {
    parentName = INFO_CENTER_DEPT;
  }
  return {
    name,
    kind: PROFILE_KIND_MEMBER,
    parentName,
    dingTalkDeptId: entry.dingTalkDeptId || entry.deptId || '',
  };
}

function normalizeStaffDeptCatalog(list) {
  if (!Array.isArray(list) || !list.length) return defaultStaffDeptCatalog();
  const byName = new Map();
  for (const raw of list) {
    const entry = normalizeCatalogEntry(raw);
    if (!entry) continue;
    const prev = byName.get(entry.name);
    if (prev) {
      byName.set(entry.name, {
        ...prev,
        ...entry,
        kind: entry.kind || prev.kind,
        parentName: entry.parentName || prev.parentName || '',
      });
    } else {
      byName.set(entry.name, entry);
    }
  }
  if (!byName.size) return defaultStaffDeptCatalog();
  if (![...byName.values()].some(d => d.kind === PROFILE_KIND_MEMBER && !d.parentName)) {
    if (!byName.has(INFO_CENTER_DEPT)) {
      byName.set(INFO_CENTER_DEPT, {
        name: INFO_CENTER_DEPT,
        kind: PROFILE_KIND_MEMBER,
        parentName: '',
      });
    }
  }
  return [...byName.values()];
}

function catalogKindForDept(catalog, deptName) {
  return PROFILE_KIND_MEMBER;
}

function resolveProfileKindForUser({ dept, role, catalog }) {
  return PROFILE_KIND_MEMBER;
}

function mergeDeptsIntoCatalog(catalog, deptNames, defaultKind = PROFILE_KIND_MEMBER) {
  const next = normalizeStaffDeptCatalog(catalog).map(d => ({ ...d }));
  const byName = new Map(next.map(d => [d.name, d]));
  for (const raw of deptNames || []) {
    const name = String(raw || '').trim();
    if (!name || byName.has(name)) continue;
    const entry = normalizeCatalogEntry({ name, kind: PROFILE_KIND_MEMBER });
    next.push(entry);
    byName.set(name, entry);
  }
  // 存量 contact 部门一并升为 member
  for (const d of next) d.kind = PROFILE_KIND_MEMBER;
  return next;
}

function upsertCatalogDept(catalog, name, kind, parentName) {
  const n = String(name || '').trim();
  if (!n) return normalizeStaffDeptCatalog(catalog);
  const next = normalizeStaffDeptCatalog(catalog).map(d => ({ ...d }));
  const idx = next.findIndex(d => d.name === n);
  const prev = idx >= 0 ? next[idx] : null;
  const entry = {
    name: n,
    kind: PROFILE_KIND_MEMBER,
    parentName: parentName != null
      ? String(parentName).trim()
      : (prev?.parentName || (n === INFO_CENTER_DEPT ? '' : (DEFAULT_MEMBER_DEPT_NAMES.includes(n) ? INFO_CENTER_DEPT : ''))),
    dingTalkDeptId: prev?.dingTalkDeptId || '',
  };
  if (idx >= 0) next[idx] = { ...prev, ...entry };
  else next.push(entry);
  return next;
}

/**
 * 从钉钉部门图合并进 catalog（新部门一律 member）
 */
function mergeOrgTreeIntoCatalog(catalog, nodes) {
  let next = normalizeStaffDeptCatalog(catalog).map(d => ({ ...d }));
  const byName = new Map(next.map(d => [d.name, d]));
  for (const raw of nodes || []) {
    const name = String(raw.name || '').trim();
    if (!name) continue;
    const parentName = String(raw.parentName || '').trim();
    const existing = byName.get(name);
    const entry = {
      name,
      kind: PROFILE_KIND_MEMBER,
      parentName: parentName || existing?.parentName || (
        name === INFO_CENTER_DEPT ? '' : (DEFAULT_MEMBER_DEPT_NAMES.includes(name) ? INFO_CENTER_DEPT : '')
      ),
      dingTalkDeptId: raw.dingTalkDeptId || existing?.dingTalkDeptId || '',
    };
    if (existing) {
      const idx = next.findIndex(d => d.name === name);
      next[idx] = { ...existing, ...entry, kind: PROFILE_KIND_MEMBER };
      byName.set(name, next[idx]);
    } else {
      next.push(entry);
      byName.set(name, entry);
    }
  }
  return normalizeStaffDeptCatalog(next);
}

/** 构建展示用森林 */
function buildOrgForest(catalog) {
  const list = normalizeStaffDeptCatalog(catalog);
  const byName = new Map(list.map(d => [d.name, { ...d, children: [] }]));
  const roots = [];
  for (const node of byName.values()) {
    const p = node.parentName;
    if (p && byName.has(p) && p !== node.name) {
      byName.get(p).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (arr) => {
    arr.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === PROFILE_KIND_MEMBER ? -1 : 1;
      if (a.name === INFO_CENTER_DEPT) return -1;
      if (b.name === INFO_CENTER_DEPT) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    arr.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

module.exports = {
  PROFILE_KIND_MEMBER,
  PROFILE_KIND_CONTACT,
  INFO_CENTER_DEPT,
  DEFAULT_MEMBER_DEPT_NAMES,
  defaultStaffDeptCatalog,
  normalizeProfileKind,
  isContactProfile,
  isBusinessMember,
  normalizeCatalogEntry,
  normalizeStaffDeptCatalog,
  catalogKindForDept,
  resolveProfileKindForUser,
  mergeDeptsIntoCatalog,
  upsertCatalogDept,
  mergeOrgTreeIntoCatalog,
  buildOrgForest,
};
