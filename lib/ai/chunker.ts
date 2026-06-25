/**
 * Trocea texto en chunks aptos para embedding.
 *
 * Reglas:
 * - Tamano objetivo: 700 tokens
 * - Solape entre chunks contiguos: 100 tokens
 * - No partir a mitad de palabra
 * - Preferir partir por parrafo o por frase cuando se pueda
 *
 * Aproximacion: 1 token ~= 4 caracteres.
 */

import { AI_CONFIG } from './config';

export interface Chunk {
  content: string;
  index: number;
  pageNumber?: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

const CHARS_PER_TOKEN = 4;
export const TARGET_CHARS = AI_CONFIG.rag.chunkSizeTokens * CHARS_PER_TOKEN;
export const OVERLAP_CHARS = AI_CONFIG.rag.chunkOverlapTokens * CHARS_PER_TOKEN;

function findCutPoint(text: string, start: number, idealEnd: number) {
  const maxEnd = Math.min(idealEnd, text.length);
  if (maxEnd >= text.length) {
    return text.length;
  }

  const minEnd = start + Math.floor((maxEnd - start) * 0.6);
  const paragraphBreak = text.lastIndexOf('\n\n', maxEnd);
  if (paragraphBreak >= minEnd) {
    return paragraphBreak + 2;
  }

  const sentenceBreak = text.lastIndexOf('. ', maxEnd);
  if (sentenceBreak >= minEnd) {
    return sentenceBreak + 2;
  }

  const wordBreak = text.lastIndexOf(' ', maxEnd);
  if (wordBreak >= minEnd) {
    return wordBreak + 1;
  }

  return maxEnd;
}

function moveToWordBoundary(text: string, index: number) {
  if (index <= 0 || /\s/.test(text[index - 1] ?? '')) {
    return index;
  }

  const nextSpace = text.indexOf(' ', index);
  if (nextSpace === -1) {
    return index;
  }

  return nextSpace + 1;
}

export function chunkText(text: string): Chunk[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.trim().length === 0) {
    return [];
  }

  if (normalized.length <= TARGET_CHARS) {
    return [{ content: normalized, index: 0 }];
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = findCutPoint(normalized, start, start + TARGET_CHARS);
    const content = normalized.slice(start, end);

    if (content.trim().length > 0) {
      chunks.push({ content, index: chunks.length });
    }

    if (end >= normalized.length) {
      break;
    }

    const overlapStart = Math.max(0, end - OVERLAP_CHARS);
    const nextStart = moveToWordBoundary(normalized, overlapStart);
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

/**
 * Conserva la procedencia por página cuando el extractor puede proporcionarla.
 * El solape se mantiene dentro de cada página para evitar atribuir texto de una
 * página a otra en las citas posteriores.
 */
export function chunkPages(pages: ExtractedPage[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const pageChunks = chunkText(page.text);
    for (const chunk of pageChunks) {
      chunks.push({
        ...chunk,
        index: chunks.length,
        pageNumber: page.pageNumber,
      });
    }
  }

  return chunks;
}
