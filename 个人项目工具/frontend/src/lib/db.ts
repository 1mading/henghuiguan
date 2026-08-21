import type { Alert, DaemonStateRow, JobRun, Project, Task } from "./types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `request failed: ${res.status}`);
  }
  return data;
}

export async function dbHealth(): Promise<{ ok: boolean; dbPath: string; projects: number }> {
  const res = await fetch("/__sqlite/health");
  const data = (await res.json()) as {
    ok?: boolean;
    dbPath?: string;
    projects?: number;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "db health check failed");
  }
  return {
    ok: Boolean(data.ok),
    dbPath: String(data.dbPath ?? ""),
    projects: Number(data.projects ?? 0),
  };
}

export async function queryRows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const data = await postJson<{ rows: T[] }>("/__sqlite/query", { sql, params });
  return data.rows;
}

export async function runSql(
  sql: string,
  params: unknown[] = [],
): Promise<{ changes: number }> {
  return postJson<{ changes: number }>("/__sqlite/run", { sql, params });
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19);
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function listProjects(): Promise<Project[]> {
  return queryRows<Project>(
    `SELECT * FROM projects ORDER BY sort_order ASC, updated_at DESC`,
  );
}

export async function listTasks(): Promise<Task[]> {
  return queryRows<Task>(
    `SELECT * FROM tasks
     ORDER BY is_overdue DESC,
              CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
              due_at ASC,
              sort_order ASC`,
  );
}

export async function listAlerts(): Promise<Alert[]> {
  return queryRows<Alert>(
    `SELECT * FROM alerts WHERE is_resolved = 0 ORDER BY created_at DESC`,
  );
}

export async function listDaemonState(): Promise<DaemonStateRow[]> {
  return queryRows<DaemonStateRow>(`SELECT * FROM daemon_state ORDER BY key ASC`);
}

export async function listJobRuns(limit = 20): Promise<JobRun[]> {
  return queryRows<JobRun>(
    `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
}

export async function createProject(input: {
  name: string;
  description?: string;
  color?: string;
}): Promise<void> {
  const ts = nowIso();
  await runSql(
    `INSERT INTO projects (
      id, name, description, status, color, priority, progress,
      start_date, due_date, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, 0, 0, NULL, NULL, 0, ?, ?)`,
    [
      newId("p"),
      input.name,
      input.description ?? "",
      input.color ?? "#38bdf8",
      ts,
      ts,
    ],
  );
}

export async function createTask(input: {
  project_id: string;
  title: string;
  due_at?: string | null;
}): Promise<void> {
  const ts = nowIso();
  await runSql(
    `INSERT INTO tasks (
      id, project_id, title, description, status, priority,
      start_at, due_at, completed_at, is_overdue, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, '', 'todo', 0, ?, ?, NULL, 0, 0, ?, ?)`,
    [
      newId("t"),
      input.project_id,
      input.title,
      ts,
      input.due_at ?? null,
      ts,
      ts,
    ],
  );
}

export async function updateTaskStatus(id: string, status: Task["status"]): Promise<void> {
  const ts = nowIso();
  const completed = status === "done" ? ts : null;
  await runSql(
    `UPDATE tasks
     SET status = ?, completed_at = ?, is_overdue = CASE WHEN ? IN ('done', 'cancelled') THEN 0 ELSE is_overdue END, updated_at = ?
     WHERE id = ?`,
    [status, completed, status, ts, id],
  );
}

export async function resolveAlert(id: string): Promise<void> {
  const ts = nowIso();
  await runSql(
    `UPDATE alerts SET is_resolved = 1, resolved_at = ? WHERE id = ?`,
    [ts, id],
  );
}
