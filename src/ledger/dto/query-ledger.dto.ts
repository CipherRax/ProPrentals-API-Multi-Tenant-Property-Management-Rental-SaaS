import { ApiPropertyOptional } from '@nestjs/swagger';
<<<<<<< HEAD
import { IsDateString, IsOptional } from 'class-validator';

export class QueryLedgerDto {
  @ApiPropertyOptional({ description: 'ISO date — defaults to the tenancy start date' })
=======
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum StatementPeriod {
  CURRENT_MONTH = 'CURRENT_MONTH',
  PREVIOUS_MONTH = 'PREVIOUS_MONTH',
  CURRENT_YEAR = 'CURRENT_YEAR',
  CUSTOM = 'CUSTOM',
}

export class QueryLedgerDto {
  @ApiPropertyOptional({
    enum: StatementPeriod,
    description: 'Convenience shortcut (spec §21). Ignored if from/to are both provided.',
  })
  @IsOptional()
  @IsEnum(StatementPeriod)
  period?: StatementPeriod;

  @ApiPropertyOptional({ description: 'ISO date — defaults to the tenancy start date, or the resolved period start' })
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
  @IsOptional()
  @IsDateString()
  from?: string;

<<<<<<< HEAD
  @ApiPropertyOptional({ description: 'ISO date — defaults to now' })
=======
  @ApiPropertyOptional({ description: 'ISO date — defaults to now, or the resolved period end' })
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
  @IsOptional()
  @IsDateString()
  to?: string;
}
<<<<<<< HEAD
=======

/**
 * Resolves the `period` shortcut into concrete from/to dates. Explicit
 * from/to always win over `period` if both are somehow supplied.
 */
export function resolvePeriod(query: QueryLedgerDto): { from?: string; to?: string } {
  if (query.from || query.to) return { from: query.from, to: query.to };
  if (!query.period || query.period === StatementPeriod.CUSTOM) return {};

  const now = new Date();
  if (query.period === StatementPeriod.CURRENT_MONTH) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString() };
  }
  if (query.period === StatementPeriod.PREVIOUS_MONTH) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (query.period === StatementPeriod.CURRENT_YEAR) {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: from.toISOString() };
  }
  return {};
}
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
