/**
 * A plan limit is optional until pricing/limits are configured by the platform.
 * This helper deliberately treats missing or malformed configuration as
 * unconfigured rather than inventing a commercial cap.
 */
export function planLimitExceeded(
  configuredLimit: unknown,
  currentUsage: number,
  requested = 1,
): boolean {
  const limit =
    typeof configuredLimit === "number"
      ? configuredLimit
      : typeof configuredLimit === "string" && configuredLimit.trim() !== ""
        ? Number(configuredLimit)
        : Number.NaN;
  if (!Number.isFinite(limit) || limit < 0) return false;
  if (!Number.isFinite(currentUsage) || currentUsage < 0) return false;
  if (!Number.isFinite(requested) || requested <= 0) return false;
  return currentUsage + requested > limit;
}
