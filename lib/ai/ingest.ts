import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables, TablesInsert } from '@/lib/supabase/types';
import { chunkText } from './chunker';
import { embed } from './embeddings';

type DocumentRow = Pick<Tables<'documents'>, 'id' | 'storage_path' | 'user_id'>;
type ChunkInsert = TablesInsert<'chunks'>;

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export type SupabaseIngestClient = {
  from(table: 'documents'): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<QueryResult<unknown>>;
    };
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<QueryResult<DocumentRow>>;
      };
    };
  };
  from(table: 'chunks'): {
    delete(): {
      eq(column: string, value: string): Promise<QueryResult<unknown>>;
    };
    insert(values: ChunkInsert[]): Promise<QueryResult<unknown>>;
  };
  storage: {
    from(bucket: 'documents'): {
      download(path: string): Promise<QueryResult<Blob>>;
    };
  };
};

type PdfParseResult = {
  text?: string;
  numpages?: number;
};

export type IngestDependencies = {
  supabase: SupabaseIngestClient;
  embedTexts: (texts: string[]) => Promise<number[][]>;
  parsePdf: (buffer: Buffer) => Promise<PdfParseResult>;
  now: () => string;
};

const documentIdSchema = z.string().uuid();
const MAX_ERROR_MESSAGE_LENGTH = 500;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }

  return 'Error desconocido durante la ingesta';
}

function serializeEmbedding(embedding: number[]) {
  return `[${embedding.join(',')}]`;
}

async function loadPdfParse() {
  const pdfParse = (await import('pdf-parse')).default;
  return async (buffer: Buffer) => pdfParse(buffer) as Promise<PdfParseResult>;
}

async function markDocumentError(
  supabase: SupabaseIngestClient,
  documentId: string,
  error: unknown
) {
  const { error: updateError } = await supabase
    .from('documents')
    .update({
      status: 'error',
      error_message: errorMessage(error),
    })
    .eq('id', documentId);

  if (updateError) {
    console.error('[ai/ingest] mark error', updateError);
  }
}

export async function runIngestDocument(
  documentId: string,
  deps: IngestDependencies
): Promise<void> {
  const parsedDocumentId = documentIdSchema.safeParse(documentId);
  if (!parsedDocumentId.success) {
    throw new Error('Id de documento invalido');
  }

  const { supabase } = deps;

  try {
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id, storage_path, user_id')
      .eq('id', parsedDocumentId.data)
      .maybeSingle();

    if (documentError) {
      throw new Error(`Error al cargar documento: ${documentError.message}`);
    }

    if (!document) {
      throw new Error('Documento no encontrado');
    }

    const { error: ingestingError } = await supabase
      .from('documents')
      .update({
        status: 'ingesting',
        error_message: null,
      })
      .eq('id', document.id);

    if (ingestingError) {
      throw new Error(`Error al marcar ingesta: ${ingestingError.message}`);
    }

    const { error: deleteChunksError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', document.id);

    if (deleteChunksError) {
      throw new Error(`Error al limpiar chunks previos: ${deleteChunksError.message}`);
    }

    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path);

    if (downloadError || !pdfBlob) {
      throw new Error(
        `Error al descargar PDF: ${downloadError?.message ?? 'archivo no encontrado'}`
      );
    }

    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
    const parsedPdf = await deps.parsePdf(pdfBuffer);
    const text = parsedPdf.text?.trim() ?? '';

    if (text.length === 0) {
      throw new Error('El PDF no contiene texto extraible');
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error('No se pudieron generar chunks del PDF');
    }

    const embeddings = await deps.embedTexts(chunks.map((chunk) => chunk.content));
    if (embeddings.length !== chunks.length) {
      throw new Error('OpenAI devolvio un numero inesperado de embeddings');
    }

    const chunkRows = chunks.map((chunk, index): ChunkInsert => ({
      document_id: document.id,
      user_id: document.user_id,
      content: chunk.content,
      chunk_index: chunk.index,
      page_number: chunk.pageNumber ?? null,
      embedding: serializeEmbedding(embeddings[index]),
    }));

    const { error: insertChunksError } = await supabase
      .from('chunks')
      .insert(chunkRows);

    if (insertChunksError) {
      throw new Error(`Error al guardar chunks: ${insertChunksError.message}`);
    }

    const { error: readyError } = await supabase
      .from('documents')
      .update({
        status: 'ready',
        error_message: null,
        page_count: parsedPdf.numpages ?? null,
        ingested_at: deps.now(),
      })
      .eq('id', document.id);

    if (readyError) {
      throw new Error(`Error al finalizar ingesta: ${readyError.message}`);
    }
  } catch (error) {
    console.error('[ai/ingest]', error);
    await markDocumentError(supabase, parsedDocumentId.data, error);
  }
}

export async function ingestDocument(documentId: string): Promise<void> {
  const parsePdf = await loadPdfParse();

  return runIngestDocument(documentId, {
    supabase: createAdminClient() as unknown as SupabaseIngestClient,
    embedTexts: embed,
    parsePdf,
    now: () => new Date().toISOString(),
  });
}

export const __ingestTestUtils = {
  serializeEmbedding,
  errorMessage,
};
