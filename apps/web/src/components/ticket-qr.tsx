'use client';

import Image from 'next/image';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

interface RenderedQr {
  code: string;
  dataUrl: string;
}

export function TicketQr({ code }: { code: string }) {
  const [rendered, setRendered] = useState<RenderedQr | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(code, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1D1D1B', light: '#FFFDF8' },
    })
      .then((dataUrl) => {
        if (active) setRendered({ code, dataUrl });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [code]);

  if (failed) {
    return (
      <p className="border border-error bg-error-soft p-4 text-sm text-error">
        Não foi possível desenhar o QR deste ingresso.
      </p>
    );
  }

  if (!rendered || rendered.code !== code) {
    return (
      <div
        className="flex aspect-square w-full max-w-80 items-center justify-center border border-line bg-surface"
        role="status"
      >
        <span className="loading-mark" />
      </div>
    );
  }

  return (
    <Image
      alt="QR code do ingresso"
      className="h-auto w-full max-w-80 border border-ink bg-surface"
      height={320}
      priority
      src={rendered.dataUrl}
      unoptimized
      width={320}
    />
  );
}
