'use client';

import { useCallback, useEffect, useState } from 'react';
import { ReceiptText, Download } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney, formatDateTime } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/lib/toast';
import type { Receipt, PaginationMeta } from '@/types';

export default function ReceiptsPage() {
  const { activeOrg } = useAuth();
  const { error } = useToast();

  const [items, setItems] = useState<Receipt[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (page = 1) => {
      if (!activeOrg) return;
      setLoading(true);
      try {
        const d = await api.getList<Receipt>(`/organizations/${activeOrg.id}/receipts`, {
          page,
          limit: 20,
        });
        setItems(d.items);
        setMeta(d.meta);
      } catch (e) {
        error(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [activeOrg, error],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const downloadPdf = async (receiptId: string) => {
    if (!activeOrg) return;
    try {
      const blob = await api.get<Blob>(`/organizations/${activeOrg.id}/receipts/${receiptId}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${receiptId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  if (loading && items.length === 0) return <PageLoader />;

  const currency = activeOrg?.currency ?? 'KES';

  return (
    <div>
      <PageHeader title="Receipts" description="Payment receipts verified for your tenants" />

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<ReceiptText className="h-8 w-8" />}
          title="No receipts generated"
          description="Receipts appear here automatically when payments are confirmed."
        />
      ) : (
        <>
          <DataTable<Receipt>
            columns={[
              {
                key: 'receiptNumber',
                header: 'Receipt',
                render: (r) => <span className="font-medium text-ink-800">{r.receiptNumber}</span>,
              },
              {
                key: 'tenant',
                header: 'Tenant',
                render: (r) => (
                  <div>
                    <div className="text-ink-800">{r.tenancy?.tenant?.fullName || '—'}</div>
                    <div className="text-xs text-ink-400">
                      Unit {r.tenancy?.unit?.unitNumber || '—'}
                    </div>
                  </div>
                ),
              },
              {
                key: 'amount',
                header: 'Amount',
                render: (r) => (
                  <span className="font-medium text-ink-800">
                    {formatMoney(r.amount, currency)}
                  </span>
                ),
              },
              {
                key: 'issuedAt',
                header: 'Issued',
                render: (r) => <span className="text-ink-600">{formatDateTime(r.issuedAt)}</span>,
              },
              {
                key: 'actions',
                header: '',
                className: 'text-right',
                render: (r) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadPdf(r.id);
                    }}
                    className="btn-ghost text-xs"
                  >
                    <Download className="mr-1 inline h-3.5 w-3.5" /> PDF
                  </button>
                ),
              },
            ]}
            rows={items}
            keyField={(r) => r.id}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}
    </div>
  );
}
