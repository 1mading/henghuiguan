import { useEffect, useMemo, useState } from "react";
import { MiniTimeline } from "../components/MiniTimeline";
import { ProjectStack } from "../components/ProjectStack";
import { SmartDetail } from "../components/SmartDetail";
import { StatCards } from "../components/StatCards";
import { TaskBoard } from "../components/TaskBoard";
import type { Alert, Project, Task } from "../lib/types";

export function DashboardPage({
  projects,
  tasks,
  alerts,
  onCompleteTask,
  createTaskSignal,
}: {
  projects: Project[];
  tasks: Task[];
  alerts: Alert[];
  onCompleteTask: (id: string) => Promise<void>;
  createTaskSignal?: number;
}) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    projects[0]?.id ?? null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    tasks.find((t) => t.status === "in_progress")?.id ?? tasks[0]?.id ?? null,
  );

  useEffect(() => {
    if (!createTaskSignal) return;
    const firstTodo = tasks.find((t) => t.status === "todo") ?? tasks[0];
    if (firstTodo) setSelectedTaskId(firstTodo.id);
  }, [createTaskSignal, tasks]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const projectName =
    projects.find((p) => p.id === selectedTask?.project_id)?.name ?? "未关联项目";

  const overdue = tasks.filter((t) => t.is_overdue === 1).length;
  const done = tasks.filter((t) => t.status === "done").length;
  const doing = tasks.filter((t) => t.status === "in_progress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <StatCards overdue={overdue} done={done} doing={doing} todo={todo} />
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[0.95fr_1.05fr_0.9fr] xl:items-stretch">
        <div className="relative z-0 min-h-[320px] overflow-hidden xl:min-h-0 xl:h-[360px]">
          <TaskBoard
            tasks={tasks}
            selectedId={selectedTaskId}
            onSelect={setSelectedTaskId}
          />
        </div>

        <section className="panel relative z-0 flex h-[360px] flex-col overflow-hidden rounded-3xl p-4">
          <div className="mb-2 flex shrink-0 items-center justify-between px-1">
            <div>
              <p className="text-xs tracking-[0.18em] text-[color:var(--muted)]">
                PROJECT STACK
              </p>
              <h3 className="display text-base font-semibold">横向 3D 项目堆叠</h3>
            </div>
            <span className="text-[11px] text-[color:var(--muted)]">
              {alerts.length} alerts · {projects.length} projects
            </span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <ProjectStack
              projects={projects}
              activeId={activeProjectId}
              onSelect={(id) => {
                setActiveProjectId(id);
                const first = tasks.find((t) => t.project_id === id);
                if (first) setSelectedTaskId(first.id);
              }}
            />
          </div>
        </section>

        <div className="relative z-0 h-[360px] overflow-hidden">
          <SmartDetail
            task={selectedTask}
            projectName={projectName}
            onComplete={() => {
              if (selectedTask) void onCompleteTask(selectedTask.id);
            }}
          />
        </div>
      </div>

      <div className="relative z-0 shrink-0">
        <MiniTimeline tasks={tasks} />
      </div>
    </div>
  );
}
