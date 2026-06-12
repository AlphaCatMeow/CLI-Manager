import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Project } from "../lib/types";
import { useSettingsStore } from "../stores/settingsStore";
import { useProjectStore } from "../stores/projectStore";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Check, AlertTriangle } from "./icons";
import { logError } from "../lib/logger";

interface ClaudeProvider {
  id: string;
  appType: string;
  name: string;
  category: string | null;
  baseUrl: string | null;
  isCurrent: boolean;
  configParseError: boolean;
}

interface ProvidersResponse {
  dbPath: string;
  providers: ClaudeProvider[];
}

interface ProjectProviderProbe {
  matchedProviderId: string | null;
  hasSettingsFile: boolean;
  baseUrl: string | null;
  localOverrideKeys: string[];
}

/** applyingId 的哨兵值：标记"恢复跟随全局"操作进行中 */
const RESET_APPLYING_ID = "__follow_global__";

const ERROR_HINTS: Record<string, string> = {
  db_not_found: "未找到 cc-switch 数据库文件，请先在 设置 → 供应商 中配置 cc-switch.db。",
  unsupported_format: "cc-switch 数据库路径不是 .db 文件，请到 设置 → 供应商 重新选择。",
  project_not_found: "项目目录不存在或不可访问，请检查项目路径。",
  provider_not_found: "该供应商在 cc-switch 数据库中已不存在，请关闭弹窗后重试。",
  provider_config_invalid: "该供应商配置解析失败，无法应用。",
  settings_parse_failed: "项目 .claude/settings.json 不是合法 JSON，文件未被修改，请先手动修复。",
  settings_write_failed: "写入 settings.json 失败，请检查目录权限。",
};

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const [code, hint] of Object.entries(ERROR_HINTS)) {
    if (message.startsWith(code)) return hint;
  }
  return `操作失败：${message}`;
}

interface Props {
  project: Project;
  onClose: () => void;
}

