# 0001 — Proveedor de chat multiproveedor (OpenAI ↔ Gemini)

## Contexto

La oferta de Intern AI Engineer lista Vertex AI/Gemini como nice-to-have y el
proyecto es 100% OpenAI. Queremos poder comparar proveedores con el mismo
harness de evals sin reescribir el pipeline. El dueño NO tiene cuenta GCP, así
que Vertex AI (que exige proyecto GCP + credenciales de servicio) no es viable
todavía.

## Decisión

- Añadir `AI_PROVIDER=openai|google` (default `openai`) y una factoría
  `lib/ai/provider.ts::getChatModel()` que es el único punto que conoce el SDK
  de proveedor. Todos los call sites de chat/generación pasan por ella.
- Usar **Gemini vía Google AI Studio** (`@ai-sdk/google`, env
  `GOOGLE_GENERATIVE_AI_API_KEY`, API key gratuita), NO `@ai-sdk/google-vertex`.
  Migrar a Vertex más adelante = sustituir el import del SDK en `provider.ts`;
  ningún otro archivo cambia.
- `@ai-sdk/google` se fija en major 1 (compatible con `ai@^4`); la v2 exige AI
  SDK 5.
- **Los embeddings NO migran**: siguen en OpenAI `text-embedding-3-small`
  (1536D). El índice HNSW está horneado a 1536D y cambiar de modelo obliga a
  re-ingestar todo el corpus (ver AGENTS.md regla 6). `OPENAI_API_KEY` sigue
  siendo obligatoria aunque `AI_PROVIDER=google`.

## Consecuencias

- Se puede publicar una matriz `provider × retrieval_mode × reranker` con el
  harness existente.
- El reranker `llm` y el judge de evals heredan el proveedor activo; el default
  del reranker deja de estar hardcodeado a `gpt-4o-mini` para no cargar un modelo
  OpenAI bajo el proveedor Google.
- Añadir la dependencia es una "decisión humana" (AGENTS.md): tomada por el dueño
  en esta sesión y registrada aquí y en el mensaje de commit.
