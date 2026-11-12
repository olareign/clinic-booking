import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../config';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Global guard: every route needs X-API-Key. Compares hashes in constant time so the key can't be guessed by timing. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.expected = digest(config.apiKey);
  }

  canActivate(context: ExecutionContext): boolean {
    const provided = context.switchToHttp().getRequest<Request>().header('x-api-key');
    if (!provided || !timingSafeEqual(digest(provided), this.expected)) {
      throw new UnauthorizedException('missing or invalid API key');
    }
    return true;
  }
}
