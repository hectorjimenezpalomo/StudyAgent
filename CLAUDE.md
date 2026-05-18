# CLAUDE.md

Briefing inicial para Claude Code (o cualquier agente de codificación). Léelo entero antes de empezar.

## Tu trabajo

Implementar StudyAgent siguiendo `ROADMAP.md` fase por fase. Las decisiones de arquitectura, dependencias y patrones ya están tomadas y documentadas en `AGENTS.md` y `ARCHITECTURE.md`. No las cambies sin justificación explícita en el commit.

## Orden de trabajo

Empieza por la Fase 1 del `ROADMAP.md`. No saltes a fases posteriores hasta que la actual funcione end-to-end. Cada fase debe ser demoable: cuando termines la Fase 1, yo (el usuario) debería poder subir un PDF y verlo en la lista, aunque todavía no esté chunkeado.

## Antes de cada cambio

1. Lee la sección relevante de `ROADMAP.md`.
2. Lee `ARCHITECTURE.md` para los nombres exactos de tablas, rutas y tipos.
3. Lee la regla correspondiente en `AGENTS.md` (especialmente las marcadas como ABSOLUTAS).
4. Si hay un stub con `// TODO Codex:` en el archivo que vas a tocar, sigue las instrucciones de ese comentario.

## Convenciones de commits

- Un commit por feature pequeña, no commits gigantes.
- Mensaje en imperativo y en inglés: `add upload route`, `implement chunker with paragraph-aware splitting`, `wire chat to RAG endpoint`.
- Si te desvías de una regla de `AGENTS.md`, dilo en el mensaje y actualiza `AGENTS.md` en el mismo commit.

## Tests

- Hay tests en `lib/ai/__tests__/chunker.test.ts` que definen el comportamiento esperado del chunker. Tu implementación debe hacerlos pasar.
- Cuando añadas lógica nueva en `lib/ai/`, añade tests del mismo estilo.
- No tienes que tener coverage del 100%. Sí debes cubrir: chunker, validación de schemas zod de las tools, la función que construye el prompt de RAG.

## Cuando termines una fase

1. Verifica que `npm run typecheck` pasa sin errores.
2. Verifica que `npm run test` pasa.
3. Si la fase añade UI, verifica que `npm run dev` arranca sin warnings críticos.
4. Actualiza el checkbox correspondiente en `ROADMAP.md`.
5. Para la Fase 5 (despliegue), añade vídeo demo al README.

## Preguntas que NO debes responder por tu cuenta

Si encuentras una de estas situaciones, para y pregunta al humano:

- Cambiar el modelo de OpenAI o las dimensiones del embedding.
- Añadir una tabla nueva a la base de datos.
- Añadir una nueva herramienta al agente que no esté en `ARCHITECTURE.md`.
- Añadir una dependencia que no esté en `package.json`.
- Cambiar de Supabase a otro proveedor.

Cualquier otra decisión técnica menor (cómo estilar un botón, cómo organizar imports, cómo nombrar una variable interna) la tomas tú con criterio.

## Primera instrucción concreta

Empieza implementando la Fase 1:

1. Completa `lib/supabase/client.ts` y `lib/supabase/server.ts` (ya están bien, verifica que compilan).
2. Genera los tipos de Supabase: tras aplicar las migraciones a la BBDD, ejecuta `npm run db:types`.
3. Implementa `/login` con formulario email+password y botón de Google OAuth.
4. Implementa `/(auth)/callback/route.ts` para cerrar el flujo OAuth.
5. Verifica que el middleware redirige correctamente (`middleware.ts` ya casi está).
6. Implementa el componente de subida en `/documents` y la ruta `POST /api/upload` (los stubs ya están).

Cuando esto funcione (puedo subir un PDF y aparece en la lista con status `pending`), pasa a la Fase 2.
