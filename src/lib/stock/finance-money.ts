/**
 * Exact four-decimal currency conversion for the general ledger.
 * Values stay in integer 1/10,000 currency units until they reach SQL.
 */
const MAX_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

export function financeAmountUnits(value: unknown): number | null {
  const raw =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
  const match = /^(\d{1,12})(?:\.(\d{0,4}))?$/.exec(raw);
  if (!match) return null;

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(4, "0") || "0");
  const units = whole * 10000n + fraction;
  return units <= MAX_UNITS ? Number(units) : null;
}

export function financeUnitsToDecimal(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Finance amount units must be a non-negative safe integer");
  }
  const units = BigInt(value);
  return `${units / 10000n}.${(units % 10000n).toString().padStart(4, "0")}`;
}
