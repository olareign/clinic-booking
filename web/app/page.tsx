import { api, type Slot } from '@/lib/api';
import { formatDay, formatSlotTime, formatTime } from '@/lib/format';
import { BookForm, type SlotOption } from './book-form';

function toOptions(slots: Slot[]): SlotOption[] {
  const now = Date.now();
  return slots.map((s) => {
    const started = Date.parse(s.start) <= now;
    return {
      id: s.id,
      provider: s.provider,
      day: formatDay(s.start),
      time: `${formatTime(s.start)}–${formatTime(s.end)}`,
      label: formatSlotTime(s.start, s.end),
      bookable: s.available && !started,
      reason: started ? 'Past' : s.available ? undefined : 'Booked',
    };
  });
}

export default async function HomePage() {
  const options = toOptions(await api.listSlots());

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Book an appointment</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Choose your doctor, pick a free time, add your details, and you’re done.
        </p>
      </div>
      <BookForm slots={options} initialKey={crypto.randomUUID()} />
    </section>
  );
}
