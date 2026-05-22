import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getDb, batchUpdateSortOrder } from "../lib/db";
import type {
  Project, CreateProjectInput, UpdateProjectInput,
  Group, CreateGroupInput, TreeNode,
} from "../lib/types";

let inflightFetchAll: Promise<void> | null = null;

interface ProjectStore {
  projects: Project[];
  groups: Group[];
  tree: TreeNode[];
  searchQuery: string;
  projectHealth: Record<string, boolean>;
  setSearchQuery: (q: string) => void;
  fetchAll: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchGroups: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  updateProject: (id: string, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createGroup: (input: CreateGroupInput) => Promise<Group>;
  renameGroup: (id: string, name: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  reorderItems: (parentId: string | null, orderedIds: string[]) => Promise<void>;
  moveProjectToGroup: (projectId: string, targetGroupId: string | null) => Promise<void>;
  moveGroupToParent: (groupId: string, targetParentId: string | null) => Promise<void>;
}

function buildTree(groups: Group[], projects: Project[], search: string): TreeNode[] {
  const lowerSearch = search.toLowerCase();
  const matchingProjects = search
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(lowerSearch) ||
          p.cli_tool.toLowerCase().includes(lowerSearch)
      )
    : projects;

  const groupMap = new Map<string, Group>(groups.map((g) => [g.id, g]));
  const childGroups = new Map<string | null, Group[]>();
  const groupProjects = new Map<string | null, Project[]>();

  for (const g of groups) {
    const key = g.parent_id;
    const arr = childGroups.get(key) ?? [];
    arr.push(g);
    childGroups.set(key, arr);
  }

  for (const p of matchingProjects) {
    const key = p.group_id;
    const arr = groupProjects.get(key) ?? [];
    arr.push(p);
    groupProjects.set(key, arr);
  }

  // When searching, collect all group IDs that have matching projects (or ancestors thereof)
  const visibleGroupIds = new Set<string>();
  if (search) {
    for (const p of matchingProjects) {
      let gid = p.group_id;
      while (gid) {
        if (visibleGroupIds.has(gid)) break;
        visibleGroupIds.add(gid);
        gid = groupMap.get(gid)?.parent_id ?? null;
      }
    }
  }

  function buildLevel(parentId: string | null): TreeNode[] {
    const nodes: TreeNode[] = [];

    const subGroups = (childGroups.get(parentId) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );

    for (const g of subGroups) {
      if (search && !visibleGroupIds.has(g.id)) continue;
      const children = buildLevel(g.id);
      nodes.push({ type: "group", group: g, children });
    }

    const projs = (groupProjects.get(parentId) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    for (const p of projs) {
      nodes.push({ type: "project", project: p });
    }

    return nodes;
  }

  return buildLevel(null);
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  groups: [],
  tree: [],
  searchQuery: "",
  projectHealth: {},

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    const { groups, projects } = get();
    set({ tree: buildTree(groups, projects, q) });
  },

  fetchAll: async () => {
    if (inflightFetchAll) return inflightFetchAll;
    inflightFetchAll = (async () => {
      try {
        const db = await getDb();
        const [groups, projects] = await Promise.all([
          db.select<Group[]>("SELECT * FROM groups ORDER BY sort_order, name"),
          db.select<Project[]>("SELECT * FROM projects ORDER BY sort_order, name"),
        ]);
        // Path health check
        let projectHealth = get().projectHealth;
        if (projects.length > 0) {
          try {
            const paths = projects.map((p) => p.path);
            const results = await invoke<boolean[]>("check_paths_exist", { paths });
            const health: Record<string, boolean> = {};
            projects.forEach((p, i) => { health[p.id] = results[i]; });
            projectHealth = health;
          } catch { /* ignore */ }
        }

        const tree = buildTree(groups, projects, get().searchQuery);
        set({ groups, projects, tree, projectHealth });
      } finally {
        inflightFetchAll = null;
      }
    })();
    return inflightFetchAll;
  },

  fetchProjects: async () => {
    await get().fetchAll();
  },

  fetchGroups: async () => {
    await get().fetchAll();
  },

  createProject: async (input) => {
    const db = await getDb();
    const id = crypto.randomUUID();
    const ts = Date.now().toString();
    const project: Project = {
      id,
      name: input.name,
      path: input.path,
      group_name: input.group_name ?? "",
      group_id: input.group_id ?? null,
      sort_order: 0,
      cli_tool: input.cli_tool ?? "",
      startup_cmd: input.startup_cmd ?? "",
      env_vars: input.env_vars ?? "{}",
      shell: input.shell ?? "powershell",
      created_at: ts,
      updated_at: ts,
    };
    await db.execute(
      `INSERT INTO projects (id, name, path, group_name, group_id, sort_order, cli_tool, startup_cmd, env_vars, shell, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [project.id, project.name, project.path, project.group_name, project.group_id, project.sort_order,
       project.cli_tool, project.startup_cmd, project.env_vars, project.shell, project.created_at, project.updated_at]
    );
    await get().fetchAll();
    return project;
  },

  updateProject: async (id, input) => {
    const db = await getDb();
    const ts = Date.now().toString();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(input)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    fields.push(`updated_at = $${idx}`);
    values.push(ts);
    idx++;
    values.push(id);

    await db.execute(
      `UPDATE projects SET ${fields.join(", ")} WHERE id = $${idx}`,
      values
    );
    await get().fetchAll();
  },

  deleteProject: async (id) => {
    const db = await getDb();
    await db.execute("DELETE FROM projects WHERE id = $1", [id]);
    await get().fetchAll();
  },

  createGroup: async (input) => {
    const db = await getDb();
    const id = crypto.randomUUID();
    const ts = Date.now().toString();
    const group: Group = {
      id,
      name: input.name,
      parent_id: input.parent_id ?? null,
      sort_order: 0,
      created_at: ts,
    };
    await db.execute(
      `INSERT INTO groups (id, name, parent_id, sort_order, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [group.id, group.name, group.parent_id, group.sort_order, group.created_at]
    );
    await get().fetchAll();
    return group;
  },

  renameGroup: async (id, name) => {
    const db = await getDb();
    await db.execute("UPDATE groups SET name = $1 WHERE id = $2", [name, id]);
    await get().fetchAll();
  },

  deleteGroup: async (id) => {
    const db = await getDb();
    // Move child projects to ungrouped, then delete group (CASCADE deletes sub-groups)
    await db.execute("UPDATE projects SET group_id = NULL WHERE group_id = $1", [id]);
    // Also ungroup projects in sub-groups before cascade
    await db.execute(
      `UPDATE projects SET group_id = NULL WHERE group_id IN (
        WITH RECURSIVE sg(gid) AS (
          SELECT id FROM groups WHERE parent_id = $1
          UNION ALL
          SELECT g.id FROM groups g JOIN sg ON g.parent_id = sg.gid
        ) SELECT gid FROM sg
      )`,
      [id]
    );
    await db.execute("DELETE FROM groups WHERE id = $1", [id]);
    await get().fetchAll();
  },

  reorderItems: async (_parentId, orderedIds) => {
    if (orderedIds.length === 0) return;
    const db = await getDb();
    const groupIds = new Set(get().groups.map((g) => g.id));

    const groupUpdates: Array<[string, number]> = [];
    const projectUpdates: Array<[string, number]> = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (groupIds.has(id)) {
        groupUpdates.push([id, i]);
      } else {
        projectUpdates.push([id, i]);
      }
    }

    // 合并成单条 CASE WHEN UPDATE：从 N 次 execute（N 次 fsync）变成 1 次。
    await batchUpdateSortOrder(db, "groups", groupUpdates);
    await batchUpdateSortOrder(db, "projects", projectUpdates);
    await get().fetchAll();
  },

  moveProjectToGroup: async (projectId, targetGroupId) => {
    const db = await getDb();
    const { projects } = get();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (project.group_id === targetGroupId) return;

    const siblings = projects.filter((p) => p.group_id === targetGroupId && p.id !== projectId);
    const maxOrder = siblings.reduce((m, p) => Math.max(m, p.sort_order ?? 0), -1);
    const nextOrder = maxOrder + 1;
    const ts = Date.now().toString();

    await db.execute(
      "UPDATE projects SET group_id = $1, sort_order = $2, updated_at = $3 WHERE id = $4",
      [targetGroupId, nextOrder, ts, projectId]
    );
    await get().fetchAll();
  },

  moveGroupToParent: async (groupId, targetParentId) => {
    if (groupId === targetParentId) return;
    const db = await getDb();
    const { groups } = get();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    if (group.parent_id === targetParentId) return;

    // Reject moving a group into itself or any of its descendants
    if (targetParentId) {
      const descendantIds = new Set<string>();
      const stack = [groupId];
      const childMap = new Map<string | null, Group[]>();
      for (const g of groups) {
        const arr = childMap.get(g.parent_id) ?? [];
        arr.push(g);
        childMap.set(g.parent_id, arr);
      }
      while (stack.length > 0) {
        const id = stack.pop()!;
        descendantIds.add(id);
        for (const child of childMap.get(id) ?? []) {
          stack.push(child.id);
        }
      }
      if (descendantIds.has(targetParentId)) return;
    }

    const siblings = groups.filter((g) => g.parent_id === targetParentId && g.id !== groupId);
    const maxOrder = siblings.reduce((m, g) => Math.max(m, g.sort_order ?? 0), -1);
    const nextOrder = maxOrder + 1;

    await db.execute(
      "UPDATE groups SET parent_id = $1, sort_order = $2 WHERE id = $3",
      [targetParentId, nextOrder, groupId]
    );
    await get().fetchAll();
  },
}));
