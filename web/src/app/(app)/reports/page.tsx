'use client';

import { useEffect, useState } from 'react';
import { Download, Coins, Building2, Users, Percent } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/lib/toast';
import { findOrgRole } from '@/lib/org';
import type { FinancialReport, OccupancyReport, TenantReport, MaintenanceReport } from '@/types';

type Tab = 'financial' | 'occupancy' | 'tenants' | 'maintenance';

export default function ReportsPage() {
  const { activeOrg, organizations } = useAuth();
  const { error } = useToast();
  const role = findOrgRole(organizations, activeOrg?.id);
  const allowed = role === 'OWNER' || role === 'PROPERTY_MANAGER' || role === 'ACCOUNTANT';

  const [tab, setTab] = useState<Tab>('financial');
  const [financial, setFinancial] = useState<FinancialReport | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyReport | null>(null);
  const [tenants, setTenants] = useState<TenantReport | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrg || !allowed) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    const org = activeOrg.id;
    Promise.all([
      api
        .get<FinancialReport>(`/organizations/${org}/reports/financial`)
        .then((d) => mounted && setFinancial(d)),
      api
        .get<OccupancyReport>(`/organizations/${org}/reports/occupancy`)
        .then((d) => mounted && setOccupancy(d)),
      api
        .get<TenantReport>(`/organizations/${org}/reports/tenants`)
        .then((d) => mounted && setTenants(d)),
      api
        .get<MaintenanceReport>(`/organizations/${org}/reports/maintenance`)
        .then((d) => mounted && setMaintenance(d)),
    ])
      .catch((e) => error(getErrorMessage(e)))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [activeOrg, allowed, error]);

  const exportCsv = async (kind: string) => {
    if (!activeOrg) return;
    try {
      const data = await api.get<any>(`/organizations/${activeOrg.id}/reports/export/${kind}`);
      const csv = data?.csv ?? data?.data?.csv;
      if (csv) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${kind}-report.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  if (!allowed) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-ink-500">
          Reports are available to Owners, Property Managers, and Accountants.
        </p>
      </div>
    );
  }

  if (loading && !financial) return <PageLoader />;

  const currency = activeOrg?.currency ?? 'KES';
  const tabs: { key: Tab; label: string }[] = [
    { key: 'financial', label: 'Financial' },
    { key: 'occupancy', label: 'Occupancy' },
    { key: 'tenants', label: 'Tenants' },
    { key: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Portfolio performance at a glance"
        actions={
          <button className="btn-secondary" onClick={() => exportCsv(tab)}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      <div className="mb-6 flex gap-1 rounded-lg border border-ink-100 bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-brand-700 text-white' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'financial' && financial && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Expected rent"
            value={formatMoney(financial.expectedRent, currency)}
            icon={<Coins className="h-5 w-5" />}
          />
          <Metric
            label="Collected"
            value={formatMoney(financial.collectedRent, currency)}
            icon={<Coins className="h-5 w-5" />}
            accent
          />
          <Metric
            label="Outstanding"
            value={formatMoney(financial.outstandingRent, currency)}
            icon={<Coins className="h-5 w-5" />}
          />
          <Metric
            label="Overdue"
            value={formatMoney(financial.overdueRent, currency)}
            icon={<Coins className="h-5 w-5" />}
          />
        </div>
      )}

      {tab === 'occupancy' && occupancy && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Total units"
            value={String(occupancy.totalUnits)}
            icon={<Building2 className="h-5 w-5" />}
          />
          <Metric
            label="Occupied"
            value={String(occupancy.occupiedUnits)}
            icon={<Building2 className="h-5 w-5" />}
            accent
          />
          <Metric
            label="Available"
            value={String(occupancy.availableUnits)}
            icon={<Building2 className="h-5 w-5" />}
          />
          <Metric
            label="Occupancy rate"
            value={`${occupancy.occupancyRate}%`}
            icon={<Percent className="h-5 w-5" />}
          />
        </div>
      )}

      {tab === 'tenants' && tenants && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Metric
            label="Total tenants"
            value={String(tenants.totalTenants ?? '—')}
            icon={<Users className="h-5 w-5" />}
          />
          <Metric
            label="Active"
            value={String(tenants.activeTenants ?? '—')}
            icon={<Users className="h-5 w-5" />}
            accent
          />
          <Metric
            label="Inactive"
            value={String(tenants.inactiveTenants ?? '—')}
            icon={<Users className="h-5 w-5" />}
          />
        </div>
      )}

      {tab === 'maintenance' && maintenance && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Metric
            label="Total requests"
            value={String(maintenance.total ?? '—')}
            icon={<WrenchIcon />}
          />
          <Metric
            label="Open"
            value={String(maintenance.open ?? '—')}
            icon={<WrenchIcon />}
            accent
          />
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`card p-5 ${accent ? 'border-brand-200 bg-brand-50/40' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-500'}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function WrenchIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
