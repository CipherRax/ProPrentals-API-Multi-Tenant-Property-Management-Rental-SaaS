'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { PaginationMeta } from '@/lib/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  meta,
  onPageChange,
}: {
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!meta || meta.totalPages <= 1) return null;

  const go = (page: number) => {
    if (onPageChange) {
      onPageChange(page);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-paper-500">
      <span>
        Page {meta.page} of {meta.totalPages} · {meta.total} results
      </span>
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary px-2.5 py-1.5"
          disabled={meta.page <= 1}
          onClick={() => go(Math.max(1, meta.page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="btn-secondary px-2.5 py-1.5"
          disabled={meta.page >= meta.totalPages}
          onClick={() => go(Math.min(meta.totalPages, meta.page + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
