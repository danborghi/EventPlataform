'use client';

import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import type {
  GateEvent,
  GateEventListResponse,
  GateValidationResponse,
  LoginResponse,
} from '@event-platform/contracts';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { SiteHeader } from '@/components/site-header';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api';
import { GATE_TOKEN_KEY } from '@/lib/gate-session';

type CameraState = 'idle' | 'starting' | 'scanning' | 'denied' | 'error';

export function GateConsole() {
  const [token, setToken] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState('gate@example.com');
  const [password, setPassword] = useState('Test@123');
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<GateEvent | null>(null);
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<GateValidationResponse | null>(null);
  const [camera, setCamera] = useState<CameraState>('idle');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControls = useRef<IScannerControls | null>(null);
  const scanLocked = useRef(false);
  const cameraAttempt = useRef(0);

  const stopCamera = useCallback(() => {
    cameraAttempt.current += 1;
    scannerControls.current?.stop();
    scannerControls.current = null;
    if (videoRef.current?.srcObject instanceof MediaStream) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCamera('idle');
  }, []);

  const loadEvents = useCallback(async (accessToken: string, search = '') => {
    setBusy('events');
    setError('');
    try {
      const response = await apiRequest<GateEventListResponse>(
        `/gate/events${search ? `?q=${encodeURIComponent(search)}` : ''}`,
        { token: accessToken },
      );
      setEvents(response.data);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        window.sessionStorage.removeItem(GATE_TOKEN_KEY);
        setToken('');
        setSelectedEvent(null);
        setError('Sua sessão terminou. Entre novamente para continuar.');
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const storedToken = window.sessionStorage.getItem(GATE_TOKEN_KEY) ?? '';
      setToken(storedToken);
      setSessionReady(true);
      if (storedToken) void loadEvents(storedToken);
    });
    return () => {
      active = false;
    };
  }, [loadEvents]);

  useEffect(() => stopCamera, [stopCamera]);

  async function handleLogin(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy('login');
    setError('');
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (response.user.role !== 'GATE') {
        throw new ApiClientError(
          403,
          'FORBIDDEN',
          'Use uma conta de portaria para validar ingressos.',
        );
      }
      window.sessionStorage.setItem(GATE_TOKEN_KEY, response.accessToken);
      setToken(response.accessToken);
      await loadEvents(response.accessToken);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function validateCode(value: string) {
    if (!selectedEvent || !value.trim() || busy === 'validate') return;
    stopCamera();
    setBusy('validate');
    setError('');
    try {
      const response = await apiRequest<GateValidationResponse>(
        `/gate/events/${selectedEvent.id}/validate`,
        { method: 'POST', token, body: { code: value.trim() } },
      );
      setResult(response);
      setCode('');
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        window.sessionStorage.removeItem(GATE_TOKEN_KEY);
        setToken('');
        setSelectedEvent(null);
      }
      setError(errorMessage(caught));
    } finally {
      setBusy('');
      scanLocked.current = false;
    }
  }

  async function startCamera() {
    if (!videoRef.current || camera === 'starting' || camera === 'scanning') {
      return;
    }
    setCamera('starting');
    setError('');
    scanLocked.current = false;
    const attempt = cameraAttempt.current + 1;
    cameraAttempt.current = attempt;
    let timeoutId: number | undefined;
    try {
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 750,
      });
      const scanning = reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (decoded) => {
          if (
            !decoded ||
            scanLocked.current ||
            cameraAttempt.current !== attempt
          ) {
            return;
          }
          scanLocked.current = true;
          scannerControls.current?.stop();
          void validateCode(decoded.getText());
        },
      );
      void scanning
        .then((lateControls) => {
          if (cameraAttempt.current !== attempt) lateControls.stop();
        })
        .catch(() => undefined);
      const timeout = new Promise<IScannerControls>((_resolve, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('Camera startup timeout')),
          8_000,
        );
      });
      const controls = await Promise.race([scanning, timeout]);
      window.clearTimeout(timeoutId);
      scannerControls.current = controls;
      if (scanLocked.current || cameraAttempt.current !== attempt) {
        controls.stop();
        return;
      }
      setCamera('scanning');
    } catch (caught) {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      cameraAttempt.current += 1;
      BrowserQRCodeReader.releaseAllStreams();
      const exception = caught as { name?: string };
      const denied =
        exception.name === 'NotAllowedError' ||
        exception.name === 'SecurityError';
      setCamera(denied ? 'denied' : 'error');
      setError(
        denied
          ? 'A câmera foi bloqueada. Autorize o acesso no navegador ou use a entrada manual.'
          : 'Não foi possível iniciar uma câmera. Use a entrada manual ou tente outro dispositivo.',
      );
    }
  }

  function selectEvent(event: GateEvent) {
    stopCamera();
    setSelectedEvent(event);
    setResult(null);
    setCode('');
    setError('');
  }

  function nextValidation() {
    setResult(null);
    setCode('');
    setError('');
    scanLocked.current = false;
  }

  function logout() {
    stopCamera();
    window.sessionStorage.removeItem(GATE_TOKEN_KEY);
    setToken('');
    setEvents([]);
    setSelectedEvent(null);
    setResult(null);
    setError('');
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <header className="border-b border-ink bg-ink text-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-5 py-9 sm:px-8 sm:py-12">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.22em] text-accent uppercase">
              Estação de acesso
            </p>
            <h1 className="mt-2 text-5xl leading-none font-black tracking-[-0.05em] uppercase sm:text-7xl">
              Portaria
            </h1>
          </div>
          {token ? (
            <div className="flex flex-wrap gap-2">
              {selectedEvent ? (
                <button
                  className="button-secondary border-surface text-surface hover:bg-surface hover:text-ink"
                  onClick={() => {
                    stopCamera();
                    setSelectedEvent(null);
                    setResult(null);
                  }}
                  type="button"
                >
                  Trocar evento
                </button>
              ) : null}
              <button
                className="button-quiet border-muted text-surface"
                onClick={logout}
                type="button"
              >
                Encerrar estação
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        {!sessionReady ? <GateLoading label="Preparando estação" /> : null}

        {sessionReady && !token ? (
          <GateLogin
            busy={busy === 'login'}
            email={email}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
            password={password}
          />
        ) : null}

        {token && !selectedEvent ? (
          <EventSelection
            busy={busy === 'events'}
            events={events}
            onQueryChange={setQuery}
            onSearch={(formEvent) => {
              formEvent.preventDefault();
              void loadEvents(token, query.trim());
            }}
            onSelect={selectEvent}
            query={query}
          />
        ) : null}

        {token && selectedEvent ? (
          <section aria-labelledby="station-title">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-5">
              <div>
                <p className="eyebrow">Evento selecionado</p>
                <h2
                  className="mt-1 text-3xl font-black uppercase"
                  id="station-title"
                >
                  {selectedEvent.title}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {formatGateDate(selectedEvent)} · {selectedEvent.venueName} ·{' '}
                  {selectedEvent.city}
                </p>
              </div>
              <span className="ticket-number">Contexto fixado</span>
            </div>

            {result ? (
              <GateResult
                onNext={nextValidation}
                result={result}
                selectedEvent={selectedEvent}
              />
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section
                  className="border border-ink bg-surface p-5 sm:p-6"
                  aria-labelledby="camera-title"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="ticket-number">Câmera</p>
                      <h3
                        className="mt-4 text-2xl font-black uppercase"
                        id="camera-title"
                      >
                        Aponte para o QR
                      </h3>
                    </div>
                    <span className="status-stamp border-line bg-paper text-muted">
                      {camera === 'scanning' ? '● Lendo' : '○ Parada'}
                    </span>
                  </div>
                  <div className="relative mt-5 aspect-[4/3] overflow-hidden border border-ink bg-ink">
                    <video
                      aria-label="Prévia da câmera da portaria"
                      autoPlay
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      ref={videoRef}
                    />
                    {camera !== 'scanning' ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-ink p-6 text-center text-surface">
                        <p className="max-w-xs text-sm leading-6">
                          A câmera só é ativada após sua ação. Nenhuma imagem é
                          enviada ou armazenada.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="pointer-events-none absolute inset-[14%] border-2 border-accent"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {camera === 'scanning' ? (
                      <button
                        className="button-secondary"
                        onClick={stopCamera}
                        type="button"
                      >
                        Parar câmera
                      </button>
                    ) : (
                      <button
                        className="button-primary"
                        disabled={camera === 'starting'}
                        onClick={() => void startCamera()}
                        type="button"
                      >
                        {camera === 'starting'
                          ? 'Iniciando...'
                          : camera === 'denied'
                            ? 'Tentar câmera novamente'
                            : 'Ativar câmera'}
                      </button>
                    )}
                  </div>
                </section>

                <form
                  className="border border-ink bg-surface p-5 sm:p-6"
                  onSubmit={(formEvent) => {
                    formEvent.preventDefault();
                    void validateCode(code);
                  }}
                >
                  <p className="ticket-number">Entrada manual</p>
                  <h3 className="mt-4 text-2xl font-black uppercase">
                    Cole ou digite o código
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    O mesmo endpoint processa câmera, leitor físico, digitação e
                    cola.
                  </p>
                  <label
                    className="mt-5 block text-xs font-bold uppercase"
                    htmlFor="gate-code"
                  >
                    Código completo do ingresso
                  </label>
                  <textarea
                    autoComplete="off"
                    className="field-control mt-2 min-h-40 resize-y font-mono text-xs leading-5"
                    id="gate-code"
                    onChange={(input) => setCode(input.target.value)}
                    placeholder="v1.payload.assinatura"
                    spellCheck={false}
                    value={code}
                  />
                  <button
                    className="button-primary mt-4 w-full"
                    disabled={!code.trim() || busy === 'validate'}
                    type="submit"
                  >
                    {busy === 'validate' ? 'Validando...' : 'Validar ingresso'}
                  </button>
                </form>
              </div>
            )}
          </section>
        ) : null}

        {error ? (
          <div
            className="mt-5 border border-error bg-error-soft p-4 text-sm leading-6 text-error"
            role="alert"
          >
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function GateLogin({
  email,
  password,
  busy,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="mx-auto max-w-md border border-ink bg-surface p-6"
      onSubmit={onSubmit}
    >
      <span className="ticket-number">Acesso restrito</span>
      <h2 className="mt-5 text-3xl font-black uppercase">
        Identifique a estação
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        A conta de demonstração da portaria já está preenchida.
      </p>
      <label
        className="mt-5 block text-xs font-bold uppercase"
        htmlFor="gate-email"
      >
        E-mail
      </label>
      <input
        autoComplete="email"
        className="field-control mt-1"
        id="gate-email"
        onChange={(input) => onEmailChange(input.target.value)}
        type="email"
        value={email}
      />
      <label
        className="mt-4 block text-xs font-bold uppercase"
        htmlFor="gate-password"
      >
        Senha
      </label>
      <input
        autoComplete="current-password"
        className="field-control mt-1"
        id="gate-password"
        onChange={(input) => onPasswordChange(input.target.value)}
        type="password"
        value={password}
      />
      <button
        className="button-primary mt-5 w-full"
        disabled={busy}
        type="submit"
      >
        {busy ? 'Entrando...' : 'Abrir portaria'}
      </button>
    </form>
  );
}

function EventSelection({
  events,
  query,
  busy,
  onQueryChange,
  onSearch,
  onSelect,
}: {
  events: GateEvent[];
  query: string;
  busy: boolean;
  onQueryChange: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSelect: (event: GateEvent) => void;
}) {
  return (
    <section aria-labelledby="events-title">
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div>
          <p className="eyebrow">Etapa 1 de 2</p>
          <h2
            className="mt-2 text-4xl leading-none font-black uppercase"
            id="events-title"
          >
            Selecione o evento
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted">
            O evento fixa o contexto e impede que um ingresso válido de outra
            sessão seja aceito.
          </p>
          <form className="mt-6" onSubmit={onSearch} role="search">
            <label
              className="text-xs font-bold uppercase"
              htmlFor="gate-search"
            >
              Título, local ou cidade
            </label>
            <input
              className="field-control mt-2"
              id="gate-search"
              onChange={(input) => onQueryChange(input.target.value)}
              placeholder="Buscar evento"
              type="search"
              value={query}
            />
            <button
              className="button-secondary mt-2 w-full"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
        </div>
        <div>
          {busy ? <GateLoading label="Buscando eventos" /> : null}
          {!busy && events.length === 0 ? (
            <div className="border border-dashed border-line bg-surface p-10 text-center">
              <span className="ticket-number mx-auto">Sem eventos</span>
              <p className="mt-4 text-sm leading-6 text-muted">
                Nenhum evento operacional corresponde à busca.
              </p>
            </div>
          ) : null}
          {!busy && events.length ? (
            <div className="grid gap-3">
              {events.map((event) => (
                <button
                  className="event-list-item grid gap-4 text-left sm:grid-cols-[1fr_auto] sm:items-center"
                  key={event.id}
                  onClick={() => onSelect(event)}
                  type="button"
                >
                  <span>
                    <strong className="block text-xl uppercase">
                      {event.title}
                    </strong>
                    <span className="mt-2 block text-sm text-muted">
                      {formatGateDate(event)} · {event.venueName} · {event.city}
                    </span>
                  </span>
                  <span className="font-mono text-xs font-bold tracking-wider text-accent uppercase">
                    Fixar evento →
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GateResult({
  result,
  selectedEvent,
  onNext,
}: {
  result: GateValidationResponse;
  selectedEvent: GateEvent;
  onNext: () => void;
}) {
  const presentation = {
    VALID: {
      symbol: '✓',
      eyebrow: 'Acesso autorizado',
      title: 'Entrada liberada',
      description:
        result.result === 'VALID'
          ? `Ingresso ${String(result.ticket.sequence).padStart(2, '0')} consumido agora.`
          : '',
      tone: 'border-success bg-success-soft text-success',
    },
    ALREADY_USED: {
      symbol: '!',
      eyebrow: 'Acesso recusado',
      title: 'Ingresso já utilizado',
      description:
        result.result === 'ALREADY_USED'
          ? `Primeiro uso em ${new Date(result.usedAt).toLocaleString('pt-BR')}.`
          : '',
      tone: 'border-warning bg-warning-soft text-warning',
    },
    INVALID: {
      symbol: '×',
      eyebrow: 'Acesso recusado',
      title: 'Código inválido',
      description:
        'A assinatura, expiração ou estado do ingresso não permite a entrada.',
      tone: 'border-error bg-error-soft text-error',
    },
    WRONG_EVENT: {
      symbol: '↔',
      eyebrow: 'Acesso recusado',
      title: 'Evento incorreto',
      description: 'O ingresso é assinado, mas pertence a outra sessão.',
      tone: 'border-error bg-error-soft text-error',
    },
  }[result.result];

  return (
    <section
      className={`mt-6 min-h-[28rem] border-2 p-7 sm:p-10 ${presentation.tone}`}
      aria-live="assertive"
      role="status"
    >
      <div className="grid min-h-[23rem] content-between gap-8">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <span className="font-mono text-xs font-black tracking-[0.2em] uppercase">
              {presentation.eyebrow}
            </span>
            <span
              className="flex h-20 w-20 items-center justify-center border-2 border-current text-5xl font-black"
              aria-hidden="true"
            >
              {presentation.symbol}
            </span>
          </div>
          <h3 className="mt-8 max-w-5xl text-5xl leading-[0.9] font-black tracking-[-0.055em] uppercase sm:text-8xl">
            {presentation.title}
          </h3>
          <p className="mt-6 max-w-2xl text-base leading-7 font-bold">
            {presentation.description}
          </p>
          <p className="mt-3 text-sm">Contexto: {selectedEvent.title}</p>
        </div>
        <button
          className="button-primary w-full sm:w-fit"
          onClick={onNext}
          type="button"
        >
          Validar próximo ingresso
        </button>
      </div>
    </section>
  );
}

function GateLoading({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-56 items-center justify-center text-center"
      role="status"
    >
      <div>
        <span className="loading-mark" />
        <p className="mt-4 font-mono text-xs font-bold tracking-wider uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}

function formatGateDate(event: GateEvent): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: event.timezone,
  }).format(new Date(event.startsAt));
}
