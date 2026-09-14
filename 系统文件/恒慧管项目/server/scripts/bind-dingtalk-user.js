/**
 * 运维：把人员档案与钉钉 userid 绑定（正式服登录失败时用）
 *
 * 用法：
 *   node scripts/bind-dingtalk-user.js --name "王元斌 Martin" --userid 669701617
 *   node scripts/bind-dingtalk-user.js --id U018 --userid 669701617
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const {
  reloadStoreFromDisk,
  getAllUsers,
  upsertUser,
  persistStore,
} = require('../src/db/database');
const { getAccessToken, isConfigured } = require('../src/services/dingtalk');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || '').trim() : '';
}

async function verifyUserId(userid) {
  if (!isConfigured()) return null;
  const token = await getAccessToken();
  const res = await fetch(
    `https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userid }),
    },
  );
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`钉钉校验 userid 失败: ${data.errmsg} (${data.errcode})`);
  }
  return data.result || null;
}

async function main() {
  const localId = arg('--id');
  const name = arg('--name');
  const userid = arg('--userid');
  if (!userid) {
    console.error('缺少 --userid');
    process.exit(1);
  }
  if (!localId && !name) {
    console.error('请指定 --id 或 --name');
    process.exit(1);
  }

  reloadStoreFromDisk();
  const users = getAllUsers();
  let target = localId ? users.find(u => u.id === localId) : null;
  if (!target && name) {
    target = users.find(u => u.name === name || u.name.startsWith(name.split(/\s+/)[0]));
  }
  if (!target) {
    console.error('未找到本地人员档案，请先导入用户或同步通讯录');
    process.exit(1);
  }

  const detail = await verifyUserId(userid);
  const next = {
    ...target,
    dingTalkUserId: userid,
    name: detail?.name || target.name,
    dingTalkUnionId: detail?.unionid || detail?.unionId || target.dingTalkUnionId || '',
    dingTalkMobile: detail?.mobile || target.dingTalkMobile || '',
    dingTalkEmail: detail?.email || target.dingTalkEmail || '',
    dingTalkActive: detail?.active !== false,
  };
  upsertUser(next);
  const ok = persistStore();
  console.log(JSON.stringify({
    ok,
    id: next.id,
    name: next.name,
    dingTalkUserId: next.dingTalkUserId,
    dingTalkName: detail?.name || null,
  }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
