'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatDateTime } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import { findOrgRole } from '@/lib/org';
import type { Inquiry, PaginationMeta } from '@/types';

const inquiryStatuses = ['NEW', 'CONTACTED', 'INTERESTED', 'CONVERTED', 'CLOSED', 'SPAM'];

export default function InquiriesPage() {
  const { activeOrg, organizations } = useAuth();
  const { error, success } = useToast();
  const role = findOrgRole(organizations, activeOrg?.id);
  const allowed = role === 'OWNER' || role === 'PROPERTY_MANAGER' || role === 'STAFF';

  const [items, setItems] = useState<Inquiry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      if (!activeOrg) return;
      setLoading(true);
      try {
        const d = await api.getList<Inquiry>(`/inquiries/organizations/${activeOrg.id}`, {
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

  const openInquiry = (inquiry: Inquiry) => {
    setSelected(inquiry);
    setStatus(inquiry.status);
  };

  const updateStatus = async () => {
    if (!activeOrg || !selected) return;
    setSaving(true);
    try {
      await api.patch(`/inquiries/organizations/${activeOrg.id}/${selected.id}/status`, {
        status,
      });
      success('Inquiry updated');
      setSelected(null);
      load(1);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-ink-500">
          Inquiries are available to Owners, Managers, and Staff.
        </p>
      </div>
    );
  }

  if (loading && items.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Inquiries" description="Leads from the public marketplace" />

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No inquiries yet"
          description="Prospective tenants who submit the marketplace contact form will appear here."
        />
      ) : (
        <>
          <DataTable<Inquiry>
            columns={[
              {
                key: 'name',
                header: 'Contact',
                render: (i) => (
                  <div>
                    <div className="font-medium text-ink-800">{i.name}</div>
                    <div className="text-xs text-ink-400">{i.email}</div>
                  </div>
                ),
              },
              {
                key: 'property',
                header: 'Property',
                render: (i) => (
                  <div className="text-ink-600">
                    {i.property?.name ?? '—'}
                    {i.unit ? ` · ${i.unit.unitNumber}` : ''}
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (i) => <StatusBadge status={i.status} />,
              },
              {
                key: 'createdAt',
                header: 'Received',
                render: (i) => <span className="text-ink-600">{formatDateTime(i.createdAt)}</span>,
              },
            ]}
            rows={items}
            keyField={(i) => i.id}
            onRowClick={openInquiry}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Inquiry'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSelected(null)}>
              Close
            </button>
            <button className="btn-primary" onClick={updateStatus} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="space-y-1">
              <p className="text-ink-500">
                {selected.email}
                {selected.phone ? ` · ${selected.phone}` : ''}
              </p>
              <p className="text-ink-700">
                {selected.property?.name ?? 'Property'}{' '}
                {selected.unit ? `· Unit ${selected.unit.unitNumber}` : ''}
              </p>
            </div>
            <div className="rounded-lg bg-ink-50/60 p-4 text-ink-700">{selected.message}</div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {inquiryStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <StatusBadge status={selected.status} />
          </div>
        )}
      </Modal>
    </div>
  );
}
