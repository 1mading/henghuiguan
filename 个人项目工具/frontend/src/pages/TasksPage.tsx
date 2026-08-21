import { useState } from "react";
import type { Project, Task } from "../lib/types";

const statusLabel: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
};

export function TasksPage({
  projects,
  tasks,
  projectName,
  onCreate,
  onStatus,
}: {
  projects: Project[];
  tasks: Task[];
  projectName: (id: string | null | undefined) => string;
  onCreate: (projectId: string, title: string) => Promise<void>;
  onStatus: (id: string, status: Task["status"]) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs tracking-[0.22em] text-[color:var(--muted)]">CRUD</p>
        <h1 className="display mt-1 text-2xl font-semibold">任务读写</h1>
      </header>

      <form
        className="glass flex flex-wrap gap-2 rounded-3xl p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!projectId || !title.trim()) return;
          setBusy(true);
          void onCreate(projectId, title.trim())
            .then(() => setTitle(""))
            .finally(() => setBusy(false));
        }}
      >
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="新建任务标题"
          className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[color:var(--neon)]/50"
        />
        <button
          type="submit"
          disabled={busy || !projectId}
          className="neon-btn rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          写入 SQLite
        </button>
      </form>

      <div className="glass overflow-hidden rounded-3xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-[color:var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">任务</th>
              <th className="px-4 py-3 font-medium">项目</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3 font-medium">{t.title}</td>
                <td className="px-4 py-3 text-[color:var(--muted)]">
                  {projectName(t.project_id)}
                </td>
                <td className="px-4 py-3">{statusLabel[t.status]}</td>
                <td className="px-4 py-3">
                  <select
                    value={t.status}
                    onChange={(e) =>
                      void onStatus(t.id, e.target.value as Task["status"])
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs"
                  >
                    <option value="todo">待办</option>
                    <option value="in_progress">进行中</option>
                    <option value="done">已完成</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
