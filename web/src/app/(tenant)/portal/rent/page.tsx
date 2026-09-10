'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Coins, CheckCircle2, CreditCard, Phone } from 'lucide-react';
import { api, formatMoney, formatDate, toNumber } from '@/lib/api';
import { tenantQueryKeys, useTenantPrimary } from '@/lib/tenant';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatGridSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import type { MyRentCharge } from '@/types/tenant';

interface StkResult {
  paymentId: string;
  checkoutRequestId: string;
  customerMessage: string;
}

export default function TenantRentPage() {
  const { tenancy, profile } = useTenantPrimary();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [payCharge, setPayCharge] = useState<MyRentCharge | null>(null);

  const chargesQ = useQuery({
    queryKey: tenantQueryKeys.charges,
    queryFn: () => api.get<MyRentCharge[]>('/tenants/me/rent-charges'),
  });

  const charges = Array.isArray(chargesQ.data) ? chargesQ.data : [];

  /** Amount still owed on a charge (0 when settled). */
  const dueFor = (c: MyRentCharge): number =>
    Math.max(0, toNumber(c.amount) - toNumber(c.amountPaid));

  const canPay = (c: MyRentCharge): boolean =>
    c.status === 'UNPAID' || c.status === 'OVERDUE' || c.status === 'PARTIALLY_PAID';

  const openPay = (charge: MyRentCharge | null) => {
    setPayCharge(charge);
    setPayOpen(true);
  };

  const summary = useMemo(() => {
    const total = charges.reduce((sum, c) => sum + toNumber(c.amount), 0);
    const paid = charges.reduce((sum, c) => sum + toNumber(c.amountPaid), 0);
    const outstanding = charges.reduce((sum, c) => (canPay(c) ? sum + dueFor(c) : sum), 0);
    return { total, paid, outstanding };
  }, [charges]);

  const stkMutation = useMutation({
    mutationFn: ({ amount, phoneNumber }: { amount: number; phoneNumber: string }) =>
      api.post<StkResult>(
        `/tenants/me/tenancies/${tenancy!.id}/payments/mpesa/stk-push`,
        { amount, phoneNumber },
      ),
    onSuccess: (data) => {
      success(data.customerMessage ?? 'M-Pesa request sent. Approve the prompt on your phone.');
      setPayOpen(false);
      setPayCharge(null);
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.charges });
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.payments });
    },
    onError: (err) => {
      error(getErrorMessage(err));
    },
  });

  if (chargesQ.isLoading) {
    return (
      <div>
        <PageHeader title="My rent" description="View your rent charges and make payments" />
        <StatGridSkeleton count={3} />
        <div className="mt-6">
          <TableSkeleton rows={5} cols={4} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My rent"
        description="View your rent charges and make payments"
        actions={
          <button
            className="btn-primary"
            disabled={!tenancy || summary.outstanding <= 0}
            onClick={() => openPay(null)}
          >
            {summary.outstanding <= 0 ? 'Balance settled' : 'Pay balance'}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Outstanding"
          value={formatMoney(summary.outstanding)}
          icon={<Wallet className="h-5 w-5" />}
          accent
        />
        <Stat
          label="Total charged"
          value={formatMoney(summary.total)}
          icon={<Coins className="h-5 w-5" />}
        />
        <Stat
          label="Total paid"
          value={formatMoney(summary.paid)}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-paper-800">Rent charges</h2>
      <div className="surface overflow-hidden">
        {!charges.length ? (
          <div className="px-6 py-10 text-center text-sm text-paper-400">No rent charges yet — your first charge will show up here once it&apos;s generated.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-50/60 text-xs uppercase tracking-wide text-paper-400">
                  <th className="px-5 py-2.5 font-medium">Period</th>
                  <th className="px-5 py-2.5 font-medium">Unit</th>
                  <th className="px-5 py-2.5 font-medium">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Paid</th>
                  <th className="px-5 py-2.5 font-medium">Due date</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-paper-100 last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium text-paper-800">
                        {formatDate(c.billingPeriodStart)} – {formatDate(c.billingPeriodEnd)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-paper-600">{c.unit.unitNumber}</td>
                    <td className="px-5 py-3 font-medium tabular-nums text-paper-800">
                      {formatMoney(c.amount)}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-paper-600">
                      {formatMoney(c.amountPaid)}
                      {canPay(c) && dueFor(c) > 0 && (
                        <div className="text-xs font-medium text-red-600">
                          {formatMoney(dueFor(c))} due
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-paper-600">{formatDate(c.dueDate)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} />
                      {c.status === 'WAIVED' && c.waivedReason && (
                        <div className="mt-1 text-xs text-paper-400">{c.waivedReason}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canPay(c) && dueFor(c) > 0 ? (
                        <button
                          className="btn-primary px-3 py-1.5"
                          disabled={!tenancy || stkMutation.isPending}
                          onClick={() => openPay(c)}
                        >
                          Pay {formatMoney(dueFor(c))}
                        </button>
                      ) : (
                        <span className="text-xs text-paper-400">Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PayModal
        key={payOpen ? (payCharge?.id ?? 'balance') : 'closed'}
        open={payOpen}
        onClose={() => {
          setPayOpen(false);
          setPayCharge(null);
        }}
        charge={payCharge}
        defaultAmount={
          payCharge ? Math.max(1, dueFor(payCharge)) : Math.max(1, summary.outstanding)
        }
        defaultPhone={profile?.phone ?? ''}
        submitting={stkMutation.isPending}
        onSubmit={(amount, phoneNumber) => stkMutation.mutate({ amount, phoneNumber })}
      />

      {!tenancy && (
        <div className="mt-6">
          <EmptyState
            icon={<CreditCard className="h-10 w-10" />}
            title="No active tenancy"
            description="You'll be able to see and pay rent once your tenancy is active."
          />
        </div>
      )}
    </div>
  );
}

function PayModal({
  open, onClose, charge, defaultAmount, defaultPhone, submitting, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  charge: MyRentCharge | null;
  defaultAmount: number;
  defaultPhone: string;
  submitting: boolean;
  onSubmit: (amount: number, phoneNumber: string) => void;
}) {
  const [amount, setAmount] = useState(String(Math.round(defaultAmount)));
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={charge ? 'Pay rent for this period' : 'Pay rent via M-Pesa'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={submitting || !amount || Number(amount) <= 0 || !phoneNumber}
            onClick={() => onSubmit(Number(amount), phoneNumber)}
          >
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {submitting ? 'Sending…' : 'Send STK prompt'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-paper-500">
          An M-Pesa prompt will be sent to your phone. Check for the STK push and enter your PIN to confirm.
        </p>

        {charge && (
          <div className="rounded-panel border border-paper-100 bg-paper-50/60 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-paper-500">Period</span>
              <span className="font-medium text-paper-800">
                {formatDate(charge.billingPeriodStart)} – {formatDate(charge.billingPeriodEnd)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-paper-500">Rent amount</span>
              <span className="font-medium text-paper-800">{formatMoney(charge.amount)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-paper-500">Due date</span>
              <span className="font-medium text-paper-800">{formatDate(charge.dueDate)}</span>
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="amount">Amount (KES)</label>
          <div className="relative">
            <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
            <input
              id="amount"
              type="number"
              min={1}
              className="input pl-9"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="phone">M-Pesa phone number</label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
            <input
              id="phone"
              type="tel"
              className="input pl-9"
              placeholder="0712 345 678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Stat({
  label, value, icon, accent = false,
}: {
  label: string; value: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`surface p-5 ${accent ? 'border-brand-200 bg-brand-50/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-paper-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-paper-900">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent ? 'bg-brand-700 text-white' : 'bg-paper-100 text-paper-500'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}