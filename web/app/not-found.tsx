import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Booking not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Check the link, or make a new booking.</p>
      <Link href="/" className="font-medium text-teal-700 hover:underline dark:text-teal-400">← Back to slots</Link>
    </section>
  );
}
