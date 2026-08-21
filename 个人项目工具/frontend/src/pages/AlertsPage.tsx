import type { Alert } from "../lib/types";

export function AlertsPage({
  alerts,
  projectName,
  onResolve,
}: {
  alerts: Alert[];
  projectName: (id: string | null | undefined) => string;
  onResolve: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs tracking-[0.22em] text-[color:var(--muted)]">INSIGHTS</p>
        <h1 className="display mt-1 text-3xl font-semibold">智能分析</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          读取 Hermes 写入的 `alerts`（未解决）
        </p>
      </header>

      {alerts.length === 0 ? (
        <div className="glass rounded-3xl p-6 text-sm text-[color:var(--muted)]">
          暂无未解决预警
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <article key={a.id} className="glass rounded-3xl p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[color:var(--danger)]/20 px-2 py-0.5 text-[color:var(--danger)]">
                  {a.alert_type}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[color:var(--muted)]">
                  {a.severity}
                </span>
                <span className="text-[color:var(--muted)]">source: {a.source}</span>
                {a.project_id && (
                  <span className="text-[color:var(--muted)]">
                    {projectName(a.project_id)}
                  </span>
                )}
              </div>
              <h3 className="display mt-2 text-lg font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{a.message}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-[color:var(--muted)]">{a.created_at}</p>
                <button
                  type="button"
                  onClick={() => void onResolve(a.id)}
                  className="rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                >
                  标记已解决
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
