'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, ReceiptText } from 'lucide-react';
import { api, formatMoney, formatDateTime, titleCase } from '@/lib/api';
import { tenantQueryKeys, openPdf } from '@/lib/tenant';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { TenantReceipt } from '@/types/tenant';

export default function TenantReceiptsPage() {
  const { error: toastError } = useToast();
  const receiptsQ = useQuery({
    queryKey: tenantQueryKeys.receipts,
    queryFn: () => api.get<TenantReceipt[]>('/tenants/me/receipts'),
  });

  const receipts = Array.isArray(receiptsQ.data) ? receiptsQ.data : [];

  const download = async (receiptId: string) => {
    try {
      await openPdf(`/tenants/me/receipts/${receiptId}/pdf`);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader title="Receipts" description="Receipts for all the payments you've made" />

      {receiptsQ.isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : !receipts.length ? (
        <EmptyState
          icon={<ReceiptText className="h-10 w-10" />}
          title="No receipts yet"
          description="Once a payment is confirmed, your receipt will show up here."
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-50/60 text-xs uppercase tracking-wide text-paper-400">
                  <th className="px-5 py-2.5 font-medium">Receipt no.</th>
                  <th className="px-5 py-2.5 font-medium">Issued</th>
                  <th className="px-5 py-2.5 font-medium">Method</th>
                  <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-2.5 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="border-b border-paper-100 last:border-0">
                    <td className="px-5 py-3 font-medium text-paper-800">{r.receiptNumber}</td>
                    <td className="px-5 py-3 text-paper-600">{formatDateTime(r.issuedAt)}</td>
                    <td className="px-5 py-3 text-paper-600">
                      {r.payment ? titleCase(r.payment.method) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-paper-800">
                      {formatMoney(r.amount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="btn-secondary px-2.5 py-1.5"
                        onClick={() => download(r.id)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}