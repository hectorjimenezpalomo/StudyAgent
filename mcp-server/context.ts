/**
 * Construcción del contexto del servidor MCP.
 *
 * Aislado de `index.ts` para poder testear el builder con un mock de Supabase.
 *
 * SEGURIDAD: el server usa el cliente service-role (salta RLS). La única barrera
 * es el filtro por `MCP_USER_ID`: solo se exponen documentos `status='ready'`
 * de ese usuario. Ver docs/adr/0003.
 */

import { z } from 'zod';
import type { AgentToolContext } from '@/lib/ai/tools';
import type { Tables } from '@/lib/supabase/types';

const mcpConfigSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  MCP_USER_ID: z.string().uuid(),
});

export interface McpConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  openaiApiKey: string;
  userId: string;
}

/**
 * Valida el entorno del proceso MCP. Lanza con un mensaje accionable si falta
 * o es inválida alguna variable (para salir limpio al arrancar).
 */
export function loadMcpConfig(
  env: Record<string, string | undefined> = process.env
): McpConfig {
  const parsed = mcpConfigSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`[mcp/server] Configuración inválida: ${detail}`);
  }
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    openaiApiKey: parsed.data.OPENAI_API_KEY,
    userId: parsed.data.MCP_USER_ID,
  };
}

type DocumentRow = Pick<Tables<'documents'>, 'id' | 'title'>;

/**
 * Cliente Supabase mínimo que necesita el builder: listar los documentos
 * `ready` del usuario. El resto de capacidades (rpc de retrieval, from('chunks'))
 * las consume `createAgentTools` a través del mismo cliente.
 */
export interface DocumentsSupabase {
  from(table: 'documents'): {
    select(columns: 'id, title'): {
      eq(
        column: 'user_id',
        value: string
      ): {
        eq(
          column: 'status',
          value: 'ready'
        ): PromiseLike<{ data: DocumentRow[] | null; error: { message: string } | null }>;
      };
    };
  };
}

/**
 * Construye el `AgentToolContext` para el usuario fijo del server MCP, cargando
 * sus documentos `ready`. Lanza si la query falla.
 */
export async function buildAgentToolContext(
  supabase: DocumentsSupabase,
  userId: string
): Promise<AgentToolContext> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, title')
    .eq('user_id', userId)
    .eq('status', 'ready');

  if (error) {
    throw new Error(`[mcp/server] No se pudieron cargar los documentos: ${error.message}`);
  }

  const documents = data ?? [];
  return {
    userId,
    allowedDocumentIds: documents.map((document) => document.id),
    allowedDocuments: documents,
    supabase: supabase as unknown as AgentToolContext['supabase'],
  };
}
