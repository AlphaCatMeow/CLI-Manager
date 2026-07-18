import ignore from "ignore";

export interface FileExplorerIgnoreMatcher {
  ignores(relativePath: string, isDirectory: boolean): boolean;
}

/** Built-in fallback rules used when the project-root .gitignore cannot be read. */
export const DEFAULT_FILE_EXPLORER_IGNORE_PATTERNS: readonly string[] = [
  ".git/",
  ".hg/",
  ".svn/",
  "node_modules/",
  "bower_components/",
  ".pnpm-store/",
  ".yarn/",
  "dist/",
  "build/",
  "out/",
  "output/",
  ".output/",
  "target/",
  "coverage/",
  "htmlcov/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".vite/",
  ".parcel-cache/",
  ".cache/",
  "cache/",
  "__pycache__/",
  ".pytest_cache/",
  ".mypy_cache/",
  ".ruff_cache/",
  ".venv/",
  "venv/",
  ".idea/",
  ".vscode/",
  ".vscode-test/",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  "*.log",
  "*.tmp",
  "*.temp",
  "*.swp",
  "*.swo",
  "*~",
  ".env.local",
  ".env.*.local",
];

function normalizeRelativePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/u, "")
    .replace(/^\/+|\/+$/gu, "");
}

export function createIgnoreMatcher(content: string): FileExplorerIgnoreMatcher {
  const matcher = ignore().add(content);
  return {
    ignores(relativePath, isDirectory) {
      const normalizedPath = normalizeRelativePath(relativePath);
      if (!normalizedPath) return false;
      return matcher.ignores(isDirectory ? `${normalizedPath}/` : normalizedPath);
    },
  };
}

export function createDefaultIgnoreMatcher(): FileExplorerIgnoreMatcher {
  return createIgnoreMatcher(DEFAULT_FILE_EXPLORER_IGNORE_PATTERNS.join("\n"));
}

export function includesProjectGitIgnoreChange(
  changedPaths: readonly string[] | undefined
): boolean {
  return changedPaths?.some((path) => normalizeRelativePath(path) === ".gitignore") ?? false;
}
