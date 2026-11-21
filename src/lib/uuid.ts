/**
 * Create an RFC 4122 version-4 UUID for client-side idempotency keys and
 * temporary React row identities.
 *
 * crypto.randomUUID() is unavailable in some non-secure browser contexts
 * (for example, an app opened over plain HTTP from a LAN IP). getRandomValues
 * is supported in more contexts; Math.random is only a last-resort compatibility
 * fallback and must never be used for authentication tokens or secrets.
 */
type CryptoUuidProvider = Pick<Crypto, "getRandomValues"> &
  Partial<Pick<Crypto, "randomUUID">>;

export function createUuid(
  cryptoProvider: CryptoUuidProvider | null = globalThis.crypto,
): string {
  if (typeof cryptoProvider?.randomUUID === "function") {
    return cryptoProvider.randomUUID();
  }

  const bytes = new Uint8Array(16);
  let filled = false;
  if (typeof cryptoProvider?.getRandomValues === "function") {
    try {
      cryptoProvider.getRandomValues(bytes);
      filled = true;
    } catch {
      // Fall through to a compatibility-only fallback below.
    }
  }
  if (!filled) {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 version 4 and variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
