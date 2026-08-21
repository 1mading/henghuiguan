const path = require('path');
const fs = require('fs');
const { getWorkCalendar: getStoredCalendar, setWorkCalendar } = require('../db/database');

const DEFAULT_WORK_CALENDAR = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/work-calendar-default.json'), 'utf8')
);

function normalizeDateList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(d => String(d).slice(0, 10)).filter(Boolean))].sort();
}

function normalizeWorkCalendar(data) {
  const base = { ...DEFAULT_WORK_CALENDAR, ...(data || {}) };
  return {
    scheduleMode: base.scheduleMode || 'alternate',
    referenceDate: base.referenceDate || DEFAULT_WORK_CALENDAR.referenceDate,
    referenceIsSingleWeek: base.referenceIsSingleWeek !== false,
    hoursPerDay: Number(base.hoursPerDay) || DEFAULT_WORK_CALENDAR.hoursPerDay,
    workStartHour: base.workStartHour ?? DEFAULT_WORK_CALENDAR.workStartHour,
    workEndHour: base.workEndHour ?? DEFAULT_WORK_CALENDAR.workEndHour,
    holidays: normalizeDateList(base.holidays),
    extraWorkdays: normalizeDateList(base.extraWorkdays),
  };
}

function getWorkCalendar() {
  const stored = getStoredCalendar();
  return normalizeWorkCalendar(stored || DEFAULT_WORK_CALENDAR);
}

function saveWorkCalendar(data) {
  const normalized = normalizeWorkCalendar(data);
  setWorkCalendar(normalized);
  return normalized;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekStartMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isSingleRestWeek(dateStr, cal) {
  const calendar = cal || getWorkCalendar();
  if (calendar.scheduleMode === 'single') return true;
  if (calendar.scheduleMode === 'double') return false;
  const ref = parseLocalDate(calendar.referenceDate);
  const cur = parseLocalDate(dateStr);
  if (!ref || !cur) return false;
  const refStart = getWeekStartMonday(ref).getTime();
  const curStart = getWeekStartMonday(cur).getTime();
  const weeksDiff = Math.round((curStart - refStart) / (7 * 24 * 3600 * 1000));
  const refIsSingle = calendar.referenceIsSingleWeek !== false;
  return weeksDiff % 2 === 0 ? refIsSingle : !refIsSingle;
}

function isWorkDay(dateStr, cal) {
  const calendar = cal || getWorkCalendar();
  const ds = String(dateStr).slice(0, 10);
  if (calendar.extraWorkdays.includes(ds)) return true;
  if (calendar.holidays.includes(ds)) return false;

  const date = parseLocalDate(ds);
  if (!date) return false;
  const day = date.getDay();
  if (day >= 1 && day <= 5) return true;
  if (day === 6) return isSingleRestWeek(ds, calendar);
  return false;
}

function parseWorkTime(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const text = String(val).trim();
  if (text.includes(':')) {
    const [h, m = '0'] = text.split(':');
    const hour = Number(h);
    const minute = Number(m);
    if (Number.isFinite(hour) && Number.isFinite(minute)) return hour + minute / 60;
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function getWorkDayBounds(cal) {
  const calendar = cal || getWorkCalendar();
  const start = parseWorkTime(calendar.workStartHour);
  const end = parseWorkTime(calendar.workEndHour);
  if (start != null && end != null && end > start) {
    return { start, end, hoursPerDay: Math.round((end - start) * 10) / 10 };
  }
  const hoursPerDay = Number(calendar.hoursPerDay) || DEFAULT_WORK_CALENDAR.hoursPerDay;
  return {
    start: DEFAULT_WORK_CALENDAR.workStartHour,
    end: DEFAULT_WORK_CALENDAR.workEndHour,
    hoursPerDay,
  };
}

function addDaysLocal(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** 任务每日投入工时；未设置时返回 null（按标准工作日满负荷推算） */
function resolveDailyHours(dailyHours) {
  const n = Number(dailyHours);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function calcEndDate(startDate, hours, cal, dailyHours) {
  if (!startDate || !hours || hours <= 0) return '';

  const perDay = resolveDailyHours(dailyHours);
  let remainingHours = hours;
  let currentDate = parseLocalDate(startDate);
  if (!currentDate) return '';

  if (perDay != null) {
    while (remainingHours > 0) {
      const dateStr = formatLocalDate(currentDate);
      if (isWorkDay(dateStr, cal)) {
        if (remainingHours <= perDay) {
          remainingHours = 0;
        } else {
          remainingHours -= perDay;
          currentDate = addDaysLocal(currentDate, 1);
        }
      } else {
        currentDate = addDaysLocal(currentDate, 1);
      }
    }
    return formatLocalDate(currentDate);
  }

  const { start: workStartHour, end: workEndHour } = getWorkDayBounds(cal);
  let currentHour = workStartHour;

  while (remainingHours > 0) {
    const dateStr = formatLocalDate(currentDate);
    if (isWorkDay(dateStr, cal)) {
      const availableHours = workEndHour - currentHour;
      if (remainingHours <= availableHours) {
        remainingHours = 0;
      } else {
        remainingHours -= availableHours;
        currentDate = addDaysLocal(currentDate, 1);
        currentHour = workStartHour;
      }
    } else {
      currentDate = addDaysLocal(currentDate, 1);
      currentHour = workStartHour;
    }
  }

  return formatLocalDate(currentDate);
}

function calcWorkDays(startDate, endDate, cal) {
  if (!startDate || !endDate) return 0;
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end || start > end) return 0;

  let count = 0;
  let currentDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (currentDate <= end) {
    if (isWorkDay(formatLocalDate(currentDate), cal)) count++;
    currentDate = addDaysLocal(currentDate, 1);
  }
  return count;
}

function calcActualHours(startDate, endDate, cal, dailyHours) {
  if (!startDate) return 0;
  const end = endDate || formatLocalDate(new Date());
  const perDay = resolveDailyHours(dailyHours) ?? getWorkDayBounds(cal).hoursPerDay;
  return calcWorkDays(startDate, end, cal) * perDay;
}

function ensureWorkCalendarInStore() {
  if (!getStoredCalendar()) {
    setWorkCalendar(normalizeWorkCalendar(DEFAULT_WORK_CALENDAR));
  }
}

module.exports = {
  DEFAULT_WORK_CALENDAR,
  normalizeWorkCalendar,
  getWorkCalendar,
  saveWorkCalendar,
  isWorkDay,
  resolveDailyHours,
  calcEndDate,
  calcWorkDays,
  calcActualHours,
  getWorkDayBounds,
  ensureWorkCalendarInStore,
};
