# CODEX.md

Briefing para agentes de codificación (Codex, Claude Code, Cursor).

## Antes de tocar el repo

1. `AGENTS.md` — reglas absolutas.
2. `ARCHITECTURE.md` — catálogo de nombres y tipos.
3. `ROADMAP.md` — trabajo pendiente o futuro.

## Cómo trabajas aquí

- Implementas siguiendo las reglas de `AGENTS.md`. Si una parece arbitraria, asume que tiene razón.
- Si vas a desviarte de una regla, justifícalo en el mensaje del commit y actualiza `AGENTS.md` en el mismo commit.
- Los archivos `*.test.ts` definen el comportamiento esperado. Tu implementación debe hacerlos pasar.
- Si un cambio toca BBDD, tools del agente, o políticas RLS, lee la regla 2 de `AGENTS.md` antes de empezar.

## Decisiones que NO tomas tú

Ver la sección "Decisiones que NO toma el agente" de `AGENTS.md`. Esas requieren PR con propuesta y revisión humana.

## Verificación antes de marcar una tarea como hecha

```
npm run typecheck
npm run test
npm run build
```

Si la tarea toca UI o flujos críticos, además `npm run test:e2e`.
