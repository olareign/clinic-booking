import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { normalizeEmail } from './booking.validation';
import { BookingsService } from './bookings.service';
import { parseLimit } from './cursor';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
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
  async list(@Query('email') email: unknown, @Query('limit') limit: unknown, @Query('cursor') cursor: unknown) {
    if (typeof email !== 'string' || email.trim() === '') throw new BadRequestException('email is required');
    const parsedLimit = parseLimit(limit);
    if (parsedLimit === null) throw new BadRequestException('limit must be a whole number from 1 to 50');
    if (cursor !== undefined && typeof cursor !== 'string') throw new BadRequestException('cursor is invalid');
    return this.bookings.listByEmail(normalizeEmail(email), parsedLimit, cursor || undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookings.findOne(id);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.bookings.cancel(id);
  }
}
