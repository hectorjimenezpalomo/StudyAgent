# ROADMAP.md

## Estado actual

Fases 1-5 completas. Auth, upload, ingesta con embeddings, chat con RAG, agente con tool calling, persistencia de conversaciones, tests unitarios y e2e, despliegue.

## Trabajo futuro (sin prioridad fijada)

- Export real a Anki (`.apkg`) para flashcards generadas.
- Hybrid search: combinar pgvector con BM25 (`tsvector`) para mejorar recall en queries con términos exactos.
- Reranking de chunks con cross-encoder antes de pasar al LLM.
- Resumen jerárquico para documentos largos (la tool actual carga el documento entero, falla en PDFs grandes).
- Multi-modal: subir imágenes (capturas de pizarra) y procesarlas con visión.
- Compartir documentos entre usuarios con permisos explícitos.
- Métricas de coste por usuario expuestas en `/admin`.

## Cómo añadir una feature

1. Acceptance criteria concretos en un issue antes de codear.
2. Si toca BBDD: migración nueva + `npm run db:types`.
3. Si toca tools del agente: entry nueva en `ARCHITECTURE.md`, schema zod en `lib/ai/tools.ts`.
4. Tests en `lib/ai/__tests__` o `app/api/.../*.test.ts`.
5. Verificación local: `npm run typecheck && npm run test && npm run build`.
