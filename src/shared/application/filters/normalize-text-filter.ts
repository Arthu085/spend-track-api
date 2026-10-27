export function normalizeTextFilter(value?: string): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
