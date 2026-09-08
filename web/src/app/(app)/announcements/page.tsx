'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Megaphone } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatDateTime } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import { findOrgRole } from '@/lib/org';
import type { Announcement, PaginationMeta } from '@/types';

const audiences = ['ALL_TENANTS', 'PROPERTY', 'BUILDING', 'UNITS', 'TENANTS'];

export default function AnnouncementsPage() {
  const { activeOrg, organizations } = useAuth();
  const { error, success } = useToast();
  const role = findOrgRole(organizations, activeOrg?.id);
  const canPost = role === 'OWNER' || role === 'PROPERTY_MANAGER';

  const [items, setItems] = useState<Announcement[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    audience: 'ALL_TENANTS',
    scheduledAt: '',
    expiresAt: '',
  });

  const load = useCallback(
    async (page = 1) => {
      if (!activeOrg) return;
      setLoading(true);
      try {
        const d = await api.getList<Announcement>(`/organizations/${activeOrg.id}/announcements`, {
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

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const create = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/announcements`, {
        ...form,
        scheduledAt: form.scheduledAt || undefined,
        expiresAt: form.expiresAt || undefined,
      });
      success('Announcement published');
      setCreateOpen(false);
      setForm({ title: '', message: '', audience: 'ALL_TENANTS', scheduledAt: '', expiresAt: '' });
      load(1);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && items.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Broadcast updates to your tenants"
        actions={
          canPost ? (
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New announcement
            </button>
          ) : undefined
        }
      />

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="No announcements"
          description="Create announcements to update your tenants."
        />
      ) : (
        <>
          <DataTable<Announcement>
            columns={[
              {
                key: 'title',
                header: 'Announcement',
                render: (a) => (
                  <div>
                    <div className="font-medium text-ink-800">{a.title}</div>
                    <div className="line-clamp-1 max-w-md text-xs text-ink-400">{a.message}</div>
                  </div>
                ),
              },
              {
                key: 'audience',
                header: 'Audience',
                render: (a) => (
                  <span className="text-ink-600">
                    {a.audience.toLowerCase().replace(/_/g, ' ')}
                  </span>
                ),
              },
              {
                key: 'createdAt',
                header: 'Created',
                render: (a) => <span className="text-ink-600">{formatDateTime(a.createdAt)}</span>,
              },
            ]}
            rows={items}
            keyField={(a) => a.id}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New announcement"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={create}
              disabled={saving || !form.title || !form.message}
            >
              {saving ? 'Publishing…' : 'Publish'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Message *</label>
            <textarea
              className="input h-28"
              value={form.message}
              onChange={(e) => update('message', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Audience</label>
            <select
              className="input"
              value={form.audience}
              onChange={(e) => update('audience', e.target.value)}
            >
              {audiences.map((a) => (
                <option key={a} value={a}>
                  {a.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Send at (optional)</label>
              <input
                type="datetime-local"
                className="input"
                value={form.scheduledAt}
                onChange={(e) => update('scheduledAt', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Expires (optional)</label>
              <input
                type="datetime-local"
                className="input"
                value={form.expiresAt}
                onChange={(e) => update('expiresAt', e.target.value)}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
