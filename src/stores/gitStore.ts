import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { GitFileChange, GitTreeNode } from "../lib/types";

type GitStatusFilter = "all" | "M" | "A" | "D" | "U";

// 判断文件是否匹配当前筛选。
// 「新增」(A) 视为一组：已暂存新增(A)、未跟踪(U/??) 都算新增，与面板的 addedCount 定义保持一致。
function matchFilter(status: string, filter: GitStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "A") return status === "A" || status === "U" || status === "??";
  return status === filter;
}

interface GitStore {
  changes: GitFileChange[];
  tree: GitTreeNode[];
  collapsedDirs: Set<string>;
  loading: boolean;
  error: string | null;
  currentProjectPath: string | null;
  statusFilter: GitStatusFilter;

  fetchChanges: (projectPath: string) => Promise<void>;
  toggleDir: (path: string) => void;
  setStatusFilter: (filter: GitStatusFilter) => void;
  reset: () => void;
}

function buildTree(changes: GitFileChange[]): GitTreeNode[] {
  const root: GitTreeNode[] = [];
  const dirMap = new Map<string, GitTreeNode>();

  // 按路径排序
  const sorted = [...changes].sort((a, b) => a.path.localeCompare(b.path));

  for (const change of sorted) {
    const parts = change.path.split(/[/\\]/);
    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (i === parts.length - 1) {
        // 文件节点
        currentLevel.push({
          type: "file",
          name: part,
          path: currentPath,
          change,
        });
      } else {
        // 目录节点
        let dir = dirMap.get(currentPath);
        if (!dir) {
          dir = {
            type: "directory",
            name: part,
            path: currentPath,
            children: [],
          };
          dirMap.set(currentPath, dir);
          currentLevel.push(dir);
        }
        currentLevel = dir.children!;
      }
    }
  }

  return root;
}

export const useGitStore = create<GitStore>((set, get) => ({
  changes: [],
  tree: [],
  collapsedDirs: new Set(),
  loading: false,
  error: null,
  currentProjectPath: null,
  statusFilter: "all",

  fetchChanges: async (projectPath: string) => {
    console.log(`[GitStore] 开始获取 Git 变更, projectPath: "${projectPath}"`);
    set({ loading: true, error: null, currentProjectPath: projectPath });

    try {
      console.log(`[GitStore] 调用后端命令 git_get_changes`);
      const changes = await invoke<GitFileChange[]>("git_get_changes", { projectPath });
      console.log(`[GitStore] 获取到 ${changes.length} 个变更文件`);

      // 应用筛选
      const { statusFilter } = get();
      const filtered = changes.filter(c => matchFilter(c.status, statusFilter));

      const tree = buildTree(filtered);
      console.log(`[GitStore] 构建树结构完成，根节点数: ${tree.length}`);
      set({ changes, tree, loading: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[GitStore] 获取 Git 变更失败:`, err);
      set({ error: errorMsg, loading: false, changes: [], tree: [] });
    }
  },

  toggleDir: (path: string) => {
    set((state) => {
      const newCollapsed = new Set(state.collapsedDirs);
      if (newCollapsed.has(path)) {
        newCollapsed.delete(path);
      } else {
        newCollapsed.add(path);
      }
      return { collapsedDirs: newCollapsed };
    });
  },

  setStatusFilter: (filter: GitStatusFilter) => {
    set((state) => {
      const filtered = state.changes.filter(c => matchFilter(c.status, filter));
      const tree = buildTree(filtered);
      return { statusFilter: filter, tree };
    });
  },

  reset: () => {
    set({
      changes: [],
      tree: [],
      collapsedDirs: new Set(),
      loading: false,
      error: null,
      currentProjectPath: null,
      statusFilter: "all",
    });
  },
}));
