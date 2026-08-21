import { useCallback, useEffect, useState } from "react";
import { SideNav } from "./components/SideNav";
import { TopBar } from "./components/TopBar";
import {
  createProject,
  createTask,
  dbHealth,
  listAlerts,
  listDaemonState,
  listJobRuns,
  listProjects,
  listTasks,
  resolveAlert,
  updateTaskStatus,
} from "./lib/db";
import type { Alert, DaemonStateRow, JobRun, Project, Task } from "./lib/types";
import type { PageId } from "./nav";
import { AlertsPage } from "./pages/AlertsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";

interface DbBundle {
  projects: Project[];
  tasks: Task[];
  alerts: Alert[];
  daemonState: DaemonStateRow[];
  jobRuns: JobRun[];
  health: { ok: boolean; dbPath: string; projects: number };
}

const PAGE_META: Record<PageId, { title: string; subtitle: string }> = {
  tasks: {
    title: "任务管理",
    subtitle: "高效规划 · 智能协同 · 结果导向",
  },
  projects: {
    title: "项目总览",
    subtitle: "本地多项目进度与状态",
  },
  archive: {
    title: "文件归档",
    subtitle: "后续接入 project_files",
  },
  schedule: {
    title: "日程管理",
    subtitle: "后续接入 calendar_events",
  },
  alerts: {
    title: "智能分析",
    subtitle: "读取 Hermes alerts / job_runs",
  },
  settings: {
    title: "设置",
    subtitle: "服务状态与运行日志",
  },
};

export default function App() {
  const [page, setPage] = useState<PageId>("tasks");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DbBundle | null>(null);
  const [createTaskSignal, setCreateTaskSignal] = useState(0);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [health, projects, tasks, alerts, daemonState, jobRuns] =
        await Promise.all([
          dbHealth(),
          listProjects(),
          listTasks(),
          listAlerts(),
          listDaemonState(),
          listJobRuns(),
        ]);
      setData({ health, projects, tasks, alerts, daemonState, jobRuns });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const projectName = (id: string | null | undefined) =>
    data?.projects.find((p) => p.id === id)?.name ?? id ?? "—";

  const meta = PAGE_META[page];

  return (
    <div className="flex h-full overflow-hidden">
      <SideNav page={page} onChange={setPage} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          onAddTask={() => {
            if (!data?.projects[0]) return;
            void createTask({
              project_id: data.projects[0].id,
              title: `新任务 ${new Date().toLocaleTimeString()}`,
            }).then(async () => {
              await refresh();
              setPage("tasks");
              setCreateTaskSignal((n) => n + 1);
            });
          }}
        />

        <main className="min-h-0 flex-1 overflow-auto scroll-thin p-4 md:p-5">
          {loading && (
            <div className="glass rounded-3xl p-6 text-sm text-[color:var(--muted)]">
              读取 SQLite 中…
            </div>
          )}

          {error && (
            <div className="rounded-3xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 p-6 text-sm">
              <p className="font-medium">数据库连接失败</p>
              <p className="mt-2 text-[color:var(--muted)]">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {page === "tasks" && (
                <DashboardPage
                  projects={data.projects}
                  tasks={data.tasks}
                  alerts={data.alerts}
                  createTaskSignal={createTaskSignal}
                  onCompleteTask={async (id) => {
                    await updateTaskStatus(id, "done");
                    await refresh();
                  }}
                />
              )}
              {page === "projects" && (
                <ProjectsPage
                  projects={data.projects}
                  onCreate={async (name) => {
                    await createProject({ name });
                    await refresh();
                  }}
                />
              )}
              {page === "archive" && (
                <PlaceholderPage
                  title="文件归档"
                  desc="Phase 2 后续接入 project_files 表。"
                />
              )}
              {page === "schedule" && (
                <PlaceholderPage
                  title="日程管理"
                  desc="后续接入 calendar_events，可与任务 due_at 联动。"
                />
              )}
              {page === "alerts" && (
                <AlertsPage
                  alerts={data.alerts}
                  projectName={projectName}
                  onResolve={async (id) => {
                    await resolveAlert(id);
                    await refresh();
                  }}
                />
              )}
              {page === "settings" && (
                <SettingsPage
                  daemonState={data.daemonState}
                  jobRuns={data.jobRuns}
                  dbPath={data.health.dbPath}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
