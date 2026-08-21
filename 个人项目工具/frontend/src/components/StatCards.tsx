export function StatCards({
  overdue,
  done,
  doing,
  todo,
}: {
  overdue: number;
  done: number;
  doing: number;
  todo: number;
}) {
  const items = [
    { label: "今日待办", value: todo, tip: "待启动", tone: "muted" as const },
    { label: "进行中", value: doing, tip: "推进中", tone: "muted" as const },
    { label: "已完成", value: done, tip: "累计完成", tone: "neon" as const },
    { label: "逾期任务", value: overdue, tip: "需立即处理", tone: "danger" as const },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="panel rounded-3xl px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-[color:var(--muted)]">
            <span>{item.label}</span>
            <span
              className={
                item.tone === "danger"
                  ? "text-[color:var(--danger)]"
                  : item.tone === "neon"
                    ? "neon-text"
                    : ""
              }
            >
              ●
            </span>
          </div>
          <div className="display mt-2 text-3xl font-semibold">{item.value}</div>
          <div className="mt-1 text-[11px] text-[color:var(--muted)]">{item.tip}</div>
        </div>
      ))}
    </div>
  );
}
