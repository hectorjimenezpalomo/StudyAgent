import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mockeamos los SDK de proveedor para inspeccionar qué id de modelo recibe cada
// factoría sin llamar a red. Cada mock devuelve un objeto identificable.
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn((model: string) => ({ provider: 'openai', model })),
}));
vi.mock('@ai-sdk/google', () => ({
  google: vi.fn((model: string) => ({ provider: 'google', model })),
}));

/**
 * `AI_CONFIG` se evalúa al cargar el módulo, así que para probar distintos
 * valores de `AI_PROVIDER` reseteamos módulos y reimportamos config + provider
 * tras stubear el env (mismo patrón que los flags de retrieval).
 */
async function loadProvider(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      vi.stubEnv(key, '');
    } else {
      vi.stubEnv(key, value);
    }
  }
  return import('../provider');
}

describe('getChatModel()', () => {
  beforeEach(() => {
    // Modelos por defecto deterministas, independientes del entorno real.
    vi.stubEnv('OPENAI_CHAT_MODEL', 'gpt-4o-mini');
    vi.stubEnv('GOOGLE_CHAT_MODEL', 'gemini-2.0-flash');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('sin AI_PROVIDER usa OpenAI y su modelo default', async () => {
    const { getChatModel } = await loadProvider({ AI_PROVIDER: undefined });
    expect(getChatModel()).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('AI_PROVIDER=google usa Google y su modelo default', async () => {
    const { getChatModel } = await loadProvider({ AI_PROVIDER: 'google' });
    expect(getChatModel()).toEqual({ provider: 'google', model: 'gemini-2.0-flash' });
  });

  it('un AI_PROVIDER inválido cae a OpenAI', async () => {
    const { getChatModel } = await loadProvider({ AI_PROVIDER: 'anthropic' });
    expect(getChatModel()).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('respeta el override de modelId sobre el proveedor activo (openai)', async () => {
    const { getChatModel } = await loadProvider({ AI_PROVIDER: 'openai' });
    expect(getChatModel('gpt-4o')).toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it('respeta el override de modelId sobre el proveedor activo (google)', async () => {
    const { getChatModel } = await loadProvider({ AI_PROVIDER: 'google' });
    expect(getChatModel('gemini-1.5-pro')).toEqual({
      provider: 'google',
      model: 'gemini-1.5-pro',
    });
  });
});
