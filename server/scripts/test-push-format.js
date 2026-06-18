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
  section(title) {
    return `\n▎${title}`;
  },
  line(label, value) {
    return `  ${label}：${value != null && value !== '' ? value : '未设置'}`;
  },
  projectBlock(d) {
    if (!d.projectName || d.projectName === '临时任务') {
      return [
        this.section('任务类型'),
        this.line('类型', '临时任务（无关联项目）'),
      ].join('\n');
    }
    const lines = [this.section('所属项目'), this.line('名称', d.projectName)];
    if (d.projectManager) lines.push(this.line('负责人', d.projectManager));
    if (d.projectDept) lines.push(this.line('部门', d.projectDept));
    return lines.join('\n');
  },
  taskBlock(d, opts = {}) {
    const lines = [this.section(opts.title || '任务详情')];
    lines.push(this.line('名称', d.taskTitle));
    if (d.taskId) lines.push(this.line('编号', d.taskId));
    if (opts.showSchedule !== false) {
      if (d.planStartDate) lines.push(this.line('开始', d.planStartDate));
      if (d.dueDate) lines.push(this.line('截止', d.dueDate));
    }
    if (d.assignee) lines.push(this.line('执行人', d.assignee));
    if (opts.extraLines) opts.extraLines.forEach(l => lines.push(l));
    return lines.join('\n');
  },
  actionBlock(label, operator, extraLines = []) {
    const lines = [this.section(label || '操作信息')];
    if (operator) lines.push(this.line('操作人', operator));
    extraLines.forEach(l => lines.push(l));
    return lines.join('\n');
  },
  compose(parts) {
    return parts.filter(Boolean).join('\n').trim();
  },
};

const PushTemplates = {
  [PushEventType.TASK_ASSIGNED]: (d) => ({
    title: '【恒慧管·新任务】',
    content: PushFormat.compose([
      '您有新的任务待处理：',
      PushFormat.projectBlock(d),
      PushFormat.taskBlock(d),
      PushFormat.actionBlock('分配信息', d.operator),
    ]),
  }),
  [PushEventType.TASK_TRANSFER]: (d) => ({
    title: '【恒慧管·任务转办】',
    content: PushFormat.compose([
      '以下任务已转办给您：',
      PushFormat.projectBlock(d),
      PushFormat.taskBlock(d, { showSchedule: false }),
      PushFormat.actionBlock('转办信息', d.operator, [
        PushFormat.line('原因', d.reason),
      ]),
    ]),
  }),
  [PushEventType.TASK_REJECTED]: (d) => ({
    title: '【恒慧管·任务驳回】',
    content: PushFormat.compose([
      '以下任务已被驳回，请尽快整改：',
      PushFormat.projectBlock(d),
      PushFormat.taskBlock(d, { showSchedule: false }),
      PushFormat.actionBlock('驳回信息', d.operator, [
        PushFormat.line('原因', d.reason),
      ]),
    ]),
  }),
  [PushEventType.TASK_DUE_SOON]: (d) => ({
    title: '【恒慧管·即将到期】',
    content: PushFormat.compose([
      '任务即将到期，请及时处理：',
      PushFormat.projectBlock(d),
      PushFormat.taskBlock(d, {
        extraLines: [PushFormat.line('提醒', `将于 ${d.dueDate} 到期`)],
      }),
    ]),
  }),
  [PushEventType.TASK_OVERDUE]: (d) => ({
    title: '【恒慧管·任务逾期】',
    content: PushFormat.compose([
      '任务已逾期，请立即处理：',
      PushFormat.projectBlock(d),
      PushFormat.taskBlock(d, {
        extraLines: [PushFormat.line('逾期', `已延期 ${d.daysOverdue} 天`)],
      }),
    ]),
  }),
  [PushEventType.TASK_COMPLETED]: (d) => ({
    title: '【恒慧管·任务完成】',
    content: PushFormat.compose([
      '以下任务已完成：',
      PushFormat.projectBlock(d),
      PushFormat.taskBlock(d, { showSchedule: false }),
      PushFormat.actionBlock('完成信息', d.assignee, [
        PushFormat.line('状态', '已完成'),
      ]),
    ]),
  }),
  [PushEventType.DEPT_DAILY_SUMMARY]: (d) => ({
    title: '【恒慧管·部门日报】',
    content: PushFormat.compose([
      PushFormat.section('今日概况'),
      PushFormat.line('进行中', `${d.doing} 项`),
      PushFormat.line('待开始', `${d.todo} 项`),
      PushFormat.line('已逾期', `${d.overdue} 项`),
      PushFormat.line('今日到期', `${d.dueToday} 项`),
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
  const task = tasks.find(t => t.projectId && t.type !== 'temp')
    || tasks.find(t => t.projectId)
    || tasks[0];
  if (!task) throw new Error('系统中无可用任务，无法构造预览内容');

  const project = task.projectId
    ? projects.find(p => p.id === task.projectId)
    : null;

  const base = buildTaskPayload(task, project, { operator: '样式预览' });

  return {
    [PushEventType.TASK_ASSIGNED]: base,
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
