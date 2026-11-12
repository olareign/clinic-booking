/**
 * Opaque cursor = base64url of the last row's `seq`. Keyset pagination: stable while new bookings
 * are added, and the query stays fast on the (email, seq) index no matter how deep you page.
 */
export const encodeCursor = (seq: string): string => Buffer.from(seq).toString('base64url');

export function decodeCursor(cursor: string): string | null {
  const seq = Buffer.from(cursor, 'base64url').toString();
  return /^\d{1,18}$/.test(seq) ? seq : null;
}

/** Parses ?limit=. Must be a whole number from 1 to 50; defaults to 10. */
export function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return 10;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 50 ? n : null;
}
