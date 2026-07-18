export interface TodayProjectStatsScope {
  projectKey: string;
  projectPaths: string[];
}

export function normalizeHistoryProjectPaths(paths: string[]): string[] {
  return Array.from(
    new Set(
      paths
        .map((path) => path.trim().replace(/\\/g, "/").replace(/\/+$/g, ""))
        .filter(Boolean)
    )
  ).sort();
}

export function resolveTodayProjectStatsScope(
  projectPaths: string[],
  projectKeys: Array<string | null | undefined>
): TodayProjectStatsScope | null {
  const normalizedPaths = normalizeHistoryProjectPaths(projectPaths);
  const projectKey = projectKeys
    .map((value) => value?.trim() ?? "")
    .find(Boolean) ?? "";

  if (normalizedPaths.length === 0 && !projectKey) return null;
  return { projectKey, projectPaths: normalizedPaths };
}
