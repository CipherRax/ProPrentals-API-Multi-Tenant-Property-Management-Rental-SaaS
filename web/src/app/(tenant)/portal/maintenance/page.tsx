'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench, Eye } from 'lucide-react';
import { api, formatDateTime, titleCase } from '@/lib/api';
import { tenantQueryKeys, useTenantPrimary, type TenantPrimary } from '@/lib/tenant';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import type { MyMaintenanceRequest } from '@/types/tenant';
import type { MaintenanceCategory, MaintenancePriority } from '@/types';

const CATEGORIES: MaintenanceCategory[] = [
  'PLUMBING', 'ELECTRICAL', 'SECURITY', 'INTERNET', 'STRUCTURAL', 'CLEANING', 'APPLIANCE', 'OTHER',
];

const PRIORITIES: MaintenancePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function TenantMaintenancePage() {
  const primary = useTenantPrimary();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<MyMaintenanceRequest | null>(null);

  const listQ = useQuery({
    queryKey: [...tenantQueryKeys.maintenance, { page, status }],
    queryFn: () =>
      api.getList<MyMaintenanceRequest>('/tenants/me/maintenance', {
        page,
        limit: 10,
        status: status || undefined,
      }),
  });

  const requests = listQ.data?.items ?? [];
  const meta = listQ.data?.meta;

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Request repairs and track their progress"
        actions={
          <button
            className="btn-primary"
            disabled={!primary.tenancy}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New request
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="input w-auto py-1.5 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : !requests.length ? (
        <EmptyState
          icon={<Wrench className="h-10 w-10" />}
          title="No maintenance requests"
          description={status ? 'No requests match this status.' : 'Report a problem in your unit and it will appear here.'}
          action={
            !status && primary.tenancy ? (
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New request
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-50/60 text-xs uppercase tracking-wide text-paper-400">
                  <th className="px-5 py-2.5 font-medium">Request</th>
                  <th className="px-5 py-2.5 font-medium">Unit</th>
                  <th className="px-5 py-2.5 font-medium">Category</th>
                  <th className="px-5 py-2.5 font-medium">Priority</th>
                  <th className="px-5 py-2.5 font-medium">Opened</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-paper-100 last:border-0">
                    <td className="max-w-[240px] px-5 py-3">
                      <div className="truncate font-medium text-paper-800">{r.title}</div>
                      <div className="truncate text-xs text-paper-400">{r.description}</div>
                    </td>
                    <td className="px-5 py-3 text-paper-600">
                      {r.unit.property.name} · {r.unit.unitNumber}
                    </td>
                    <td className="px-5 py-3 text-paper-600">{titleCase(r.category)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.priority}>
                        {titleCase(r.priority)}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-paper-600">{formatDateTime(r.createdAt)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="rounded-md p-1.5 text-paper-400 hover:bg-paper-100 hover:text-paper-600"
                        onClick={() => setDetail(r)}
                        aria-label="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3">
            <Pagination meta={meta} onPageChange={setPage} />
          </div>
        </div>
      )}

      <CreateRequestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        primary={primary}
        onSubmit={async (payload) => {
          try {
            await api.post('/tenants/me/maintenance', payload);
            success('Maintenance request submitted.');
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: tenantQueryKeys.maintenance });
            queryClient.invalidateQueries({ queryKey: tenantQueryKeys.dashboard });
          } catch (err) {
            error(getErrorMessage(err));
          }
        }}
      />

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Request · ${detail.title}` : 'Request'}
        size="md"
      >
        {detail && (
          <div className="space-y-4">
            <p className="text-sm text-paper-600">{detail.description}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="Property" value={detail.unit.property.name} />
              <Field label="Unit" value={detail.unit.unitNumber} />
              <Field label="Category" value={titleCase(detail.category)} />
              <Field label="Priority" value={titleCase(detail.priority)} />
              <Field label="Status" value={titleCase(detail.status)} />
              <Field label="Opened" value={formatDateTime(detail.createdAt)} />
            </dl>
            {detail.status === 'RESOLVED' || detail.status === 'CLOSED' ? (
              <div className="rounded-panel border border-emerald-100 bg-emerald-50/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Resolution
                </p>
                <p className="mt-1 text-sm text-paper-700">{detail.resolution ?? 'Resolved.'}</p>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-paper-400">{label}</dt>
      <dd className="font-medium text-paper-800">{value}</dd>
    </div>
  );
}

function CreateRequestModal({
  open, onClose, primary, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  primary: TenantPrimary;
  onSubmit: (payload: {
    propertyId: string;
    unitId: string;
    title: string;
    description: string;
    category: MaintenanceCategory;
    priority: MaintenancePriority;
  }) => Promise<void>;
}) {
  const { success, error } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('PLUMBING');
  const [priority, setPriority] = useState<MaintenancePriority>('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  const tenancy = primary.tenancy;
  const unit = tenancy?.unit;

  const submit = async () => {
    if (!tenancy || !unit || !title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        propertyId: unit.propertyId,
        unitId: unit.id,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
      });
      setTitle('');
      setDescription('');
      setCategory('PLUMBING');
      setPriority('MEDIUM');
    } catch (err) {
      error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New maintenance request"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={submitting || !unit || !title.trim() || !description.trim()}
            onClick={submit}
          >
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </>
      }
    >
      {!tenancy ? (
        <p className="text-sm text-paper-500">An active tenancy is required to raise a request.</p>
      ) : (
        <div className="space-y-4">
          <p className="rounded-panel border border-paper-100 bg-paper-50/60 px-4 py-3 text-sm text-paper-600">
            This request will be logged against your unit{' '}
            <span className="font-medium text-paper-800">{unit?.unitNumber}</span>.
          </p>
          <div>
            <label className="label" htmlFor="mt-title">Title</label>
            <input
              id="mt-title"
              className="input"
              maxLength={200}
              placeholder="e.g. Leaking kitchen tap"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="mt-desc">Description</label>
            <textarea
              id="mt-desc"
              className="input min-h-24"
              maxLength={5000}
              placeholder="Describe the problem in as much detail as you can…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="mt-cat">Category</label>
              <select
                id="mt-cat"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {titleCase(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mt-priority">Priority</label>
              <select
                id="mt-priority"
                className="input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}