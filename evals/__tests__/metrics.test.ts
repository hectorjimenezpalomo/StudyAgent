import { describe, it, expect } from 'vitest';
import {
  average,
  hitRateAtK,
  meanReciprocalRank,
  percentile,
  recallAtK,
} from '../metrics';

describe('recallAtK', () => {
  it('devuelve 0 si no hay ground truth', () => {
    expect(recallAtK(['a', 'b'], [], 5)).toBe(0);
  });

  it('devuelve 1 cuando todos los relevantes estan en el top-k', () => {
    expect(recallAtK(['a', 'b', 'c'], ['a', 'b'], 5)).toBe(1);
  });

  it('considera solo los primeros k resultados', () => {
    expect(recallAtK(['x', 'y', 'a'], ['a'], 2)).toBe(0);
    expect(recallAtK(['x', 'y', 'a'], ['a'], 3)).toBe(1);
  });

  it('calcula la fraccion correcta cuando hay varios relevantes', () => {
    expect(recallAtK(['a', 'x', 'b', 'y'], ['a', 'b', 'c'], 4)).toBeCloseTo(2 / 3);
  });
});

describe('meanReciprocalRank', () => {
  it('devuelve 0 si no hay ground truth', () => {
    expect(meanReciprocalRank(['a'], [])).toBe(0);
  });

  it('devuelve 1 si el primer resultado es relevante', () => {
    expect(meanReciprocalRank(['a', 'b'], ['a'])).toBe(1);
  });

  it('devuelve 1/n cuando el relevante esta en la posicion n', () => {
    expect(meanReciprocalRank(['x', 'y', 'a'], ['a'])).toBeCloseTo(1 / 3);
  });

  it('devuelve 0 cuando ningun relevante aparece', () => {
    expect(meanReciprocalRank(['x', 'y'], ['a'])).toBe(0);
  });
});

describe('hitRateAtK', () => {
  it('devuelve 1 si al menos un relevante esta en el top-k', () => {
    expect(hitRateAtK(['x', 'a', 'y'], ['a', 'b'], 3)).toBe(1);
  });

  it('devuelve 0 si ningun relevante aparece en el top-k', () => {
    expect(hitRateAtK(['x', 'y', 'z'], ['a'], 3)).toBe(0);
  });

  it('respeta el limite k', () => {
    expect(hitRateAtK(['x', 'y', 'a'], ['a'], 2)).toBe(0);
    expect(hitRateAtK(['x', 'y', 'a'], ['a'], 3)).toBe(1);
  });
});

describe('average', () => {
  it('devuelve 0 para array vacio', () => {
    expect(average([])).toBe(0);
  });

  it('calcula la media correctamente', () => {
    expect(average([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('percentile', () => {
  it('devuelve 0 para array vacio', () => {
    expect(percentile([], 95)).toBe(0);
  });

  it('p95 toma un valor cercano al maximo en distribuciones pequenas', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 95)).toBeGreaterThanOrEqual(90);
  });

  it('p50 aproxima la mediana', () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 50)).toBe(3);
  });
});
