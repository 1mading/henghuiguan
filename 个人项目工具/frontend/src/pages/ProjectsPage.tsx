import { useState } from "react";
import type { Project } from "../lib/types";

export function ProjectsPage({
  projects,
  onCreate,
}: {
  projects: Project[];
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs tracking-[0.22em] text-[color:var(--muted)]">PROJECTS</p>
        <h1 className="display mt-1 text-3xl font-semibold">项目总览</h1>
      </header>

      <form
        className="glass flex flex-wrap gap-2 rounded-3xl p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          void onCreate(name.trim())
            .then(() => setName(""))
            .finally(() => setBusy(false));
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新建项目名称"
          className="min-w-[220px] flex-1 rounded-2xl border border-[color:var(--glass-border)] bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-[color:var(--neon)]/50"
        />
        <button
          type="submit"
          disabled={busy}
          className="neon-btn rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          写入 SQLite
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <article key={p.id} className="glass rounded-3xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }}
              />
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--muted)]">
                {p.status}
              </span>
            </div>
            <h2 className="display text-xl font-semibold">{p.name}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-[color:var(--muted)]">
              {p.description}
            </p>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-[11px] text-[color:var(--muted)]">
                <span>进度</span>
                <span className="neon-text">{p.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[color:var(--neon)]"
                  style={{
                    width: `${p.progress}%`,
                    boxShadow: "0 0 12px rgba(57,255,20,0.45)",
                  }}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
