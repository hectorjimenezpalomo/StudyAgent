/**
 * Página de documentos. Lista los PDFs del usuario y permite subir nuevos.
 *
 * TODO Codex:
 * - Server component que carga la lista de documents del usuario (createClient de server.ts).
 * - Render de tabla/lista con título, estado, fecha, tamaño, botón de borrar.
 * - Componente cliente <UploadButton /> que hace POST /api/upload con un FormData.
 * - Polling del estado mientras alguno esté pending o ingesting (cada 2s).
 */

import { createClient } from '@/lib/supabase/server';

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documentos</h1>
        {/* TODO: <UploadButton /> */}
      </div>

      <div className="mt-6">
        {documents && documents.length > 0 ? (
          <ul className="divide-y divide-slate-200">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-sm text-slate-500">Estado: {doc.status}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">Aún no has subido ningún documento.</p>
        )}
      </div>
    </div>
  );
}
