import { describe, expect, it, vi } from 'vitest';
import { buildAgentToolContext, loadMcpConfig, type DocumentsSupabase } from '../context';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DOC_A = '22222222-2222-4222-8222-222222222222';
const DOC_B = '33333333-3333-4333-8333-333333333333';

function createDocumentsSupabase(
  response: { data: Array<{ id: string; title: string }> | null; error: { message: string } | null }
): { supabase: DocumentsSupabase; statusEq: ReturnType<typeof vi.fn> } {
  const statusEq = vi.fn(async () => response);
  const userEq = vi.fn(() => ({ eq: statusEq }));
  const select = vi.fn(() => ({ eq: userEq }));
  const from = vi.fn(() => ({ select }));
  return { supabase: { from } as unknown as DocumentsSupabase, statusEq };
}

describe('loadMcpConfig', () => {
  const validEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    OPENAI_API_KEY: 'sk-test',
    MCP_USER_ID: USER_ID,
  };

  it('acepta un entorno válido', () => {
    expect(loadMcpConfig(validEnv)).toEqual({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role',
      openaiApiKey: 'sk-test',
      userId: USER_ID,
    });
  });

  it('lanza si MCP_USER_ID no es un uuid', () => {
    expect(() =>
      loadMcpConfig({ ...validEnv, MCP_USER_ID: 'not-a-uuid' })
    ).toThrow(/MCP_USER_ID/);
  });

  it('lanza si falta una env var requerida', () => {
    const { OPENAI_API_KEY, ...rest } = validEnv;
    void OPENAI_API_KEY;
    expect(() => loadMcpConfig(rest)).toThrow(/OPENAI_API_KEY/);
  });
});

describe('buildAgentToolContext', () => {
  it('produce allowedDocumentIds y allowedDocuments desde los documentos ready', async () => {
    const { supabase, statusEq } = createDocumentsSupabase({
      data: [
        { id: DOC_A, title: 'Arquitectura' },
        { id: DOC_B, title: 'Redes' },
      ],
      error: null,
    });

    const context = await buildAgentToolContext(supabase, USER_ID);

    expect(statusEq).toHaveBeenCalledWith('status', 'ready');
    expect(context.userId).toBe(USER_ID);
    expect(context.allowedDocumentIds).toEqual([DOC_A, DOC_B]);
    expect(context.allowedDocuments).toEqual([
      { id: DOC_A, title: 'Arquitectura' },
      { id: DOC_B, title: 'Redes' },
    ]);
  });

  it('devuelve listas vacías si el usuario no tiene documentos ready', async () => {
    const { supabase } = createDocumentsSupabase({ data: [], error: null });
    const context = await buildAgentToolContext(supabase, USER_ID);
    expect(context.allowedDocumentIds).toEqual([]);
    expect(context.allowedDocuments).toEqual([]);
  });

  it('lanza si la query de documentos falla', async () => {
    const { supabase } = createDocumentsSupabase({ data: null, error: { message: 'boom' } });
    await expect(buildAgentToolContext(supabase, USER_ID)).rejects.toThrow(/boom/);
  });
});
