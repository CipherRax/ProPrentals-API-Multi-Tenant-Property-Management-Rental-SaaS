'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Building2, Paperclip } from 'lucide-react';
import { api, resolveAssetUrl } from '@/lib/api';
import { tenantQueryKeys, useTenantPrimary } from '@/lib/tenant';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { MyConversation, MyMessage } from '@/types/tenant';

export default function TenantMessagesPage() {
  const primary = useTenantPrimary();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversationsQ = useQuery({
    queryKey: tenantQueryKeys.conversations,
    queryFn: () => api.get<MyConversation[]>('/tenants/me/conversations'),
  });

  const conversations = Array.isArray(conversationsQ.data) ? conversationsQ.data : [];

  useEffect(() => {
    if (activeId == null && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const messagesQ = useQuery({
    queryKey: tenantQueryKeys.messages(activeId ?? 'none'),
    queryFn: () =>
      api.getList<MyMessage>(
        `/tenants/me/conversations/${activeId}/messages`,
        { page: 1, limit: 50, sortOrder: 'asc' },
      ),
    enabled: Boolean(activeId),
  });

  const messages = messagesQ.data?.items ?? [];

  useEffect(() => {
    const el = bottomRef.current;
    if (el) el.scrollIntoView({ block: 'end' });
  }, [messages.length, activeId]);

  const readMutation = useMutation({
    mutationFn: (conversationId: string) =>
      api.patch(`/tenants/me/conversations/${conversationId}/read`),
  });

  const sendMutation = useMutation({
    mutationFn: ({ conversationId, body }: { conversationId: string; body: string }) =>
      api.post<MyMessage>(`/tenants/me/conversations/${conversationId}/messages`, { body }),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.messages(activeId!) });
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.conversations });
    },
    onError: (err) => error(getErrorMessage(err)),
  });

  const startMutation = useMutation({
    mutationFn: (organizationId: string) =>
      api.post<MyConversation>('/tenants/me/conversations', { organizationId }),
    onSuccess: (conversation) => {
      success('Conversation started.');
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.conversations });
      setActiveId(conversation.id);
    },
    onError: (err) => error(getErrorMessage(err)),
  });

  const selectConversation = (id: string) => {
    setActiveId(id);
    readMutation.mutate(id);
  };

  const primaryOrgId = primary.profile?.organizationId ?? null;

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Chat with your landlord or property managers"
        actions={
          primaryOrgId ? (
            <button
              className="btn-primary"
              disabled={startMutation.isPending || !active}
              onClick={() => startMutation.mutate(primaryOrgId)}
            >
              {startMutation.isPending ? <Spinner className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              Start a conversation
            </button>
          ) : undefined
        }
      />

      {!primaryOrgId ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" />}
          title="No tenancy yet"
          description="Messaging will be available once your tenancy is active."
        />
      ) : conversationsQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          <div className="surface overflow-hidden">
            <div className="border-b border-paper-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-paper-800">Conversations</h2>
            </div>
            {!conversations.length ? (
              <div className="px-4 py-10 text-center text-sm text-paper-400">
                No conversations yet.
                <button
                  className="mx-auto mt-3 block btn-primary"
                  disabled={startMutation.isPending}
                  onClick={() => primaryOrgId && startMutation.mutate(primaryOrgId)}
                >
                  Message your landlord
                </button>
              </div>
            ) : (
              <div className="divide-y divide-paper-100">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectConversation(c.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      c.id === activeId ? 'bg-brand-50/60' : 'hover:bg-paper-50',
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700/10 text-brand-800">
                      {resolveAssetUrl(c.organization.logoUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveAssetUrl(c.organization.logoUrl)}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <Building2 className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-paper-800">
                          {c.organization.name}
                        </span>
                        <span className="shrink-0 text-xs text-paper-400">
                          {c.messages[0] ? formatTime(c.messages[0].createdAt) : ''}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-paper-500">
                        {c.messages[0]?.body ?? 'No messages yet'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="surface flex flex-col overflow-hidden">
            {!active ? (
              <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-sm text-paper-400">
                Select a conversation to view messages.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-paper-200 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700/10 text-brand-800">
                    {resolveAssetUrl(active.organization.logoUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveAssetUrl(active.organization.logoUrl)}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-paper-800">
                      {active.organization.name}
                    </div>
                    <div className="text-xs text-paper-400">Landlord team</div>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5" style={{ minHeight: 320 }}>
                  {messagesQ.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : !messages.length ? (
                    <div className="flex h-full items-center justify-center text-sm text-paper-400">
                      No messages yet — say hello below.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <Bubble
                        key={m.id}
                        message={m}
                        fallbackAvatar={active.organization.logoUrl}
                      />
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>

                <form
                  className="flex items-center gap-2 border-t border-paper-200 px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim() && !sendMutation.isPending) {
                      sendMutation.mutate({ conversationId: active.id, body: draft.trim() });
                    }
                  }}
                >
                  <Paperclip className="hidden h-4 w-4 text-paper-300 sm:block" />
                  <input
                    className="input"
                    placeholder="Type a message…"
                    value={draft}
                    maxLength={4000}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn-primary px-3"
                    disabled={!draft.trim() || sendMutation.isPending}
                    aria-label="Send message"
                  >
                    {sendMutation.isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ message, fallbackAvatar }: { message: MyMessage; fallbackAvatar?: string | null }) {
  const { user } = useAuth();
  const mine = message.senderUserId === user?.id;
  const senderName = mine
    ? `${user?.firstName ?? 'You'} ${user?.lastName ?? ''}`
    : message.sender
      ? `${message.sender.firstName} ${message.sender.lastName}`
      : 'Landlord team';
  const avatarUrl = resolveAssetUrl(message.sender?.avatarUrl ?? fallbackAvatar);

  return (
    <div className={cn('flex items-end gap-2', mine && 'justify-end')}>
      {!mine && (
        <div className="shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700/10 text-xs font-semibold text-brand-800">
              {initials(senderName)}
            </div>
          )}
        </div>
      )}
      <div className={cn('flex max-w-[80%] flex-col', mine && 'items-end')}>
        <span
          className={cn(
            'mb-0.5 px-1 text-[11px] font-medium',
            mine ? 'text-brand-700' : 'text-paper-500',
          )}
        >
          {mine ? 'You' : senderName}
        </span>
        <div
          className={cn(
            'rounded-panel px-4 py-2.5 text-sm',
            mine
              ? 'rounded-br-sm bg-brand-700 text-white'
              : 'rounded-bl-sm bg-paper-100 text-paper-800',
          )}
        >
          <p className="whitespace-pre-wrap">{message.body}</p>
          <p className={cn('mt-1 text-[11px]', mine ? 'text-brand-100' : 'text-paper-400')}>
            {formatTime(message.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}