export function splitInstallments(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total - base * count;

  return Array.from({ length: count }, (_, index) =>
    index === 0 ? base + remainder : base,
  );
}
