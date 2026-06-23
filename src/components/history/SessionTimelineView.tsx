import { AlertCircle, Bot, Code2, FileCode2, Search, Terminal, User, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import type { SessionEvent, SessionEventKind, SessionProcessModel } from "./sessionEvents";

type TimelineFilter = "all" | "error" | "file" | "tool";

interface SessionTimelineViewProps {
  model: SessionProcessModel;
  onJumpToMessage: (messageIndex: number) => void;
}

const FILTERS: Array<{ id: TimelineFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "error", label: "错误" },
  { id: "file", label: "文件改动" },
  { id: "tool", label: "工具调用" },
];

function eventIcon(kind: SessionEventKind) {
  if (kind === "user") return <User size={13} />;
  if (kind === "assistant") return <Bot size={13} />;
  if (kind === "file") return <FileCode2 size={13} />;
  if (kind === "test") return <Terminal size={13} />;
  if (kind === "error") return <AlertCircle size={13} />;
  if (kind === "context") return <Search size={13} />;
  if (kind === "subtask") return <Code2 size={13} />;
  return <Wrench size={13} />;
}

function eventFilterMatch(event: SessionEvent, filter: TimelineFilter): boolean {
  if (filter === "all") return true;
  if (filter === "tool") return event.kind === "tool" || Boolean(event.toolName);
  return event.kind === filter;
}

export function SessionTimelineView({ model, onJumpToMessage }: SessionTimelineViewProps) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const visibleEvents = useMemo(
    () => model.events.filter((event) => eventFilterMatch(event, filter)),
    [filter, model.events]
  );

  return (
    <div className="ui-session-process-view">
      <div className="ui-session-process-toolbar">
        <div className="ui-session-process-summary">
          <span>{model.events.length} 个事件</span>
          <span>{model.diffBlocks.length} 个文件变更</span>
          <span>{model.errorEvents.length} 个错误线索</span>
        </div>
        <div className="ui-session-process-filters" aria-label="时间线筛选">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" data-active={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="ui-session-process-empty">当前筛选下没有事件</div>
      ) : (
        <ol className="ui-session-timeline-list">
          {visibleEvents.map((event) => (
            <li key={event.id} className="ui-session-timeline-item" data-kind={event.kind}>
              <div className="ui-session-timeline-icon">{eventIcon(event.kind)}</div>
              <div className="min-w-0 flex-1">
                <div className="ui-session-timeline-title-row">
                  <span className="ui-session-timeline-title">{event.title}</span>
                  <span className="ui-session-timeline-meta">
                    {event.timestamp ?? (event.messageIndex !== null ? `#${event.messageIndex + 1}` : "-")}
                  </span>
                </div>
                <p className="ui-session-timeline-detail">{event.detail}</p>
                {event.filePath && <div className="ui-session-process-path">{event.filePath}</div>}
              </div>
              {event.messageIndex !== null && (
                <button type="button" className="ui-session-process-jump" onClick={() => onJumpToMessage(event.messageIndex!)}>
                  跳转
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
