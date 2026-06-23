import { AlertTriangle, Gauge, Wrench } from "lucide-react";
import type { HistoryToolCount, HistoryToolEvent } from "../../lib/types";
import type { SessionProcessModel } from "./sessionEvents";

interface SessionToolDiagnosticsViewProps {
  model: SessionProcessModel;
  builtinCalls: HistoryToolCount[];
  mcpCalls: HistoryToolCount[];
  skillCalls: HistoryToolCount[];
  toolEvents: HistoryToolEvent[];
  onJumpToMessage: (messageIndex: number) => void;
}

function ToolCountSection({ title, items }: { title: string; items: HistoryToolCount[] }) {
  if (items.length === 0) return null;
  return (
    <section className="ui-session-process-card">
      <div className="ui-session-process-card-title">
        <Wrench size={14} />
        {title}
      </div>
      <div className="ui-session-tool-counts">
        {items.map((item) => (
          <span key={item.name} title={item.name}>
            {item.name}<b>{item.count}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

export function SessionToolDiagnosticsView({
  model,
  builtinCalls,
  mcpCalls,
  skillCalls,
  toolEvents,
  onJumpToMessage,
}: SessionToolDiagnosticsViewProps) {
  const hasCounts = builtinCalls.length > 0 || mcpCalls.length > 0 || skillCalls.length > 0;
  const hasEvents = toolEvents.length > 0 || model.toolEvents.length > 0 || model.errorEvents.length > 0;

  if (!hasCounts && !hasEvents) {
    return <div className="ui-session-process-empty">当前会话暂未解析到工具调用</div>;
  }

  return (
    <div className="ui-session-process-view">
      <div className="ui-session-process-grid">
        <ToolCountSection title="内置工具" items={builtinCalls} />
        <ToolCountSection title="MCP" items={mcpCalls} />
        <ToolCountSection title="Skill / 命令" items={skillCalls} />
        <section className="ui-session-process-card">
          <div className="ui-session-process-card-title">
            <Gauge size={14} />
            耗时数据
          </div>
          <div className="ui-session-process-empty compact">
            {toolEvents.some((event) => event.duration_ms)
              ? "已显示原始日志提供的调用耗时"
              : "当前历史未提供逐次调用耗时"}
          </div>
        </section>
      </div>

      {toolEvents.length > 0 && (
        <section className="ui-session-process-card mt-2">
          <div className="ui-session-process-card-title">
            <Wrench size={14} />
            结构化工具调用
          </div>
          <div className="ui-session-diagnostic-list">
            {toolEvents.map((event, index) => (
              <button
                key={event.call_id ?? `${event.name}-${index}`}
                type="button"
                onClick={() => event.message_index !== null && event.message_index !== undefined && onJumpToMessage(event.message_index)}
              >
                <span>
                  {event.name}
                  {event.status ? ` · ${event.status}` : ""}
                  {event.duration_ms ? ` · ${event.duration_ms}ms` : ""}
                </span>
                <small>{event.output_summary ?? event.input_summary ?? event.category}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {model.errorEvents.length > 0 && (
        <section className="ui-session-process-card mt-2">
          <div className="ui-session-process-card-title danger">
            <AlertTriangle size={14} />
            失败 / 错误线索
          </div>
          <div className="ui-session-diagnostic-list">
            {model.errorEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => event.messageIndex !== null && onJumpToMessage(event.messageIndex)}
              >
                <span>{event.title}</span>
                <small>{event.detail}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {model.toolEvents.length > 0 && (
        <section className="ui-session-process-card mt-2">
          <div className="ui-session-process-card-title">
            <Wrench size={14} />
            疑似工具事件
          </div>
          <div className="ui-session-diagnostic-list">
            {model.toolEvents.slice(0, 80).map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => event.messageIndex !== null && onJumpToMessage(event.messageIndex)}
              >
                <span>{event.toolName ?? event.title}</span>
                <small>{event.detail}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
