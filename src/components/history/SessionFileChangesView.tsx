import { FileCode2 } from "lucide-react";
import type { SessionProcessModel } from "./sessionEvents";

interface SessionFileChangesViewProps {
  model: SessionProcessModel;
  onJumpToMessage: (messageIndex: number) => void;
  onOpenDiff: () => void;
}

export function SessionFileChangesView({ model, onJumpToMessage, onOpenDiff }: SessionFileChangesViewProps) {
  if (model.fileGroups.length === 0) {
    return <div className="ui-session-process-empty">当前会话暂未解析到文件变更</div>;
  }

  return (
    <div className="ui-session-process-view">
      <div className="ui-session-process-toolbar">
        <div className="ui-session-process-summary">
          <span>{model.fileGroups.length} 个文件</span>
          <span>{model.diffBlocks.length} 个 diff 块</span>
        </div>
        <button type="button" className="ui-session-process-primary" onClick={onOpenDiff}>
          打开 Diff 视图
        </button>
      </div>

      <div className="ui-session-file-groups">
        {model.fileGroups.map((group) => (
          <section key={group.filePath} className="ui-session-process-card">
            <div className="ui-session-file-header">
              <FileCode2 size={14} />
              <span title={group.filePath}>{group.filePath}</span>
              <small>+{group.additions} / -{group.deletions}</small>
            </div>
            <div className="ui-session-file-events">
              {group.events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="ui-session-file-event"
                  onClick={() => event.messageIndex !== null && onJumpToMessage(event.messageIndex)}
                >
                  <span>{event.detail}</span>
                  <small>{event.timestamp ?? (event.messageIndex !== null ? `消息 #${event.messageIndex + 1}` : "-")}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
