/**
 * Trocea texto en chunks aptos para embedding.
 *
 * Reglas (de AGENTS.md y lib/ai/config.ts):
 * - Tamaño objetivo: 700 tokens
 * - Solape entre chunks contiguos: 100 tokens
 * - No partir a mitad de palabra
 * - Preferir partir por párrafo (\n\n) o por frase (. ) cuando se pueda
 *
 * Aproximación de tokens: 1 token ≈ 4 caracteres en inglés y español.
 * No hace falta usar un tokenizer real; aproximamos por caracteres.
 */

import { AI_CONFIG } from './config';

export interface Chunk {
  content: string;
  index: number;
  // pageNumber se rellena posteriormente cuando se procesa el PDF página a página
  pageNumber?: number;
}

const CHARS_PER_TOKEN = 4;
const TARGET_CHARS = AI_CONFIG.rag.chunkSizeTokens * CHARS_PER_TOKEN;
const OVERLAP_CHARS = AI_CONFIG.rag.chunkOverlapTokens * CHARS_PER_TOKEN;

export function chunkText(text: string): Chunk[] {
  // TODO Codex: implementar.
  // Algoritmo sugerido:
  // 1) Normalizar saltos de línea.
  // 2) Recorrer el texto avanzando ~TARGET_CHARS.
  // 3) En cada corte, retroceder hasta encontrar el último \n\n o ". " antes del punto teórico,
  //    para no partir párrafos/frases. Si no encuentra ninguno en una ventana razonable, partir por espacio.
  // 4) Generar chunks con solape de OVERLAP_CHARS hacia atrás respecto al final del anterior.
  // 5) Filtrar chunks vacíos o de menos de ~50 caracteres.
  // Tests en __tests__/chunker.test.ts deben pasar: solape correcto, no parte palabras,
  // preferencia por límite de párrafo.
  throw new Error('chunkText no implementada todavía');
}
