/**
 * Métricas de retrieval puras, sin side effects.
 *
 * Documentación corta para que cualquiera pueda auditar la fórmula:
 * - recall@k: cuántos chunks relevantes aparecen en el top-k recuperado,
 *   normalizado por el total de chunks relevantes conocidos.
 * - MRR: posición inversa del primer chunk relevante. Penaliza tener la
 *   respuesta abajo en el ranking aunque esté presente.
 * - hit@k: 1 si hay al menos un chunk relevante en el top-k, 0 si no.
 */

export function recallAtK(
  retrievedIds: readonly string[],
  groundTruthIds: readonly string[],
  k: number
): number {
  if (groundTruthIds.length === 0) {
    return 0;
  }

  const topK = new Set(retrievedIds.slice(0, k));
  let hits = 0;
  for (const id of groundTruthIds) {
    if (topK.has(id)) hits += 1;
  }
  return hits / groundTruthIds.length;
}

export function meanReciprocalRank(
  retrievedIds: readonly string[],
  groundTruthIds: readonly string[]
): number {
  if (groundTruthIds.length === 0) {
    return 0;
  }

  const groundTruth = new Set(groundTruthIds);
  for (let i = 0; i < retrievedIds.length; i += 1) {
    if (groundTruth.has(retrievedIds[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

export function hitRateAtK(
  retrievedIds: readonly string[],
  groundTruthIds: readonly string[],
  k: number
): number {
  if (groundTruthIds.length === 0) {
    return 0;
  }

  const groundTruth = new Set(groundTruthIds);
  for (let i = 0; i < Math.min(k, retrievedIds.length); i += 1) {
    if (groundTruth.has(retrievedIds[i])) {
      return 1;
    }
  }
  return 0;
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return sum / values.length;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}
