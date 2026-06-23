import { Coins, Cpu, Database, Layers3, MessageSquare, TrendingUp } from "lucide-react";
import type { HistorySessionDetail } from "../../lib/types";
import {
  calculateTokenStats,
  Donut,
  formatCompactCount,
  formatCost,
  ProgressBar,
  SegmentedBar,
  Sparkline,
  TERM,
  type SparkPoint,
} from "../stats/termStatsUi";
import { getContextLimit } from "../../lib/modelPricing";

interface SessionContextViewProps {
  session: HistorySessionDetail | null;
}

export function SessionContextView({ session }: SessionContextViewProps) {
  const stats = calculateTokenStats(session);
  const contextLimit = session?.usage?.context_window ?? getContextLimit(stats.dominantModel);
  const lastContextTokens = session?.usage?.last_context_tokens ?? null;
  const usageRatio = contextLimit && lastContextTokens !== null ? lastContextTokens / contextLimit : null;
  const trend = session?.usage?.token_trend ?? [];
  const trendPoints: SparkPoint[] = trend
    .map((point) => ({
      total: point.total_tokens,
      input: point.input_tokens,
      output: point.output_tokens,
      cacheRead: point.cache_read_tokens,
      cacheCreation: point.cache_creation_tokens,
    }))
    .filter((point) => point.total > 0);
  const trendValues = trendPoints.map((point) => point.total);
  const inputTrend = trendPoints.map((point) => point.input ?? 0);
  const outputTrend = trendPoints.map((point) => point.output ?? 0);
  const cacheTrend = trendPoints.map((point) => (point.cacheRead ?? 0) + (point.cacheCreation ?? 0));
  const peakTokens = trendValues.length > 0 ? Math.max(...trendValues) : 0;
  const averageTokens = trendValues.length > 0 ? trendValues.reduce((sum, value) => sum + value, 0) / trendValues.length : 0;
  const remaining = contextLimit && lastContextTokens !== null ? Math.max(0, contextLimit - lastContextTokens) : null;
  const contextColor = usageRatio === null ? TERM.dim : usageRatio >= 0.8 ? TERM.red : usageRatio >= 0.5 ? TERM.yellow : TERM.green;

  if (!session) return <div className="ui-session-process-empty">选择会话查看上下文</div>;

  return (
    <div className="ui-session-context-view">
      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Cpu size={14} />
          上下文窗口
        </div>
        <div className="ui-session-context-main">
          <span>{lastContextTokens !== null ? formatCompactCount(lastContextTokens) : "—"}</span>
          <small>/ {contextLimit ? formatCompactCount(contextLimit) : "未知上限"}</small>
        </div>
        {usageRatio !== null ? (
          <>
            <ProgressBar ratio={usageRatio} color={contextColor} />
            <div className="ui-session-context-subline">
              <span>占用 {(usageRatio * 100).toFixed(1)}%</span>
              <span>剩余 {remaining !== null ? formatCompactCount(remaining) : "—"}</span>
            </div>
          </>
        ) : (
          <div className="ui-session-process-empty compact">当前历史没有上下文窗口数据</div>
        )}
      </section>

      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Layers3 size={14} />
          Token 构成
        </div>
        <div className="ui-session-context-token-card">
          <Donut
            size={74}
            segments={[
              { value: stats.inputTokens, color: TERM.green },
              { value: stats.outputTokens, color: TERM.yellow },
              { value: stats.cacheReadTokens, color: TERM.blue },
              { value: stats.cacheCreationTokens, color: TERM.magenta },
            ]}
          >
            <span className="ui-session-context-donut-label">{formatCompactCount(stats.totalTokens)}</span>
          </Donut>
          <div className="ui-session-process-metrics">
            <span>输入 <b>{formatCompactCount(stats.inputTokens)}</b></span>
            <span>输出 <b>{formatCompactCount(stats.outputTokens)}</b></span>
            <span>缓存命中 <b>{formatCompactCount(stats.cacheReadTokens)}</b></span>
            <span>缓存写入 <b>{formatCompactCount(stats.cacheCreationTokens)}</b></span>
          </div>
        </div>
      </section>

      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Database size={14} />
          请求统计
        </div>
        <div className="ui-session-process-metrics">
          <span>趋势点 <b>{trendPoints.length}</b></span>
          <span>峰值 <b>{formatCompactCount(peakTokens)}</b></span>
          <span>平均 <b>{formatCompactCount(averageTokens)}</b></span>
          <span>模型 <b>{stats.dominantModel ?? "—"}</b></span>
        </div>
      </section>

      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Coins size={14} />
          成本与消息
        </div>
        <div className="ui-session-process-metrics">
          <span>估算费用 <b>{formatCost(stats.estimatedCost)}</b></span>
          <span>消息数 <b>{session.messages.length}</b></span>
          <span>工具调用 <b>{session.usage?.tool_call_count ?? 0}</b></span>
          <span>总 Token <b>{formatCompactCount(stats.totalTokens)}</b></span>
        </div>
      </section>

      <section className="ui-session-process-card wide">
        <div className="ui-session-process-card-title">
          <TrendingUp size={14} />
          请求 Token 趋势
        </div>
        {trendValues.length >= 2 ? (
          <Sparkline points={trendValues} details={trendPoints} color={TERM.cyan} height={86} />
        ) : (
          <div className="ui-session-process-empty compact">暂无足够趋势点</div>
        )}
      </section>

      <section className="ui-session-process-card wide">
        <div className="ui-session-process-card-title">
          <MessageSquare size={14} />
          输入 / 输出 / 缓存趋势
        </div>
        <div className="ui-session-context-mini-charts">
          <div>
            <span>输入</span>
            <Sparkline points={inputTrend} color={TERM.green} height={44} />
          </div>
          <div>
            <span>输出</span>
            <Sparkline points={outputTrend} color={TERM.yellow} height={44} />
          </div>
          <div>
            <span>缓存</span>
            <Sparkline points={cacheTrend} color={TERM.blue} height={44} />
          </div>
        </div>
      </section>

      <section className="ui-session-process-card wide">
        <div className="ui-session-process-card-title">
          <Layers3 size={14} />
          当前 Token 分布
        </div>
        <SegmentedBar
          height={10}
          parts={[
            { value: stats.inputTokens, color: TERM.green, label: "输入" },
            { value: stats.outputTokens, color: TERM.yellow, label: "输出" },
            { value: stats.cacheReadTokens, color: TERM.blue, label: "缓存命中" },
            { value: stats.cacheCreationTokens, color: TERM.magenta, label: "缓存写入" },
          ]}
        />
        <div className="ui-session-context-legend">
          <span style={{ color: TERM.green }}>输入</span>
          <span style={{ color: TERM.yellow }}>输出</span>
          <span style={{ color: TERM.blue }}>缓存命中</span>
          <span style={{ color: TERM.magenta }}>缓存写入</span>
        </div>
      </section>
    </div>
  );
}
