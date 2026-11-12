# Clinic Booking

Two apps, one database:

| Folder | What | Stack | Host |
|---|---|---|---|
| `api/` | The booking API from the spec | NestJS 11 + `pg` | Render (web service) |
| `web/` | The patient page: pick a slot, book, see confirmation, cancel | Next.js 16 | Vercel |
| — | Database | Postgres | Neon |

```
browser ──► Next.js (Vercel) ──X-API-Key──► NestJS API (Render) ──► Postgres (Neon)
            server actions only              guard → service → SQL
```

The browser never sees the API key. Pages and form submits run on the Next.js server (server components + server actions), and only that server calls the API.

## Run locally

Needs Node 20+ and pnpm, plus a Postgres URL (a free Neon branch works).

```bash
cd api && cp .env.example .env   # fill DATABASE_URL and API_KEY
pnpm install && pnpm build && pnpm start          # http://localhost:3001
```

```bash
cd web && cp .env.example .env.local   # API_URL=http://localhost:3001, same API_KEY
pnpm install && pnpm dev                          # http://localhost:3000
```

The API creates its tables on boot. Seed some slots (shown below), then open the web app.

Tests run against a real throwaway Postgres (`embedded-postgres`), so you need no Docker or local install:

```bash
cd api && pnpm test
```

## Deploy

**1. Neon:** create a project and copy the connection string (keep `?sslmode=require`).

**2. API on Render:** New → Web Service → this repo.
- Root directory: `api`
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
- Start: `pnpm start`
- Env: `DATABASE_URL` (from Neon), `API_KEY` (`openssl rand -hex 32`)

**3. Web on Vercel:** New Project → this repo.
- Root directory: `web`
- Env: `API_URL` (the Render https URL), `API_KEY` (the same key)

**4. Seed slots** (the checker sends its own `/reset`; this is just for your demo):

```bash
curl -X POST https://YOUR-API.onrender.com/reset \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"slots":[{"id":"s1","provider":"Dr Ade","start":"2026-12-10T09:00:00Z","end":"2026-12-10T09:30:00Z"}]}'
```

> **Render free plan sleeps after 15 idle minutes**, and the first request then takes ~50s. The checker might time out on that. Either use the Starter plan or ping the API every 10 minutes (e.g. cron-job.org → `GET /slots`). A 401 response still wakes it.

## How each level is done

The rule of thumb: **let Postgres enforce the rules.** App-level checks like "look, then write" break under concurrency or with more than one server. Constraints and locks don't.

| Level | Requirement | How |
|---|---|---|
| 1 | List, book, look up | Plain SQL with `pg`, no ORM. Slots keep the exact `start`/`end` strings you sent (echoed back unchanged) plus a parsed `timestamptz` for sorting. |
| 2 | API key | A global Nest guard compares SHA-256 hashes with `timingSafeEqual` (constant time). Missing or wrong key → 401. |
| 2 | Validation | `booking.validation.ts`: required, non-empty, simple email regex, trim, lower-case email. Then 404 for an unknown slot, 400 if it has started. |
| 3 | No double booking, even at the same instant | **Partial unique index** `UNIQUE (slot_id) WHERE status = 'confirmed'`, and `INSERT … ON CONFLICT DO NOTHING`. If nothing is inserted → 409. The test fires 25 at once and gets exactly one 201. |
| 3 | Cancel | `UPDATE … SET status='cancelled' WHERE status='confirmed'`. The row leaves the partial index, so the slot is free again. Already cancelled → 409. |
| 4 | Idempotency | The `Idempotency-Key` is a primary key. The request claims it with an INSERT in the same transaction as the booking. A concurrent retry blocks on that row, then replays the stored status + body. Same key, different body (hash compare) → 422. A 429 is not stored, so the key can be retried later. |
| 4 | Pagination | Keyset cursor: an opaque base64 of the row's `seq`. It stays stable while new rows are added and is fast at any depth (index on `(email, seq)`). |
| 5 | Rate limit (5 per email per minute) | Sliding window in Postgres. A per-email `pg_advisory_xact_lock` makes "count then record" atomic, so a burst of 12 gives exactly 5 through. Failed attempts count. `Retry-After` = seconds until the oldest attempt expires. |

Why Postgres and not Redis for the rate limit? One less service to run. It is also correct across multiple instances, and the load is tiny. If traffic grew, this is the first thing to move to Redis.

**Order inside `POST /bookings`** (one transaction): idempotency check → rate limit → validate → slot checks → insert. Replays come first so a client retrying a request never gets rate-limited by its own retries. Locks are always taken in that order, so transactions can't deadlock.

## Security and production notes

- `helmet` security headers; every error is `{"error": "..."}`, and unexpected errors return a generic 500 (details go to the logs only).
- Every SQL query is parameterized. Config is validated at boot, so the app refuses to start without `DATABASE_URL` and an `API_KEY` of at least 16 characters.
- On the frontend, `server-only` makes the build fail if the API client is ever imported into browser code.
- The booking form sends an Idempotency-Key, so a double-click or network retry never double-books. After an error it gets a fresh key, so a corrected form isn't rejected with 422.

**Deliberately left out** (not needed here): an ORM or migration tool (the schema is one idempotent SQL block), per-IP throttling (the checker may send bursts from one IP), Redis, Swagger UI, idempotency-key expiry.
