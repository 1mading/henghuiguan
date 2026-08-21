export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type AlertType = "overdue" | "conflict" | "risk" | "review" | "info";
export type Severity = "low" | "medium" | "high" | "critical";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  priority: number;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  start_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  is_overdue: 0 | 1;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  project_id: string | null;
  task_id: string | null;
  alert_type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  payload_json: string;
  is_resolved: 0 | 1;
  source: "app" | "daemon";
  created_at: string;
  resolved_at: string | null;
}

export interface DaemonStateRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface JobRun {
  id: string;
  job_name: string;
  status: "running" | "success" | "failed" | "skipped";
  started_at: string;
  finished_at: string | null;
  detail_json: string;
  error_message: string;
}
