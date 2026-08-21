import { useCallback, useEffect, useState } from "react";
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
} from "./db";
import type { Alert, DaemonStateRow, JobRun, Project, Task } from "./types";

export interface AppData {
  loading: boolean;
  error: string | null;
  dbPath: string;
  projects: Project[];
  tasks: Task[];
  alerts: Alert[];
  daemonState: DaemonStateRow[];
  jobRuns: JobRun[];
  refresh: () => Promise<void>;
  addProject: (name: string) => Promise<void>;
  addTask: (projectId: string, title: string) => Promise<void>;
  setTaskStatus: (id: string, status: Task["status"]) => Promise<void>;
  markAlertResolved: (id: string) => Promise<void>;
}

export function useAppData(): AppData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [daemonState, setDaemonState] = useState<DaemonStateRow[]>([]);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const health = await dbHealth();
      setDbPath(health.dbPath);
      const [p, t, a, d, j] = await Promise.all([
        listProjects(),
        listTasks(),
        listAlerts(),
        listDaemonState(),
        listJobRuns(),
      ]);
      setProjects(p);
      setTasks(t);
      setAlerts(a);
      setDaemonState(d);
      setJobRuns(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addProject = useCallback(
    async (name: string) => {
      await createProject({ name });
      await refresh();
    },
    [refresh],
  );

  const addTask = useCallback(
    async (projectId: string, title: string) => {
      await createTask({ project_id: projectId, title });
      await refresh();
    },
    [refresh],
  );

  const setTaskStatus = useCallback(
    async (id: string, status: Task["status"]) => {
      await updateTaskStatus(id, status);
      await refresh();
    },
    [refresh],
  );

  const markAlertResolved = useCallback(
    async (id: string) => {
      await resolveAlert(id);
      await refresh();
    },
    [refresh],
  );

  return {
    loading,
    error,
    dbPath,
    projects,
    tasks,
    alerts,
    daemonState,
    jobRuns,
    refresh,
    addProject,
    addTask,
    setTaskStatus,
    markAlertResolved,
  };
}
