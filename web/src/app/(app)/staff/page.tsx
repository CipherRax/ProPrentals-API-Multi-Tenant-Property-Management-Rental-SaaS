'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, UserPlus, Users, ShieldCheck, Mail, Copy, Check, X } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatDate } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import { findOrgRole } from '@/lib/org';
import type { OrgRole } from '@/types';

interface StaffMember {
  id: string;
  role: OrgRole;
  isActive: boolean;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
  };
}

interface StaffInvitation {
  id: string;
  email: string;
  role: OrgRole;
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

const assignableRoles: { value: OrgRole; label: string }[] = [
  { value: 'PROPERTY_MANAGER', label: 'Property Manager' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'CARETAKER', label: 'Caretaker' },
  { value: 'STAFF', label: 'Staff' },
];

const roleTone: Record<string, string> = {
  OWNER: 'bg-purple-50 text-purple-700',
  PROPERTY_MANAGER: 'bg-brand-50 text-brand-700',
  ACCOUNTANT: 'bg-sky-50 text-sky-700',
  CARETAKER: 'bg-amber-50 text-amber-700',
  STAFF: 'bg-paper-100 text-paper-600',
};

export default function StaffPage() {
  const { activeOrg, organizations, user } = useAuth();
  const { error, success } = useToast();
  const role = findOrgRole(organizations, activeOrg?.id);
  const canManage = role === 'OWNER' || role === 'PROPERTY_MANAGER';

  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [recentLink, setRecentLink] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'CARETAKER' as OrgRole });

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        api.getList<StaffMember>(`/organizations/${activeOrg.id}/staff`, { limit: 100 }),
        api.get<StaffInvitation[]>(`/organizations/${activeOrg.id}/staff/invitations`),
      ]);
      setMembers(m.items);
      setInvitations(i);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeOrg, error]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const invite = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      const res = await api.post<{ invitationLink: string }>(
        `/organizations/${activeOrg.id}/staff/invitations`,
        {
          email: form.email,
          fullName: form.fullName || undefined,
          role: form.role,
        },
      );
      success('Invitation sent');
      setInviteOpen(false);
      setRecentLink(res.invitationLink);
      setForm({ email: '', fullName: '', role: 'CARETAKER' });
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (invitationId: string) => {
    if (!activeOrg) return;
    try {
      await api.delete(
        `/organizations/${activeOrg.id}/staff/invitations/${invitationId}`,
      );
      success('Invitation revoked');
      load();
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  const changeRole = async (memberId: string, newRole: OrgRole) => {
    if (!activeOrg) return;
    try {
      await api.patch(`/organizations/${activeOrg.id}/staff/${memberId}/role`, { role: newRole });
      success('Role updated');
      load();
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  const remove = async (memberId: string) => {
    if (!activeOrg) return;
    try {
      await api.delete(`/organizations/${activeOrg.id}/staff/${memberId}`);
      success('Member removed');
      load();
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      error('Could not copy link');
    }
  };

  if (loading && members.length === 0) return <PageLoader />;

  const pendingInvitations = invitations.filter((i) => i.status === 'PENDING');

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Manage your team and their roles."
        actions={
          canManage ? (
            <button className="btn-primary" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" /> Invite staff
            </button>
          ) : undefined
        }
      />

      {recentLink && (
        <div className="surface mb-6 flex flex-wrap items-center justify-between gap-3 border border-brand-100 bg-brand-50/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-brand-800">
            <Mail className="h-4 w-4" />
            <span>
              Invitation link (use this if the email didn&apos;t arrive, e.g. local dev without
              SMTP):
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="max-w-[420px] truncate rounded bg-white px-2 py-1 text-xs text-paper-600">
              {recentLink}
            </code>
            <button
              className="btn-secondary !px-2 !py-1"
              onClick={() => copyLink(recentLink)}
              title="Copy link"
            >
              {copied === recentLink ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-paper-800">
          <Users className="h-4 w-4 text-paper-400" /> Team members
        </h2>

        {members.length === 0 && !loading ? (
          <div className="surface px-5 py-10 text-center text-sm text-paper-400">
            No members yet. Invite your first staff member to get started.
          </div>
        ) : (
          <DataTable<StaffMember>
            keyField={(m) => m.id}
            columns={[
              {
                key: 'name',
                header: 'Member',
                render: (m) => (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                      {(m.user.firstName?.[0] ?? '?').toUpperCase()}
                      {(m.user.lastName?.[0] ?? '').toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-paper-800">
                        {m.user.firstName} {m.user.lastName}
                      </div>
                      <div className="text-xs text-paper-400">
                        {m.user.id === user?.id ? 'You' : m.user.email}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'role',
                header: 'Role',
                render: (m) => (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleTone[m.role] ?? roleTone.STAFF}`}
                  >
                    {m.role.replace(/_/g, ' ')}
                  </span>
                ),
              },
              {
                key: 'joined',
                header: 'Joined',
                render: (m) => (
                  <span className="text-sm text-paper-500">{formatDate(m.joinedAt)}</span>
                ),
              },
              {
                key: 'actions',
                header: '',
                className: 'text-right',
                render: (m) =>
                  canManage && m.role !== 'OWNER' && m.user.id !== user?.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <select
                        className="input !h-8 !w-auto !py-0 text-xs"
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value as OrgRole)}
                      >
                        {assignableRoles.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn-secondary !px-2 !py-1 !h-8 text-xs text-red-600"
                        onClick={() => remove(m.id)}
                        title="Remove member"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : canManage && m.role === 'OWNER' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-paper-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> Owner
                    </span>
                  ) : null,
              },
            ]}
            rows={members}
            empty={{ title: 'No members', description: 'Invite your team to collaborate.' }}
          />
        )}
      </section>

      {pendingInvitations.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-paper-800">
            <Mail className="h-4 w-4 text-paper-400" /> Pending invitations
          </h2>
          <DataTable<StaffInvitation>
            keyField={(i) => i.id}
            rows={pendingInvitations}
            empty={{ title: 'No pending invitations' }}
            columns={[
              {
                key: 'email',
                header: 'Email',
                render: (i) => <span className="text-sm text-paper-800">{i.email}</span>,
              },
              {
                key: 'role',
                header: 'Role',
                render: (i) => (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleTone[i.role] ?? roleTone.STAFF}`}
                  >
                    {i.role.replace(/_/g, ' ')}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: () => (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    Pending
                  </span>
                ),
              },
              {
                key: 'expires',
                header: 'Expires',
                render: (i) => (
                  <span className="text-sm text-paper-500">{formatDate(i.expiresAt)}</span>
                ),
              },
              {
                key: 'actions',
                header: '',
                className: 'text-right',
                render: (i) =>
                  canManage ? (
                    <button
                      className="btn-secondary !px-2 !py-1 !h-8 text-xs text-red-600"
                      onClick={() => revoke(i.id)}
                      title="Revoke invitation"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null,
              },
            ]}
          />
        </section>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite staff member"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={invite}
              disabled={saving || !form.email}
            >
              {saving ? 'Sending…' : 'Send invite'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Email *</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="colleague@example.com"
            />
          </div>
          <div>
            <label className="label">Full name</label>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
            >
              {assignableRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-paper-400">
              <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              They&apos;ll receive an email with a secure link to set up their account and join this
              organization.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
