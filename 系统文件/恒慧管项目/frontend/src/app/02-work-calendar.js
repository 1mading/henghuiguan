// ========== 工作日历（由服务端下发，前端仅做运行时计算） ==========
let workCalendar = null;

function normalizeDateList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(d => String(d).slice(0, 10)).filter(Boolean))].sort();
}

function applyWorkCalendar(data) {
  if (!data || typeof data !== 'object') return;
  workCalendar = {
    scheduleMode: data.scheduleMode || 'alternate',
    referenceDate: data.referenceDate || '2026-01-05',
    referenceIsSingleWeek: data.referenceIsSingleWeek !== false,
    hoursPerDay: Number(data.hoursPerDay) || 8.5,
    workStartHour: data.workStartHour ?? 8.5,
    workEndHour: data.workEndHour ?? 17,
    holidays: normalizeDateList(data.holidays),
    extraWorkdays: normalizeDateList(data.extraWorkdays),
  };
}

function getWorkCalendar() {
  if (workCalendar) return workCalendar;
  return {
    scheduleMode: 'double',
    referenceDate: '2026-01-05',
    referenceIsSingleWeek: true,
    hoursPerDay: 8.5,
    workStartHour: 8.5,
    workEndHour: 17,
    holidays: [],
    extraWorkdays: [],
  };
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  return new Date(y, mo - 1, d);
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return formatLocalDate(new Date());
}

/** 统一为 YYYY-MM-DD，避免带时间戳或时区导致误判 */
function normalizeDateStr(dateStr) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return d ? formatLocalDate(d) : String(dateStr).trim().slice(0, 10);
}

/** 日历日差：toStr - fromStr（YYYY-MM-DD） */
function diffCalendarDays(fromStr, toStr) {
  const from = parseLocalDate(fromStr);
  const to = parseLocalDate(toStr);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function isActiveTaskStatus(task) {
  return task && task.status !== 'done' && task.status !== 'archived' && task.status !== 'abolished' && task.status !== 'paused';
}
