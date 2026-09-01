/**
 * 探测钉钉 AI 表格可读性（不写库）
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getAccessToken, resolveWikiNodeByUrl, resolveOperatorUnionId } = require('../src/services/dingtalk');
const { getAllUsers } = require('../src/db/database');

const DOC_URL = process.argv[2] || 'https://alidocs.dingtalk.com/i/nodes/mExel2BLV54MBY6YiPqoA41aWgk9rpMq?utm_scene=person_space&iframeQuery=viewId%3DFetukxi%26sheetId%3DpPwUpdV';
const NODE_ID = 'mExel2BLV54MBY6YiPqoA41aWgk9rpMq';
const SHEETS = ['项目任务跟踪（八月）', '项目任务跟踪（9月）', '项目任务跟踪（九月）'];

async function apiGet(apiPath, query = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(query).toString();
  const url = `https://api.dingtalk.com${apiPath}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: { 'x-acs-dingtalk-access-token': token },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { status: res.status, data };
}

async function apiPost(apiPath, query = {}, body = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(query).toString();
  const url = `https://api.dingtalk.com${apiPath}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': token,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { status: res.status, data };
}

function pickOperatorUnionId() {
  const users = getAllUsers();
  const hit = users.find(u => u.dingTalkUnionId && u.dept === '实施交付部')
    || users.find(u => u.dingTalkUnionId && (u.role === 'admin' || u.role === 'gm'))
    || users.find(u => u.dingTalkUnionId);
  return hit?.dingTalkUnionId || '';
}

async function main() {
  const users = getAllUsers();
  const opUser = users.find(u => u.dingTalkUnionId && u.dept === '实施交付部')
    || users.find(u => u.dingTalkUnionId);
  const operatorId = opUser ? await resolveOperatorUnionId(opUser) : pickOperatorUnionId();
  console.log('operatorId:', operatorId ? `${operatorId.slice(0, 8)}...` : '(empty)');

  const byUrl = await apiPost('/v2.0/wiki/nodes/queryByUrl', { operatorId }, {
    url: DOC_URL,
    option: { withStatisticalInfo: false, withPermissionRole: true },
  });
  console.log('\n[queryByUrl]', byUrl.status, JSON.stringify(byUrl.data, null, 2).slice(0, 2000));

  const node = byUrl.data?.node || {};
  const baseCandidates = [node.nodeId, NODE_ID, node.dentryUuid, node.uuid].filter(Boolean);

  for (const baseId of [...new Set(baseCandidates)]) {
    const sheets = await apiGet(`/v1.0/notable/bases/${encodeURIComponent(baseId)}/sheets`, { operatorId });
    console.log(`\n[getAllSheets base=${baseId}]`, sheets.status, JSON.stringify(sheets.data, null, 2).slice(0, 1500));
    if (sheets.status !== 200) continue;

    const sheetList = sheets.data?.value || sheets.data?.sheets || sheets.data?.data || [];
    for (const target of SHEETS) {
      const list = await apiPost(
        `/v1.0/notable/bases/${encodeURIComponent(baseId)}/sheets/${encodeURIComponent(target)}/records/list`,
        { operatorId },
        { maxResults: 5 },
      );
      console.log(`\n[listRecords ${target}]`, list.status, JSON.stringify(list.data, null, 2).slice(0, 2000));
    }
  }
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
