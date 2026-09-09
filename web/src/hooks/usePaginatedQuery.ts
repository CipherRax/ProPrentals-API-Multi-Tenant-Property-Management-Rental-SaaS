'use client';

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaginationMeta } from '@/types';

export interface PaginatedResult<T> {
  items: T[];
  meta?: PaginationMeta;
}

/**
 * A thin wrapper around TanStack Query that fetches a paginated list and
 * keeps the previous page's data visible while the next page loads.
 * Every table view uses this so we never fetch-everything-and-slice.
 */
export function usePaginatedQuery<T>(
  queryKey: unknown[],
  path: string,
  query: Record<string, unknown>,
  enabled = true,
): UseQueryResult<PaginatedResult<T>, Error> & { items: T[]; meta?: PaginationMeta } {
  const result = useQuery<PaginatedResult<T>>({
    queryKey,
    queryFn: () => api.getList<T>(path, query),
    placeholderData: keepPreviousData,
    enabled,
  });

  const items = result.data?.items ?? [];
  const meta = result.data?.meta;

  return { ...result, items, meta } as never;
}
