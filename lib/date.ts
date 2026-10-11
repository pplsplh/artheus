const TZ = "Asia/Jakarta";

/** Tanggal hari ini di WIB, format YYYY-MM-DD */
export function todayWIB(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function weekdayWIB(): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "long" }).format(new Date());
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Google Tasks menyimpan due sebagai tengah malam UTC, jadi format pakai UTC */
export function prettyDate(ymd: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${ymd}T00:00:00Z`));
}
