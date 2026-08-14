'use client';

import type {
  CustomerReservation,
  LoginResponse,
  PublicEvent,
  SimulatedPaymentResponse,
} from '@event-platform/contracts';
import Link from 'next/link';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api';
import { CUSTOMER_TOKEN_KEY } from '@/lib/customer-session';
import { formatPrice } from '@/lib/event-format';

type CheckoutView =
  | 'idle'
  | 'login'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'canceled'
  | 'expired';

interface EventCheckoutProps {
  event: PublicEvent;
  onInventoryDelta: (delta: number) => void;
}

export function EventCheckout({ event, onInventoryDelta }: EventCheckoutProps) {
  const maxQuantity = Math.min(6, event.availableQuantity);
  const [quantity, setQuantity] = useState(1);
  const [view, setView] = useState<CheckoutView>('idle');
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('client1@example.com');
  const [password, setPassword] = useState('Test@123');
  const [reservation, setReservation] = useState<CustomerReservation | null>(
    null,
  );
  const [payment, setPayment] = useState<SimulatedPaymentResponse | null>(null);
  const [paymentKey, setPaymentKey] = useState('');
  const [paymentIntent, setPaymentIntent] = useState<
    'APPROVED' | 'DECLINED' | ''
  >('');
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const inventoryRestored = useRef(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setToken(window.sessionStorage.getItem(CUSTOMER_TOKEN_KEY) ?? '');
    });
    return () => {
      active = false;
    };
  }, []);

  const restoreInventory = useCallback(() => {
    if (!reservation || inventoryRestored.current) return;
    inventoryRestored.current = true;
    onInventoryDelta(reservation.quantity);
  }, [onInventoryDelta, reservation]);

  useEffect(() => {
    if (view !== 'pending' || !reservation || !token) return;
    let active = true;
    let reconciliationStarted = false;
    const expiresAt = new Date(reservation.expiresAt).getTime();
    const interval = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now < expiresAt || reconciliationStarted) return;
      reconciliationStarted = true;
      apiRequest<CustomerReservation>(`/reservations/${reservation.id}`, {
        token,
      })
        .then((response) => {
          if (!active) return;
          setReservation(response);
          if (response.status === 'EXPIRED') {
            restoreInventory();
            setView('expired');
          }
        })
        .catch(() => undefined);
    }, 1_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [reservation, restoreInventory, token, view]);

  const remainingSeconds = reservation
    ? Math.max(
        0,
        Math.ceil((new Date(reservation.expiresAt).getTime() - clock) / 1_000),
      )
    : 0;

  async function createReservation(accessToken: string) {
    setBusy('reserve');
    setError('');
    try {
      const response = await apiRequest<CustomerReservation>('/reservations', {
        method: 'POST',
        token: accessToken,
        body: { eventId: event.id, quantity },
      });
      inventoryRestored.current = false;
      setReservation(response);
      setClock(Date.now());
      setView('pending');
      onInventoryDelta(-response.quantity);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        window.sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
        setToken('');
        setView('login');
        setError('Sua sessão terminou. Entre novamente para reservar.');
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setBusy('');
    }
  }

  async function handleLogin(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy('login');
    setError('');
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (response.user.role !== 'CUSTOMER') {
        throw new ApiClientError(
          403,
          'FORBIDDEN',
          'Use uma conta de cliente para reservar ingressos.',
        );
      }
      window.sessionStorage.setItem(CUSTOMER_TOKEN_KEY, response.accessToken);
      setToken(response.accessToken);
      await createReservation(response.accessToken);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function processPayment(result: 'APPROVED' | 'DECLINED') {
    if (!reservation) return;
    const key = paymentKey || crypto.randomUUID();
    setPaymentKey(key);
    setPaymentIntent(result);
    setBusy('payment');
    setError('');
    try {
      const response = await apiRequest<SimulatedPaymentResponse>(
        `/reservations/${reservation.id}/payment`,
        {
          method: 'POST',
          token,
          idempotencyKey: key,
          body: { simulationResult: result },
        },
      );
      setPayment(response);
      if (response.payment.status === 'APPROVED') {
        setView('approved');
      } else {
        restoreInventory();
        setView('declined');
      }
    } catch (caught) {
      if (
        caught instanceof ApiClientError &&
        caught.code === 'RESERVATION_EXPIRED'
      ) {
        restoreInventory();
        setView('expired');
      }
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function cancelReservation() {
    if (!reservation) return;
    setBusy('cancel');
    setError('');
    try {
      const response = await apiRequest<CustomerReservation>(
        `/reservations/${reservation.id}/cancel`,
        { method: 'POST', token },
      );
      setReservation(response);
      restoreInventory();
      setView('canceled');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  function startAgain() {
    setReservation(null);
    setPayment(null);
    setPaymentKey('');
    setPaymentIntent('');
    setError('');
    setQuantity(1);
    setView('idle');
  }

  return (
    <aside className="ticket-cut m-5 self-start border border-ink bg-paper p-5 sm:m-6">
      <p className="font-mono text-[0.65rem] font-bold tracking-wider text-muted uppercase">
        {view === 'pending' ? 'Reserva temporária' : 'Ingresso individual'}
      </p>
      <p className="mt-2 text-3xl font-black">
        {formatPrice(event.priceCents)}
      </p>
      <div className="my-5 border-t border-dashed border-line" />

      {view === 'idle' ? (
        <IdleCheckout
          busy={busy}
          event={event}
          maxQuantity={maxQuantity}
          onContinue={() => {
            if (token) void createReservation(token);
            else setView('login');
          }}
          onQuantityChange={setQuantity}
          quantity={quantity}
        />
      ) : null}

      {view === 'login' ? (
        <form onSubmit={handleLogin}>
          <h2 className="text-lg font-black uppercase">Entre para reservar</h2>
          <p className="mt-2 text-xs leading-5 text-muted">
            A conta de demonstração já está preenchida.
          </p>
          <label
            className="mt-4 block text-xs font-bold uppercase"
            htmlFor="checkout-email"
          >
            E-mail
          </label>
          <input
            autoComplete="email"
            className="field-control mt-1"
            id="checkout-email"
            onChange={(input) => setEmail(input.target.value)}
            type="email"
            value={email}
          />
          <label
            className="mt-3 block text-xs font-bold uppercase"
            htmlFor="checkout-password"
          >
            Senha
          </label>
          <input
            autoComplete="current-password"
            className="field-control mt-1"
            id="checkout-password"
            onChange={(input) => setPassword(input.target.value)}
            type="password"
            value={password}
          />
          <button
            className="button-primary mt-4 w-full"
            disabled={Boolean(busy)}
            type="submit"
          >
            {busy ? 'Entrando...' : 'Entrar e reservar'}
          </button>
          <button
            className="button-quiet mt-2 w-full"
            onClick={() => setView('idle')}
            type="button"
          >
            Voltar
          </button>
        </form>
      ) : null}

      {view === 'pending' && reservation ? (
        <div>
          <p className="text-xs text-muted uppercase">Tempo para concluir</p>
          <p className="mt-1 font-mono text-4xl font-black" role="timer">
            {formatCountdown(remainingSeconds)}
          </p>
          <dl className="mt-4 border-y border-dashed border-line py-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt>Quantidade</dt>
              <dd className="font-bold">{reservation.quantity}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <dt>Total</dt>
              <dd className="font-bold">
                {formatPrice(reservation.totalPriceCents)}
              </dd>
            </div>
          </dl>
          <div className="mt-4 border border-line bg-surface p-3">
            <p className="font-mono text-[0.6rem] font-bold tracking-wider text-muted uppercase">
              Cartão apenas ilustrativo
            </p>
            <p className="mt-3 font-mono text-sm tracking-widest">
              •••• •••• •••• 2026
            </p>
            <div className="mt-3 flex justify-between font-mono text-[0.65rem] text-muted">
              <span>CLIENTE DEMO</span>
              <span>12/30 · •••</span>
            </div>
          </div>
          <button
            className="button-primary mt-4 w-full"
            disabled={
              Boolean(busy) ||
              (Boolean(paymentIntent) && paymentIntent !== 'APPROVED')
            }
            onClick={() => void processPayment('APPROVED')}
            type="button"
          >
            {busy === 'payment' && paymentIntent === 'APPROVED'
              ? 'Processando...'
              : paymentIntent === 'APPROVED'
                ? 'Tentar aprovação novamente'
                : 'Simular aprovação'}
          </button>
          <button
            className="button-secondary mt-2 w-full"
            disabled={
              Boolean(busy) ||
              (Boolean(paymentIntent) && paymentIntent !== 'DECLINED')
            }
            onClick={() => void processPayment('DECLINED')}
            type="button"
          >
            {busy === 'payment' && paymentIntent === 'DECLINED'
              ? 'Processando...'
              : paymentIntent === 'DECLINED'
                ? 'Tentar recusa novamente'
                : 'Simular recusa'}
          </button>
          <button
            className="button-quiet mt-2 w-full"
            disabled={Boolean(busy)}
            onClick={() => void cancelReservation()}
            type="button"
          >
            Cancelar reserva
          </button>
        </div>
      ) : null}

      {view === 'approved' && payment ? (
        <div>
          <CheckoutResult
            description={`${payment.tickets.length} ${payment.tickets.length === 1 ? 'ingresso emitido' : 'ingressos emitidos'} sem duplicação.`}
            label="Pagamento aprovado"
            tone="success"
          />
          <Link className="button-primary mt-4 w-full" href="/tickets">
            Abrir meus ingressos
          </Link>
        </div>
      ) : null}

      {view === 'declined' ? (
        <CheckoutResult
          actionLabel="Criar nova reserva"
          description="O estoque foi devolvido. Uma nova tentativa exige outra reserva."
          label="Pagamento recusado"
          onAction={startAgain}
          tone="error"
        />
      ) : null}

      {view === 'canceled' || view === 'expired' ? (
        <CheckoutResult
          actionLabel="Começar novamente"
          description={
            view === 'expired'
              ? 'O prazo terminou e os ingressos voltaram para a programação.'
              : 'A reserva foi cancelada e o estoque foi devolvido.'
          }
          label={view === 'expired' ? 'Reserva expirada' : 'Reserva cancelada'}
          onAction={startAgain}
          tone="warning"
        />
      ) : null}

      {error ? (
        <p
          className="mt-4 border border-error bg-error-soft p-3 text-xs leading-5 text-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </aside>
  );
}

function IdleCheckout({
  event,
  maxQuantity,
  quantity,
  busy,
  onContinue,
  onQuantityChange,
}: {
  event: PublicEvent;
  maxQuantity: number;
  quantity: number;
  busy: string;
  onContinue: () => void;
  onQuantityChange: (quantity: number) => void;
}) {
  const soldOut = maxQuantity === 0;
  return (
    <div>
      <p className={soldOut ? 'availability-sold-out' : 'availability-open'}>
        {soldOut
          ? 'Sessão esgotada'
          : `${event.availableQuantity} ingressos disponíveis`}
      </p>
      {!soldOut ? (
        <>
          <p className="mt-5 text-xs font-bold tracking-wider uppercase">
            Quantidade
          </p>
          <div className="mt-2 grid grid-cols-[2.75rem_1fr_2.75rem] border border-ink">
            <button
              aria-label="Diminuir quantidade"
              className="text-xl font-black"
              disabled={quantity <= 1}
              onClick={() => onQuantityChange(quantity - 1)}
              type="button"
            >
              −
            </button>
            <output className="border-x border-ink py-3 text-center font-mono text-xl font-black">
              {quantity}
            </output>
            <button
              aria-label="Aumentar quantidade"
              className="text-xl font-black"
              disabled={quantity >= maxQuantity}
              onClick={() => onQuantityChange(quantity + 1)}
              type="button"
            >
              +
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-dashed border-line pt-4">
            <span className="text-xs uppercase">Total</span>
            <strong>{formatPrice(event.priceCents * quantity)}</strong>
          </div>
          <button
            className="button-primary mt-4 w-full"
            disabled={Boolean(busy)}
            onClick={onContinue}
            type="button"
          >
            {busy ? 'Reservando...' : 'Reservar por 10 minutos'}
          </button>
        </>
      ) : null}
    </div>
  );
}

function CheckoutResult({
  label,
  description,
  tone,
  actionLabel,
  onAction,
}: {
  label: string;
  description: string;
  tone: 'success' | 'warning' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-success bg-success-soft text-success'
      : tone === 'warning'
        ? 'border-warning bg-warning-soft text-warning'
        : 'border-error bg-error-soft text-error';
  return (
    <div>
      <div className={`border p-4 ${toneClass}`} role="status">
        <p className="font-black uppercase">{label}</p>
        <p className="mt-2 text-xs leading-5">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          className="button-primary mt-4 w-full"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
