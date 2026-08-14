'use client';

import Image from 'next/image';
import { useState } from 'react';

interface MoviePosterProps {
  posterUrl: string | null;
  title: string;
  sizes?: string;
}

export function MoviePoster({
  posterUrl,
  title,
  sizes = '(max-width: 640px) 40vw, 180px',
}: MoviePosterProps) {
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const canShowPoster = posterUrl && failedPosterUrl !== posterUrl;

  return (
    <div className="relative aspect-[2/3] overflow-hidden bg-ink text-surface">
      {canShowPoster ? (
        <Image
          alt={`Pôster de ${title}`}
          className="object-cover"
          fill
          onError={() => setFailedPosterUrl(posterUrl)}
          sizes={sizes}
          src={posterUrl}
        />
      ) : (
        <div className="flex h-full flex-col justify-between p-4">
          <span className="font-mono text-[0.65rem] tracking-[0.2em] text-paper/70">
            SEM PÔSTER
          </span>
          <strong className="break-words text-xl leading-none font-black uppercase">
            {title}
          </strong>
        </div>
      )}
    </div>
  );
}
