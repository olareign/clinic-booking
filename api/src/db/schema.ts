/**
 * Idempotent schema, applied on boot. Small enough that a migration tool would be overkill.
 *
 * The key rules live in the database, not in app code, so they hold under concurrency
 * and across multiple instances:
 * - bookings_one_confirmed_per_slot: at most one confirmed booking per slot (level 3).
 * - idempotency_keys.key primary key: one stored response per key (level 4).
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS slots (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  start_time  TEXT NOT NULL,          -- echoed back exactly as received
  end_time    TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL    -- parsed copy, used for sorting and the "already started" check
);
CREATE INDEX IF NOT EXISTS slots_starts_at_idx ON slots (starts_at, id);

CREATE TABLE IF NOT EXISTS bookings (
  seq         BIGSERIAL UNIQUE,       -- insertion order; the pagination cursor
  id          TEXT PRIMARY KEY,
  slot_id     TEXT NOT NULL REFERENCES slots (id),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_confirmed_per_slot ON bookings (slot_id) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_email_seq_idx ON bookings (email, seq);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key          TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  status_code  INT NOT NULL,
  response     JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_attempts (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS booking_attempts_email_time_idx ON booking_attempts (email, attempted_at);
`;
