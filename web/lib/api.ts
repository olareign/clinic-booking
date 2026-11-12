import 'server-only'; // build fails if this file is ever imported into browser code, so the key can't leak
import { connection } from 'next/server';

export interface Slot {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
}

export interface Booking {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

function config() {
  const url = process.env.API_URL;
  const key = process.env.API_KEY;
  if (!url || !key) throw new Error('API_URL and API_KEY must be set');
  return { url: url.replace(/\/+$/, ''), key };
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  await connection(); // live data: always fetch at request time, never prerender at build
  const { url, key } = config();
  const res = await fetch(`${url}${path}`, {
    ...init,
    cache: 'no-store', // slots change constantly; always show live availability
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key, ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError(res.status, body.error ?? `request failed (${res.status})`, retryAfter);
  }
  return body as T;
}

export const api = {
  listSlots: () => apiFetch<{ slots: Slot[] }>('/slots').then((r) => r.slots),
  getBooking: (id: string) => apiFetch<Booking>(`/bookings/${encodeURIComponent(id)}`),
  createBooking: (input: { slot_id: string; name: string; email: string }, idempotencyKey: string) =>
    apiFetch<Booking>('/bookings', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  cancelBooking: (id: string) => apiFetch<Booking>(`/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
