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
  Divider,
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

function ProviderListItem({
  provider,
  isSelected,
  onClick,
}: {
  provider: CcSwitchProvider;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? "border-accent/40 bg-accent/10"
          : "border-border bg-bg-tertiary hover:opacity-80"
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text-primary" title={provider.name}>
            {provider.name}
          </span>
          {provider.isCurrent && (
            <Badge variant="light" color="green" radius="xl" size="xs" className="shrink-0">
              当前
            </Badge>
          )}
          {provider.category && (
            <Badge variant="light" color="gray" radius="xl" size="xs" className="shrink-0">
              {provider.category}
            </Badge>
          )}
        </span>
      </span>
    </button>
  );
}

function ProviderDetailPanel({ provider }: { provider: CcSwitchProvider }) {
  const envEntries = Object.entries(provider.maskedEnv);
  const websiteUrl = provider.websiteUrl;

  return (
    <Card className="border border-border bg-surface-container-low" p="md" radius="lg">
      <Stack gap="md">
        <Box>
          <Group gap="xs" wrap="wrap">
            <Text size="lg" fw={600} c="var(--on-surface)">
              {provider.name}
            </Text>
            {provider.isCurrent && (
              <Badge variant="light" color="green" radius="xl">
                全局当前
              </Badge>
            )}
            {provider.category && (
              <Badge variant="light" color="gray" radius="xl">
                {provider.category}
              </Badge>
            )}
            {provider.apiFormat && (
              <Badge variant="light" color="blue" radius="xl">
                {provider.apiFormat}
              </Badge>
            )}
            {provider.configParseError && (
              <Badge variant="light" color="red" radius="xl">
                配置解析失败
              </Badge>
            )}
          </Group>
          {websiteUrl && (
            <Button
              size="compact-sm"
              variant="subtle"
              mt="xs"
              onClick={() => {
                void openUrl(websiteUrl).catch((err) => {
                  toast.error("无法打开链接", { description: String(err) });
                });
              }}
            >
              官网
            </Button>
          )}
        </Box>

        <Divider />

        <Stack gap="xs">
          {provider.baseUrl && <InfoRow label="BASE_URL" value={provider.baseUrl} />}
          {provider.model && <InfoRow label="模型" value={provider.model} />}
          {provider.notes && (
            <Box>
              <Text size="xs" c="var(--text-muted)" mb={4}>
                备注
              </Text>
              <Text size="xs" c="var(--on-surface)" className="break-all">
                {provider.notes}
              </Text>
            </Box>
          )}
        </Stack>

        {envEntries.length > 0 && (
          <>
            <Divider />
            <Box>
              <Text size="xs" c="var(--text-muted)" mb="xs">
                环境变量 ({envEntries.length})
              </Text>
              <Stack gap={4} className="rounded-md bg-surface-container-lowest/70 px-3 py-2">
                {envEntries.map(([key, value]) => (
                  <Text
                    key={key}
                    component="code"
                    size="xs"
                    ff="var(--font-ui-mono)"
                    c="var(--on-surface)"
                    className="break-all leading-5"
                  >
                    {key}={value}
                  </Text>
                ))}
              </Stack>
            </Box>
          </>
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
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

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

  useEffect(() => {
    if (visibleProviders.length === 0) {
      setSelectedProviderId(null);
    } else if (!selectedProviderId || !visibleProviders.some((p) => p.id === selectedProviderId)) {
      setSelectedProviderId(visibleProviders[0].id);
    }
  }, [visibleProviders, selectedProviderId]);

  const selectedProvider = visibleProviders.find((p) => p.id === selectedProviderId) ?? null;

  return (
    <Stack gap="md" className="flex-1">
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

      {data && visibleProviders.length > 0 && (
        <Box className="flex min-h-0 flex-1 gap-4">
          <Box className="w-[360px] shrink-0 space-y-1.5 overflow-y-auto">
            {visibleProviders.map((provider) => (
              <ProviderListItem
                key={`${provider.appType}-${provider.id}`}
                provider={provider}
                isSelected={provider.id === selectedProviderId}
                onClick={() => setSelectedProviderId(provider.id)}
              />
            ))}
          </Box>
          <Box className="min-w-0 flex-1 overflow-y-auto">
            {selectedProvider ? (
              <ProviderDetailPanel provider={selectedProvider} />
            ) : (
              <Text size="sm" c="var(--text-muted)" py="md">
                请选择一个供应商
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Stack>
  );
}
