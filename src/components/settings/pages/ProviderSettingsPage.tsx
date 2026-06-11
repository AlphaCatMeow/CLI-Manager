import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useSettingsStore } from "@/stores/settingsStore";

interface CcSwitchProvider {
  id: string;
  appType: string;
  name: string;
  category: string | null;
  websiteUrl: string | null;
  notes: string | null;
  sortIndex: number | null;
  createdAt: number | null;
  isCurrent: boolean;
  baseUrl: string | null;
  model: string | null;
  apiFormat: string | null;
  maskedEnv: Record<string, string>;
  configParseError: boolean;
}

interface CcSwitchProvidersResponse {
  dbPath: string;
  providers: CcSwitchProvider[];
}

const ERROR_HINTS: Record<string, string> = {
  db_not_found: "未找到 cc-switch 数据库文件，请确认已安装 cc-switch，或手动选择 cc-switch.db。",
  unsupported_format: "所选文件不是 .db 数据库文件，请重新选择。",
};

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const [code, hint] of Object.entries(ERROR_HINTS)) {
    if (message.startsWith(code)) return hint;
  }
  return `读取 cc-switch 数据库失败：${message}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Group gap="md" wrap="nowrap" className="min-w-0">
      <Text size="xs" c="var(--text-muted)" w={88} className="shrink-0">
        {label}
      </Text>
      <Text
        component="code"
        size="xs"
        ff="var(--font-ui-mono)"
        c="var(--on-surface)"
        className="min-w-0 flex-1 break-all leading-5"
        title={value}
      >
        {value}
      </Text>
    </Group>
  );
}

function ProviderCard({ provider }: { provider: CcSwitchProvider }) {
  const [envExpanded, setEnvExpanded] = useState(false);
  const envEntries = Object.entries(provider.maskedEnv);
  const websiteUrl = provider.websiteUrl;

  return (
    <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap" className="min-w-0">
          <Text size="sm" fw={600} c="var(--on-surface)" truncate className="min-w-0" title={provider.name}>
            {provider.name}
          </Text>
          {provider.isCurrent && (
            <Badge variant="light" color="green" radius="xl" className="shrink-0">
              当前
            </Badge>
          )}
          {provider.category && (
            <Badge variant="light" color="gray" radius="xl" className="shrink-0">
              {provider.category}
            </Badge>
          )}
          {provider.apiFormat && (
            <Badge variant="light" color="blue" radius="xl" className="shrink-0">
              {provider.apiFormat}
            </Badge>
          )}
          {provider.configParseError && (
            <Badge variant="light" color="red" radius="xl" className="shrink-0">
              配置解析失败
            </Badge>
          )}
          <Box className="flex-1" />
          {websiteUrl && (
            <Button
              size="compact-xs"
              variant="subtle"
              className="shrink-0"
              onClick={() => {
                void openUrl(websiteUrl).catch((err) => {
                  toast.error("无法打开链接", { description: String(err) });
                });
              }}
            >
              官网
            </Button>
          )}
        </Group>

        {provider.baseUrl && <InfoRow label="BASE_URL" value={provider.baseUrl} />}
        {provider.model && <InfoRow label="模型" value={provider.model} />}
        {provider.notes && (
          <Text size="xs" c="var(--text-muted)" className="break-all">
            {provider.notes}
          </Text>
        )}

        {envEntries.length > 0 && (
          <Box>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setEnvExpanded((prev) => !prev)}
            >
              {envExpanded ? "收起环境变量" : `环境变量 (${envEntries.length})`}
            </Button>
            {envExpanded && (
              <Stack gap={4} mt={6} className="rounded-md bg-surface-container-lowest/70 px-3 py-2">
                {envEntries.map(([key, value]) => (
                  <InfoRow key={key} label="" value={`${key}=${value}`} />
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Stack>
    </Card>
  );
}

export function ProviderSettingsPage({ searchValue }: { searchValue: string }) {
  const ccSwitchDbPath = useSettingsStore((s) => s.ccSwitchDbPath);
  const updateSetting = useSettingsStore((s) => s.update);
  const [data, setData] = useState<CcSwitchProvidersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appTypeFilter, setAppTypeFilter] = useState("claude");

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<CcSwitchProvidersResponse>("ccswitch_list_providers", {
        dbPath: ccSwitchDbPath ?? undefined,
      });
      setData(response);
    } catch (err) {
      setData(null);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [ccSwitchDbPath]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const pickDbFile = async () => {
    let selected: string | string[] | null = null;
    try {
      selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite 数据库", extensions: ["db"] }],
      });
    } catch (err) {
      toast.error("无法打开文件选择器", { description: String(err) });
      return;
    }
    if (typeof selected === "string" && selected.trim()) {
      await updateSetting("ccSwitchDbPath", selected);
    }
  };

  const resetDbPath = async () => {
    await updateSetting("ccSwitchDbPath", null);
  };

  const appTypeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const provider of data?.providers ?? []) {
      counts.set(provider.appType, (counts.get(provider.appType) ?? 0) + 1);
    }
    const types = [...counts.keys()].sort((a, b) =>
      a === "claude" ? -1 : b === "claude" ? 1 : a.localeCompare(b)
    );
    return types.map((type) => ({
      value: type,
      label: `${type} (${counts.get(type)})`,
    }));
  }, [data]);

  // 数据加载后若当前筛选项不存在（例如 db 中没有 claude），回退到第一个可用类型
  useEffect(() => {
    if (appTypeOptions.length === 0) return;
    if (!appTypeOptions.some((option) => option.value === appTypeFilter)) {
      setAppTypeFilter(appTypeOptions[0].value);
    }
  }, [appTypeOptions, appTypeFilter]);

  const visibleProviders = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    return (data?.providers ?? []).filter((provider) => {
      if (provider.appType !== appTypeFilter) return false;
      if (!keyword) return true;
      return [provider.name, provider.baseUrl, provider.category, provider.model]
        .filter((field): field is string => typeof field === "string")
        .some((field) => field.toLowerCase().includes(keyword));
    });
  }, [data, appTypeFilter, searchValue]);

  return (
    <Stack gap="md" maw={860}>
      <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
        <Stack gap="xs">
          <Group justify="space-between" align="center" gap="md" wrap="nowrap">
            <Box className="min-w-0">
              <Text size="sm" fw={500} c="var(--on-surface)">
                cc-switch 数据库
              </Text>
              <Text mt={4} size="xs" c="var(--text-muted)">
                只读解析 cc-switch 的供应商配置；密钥已脱敏，留空使用默认路径
                ~/.cc-switch/cc-switch.db。
              </Text>
            </Box>
            <Group gap="xs" className="shrink-0">
              <Button size="compact-sm" variant="default" onClick={() => void pickDbFile()}>
                选择文件
              </Button>
              {ccSwitchDbPath && (
                <Button size="compact-sm" variant="subtle" color="gray" onClick={() => void resetDbPath()}>
                  重置默认
                </Button>
              )}
              <Button size="compact-sm" variant="default" onClick={() => void loadProviders()} loading={loading}>
                刷新
              </Button>
            </Group>
          </Group>
          <InfoRow label="路径" value={data?.dbPath ?? ccSwitchDbPath ?? "默认路径"} />
        </Stack>
      </Card>

      {error && (
        <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
          <Text size="sm" c="var(--danger, #e5484d)">
            {error}
          </Text>
        </Card>
      )}

      {loading && !data && (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      )}

      {data && appTypeOptions.length > 0 && (
        <SegmentedControl
          value={appTypeFilter}
          onChange={setAppTypeFilter}
          data={appTypeOptions}
          size="xs"
          className="self-start"
        />
      )}

      {data && visibleProviders.length === 0 && !loading && (
        <Text size="sm" c="var(--text-muted)" py="md">
          {searchValue.trim() ? "没有匹配的供应商。" : "该类型下没有供应商。"}
        </Text>
      )}

      <Stack gap="sm">
        {visibleProviders.map((provider) => (
          <ProviderCard key={`${provider.appType}-${provider.id}`} provider={provider} />
        ))}
      </Stack>
    </Stack>
  );
}
