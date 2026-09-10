'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { api, formatDateTime, titleCase } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/lib/toast';
import { useAuth, getErrorMessage } from '@/lib/auth';
import type { Notification, NotificationPreference, PaginationMeta } from '@/types';

export default function NotificationsPage() {
  const { error, success } = useToast();
  const { user } = useAuth();

  const [items, setItems] = useState<Notification[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const d = await api.getList<Notification>('/notifications/me', { page, limit: 20 });
        setItems(d.items);
        setMeta(d.meta);
      } catch (e) {
        error(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [error],
  );

  const loadPrefs = useCallback(async () => {
    try {
      const d = await api.get<NotificationPreference[]>('/notifications/me/preferences');
      setPrefs(d);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    load(1);
    loadPrefs();
  }, [load, loadPrefs]);

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/me/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/me/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      success('All notifications marked as read');
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  const togglePref = async (
    p: NotificationPreference,
    field: 'inAppEnabled' | 'emailEnabled' | 'smsEnabled',
    value: boolean,
  ) => {
    try {
      await api.patch('/notifications/me/preferences', {
        category: p.category,
        [field]: value,
      });
      setPrefs((prev) => prev.map((x) => (x.category === p.category ? { ...x, [field]: value } : x)));
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  if (loading && items.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`Notifications for ${user?.email ?? 'your account'}`}
        actions={
          items.some((n) => !n.read) ? (
            <button className="btn-secondary" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          {items.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="You're all caught up"
              description="New notifications about rent, payments, and messages will appear here."
            />
          ) : (
            <div className="surface divide-y divide-paper-100">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-paper-50/60 ${
                    !n.read ? 'bg-brand-50/30' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.read ? 'bg-paper-200' : 'bg-brand-600'
                    }`}
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-paper-800">{n.title}</span>
                    {n.message && (
                      <span className="mt-0.5 block text-sm text-paper-500">{n.message}</span>
                    )}
                    <span className="mt-1 block text-xs text-paper-400">
                      {titleCase(n.category)} · {formatDateTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-paper-800">Notification preferences</h2>
          <div className="surface divide-y divide-paper-100">
            {prefs.map((p) => (
              <div key={p.category} className="px-5 py-3">
                <div className="text-sm font-medium capitalize text-paper-700">
                  {p.category.toLowerCase().replace(/_/g, ' ')}
                </div>
                <div className="mt-1 space-y-1">
                  {(['inAppEnabled', 'emailEnabled', 'smsEnabled'] as const).map((field) => (
                    <label
                      key={field}
                      className="flex items-center justify-between text-xs text-paper-500"
                    >
                      <span className="capitalize">
                        {field
                          .replace('Enabled', '')
                          .replace(/([A-Z])/g, ' $1')
                          .toLowerCase()}
                      </span>
                      <input
                        type="checkbox"
                        checked={p[field]}
                        onChange={(e) => togglePref(p, field, e.target.checked)}
                        className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
