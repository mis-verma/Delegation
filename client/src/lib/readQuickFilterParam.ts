export function readQuickFilterParam<T extends string>(
  searchParams: URLSearchParams,
  validValues: readonly T[],
): T | null {
  const qf = searchParams.get('quickFilter');
  return qf !== null && (validValues as readonly string[]).includes(qf) ? (qf as T) : null;
}
