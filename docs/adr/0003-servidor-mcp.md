# 0003 — MCP server over agent tools

## Context

StudyAgent already defines five zod-validated tools through `createAgentTools(context)`. Exposing the same implementations through Model Context Protocol avoids duplicating retrieval and study-tool behavior.

## Decision

- Add a stdio server in `mcp-server/index.ts` using `@modelcontextprotocol/sdk`. Register every tool with the same zod shape and description.
- Use the service-role client and defense-in-depth filtering for one fixed `MCP_USER_ID`. Build `allowedDocumentIds` only from that user's ready documents. There is no per-request session, so the user is fixed per process.
- Send every log to `console.error` with the `[mcp/server]` prefix because stdout belongs to MCP.

## Consequences

- Service-role bypasses RLS, leaving the validated user filter as the isolation boundary. This process must never be network-exposed; it is local stdio for one trusted desktop client.
- A real multi-user server would require per-request authentication and is out of scope.
- `mcp-server/context.ts` remains independently testable with a Supabase mock.
