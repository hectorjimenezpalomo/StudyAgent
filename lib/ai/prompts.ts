/**
 * Prompts del sistema. Versionar cualquier cambio aquí como código:
 * commits separados con mensaje explícito.
 */

export const SYSTEM_PROMPT_AGENT = `Eres StudyAgent, un asistente de estudio basado en los documentos personales del usuario. Tu trabajo es ayudar al usuario a aprender, no a hacer su trabajo por él.

Tienes acceso a las siguientes herramientas:

- search_documents: busca pasajes relevantes en los documentos del usuario. Úsala SIEMPRE antes de responder a una pregunta sobre el contenido. NO contestes desde tu conocimiento general si la pregunta es sobre los documentos.
- generate_quiz: genera preguntas tipo test sobre un tema. Úsala cuando el usuario pida "hazme un test", "genérame preguntas", "quiero practicar X".
- generate_summary: resume un documento completo. Úsala cuando el usuario pida "resúmeme el documento X".
- generate_flashcards: genera tarjetas pregunta/respuesta para repaso espaciado. Úsala cuando el usuario pida "fichas", "flashcards", "tarjetas de repaso".
- explain_concept: explica un concepto adaptando el nivel. Úsala cuando el usuario pida explicaciones detalladas o "explícame X como si fuera principiante".

Reglas:

1. Cuando uses search_documents y los resultados sean pobres o vacíos, dilo abiertamente: "no encuentro información sobre eso en tus documentos". No te inventes contenido.
2. Cita siempre las fuentes que has usado al final de tu respuesta, indicando documento y página si está disponible.
3. Responde en el mismo idioma que el usuario.
4. Si la pregunta es ambigua, pide aclaración antes de invocar una herramienta cara.
5. Si el usuario te pide algo fuera del ámbito de estudio (consejos personales, generar contenido para entregar como propio, etc.), redirige amablemente al uso académico.

Sé conciso. Mejor una respuesta de tres frases bien citada que un muro de texto.`;

/**
 * Plantilla para construir el prompt cuando NO usamos tool calling (Fase 3).
 * Inyecta los chunks como contexto.
 */
export function buildRagPrompt(question: string, chunks: { content: string; page_number?: number | null }[]): string {
  const context = chunks
    .map((c, i) => `[Fuente ${i + 1}${c.page_number ? `, página ${c.page_number}` : ''}]\n${c.content}`)
    .join('\n\n---\n\n');

  return `Responde a la pregunta del usuario usando ÚNICAMENTE la información de las fuentes proporcionadas. Si las fuentes no contienen la respuesta, dilo claramente.

FUENTES:
${context}

PREGUNTA:
${question}

Responde de forma concisa y cita las fuentes que usas (por número).`;
}

/**
 * Prompt interno para generate_quiz. Espera respuesta JSON estricta.
 */
export function buildQuizPrompt(topic: string, numQuestions: number, context: string): string {
  return `Genera ${numQuestions} preguntas tipo test sobre "${topic}" basándote ESTRICTAMENTE en el siguiente contexto. Si el contexto no es suficiente, genera las que puedas (puede ser menos de ${numQuestions}).

Cada pregunta debe tener:
- enunciado claro
- 4 opciones
- índice de la respuesta correcta (0-3)
- explicación breve de por qué es correcta

Responde SOLO con JSON válido siguiendo este esquema:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct_index": 0,
      "explanation": "..."
    }
  ]
}

CONTEXTO:
${context}`;
}

/**
 * Prompt para generate_flashcards. Espera JSON.
 */
export function buildFlashcardsPrompt(topic: string, numCards: number, context: string): string {
  return `Genera ${numCards} flashcards (pregunta/respuesta cortas) sobre "${topic}" basándote en el contexto. Las preguntas deben ser específicas y las respuestas concisas (1-3 frases).

Responde SOLO con JSON válido:
{
  "cards": [
    { "question": "...", "answer": "..." }
  ]
}

CONTEXTO:
${context}`;
}

/**
 * Prompt para generate_summary.
 */
export function buildSummaryPrompt(documentText: string, length: 'short' | 'medium' | 'long'): string {
  const targets = {
    short: '5-7 frases capturando solo lo esencial',
    medium: '2-3 párrafos con los puntos principales y sus relaciones',
    long: '5-8 párrafos con detalle, manteniendo la estructura del documento original',
  };

  return `Resume el siguiente documento. Longitud objetivo: ${targets[length]}. Usa el mismo idioma del documento original.

DOCUMENTO:
${documentText}`;
}

/**
 * Prompt del reranker LLM. Listwise: pide una puntuación 0-10 por documento.
 * El llamante debe shufflear los documentos antes para mitigar position bias.
 */
export function buildRerankPrompt(query: string, documents: string[]): string {
  const docList = documents
    .map((doc, i) => `Documento ${i + 1}:\n${doc}`)
    .join('\n\n---\n\n');

  return `Tu tarea es puntuar la relevancia de cada documento respecto a una consulta. Devuelve un score entre 0 y 10 para CADA documento:

- 10: contiene exactamente la respuesta a la consulta.
- 7-9: muy relevante, contiene parte sustancial de la respuesta.
- 4-6: relacionado con el tema pero no responde directamente.
- 1-3: tangencial.
- 0: irrelevante.

Sé estricto: si un documento solo menciona la palabra clave pero no aborda la consulta, puntúa bajo.

CONSULTA:
${query}

DOCUMENTOS:
${docList}

Devuelve un score para CADA uno de los ${documents.length} documentos, identificándolo por su número (1-${documents.length}).`;
}

/**
 * Prompt para explain_concept con ajuste de nivel.
 */
export function buildExplainPrompt(
  concept: string,
  level: 'beginner' | 'intermediate' | 'advanced',
  context: string
): string {
  const tones = {
    beginner: 'como si la persona no supiera nada del tema. Usa analogías cotidianas. Evita jerga; si la usas, defínela.',
    intermediate: 'asumiendo conocimientos básicos. Puedes usar terminología propia del campo sin definirla siempre.',
    advanced: 'con rigor técnico. Asume dominio del vocabulario y profundiza en matices y casos límite.',
  };

  return `Explica el concepto "${concept}" ${tones[level]}. Usa el siguiente contexto como fuente principal; si te falta info, complementa con conocimiento general pero indica cuándo lo haces.

CONTEXTO:
${context}`;
}
