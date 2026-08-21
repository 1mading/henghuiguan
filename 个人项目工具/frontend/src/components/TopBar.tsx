export function TopBar({
  title,
  subtitle,
  onAddTask,
}: {
  title: string;
  subtitle: string;
  onAddTask?: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-[color:var(--glass-border)] bg-black/15 px-5 py-4 backdrop-blur">
      <div className="min-w-[180px]">
        <h1 className="display text-2xl font-semibold">{title}</h1>
        <p className="text-xs text-[color:var(--muted)]">{subtitle}</p>
      </div>

      <div className="mx-auto flex min-w-[220px] max-w-xl flex-1">
        <input
          placeholder="搜索任务 / 项目 / 文件"
          className="glass w-full rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--neon)]/40"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="glass rounded-full px-3 py-2 text-xs text-[color:var(--muted)]"
        >
          通知
        </button>
        <button
          type="button"
          onClick={onAddTask}
          className="neon-btn rounded-full px-4 py-2 text-sm font-semibold"
        >
          + 新增任务
        </button>
      </div>
    </header>
  );
}
