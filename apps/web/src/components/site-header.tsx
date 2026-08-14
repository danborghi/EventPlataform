import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-ink bg-surface">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <Link
          className="text-sm font-black tracking-[0.2em] uppercase"
          href="/"
        >
          Event Platform
        </Link>
        <nav
          aria-label="Navegação principal"
          className="flex items-center gap-2"
        >
          <Link className="button-quiet" href="/">
            Programação
          </Link>
          <Link className="button-quiet" href="/tickets">
            Meus ingressos
          </Link>
          <Link className="button-quiet hidden md:inline-flex" href="/gate">
            Portaria
          </Link>
          <Link
            className="button-secondary hidden sm:inline-flex"
            href="/organizer"
          >
            Organizar evento
          </Link>
        </nav>
      </div>
    </header>
  );
}
