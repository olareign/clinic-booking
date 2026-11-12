import { ApiProperty } from '@nestjs/swagger';

/*
 * Response/request shapes for the Swagger docs only. They mirror the spec's schemas
 * (koyaacademy.com/assessment-api) so the two can be compared side by side.
 * Runtime validation lives in booking.validation.ts and slots.service.ts.
 */

export class SlotSchema {
  @ApiProperty({ example: 's1' }) id!: string;
  @ApiProperty({ example: 'Dr Ade' }) provider!: string;
  @ApiProperty({ format: 'date-time', example: '2026-12-10T09:00:00Z' }) start!: string;
  @ApiProperty({ format: 'date-time', example: '2026-12-10T09:30:00Z' }) end!: string;
}

export class SlotWithAvailabilitySchema extends SlotSchema {
  @ApiProperty({ description: 'false while the slot has a confirmed booking' }) available!: boolean;
}

export class SlotListSchema {
  @ApiProperty({ type: [SlotWithAvailabilitySchema] }) slots!: SlotWithAvailabilitySchema[];
}

export class ResetBodySchema {
  @ApiProperty({ type: [SlotSchema] }) slots!: SlotSchema[];
}

export class ResetResultSchema {
  @ApiProperty({ example: true }) ok!: boolean;
  @ApiProperty({ example: 3, description: 'How many slots were stored' }) slots!: number;
}

export class NewBookingSchema {
  @ApiProperty({ example: 's1', description: 'A real slot `id` from GET /slots' }) slot_id!: string;
  @ApiProperty({ example: 'Ada Obi' }) name!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
}

export class BookingSchema {
  @ApiProperty({ example: '473ba332-4e1d-43df-86fc-6af49c3df5bc', description: 'Unique id (UUID)' }) id!: string;
  @ApiProperty({ example: 's1' }) slot_id!: string;
  @ApiProperty({ example: 'Ada Obi' }) name!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiProperty({ enum: ['confirmed', 'cancelled'] }) status!: 'confirmed' | 'cancelled';
  @ApiProperty({ format: 'date-time' }) created_at!: string;
}

export class BookingPageSchema {
  @ApiProperty({ type: [BookingSchema] }) bookings!: BookingSchema[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass back as `cursor`; null on the last page' })
  next_cursor!: string | null;
}

export class ErrorSchema {
  @ApiProperty({ example: 'slot not found' }) error!: string;
}
