#!/usr/bin/env node
/**
 * 推送样式预览 — 直接调用钉钉 API，不写入 pushLogs / 不修改业务数据
 *
 * 用法:
 *   node scripts/test-push-format.js              # 全部类型 → 王元斌
 *   node scripts/test-push-format.js task_assigned  # 仅一种
 *   node scripts/test-push-format.js all U018       # 指定接收人
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { getAllTasks, getAllProjects, getAllUsers } = require('../src/db/database');
const { sendWorkNotification } = require('../src/services/dingtalk');

const PushEventType = {
  TASK_ASSIGNED: 'task_assigned',
  TASK_TRANSFER: 'task_transfer',
  TASK_REJECTED: 'task_rejected',
  TASK_DUE_SOON: 'task_due_soon',
  TASK_OVERDUE: 'task_overdue',
  TASK_COMPLETED: 'task_completed',
  DEPT_DAILY_SUMMARY: 'dept_daily_summary',
};

const ALL_TYPES = Object.values(PushEventType);

const PushFormat = {
  itemsOf(d) {
    return Array.isArray(d.items) && d.items.length ? d.items : [d];
  },
  taskLine(d) {
    const id = d.taskId ? `[${d.taskId}] ` : '';
    const title = d.taskTitle || '未命名任务';
    const bits = [];
    if (d.dueDate) bits.push(`截止 ${d.dueDate}`);
    if (d.daysOverdue != null && d.daysOverdue !== '') bits.push(`已逾期 ${d.daysOverdue} 天`);
    if (d.projectName && d.projectName !== '临时任务') bits.push(d.projectName);
    const suffix = bits.length ? `（${bits.join(' · ')}）` : '';
    return `${id}${title}${suffix}`;
  },
  numbered(items, lineFn) {
    return items.map((it, i) => `${i + 1}. ${lineFn(it)}`).join('\n');
  },
  listOrOne(items, lineFn) {
    if (items.length === 1) return lineFn(items[0]);
    return this.numbered(items, lineFn);
  },
  withNote(line, note, label = '原因') {
    if (!note) return line;
    if (!label) return `${line}｜${note}`;
    return `${line}｜${label}：${note}`;
  },
  compose(parts) {
    return parts.filter(Boolean).join('\n').trim();
  },
};

const PushTemplates = {
  [PushEventType.TASK_ASSIGNED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·新任务】',
      content: PushFormat.compose([
        n === 1 ? '您有新任务待处理：' : `您有 ${n} 条新任务待处理：`,
        PushFormat.listOrOne(items, it => PushFormat.taskLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_TRANSFER]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务转办】',
      content: PushFormat.compose([
        n === 1 ? '以下任务已转办给您：' : `以下 ${n} 条任务已转办给您：`,
        PushFormat.listOrOne(items, it => PushFormat.withNote(PushFormat.taskLine(it), it.reason)),
      ]),
    };
  },
  [PushEventType.TASK_REJECTED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务驳回】',
      content: PushFormat.compose([
        n === 1 ? '任务已被驳回，请尽快整改：' : `以下 ${n} 条任务已被驳回，请尽快整改：`,
        PushFormat.listOrOne(items, it => PushFormat.withNote(PushFormat.taskLine(it), it.reason)),
      ]),
    };
  },
  [PushEventType.TASK_DUE_SOON]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·即将到期】',
      content: PushFormat.compose([
        n === 1 ? '任务即将到期，请及时处理：' : `以下 ${n} 条任务即将到期：`,
        PushFormat.listOrOne(items, it => PushFormat.taskLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_OVERDUE]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务逾期】',
      content: PushFormat.compose([
        n === 1 ? '任务已逾期，请立即处理：' : `以下 ${n} 条任务已逾期：`,
        PushFormat.listOrOne(items, it => PushFormat.taskLine(it)),
      ]),
    };
  },
  [PushEventType.TASK_COMPLETED]: (d) => {
    const items = PushFormat.itemsOf(d);
    const n = items.length;
    return {
      title: '【恒慧管·任务完成】',
      content: PushFormat.compose([
        n === 1 ? '任务已完成：' : `以下 ${n} 条任务已完成：`,
        PushFormat.listOrOne(items, it => {
          const who = it.assignee ? `｜${it.assignee}` : '';
          return PushFormat.taskLine(it) + who;
        }),
      ]),
    };
  },
  [PushEventType.DEPT_DAILY_SUMMARY]: (d) => ({
    title: '【恒慧管·部门日报】',
    content: PushFormat.compose([
      `进行中 ${d.doing} · 待开始 ${d.todo} · 已逾期 ${d.overdue} · 今日到期 ${d.dueToday}`,
    ]),
  }),
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function resolveTaskDueDate(task) {
  if (task.dueDate) return task.dueDate;
  return task.planStartDate || '';
}

function buildTaskPayload(task, project, extra = {}) {
  return {
    taskId: task.id,
    taskTitle: task.title,
    projectId: task.projectId || '',
    projectName: project ? project.name : '临时任务',
    projectManager: project?.manager || '',
    projectDept: project?.dept || '',
    assignee: task.assignee,
    planStartDate: task.planStartDate || '',
    dueDate: resolveTaskDueDate(task),
    ...extra,
  };
}

function buildDeptSummary(recipient, tasks, projects) {
  const today = new Date().toISOString().slice(0, 10);
  const deptProjectIds = new Set(
    projects.filter(p => p.dept === recipient.dept && !p.archived).map(p => p.id),
  );
  const deptTasks = tasks.filter(t => {
    if (t.status === 'done' || t.status === 'archived' || t.status === 'abolished') return false;
    if (!t.projectId) return recipient.dept === '信息中心';
    return deptProjectIds.has(t.projectId);
  });
  return {
    doing: deptTasks.filter(t => t.status === 'doing').length,
    todo: deptTasks.filter(t => t.status === 'todo').length,
    overdue: deptTasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done').length,
    dueToday: deptTasks.filter(t => t.dueDate === today).length,
  };
}

function buildPayloads(tasks, projects, recipient) {
  const withProject = tasks.filter(t => t.projectId);
  const task = withProject.find(t => t.type !== 'temp') || withProject[0] || tasks[0];
  if (!task) throw new Error('系统中无可用任务，无法构造预览内容');

  const project = task.projectId
    ? projects.find(p => p.id === task.projectId)
    : null;

  const base = buildTaskPayload(task, project, { operator: '样式预览' });

  // 汇总样式预览：同类型多条编号列表
  const extraTasks = withProject.filter(t => t.id !== task.id).slice(0, 2);
  const assignedItems = [
    base,
    ...extraTasks.map(t => buildTaskPayload(
      t,
      projects.find(p => p.id === t.projectId),
      { operator: '样式预览' }
    )),
  ];

  return {
    [PushEventType.TASK_ASSIGNED]: assignedItems.length > 1
      ? { ...base, items: assignedItems }
      : base,
    [PushEventType.TASK_TRANSFER]: {
      ...base,
      reason: '样式预览：转办原因示例',
    },
    [PushEventType.TASK_REJECTED]: {
      ...base,
      reason: '样式预览：驳回原因示例',
    },
    [PushEventType.TASK_DUE_SOON]: base,
    [PushEventType.TASK_OVERDUE]: { ...base, daysOverdue: 3 },
    [PushEventType.TASK_COMPLETED]: base,
    [PushEventType.DEPT_DAILY_SUMMARY]: buildDeptSummary(recipient, tasks, projects),
  };
}

async function main() {
  const arg1 = (process.argv[2] || 'all').toLowerCase();
  const recipientId = process.argv[3] || 'U018';

  const types = arg1 === 'all' ? ALL_TYPES : [arg1];
  for (const t of types) {
    if (!PushTemplates[t]) {
      console.error('未知类型:', t);
      console.error('可选:', ALL_TYPES.join(', '));
      process.exit(1);
    }
  }

  const tasks = getAllTasks();
  const projects = getAllProjects();
  const users = getAllUsers();
  const recipient = users.find(u => u.id === recipientId);
  if (!recipient?.dingTalkUserId) {
    console.error('接收人未绑定钉钉 userid:', recipientId);
    process.exit(1);
  }

  const payloads = buildPayloads(tasks, projects, recipient);
  console.log(`样式预览推送 → ${recipient.name}（${recipient.dingTalkUserId}）`);
  console.log('说明：只读现有数据 + 直发钉钉，不写入 pushLogs\n');

  const results = [];
  for (let i = 0; i < types.length; i++) {
    const eventType = types[i];
    const message = PushTemplates[eventType](payloads[eventType]);
    console.log(`[${i + 1}/${types.length}] ${eventType}`);
    console.log(`${message.title}`);
    console.log(message.content);
    console.log('---');

    try {
      const result = await sendWorkNotification({
        dingTalkUserIds: [recipient.dingTalkUserId],
        title: message.title,
        content: message.content,
      });
      results.push({ eventType, success: true, taskId: result.taskId || null });
      console.log('✓ 已发送', result.taskId ? `(钉钉 taskId: ${result.taskId})` : '');
    } catch (e) {
      results.push({ eventType, success: false, error: e.message });
      console.error('✗ 失败:', e.message);
    }

    if (i < types.length - 1) await sleep(1500);
  }

  console.log('\n========== 汇总 ==========');
  results.forEach(r => {
    console.log(`${r.success ? '✓' : '✗'} ${r.eventType}${r.taskId ? ' → ' + r.taskId : ''}${r.error ? ' — ' + r.error : ''}`);
  });
}

main().catch(e => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
