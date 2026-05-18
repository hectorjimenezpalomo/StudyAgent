'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type DeleteDocumentButtonProps = {
  documentId: string;
  title: string;
};

export function DeleteDocumentButton({ documentId, title }: DeleteDocumentButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(`Borrar "${title}"?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? 'No se pudo borrar el documento');
        return;
      }

      router.refresh();
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? 'Borrando...' : 'Borrar'}
      </button>
      {error ? <p className="max-w-48 text-right text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
