// Replaces ALL slots (and deletes all bookings) with 30-minute slots from 05:00 to 22:00 UTC
// for each doctor, over the next few days. For local testing and demos.
//
//   API_URL=http://localhost:3001 API_KEY=... node scripts/seed.mjs [days]
//
// Locally, API_URL defaults to http://localhost:3001 and API_KEY is read from .env.
import { existsSync } from 'fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error('API_KEY is required');

const DOCTORS = ['Dr Ade', 'Dr Bisi'];
const days = Number(process.argv[2] ?? 3);
const FIRST_HOUR = 5;
const LAST_END_HOUR = 22;
const SLOT_MINUTES = 30;

const iso = (d) => d.toISOString().replace('.000Z', 'Z');
const slots = [];
const today = new Date();

for (let day = 1; day <= days; day++) {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + day));
  for (const [i, provider] of DOCTORS.entries()) {
    for (let min = FIRST_HOUR * 60; min + SLOT_MINUTES <= LAST_END_HOUR * 60; min += SLOT_MINUTES) {
      const start = new Date(date.getTime() + min * 60_000);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
      const stamp = iso(start).slice(0, 16).replace(/[-:T]/g, '');
      slots.push({ id: `d${i + 1}-${stamp}`, provider, start: iso(start), end: iso(end) });
    }
  }
}

const res = await fetch(`${apiUrl}/reset`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
  body: JSON.stringify({ slots }),
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
