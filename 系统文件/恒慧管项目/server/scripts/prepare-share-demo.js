/**
 * 生成分享演示库（独立文件，不碰正式 henghuiguan.json）
 *
 * 可选从正式库仅同步演示主讲人的 dingTalkUserId（不改部门/角色，保持演示组织架构）。
 * 换电脑无正式库时：保留种子中的 demo_* userid，用「本地预演」进入即可。
 *
 * Usage: node scripts/prepare-share-demo.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const seedPath = path.join(root, 'src/db/seed-data.share-demo.json');
const outPath = path.join(root, 'data/henghuiguan-share-demo.json');
const livePath = path.join(root, 'data/henghuiguan.json');

const PRESENTER_NAME = (process.env.SHARE_DEMO_PRESENTER_NAME || '王元斌 Martin').trim();

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function patchPresenterDingTalkId(seed) {
  const target = seed.users.find(u => u.name === PRESENTER_NAME);
  if (!target) {
    console.warn(`[share-demo] 种子中未找到演示账号「${PRESENTER_NAME}」`);
    return seed;
  }

  const fromEnv = (process.env.SHARE_DEMO_PRESENTER_DING_ID || '').trim();
  if (fromEnv) {
    target.dingTalkUserId = fromEnv;
    console.log(`[share-demo] 使用环境变量钉钉 userid → ${PRESENTER_NAME}`);
    return seed;
  }

  if (fs.existsSync(livePath)) {
    try {
      const live = loadJson(livePath);
      const liveUser = (live.users || []).find(u =>
        u.name === PRESENTER_NAME
        || (u.name && PRESENTER_NAME.startsWith(String(u.name).split(/\s+/)[0]))
        || (u.name && String(u.name).startsWith(PRESENTER_NAME.split(/\s+/)[0]))
      );
      if (liveUser?.dingTalkUserId && !String(liveUser.dingTalkUserId).startsWith('demo_')) {
        // 仅同步钉钉 userid，保留种子里的部门（信息中心 / 财务中心）
        target.dingTalkUserId = liveUser.dingTalkUserId;
        console.log(`[share-demo] 已从正式库同步钉钉 userid → ${PRESENTER_NAME}（部门保持演示种子）`);
        return seed;
      }
    } catch (e) {
      console.warn('[share-demo] 读取正式库失败，保留种子中的演示 userid:', e.message);
    }
  }

  console.log(
    `[share-demo] 使用种子演示 userid（换电脑可直接「本地预演」；真实钉钉免登请设 SHARE_DEMO_PRESENTER_DING_ID）`
  );
  return seed;
}

function main() {
  if (!fs.existsSync(seedPath)) {
    console.error('[share-demo] 缺少种子文件:', seedPath);
    process.exit(1);
  }

  const seed = patchPresenterDingTalkId(loadJson(seedPath));
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outPath, JSON.stringify(seed, null, 2), 'utf8');
  console.log('[share-demo] 已写入演示库:', outPath);
  console.log('[share-demo] 统计:', {
    users: seed.users.length,
    projects: seed.projects.length,
    tasks: seed.tasks.length,
    intakeTasks: seed.tasks.filter(t => t.intakeMeta?.source === 'aitable').length,
    infoCenter: seed.users.filter(u => u.dept === '信息中心').length,
    financeCenter: seed.users.filter(u => u.dept === '财务中心').length,
  });
}

if (require.main === module) {
  main();
}

module.exports = { main };
