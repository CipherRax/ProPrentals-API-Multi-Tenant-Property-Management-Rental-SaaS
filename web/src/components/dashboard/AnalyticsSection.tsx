'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  TrendingUp,
  Coins,
  Percent,
  AlertTriangle,
  X,
  RefreshCw,
  ArrowUpRight,
  Gauge,
  Scale,
  EyeOff,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { api, formatMoney } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/lib/toast';
import { PageLoader } from '@/components/ui/Spinner';
import type {
  AnalyticsResponse,
  InsightsResult,
  SubscriptionLimits,
  UnitTypeMetrics,
} from '@/types';

const METHOD_COLORS: Record<string, string> = {
  MPESA: '#00A550',
  CASH: '#bf8f2e',
  BANK_TRANSFER: '#0B4A26',
  OTHER: '#6B7280',
};

interface Scope {
  propertyId?: string;
  unitTypeId?: string;
}

export function AnalyticsSection({ orgId, orgKey }: { orgId: string; orgKey: string }) {
  const { error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>({});
  const [trendWindow, setTrendWindow] = useState<'30' | '90' | '365'>('30');
  const [regenerating, setRegenerating] = useState(false);

  const limitsQ = useQuery({
    queryKey: queryKeys.limits(orgKey),
    queryFn: () => api.get<SubscriptionLimits>(`/organizations/${orgId}/subscription/limits`),
    enabled: Boolean(orgId),
  });

  const enabled = Boolean(orgId) && limitsQ.data?.advancedAnalytics === true;

  const scopeQuery = { ...(scope.propertyId ? { propertyId: scope.propertyId } : {}), ...(scope.unitTypeId ? { unitTypeId: scope.unitTypeId } : {}) };

  const analyticsQ = useQuery({
    queryKey: queryKeys.analytics(orgKey, scope),
    queryFn: () =>
      api.get<AnalyticsResponse>(`/organizations/${orgId}/analytics`, scopeQuery),
    enabled,
  });

  const insightsQ = useQuery({
    queryKey: queryKeys.insights(orgKey, scope),
    queryFn: () =>
      api.get<InsightsResult>(`/organizations/${orgId}/analytics/insights`, scopeQuery),
    enabled,
  });

  const a = analyticsQ.data;
  const insights = insightsQ.data;

  const unitTypeOptions = useMemo(() => {
    if (!a?.scope || a.scope.kind !== 'portfolio') return [];
    return (a.unitTypes ?? []).filter((u) => u.unitTypeId);
  }, [a]);

  const drillOptions = useMemo(() => {
    if (a?.scope.kind === 'portfolio') return unitTypeOptions;
    if (a?.scope.kind === 'property') {
      return (a.unitTypes ?? []).filter((u) => u.unitTypeId && u.propertyId === a.scope.propertyId);
    }
    return [];
  }, [a, unitTypeOptions]);

  const trendSeries = useMemo(() => {
    if (!a) return [];
    const occ = a.trends[`occupancyTrend${trendWindow}`];
    const pay = a.trends[`paymentTrend${trendWindow}`];
    return occ.map((o, i) => ({
      period: o.period,
      occupancy: o.value,
      expectedRent: pay[i]?.expectedRent ?? 0,
      collectedRent: pay[i]?.collectedRent ?? 0,
    }));
  }, [a, trendWindow]);

  const methodData = (a?.byMethod30 ?? [])
    .filter((d) => d.amount > 0)
    .map((d) => ({
      name: d.method.toLowerCase().replace(/_/g, ' '),
      value: d.amount,
      color: METHOD_COLORS[d.method] ?? '#969282',
    }));

  const scopeTitle =
    a?.scope.kind === 'unitType'
      ? `${a.scope.unitTypeName} · ${a.scope.propertyName}`
      : a?.scope.kind === 'property'
        ? a.scope.propertyName
        : 'Your whole portfolio';

  const dismiss = async (id: string) => {
    try {
      await api.patch(`/organizations/${orgId}/analytics/insights/suggestions/${id}/dismiss`);
      queryClient.setQueryData<InsightsResult>(queryKeys.insights(orgKey, scope), (prev) =>
        prev
          ? { ...prev, suggestions: prev.suggestions.map((s) => (s.id === id ? { ...s, dismissed: true } : s)) }
          : prev,
      );
    } catch (e) {
      toastError((e as Error).message);
    }
  };

  const refresh = async () => {
    setRegenerating(true);
    try {
      await api.post(`/organizations/${orgId}/analytics/insights/refresh`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.insights(orgKey, {}) });
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

  if (!enabled) {
    return <LockedAnalytics />;
  }

  if (analyticsQ.isLoading || insightsQ.isLoading) {
    return (
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-paper-800">Analytics & AI insights</h2>
        </div>
        <PageLoader />
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-paper-800">
            <Sparkles className="h-4 w-4 text-brand-600" /> Analytics & AI insights
          </h2>
          <p className="mt-0.5 text-xs text-paper-500">
            {scopeTitle} · regenerated daily · grounded in your own numbers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input py-1.5 text-sm"
            value={scope.unitTypeId ?? scope.propertyId ?? 'portfolio'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'portfolio') setScope({});
              else {
                const ut = [...unitTypeOptions, ...(drillOptions as UnitTypeMetrics[])].find(
                  (u) => u.unitTypeId === v,
                );
                if (ut) setScope({ propertyId: ut.propertyId, unitTypeId: ut.unitTypeId ?? undefined });
                else setScope({ propertyId: v });
              }
            }}
            aria-label="Analytics scope"
          >
            <option value="portfolio">Whole portfolio</option>
            {(scope.propertyId ? drillOptions : unitTypeOptions).map((ut) => (
              <option key={ut.key} value={ut.unitTypeId!}>
                {ut.propertyName} · {ut.unitTypeName}
              </option>
            ))}
            {(a?.unitTypes ?? [])
              .filter((u, i, arr) => arr.findIndex((x) => x.propertyId === u.propertyId) === i && !u.unitTypeId)
              .map((u) => (
                <option key={`p-${u.propertyId}`} value={u.propertyId}>
                  {u.propertyName} (all units)
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn-secondary py-1.5 text-sm"
            onClick={refresh}
            disabled={regenerating}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {insights && (
        <div className="space-y-4">
          {insights.summary && (
            <div className="surface border-l-4 border-brand-500 p-5">
              <p className="text-sm leading-relaxed text-paper-700">
                <span className="mr-1.5 inline-flex align-middle">
                  <Sparkles className="h-4 w-4 text-brand-600" />
                </span>
                {insights.summary}
              </p>
              <p className="mt-2 text-[11px] text-paper-400">
                {insights.provider === 'openai' ? 'Generated by AI' : 'Generated from your numbers'} ·
                {insights.generatedAt.slice(0, 10)}
              </p>
            </div>
          )}

          {insights.criticalIssues.length > 0 && (
            <div className="rounded-card border border-red-200 bg-red-50/60 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <AlertTriangle className="h-4 w-4" /> Needs attention
              </h3>
              <div className="mt-3 space-y-3">
                {insights.criticalIssues.map((c) => (
                  <IssueItem key={c.id} item={c} />
                ))}
              </div>
            </div>
          )}

          {a?.viewsUnavailable && a.metrics.inquiriesTotal === 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-paper-400">
              <EyeOff className="h-3.5 w-3.5" />
              Marketplace views aren&apos;t recorded yet, so demand metrics are based on inquiries only.
            </p>
          )}
        </div>
      )}

      {a && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Occupancy"
              value={a.metrics.occupancyRate != null ? `${a.metrics.occupancyRate}%` : '—'}
              hint={`${a.metrics.occupiedUnits} of ${a.metrics.totalUnits} units occupied`}
              icon={<Percent className="h-5 w-5" />}
              accent
            />
            <MetricCard
              label="On-time payments"
              value={a.metrics.onTimePaymentRate != null ? `${a.metrics.onTimePaymentRate}%` : '—'}
              hint={a.metrics.avgDaysLate != null ? `Avg ${a.metrics.avgDaysLate} days late` : 'No paid charges yet'}
              icon={<Gauge className="h-5 w-5" />}
            />
            <MetricCard
              label="Collected (30d)"
              value={formatMoney(a.metrics.collectedThisPeriod, a.currency)}
              hint={`${formatMoney(a.metrics.expectedRent, a.currency)} expected`}
              icon={<Coins className="h-5 w-5" />}
            />
            <MetricCard
              label="Overdue"
              value={formatMoney(a.metrics.overdueRent, a.currency)}
              hint={formatMoney(a.metrics.outstandingRent, a.currency) + ' outstanding'}
              icon={<AlertTriangle className="h-5 w-5" />}
              danger={a.metrics.overdueRent > 0}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="surface p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-paper-800">Occupancy trend</h4>
                <div className="flex gap-1">
                  {(['30', '90', '365'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setTrendWindow(w)}
                      className={`rounded-control px-2.5 py-1 text-xs font-medium ${
                        trendWindow === w ? 'bg-brand-500 text-white' : 'bg-paper-100 text-paper-500 hover:text-brand-700'
                      }`}
                    >
                      {w}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendSeries}>
                    <defs>
                      <linearGradient id="occFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00A550" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#00A550" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDEBE3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8A8878' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#8A8878' }} tickLine={false} axisLine={false} width={34} unit="%" />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Occupancy']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e8e7e0', fontSize: 13 }}
                    />
                    <Area type="monotone" dataKey="occupancy" stroke="#00A550" strokeWidth={2} fill="url(#occFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <h4 className="mt-6 text-sm font-semibold text-paper-800">Rent collected vs expected</h4>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDEBE3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8A8878' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#8A8878' }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip
                      formatter={(value, name) => [formatMoney(Number(value), a.currency), name === 'expectedRent' ? 'Expected' : 'Collected']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e8e7e0', fontSize: 13 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="expectedRent" name="Expected" fill="#B7D2BD" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="collectedRent" name="Collected" fill="#00A550" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-5">
              {methodData.length > 0 && (
                <div className="surface p-5">
                  <h4 className="text-sm font-semibold text-paper-800">Collected by method (30d)</h4>
                  <div className="mt-3 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={methodData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2}>
                          {methodData.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatMoney(Number(value), a.currency)} contentStyle={{ borderRadius: 8, border: '1px solid #e8e7e0', fontSize: 13 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1">
                    {methodData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-paper-600">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                          {d.name}
                        </span>
                        <span className="font-medium tabular-nums text-paper-800">{formatMoney(d.value, a.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {a.metrics.inquiriesTotal > 0 && (
                <div className="surface p-5">
                  <h4 className="text-sm font-semibold text-paper-800">Inquiries & demand</h4>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-paper-500">Total inquiries</dt>
                      <dd className="font-medium text-paper-900">{a.metrics.inquiriesTotal}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-paper-500">Converted to lease</dt>
                      <dd className="font-medium text-paper-900">
                        {a.metrics.inquiriesConverted} ({a.metrics.conversionRate ?? 0}%)
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-paper-500">Avg days to fill vacancy</dt>
                      <dd className="font-medium text-paper-900">
                        {a.metrics.avgDaysToFill != null ? `${a.metrics.avgDaysToFill} days` : '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {insights && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-paper-800">
              <Sparkles className="h-4 w-4 text-brand-600" /> Suggestions
              <span className="text-xs font-normal text-paper-400">— review, never auto-applied</span>
            </h4>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {insights.suggestions.filter((s) => !s.dismissed).length === 0 && (
              <p className="text-sm text-paper-500">No active suggestions right now. You&apos;re doing great — check back after your next rent cycle.</p>
            )}
            {insights.suggestions
              .filter((s) => !s.dismissed)
              .map((s) => (
                <SuggestionCard
                  key={s.id}
                  item={s}
                  onDismiss={() => dismiss(s.id)}
                  onDrill={() => {
                    if (s.unitTypeId) setScope({ propertyId: s.propertyId, unitTypeId: s.unitTypeId });
                    else if (s.propertyId) setScope({ propertyId: s.propertyId });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  accent = false,
  danger = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={`surface p-5 ${accent ? 'border-brand-200 bg-brand-50/30' : ''} ${danger ? 'border-red-200 bg-red-50/40' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-paper-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-paper-900">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent ? 'bg-brand-700 text-white' : 'bg-paper-100 text-paper-500'}`}>
          {icon}
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-paper-400">{hint}</p>}
    </div>
  );
}

function IssueItem({ item }: { item: { title: string; details: string } }) {
  return (
    <div className="flex gap-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      <div>
        <p className="text-sm font-semibold text-red-900">{item.title}</p>
        <p className="mt-0.5 text-sm text-red-800/80">{item.details}</p>
      </div>
    </div>
  );
}

function SuggestionCard({
  item,
  onDismiss,
  onDrill,
}: {
  item: { id: string; title: string; details: string; metric?: string; basis?: string };
  onDismiss: () => void;
  onDrill: () => void;
}) {
  return (
    <div className="surface flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {item.metric === 'best_performer' ? (
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          ) : (
            <Scale className="h-4 w-4 text-brand-600" />
          )}
          <h5 className="text-sm font-semibold text-paper-900">{item.title}</h5>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestion" className="rounded p-1 text-paper-400 transition-colors hover:bg-paper-100 hover:text-paper-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 flex-1 text-sm text-paper-600">{item.details}</p>
      <div className="mt-3 flex items-center justify-between">
        {item.basis && <span className="rounded-full bg-paper-100 px-2.5 py-1 text-[11px] font-medium text-paper-500">{item.basis}</span>}
        <button type="button" onClick={onDrill} className="ml-auto flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800">
          View details <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function LockedAnalytics() {
  return (
    <section className="mt-8">
      <div className="relative overflow-hidden rounded-card border border-paper-200 bg-white p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 backdrop-blur-[2px] [mask-image:linear-gradient(to_bottom,white,white)] blur-[1.5px] opacity-60">
          <div className="flex h-full items-center justify-center gap-4 px-8">
            {[58, 72, 41, 63, 77].map((v, i) => (
              <div key={i} className="h-3/5 w-16 rounded-t-card bg-brand-100" style={{ height: `${v}%` }} />
            ))}
          </div>
        </div>
        <div className="relative z-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-50 text-brand-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-paper-900">Analytics & AI insights</h2>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                  Starter+
                </span>
              </div>
              <p className="mt-0.5 max-w-md text-xs text-paper-500">
                Occupancy and payment trends, demand, and plain-language AI summaries with critical-issue alerts — personalized to your portfolio.
              </p>
            </div>
          </div>
          <Link href="/subscription" className="btn-primary shrink-0">
            Upgrade to Starter to unlock analytics & AI insights
          </Link>
        </div>
      </div>
    </section>
  );
}