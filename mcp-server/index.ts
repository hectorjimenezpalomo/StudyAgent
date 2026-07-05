/**
 * Servidor MCP (stdio) que expone las 5 tools del agente StudyAgent
 * (`search_documents`, `generate_quiz`, `generate_summary`,
 * `generate_flashcards`, `explain_concept`) a clientes MCP como Claude Desktop
 * o Cursor.
 *
 * Reutiliza `createAgentTools(context)`: el mismo schema zod, la misma
 * descripción y el mismo `execute` que usa el agente en /api/chat. El contexto
 * fija el usuario a `MCP_USER_ID` y solo expone sus documentos `ready`.
 *
 * Arranque: `npm run mcp` (carga `.env.local`).
 *
 * ⚠️ TODO log va a `console.error`: stdout pertenece al protocolo MCP.
 * ⚠️ Usa service-role (salta RLS). NUNCA exponer este proceso a red. Ver docs/mcp.md.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import { createAgentTools } from '../lib/ai/tools';
import { createAdminClient } from '../lib/supabase/admin';
import { buildAgentToolContext, loadMcpConfig } from './context';

/**
 * Forma estructural mínima de una tool del AI SDK que necesitamos para
 * registrarla en MCP. Las tools de `createAgentTools` la cumplen: `parameters`
 * es siempre un `z.object` (tiene `.shape`) y `execute` está definido.
 */
type AiSdkTool = {
  description?: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute?: (args: unknown, options: unknown) => Promise<unknown>;
};

function toTextResult(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function registerAgentTool(server: McpServer, name: string, aiTool: AiSdkTool): void {
  server.registerTool(
    name,
    {
      description: aiTool.description ?? name,
      inputSchema: aiTool.parameters.shape,
    },
    async (args: unknown): Promise<CallToolResult> => {
      try {
        const result = await aiTool.execute?.(args, {
          toolCallId: `mcp-${name}`,
          messages: [],
        });
        return toTextResult(result ?? { message: 'La tool no devolvió resultado.' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mcp/server] tool ${name} falló:`, message);
        return {
          content: [{ type: 'text', text: `Error al ejecutar ${name}: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

async function main(): Promise<void> {
  const config = loadMcpConfig();

  // createAdminClient lee las mismas env vars ya validadas por loadMcpConfig.
  const supabase = createAdminClient();
  const context = await buildAgentToolContext(
    supabase as unknown as Parameters<typeof buildAgentToolContext>[0],
    config.userId
  );

  console.error(
    `[mcp/server] usuario=${config.userId} documentos_ready=${context.allowedDocumentIds.length}`
  );

  const tools = createAgentTools(context);
  const server = new McpServer({ name: 'studyagent', version: '0.1.0' });

  for (const [name, aiTool] of Object.entries(tools)) {
    registerAgentTool(server, name, aiTool as unknown as AiSdkTool);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp/server] listo (stdio). Tools: ' + Object.keys(tools).join(', '));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[mcp/server] ${message}`);
  process.exit(1);
});
