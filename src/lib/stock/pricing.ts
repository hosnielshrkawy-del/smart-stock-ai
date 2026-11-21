/** Convert a major-unit amount to the currency's integer minor units. */
export function majorAmountToMinor(value: unknown, currency: string): string {
  const input = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(input)) {
    throw new Error("VALIDATION");
  }

  let fractionDigits: number;
  try {
    fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new Error("VALIDATION");
  }

  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > fractionDigits) throw new Error("VALIDATION");
  const scale = 10n ** BigInt(fractionDigits);
  const minor = BigInt(whole) * scale + BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  if (minor > 9223372036854775807n) throw new Error("VALIDATION");
  return minor.toString();
}
