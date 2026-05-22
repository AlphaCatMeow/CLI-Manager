import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { getDb, batchInsert } from "../lib/db";
import { useProjectStore } from "./projectStore";

export type SyncStatus = "idle" | "syncing" | "success" | "error" | "conflict";
export type SyncMode = "cloud" | "local";

interface SyncMeta {
  device_id: string;
  last_sync_at: string | null;
}

interface ConflictInfo {
  local_modified: string;
  remote_modified: string;
  local_projects: number;
  remote_projects: number;
  local_groups: number;
  remote_groups: number;
  local_templates: number;
  remote_templates: number;
}

interface SyncData {
  version: number;
  device_id: string;
  last_modified: string;
  data: {
    projects: Record<string, unknown>[];
    groups: Record<string, unknown>[];
    command_templates: Record<string, unknown>[];
    settings: Record<string, unknown>;
  };
}

interface SyncStore {
  webdavUrl: string;
  webdavUsername: string;
  hasPassword: boolean;
  status: SyncStatus;
  lastSyncAt: string | null;
  deviceId: string;
  conflictInfo: ConflictInfo | null;
  pendingRemoteData: SyncData | null;
  loaded: boolean;
  syncMode: SyncMode;
  localSyncDir: string;

  load: () => Promise<void>;
  setConfig: (url: string, username: string, password?: string) => Promise<void>;
  clearPassword: () => Promise<void>;
  testConnection: (url: string, username: string, password: string) => Promise<{ success: boolean; message: string }>;
  upload: () => Promise<void>;
  download: (force?: boolean) => Promise<void>;
  resolveConflict: (keepLocal: boolean) => Promise<void>;
  clearConflict: () => void;
  setSyncMode: (mode: SyncMode) => Promise<void>;
  setLocalSyncDir: (dir: string) => Promise<void>;
  localExport: () => Promise<string>;
  localImport: (zipPath: string) => Promise<void>;
}

let store: Store | null = null;
async function getStore() {
  if (!store) {
    store = await Store.load("sync-config.json", { autoSave: 100, defaults: {} });
  }
  return store;
}

const SYNC_DATA_VERSION = 1;

