import type { Task } from "../lib/types";

export function SmartDetail({
  task,
  projectName,
  onComplete,
}: {
  task: Task | null;
  projectName: string;
  onComplete: () => void;
}) {
  if (!task) {
    return (
      <aside className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-3xl p-5">
        <p className="text-xs tracking-[0.2em] text-[color:var(--muted)]">智能详情</p>
        <h2 className="display mt-2 text-xl font-semibold">暂无选中任务</h2>
        <p className="mt-2 text-sm text-[color:var(--muted)]">从左侧任务列表选择一项查看。</p>
      </aside>
    );
  }

  return (
    <aside className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-3xl p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs tracking-[0.2em] text-[color:var(--muted)]">智能详情</p>
          <h2 className="display mt-2 text-xl font-semibold leading-snug">{task.title}</h2>
        </div>
        <span className="rounded-full border border-[color:var(--glass-border)] bg-white/5 px-2 py-1 text-[10px] text-[color:var(--muted)]">
          {task.id.slice(0, 10)}
        </span>
      </div>

      <p className="mt-3 shrink-0 text-sm text-[color:var(--muted)]">
        {task.description || "本地私有任务详情，支持与 Hermes 预警/进度字段联动。"}
      </p>

      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto scroll-thin text-sm">
        <Row label="所属项目" value={projectName} />
        <Row
          label="优先级"
          value={task.priority >= 4 ? "高" : task.priority >= 2 ? "中" : "低"}
          danger={task.priority >= 4 || task.is_overdue === 1}
        />
        <Row label="状态" value={statusText(task.status)} neon={task.status === "in_progress"} />
        <Row label="截止" value={task.due_at?.slice(0, 16).replace("T", " ") ?? "—"} />

        <div className="rounded-2xl border border-[color:var(--glass-border)] bg-[color:var(--neon-dim)] p-3">
          <p className="text-xs text-[color:var(--neon)]">AI 助手建议</p>
          <ul className="mt-2 space-y-1.5 text-xs text-[color:var(--muted)]">
            <li>· 建议优先处理逾期项，再推进当前任务。</li>
            <li>· 可将相关文档归档到项目文件，便于复盘。</li>
            <li>· 完成后刷新页面可同步 Hermes 进度计算。</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border border-[color:var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[color:var(--muted)] hover:bg-white/10"
        >
          编辑任务
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="neon-btn rounded-xl px-4 py-2 text-sm font-semibold"
        >
          完成任务
        </button>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  danger,
  neon,
}: {
  label: string;
  value: string;
  danger?: boolean;
  neon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--glass-border)] bg-white/5 px-3 py-2">
      <span className="text-[color:var(--muted)]">{label}</span>
      <span
        className={`font-medium ${
          danger ? "text-[color:var(--danger)]" : neon ? "neon-text" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function statusText(status: Task["status"]): string {
  switch (status) {
    case "todo":
      return "待办";
    case "in_progress":
      return "进行中";
    case "done":
      return "已完成";
    case "cancelled":
      return "已取消";
  }
}
