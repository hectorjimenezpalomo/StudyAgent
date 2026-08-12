# StudyAgent MCP server

The local stdio server exposes `search_documents`, `generate_quiz`, `generate_summary`, `generate_flashcards`, and `explain_concept`. It reuses `createAgentTools(context)`, including the same zod schemas, descriptions, and implementations as `/api/chat`.

## Security boundary

The server uses the service-role client, which bypasses RLS. A fixed, validated `MCP_USER_ID` is the isolation boundary: context loading selects only that user's ready documents, and every tool filters against `allowedDocumentIds`. There is no per-request session or multi-user authentication.

Never expose this process through a port, tunnel, shared service, or untrusted client. Run it only as local stdio for one trusted desktop client. Keep `SUPABASE_SERVICE_ROLE_KEY`, provider keys, private document content, tool inputs, and results out of logs and configuration committed to Git. All server logs use stderr because stdout belongs to MCP.

## Environment

Required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `MCP_USER_ID`. Provider, retrieval, and reranking variables are inherited from the app. Run `npm run doctor -- --mcp` before starting.

## Run and inspect

```bash
npm run mcp
npx @modelcontextprotocol/inspector node --import tsx --env-file=.env.local mcp-server/index.ts
```

The inspector should list all five tools. Call `search_documents` with a sanitized query and confirm sources are returned.

## Desktop configuration

Use absolute paths. Desktop clients do not necessarily load `.env.local`, so provide secrets through the client's local environment configuration and never commit that file.

```json
{
  "mcpServers": {
    "studyagent": {
      "command": "node",
      "args": ["--import", "tsx", "/absolute/path/to/studyagent/mcp-server/index.ts"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://<ref>.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service-role-key>",
        "OPENAI_API_KEY": "<openai-key>",
        "MCP_USER_ID": "<user-uuid>"
      }
    }
  }
}
```

Restart the client after editing its configuration. Windows uses escaped backslashes in JSON paths. See [ADR 0003](adr/0003-servidor-mcp.md) for the decision and trade-offs. Testing on macOS and Linux is tracked in [issue #8](https://github.com/hectorjimenezpalomo/StudyAgent/issues/8).

