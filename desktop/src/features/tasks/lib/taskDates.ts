const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localDateToDueTimestamp(value: string): number | null {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 59, 59);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return null;
  return Math.floor(date.getTime() / 1000);
}

export function dueTimestampToLocalDate(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return "";
  const date = new Date(value * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDueTimestampOverdue(
  dueTimestamp: number | null,
  nowTimestamp = Math.floor(Date.now() / 1000),
): boolean {
  return dueTimestamp !== null && nowTimestamp > dueTimestamp;
}
