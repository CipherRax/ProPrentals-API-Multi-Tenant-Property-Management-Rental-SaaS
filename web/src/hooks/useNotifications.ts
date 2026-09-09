'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Notification } from '@/types';

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.notifications, page, limit],
    queryFn: () => api.getList<Notification>('/notifications/me', { page, limit }),
    staleTime: 15 * 1000,
  });
}

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: queryKeys.notificationUnread,
    queryFn: () =>
      api.get<{ unreadCount: number }>('/notifications/me/unread-count'),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    enabled: true,
  });
  return Number(data?.unreadCount ?? 0);
}
