import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Project } from "../lib/types";
import { useSettingsStore } from "../stores/settingsStore";
import { useProjectStore } from "../stores/projectStore";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { AlertTriangle, Boxes, Check, ChevronRight, Database } from "./icons";
import { ProviderBadge, type ProviderBadgeTone } from "./provider/ProviderRow";
import { VendorIcon, inferVendor, type VendorKey } from "./VendorIcon";
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

type SwitchBadge = {
  label: string;
  tone: ProviderBadgeTone;
};

function inferProviderVendor(provider: ClaudeProvider): VendorKey | null {
  return (
    inferVendor(provider.baseUrl) ??
    inferVendor(provider.appType) ??
    inferVendor(provider.name) ??
    inferVendor(provider.category)
  );
}

function ProviderSwitchListButton({
  selected,
  disabled = false,
  onClick,
  icon,
  name,
  subtitle,
  subtitleTitle,
  badges = [],
  trailing,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  name: string;
  subtitle?: string;
  subtitleTitle?: string;
  badges?: SwitchBadge[];
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      className="ui-focus-ring flex w-full items-center gap-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        appearance: "none",
        padding: "9px 10px",
        borderRadius: 14,
        backgroundColor: selected
          ? "color-mix(in srgb, var(--primary) 10%, var(--surface-container-lowest))"
          : "var(--surface-container-lowest)",
        border: selected
          ? "1px solid color-mix(in srgb, var(--primary) 42%, transparent)"
          : "1px solid color-mix(in srgb, var(--border) 22%, transparent)",
        boxShadow: selected
          ? "0 4px 14px color-mix(in srgb, var(--primary) 12%, transparent)"
          : "none",
        color: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        font: "inherit",
      }}
      onMouseEnter={(e) => {
        if (!selected && !disabled) e.currentTarget.style.backgroundColor = "var(--surface-container-low)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.backgroundColor = "var(--surface-container-lowest)";
      }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: "var(--surface-container-high)",
          color: "var(--on-surface)",
        }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px] font-bold"
          style={{ color: selected ? "var(--primary)" : "var(--on-surface)" }}
        >
          {name}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[10px] text-text-muted" title={subtitleTitle ?? subtitle}>
            {subtitle}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {trailing ??
          badges.map((badge) => (
            <ProviderBadge key={`${badge.tone}-${badge.label}`} tone={badge.tone}>
              {badge.label}
            </ProviderBadge>
          ))}
        <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
      </span>
    </button>
  );
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
      <DialogContent className="max-w-[480px] p-4">
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
          <div className="mb-1">
            <ProviderSwitchListButton
              selected={followGlobal}
              disabled={applyingId !== null}
              onClick={() => {
                if (!followGlobal) void resetToGlobal();
              }}
              icon={<Database size={18} strokeWidth={2.1} />}
              name="跟随全局供应商"
              subtitle={globalCurrentName ? `当前全局：${globalCurrentName}` : "cc-switch 未设置全局当前供应商"}
              trailing={
                applyingId === RESET_APPLYING_ID ? (
                  <span className="text-xs text-text-muted">恢复中…</span>
                ) : followGlobal ? (
                  <Check size={14} strokeWidth={2} style={{ color: "var(--primary)" }} />
                ) : undefined
              }
            />
          </div>
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
          <div className="ui-thin-scroll max-h-[50vh] space-y-2.5 overflow-y-auto pr-0">
            {providers.map((provider) => {
              const matched = probe?.matchedProviderId === provider.id;
              const vendor = inferProviderVendor(provider);
              const subtitle = provider.baseUrl ?? provider.category ?? undefined;
              const badges: SwitchBadge[] = [];
              if (applyingId === provider.id) {
                badges.push({ label: "切换中…", tone: "neutral" });
              } else if (matched) {
                badges.push({ label: "ACTIVE", tone: "primary" });
              } else if (provider.isCurrent) {
                badges.push({ label: "当前", tone: "primary" });
              } else if (provider.category) {
                badges.push({ label: provider.category, tone: "neutral" });
              }
              if (provider.configParseError) badges.push({ label: "配置解析失败", tone: "danger" });

              return (
                <ProviderSwitchListButton
                  key={provider.id}
                  selected={matched}
                  disabled={applyingId !== null || provider.configParseError}
                  onClick={() => void applyProvider(provider)}
                  icon={<VendorIcon vendor={vendor} size={21} fallback={Boxes} />}
                  name={provider.name}
                  subtitle={subtitle}
                  subtitleTitle={provider.baseUrl ?? provider.category ?? undefined}
                  badges={badges}
                />
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
