import type { DaemonStateRow, JobRun } from "../lib/types";

export function SettingsPage({
  daemonState,
  jobRuns,
  dbPath,
}: {
  daemonState: DaemonStateRow[];
  jobRuns: JobRun[];
  dbPath?: string;
}) {
  const map = Object.fromEntries(daemonState.map((r) => [r.key, r.value]));

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs tracking-[0.22em] text-[color:var(--muted)]">SETTINGS</p>
        <h1 className="display mt-1 text-2xl font-semibold">设置与运维</h1>
        {dbPath && (
          <p className="mt-1 truncate text-xs text-[color:var(--muted)]">{dbPath}</p>
        )}
      </header>

      <section className="glass rounded-3xl p-5">
        <h2 className="display text-lg font-semibold">Hermes 服务状态</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[color:var(--muted)]">版本</dt>
            <dd className="mt-1 font-medium neon-text">{map.daemon_version ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--muted)]">上次启动</dt>
            <dd className="mt-1 font-medium">{map.last_boot_at ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--muted)]">最近心跳</dt>
            <dd className="mt-1 font-medium">{map.last_heartbeat_at ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="glass overflow-hidden rounded-3xl">
        <div className="border-b border-white/10 px-4 py-3 text-lg font-semibold display">
          job_runs
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-[color:var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">任务</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">开始</th>
            </tr>
          </thead>
          <tbody>
            {jobRuns.map((j) => (
              <tr key={j.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">{j.job_name}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      j.status === "failed"
                        ? "text-[color:var(--danger)]"
                        : "neon-text"
                    }
                  >
                    {j.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[color:var(--muted)]">{j.started_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
