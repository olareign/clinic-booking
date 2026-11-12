import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError, type Booking } from '@/lib/api';
import { formatSlotTime } from '@/lib/format';
import { cancelBooking } from '../../actions';

async function load(id: string): Promise<Booking> {
  try {
    return await api.getBooking(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export default async function BookingPage({ params }: PageProps<'/bookings/[id]'>) {
  const { id } = await params;
  const booking = await load(id);
  const slot = (await api.listSlots()).find((s) => s.id === booking.slot_id);
  const confirmed = booking.status === 'confirmed';

  return (
    <section className="space-y-6">
      <div
        className={`rounded-xl border p-6 ${
          confirmed
            ? 'border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40'
            : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900'
        }`}
      >
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          {confirmed ? 'Booking confirmed' : 'Booking cancelled'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {slot ? `${slot.provider}, ${formatSlotTime(slot.start, slot.end)}` : `Slot ${booking.slot_id}`}
        </h1>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-zinc-600 dark:text-zinc-400">Name</dt>
          <dd>{booking.name}</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Email</dt>
          <dd>{booking.email}</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Reference</dt>
          <dd className="font-mono text-xs break-all">{booking.id}</dd>
        </dl>
      </div>

      <div className="flex flex-wrap gap-3">
        {confirmed && (
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/50">
              Cancel booking
            </button>
          </form>
        )}
        <Link href="/" className="rounded-lg px-4 py-2 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
          ← Back to slots
        </Link>
      </div>
    </section>
  );
}
