# 0003 — Servidor MCP sobre las tools del agente

## Contexto

La oferta menciona MCP (Model Context Protocol) por nombre. Ya tenemos 5 tools
del agente bien definidas (`search_documents`, `generate_quiz`,
`generate_summary`, `generate_flashcards`, `explain_concept`) creadas con
`createAgentTools(context)`, con schema zod y contexto inyectable. Exponerlas
como servidor MCP es el ítem con mejor ratio señal/esfuerzo: reutiliza todo.

## Decisión

- Añadir `mcp-server/index.ts` (servidor MCP stdio con
  `@modelcontextprotocol/sdk`) que reutiliza `createAgentTools`, registrando cada
  tool con su **mismo shape zod** y descripción.
- Auth: el server usa el cliente **service-role** (salta RLS) y filtra en
  profundidad por un `MCP_USER_ID` fijo (uuid del usuario cuyos documentos se
  sirven), construyendo `allowedDocumentIds` desde `documents` con
  `status='ready'`. Es el mismo patrón de defensa en profundidad que las rutas
  API, pero sin sesión: por eso el user es fijo por proceso.
- Todo log va a `console.error` (stdout pertenece al protocolo MCP), prefijo
  `[mcp/server]`.

## Consecuencias

- Trade-off de seguridad explícito: al saltar RLS con service-role, la única
  barrera es el filtro por `MCP_USER_ID`. **Este server NUNCA debe exponerse a
  red**; es stdio local para un cliente de escritorio de confianza. Documentado
  en `docs/mcp.md`.
- Multi-usuario real requeriría auth por request (fuera de alcance de Nivel 1).
- El contexto (`mcp-server/context.ts`) es testeable de forma aislada con un mock
  de Supabase.