export const useSyncStore = create<SyncStore>((set, get) => ({
  webdavUrl: "",
  webdavUsername: "",
  hasPassword: false,
  status: "idle",
  lastSyncAt: null,
  deviceId: "",
  conflictInfo: null,
  pendingRemoteData: null,
  loaded: false,
  syncMode: "cloud",
  localSyncDir: "",

  load: async () => {
    const s = await getStore();
    const url = (await s.get<string>("webdavUrl")) ?? "";
    const username = (await s.get<string>("webdavUsername")) ?? "";
    const hasPassword = (await s.get<boolean>("hasPassword")) ?? false;
    const syncMode = ((await s.get<string>("syncMode")) as SyncMode | undefined) ?? "cloud";
    const localSyncDir = (await s.get<string>("localSyncDir")) ?? "";

    const db = await getDb();
    const meta = await db.select<SyncMeta[]>(
      "SELECT device_id, last_sync_at FROM sync_meta WHERE id = 'singleton'"
    );

    const deviceId = meta[0]?.device_id ?? crypto.randomUUID();
    const lastSyncAt = meta[0]?.last_sync_at ?? null;

    set({
      webdavUrl: url,
      webdavUsername: username,
      hasPassword,
      deviceId,
      lastSyncAt,
      syncMode,
      localSyncDir,
      loaded: true,
    });
  },

  setConfig: async (url, username, password) => {
    const s = await getStore();
    await s.set("webdavUrl", url);
    await s.set("webdavUsername", username);
    if (password !== undefined) {
      await s.set("hasPassword", true);
      await s.set("webdavPassword", password);
      set({ webdavUrl: url, webdavUsername: username, hasPassword: true });
    } else {
      // Preserve existing hasPassword state when not providing new password
      set({ webdavUrl: url, webdavUsername: username });
    }
  },

  clearPassword: async () => {
    const s = await getStore();
    await s.set("hasPassword", false);
    await s.set("webdavPassword", "");
    set({ hasPassword: false });
  },

  testConnection: async (url, username, password) => {
    const result = await invoke<{ success: boolean; message: string }>("sync_test_connection", {
      config: { url, username, password },
    });
    return result;
  },

  upload: async () => {
    const { webdavUrl, webdavUsername, deviceId } = get();
    const s = await getStore();
    const password = (await s.get<string>("webdavPassword")) ?? "";

    if (!webdavUrl || !password) {
      set({ status: "error" });
      return;
    }

    set({ status: "syncing" });

    try {
      const db = await getDb();

      const projects = await db.select<Record<string, unknown>[]>(
        "SELECT id, name, path, group_id, sort_order, cli_tool, startup_cmd, env_vars, shell FROM projects ORDER BY sort_order"
      );
      const groups = await db.select<Record<string, unknown>[]>(
        "SELECT id, name, parent_id, sort_order FROM groups ORDER BY sort_order"
      );
      const templates = await db.select<Record<string, unknown>[]>(
        "SELECT id, project_id, name, command, description, sort_order FROM command_templates ORDER BY sort_order"
      );

      const syncData: SyncData = {
        version: SYNC_DATA_VERSION,
        device_id: deviceId,
        last_modified: new Date().toISOString(),
        data: {
          projects,
          groups,
          command_templates: templates,
          settings: {},
        },
      };

      await invoke("sync_upload", {
        config: { url: webdavUrl, username: webdavUsername, password },
        data: syncData,
      });

      const now = new Date().toISOString();
      await db.execute(
        "INSERT OR REPLACE INTO sync_meta (id, device_id, last_sync_at, remote_version) VALUES ('singleton', ?, ?, ?)",
        [deviceId, now, now]
      );

      set({ status: "success", lastSyncAt: now });
    } catch (error) {
      console.error("Upload failed:", error);
      set({ status: "error" });
      throw error; // Re-throw to let UI show the error
    }
  },

  download: async (force = false) => {
    const { webdavUrl, webdavUsername, deviceId } = get();
    const s = await getStore();
    const password = (await s.get<string>("webdavPassword")) ?? "";

    if (!webdavUrl || !password) {
      set({ status: "error" });
      return;
    }

    set({ status: "syncing" });

    try {
      const db = await getDb();

      const localProjects = await db.select<Record<string, unknown>[]>(
        "SELECT id, name, path, group_id, sort_order, cli_tool, startup_cmd, env_vars, shell FROM projects ORDER BY sort_order"
      );
      const localGroups = await db.select<Record<string, unknown>[]>(
        "SELECT id, name, parent_id, sort_order FROM groups ORDER BY sort_order"
      );
      const localTemplates = await db.select<Record<string, unknown>[]>(
        "SELECT id, project_id, name, command, description, sort_order FROM command_templates ORDER BY sort_order"
      );

      const localData: SyncData = {
        version: SYNC_DATA_VERSION,
        device_id: deviceId,
        last_modified: get().lastSyncAt ?? new Date(0).toISOString(),
        data: {
          projects: localProjects,
          groups: localGroups,
          command_templates: localTemplates,
          settings: {},
        },
      };

      const result = await invoke<{
        success: boolean;
        has_conflict: boolean;
        conflict_info: ConflictInfo | null;
        data: SyncData | null;
      }>("sync_download", {
        config: { url: webdavUrl, username: webdavUsername, password },
        localData,
        force,
      });

      if (result.has_conflict && result.conflict_info) {
        set({
          status: "conflict",
          conflictInfo: result.conflict_info,
          pendingRemoteData: result.data,
        });
        return;
      }

      if (result.data) {
        await applySyncData(db, result.data, deviceId);
        // Refresh project list after sync
        useProjectStore.getState().fetchAll().catch(console.error);
        set({
          status: "success",
          lastSyncAt: result.data.last_modified,
          conflictInfo: null,
          pendingRemoteData: null,
        });
      }
    } catch (error) {
      console.error("Download failed:", error);
      set({ status: "error" });
      throw error;
    }
  },

  resolveConflict: async (keepLocal) => {
    const { pendingRemoteData, deviceId } = get();

    if (keepLocal) {
      await get().upload();
    } else if (pendingRemoteData) {
      const db = await getDb();
      await applySyncData(db, pendingRemoteData, deviceId);
      // Refresh project list after sync
      useProjectStore.getState().fetchAll().catch(console.error);
      set({
        status: "success",
        lastSyncAt: pendingRemoteData.last_modified,
        conflictInfo: null,
        pendingRemoteData: null,
      });
    }
  },

  clearConflict: () => {
    set({ status: "idle", conflictInfo: null, pendingRemoteData: null });
  },

  setSyncMode: async (mode) => {
    const s = await getStore();
    await s.set("syncMode", mode);
    set({ syncMode: mode });
  },

  setLocalSyncDir: async (dir) => {
    const s = await getStore();
    await s.set("localSyncDir", dir);
    set({ localSyncDir: dir });
  },

  localExport: async () => {
    const { localSyncDir, deviceId } = get();
    if (!localSyncDir) {
      throw new Error("请先选择本地同步目录");
    }
    set({ status: "syncing" });
    try {
      const db = await getDb();
      const projects = await db.select<Record<string, unknown>[]>(
        "SELECT id, name, path, group_id, sort_order, cli_tool, startup_cmd, env_vars, shell FROM projects ORDER BY sort_order"
      );
      const groups = await db.select<Record<string, unknown>[]>(
        "SELECT id, name, parent_id, sort_order FROM groups ORDER BY sort_order"
      );
      const templates = await db.select<Record<string, unknown>[]>(
        "SELECT id, project_id, name, command, description, sort_order FROM command_templates ORDER BY sort_order"
      );

      const now = new Date().toISOString();
      const syncData: SyncData = {
        version: SYNC_DATA_VERSION,
        device_id: deviceId,
        last_modified: now,
        data: {
          projects,
          groups,
          command_templates: templates,
          settings: {},
        },
      };

      const result = await invoke<{ success: boolean; path: string; message: string }>(
        "sync_local_export",
        { dir: localSyncDir, data: syncData }
      );

      await db.execute(
        "INSERT OR REPLACE INTO sync_meta (id, device_id, last_sync_at, remote_version) VALUES ('singleton', ?, ?, ?)",
        [deviceId, now, now]
      );

      set({ status: "success", lastSyncAt: now });
      return result.path;
    } catch (error) {
      console.error("Local export failed:", error);
      set({ status: "error" });
      throw error;
    }
  },

  localImport: async (zipPath) => {
    const { deviceId } = get();
    set({ status: "syncing" });
    try {
      const data = await invoke<SyncData>("sync_local_import", { zipPath });
      const db = await getDb();
      await applySyncData(db, data, deviceId);
      useProjectStore.getState().fetchAll().catch(console.error);
      set({
        status: "success",
        lastSyncAt: data.last_modified,
        conflictInfo: null,
        pendingRemoteData: null,
      });
    } catch (error) {
      console.error("Local import failed:", error);
      set({ status: "error" });
      throw error;
    }
  },
}));

