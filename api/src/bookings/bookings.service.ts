import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { hashBody, rateLimitKey, validateNewBooking } from './booking.validation';
import { decodeCursor, encodeCursor } from './cursor';

export interface Booking {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
}

/** POST /bookings returns a result instead of throwing, so the exact response can be stored for idempotent replays. */
export interface CreateResult {
  status: number;
  body: Booking | { error: string };
  retryAfter?: number;
}

const BOOKING_COLUMNS = 'id, slot_id, name, email, status, created_at';
export const RATE_LIMIT = { max: 5, windowSeconds: 60 };

const fail = (status: number, error: string, retryAfter?: number): CreateResult => ({
  status,
  body: { error },
  retryAfter,
});

@Injectable()
export class BookingsService {
  constructor(private readonly db: DbService) {}

  /**
   * Everything happens in ONE transaction, and the database does the coordination:
   * 1. Idempotency: claiming the key is an INSERT on its primary key. A concurrent retry with the
   *    same key blocks on that row until we commit, then reads our stored response.
   * 2. Rate limit: a per-email advisory lock makes "count, then record" atomic.
   * 3. Double booking: a partial unique index allows one confirmed booking per slot.
   * Locks are always taken in that order, so transactions can't deadlock each other.
   */
  async create(body: unknown, idempotencyKey?: string): Promise<CreateResult> {
    return this.db.transaction(async (c) => {
      if (!idempotencyKey) return this.attempt(c, body);

      const requestHash = hashBody(body);
      const claimed = await c.query(
        `INSERT INTO idempotency_keys (key, request_hash, status_code, response)
         VALUES ($1, $2, 0, '{}') ON CONFLICT (key) DO NOTHING RETURNING key`,
        [idempotencyKey, requestHash],
      );

      if (claimed.rowCount === 0) {
        const { rows } = await c.query<{ request_hash: string; status_code: number; response: CreateResult['body'] }>(
          'SELECT request_hash, status_code, response FROM idempotency_keys WHERE key = $1',
          [idempotencyKey],
        );
        if (rows[0].request_hash !== requestHash) {
          return fail(422, 'Idempotency-Key was already used with a different request body');
        }
        return { status: rows[0].status_code, body: rows[0].response };
      }

      const result = await this.attempt(c, body);
      if (result.status === 429) {
        // Being throttled isn't a real outcome; free the key so the client can retry with it later.
        await c.query('DELETE FROM idempotency_keys WHERE key = $1', [idempotencyKey]);
      } else {
        await c.query('UPDATE idempotency_keys SET status_code = $2, response = $3 WHERE key = $1', [
          idempotencyKey,
          result.status,
          JSON.stringify(result.body),
        ]);
      }
      return result;
    });
  }

  private async attempt(c: PoolClient, body: unknown): Promise<CreateResult> {
    const email = rateLimitKey(body);
    if (email) {
      const retryAfter = await this.consumeRateLimit(c, email);
      if (retryAfter !== null) return fail(429, 'too many booking attempts, try again later', retryAfter);
    }

    const input = validateNewBooking(body);
    if (!input.ok) return fail(400, input.error);
    const { slot_id, name } = input.value;

    const slot = await c.query<{ started: boolean }>('SELECT starts_at <= now() AS started FROM slots WHERE id = $1', [
      slot_id,
    ]);
    if (slot.rowCount === 0) return fail(404, 'slot not found');
    if (slot.rows[0].started) return fail(400, 'slot has already started');

    const inserted = await c.query<Booking>(
      `INSERT INTO bookings (id, slot_id, name, email, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       ON CONFLICT (slot_id) WHERE status = 'confirmed' DO NOTHING
       RETURNING ${BOOKING_COLUMNS}`,
      [randomUUID(), slot_id, name, input.value.email],
    );
    if (inserted.rowCount === 0) return fail(409, 'slot is already booked');
    return { status: 201, body: inserted.rows[0] };
  }

  /** Sliding window: max 5 attempts per email in any 60s. Returns seconds to wait, or null if allowed (and records the attempt). */
  private async consumeRateLimit(c: PoolClient, email: string): Promise<number | null> {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email]);
    await c.query(
      `DELETE FROM booking_attempts WHERE email = $1 AND attempted_at <= clock_timestamp() - make_interval(secs => $2)`,
      [email, RATE_LIMIT.windowSeconds],
    );
    const { rows } = await c.query<{ count: number; wait: number | null }>(
      `SELECT count(*)::int AS count,
              EXTRACT(EPOCH FROM min(attempted_at) + make_interval(secs => $2) - clock_timestamp())::float AS wait
         FROM booking_attempts WHERE email = $1`,
      [email, RATE_LIMIT.windowSeconds],
    );
    if (rows[0].count >= RATE_LIMIT.max) return Math.max(1, Math.ceil(rows[0].wait ?? RATE_LIMIT.windowSeconds));

    await c.query('INSERT INTO booking_attempts (email) VALUES ($1)', [email]);
    return null;
  }

  async findOne(id: string): Promise<Booking> {
    const rows = await this.db.query<Booking>(`SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1`, [id]);
    if (rows.length === 0) throw new NotFoundException('booking not found');
    return rows[0];
  }

  /** Cancelling flips the status, which drops the row out of the partial unique index and frees the slot. */
  async cancel(id: string): Promise<Booking> {
    const rows = await this.db.query<Booking>(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND status = 'confirmed' RETURNING ${BOOKING_COLUMNS}`,
      [id],
    );
    if (rows.length > 0) return rows[0];
    await this.findOne(id); // throws 404 if it doesn't exist
    throw new ConflictException('booking is already cancelled');
  }

  async listByEmail(email: string, limit: number, cursor?: string) {
    const afterSeq = cursor === undefined ? '0' : decodeCursor(cursor);
    if (afterSeq === null) throw new BadRequestException('cursor is invalid');

    // Fetch one extra row to know whether another page exists.
    const rows = await this.db.query<Booking & { seq: string }>(
      `SELECT seq, ${BOOKING_COLUMNS} FROM bookings
        WHERE email = $1 AND seq > $2::bigint
        ORDER BY seq LIMIT $3`,
      [email, afterSeq, limit + 1],
    );
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      bookings: page.map(({ seq: _seq, ...booking }) => booking),
      next_cursor: hasMore ? encodeCursor(page[page.length - 1].seq) : null,
    };
  }
}
