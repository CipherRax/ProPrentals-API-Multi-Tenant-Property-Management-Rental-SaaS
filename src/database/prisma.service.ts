import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Prisma on Neon/PgBouncer-style hosted Postgres needs a generous
// interactive-transaction timeout — the default 5s is too tight and
// causes spurious transaction failures under normal latency.
const INTERACTIVE_TX_TIMEOUT_MS = 15_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      transactionOptions: {
        timeout: INTERACTIVE_TX_TIMEOUT_MS,
        maxWait: 5_000,
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
