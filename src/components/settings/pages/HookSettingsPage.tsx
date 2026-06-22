import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Badge, Box, Button, Card, Group, SimpleGrid, Stack, Switch, Text, TextInput } from "@mantine/core";
import { Play, Settings, AlertTriangle, CheckCircle, HelpCircle, ChevronDown, ChevronUp, Folder, FileCode, Copy, Check, X } from "lucide-react";
import { useSettingsStore, type HookEventType } from "@/stores/settingsStore";

type HookInstallStatus = "directoryMissing" | "notInstalled" | "partialInstalled" | "installed";

interface ToolHookSettingsStatus {
  configDir: string | null;
  hooksDir: string | null;
  configPath: string | null;
  featureConfigPath: string | null;
  status: HookInstallStatus;
  attentionScriptInstalled: boolean;
  finishedScriptInstalled: boolean;
  sessionStartHookInstalled: boolean;
  runningHookInstalled: boolean;
  attentionHookInstalled: boolean;
  stopHookInstalled: boolean;
  failureHookInstalled: boolean;
  hooksFeatureInstalled: boolean;
}

interface HookSettingsStatus {
  claude: ToolHookSettingsStatus;
  codex: ToolHookSettingsStatus;
}

const STATUS_LABELS: Record<HookInstallStatus, string> = {
  directoryMissing: "目录未选择",
  notInstalled: "未安装",
  partialInstalled: "部分安装",
  installed: "已安装",
};

const STATUS_COLORS: Record<HookInstallStatus, string> = {
  directoryMissing: "yellow",
  notInstalled: "gray",
  partialInstalled: "yellow",
  installed: "green",
};

const SYSTEM_NOTIFICATION_EVENT_OPTIONS: readonly {
  event: HookEventType;
  title: string;
  description: string;
}[] = [
  {
    event: "Stop",
    title: "任务完成",
    description: "Claude Code 或 Codex CLI 任务正常结束时发送系统通知。",
  },
  {
    event: "StopFailure",
    title: "执行失败",
    description: "Hook 上报异常退出或失败状态时发送系统通知。",
  },
  {
    event: "PermissionRequest",
    title: "需要审批",
    description: "CLI 请求权限审批、需要你回到终端处理时发送系统通知。",
  },
  {
    event: "Notification",
    title: "提醒",
    description: "CLI 主动上报提醒消息时发送系统通知。",
  },
  {
    event: "SessionStart",
    title: "会话启动",
    description: "新会话绑定到 CLI-Manager 标签页时发送系统通知。",
  },
  {
    event: "UserPromptSubmit",
    title: "命令提交",
    description: "用户提示词提交并进入运行流程时发送系统通知。",
  },
];

