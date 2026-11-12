import { createHash } from 'crypto';

export interface NewBooking {
  slot_id: string;
  name: string;
  email: string;
}

export type Validation = { ok: true; value: NewBooking } | { ok: false; error: string };

// Deliberately simple: one "@", no spaces, a dot in the domain. Strict RFC parsing rejects real addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Level 2 rules: required, non-empty, valid email. Trims name/email and lower-cases email. */
export function validateNewBooking(body: unknown): Validation {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  for (const field of ['slot_id', 'name', 'email'] as const) {
    const v = b[field];
    if (typeof v !== 'string' || v.trim() === '') return { ok: false, error: `${field} is required` };
  }

  const slot_id = (b.slot_id as string).trim();
  const name = (b.name as string).trim();
  const email = normalizeEmail(b.email as string);

  if (name.length > 200) return { ok: false, error: 'name is too long' };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: 'email is invalid' };

  return { ok: true, value: { slot_id, name, email } };
}

/** The email used for rate limiting. Counts invalid-but-present emails too, since failed attempts count. */
export function rateLimitKey(body: unknown): string | null {
  const email = (body as Record<string, unknown> | null)?.email;
  return typeof email === 'string' && email.trim() !== '' ? normalizeEmail(email) : null;
}

/** Stable hash of a JSON body (key order ignored), used to detect an Idempotency-Key reused with a different body. */
export function hashBody(body: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
        : v;
  return createHash('sha256').update(JSON.stringify(canonical(body ?? null))).digest('hex');
}
