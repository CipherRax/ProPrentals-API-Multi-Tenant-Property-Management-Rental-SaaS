'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { SubscriptionPayFlow } from '@/components/payments/SubscriptionPayFlow';
import { useToast } from '@/lib/toast';
import { findOrgRole } from '@/lib/org';
import type { Plan, Property, Subscription, SubscriptionLimits, TenantProfile } from '@/types';

export default function SubscriptionPage() {
  const { activeOrg, organizations } = useAuth();
  const { error, success } = useToast();
  const role = findOrgRole(organizations, activeOrg?.id);
  const isOwner = role === 'OWNER';

  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [usage, setUsage] = useState({ properties: 0, units: 0, tenants: 0 });
  const [loading, setLoading] = useState(true);
  const [changeTo, setChangeTo] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const [p, s, l, props, tnts] = await Promise.all([
        api.get<Plan[]>('/subscriptions/plans'),
        api.get<Subscription>(`/organizations/${activeOrg.id}/subscription`),
        api.get<SubscriptionLimits>(`/organizations/${activeOrg.id}/subscription/limits`),
        api.get<Property[]>(`/organizations/${activeOrg.id}/properties`),
        api.get<TenantProfile[]>(`/organizations/${activeOrg.id}/tenants`),
      ]);
      setPlans(Array.isArray(p) ? p : ((p as { items?: Plan[] })?.items ?? []));
      setSub(s);
      setLimits(l);
      const propsArr = Array.isArray(props) ? props : ((props as { items?: Property[] })?.items ?? []);
      const tntsArr = Array.isArray(tnts) ? tnts : ((tnts as { items?: TenantProfile[] })?.items ?? []);
      setUsage({
        properties: propsArr.length,
        units: propsArr.reduce((acc, pr) => acc + (pr._count?.units ?? 0), 0),
        tenants: tntsArr.length,
      });
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeOrg, error]);

  useEffect(() => {
    load();
  }, [load]);

  const changePlan = async () => {
    if (!activeOrg || !changeTo) return;
    setSaving(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/subscription/change-plan`, {
        tier: changeTo.tier,
      });
      success(`Switched to the ${changeTo.name} plan.`);
      setChangeTo(null);
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onPlanPaid = async () => {
    if (!activeOrg || !changeTo) return;
    success(`Payment confirmed. Switched to the ${changeTo.name} plan.`);
    setChangeTo(null);
    load();
  };

  const isPaid = Number(changeTo?.priceMonthly ?? 0) > 0;

  if (loading && !sub) return <PageLoader />;

  const currency = activeOrg?.currency ?? 'KES';

  return (
    <div>
      <PageHeader title="Subscription" description="Your organization's plan and usage" />

      <div className="mb-8 rounded-card border border-brand-200 bg-brand-50/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-brand-800">Current plan</div>
            <div className="text-2xl font-semibold text-paper-900">
              {sub?.plan?.name ?? sub?.tier ?? '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-paper-500">Status</div>
            <StatusBadge status={sub?.status} />
          </div>
        </div>
        {limits && (
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-brand-200 pt-4">
            <Usage label="Properties" value={usage.properties} max={limits.maxProperties} />
            <Usage label="Units" value={usage.units} max={limits.maxUnits} />
            <Usage label="Tenants" value={usage.tenants} max={limits.maxTenants} />
          </div>
        )}
      </div>

      <h2 className="mb-4 text-sm font-semibold text-paper-800">Available plans</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const current = plan.tier === sub?.tier;
          return (
            <div
              key={plan.id}
              className={`card flex flex-col p-5 ${current ? 'border-brand-400 ring-1 ring-brand-400' : ''}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-paper-900">{plan.name}</h3>
                {current && <span className="badge bg-brand-600 text-white">Current</span>}
              </div>
              <div className="mt-2 text-2xl font-semibold text-paper-900">
                {formatMoney(plan.priceMonthly, currency)}
                <span className="text-sm font-normal text-paper-400">/mo</span>
              </div>
              <p className="mt-2 text-sm text-paper-500">{plan.description}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {(plan.features ?? []).slice(0, 5).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-paper-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-xs text-paper-400">
                {plan.maxProperties ?? '∞'} properties · {plan.maxUnits ?? '∞'} units ·{' '}
                {plan.maxTenants ?? '∞'} tenants · {plan.maxStaff ?? '∞'} staff
              </div>
              {isOwner && !current ? (
                <button className="btn-secondary mt-4 w-full" onClick={() => setChangeTo(plan)}>
                  Switch to {plan.name}
                </button>
              ) : (
                <div className="mt-4" />
              )}
            </div>
          );
        })}
      </div>

      <Modal
        open={!!changeTo}
        onClose={() => setChangeTo(null)}
        title={isPaid ? `Upgrade to ${changeTo?.name ?? ''}` : `Switch to ${changeTo?.name ?? ''}`}
        size="sm"
        footer={
          !isPaid ? (
            <>
              <button className="btn-secondary" onClick={() => setChangeTo(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={changePlan} disabled={saving}>
                {saving ? 'Updating…' : 'Confirm change'}
              </button>
            </>
          ) : undefined
        }
      >
        {isPaid && changeTo && activeOrg ? (
          <SubscriptionPayFlow
            orgId={activeOrg.id}
            tier={changeTo.tier}
            amount={Number(changeTo.priceMonthly)}
            currency={currency}
            onSuccess={onPlanPaid}
            onError={(m) => error(m)}
          />
        ) : (
          <p className="text-sm text-paper-600">
            You&apos;ll be moved to the {changeTo?.name} plan. Your account will be checked against
            the new plan&apos;s limits before the change is applied.
          </p>
        )}
      </Modal>
    </div>
  );
}

function Usage({ label, value, max }: { label: string; value: number; max: number | null | undefined }) {
  const limit = max ?? Infinity;
  const pct = limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-paper-500">
        <span className="font-medium">{label}</span>
        <span>
          {value} / {limit === Infinity ? '∞' : limit}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-paper-100">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
