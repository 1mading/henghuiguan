#!/usr/bin/env node
/**
 * 提交前敏感信息检查 — 阻止将密钥、.env、业务数据库等推送到 GitHub
 * 用法: node scripts/check-secrets.js [--staged]
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STAGED = process.argv.includes('--staged');

/** 无论内容如何，禁止进入 Git 的路径（相对仓库根目录，统一用 /） */
const BLOCKED_PATHS = [
  /^server\/\.env$/,
  /^server\/\.env\./,
  /^\.env$/,
  /^server\/miniapp\/config\.js$/,
  /^server\/data\//,
  /^server\/src\/db\/seed-data\.json$/,
  /^server\/src\/db\/seed-data\.local\.json$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
];

/** 允许提交的 env 模板 */
const ALLOWED_ENV_TEMPLATES = [
  /^server\/\.env\.example$/,
];

/** 文件内容中的敏感模式 */
const CONTENT_PATTERNS = [
  { name: '钉钉 AppSecret', re: /DINGTALK_APP_SECRET\s*=\s*[^\s#][^\r\n]{8,}/i },
  { name: 'JWT 密钥', re: /JWT_SECRET\s*=\s*(?!henghuiguan-dev-secret-change-me\s*$|^\s*$)[^\s#][^\r\n]{16,}/im },
  { name: 'API 密钥', re: /API_KEY\s*=\s*[^\s#][^\r\n]{8,}/i },
  { name: '钉钉 CorpId（真实值）', re: /DINGTALK_CORP_ID\s*=\s*ding[a-z0-9]{20,}/i },
  { name: '硬编码 AppSecret', re: /appSecret\s*[:=]\s*['"][^'"]{12,}['"]/i },
];

/** 业务数据库文件名 */
const BLOCKED_FILENAMES = [
  'henghuiguan.json',
];

function normalize(p) {
  return p.replace(/\\/g, '/');
}

function getFilesToCheck() {
  if (STAGED) {
    try {
      const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
        cwd: ROOT,
        encoding: 'utf8',
      });
      return out.split('\n').map(s => normalize(s.trim())).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function isBlockedPath(file) {
  if (ALLOWED_ENV_TEMPLATES.some(re => re.test(file))) return false;
  if (BLOCKED_PATHS.some(re => re.test(file))) return true;
  if (BLOCKED_FILENAMES.some(name => file.endsWith('/' + name) || file === name)) return true;
  return false;
}

function readStagedContent(file) {
  try {
    return execSync(`git show :${file}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    const abs = path.join(ROOT, file);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, 'utf8');
    return '';
  }
}

function isBinaryHint(content) {
  return content.includes('\0');
}

function countRealDingTalkUserIds(content) {
  const matches = content.match(/dingTalkUserId\s*:\s*['"][0-9]{9,}['"]/g);
  return matches ? matches.length : 0;
}

function checkFile(file) {
  const errors = [];
  const warnings = [];

  if (isBlockedPath(file)) {
    errors.push(`禁止提交路径: ${file}`);
    return { errors, warnings };
  }

  if (ALLOWED_ENV_TEMPLATES.some(re => re.test(file))) {
    return { errors, warnings };
  }

  let content = '';
  try {
    content = readStagedContent(file);
  } catch {
    return { errors, warnings };
  }

  if (!content || isBinaryHint(content)) return { errors, warnings };

  for (const { name, re } of CONTENT_PATTERNS) {
    if (re.test(content)) {
      errors.push(`${file}: 检测到 ${name}`);
    }
  }

  if (/\.(json|html|js|md|env|example|bat|txt)$/i.test(file)) {
    const idCount = countRealDingTalkUserIds(content);
    if (idCount >= 5 && !file.includes('.example.')) {
      errors.push(
        `${file}: 含 ${idCount} 个真实钉钉 userid，业务人员数据不应上传 GitHub（请改用演示数据或确保文件已被 .gitignore）`
      );
    }
  }

  return { errors, warnings };
}

function main() {
  const files = getFilesToCheck();
  if (!files.length) {
    console.log('[check-secrets] 无暂存文件，跳过');
    process.exit(0);
  }

  const allErrors = [];
  const allWarnings = [];

  for (const file of files) {
    const { errors, warnings } = checkFile(file);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  if (allWarnings.length) {
    allWarnings.forEach(w => console.warn('[check-secrets] 警告:', w));
  }

  if (allErrors.length) {
    console.error('\n[check-secrets] 提交被阻止 — 发现敏感内容:\n');
    allErrors.forEach(e => console.error('  ✗', e));
    console.error('\n请检查 .gitignore，并从 Git 追踪中移除敏感文件:');
    console.error('  git rm --cached <文件路径>');
    console.error('\n允许提交的仅为模板/示例: server/.env.example、server/miniapp/config.js.example、seed-data.example.json\n');
    process.exit(1);
  }

  console.log('[check-secrets] 通过', files.length, '个暂存文件');
  process.exit(0);
}

main();
