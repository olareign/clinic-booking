import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { BookingPageSchema, BookingSchema, ErrorSchema, NewBookingSchema } from '../docs/schemas';
import { API_KEY_HEADER_DOC } from '../docs/swagger';
import { normalizeEmail } from './booking.validation';
import { BookingsService } from './bookings.service';
import { parseLimit } from './cursor';

@ApiTags('default')
@ApiHeader(API_KEY_HEADER_DOC)
@ApiUnauthorizedResponse({ description: 'Missing or wrong X-API-Key (level 2)', type: ErrorSchema })
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Book a slot (levels 1–5)',
    description:
      '**Level 1:** 201 with the booking, status `confirmed`.\n\n' +
      '**Level 2:** 400 if `slot_id`, `name` or `email` is missing, empty or invalid; 404 if the slot doesn’t exist; ' +
      '400 if the slot has already started. Name and email are trimmed; email is stored lower-case.\n\n' +
      '**Level 3:** 409 if the slot already has a confirmed booking, even under concurrent requests.\n\n' +
      '**Level 4:** same `Idempotency-Key` + same body replays the same response; same key + different body is 422.\n\n' +
      '**Level 5:** at most 5 attempts per email per minute (failures included); the 6th is 429 with `Retry-After`.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Level 4' })
  @ApiBody({ type: NewBookingSchema })
  @ApiCreatedResponse({ description: 'Booked', type: BookingSchema })
  @ApiBadRequestResponse({ description: 'Missing or invalid field, or the slot has already started (level 2)', type: ErrorSchema })
  @ApiNotFoundResponse({ description: "The slot doesn't exist (level 2)", type: ErrorSchema })
  @ApiConflictResponse({ description: 'Slot already booked (level 3)', type: ErrorSchema })
  @ApiResponse({ status: 422, description: 'Idempotency-Key reused with a different body (level 4)', type: ErrorSchema })
  @ApiTooManyRequestsResponse({
    description: 'Too many attempts for this email (level 5)',
    type: ErrorSchema,
    headers: { 'Retry-After': { description: 'Seconds to wait', schema: { type: 'integer' } } },
  })
  async create(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = idempotencyKey?.trim() || undefined;
    if (key && key.length > 255) throw new BadRequestException('Idempotency-Key is too long');

    const result = await this.bookings.create(body, key);
    res.status(result.status);
    if (result.retryAfter !== undefined) res.setHeader('Retry-After', String(result.retryAfter));
    return result.body;
  }

  @Get()
  @ApiOperation({
    summary: "Level 4 · List a person's bookings",
    description:
      "That person's bookings, oldest first. The email match ignores case. Pass `next_cursor` back as `cursor` " +
      'to get the next page; the last page has `next_cursor: null`.',
  })
  @ApiQuery({ name: 'email', required: true })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 }, description: '1 to 50. Anything else returns 400.' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({ description: 'A page of bookings', type: BookingPageSchema })
  @ApiBadRequestResponse({ description: 'Invalid limit (or missing email / bad cursor)', type: ErrorSchema })
  async list(@Query('email') email: unknown, @Query('limit') limit: unknown, @Query('cursor') cursor: unknown) {
    if (typeof email !== 'string' || email.trim() === '') throw new BadRequestException('email is required');
    const parsedLimit = parseLimit(limit);
    if (parsedLimit === null) throw new BadRequestException('limit must be a whole number from 1 to 50');
    if (cursor !== undefined && typeof cursor !== 'string') throw new BadRequestException('cursor is invalid');
    return this.bookings.listByEmail(normalizeEmail(email), parsedLimit, cursor || undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Level 1 · Get a booking' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'The booking', type: BookingSchema })
  @ApiNotFoundResponse({ description: 'No booking with that id', type: ErrorSchema })
  findOne(@Param('id') id: string) {
    return this.bookings.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Level 3 · Cancel a booking', description: 'Sets `status` to `cancelled` and frees the slot.' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'The cancelled booking', type: BookingSchema })
  @ApiNotFoundResponse({ description: 'No booking with that id', type: ErrorSchema })
  @ApiConflictResponse({ description: 'Already cancelled', type: ErrorSchema })
  cancel(@Param('id') id: string) {
    return this.bookings.cancel(id);
  }
}
