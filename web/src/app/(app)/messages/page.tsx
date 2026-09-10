'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Plus, Search, Building2, User, Users } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, resolveAssetUrl, formatDateTime } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { Conversation, PeerConversation, Message, PeerMessage } from '@/types';

interface Thread {
  key: string;
  kind: 'tenant' | 'peer';
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string | null;
  lastMessage?: string | null;
  unreadCount: number;
  updatedAt: string;
}

interface Bubble {
  key: string;
  body: string;
  createdAt: string;
  mine: boolean;
  senderName: string;
  senderAvatar?: string | null;
}

interface TenantCandidate {
  id: string;
  userId: string | null;
  fullName: string;
  email: string;
  profileImageUrl?: string | null;
  status: string;
}

interface StaffCandidate {
  user: { id: string; firstName: string; lastName: string; email: string; avatarUrl?: string | null };
  role: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function threadTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return d.toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
  });
}

export default function MessagesPage() {
  const { activeOrg, user } = useAuth();
  const { error, success } = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [modalQuery, setModalQuery] = useState('');
  const [tenantCandidates, setTenantCandidates] = useState<TenantCandidate[]>([]);
  const [staffCandidates, setStaffCandidates] = useState<StaffCandidate[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const me = user?.id ?? '';

  const toThreads = useCallback((convs: Conversation[], peers: PeerConversation[]): Thread[] => {
    const list: Thread[] = [
      ...convs.map((c) => ({
        key: `tenant:${c.id}`,
        kind: 'tenant' as const,
        id: c.id,
        title: c.tenant?.fullName || 'Tenant',
        subtitle: c.tenant?.email || '',
        avatarUrl: c.tenant?.avatarUrl,
        lastMessage: c.lastMessage ?? null,
        unreadCount: c.unreadCount ?? 0,
        updatedAt: c.updatedAt,
      })),
      ...peers.map((p) => ({
        key: `peer:${p.id}`,
        kind: 'peer' as const,
        id: p.id,
        title: p.peer?.name || 'Staff',
        subtitle: p.peer?.email || '',
        avatarUrl: p.peer?.avatarUrl,
        lastMessage: p.lastMessage ?? null,
        unreadCount: p.unreadCount ?? 0,
        updatedAt: p.updatedAt,
      })),
    ];
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, []);

  const loadThreads = useCallback(async (): Promise<Thread[]> => {
    if (!activeOrg) return [];
    try {
      const [convRes, peerRes] = await Promise.all([
        api.get<Conversation[]>(`/organizations/${activeOrg.id}/conversations`).catch(() => []),
        api
          .get<PeerConversation[]>(`/organizations/${activeOrg.id}/peer-conversations`)
          .catch(() => []),
      ]);
      const convs = Array.isArray(convRes) ? convRes : ((convRes as { items?: Conversation[] })?.items ?? []);
      const peers = Array.isArray(peerRes) ? peerRes : ((peerRes as { items?: PeerConversation[] })?.items ?? []);
      const list = toThreads(convs, peers);
      setThreads(list);
      setActiveThread((prev) => {
        if (prev) return list.find((t) => t.key === prev.key) ?? list[0] ?? null;
        return list[0] ?? null;
      });
      return list;
    } catch (e) {
      error(getErrorMessage(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeOrg, error, toThreads]);

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  const loadMessages = useCallback(
    async (thread: Thread) => {
      if (!activeOrg) return;
      setLoadingMsg(true);
      try {
        const path =
          thread.kind === 'peer'
            ? `/organizations/${activeOrg.id}/peer-conversations/${thread.id}/messages`
            : `/organizations/${activeOrg.id}/conversations/${thread.id}/messages`;
        const res = await api.get<Message[] | PeerMessage[]>(path);
        const items = Array.isArray(res) ? res : ((res as { items?: Array<Message & PeerMessage> })?.items ?? []);
        setBubbles(
          items.map((m) => ({
            key: m.id,
            body: m.body,
            createdAt: m.createdAt,
            mine: m.senderUserId === me,
            senderName: m.sender
              ? `${m.sender.firstName} ${m.sender.lastName}`
              : m.senderUserId === me
                ? 'You'
                : thread.title,
            senderAvatar: m.sender?.avatarUrl ?? thread.avatarUrl,
          })),
        );
      } catch (e) {
        error(getErrorMessage(e));
      } finally {
        setLoadingMsg(false);
      }
    },
    [activeOrg, error, me],
  );

  useEffect(() => {
    if (!activeThread) return;
    loadMessages(activeThread);
  }, [activeThread, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles.length, activeThread?.key]);

  const markRead = async (thread: Thread) => {
    if (!activeOrg) return;
    try {
      const path =
        thread.kind === 'peer'
          ? `/organizations/${activeOrg.id}/peer-conversations/${thread.id}/read`
          : `/organizations/${activeOrg.id}/conversations/${thread.id}/read`;
      await api.patch(path);
      loadThreads();
    } catch {
      /* best-effort */
    }
  };

  const selectThread = (thread: Thread) => {
    setActiveThread(thread);
    markRead(thread);
    loadMessages(thread);
  };

  const send = async () => {
    if (!activeThread || !activeOrg || !draft.trim() || sending) return;
    setSending(true);
    try {
      const path =
        activeThread.kind === 'peer'
          ? `/organizations/${activeOrg.id}/peer-conversations/${activeThread.id}/messages`
          : `/organizations/${activeOrg.id}/conversations/${activeThread.id}/messages`;
      await api.post(path, { body: draft.trim() });
      setDraft('');
      await Promise.all([loadMessages(activeThread), loadThreads()]);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const openNew = async () => {
    if (!activeOrg) return;
    setNewOpen(true);
    setModalQuery('');
    try {
      const [tenants, staff] = await Promise.all([
        api.getList<TenantCandidate>(`/organizations/${activeOrg.id}/tenants`, {
          page: 1,
          limit: 100,
        }),
        api.getList<StaffCandidate>(`/organizations/${activeOrg.id}/staff`, {
          page: 1,
          limit: 100,
        }),
      ]);
      setTenantCandidates(tenants.items.filter((t) => Boolean(t.userId)));
      setStaffCandidates(staff.items.filter((s) => s.user.id !== me));
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  const startConversation = async (kind: 'tenant' | 'staff', payload: { tenantProfileId?: string; peerUserId?: string }) => {
    if (!activeOrg) return;
    setStarting(true);
    try {
      const started = await api.post<{ id: string }>(
        kind === 'tenant'
          ? `/organizations/${activeOrg.id}/conversations`
          : `/organizations/${activeOrg.id}/peer-conversations`,
        kind === 'tenant' ? { tenantProfileId: payload.tenantProfileId } : { peerUserId: payload.peerUserId },
      );
      setNewOpen(false);
      success('Conversation started');
      const list = await loadThreads();
      const found = list.find((t) => t.key === `${kind}:${started.id}`) ?? null;
      setActiveThread(found);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const q = modalQuery.trim().toLowerCase();
  const filteredTenants = q
    ? tenantCandidates.filter((t) => `${t.fullName} ${t.email}`.toLowerCase().includes(q))
    : tenantCandidates;
  const filteredStaff = q
    ? staffCandidates.filter((s) => `${s.user.firstName} ${s.user.lastName} ${s.user.email}`.toLowerCase().includes(q))
    : staffCandidates;

  const subText = (c: StaffCandidate) => c.role.toLowerCase().replace(/_/g, ' ');

  if (loading && threads.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Chat with your tenants and staff"
        actions={
          activeOrg ? (
            <button className="btn-primary" onClick={openNew} disabled={!activeOrg}>
              <Plus className="h-4 w-4" /> New conversation
            </button>
          ) : undefined
        }
      />

      <div className="surface flex h-[calc(100vh-220px)] overflow-hidden">
        {/* Conversation list */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-paper-100">
          {threads.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-paper-400">
              No conversations yet.
              <button className="mx-auto mt-3 block btn-primary" onClick={openNew} disabled={!activeOrg}>
                <Plus className="h-4 w-4" /> New conversation
              </button>
            </div>
          ) : (
            threads.map((t) => {
              const active = activeThread?.key === t.key;
              const avatar = resolveAssetUrl(t.avatarUrl);
              return (
                <button
                  key={t.key}
                  onClick={() => selectThread(t)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-paper-50 px-4 py-3 text-left hover:bg-paper-50/60',
                    active ? 'bg-brand-50/40' : '',
                  )}
                >
                  <div className="relative shrink-0">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-100 text-sm font-semibold text-paper-600">
                        {initials(t.title)}
                      </div>
                    )}
                    {t.unreadCount > 0 && (
                      <span className="badge absolute -right-1 -top-1 bg-brand-600 text-white">
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-paper-800">{t.title}</span>
                      <span className="shrink-0 text-[11px] text-paper-400">
                        {threadTime(t.updatedAt)}
                      </span>
                    </div>
                    {t.lastMessage && (
                      <div className="line-clamp-1 text-xs text-paper-400">{t.lastMessage}</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat */}
        <div className="flex flex-1 flex-col">
          {!activeThread ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<MessageSquare className="h-8 w-8" />}
                title="Select a conversation"
                description="Choose a conversation to start messaging, or start a new one."
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-paper-100 px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-100 text-sm font-semibold text-paper-600">
                  {resolveAssetUrl(activeThread.avatarUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAssetUrl(activeThread.avatarUrl)}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : activeThread.kind === 'peer' ? (
                    <Users className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-paper-800">{activeThread.title}</div>
                  <div className="text-xs text-paper-400">
                    {activeThread.kind === 'peer' ? 'Staff direct message' : 'Tenant'}
                    {activeThread.subtitle ? ` · ${activeThread.subtitle}` : ''}
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ minHeight: 320 }}>
                {loadingMsg ? (
                  <div className="flex justify-center py-6">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : bubbles.length === 0 ? (
                  <div className="py-10 text-center text-sm text-paper-400">
                    No messages yet. Say hello!
                  </div>
                ) : (
                  bubbles.map((b) => <Bubble key={b.key} bubble={b} />)
                )}
                <div ref={bottomRef} />
              </div>

              <div className="flex items-center gap-2 border-t border-paper-100 p-3">
                <input
                  className="input"
                  placeholder="Type a message…"
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button
                  className="btn-primary px-3"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                >
                  {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Start a conversation"
        size="lg"
        footer={
          <span className="text-xs text-paper-400">
            Pick a tenant or a staff member to start messaging.
          </span>
        }
      >
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
          <input
            className="input pl-9"
            placeholder="Search tenants or staff…"
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-paper-400">
              <Building2 className="h-3.5 w-3.5" /> Tenants ({filteredTenants.length})
            </h3>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {filteredTenants.length === 0 ? (
                <p className="py-6 text-center text-sm text-paper-400">
                  No tenants with an active account yet. Invite them, and they&apos;ll be able to message you once they join.
                </p>
              ) : (
                filteredTenants.map((t) => (
                  <button
                    key={t.id}
                    className="flex w-full items-center gap-3 rounded-panel px-3 py-2 text-left hover:bg-paper-50 disabled:opacity-50"
                    disabled={starting}
                    onClick={() => startConversation('tenant', { tenantProfileId: t.id })}
                  >
                    {resolveAssetUrl(t.profileImageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveAssetUrl(t.profileImageUrl)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700/10 text-xs font-semibold text-brand-800">
                        {initials(t.fullName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-paper-800">{t.fullName}</div>
                      <div className="truncate text-xs text-paper-400">{t.email}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-paper-400">
              <Users className="h-3.5 w-3.5" /> Staff ({filteredStaff.length})
            </h3>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {filteredStaff.length === 0 ? (
                <p className="py-6 text-center text-sm text-paper-400">No other staff members.</p>
              ) : (
                filteredStaff.map((s) => (
                  <button
                    key={s.user.id}
                    className="flex w-full items-center gap-3 rounded-panel px-3 py-2 text-left hover:bg-paper-50 disabled:opacity-50"
                    disabled={starting}
                    onClick={() => startConversation('staff', { peerUserId: s.user.id })}
                  >
                    {resolveAssetUrl(s.user.avatarUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveAssetUrl(s.user.avatarUrl)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700/10 text-xs font-semibold text-brand-800">
                        {initials(`${s.user.firstName} ${s.user.lastName}`)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-paper-800">
                        {s.user.firstName} {s.user.lastName}
                      </div>
                      <div className="truncate text-xs text-paper-400">
                        {subText(s)} · {s.user.email}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Bubble({ bubble }: { bubble: Bubble }) {
  const avatar = resolveAssetUrl(bubble.senderAvatar);
  return (
    <div className={cn('flex items-end gap-2', bubble.mine && 'justify-end')}>
      {!bubble.mine && (
        <div className="shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-100 text-xs font-semibold text-paper-500">
              {initials(bubble.senderName)}
            </div>
          )}
        </div>
      )}
      <div className={cn('flex max-w-[70%] flex-col', bubble.mine && 'items-end')}>
        <span
          className={cn(
            'mb-0.5 px-1 text-[11px] font-medium',
            bubble.mine ? 'text-brand-700' : 'text-paper-500',
          )}
        >
          {bubble.mine ? 'You' : bubble.senderName}
        </span>
        <div
          className={cn(
            'rounded-panel px-4 py-2.5 text-sm',
            bubble.mine
              ? 'rounded-br-sm bg-brand-700 text-white'
              : 'rounded-bl-sm bg-paper-100 text-paper-800',
          )}
        >
          <div className="whitespace-pre-wrap">{bubble.body}</div>
          <div className={cn('mt-1 text-[11px]', bubble.mine ? 'text-brand-100' : 'text-paper-400')}>
            {formatDateTime(bubble.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}