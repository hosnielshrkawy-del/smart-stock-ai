export function fmtQty(value: string | number | null | undefined, locale: string) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 4,
  }).format(n);
}

export function fmtMoney(
  value: string | number | null | undefined,
  currency: string,
  locale: string,
) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtWhen(value: string | null | undefined, locale: string, timeZone: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone || "UTC",
  }).format(d);
}

export function fmtDay(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
  }).format(d);
}

export function downloadCsv(filename: string, rows: string[][]) {
  const esc = (cell: string) => `"${cell.replaceAll('"', '""')}"`;
  const body = rows.map((r) => r.map((c) => esc(c ?? "")).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
