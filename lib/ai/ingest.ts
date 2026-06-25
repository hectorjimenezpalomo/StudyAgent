import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables, TablesInsert } from '@/lib/supabase/types';
import { chunkPages, chunkText, type ExtractedPage } from './chunker';
import { embed } from './embeddings';
import { AI_CONFIG } from './config';

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
  pages?: ExtractedPage[];
};

export type IngestResult =
  | { ok: true }
  | { ok: false; error: string };

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

function isPdfPage(value: unknown): value is {
  getTextContent: (options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<unknown>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getTextContent' in value &&
    typeof value.getTextContent === 'function'
  );
}

function parsePageText(value: unknown): string {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) {
    throw new Error('El extractor devolvio una pagina invalida');
  }

  return value.items
    .map((item) => {
      if (item && typeof item === 'object' && 'str' in item && typeof item.str === 'string') {
        return item.str;
      }
      return '';
    })
    .join(' ')
    .trim();
}

async function loadPdfParse() {
  const pdfParse = (await import('pdf-parse')).default;
  return async (buffer: Buffer): Promise<PdfParseResult> => {
    const pages: ExtractedPage[] = [];
    const parsed = await pdfParse(buffer, {
      pagerender: async (pageData) => {
        if (!isPdfPage(pageData)) {
          throw new Error('El extractor devolvio una pagina invalida');
        }

        const text = parsePageText(
          await pageData.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false,
          })
        );
        pages.push({ pageNumber: pages.length + 1, text });
        return text;
      },
    });

    return {
      text: parsed.text,
      numpages: parsed.numpages,
      pages,
    };
  };
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
): Promise<IngestResult> {
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

    const chunks =
      parsedPdf.pages && parsedPdf.pages.length > 0
        ? chunkPages(parsedPdf.pages)
        : chunkText(text);
    if (chunks.length === 0) {
      throw new Error('No se pudieron generar chunks del PDF');
    }

    const embeddings = await deps.embedTexts(chunks.map((chunk) => chunk.content));
    if (embeddings.length !== chunks.length) {
      throw new Error('OpenAI devolvio un numero inesperado de embeddings');
    }
    if (embeddings.some((embedding) => embedding.length !== AI_CONFIG.embeddingDimensions)) {
      throw new Error('OpenAI devolvio embeddings con una dimension inesperada');
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
    return { ok: true };
  } catch (error) {
    console.error('[ai/ingest]', error);
    await markDocumentError(supabase, parsedDocumentId.data, error);
    return { ok: false, error: errorMessage(error) };
  }
}

export async function ingestDocument(documentId: string): Promise<IngestResult> {
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
  parsePageText,
};
