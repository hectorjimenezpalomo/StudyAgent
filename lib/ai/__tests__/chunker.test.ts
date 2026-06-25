import { describe, it, expect } from 'vitest';
import { chunkPages, chunkText } from '../chunker';

/**
 * Estos tests definen el comportamiento esperado del chunker.
 * Sirven como spec para Codex: si los tests pasan, la implementación es válida.
 */

describe('chunkText', () => {
  it('devuelve array vacío para texto vacío', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('devuelve un solo chunk para texto corto', () => {
    const text = 'Esto es un texto muy corto.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].index).toBe(0);
  });

  it('no parte palabras a la mitad', () => {
    const text = 'palabra '.repeat(2000); // texto largo de la palabra repetida
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      const lastChar = chunk.content[chunk.content.length - 1];
      // El último carácter no debe estar a mitad de palabra
      expect([' ', '.', '\n'].includes(lastChar) || chunk === chunks[chunks.length - 1]).toBe(true);
    }
  });

  it('mantiene solape entre chunks contiguos', () => {
    const paragraphs = Array.from({ length: 50 }, (_, i) => `Párrafo número ${i} con suficiente texto para llenar.`);
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text);

    if (chunks.length >= 2) {
      // El final del chunk N debe aparecer (parcialmente) al inicio del chunk N+1
      const tailOfFirst = chunks[0].content.slice(-100);
      const headOfSecond = chunks[1].content.slice(0, 200);
      // Alguna palabra del final del primero debe estar en el inicio del segundo
      const firstWords = tailOfFirst.split(/\s+/).filter(w => w.length > 3);
      const overlap = firstWords.some(w => headOfSecond.includes(w));
      expect(overlap).toBe(true);
    }
  });

  it('asigna índices crecientes', () => {
    const text = 'Texto largo. '.repeat(3000);
    const chunks = chunkText(text);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('conserva el número de página al chunkear texto extraído por página', () => {
    const chunks = chunkPages([
      { pageNumber: 2, text: 'Contenido de la página dos.' },
      { pageNumber: 3, text: 'Contenido de la página tres.' },
    ]);

    expect(chunks).toEqual([
      expect.objectContaining({ index: 0, pageNumber: 2 }),
      expect.objectContaining({ index: 1, pageNumber: 3 }),
    ]);
  });
});