async function applySyncData(db: Awaited<ReturnType<typeof getDb>>, data: SyncData, deviceId: string) {
  // Backup current data first
  const backupProjects = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM projects"
  );
  const backupGroups = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM groups"
  );
  const backupTemplates = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM command_templates"
  );

  const nowStr = Date.now().toString();

  try {
    // Clear existing data
    await db.execute("DELETE FROM command_templates");
    await db.execute("DELETE FROM projects");
    await db.execute("DELETE FROM groups");

    // 多值 INSERT 合并：原先每行一次 execute（N 次 IPC + N 次 fsync），
    // 现在按参数上限批量打包，单批一次 execute。
    await batchInsert(
      db,
      "groups",
      ["id", "name", "parent_id", "sort_order", "created_at"],
      data.data.groups,
      (group) => [
        group.id as string,
        group.name as string,
        (group.parent_id as string | null) ?? null,
        group.sort_order as number,
        nowStr,
      ],
    );

    await batchInsert(
      db,
      "projects",
      ["id", "name", "path", "group_id", "sort_order", "cli_tool", "startup_cmd", "env_vars", "shell", "created_at", "updated_at"],
      data.data.projects,
      (project) => [
        project.id as string,
        project.name as string,
        project.path as string,
        (project.group_id as string | null) ?? null,
        project.sort_order as number,
        (project.cli_tool as string) ?? "",
        (project.startup_cmd as string) ?? "",
        (project.env_vars as string) ?? "{}",
        (project.shell as string) ?? "powershell",
        nowStr,
        nowStr,
      ],
    );

    await batchInsert(
      db,
      "command_templates",
      ["id", "project_id", "name", "command", "description", "sort_order"],
      data.data.command_templates,
      (template) => [
        template.id as string,
        (template.project_id as string | null) ?? null,
        template.name as string,
        template.command as string,
        (template.description as string) ?? "",
        template.sort_order as number,
      ],
    );

    await db.execute(
      "INSERT OR REPLACE INTO sync_meta (id, device_id, last_sync_at, remote_version) VALUES ('singleton', ?, ?, ?)",
      [deviceId, data.last_modified, data.last_modified]
    );

    console.log("Sync data applied successfully");
  } catch (error) {
    console.error("Failed to apply sync data, restoring backup:", error);

    // Restore backup（同样使用批量 insert）
    try {
      await db.execute("DELETE FROM command_templates");
      await db.execute("DELETE FROM projects");
      await db.execute("DELETE FROM groups");

      await batchInsert(
        db,
        "groups",
        ["id", "name", "parent_id", "sort_order", "created_at"],
        backupGroups,
        (group) => [
          group.id as string,
          group.name as string,
          (group.parent_id as string | null) ?? null,
          group.sort_order as number,
          (group.created_at as string) ?? nowStr,
        ],
      );

      await batchInsert(
        db,
        "projects",
        ["id", "name", "path", "group_id", "sort_order", "cli_tool", "startup_cmd", "env_vars", "shell", "created_at", "updated_at"],
        backupProjects,
        (project) => [
          project.id as string,
          project.name as string,
          project.path as string,
          (project.group_id as string | null) ?? null,
          project.sort_order as number,
          (project.cli_tool as string) ?? "",
          (project.startup_cmd as string) ?? "",
          (project.env_vars as string) ?? "{}",
          (project.shell as string) ?? "powershell",
          (project.created_at as string) ?? nowStr,
          (project.updated_at as string) ?? nowStr,
        ],
      );

      await batchInsert(
        db,
        "command_templates",
        ["id", "project_id", "name", "command", "description", "sort_order"],
        backupTemplates,
        (template) => [
          template.id as string,
          (template.project_id as string | null) ?? null,
          template.name as string,
          template.command as string,
          (template.description as string) ?? "",
          template.sort_order as number,
        ],
      );

      console.log("Backup restored successfully");
    } catch (restoreError) {
      console.error("Failed to restore backup:", restoreError);
    }

    throw error;
  }
}