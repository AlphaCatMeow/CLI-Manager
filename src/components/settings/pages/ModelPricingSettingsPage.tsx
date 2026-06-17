import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Select,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useModelPricingStore, type ModelPriceSyncCandidate } from "@/stores/modelPricingStore";
import { normalizeModelId, type ModelPrice } from "@/lib/modelPricing";

interface Props {
  searchValue: string;
}

type FilterMode = "all" | "missing" | "saved" | "candidates";

type PriceDraft = {
  model: string;
  inputPer1m: number;
  outputPer1m: number;
  cacheReadPer1m: number;
  cacheCreationPer1m: number;
};

const EMPTY_DRAFT: PriceDraft = {
  model: "",
  inputPer1m: 0,
  outputPer1m: 0,
  cacheReadPer1m: 0,
  cacheCreationPer1m: 0,
};

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
}

function sourceLabel(source: string): string {
  if (source === "builtin") return "内置";
  if (source === "manual") return "手动";
  if (source === "litellm") return "LiteLLM";
  if (source === "openrouter") return "OpenRouter";
  return source;
}

function sourceTone(source: string): string {
  if (source === "builtin") return "gray";
  if (source === "manual") return "blue";
  if (source === "litellm") return "green";
  if (source === "openrouter") return "violet";
  return "gray";
}

function draftFromPrice(price: ModelPrice | null): PriceDraft {
  if (!price) return EMPTY_DRAFT;
  return {
    model: price.model,
    inputPer1m: price.inputPer1m,
    outputPer1m: price.outputPer1m,
    cacheReadPer1m: price.cacheReadPer1m,
    cacheCreationPer1m: price.cacheCreationPer1m,
  };
}

function hasPrice(prices: Record<string, ModelPrice>, model: string): boolean {
  const normalized = normalizeModelId(model);
  if (!normalized) return false;
  return Object.values(prices).some((price) => normalizeModelId(price.model) === normalized);
}

function candidateKey(candidate: ModelPriceSyncCandidate): string {
  return `${candidate.targetModel}::${candidate.remote.sourceModelId}`;
}

