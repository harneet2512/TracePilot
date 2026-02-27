export function computeAvg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

export function computeMin(values: number[]): number {
  if (!values.length) return 0;
  return Math.min(...values);
}

export function computeMax(values: number[]): number {
  if (!values.length) return 0;
  return Math.max(...values);
}

export function computePercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[idx];
}
