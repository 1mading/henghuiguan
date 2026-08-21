import type { Task } from "../lib/types";

const COLUMNS: { key: Task["status"]; title: string }[] = [
  { key: "todo", title: "待办规划" },
  { key: "in_progress", title: "推进执行" },
  { key: "done", title: "已完成" },
];

export function TaskBoard({
  tasks,
  onSelect,
  selectedId,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-3xl p-3">
      <div className="mb-3 flex items-center gap-2 px-1 text-xs">
        <span className="rounded-full bg-[color:var(--neon-dim)] px-3 py-1 text-[color:var(--neon)]">
          全部任务
        </span>
        <span className="rounded-full px-3 py-1 text-[color:var(--muted)]">我负责的</span>
        <span className="rounded-full px-3 py-1 text-[color:var(--muted)]">我参与的</span>
      </div>

      <div className="flex-1 space-y-3 overflow-auto scroll-thin pr-1">
        {COLUMNS.map((col) => {
          const list = tasks.filter((t) => t.status === col.key).slice(0, 4);
          return (
            <div key={col.key}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="display text-sm font-semibold">{col.title}</h3>
                <span className="text-[11px] text-[color:var(--muted)]">{list.length}</span>
              </div>
              <div className="space-y-1.5">
                {list.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onSelect(task.id)}
                    className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                      selectedId === task.id
                        ? "border-[color:var(--neon)] bg-[color:var(--neon-dim)]"
                    : "border-[color:var(--glass-border)] bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{task.title}</span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          task.is_overdue === 1
                            ? "bg-[color:var(--danger)]"
                            : "bg-[color:var(--neon)]"
                        }`}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-[color:var(--muted)]">
                      <span>{task.id.slice(0, 10)}</span>
                      <span>{task.due_at?.slice(0, 10) ?? "未设截止"}</span>
                    </div>
                  </button>
                ))}
                {list.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[color:var(--glass-border)] px-3 py-3 text-center text-xs text-[color:var(--muted)]">
                    暂无任务
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
