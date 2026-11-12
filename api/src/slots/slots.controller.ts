import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ErrorSchema, ResetBodySchema, ResetResultSchema, SlotListSchema } from '../docs/schemas';
import { parseSlots, SlotsService } from './slots.service';

@ApiTags('default')
@ApiUnauthorizedResponse({ description: 'Missing or wrong X-API-Key (level 2)', type: ErrorSchema })
@Controller()
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Level 1 · Replace all slots',
    description: 'Deletes every booking and replaces all slots with the ones you send, including slots in the past.',
  })
  @ApiBody({ type: ResetBodySchema })
  @ApiOkResponse({ description: 'Done', type: ResetResultSchema })
  @ApiBadRequestResponse({ description: 'Malformed slots payload', type: ErrorSchema })
  async reset(@Body() body: unknown) {
    const slots = parseSlots(body);
    await this.slots.reset(slots);
    return { ok: true, slots: slots.length };
  }

  @Get('slots')
  @ApiOperation({ summary: 'Level 1 · List slots', description: 'Every slot, earliest `start` first.' })
  @ApiQuery({ name: 'provider', required: false, description: "Only this provider's slots (exact match)" })
  @ApiOkResponse({ description: 'The slots', type: SlotListSchema })
  async list(@Query('provider') provider?: string) {
    return { slots: await this.slots.list(typeof provider === 'string' ? provider : undefined) };
  }
}
