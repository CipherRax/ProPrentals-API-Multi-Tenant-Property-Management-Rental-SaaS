import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UnitTypesService } from './unit-types.service';

/**
 * Background reconciliation for the stock model (spec priority: derive
 * vacancy from lease data, keep it accurate without manual counting).
 *  - Gives back expired soft holds so reserved slots are released even if
 *    no one reads the marketplace to trigger the lazy release.
 *  - Resyncs every AUTO-tracked type so cached total/vacant counts can
 *    never drift from the underlying unit/tenancy records (unit mutations
 *    resync inline too; this normalises anything missed).
 */
@Injectable()
export class UnitTypesReconcilerService {
  private readonly logger = new Logger(UnitTypesReconcilerService.name);

  constructor(private readonly unitTypes: UnitTypesService) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { timeZone: 'Africa/Nairobi' })
  async reconcile() {
    try {
      const released = await this.unitTypes.releaseExpiredHolds();
      const synced = await this.unitTypes.resyncAllAuto();
      if (released > 0 || synced.resynced > 0) {
        this.logger.log(
          `Stock reconcile complete: ${released} expired hold(s) released, ${synced.resynced} AUTO type(s) resynced`,
        );
      }
    } catch (err) {
      this.logger.error(`Stock reconcile failed: ${(err as Error).message}`);
    }
  }
}