export function ProviderSwitchModal({ project, onClose }: Props) {
  const ccSwitchDbPath = useSettingsStore((s) => s.ccSwitchDbPath);
  const [providers, setProviders] = useState<ClaudeProvider[]>([]);
  const [probe, setProbe] = useState<ProjectProviderProbe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dbPath = ccSwitchDbPath ?? undefined;
      const [listRes, probeRes] = await Promise.all([
        invoke<ProvidersResponse>("ccswitch_list_providers", { dbPath }),
        invoke<ProjectProviderProbe>("ccswitch_get_project_provider", {
          projectPath: project.path,
          dbPath,
        }).catch((err): ProjectProviderProbe | null => {
          // 探测失败不阻塞供应商列表展示；真正的错误在切换时再呈现
          logError("ccswitch project provider probe failed", { path: project.path, err });
          return null;
        }),
      ]);
      setProviders(listRes.providers.filter((p) => p.appType === "claude"));
      setProbe(probeRes);
    } catch (err) {
      setProviders([]);
      setProbe(null);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [ccSwitchDbPath, project.path]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyProvider = async (provider: ClaudeProvider) => {
    if (applyingId) return;
    setApplyingId(provider.id);
    try {
      await invoke("ccswitch_apply_provider", {
        projectPath: project.path,
        providerId: provider.id,
        dbPath: ccSwitchDbPath ?? undefined,
      });
      toast.success("已切换供应商", {
        description: `${provider.name} 已写入 .claude/settings.json，新开终端后生效。`,
      });
      await load();
      void useProjectStore.getState().refreshProviderBadges();
    } catch (err) {
      toast.error("切换供应商失败", { description: formatError(err) });
    } finally {
      setApplyingId(null);
    }
  };

  const resetToGlobal = async () => {
    if (applyingId) return;
    setApplyingId(RESET_APPLYING_ID);
    try {
      await invoke("ccswitch_reset_project_provider", { projectPath: project.path });
      toast.success("已恢复跟随全局", {
        description: "已移除项目级供应商配置，新开终端后生效。",
      });
      await load();
      void useProjectStore.getState().refreshProviderBadges();
    } catch (err) {
      toast.error("恢复全局失败", { description: formatError(err) });
    } finally {
      setApplyingId(null);
    }
  };

  // baseUrl 非空即代表项目存在供应商覆盖；探测失败（probe 为 null）时不打勾
  const hasOverride = probe?.baseUrl != null;
  const followGlobal = probe != null && !hasOverride;
  const globalCurrentName = providers.find((p) => p.isCurrent)?.name ?? null;
  const localOverrideKeys = probe?.localOverrideKeys ?? [];

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-[440px]">
        <DialogTitle className="mb-1 text-base font-semibold text-text-primary">
          切换供应商
        </DialogTitle>
        <p className="mb-3 break-all text-xs text-text-muted" title={project.path}>
          {project.name} · {project.path}
        </p>

        {error && (
          <div className="mb-3 rounded bg-danger/15 px-2 py-1.5 text-xs text-danger">{error}</div>
        )}

        {!loading && localOverrideKeys.length > 0 && (
          <div className="mb-3 flex items-start gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-text-secondary">
            <AlertTriangle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warning" />
            <span className="min-w-0 break-all">
              检测到 settings.local.json 中配置了 {localOverrideKeys.join("、")}
              ，其优先级更高，会覆盖此处的切换结果。
            </span>
          </div>
        )}

        {loading && (
          <div className="py-6 text-center text-sm text-text-muted">加载中…</div>
        )}

        {!loading && !error && (
          <button
            type="button"
            disabled={applyingId !== null}
            onClick={() => {
              if (!followGlobal) void resetToGlobal();
            }}
            className={`mb-1 flex w-full items-center gap-2 rounded border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              followGlobal
                ? "border-accent/40 bg-accent/10"
                : "border-border bg-bg-tertiary hover:opacity-80"
            }`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-text-primary">跟随全局供应商</span>
              <span className="truncate text-xs text-text-muted">
                {globalCurrentName
                  ? `当前全局：${globalCurrentName}`
                  : "cc-switch 未设置全局当前供应商"}
              </span>
            </span>
            {applyingId === RESET_APPLYING_ID ? (
              <span className="shrink-0 text-xs text-text-muted">恢复中…</span>
            ) : (
              followGlobal && (
                <Check size={14} strokeWidth={2} className="shrink-0 text-accent" />
              )
            )}
          </button>
        )}

        {!loading && !error && hasOverride && probe?.matchedProviderId == null && (
          <p className="mb-2 text-xs text-text-muted">
            项目为自定义配置（未匹配到 cc-switch 供应商）。
          </p>
        )}

        {!loading && !error && providers.length === 0 && (
          <div className="py-6 text-center text-sm text-text-muted">
            cc-switch 中没有 claude 供应商。
          </div>
        )}

        {!loading && providers.length > 0 && (
          <div className="ui-thin-scroll max-h-[50vh] space-y-1 overflow-y-auto pr-0">
            {providers.map((provider) => {
              const matched = probe?.matchedProviderId === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  disabled={applyingId !== null || provider.configParseError}
                  onClick={() => void applyProvider(provider)}
                  className={`flex w-full items-center gap-2 rounded border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    matched
                      ? "border-accent/40 bg-accent/10"
                      : "border-border bg-bg-tertiary hover:opacity-80"
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="truncate text-sm font-medium text-text-primary"
                        title={provider.name}
                      >
                        {provider.name}
                      </span>
                      {provider.isCurrent && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                          全局当前
                        </span>
                      )}
                      {provider.category && (
                        <span className="shrink-0 rounded-full bg-bg-secondary px-1.5 py-0.5 text-[10px] text-text-secondary">
                          {provider.category}
                        </span>
                      )}
                      {provider.configParseError && (
                        <span className="shrink-0 rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] text-danger">
                          配置解析失败
                        </span>
                      )}
                    </span>
                    {provider.baseUrl && (
                      <span
                        className="truncate text-xs text-text-muted"
                        title={provider.baseUrl}
                      >
                        {provider.baseUrl}
                      </span>
                    )}
                  </span>
                  {applyingId === provider.id ? (
                    <span className="shrink-0 text-xs text-text-muted">切换中…</span>
                  ) : (
                    matched && (
                      <Check size={14} strokeWidth={2} className="shrink-0 text-accent" />
                    )
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!loading && probe && !probe.hasSettingsFile && (
          <p className="mt-3 text-xs text-text-muted">
            该项目暂无 .claude/settings.json，切换时将自动创建。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
