'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatDateTime } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/lib/toast';
import type { Conversation, Message } from '@/types';

export default function MessagesPage() {
  const { activeOrg, user } = useAuth();
  const { error } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!activeOrg) return;
    try {
      const d = await api.get<Conversation[]>(`/organizations/${activeOrg.id}/conversations`);
      const list = Array.isArray(d) ? d : ((d as { items?: Conversation[] })?.items ?? []);
      setConversations(list);
      if (!active && list.length > 0) {
        setActive(list[0]);
      }
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeOrg, active, error]);

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  useEffect(() => {
    if (!active || !activeOrg) return;
    api
      .get<Message[]>(`/organizations/${activeOrg.id}/conversations/${active.id}/messages`)
      .then((d) => setMessages(Array.isArray(d) ? d : ((d as { items?: Message[] })?.items ?? [])))
      .catch((e) => error(getErrorMessage(e)));
  }, [active, activeOrg, error]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, active?.id]);

  const send = async () => {
    if (!active || !activeOrg || !draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/conversations/${active.id}/messages`, {
        body: draft,
      });
      setDraft('');
      const d = await api.get<Message[]>(
        `/organizations/${activeOrg.id}/conversations/${active.id}/messages`,
      );
      setMessages(Array.isArray(d) ? d : ((d as { items?: Message[] })?.items ?? []));
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Messages" description="Conversations with your tenants" />

      <div className="card flex h-[calc(100vh-220px)] overflow-hidden">
        <div className="w-72 shrink-0 overflow-y-auto border-r border-ink-100">
          {conversations.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink-400">No conversations yet.</div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive(c)}
                className={`flex w-full items-center gap-3 border-b border-ink-50 px-4 py-3 text-left hover:bg-ink-50/60 ${
                  active?.id === c.id ? 'bg-brand-50/40' : ''
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600">
                  {initials(c.tenant?.fullName ?? '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium text-ink-800">
                      {c.tenant?.fullName || 'Tenant'}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="badge bg-brand-600 text-white">{c.unreadCount}</span>
                    )}
                  </div>
                  {c.lastMessage && (
                    <div className="line-clamp-1 text-xs text-ink-400">{c.lastMessage}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex flex-1 flex-col">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-ink-400">
              <EmptyState
                icon={<MessageSquare className="h-8 w-8" />}
                title="Select a conversation"
                description="Choose a tenant conversation to start messaging."
              />
            </div>
          ) : (
            <>
              <div className="border-b border-ink-100 px-5 py-3">
                <div className="text-sm font-semibold text-ink-800">
                  {active.tenant?.fullName || 'Tenant'}
                </div>
                <div className="text-xs text-ink-400">{active.tenant?.email}</div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-ink-400">
                    No messages yet. Say hello!
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderUserId === user?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : ''}`}>
                        <div
                          className={`max-w-[70%] rounded-xl px-4 py-2 text-sm ${
                            mine ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-800'
                          }`}
                        >
                          <div>{m.body}</div>
                          <div
                            className={`mt-1 text-[11px] ${
                              mine ? 'text-brand-100' : 'text-ink-400'
                            }`}
                          >
                            {formatDateTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
              <div className="flex items-center gap-2 border-t border-ink-100 p-3">
                <input
                  className="input"
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button
                  className="btn-primary px-3"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
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
