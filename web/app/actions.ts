'use server';

import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export interface BookState {
  error?: string;
  /** Fresh Idempotency-Key for the next attempt after an error. */
  nextKey?: string;
  /** What was submitted, so the form can refill itself after an error (React resets forms after actions). */
  values?: { slot_id: string; name: string; email: string };
}

const field = (form: FormData, name: string): string => {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
};

function friendlyError(err: ApiError): string {
  if (err.status === 409) return 'Sorry, someone just booked that slot. Please pick another.';
  if (err.status === 429) return `Too many attempts. Try again in ${err.retryAfter ?? 60} seconds.`;
  return err.message.charAt(0).toUpperCase() + err.message.slice(1) + '.';
}

/** The API does the real validation; this just turns its errors into friendly messages. */
export async function bookSlot(_prev: BookState, form: FormData): Promise<BookState> {
  const values = { slot_id: field(form, 'slot_id'), name: field(form, 'name'), email: field(form, 'email') };
  let bookingId: string;
  try {
    const booking = await api.createBooking(values, field(form, 'idempotency_key') || crypto.randomUUID());
    bookingId = booking.id;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // After a 409 the chosen slot is gone, so don't re-select it.
    const keep = err.status === 409 ? { ...values, slot_id: '' } : values;
    return { error: friendlyError(err), nextKey: crypto.randomUUID(), values: keep };
  }
  redirect(`/bookings/${bookingId}`); // outside try: redirect() works by throwing
}

export async function cancelBooking(form: FormData): Promise<void> {
  const id = field(form, 'id');
  try {
    await api.cancelBooking(id);
  } catch (err) {
    // Already cancelled (e.g. double click) is fine: the page below shows the current status.
    if (!(err instanceof ApiError && err.status === 409)) throw err;
  }
  redirect(`/bookings/${id}`);
}