export function ModelPricingSettingsPage({ searchValue }: Props) {
  const {
    modelPrices,
    discoveredModels,
    candidates,
    unmatchedModels,
    loaded,
    loading,
    syncing,
    discovering,
    error,
    lastSyncResult,
    load,
    upsert,
    delete: deletePrices,
    sync,
    applyCandidate,
    applyCandidates,
    discover,
    clearCandidates,
  } = useModelPricingStore();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [draft, setDraft] = useState<PriceDraft>(EMPTY_DRAFT);
  const [candidateSelections, setCandidateSelections] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);

  useEffect(() => {
    if (!loaded && !loading) {
      void load().catch((err) => toast.error("加载模型价格失败", { description: String(err) }));
    }
  }, [loaded, loading, load]);

  const prices = useMemo(() => Object.values(modelPrices).sort((a, b) => a.model.localeCompare(b.model)), [modelPrices]);
  const missingModels = useMemo(
    () => discoveredModels.filter((model) => !hasPrice(modelPrices, model)),
    [discoveredModels, modelPrices]
  );
  const query = searchValue.trim().toLowerCase();
  const filteredPrices = useMemo(() => {
    const base = filter === "missing" || filter === "candidates" ? [] : prices;
    if (!query) return base;
    return base.filter((price) => price.model.toLowerCase().includes(query) || price.source.toLowerCase().includes(query));
  }, [filter, prices, query]);
  const visibleMissing = useMemo(() => {
    if (filter !== "all" && filter !== "missing") return [];
    return missingModels.filter((model) => !query || model.toLowerCase().includes(query));
  }, [filter, missingModels, query]);
  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, ModelPriceSyncCandidate[]>();
    for (const candidate of candidates) {
      if (query && !candidate.targetModel.toLowerCase().includes(query) && !candidate.remote.model.toLowerCase().includes(query)) continue;
      const items = groups.get(candidate.targetModel) ?? [];
      items.push(candidate);
      groups.set(candidate.targetModel, items);
    }
    return Array.from(groups.entries()).map(([targetModel, items]) => ({ targetModel, items }));
  }, [candidates, query]);
  // 只把「确实没有价格」的模型当作未匹配提示，避免已有内置价的带日期模型反复出现。
  const pendingUnmatched = useMemo(
    () => unmatchedModels.filter((model) => !hasPrice(modelPrices, model)),
    [unmatchedModels, modelPrices]
  );

  const openAddEditor = (model = "") => {
    setEditingModel(null);
    setDraft({ ...EMPTY_DRAFT, model });
    setEditorOpen(true);
  };

  const openEditEditor = (price: ModelPrice) => {
    setEditingModel(price.model);
    setDraft(draftFromPrice(price));
    setEditorOpen(true);
  };

  const saveDraft = async () => {
    const model = draft.model.trim();
    if (!model) {
      toast.error("模型名不能为空");
      return;
    }
    const existing = editingModel ? modelPrices[editingModel] : modelPrices[model];
    const now = Date.now();
    const price: ModelPrice = {
      model,
      inputPer1m: draft.inputPer1m,
      outputPer1m: draft.outputPer1m,
      cacheReadPer1m: draft.cacheReadPer1m,
      cacheCreationPer1m: draft.cacheCreationPer1m,
      source: existing?.source === "builtin" ? "manual" : existing?.source ?? "manual",
      sourceModelId: existing?.sourceModelId ?? null,
      rawJson: existing?.rawJson ?? null,
      updatedAtMs: now,
      syncedAtMs: existing?.syncedAtMs ?? null,
    };
    try {
      if (editingModel && editingModel !== model) {
        await deletePrices([editingModel]);
      }
      await upsert([price]);
      setEditorOpen(false);
      toast.success("模型价格已保存");
    } catch (err) {
      toast.error("保存模型价格失败", { description: String(err) });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePrices([deleteTarget]);
      toast.success("模型价格已删除");
      setDeleteTarget(null);
    } catch (err) {
      toast.error("删除模型价格失败", { description: String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const handleDiscover = async () => {
    const models = await discover();
    toast.success("本地模型识别完成", { description: `识别到 ${models.length} 个模型，缺失价格 ${models.filter((model) => !hasPrice(modelPrices, model)).length} 个。` });
    setFilter("missing");
  };

  const handleSync = async () => {
    try {
      const targets = Array.from(new Set([...prices.map((price) => price.model), ...discoveredModels]));
      const result = await sync(targets);
      toast.success("远程价格同步完成", {
        description: `获取 ${result.fetchedCount} 条，自动匹配 ${result.matched.length} 条，候选 ${result.candidates.length} 条。`,
      });
      if (result.candidates.length > 0) setFilter("candidates");
    } catch (err) {
      toast.error("远程价格同步失败", { description: String(err) });
    }
  };

  const selectedCandidateFor = (targetModel: string, items: ModelPriceSyncCandidate[]): ModelPriceSyncCandidate => {
    const selectedKey = candidateSelections[targetModel] ?? candidateKey(items[0]);
    return items.find((item) => candidateKey(item) === selectedKey) ?? items[0];
  };

  const handleApplyCandidate = async (targetModel: string, items: ModelPriceSyncCandidate[]) => {
    const selected = selectedCandidateFor(targetModel, items);
    try {
      await applyCandidate(selected);
      toast.success("候选价格已应用", { description: `${targetModel} ← ${selected.remote.model}` });
    } catch (err) {
      toast.error("应用候选失败", { description: String(err) });
    }
  };

  const handleApplyAllCandidates = async () => {
    if (groupedCandidates.length === 0) return;
    setApplyingAll(true);
    try {
      const selected = groupedCandidates.map(({ targetModel, items }) => selectedCandidateFor(targetModel, items));
      await applyCandidates(selected);
      toast.success("已批量应用候选价格", { description: `共应用 ${selected.length} 个模型。` });
    } catch (err) {
      toast.error("批量应用候选失败", { description: String(err) });
    } finally {
      setApplyingAll(false);
    }
  };

  const totalCount = prices.length;
  const candidateTargetCount = groupedCandidates.length;
  const showTable = filter === "all" || filter === "saved";

  return (
    <Stack gap="lg" h="100%" style={{ minHeight: 0 }}>
      <Card className="ui-surface-card" p="md">
        <Group justify="space-between" align="flex-start" gap="md">
          <Stack gap={4}>
            <Group gap="xs">
              <Badge variant="light" color="gray">已保存 {totalCount}</Badge>
              <Badge variant="light" color="orange">缺失 {missingModels.length}</Badge>
              <Badge variant="light" color="violet">候选 {candidateTargetCount}</Badge>
            </Group>
            <Text size="sm" c="var(--text-muted)">
              价格单位为 USD / 1M tokens。历史统计和内置终端实时估算会优先使用这里的价格；ccusage 面板仍使用外部工具自身定价。
            </Text>
            {lastSyncResult && (
              <Text size="xs" c="var(--text-muted)">
                最近同步：远程 {lastSyncResult.fetchedCount} 条，自动匹配 {lastSyncResult.matched.length} 条，待确认候选 {candidateTargetCount} 个，缺价未匹配 {pendingUnmatched.length} 条。
              </Text>
            )}
            {error && <Text size="xs" c="var(--danger)">最近错误：{error}</Text>}
          </Stack>
          <Group gap="xs">
            <Button variant="light" loading={discovering} onClick={() => void handleDiscover()}>
              识别本地模型
            </Button>
            <Button variant="light" loading={syncing} onClick={() => void handleSync()}>
              同步远程价格
            </Button>
            <Button onClick={() => openAddEditor()}>手动添加</Button>
          </Group>
        </Group>
      </Card>

      <Card className="ui-surface-card" p="md" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Group justify="space-between" align="center" mb="md">
          <SegmentedControl<FilterMode>
            value={filter}
            onChange={setFilter}
            data={[
              { value: "all", label: "全部" },
              { value: "saved", label: "已保存" },
              { value: "missing", label: `缺失 (${missingModels.length})` },
              { value: "candidates", label: `候选 (${candidateTargetCount})` },
            ]}
          />
          <Group gap="xs">
            {candidateTargetCount > 0 && (
              <Button size="compact-sm" loading={applyingAll} onClick={() => void handleApplyAllCandidates()}>
                全部应用候选 ({candidateTargetCount})
              </Button>
            )}
            {candidates.length > 0 && (
              <Button size="compact-sm" variant="subtle" onClick={clearCandidates}>
                清空候选
              </Button>
            )}
          </Group>
        </Group>

        <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="ui-thin-scroll">
        {showTable && (
          <Table striped highlightOnHover verticalSpacing="sm" stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>模型</Table.Th>
                <Table.Th>来源</Table.Th>
                <Table.Th ta="right">Input</Table.Th>
                <Table.Th ta="right">Output</Table.Th>
                <Table.Th ta="right">Cache Read</Table.Th>
                <Table.Th ta="right">Cache Create</Table.Th>
                <Table.Th ta="right">操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredPrices.map((price) => (
                <Table.Tr key={price.model}>
                  <Table.Td>
                    <Text fw={600} size="sm">{price.model}</Text>
                    {price.sourceModelId && price.sourceModelId !== price.model && (
                      <Text size="xs" c="var(--text-muted)">源 ID：{price.sourceModelId}</Text>
                    )}
                  </Table.Td>
                  <Table.Td><Badge color={sourceTone(price.source)} variant="light">{sourceLabel(price.source)}</Badge></Table.Td>
                  <Table.Td ta="right">{formatPrice(price.inputPer1m)}</Table.Td>
                  <Table.Td ta="right">{formatPrice(price.outputPer1m)}</Table.Td>
                  <Table.Td ta="right">{formatPrice(price.cacheReadPer1m)}</Table.Td>
                  <Table.Td ta="right">{formatPrice(price.cacheCreationPer1m)}</Table.Td>
                  <Table.Td>
                    <Group justify="flex-end" gap="xs" wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" onClick={() => openEditEditor(price)}>编辑</Button>
                      <Button size="compact-xs" color="red" variant="subtle" onClick={() => setDeleteTarget(price.model)}>删除</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {filteredPrices.length === 0 && (
                <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="var(--text-muted)">没有匹配的模型价格。</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}

        {(filter === "all" || filter === "missing") && visibleMissing.length > 0 && (
          <Stack gap="sm" mt={filter === "all" ? "lg" : 0}>
            <Text fw={700}>缺失价格的本地模型</Text>
            {visibleMissing.map((model) => (
              <Group key={model} justify="space-between" className="rounded-xl border border-border/50 px-3 py-2">
                <Box>
                  <Text size="sm" fw={600}>{model}</Text>
                  <Text size="xs" c="var(--text-muted)">费用会计入未定价 Token，直到添加或同步价格。</Text>
                </Box>
                <Button size="compact-sm" variant="light" onClick={() => openAddEditor(model)}>添加价格</Button>
              </Group>
            ))}
          </Stack>
        )}

        {(filter === "all" || filter === "candidates") && groupedCandidates.length > 0 && (
          <Stack gap="sm" mt={filter === "all" ? "lg" : 0}>
            <Group justify="space-between" align="center">
              <Text fw={700}>同步候选确认</Text>
              <Button size="compact-sm" loading={applyingAll} onClick={() => void handleApplyAllCandidates()}>
                全部应用 ({candidateTargetCount})
              </Button>
            </Group>
            {groupedCandidates.map(({ targetModel, items }) => {
              const data = items.map((item) => ({
                value: candidateKey(item),
                label: `${item.remote.model} · ${sourceLabel(item.remote.source)} · ${(item.score * 100).toFixed(1)}%`,
              }));
              const selected = items.find((item) => candidateKey(item) === (candidateSelections[targetModel] ?? data[0]?.value)) ?? items[0];
              return (
                <Card key={targetModel} withBorder p="sm">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <Stack gap={4} className="min-w-0 flex-1">
                      <Text fw={700}>{targetModel}</Text>
                      <Select
                        label="候选远程价格"
                        data={data}
                        value={candidateSelections[targetModel] ?? data[0]?.value ?? null}
                        allowDeselect={false}
                        onChange={(value) => value && setCandidateSelections((prev) => ({ ...prev, [targetModel]: value }))}
                      />
                      {selected && (
                        <Text size="xs" c="var(--text-muted)">
                          Input {formatPrice(selected.remote.inputPer1m)} · Output {formatPrice(selected.remote.outputPer1m)} · Cache Read {formatPrice(selected.remote.cacheReadPer1m)} · Cache Create {formatPrice(selected.remote.cacheCreationPer1m)}
                        </Text>
                      )}
                    </Stack>
                    <Button mt={24} onClick={() => void handleApplyCandidate(targetModel, items)}>确认应用</Button>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}

        {pendingUnmatched.length > 0 && (filter === "all" || filter === "candidates") && (
          <Text size="xs" c="var(--text-muted)" mt="md">
            未匹配模型（仍缺价）：{pendingUnmatched.slice(0, 12).join("、")}{pendingUnmatched.length > 12 ? ` 等 ${pendingUnmatched.length} 个` : ""}
          </Text>
        )}
        </Box>
      </Card>

      <Modal opened={editorOpen} onClose={() => setEditorOpen(false)} title={editingModel ? "编辑模型价格" : "添加模型价格"} centered>
        <Stack gap="md">
          <TextInput
            label="模型 ID"
            value={draft.model}
            disabled={editingModel !== null}
            onChange={(event) => setDraft((prev) => ({ ...prev, model: event.currentTarget.value }))}
          />
          <NumberInput label="Input USD / 1M" min={0} decimalScale={8} value={draft.inputPer1m} onChange={(value) => setDraft((prev) => ({ ...prev, inputPer1m: Number(value) || 0 }))} />
          <NumberInput label="Output USD / 1M" min={0} decimalScale={8} value={draft.outputPer1m} onChange={(value) => setDraft((prev) => ({ ...prev, outputPer1m: Number(value) || 0 }))} />
          <NumberInput label="Cache Read USD / 1M" min={0} decimalScale={8} value={draft.cacheReadPer1m} onChange={(value) => setDraft((prev) => ({ ...prev, cacheReadPer1m: Number(value) || 0 }))} />
          <NumberInput label="Cache Creation USD / 1M" min={0} decimalScale={8} value={draft.cacheCreationPer1m} onChange={(value) => setDraft((prev) => ({ ...prev, cacheCreationPer1m: Number(value) || 0 }))} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setEditorOpen(false)}>取消</Button>
            <Button onClick={() => void saveDraft()}>保存</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="删除模型价格" centered size="sm">
        <Stack gap="md">
          <Text size="sm">
            确认删除 <Text span fw={700}>{deleteTarget}</Text> 的价格？删除后该模型的用量将计入未定价 Token。
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button color="red" loading={deleting} onClick={() => void confirmDelete()}>删除</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
