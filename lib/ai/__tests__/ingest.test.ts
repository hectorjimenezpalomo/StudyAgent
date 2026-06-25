import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __ingestTestUtils,
  runIngestDocument,
  type IngestDependencies,
  type SupabaseIngestClient,
} from '../ingest';
import type { TablesInsert } from '@/lib/supabase/types';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

type UpdateCall = {
  table: 'documents';
  values: Record<string, unknown>;
  column: string;
  value: string;
};

type DeleteCall = {
  table: 'chunks';
  column: string;
  value: string;
};

function ok<T>(data: T) {
  return { data, error: null };
}

function createSupabaseMock() {
  const updates: UpdateCall[] = [];
  const deletes: DeleteCall[] = [];
  const insertedChunks: TablesInsert<'chunks'>[][] = [];

  const supabase = {
    from(table: 'documents' | 'chunks') {
      if (table === 'documents') {
        return {
          update(values: Record<string, unknown>) {
            return {
              async eq(column: string, value: string) {
                updates.push({ table, values, column, value });
                return ok(null);
              },
            };
          },
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return ok({
                      id: DOCUMENT_ID,
                      storage_path: `${USER_ID}/${DOCUMENT_ID}.pdf`,
                      user_id: USER_ID,
                    });
                  },
                };
              },
            };
          },
        };
      }

      return {
        delete() {
          return {
            async eq(column: string, value: string) {
              deletes.push({ table, column, value });
              return ok(null);
            },
          };
        },
        async insert(values: TablesInsert<'chunks'>[]) {
          insertedChunks.push(values);
          return ok(null);
        },
      };
    },
    storage: {
      from(bucket: 'documents') {
        return {
          async download(path: string) {
            return ok(new Blob([`pdf:${bucket}:${path}`], { type: 'application/pdf' }));
          },
        };
      },
    },
  } as unknown as SupabaseIngestClient;

  return { supabase, updates, deletes, insertedChunks };
}

function createDeps(
  supabase: SupabaseIngestClient,
  overrides: Partial<Omit<IngestDependencies, 'supabase'>> = {}
): IngestDependencies {
  return {
    supabase,
    embedTexts: async (texts) => texts.map(() => EMBEDDING),
    parsePdf: async () => ({
      text: 'Este PDF contiene texto suficiente para crear un chunk.',
      numpages: 2,
    }),
    now: () => '2026-05-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('runIngestDocument', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('procesa un PDF y marca el documento como ready', async () => {
    const { supabase, updates, deletes, insertedChunks } = createSupabaseMock();

    await runIngestDocument(DOCUMENT_ID, createDeps(supabase));

    expect(updates[0].values).toMatchObject({
      status: 'ingesting',
      error_message: null,
    });
    expect(deletes).toEqual([
      { table: 'chunks', column: 'document_id', value: DOCUMENT_ID },
    ]);
    expect(insertedChunks[0]).toHaveLength(1);
    expect(insertedChunks[0][0]).toMatchObject({
      document_id: DOCUMENT_ID,
      user_id: USER_ID,
      chunk_index: 0,
      page_number: null,
      embedding: __ingestTestUtils.serializeEmbedding(EMBEDDING),
    });
    expect(updates.at(-1)?.values).toMatchObject({
      status: 'ready',
      error_message: null,
      page_count: 2,
      ingested_at: '2026-05-18T12:00:00.000Z',
    });
  });

  it('marca error si el PDF no tiene texto extraible', async () => {
    const { supabase, updates, insertedChunks } = createSupabaseMock();

    await runIngestDocument(
      DOCUMENT_ID,
      createDeps(supabase, {
        parsePdf: async () => ({ text: '   ', numpages: 1 }),
      })
    );

    expect(insertedChunks).toHaveLength(0);
    expect(updates.at(-1)?.values).toMatchObject({
      status: 'error',
      error_message: 'El PDF no contiene texto extraible',
    });
  });

  it('marca error si falla embeddings', async () => {
    const { supabase, updates, insertedChunks } = createSupabaseMock();

    await runIngestDocument(
      DOCUMENT_ID,
      createDeps(supabase, {
        embedTexts: async () => {
          throw new Error('OpenAI no disponible');
        },
      })
    );

    expect(insertedChunks).toHaveLength(0);
    expect(updates.at(-1)?.values).toMatchObject({
      status: 'error',
      error_message: 'OpenAI no disponible',
    });
  });

  it('serializa embeddings para pgvector', () => {
    expect(__ingestTestUtils.serializeEmbedding([1, 2.5, -3])).toBe('[1,2.5,-3]');
  });

  it('marca error si OpenAI devuelve embeddings con otra dimension', async () => {
    const { supabase, updates } = createSupabaseMock();

    const result = await runIngestDocument(
      DOCUMENT_ID,
      createDeps(supabase, {
        embedTexts: async () => [[0.1, 0.2]],
      })
    );

    expect(result).toMatchObject({ ok: false });
    expect(updates.at(-1)?.values).toMatchObject({
      status: 'error',
      error_message: 'OpenAI devolvio embeddings con una dimension inesperada',
    });
  });
});
