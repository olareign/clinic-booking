import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BookingsModule } from './bookings/bookings.module';
import { ApiKeyGuard } from './common/api-key.guard';
import { APP_CONFIG, AppConfig } from './config';
import { DbModule } from './db/db.module';
import { SlotsModule } from './slots/slots.module';

@Module({})
export class AppModule {
  /** Config is passed in (not read inside), so tests can boot the app against a throwaway database. */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [DbModule, SlotsModule, BookingsModule],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
      ],
      exports: [APP_CONFIG],
    };
  }
}
