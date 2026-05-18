import { beforeEach, describe, expect, it, vi } from 'vitest';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { EMBEDDING_BATCH_SIZE, embed } from '../embeddings';

vi.mock('@ai-sdk/openai', () => ({
  openai: {
    embedding: vi.fn((model: string) => ({ model })),
  },
}));

vi.mock('ai', () => ({
  embedMany: vi.fn(async ({ values }: { values: string[] }) => ({
    embeddings: values.map((value) => [value.length]),
  })),
}));

describe('embed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve array vacio si no recibe textos', async () => {
    await expect(embed([])).resolves.toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  it('mantiene el orden de embeddings devuelto por lotes', async () => {
    const texts = ['a', 'abcd', 'abcdef'];

    await expect(embed(texts)).resolves.toEqual([[1], [4], [6]]);
  });

  it('parte las llamadas en batches de 100 inputs', async () => {
    const texts = Array.from(
      { length: EMBEDDING_BATCH_SIZE * 2 + 5 },
      (_, index) => `texto ${index}`
    );

    await embed(texts);

    expect(embedMany).toHaveBeenCalledTimes(3);
    expect(vi.mocked(embedMany).mock.calls[0][0].values).toHaveLength(100);
    expect(vi.mocked(embedMany).mock.calls[1][0].values).toHaveLength(100);
    expect(vi.mocked(embedMany).mock.calls[2][0].values).toHaveLength(5);
    expect(openai.embedding).toHaveBeenCalled();
  });
});
