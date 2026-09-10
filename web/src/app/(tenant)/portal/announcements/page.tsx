'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, Building2 } from 'lucide-react';
import { api, formatDate, titleCase, resolveAssetUrl } from '@/lib/api';
import { tenantQueryKeys } from '@/lib/tenant';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import type { MyAnnouncement } from '@/types/tenant';

export default function TenantAnnouncementsPage() {
  const [page, setPage] = useState(1);

  const listQ = useQuery({
    queryKey: [...tenantQueryKeys.announcements, { page }],
    queryFn: () => api.getList<MyAnnouncement>('/tenants/me/announcements', { page, limit: 10 }),
  });

  const announcements = listQ.data?.items ?? [];
  const meta = listQ.data?.meta;

  return (
    <div>
      <PageHeader title="Announcements" description="News and updates from your landlord" />

      {listQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : !announcements.length ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No announcements"
          description="When your landlord shares an update, it'll show up here."
        />
      ) : (
        <>
          <div className="space-y-3">
            {announcements.map((a) => (
              <article key={a.id} className="surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {resolveAssetUrl(a.organization.logoUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveAssetUrl(a.organization.logoUrl)}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <Building2 className="h-5 w-5 text-paper-300" />
                      )}
                      <span className="text-xs text-paper-400">{a.organization.name}</span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-paper-800">{a.title}</h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-paper-600">{a.message}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-paper-400">
                      {a.publishedAt ? formatDate(a.publishedAt) : '—'}
                    </div>
                    <div className="mt-1 text-xs text-paper-400">{titleCase(a.audience)}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pagination meta={meta} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}