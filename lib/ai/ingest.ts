/**
 * Pipeline de ingesta: descarga PDF de Storage, extrae texto, chunkea, embedea, persiste.
 * Se invoca desde POST /api/upload tras guardar el archivo en Storage.
 *
 * Diseñado para ser idempotente: si se reintenta sobre un documento ya 'ready',
 * primero borra chunks previos y vuelve a procesar.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { chunkText } from './chunker';
import { embed } from './embeddings';

export async function ingestDocument(documentId: string): Promise<void> {
  const supabase = createAdminClient();

  // TODO Codex: implementar siguiendo estos pasos:
  //
  // 1) Marcar documento como 'ingesting': UPDATE documents SET status='ingesting' WHERE id=documentId
  //
  // 2) Cargar metadata del documento (storage_path, user_id, page_count si existe)
  //
  // 3) Borrar chunks previos si los hubiera (idempotencia):
  //    DELETE FROM chunks WHERE document_id=documentId
  //
  // 4) Descargar el PDF desde Supabase Storage:
  //    supabase.storage.from('documents').download(storage_path)
  //
  // 5) Extraer texto con pdf-parse. Importar dinámicamente porque tiene side effects en build:
  //    const pdfParse = (await import('pdf-parse')).default;
  //    const { text, numpages } = await pdfParse(buffer);
  //
  // 6) chunks = chunkText(text)
  //
  // 7) embeddings = await embed(chunks.map(c => c.content))
  //
  // 8) Insertar todos los chunks en una sola operación:
  //    supabase.from('chunks').insert(chunks.map((c, i) => ({
  //      document_id, user_id, content: c.content,
  //      chunk_index: c.index, page_number: c.pageNumber ?? null,
  //      embedding: embeddings[i],
  //    })))
  //
  // 9) Marcar como ready:
  //    UPDATE documents SET status='ready', page_count=numpages, ingested_at=now() WHERE id=documentId
  //
  // 10) En catch: UPDATE documents SET status='error', error_message=err.message
  //     Loggear con prefijo [ai/ingest].
  //
  // Considerar: si el PDF está vacío o pdf-parse falla, marcar como error con mensaje claro.

  throw new Error('ingestDocument no implementada todavía');
}
