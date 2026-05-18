import { redirect } from 'next/navigation';
import { DeleteDocumentButton } from '@/components/documents/DeleteDocumentButton';
import { UploadButton } from '@/components/documents/UploadButton';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

type DocumentRow = Tables<'documents'>;

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/documents');
  }

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });
  const documents = (data ?? []) as DocumentRow[];

  if (error) {
    console.error('[documents/page] select', error);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Documentos
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sube PDFs para dejarlos preparados para la ingesta de la siguiente
            fase.
          </p>
        </div>
        <UploadButton />
      </div>

      {error ? (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error al cargar documentos.
        </p>
      ) : null}

      <div className="mt-6">
        {documents && documents.length > 0 ? (
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="grid gap-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">{doc.title}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>Estado: {doc.status}</span>
                    <span>{formatBytes(doc.size_bytes)}</span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                </div>
                <DeleteDocumentButton documentId={doc.id} title={doc.title} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">Aun no has subido ningun documento.</p>
        )}
      </div>
    </div>
  );
}
