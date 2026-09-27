const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** `deadline` is a calendar date (YYYY-MM-DD); parse it as local so it never shifts a day. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(value: string): string {
  return dateFormat.format(parseLocalDate(value));
}

export function daysUntil(value: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseLocalDate(value).getTime() - today.getTime()) / 86_400_000);
}

export function deadlineLabel(value: string): string {
  const days = daysUntil(value);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 0) return `Overdue · ${formatDate(value)}`;
  if (days <= 14) return `Due in ${days} days`;
  return `Due ${formatDate(value)}`;
}

/** Engine totals are 0..1 normalised; the UI presents them on a 0..100 scale. */
export function toPoints(value: string | number, digits = 1): string {
  return (Number(value) * 100).toFixed(digits);
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
