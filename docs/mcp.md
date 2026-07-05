# Servidor MCP de StudyAgent

Expone las 5 tools del agente como un **servidor MCP (Model Context Protocol)**
por stdio, para consumirlas desde clientes MCP como Claude Desktop o Cursor.
Reutiliza `createAgentTools(context)`: mismos schemas zod, mismas descripciones y
mismo `execute` que el agente de `/api/chat`.

Tools expuestas: `search_documents`, `generate_quiz`, `generate_summary`,
`generate_flashcards`, `explain_concept`.

## Seguridad (léelo antes de arrancarlo)

- El server usa el **cliente service-role**, que **salta RLS**. La única barrera
  de aislamiento es el filtro por `MCP_USER_ID`: solo se cargan documentos con
  `status='ready'` de ese usuario, y las tools filtran en profundidad sobre
  `allowedDocumentIds`.
- Por eso el usuario es **fijo por proceso** (no hay sesión). Un despliegue
  multiusuario real necesitaría auth por request, fuera del alcance actual.
- **NUNCA expongas este proceso a red.** Es stdio local para un cliente de
  escritorio de confianza. No lo pongas detrás de un puerto ni un túnel.
- Todos los logs van a `console.error` (stdout pertenece al protocolo MCP).

Decisión y trade-offs en `docs/adr/0003-servidor-mcp.md`.

## Variables de entorno

El server valida el entorno con zod al arrancar y sale con un mensaje claro si
falta algo:

| var | uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | cliente admin (salta RLS) |
| `OPENAI_API_KEY` | embeddings de `search_documents` (y generación si `AI_PROVIDER=openai`) |
| `MCP_USER_ID` | uuid del usuario cuyos documentos se sirven |

Opcionales heredadas de la app: `AI_PROVIDER`, `GOOGLE_GENERATIVE_AI_API_KEY`,
`RAG_RETRIEVAL_MODE`, `RERANK_PROVIDER`, etc.

## Arrancar en local

```powershell
npm run mcp
```

Equivale a `node --import tsx --env-file=.env.local mcp-server/index.ts` (el
loader `tsx` resuelve TypeScript y los imports sin extensión). Añade
`MCP_USER_ID=<tu-uuid>` a `.env.local` (el uuid de `auth.users` cuyo material
quieres servir).

## Probarlo con el inspector

```powershell
npx @modelcontextprotocol/inspector node --import tsx --env-file=.env.local mcp-server/index.ts
```

En el inspector: **List Tools** debe mostrar las 5; llama `search_documents` con
`{ "query": "..." }` y comprueba que devuelve chunks con sus fuentes.

## Config para Claude Desktop (Windows)

Edita `%APPDATA%\Claude\claude_desktop_config.json`. Usa rutas **absolutas** y
pasa las env directamente (el proceso no lee `.env.local` si lo lanza el cliente):

```json
{
  "mcpServers": {
    "studyagent": {
      "command": "node",
      "args": [
        "--import",
        "tsx",
        "C:\\Users\\<tu-usuario>\\...\\studyagent\\mcp-server\\index.ts"
      ],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://<ref>.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service-role-key>",
        "OPENAI_API_KEY": "sk-...",
        "MCP_USER_ID": "<uuid-del-usuario>"
      }
    }
  }
}
```

Reinicia Claude Desktop; las tools de `studyagent` aparecerán en el selector.