function formatPath(value: string | null): string {
  return value && value.trim() ? value : "未选择";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function PathRow({ label, value }: { label: string; value: string | null }) {
  const formatted = formatPath(value);
  const hasValue = Boolean(value && value.trim());
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!hasValue || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getIcon = () => {
    if (label.includes('目录')) return <Folder size={16} />;
    if (label.includes('json') || label.includes('toml')) return <FileCode size={16} />;
    return <FileCode size={16} />;
  };

  return (
    <Card className="border border-border/50 bg-surface-container-lowest" p="sm" radius="md">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Box
          style={{
            color: hasValue ? "var(--primary)" : "var(--text-muted)",
            marginTop: 2,
          }}
        >
          {getIcon()}
        </Box>
        <Stack gap={4} className="min-w-0 flex-1">
          <Text size="xs" fw={500} c="var(--on-surface-variant)">
            {label}
          </Text>
          <Text
            component="code"
            size="xs"
            ff="var(--font-ui-mono)"
            c={hasValue ? "var(--on-surface)" : "var(--text-muted)"}
            className="min-w-0 break-all leading-5"
            title={formatted}
          >
            {formatted}
          </Text>
        </Stack>
        {hasValue && (
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            onClick={handleCopy}
            className="shrink-0"
            aria-label="复制路径"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
        )}
      </Group>
    </Card>
  );
}

interface HookCardProps {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
}

function HookCard({ icon, label, checked }: HookCardProps) {
  return (
    <Card
      className="border transition-colors"
      p="md"
      radius="lg"
      style={{
        borderColor: checked ? "var(--success)" : "var(--border)",
        backgroundColor: checked ? "var(--success-container)" : "var(--surface-container-low)",
      }}
    >
      <Stack gap="xs" align="center">
        <Box
          style={{
            color: checked ? "var(--success)" : "var(--text-muted)",
            fontSize: 32,
          }}
        >
          {icon}
        </Box>
        <Text size="xs" fw={500} c={checked ? "var(--on-success-container)" : "var(--on-surface-variant)"} ta="center" lh={1.4}>
          {label}
        </Text>
        <Badge
          variant="filled"
          color={checked ? "green" : "gray"}
          radius="xl"
          size="xs"
        >
          {checked ? "已安装" : "未安装"}
        </Badge>
      </Stack>
    </Card>
  );
}

function StatusPill({ status }: { status: HookInstallStatus }) {
  return (
    <Badge variant="light" color={STATUS_COLORS[status]} radius="xl">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function SettingsSwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
      <Group justify="space-between" align="center" gap="md" wrap="nowrap">
        <Box>
          <Text size="sm" fw={500} c="var(--on-surface)">
            {title}
          </Text>
          <Text mt={4} size="xs" c="var(--text-muted)">
            {description}
          </Text>
        </Box>
        <Switch
          color="cliPrimary"
          className="shrink-0"
          checked={checked}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          aria-label={title}
        />
      </Group>
    </Card>
  );
}

export function HookSettingsPage() {
  const claudeHookConfigDir = useSettingsStore((s) => s.claudeHookConfigDir);
  const codexHookConfigDir = useSettingsStore((s) => s.codexHookConfigDir);
  const [status, setStatus] = useState<HookSettingsStatus | null>(null);
  const [selectedDir, setSelectedDir] = useState<string | null>(claudeHookConfigDir);
  const [codexSelectedDir, setCodexSelectedDir] = useState<string | null>(codexHookConfigDir);
  const [loading, setLoading] = useState(false);
  const [claudeWorking, setClaudeWorking] = useState(false);
  const [codexWorking, setCodexWorking] = useState(false);
  const hookPopupNotificationsEnabled = useSettingsStore((s) => s.hookPopupNotificationsEnabled);
  const hookPopupAutoCloseEnabled = useSettingsStore((s) => s.hookPopupAutoCloseEnabled);
  const hookPopupAutoCloseSeconds = useSettingsStore((s) => s.hookPopupAutoCloseSeconds);
  const systemNotificationsEnabled = useSettingsStore((s) => s.systemNotificationsEnabled);
  const systemNotificationEvents = useSettingsStore((s) => s.systemNotificationEvents);
  const updateSetting = useSettingsStore((s) => s.update);
  const [autoCloseSecondsDraft, setAutoCloseSecondsDraft] = useState(String(hookPopupAutoCloseSeconds));
  const [claudePathsOpen, setClaudePathsOpen] = useState(false);
  const [claudeInfoOpen, setClaudeInfoOpen] = useState(false);
  const [codexPathsOpen, setCodexPathsOpen] = useState(false);
  const [codexInfoOpen, setCodexInfoOpen] = useState(false);

  useEffect(() => {
    setAutoCloseSecondsDraft(String(hookPopupAutoCloseSeconds));
  }, [hookPopupAutoCloseSeconds]);

  const selectedDirArg = useMemo(() => selectedDir ?? undefined, [selectedDir]);
  const codexSelectedDirArg = useMemo(() => codexSelectedDir ?? undefined, [codexSelectedDir]);

  const refreshStatus = async (dir = selectedDirArg, codexDir = codexSelectedDirArg) => {
    setLoading(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_get_status", {
        selectedDir: dir,
        codexSelectedDir: codexDir,
      });
      setStatus(nextStatus);
      if (nextStatus.claude.configDir) {
        setSelectedDir(nextStatus.claude.configDir);
      }
      if (nextStatus.codex.configDir) {
        setCodexSelectedDir(nextStatus.codex.configDir);
      }
    } catch (error) {
      toast.error("刷新 Hook 状态失败", { description: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const handleSelectDir = async () => {
    try {
      const dir = await invoke<string | null>("hook_settings_select_dir", {
        title: "选择 Claude 配置目录",
      });
      if (!dir) return;
      setSelectedDir(dir);
      await updateSetting("claudeHookConfigDir", dir);
      await refreshStatus(dir, codexSelectedDirArg);
    } catch (error) {
      toast.error("选择目录失败", { description: getErrorMessage(error) });
    }
  };

  const handleSelectCodexDir = async () => {
    try {
      const dir = await invoke<string | null>("hook_settings_select_dir", {
        title: "选择 Codex 配置目录",
      });
      if (!dir) return;
      setCodexSelectedDir(dir);
      await updateSetting("codexHookConfigDir", dir);
      await refreshStatus(selectedDirArg, dir);
    } catch (error) {
      toast.error("选择 Codex 目录失败", { description: getErrorMessage(error) });
    }
  };

  // 手动粘贴配置目录（支持 WSL UNC，如 \\wsl.localhost\Ubuntu-22.04\home\<用户名>\.claude）。
  // 原生选目录弹窗进 WSL 路径体验差，故提供文本输入兜底。
  const handleManualClaudeDirCommit = async (raw: string) => {
    const dir = raw.trim() || null;
    setSelectedDir(dir);
    await updateSetting("claudeHookConfigDir", dir);
    await refreshStatus(dir ?? undefined, codexSelectedDirArg);
  };

  const handleManualCodexDirCommit = async (raw: string) => {
    const dir = raw.trim() || null;
    setCodexSelectedDir(dir);
    await updateSetting("codexHookConfigDir", dir);
    await refreshStatus(selectedDirArg, dir ?? undefined);
  };

  const handleClaudeInstall = async () => {
    setClaudeWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_install", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.claude.configDir) setSelectedDir(nextStatus.claude.configDir);
      toast.success("Claude Hook 已安装");
    } catch (error) {
      toast.error("安装 Claude Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setClaudeWorking(false);
    }
  };

  const handleClaudeUninstall = async () => {
    setClaudeWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_uninstall", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.claude.configDir) setSelectedDir(nextStatus.claude.configDir);
      toast.success("Claude Hook 已删除");
    } catch (error) {
      toast.error("删除 Claude Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setClaudeWorking(false);
    }
  };

  const handleCodexInstall = async () => {
    setCodexWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_install_codex", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.codex.configDir) setCodexSelectedDir(nextStatus.codex.configDir);
      toast.success("Codex Hook 已安装");
    } catch (error) {
      toast.error("安装 Codex Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setCodexWorking(false);
    }
  };

  const handleCodexUninstall = async () => {
    setCodexWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_uninstall_codex", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.codex.configDir) setCodexSelectedDir(nextStatus.codex.configDir);
      toast.success("Codex Hook 已删除");
    } catch (error) {
      toast.error("删除 Codex Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setCodexWorking(false);
    }
  };

  const handleCommitAutoCloseSeconds = () => {
    const nextValue = Number(autoCloseSecondsDraft);
    const nextSeconds = Number.isFinite(nextValue) ? Math.round(nextValue) : hookPopupAutoCloseSeconds;
    const clampedSeconds = Math.max(5, Math.min(3600, nextSeconds));
    setAutoCloseSecondsDraft(String(clampedSeconds));
    if (clampedSeconds !== hookPopupAutoCloseSeconds) {
      void updateSetting("hookPopupAutoCloseSeconds", clampedSeconds);
    }
  };

  const claude = status?.claude;
  const codex = status?.codex;
  const claudeStatus = claude?.status ?? "directoryMissing";
  const codexStatus = codex?.status ?? "directoryMissing";
  const claudeSessionStartInstalled = Boolean(claude?.attentionScriptInstalled && claude.sessionStartHookInstalled);
  const claudeRunningInstalled = Boolean(claude?.attentionScriptInstalled && claude.runningHookInstalled);
  const claudeAttentionInstalled = Boolean(claude?.attentionScriptInstalled && claude.attentionHookInstalled);
  const claudeFinishedInstalled = Boolean(claude?.finishedScriptInstalled && claude.stopHookInstalled && claude.failureHookInstalled);
  const codexSessionStartInstalled = Boolean(codex?.attentionScriptInstalled && codex.sessionStartHookInstalled);
  const codexRunningInstalled = Boolean(codex?.attentionScriptInstalled && codex.runningHookInstalled);
  const codexAttentionInstalled = Boolean(codex?.attentionScriptInstalled && codex.attentionHookInstalled);
  const codexFinishedInstalled = Boolean(codex?.finishedScriptInstalled && codex.stopHookInstalled);

  return (
    <Stack gap="md">
      <section className="ui-surface-card rounded-2xl border border-border p-4">
        <Stack gap="md">
          <Box>
            <Text size="sm" fw={600} c="var(--on-surface)">
              Hook 通知弹框
            </Text>
            <Text mt={4} size="xs" c="var(--on-surface-variant)">
              控制 Claude Code 和 Codex CLI Hook 事件的右上角弹框；终端标签小圆点不受这里的弹框开关影响。
            </Text>
          </Box>
          <SettingsSwitchRow
            title="通知弹框"
            description="关闭后不再弹出 Hook 通知卡片，只更新标签栏小圆点颜色。"
            checked={hookPopupNotificationsEnabled}
            onCheckedChange={(checked) => void updateSetting("hookPopupNotificationsEnabled", checked)}
          />
          <SettingsSwitchRow
            title="自动关闭弹框"
            description="开启后 Hook 通知会在指定时间后自动消失。"
            checked={hookPopupAutoCloseEnabled}
            onCheckedChange={(checked) => void updateSetting("hookPopupAutoCloseEnabled", checked)}
          />
          <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
            <Group justify="space-between" align="center" gap="md">
              <Box>
                <Text size="sm" fw={500} c="var(--on-surface)">
                  默认关闭时间
                </Text>
                <Text mt={4} size="xs" c="var(--text-muted)">
                  单位：秒，默认 60 秒；仅在自动关闭开启时可编辑。
                </Text>
              </Box>
              <Group gap="xs">
              <TextInput
                type="number"
                min={5}
                max={3600}
                step={1}
                value={autoCloseSecondsDraft}
                disabled={!hookPopupAutoCloseEnabled}
                onChange={(e) => setAutoCloseSecondsDraft(e.target.value)}
                onBlur={handleCommitAutoCloseSeconds}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCommitAutoCloseSeconds();
                  }
                }}
                w={96}
                size="xs"
                aria-label="Hook 弹框默认关闭时间"
              />
                <Text size="xs" c="var(--on-surface-variant)">
                  秒
                </Text>
              </Group>
            </Group>
          </Card>
        </Stack>
      </section>

      <section className="ui-surface-card rounded-2xl border border-border p-4">
        <Stack gap="md">
          <Box>
            <Text size="sm" fw={600} c="var(--on-surface)">
              系统通知
            </Text>
            <Text mt={4} size="xs" c="var(--on-surface-variant)">
              并行发送系统原生通知，应用内通知弹框和标签小圆点仍按各自开关独立工作；首次发送时操作系统可能会请求授权。
            </Text>
          </Box>
          <SettingsSwitchRow
            title="启用系统通知"
            description="开启后，CLI-Manager 会根据下方事件开关发送 Windows、macOS、Linux 或 WSL 主机通知。"
            checked={systemNotificationsEnabled}
            onCheckedChange={(checked) => void updateSetting("systemNotificationsEnabled", checked)}
          />
          <Stack gap="xs">
            {SYSTEM_NOTIFICATION_EVENT_OPTIONS.map((option) => (
              <SettingsSwitchRow
                key={option.event}
                title={option.title}
                description={option.description}
                checked={systemNotificationEvents[option.event]}
                onCheckedChange={(checked) => {
                  void updateSetting("systemNotificationEvents", {
                    ...useSettingsStore.getState().systemNotificationEvents,
                    [option.event]: checked,
                  });
                }}
              />
            ))}
          </Stack>
        </Stack>
      </section>

      <section className="ui-surface-card rounded-2xl border border-border p-4">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" gap="md">
            <Box>
              <Text size="sm" fw={600} c="var(--on-surface)">
                Claude Code Hook 桥接
              </Text>
              <Text mt={4} size="xs" c="var(--on-surface-variant)">
                Claude Code 的运行中、待审批、完成和异常退出状态通过 Hook 上报；普通 shell 命令由通用 Shell 运行监控补充。
              </Text>
            </Box>
            <StatusPill status={claudeStatus} />
          </Group>

          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <HookCard
              icon={<Play />}
              label="会话启动"
              checked={claudeSessionStartInstalled}
            />
            <HookCard
              icon={<Settings />}
              label="运行中"
              checked={claudeRunningInstalled}
            />
            <HookCard
              icon={<AlertTriangle />}
              label="待审批"
              checked={claudeAttentionInstalled}
            />
            <HookCard
              icon={<CheckCircle />}
              label="完成/异常"
              checked={claudeFinishedInstalled}
            />
          </SimpleGrid>

          <Group gap="xs">
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setClaudePathsOpen(!claudePathsOpen)}
              leftSection={claudePathsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            >
              查看配置路径
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setClaudeInfoOpen(!claudeInfoOpen)}
              leftSection={<HelpCircle size={14} />}
            >
              安装说明
            </Button>
          </Group>

          {claudePathsOpen && (
            <Card className="bg-surface-container-low/50" p="sm" radius="lg">
              <Stack gap="xs">
                <PathRow label="Claude 配置目录" value={claude?.configDir ?? selectedDir} />
                <PathRow label="hooks 目录" value={claude?.hooksDir ?? null} />
                <PathRow label="settings.json" value={claude?.configPath ?? null} />
              </Stack>
            </Card>
          )}

          {claudeInfoOpen && (
            <Card className="bg-surface-container-low/50" p="md" radius="lg">
              <Stack gap="md">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Box style={{ color: "var(--success)", marginTop: 2 }}>
                    <Check size={18} />
                  </Box>
                  <Stack gap={4}>
                    <Text size="xs" fw={500} c="var(--on-surface)">
                      安装内容
                    </Text>
                    <Stack gap={2}>
                      <Group gap="xs">
                        <FileCode size={12} style={{ color: "var(--text-muted)" }} />
                        <Text size="xs" c="var(--on-surface-variant)" ff="var(--font-ui-mono)">
                          settings.json 注册 __hook 命令
                        </Text>
                      </Group>
                      <Group gap="xs">
                        <FileCode size={12} style={{ color: "var(--text-muted)" }} />
                        <Text size="xs" c="var(--on-surface-variant)">
                          指向本程序，跨平台无需脚本
                        </Text>
                      </Group>
                    </Stack>
                  </Stack>
                </Group>

                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Box style={{ color: "var(--warning)", marginTop: 2 }}>
                    <X size={18} />
                  </Box>
                  <Stack gap={4}>
                    <Text size="xs" fw={500} c="var(--on-surface)">
                      删除时保留
                    </Text>
                    <Stack gap={2}>
                      <Text size="xs" c="var(--on-surface-variant)">
                        • 用户自己的 hooks
                      </Text>
                      <Text size="xs" c="var(--on-surface-variant)">
                        • 其它工具注册的 hook 命令
                      </Text>

                    </Stack>
                  </Stack>
                </Group>
              </Stack>
            </Card>
          )}

          <TextInput
            size="xs"
            label="Claude 配置目录（可手动粘贴，支持 WSL UNC）"
            placeholder="\\wsl.localhost\Ubuntu-22.04\home\用户名\.claude"
            value={selectedDir ?? ""}
            onChange={(e) => setSelectedDir(e.currentTarget.value || null)}
            onBlur={(e) => void handleManualClaudeDirCommit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleManualClaudeDirCommit(e.currentTarget.value);
            }}
            disabled={loading || claudeWorking || codexWorking}
          />

          <Group gap="xs">
            <Button variant="light" color="cliPrimary" size="xs" onClick={handleSelectDir} disabled={loading || claudeWorking || codexWorking}>
              选择 Claude 目录
            </Button>
            <Button color="cliPrimary" size="xs" onClick={handleClaudeInstall} disabled={loading || claudeWorking || claudeStatus === "directoryMissing"}>
              {claudeWorking ? "处理中..." : "安装 Claude Hook"}
            </Button>
            <Button variant="light" color="red" size="xs" onClick={handleClaudeUninstall} disabled={loading || claudeWorking || claudeStatus === "directoryMissing"}>
              删除 Claude Hook
            </Button>
            <Button variant="default" color="gray" size="xs" onClick={() => void refreshStatus()} disabled={loading || claudeWorking || codexWorking}>
              {loading ? "刷新中..." : "刷新状态"}
            </Button>
          </Group>
        </Stack>
      </section>

      <section className="ui-surface-card rounded-2xl border border-border p-4">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" gap="md">
            <Box>
              <Text size="sm" fw={600} c="var(--on-surface)">
                Codex CLI Hook 桥接
              </Text>
              <Text mt={4} size="xs" c="var(--on-surface-variant)">
                Codex 的运行中、待审批和完成状态通过 Hook 上报；普通 shell 命令由通用 Shell 运行监控补充。
              </Text>
            </Box>
            <StatusPill status={codexStatus} />
          </Group>

          <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
            <HookCard
              icon={<Play />}
              label="会话启动"
              checked={codexSessionStartInstalled}
            />
            <HookCard
              icon={<Settings />}
              label="运行中"
              checked={codexRunningInstalled}
            />
            <HookCard
              icon={<AlertTriangle />}
              label="待审批"
              checked={codexAttentionInstalled}
            />
            <HookCard
              icon={<CheckCircle />}
              label="完成"
              checked={codexFinishedInstalled}
            />
            <HookCard
              icon={<Settings />}
              label="Hooks 功能"
              checked={Boolean(codex?.hooksFeatureInstalled)}
            />
          </SimpleGrid>

          <Group gap="xs">
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setCodexPathsOpen(!codexPathsOpen)}
              leftSection={codexPathsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            >
              查看配置路径
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setCodexInfoOpen(!codexInfoOpen)}
              leftSection={<HelpCircle size={14} />}
            >
              安装说明
            </Button>
          </Group>

          {codexPathsOpen && (
            <Card className="bg-surface-container-low/50" p="sm" radius="lg">
              <Stack gap="xs">
                <PathRow label="Codex 配置目录" value={codex?.configDir ?? codexSelectedDir} />
                <PathRow label="hooks 目录" value={codex?.hooksDir ?? null} />
                <PathRow label="hooks.json" value={codex?.configPath ?? null} />
                <PathRow label="config.toml" value={codex?.featureConfigPath ?? null} />
              </Stack>
            </Card>
          )}

          {codexInfoOpen && (
            <Card className="bg-surface-container-low/50" p="md" radius="lg">
              <Stack gap="md">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Box style={{ color: "var(--success)", marginTop: 2 }}>
                    <Check size={18} />
                  </Box>
                  <Stack gap={4}>
                    <Text size="xs" fw={500} c="var(--on-surface)">
                      安装内容
                    </Text>
                    <Stack gap={2}>
                      <Group gap="xs">
                        <FileCode size={12} style={{ color: "var(--text-muted)" }} />
                        <Text size="xs" c="var(--on-surface-variant)" ff="var(--font-ui-mono)">
                          hooks.json 注册 __hook 命令
                        </Text>
                      </Group>
                      <Group gap="xs">
                        <FileCode size={12} style={{ color: "var(--text-muted)" }} />
                        <Text size="xs" c="var(--on-surface-variant)">
                          指向本程序，跨平台无需脚本
                        </Text>
                      </Group>
                      <Group gap="xs">
                        <FileCode size={12} style={{ color: "var(--text-muted)" }} />
                        <Text size="xs" c="var(--on-surface-variant)">
                          config.toml 中开启 <span className="font-mono">[features].hooks = true</span>
                        </Text>
                      </Group>
                    </Stack>
                  </Stack>
                </Group>

                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Box style={{ color: "var(--warning)", marginTop: 2 }}>
                    <AlertTriangle size={18} />
                  </Box>
                  <Stack gap={4}>
                    <Text size="xs" fw={500} c="var(--on-surface)">
                      注意事项
                    </Text>
                    <Stack gap={2}>
                      <Text size="xs" c="var(--on-surface-variant)">
                        • 不修改项目级 <span className="font-mono">.codex/hooks.json</span>
                      </Text>
                      <Text size="xs" c="var(--on-surface-variant)">
                        • Codex 0.129+ 仍需在 TUI 执行 <span className="font-mono">/hooks</span> 批准脚本
                      </Text>
                    </Stack>
                  </Stack>
                </Group>
              </Stack>
            </Card>
          )}

          <TextInput
            size="xs"
            label="Codex 配置目录（可手动粘贴，支持 WSL UNC）"
            placeholder="\\wsl.localhost\Ubuntu-22.04\home\用户名\.codex"
            value={codexSelectedDir ?? ""}
            onChange={(e) => setCodexSelectedDir(e.currentTarget.value || null)}
            onBlur={(e) => void handleManualCodexDirCommit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleManualCodexDirCommit(e.currentTarget.value);
            }}
            disabled={loading || claudeWorking || codexWorking}
          />

          <Group gap="xs">
            <Button variant="light" color="cliPrimary" size="xs" onClick={handleSelectCodexDir} disabled={loading || claudeWorking || codexWorking}>
              选择 Codex 目录
            </Button>
            <Button color="cliPrimary" size="xs" onClick={handleCodexInstall} disabled={loading || codexWorking || codexStatus === "directoryMissing"}>
              {codexWorking ? "处理中..." : "安装 Codex Hook"}
            </Button>
            <Button variant="light" color="red" size="xs" onClick={handleCodexUninstall} disabled={loading || codexWorking || codexStatus === "directoryMissing"}>
              删除 Codex Hook
            </Button>
            <Button variant="default" color="gray" size="xs" onClick={() => void refreshStatus()} disabled={loading || claudeWorking || codexWorking}>
              {loading ? "刷新中..." : "刷新状态"}
            </Button>
          </Group>
        </Stack>
      </section>
    </Stack>
  );
}
