import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { parseSlots, SlotsService } from './slots.service';

@Controller()
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Post('reset')
  @HttpCode(200)
  async reset(@Body() body: unknown) {
    const slots = parseSlots(body);
    await this.slots.reset(slots);
    return { ok: true, slots: slots.length };
  }

  @Get('slots')
  async list(@Query('provider') provider?: string) {
    return { slots: await this.slots.list(typeof provider === 'string' ? provider : undefined) };
  }
}
