import type { Task } from "../lib/types";

export function MiniTimeline({ tasks }: { tasks: Task[] }) {
  const rows = tasks.slice(0, 5);
  const start = new Date("2026-07-10").getTime();
  const end = new Date("2026-08-10").getTime();
  const span = end - start;

  return (
    <section className="panel rounded-3xl p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-xs tracking-[0.18em] text-[color:var(--muted)]">TIMELINE</p>
          <h3 className="display text-lg font-semibold">项目时间线</h3>
        </div>
        <span className="text-[11px] text-[color:var(--muted)]">2026-07 → 08</span>
      </div>

      <div className="mb-2 grid grid-cols-[140px_1fr] gap-3 text-[10px] text-[color:var(--muted)]">
        <div />
        <div className="flex justify-between px-1">
          <span>07/10</span>
          <span>07/20</span>
          <span>07/30</span>
          <span>08/10</span>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((task) => {
          const s = task.start_at ? new Date(task.start_at).getTime() : start;
          const e = task.due_at ? new Date(task.due_at).getTime() : s + 3 * 86400000;
          const left = Math.max(0, Math.min(92, ((s - start) / span) * 100));
          const width = Math.max(8, Math.min(100 - left, ((e - s) / span) * 100));
          return (
            <div key={task.id} className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="truncate text-xs">{task.title}</div>
              <div className="relative h-7 rounded-full bg-white/10">
                <div
                  className={`absolute top-1.5 h-4 rounded-full ${
                    task.is_overdue === 1
                      ? "bg-[color:var(--danger)]"
                      : "bg-[color:var(--neon)]"
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
