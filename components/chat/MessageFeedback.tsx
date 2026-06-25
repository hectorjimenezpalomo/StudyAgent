'use client';

import { useState } from 'react';

type Rating = 'helpful' | 'not_helpful';

export function MessageFeedback({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextRating: Rating) {
    setError(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, rating: nextRating }),
      });
      if (!response.ok) {
        setError('No se pudo guardar tu valoración.');
        return;
      }
      setRating(nextRating);
    } catch {
      setError('No se pudo guardar tu valoración.');
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
      <span>¿Te ayudó?</span>
      <button
        type="button"
        aria-label="Respuesta útil"
        onClick={() => submit('helpful')}
        className={rating === 'helpful' ? 'font-semibold text-cyan-800' : 'hover:text-slate-800'}
      >
        Sí
      </button>
      <button
        type="button"
        aria-label="Respuesta no útil"
        onClick={() => submit('not_helpful')}
        className={rating === 'not_helpful' ? 'font-semibold text-red-700' : 'hover:text-slate-800'}
      >
        No
      </button>
      {error ? <span className="text-red-700">{error}</span> : null}
    </div>
  );
}
