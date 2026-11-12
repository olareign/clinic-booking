import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

export interface Slot {
  id: string;
  provider: string;
  start: string;
  end: string;
}

export interface SlotWithAvailability extends Slot {
  available: boolean;
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isDate = (v: string): boolean => !Number.isNaN(Date.parse(v));

/** Validates the /reset payload. Past slots are allowed on purpose (the spec uses them to test "already started"). */
export function parseSlots(body: unknown): Slot[] {
  const slots = (body as { slots?: unknown } | null)?.slots;
  if (!Array.isArray(slots)) throw new BadRequestException('slots must be an array');

  const seen = new Set<string>();
  return slots.map((raw: unknown, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    for (const field of ['id', 'provider', 'start', 'end'] as const) {
      if (!isNonEmptyString(s[field])) throw new BadRequestException(`slots[${i}].${field} is required`);
    }
    const slot = { id: s.id, provider: s.provider, start: s.start, end: s.end } as Slot;
    if (!isDate(slot.start) || !isDate(slot.end)) throw new BadRequestException(`slots[${i}] has an invalid date`);
    if (seen.has(slot.id)) throw new BadRequestException(`duplicate slot id: ${slot.id}`);
    seen.add(slot.id);
    return slot;
  });
}

@Injectable()
export class SlotsService {
  constructor(private readonly db: DbService) {}

  /** Wipes all bookings (and the state tied to them) and replaces every slot, in one transaction. */
  async reset(slots: Slot[]): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query('TRUNCATE bookings, idempotency_keys, booking_attempts, slots');
      if (slots.length === 0) return;
      // One round trip for any number of slots.
      await client.query(
        `INSERT INTO slots (id, provider, start_time, end_time, starts_at)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])`,
        [
          slots.map((s) => s.id),
          slots.map((s) => s.provider),
          slots.map((s) => s.start),
          slots.map((s) => s.end),
          slots.map((s) => s.start),
        ],
      );
    });
  }

  async list(provider?: string): Promise<SlotWithAvailability[]> {
    return this.db.query<SlotWithAvailability>(
      `SELECT s.id, s.provider, s.start_time AS start, s.end_time AS "end",
              NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed') AS available
         FROM slots s
        WHERE $1::text IS NULL OR s.provider = $1
        ORDER BY s.starts_at, s.id`,
      [provider ?? null],
    );
  }
}
