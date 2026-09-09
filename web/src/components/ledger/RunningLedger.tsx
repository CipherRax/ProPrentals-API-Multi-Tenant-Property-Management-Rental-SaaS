'use client';

import { cn } from '@/lib/utils';
import { formatDateTime, formatMoney, titleCase } from '@/lib/api';
import type { LedgerEntry, LedgerEntryDirection } from '@/types';

interface Row extends LedgerEntry {
  entryDate: string;
}

/**
 * A real running statement: each charge/payment/credit/debit row carries a
 * running balance column so a landlord or tenant can answer "why do I owe this?"
 */
export function RunningLedger({
  rows,
  currency = 'KES',
  emptyMessage = 'No ledger entries yet.',
}: {
  rows: Row[];
  currency?: string;
  emptyMessage?: string;
}) {
  if (!rows.length) {
    return (
      <div className="surface px-6 py-12 text-center text-sm text-paper-400">
        {emptyMessage}
      </div>
    );
  }

  let running = 0;

  return (
    <div className="surface overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-paper-200 bg-paper-50">
            <th className="th">Date</th>
            <th className="th">Description</th>
            <th className="th hidden sm:table-cell">Type</th>
            <th className="th text-right">Debit (owed)</th>
            <th className="th text-right">Credit (paid)</th>
            <th className="th text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            running += row.direction === 'DEBIT' ? Number(row.amount) : -Number(row.amount);
            return (
              <tr key={row.id} className="border-t border-paper-100 hover:bg-paper-50">
                <td className="td whitespace-nowrap text-paper-500">
                  {formatDateTime(row.entryDate || row.createdAt)}
                </td>
                <td className="td font-medium text-paper-800">
                  {row.description || titleCase(row.type)}
                </td>
                <td className="td hidden sm:table-cell">
                  <EntryTypeChip direction={row.direction} type={row.type} />
                </td>
                <td className={cn('td text-right tabular-nums', row.direction === 'DEBIT' ? 'text-paper-800' : 'text-paper-400')}>
                  {row.direction === 'DEBIT' ? formatMoney(row.amount, currency) : '—'}
                </td>
                <td className={cn('td text-right tabular-nums', row.direction === 'CREDIT' ? 'text-emerald-700' : 'text-paper-400')}>
                  {row.direction === 'CREDIT' ? formatMoney(row.amount, currency) : '—'}
                </td>
                <td className={cn('td text-right font-semibold tabular-nums', running < 0 ? 'text-emerald-700' : running > 0 ? 'text-paper-900' : 'text-paper-500')}>
                  {formatMoney(running, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EntryTypeChip({ direction, type }: { direction: LedgerEntryDirection; type: string }) {
  const debit = direction === 'DEBIT';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium',
        debit ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
      )}
    >
      {debit ? 'Charge' : 'Credit'}
    </span>
  );
}
