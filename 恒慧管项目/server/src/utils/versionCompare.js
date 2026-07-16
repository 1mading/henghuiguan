/** 比较语义化版本号，返回 1 / -1 / 0 */
function compareVersion(a, b) {
  const pa = String(a || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function sortUpdatesByVersion(list) {
  return [...(list || [])].sort((a, b) => compareVersion(a.version, b.version));
}

function getLatestVersion(updates) {
  if (!updates?.length) return null;
  return sortUpdatesByVersion(updates)[updates.length - 1].version;
}

module.exports = {
  compareVersion,
  sortUpdatesByVersion,
  getLatestVersion,
};
