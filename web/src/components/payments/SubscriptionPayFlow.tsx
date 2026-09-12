'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api, formatMoney } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import type { PaymentStatus } from '@/types';

type Stage = 'idle' | 'pending' | 'success' | 'failed';

interface SubscriptionPayment {
  id: string;
  status: PaymentStatus;
  amount: string;
  failureReason?: string | null;
}

/**
 * Pay for a new subscription plan via M-Pesa STK Push before the switch is
 * applied. Mirrors the tenancy MpesaPayFlow: after the STK push is confirmed
 * by Safaricom we poll the subscription-payment record until the server
 * reaches a terminal status. The billing callback applies the plan change
 * only once the payment is SUCCESSFUL, so the UI never claims a switch that
 * didn't clear payment.
 */
export function SubscriptionPayFlow({
  orgId,
  tier,
  amount,
  currency = 'KES',
  onSuccess,
  onError,
}: {
  orgId: string;
  tier: string;
  amount: number;
  currency?: string;
  onSuccess?: (payment: SubscriptionPayment) => void;
  onError?: (message: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [polling, setPolling] = useState(false);
  const [lastPayment, setLastPayment] = useState<SubscriptionPayment | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = useCallback(
    (pid: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      setPolling(true);
      pollRef.current = setInterval(async () => {
        try {
          const p = await api.get<SubscriptionPayment>(
            `/subscriptions/organizations/${orgId}/payments/${pid}`,
          );
          setLastPayment(p);
          const status = p.status.toUpperCase() as PaymentStatus;
          if (status === 'SUCCESSFUL') {
            stopPolling();
            setStage('success');
            onSuccess?.(p);
          } else if (
            status === 'FAILED' ||
            status === 'CANCELLED' ||
            status === 'REVERSED' ||
            status === 'REFUNDED'
          ) {
            stopPolling();
            setStage('failed');
            setMessage(p.failureReason || `Payment ${status.toLowerCase().replace(/_/g, ' ')}.`);
            onError?.(p.failureReason || `Payment ${status.toLowerCase().replace(/_/g, ' ')}.`);
          }
        } catch {
          // transient — keep polling
        }
      }, 3000);
    },
    [orgId, onSuccess, onError, stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const initiate = async () => {
    if (!phone.trim()) return;
    try {
      setStage('pending');
      setMessage('');
      const res = await api.post<{ paymentId: string; checkoutRequestId: string }>(
        `/subscriptions/organizations/${orgId}/payments/mpesa/stk-push`,
        {
          tier,
          phoneNumber: phone.trim().replace(/\D/g, ''),
          amount,
        },
      );
      setPaymentId(res.paymentId);
      startPolling(res.paymentId);
    } catch (e) {
      setStage('failed');
      setMessage(getErrorMessage(e));
      onError?.(getErrorMessage(e));
    }
  };

  const reset = () => {
    stopPolling();
    setStage('idle');
    setPaymentId(null);
    setMessage('');
    setLastPayment(null);
  };

  return (
    <div className="space-y-4">
      {stage === 'idle' && (
        <>
          <div className="rounded-panel border border-brand-100 bg-brand-50/60 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-paper-600">Amount due</span>
              <span className="text-base font-semibold text-paper-900">
                {formatMoney(amount, currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-paper-500">
              Pay now to switch plans. Your plan activates once the payment is confirmed.
            </p>
          </div>
          <div>
            <label className="label">M-Pesa phone number</label>
            <input
              className="input"
              inputMode="tel"
              placeholder="07XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <button
            className="btn-primary w-full"
            onClick={initiate}
            disabled={!phone.trim()}
          >
            <Smartphone className="h-4 w-4" />
            Pay {formatMoney(amount, currency)}
          </button>
        </>
      )}

      {stage === 'pending' && (
        <div className="flex flex-col items-center rounded-panel border border-amber-100 bg-amber-50 px-6 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-600 text-white">
            <Smartphone className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-base font-semibold text-paper-800">Check your phone</h3>
          <p className="mt-1 max-w-xs text-sm text-paper-600">
            A payment request of{' '}
            <span className="font-semibold text-paper-800">{formatMoney(amount, currency)}</span>{' '}
            was sent to your M-Pesa. Enter your PIN on the phone to approve it.
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-amber-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for confirmation from Safaricom…
          </div>
          <button className="mt-4 btn-secondary" onClick={reset}>
            Cancel
          </button>
        </div>
      )}

      {stage === 'success' && (
        <div className="flex flex-col items-center rounded-panel border border-emerald-100 bg-emerald-50 px-6 py-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <h3 className="mt-4 text-base font-semibold text-paper-800">Payment received</h3>
          <p className="mt-1 text-sm text-paper-600">
            {formatMoney(
              lastPayment ? lastPayment.amount : amount,
              currency,
            )}{' '}
            confirmed via M-Pesa. Your plan has been activated.
          </p>
        </div>
      )}

      {stage === 'failed' && (
        <div className="flex flex-col items-center rounded-panel border border-red-100 bg-red-50 px-6 py-8 text-center">
          <XCircle className="h-12 w-12 text-red-600" />
          <h3 className="mt-4 text-base font-semibold text-paper-800">Payment not completed</h3>
          <p className="mt-1 max-w-xs text-sm text-paper-600">
            {message || 'The payment was cancelled or declined on your phone.'}
          </p>
          <button className="mt-4 btn-primary" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}