import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';

import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { parseRedisUrl } from './common/utils/redis-url.util';

import { PrismaModule } from './database/prisma.module';
import { CommonUtilsModule } from './common/utils/common-utils.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

import { AuthModule } from './auth/auth.module';
import { JwtAccessGuard } from './auth/guards/jwt-access.guard';
import { OrgRolesGuard } from './auth/guards/org-roles.guard';

import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { HealthModule } from './health/health.module';
import { PropertiesModule } from './properties/properties.module';
import { BuildingsModule } from './buildings/buildings.module';
import { UnitsModule } from './units/units.module';
import { TenantsModule } from './tenants/tenants.module';
import { TenanciesModule } from './tenancies/tenancies.module';
import { TenantInvitationsModule } from './tenant-invitations/tenant-invitations.module';
import { RentConfigurationsModule } from './rent-configurations/rent-configurations.module';
import { RentChargesModule } from './rent-charges/rent-charges.module';
import { RentJobsModule } from './rent-jobs/rent-jobs.module';
import { LedgerModule } from './ledger/ledger.module';
<<<<<<< HEAD
=======
import { PaymentsModule } from './payments/payments.module';
import { MpesaModule } from './mpesa/mpesa.module';
import { PaymentJobsModule } from './payment-jobs/payment-jobs.module';
import { PdfModule } from './pdf/pdf.module';
import { ReceiptsModule } from './receipts/receipts.module';
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100, // global default ceiling; sensitive endpoints set tighter @Throttle overrides
      },
    ]),
    ScheduleModule.forRoot(), // triggers cron jobs, which enqueue BullMQ jobs (rent generation from Phase 4 onward)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.get<string>('redis.url') || 'redis://localhost:6379'),
      }),
    }),
    PrismaModule,
    CommonUtilsModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    PropertiesModule,
    BuildingsModule,
    UnitsModule,
    TenantsModule,
    TenanciesModule,
    TenantInvitationsModule,
    RentConfigurationsModule,
    RentChargesModule,
    RentJobsModule,
    LedgerModule,
<<<<<<< HEAD
=======
    PaymentsModule,
    MpesaModule,
    PaymentJobsModule,
    PdfModule,
    ReceiptsModule,
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
    HealthModule,
  ],
  providers: [
    // Global request pipeline, applied in order: exception handling,
    // response envelope, request-id tagging.
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },

    // Global auth pipeline: rate limiting → JWT verification (opt-out via
    // @Public()) → org-role RBAC (opt-in via @OrgRoles()).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAccessGuard },
    { provide: APP_GUARD, useClass: OrgRolesGuard },
  ],
})
export class AppModule {}
