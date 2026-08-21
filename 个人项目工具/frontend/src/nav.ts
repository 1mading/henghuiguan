export type PageId =
  | "tasks"
  | "projects"
  | "archive"
  | "schedule"
  | "alerts"
  | "settings";

export const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: "tasks", label: "任务管理" },
  { id: "projects", label: "项目总览" },
  { id: "archive", label: "文件归档" },
  { id: "schedule", label: "日程管理" },
  { id: "alerts", label: "智能分析" },
  { id: "settings", label: "设置" },
];
