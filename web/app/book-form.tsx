'use client';

import { useActionState, useState } from 'react';
import { bookSlot, type BookState } from './actions';

export interface SlotOption {
  id: string;
  provider: string;
  /** e.g. "Fri 13 Nov" (UTC) */
  day: string;
  /** e.g. "09:00–09:30" (UTC) */
  time: string;
  /** Full text for screen readers, e.g. "Fri 13 Nov, 09:00–09:30 UTC" */
  label: string;
  bookable: boolean;
  reason?: string;
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

const legendClass = 'mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300';

/** Groups items by a key, keeping first-appearance order (slots arrive earliest first). */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

const freeCount = (list: SlotOption[]) => list.filter((s) => s.bookable).length;

export function BookForm({ slots, initialKey }: { slots: SlotOption[]; initialKey: string }) {
  const [state, formAction, pending] = useActionState<BookState, FormData>(bookSlot, {});
  // One key per booking attempt: a double submit or network retry reuses it (no duplicate booking).
  // Each error comes back with a fresh key, so a corrected form isn't "same key, different body".
  const idempotencyKey = state.nextKey ?? initialKey;

  // After an error React resets the form, so reopen the doctor and day that were submitted.
  const submitted = slots.find((s) => s.id === state.values?.slot_id);

  const [chosenDoctor, setChosenDoctor] = useState<string | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);

  const doctors = groupBy(slots, (s) => s.provider);
  const doctor = chosenDoctor ?? submitted?.provider ?? null;
  const days = groupBy(doctor ? (doctors.get(doctor) ?? []) : [], (s) => s.day);
  const dayNames = [...days.keys()];
  // Default to the submitted day, else the first day that still has a free slot.
  const day =
    (chosenDay && days.has(chosenDay) ? chosenDay : null) ??
    (submitted?.provider === doctor ? submitted?.day : undefined) ??
    dayNames.find((d) => freeCount(days.get(d)!) > 0) ??
    dayNames[0] ??
    null;
  const daySlots = day ? (days.get(day) ?? []) : [];

  const pickDoctor = (name: string) => {
    setChosenDoctor(name);
    setChosenDay(null);
  };

  if (slots.length === 0) {
    return <p className="text-zinc-600 dark:text-zinc-400">No slots have been published yet.</p>;
  }

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <fieldset>
        <legend className={legendClass}>1. Choose a doctor</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[...doctors].map(([name, list]) => {
            const free = freeCount(list);
            const selected = name === doctor;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                onClick={() => pickDoctor(name)}
                className={`rounded-xl border p-4 text-left transition ${
                  selected
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40'
                    : 'border-zinc-200 hover:border-teal-500 dark:border-zinc-800'
                }`}
              >
                <span className="block font-medium">{name}</span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                  {free === 0 ? 'Fully booked' : `${free} slot${free === 1 ? '' : 's'} available`}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {doctor && day && (
        <fieldset>
          <legend className={legendClass}>2. Pick a time with {doctor}</legend>

          <label className="mb-3 flex items-center gap-3 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Day</span>
            <select
              value={day}
              onChange={(e) => setChosenDay(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {dayNames.map((name) => {
                const free = freeCount(days.get(name)!);
                return (
                  <option key={name} value={name}>
                    {name} — {free === 0 ? 'fully booked' : `${free} free`}
                  </option>
                );
              })}
            </select>
          </label>

          {/* One day's times, in a box that scrolls on its own so the page stays short. */}
          <div
            key={`${doctor}-${day}`}
            role="group"
            aria-label={day}
            className="max-h-[22rem] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 dark:border-zinc-800"
          >
            {daySlots.map((slot) => (
              <label
                key={slot.id}
                className={`flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-800/60 ${
                  slot.bookable
                    ? 'cursor-pointer hover:bg-zinc-50 has-[:checked]:bg-teal-50 dark:hover:bg-zinc-900 dark:has-[:checked]:bg-teal-950/40'
                    : 'cursor-not-allowed opacity-50'
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="slot_id"
                    value={slot.id}
                    required
                    disabled={!slot.bookable}
                    defaultChecked={slot.bookable && state.values?.slot_id === slot.id}
                    aria-label={slot.bookable ? slot.label : `${slot.label}, ${slot.reason}`}
                    className="accent-teal-600"
                  />
                  <span className="tabular-nums">{slot.time}</span>
                </span>
                <span
                  className={`text-xs font-medium uppercase tracking-wide ${
                    slot.bookable ? 'text-teal-700 dark:text-teal-400' : ''
                  }`}
                >
                  {slot.bookable ? 'Available' : slot.reason}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Times are in UTC.</p>
        </fieldset>
      )}

      {doctor && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className={legendClass}>3. Your details</legend>
          <label className="space-y-1 text-sm">
            <span>Full name</span>
            <input
              name="name"
              required
              maxLength={200}
              autoComplete="name"
              defaultValue={state.values?.name}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              defaultValue={state.values?.email}
              className={inputClass}
            />
          </label>
        </fieldset>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {state.error}
        </p>
      )}

      {doctor && (
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-teal-600 px-4 py-3 font-medium text-white hover:bg-teal-700 disabled:opacity-60 sm:w-auto"
        >
          {pending ? 'Booking…' : `Book with ${doctor}`}
        </button>
      )}
    </form>
  );
}
