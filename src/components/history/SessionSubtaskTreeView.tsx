import { GitBranch, Info } from "lucide-react";
import type { SessionProcessModel } from "./sessionEvents";

interface SessionSubtaskTreeViewProps {
  model: SessionProcessModel;
  onJumpToMessage: (messageIndex: number) => void;
}

export function SessionSubtaskTreeView({ model, onJumpToMessage }: SessionSubtaskTreeViewProps) {
  if (model.subtaskEvents.length === 0) {
    return (
      <div className="ui-session-process-empty">
        当前历史未解析到子任务事件。实时子 Agent 转录窗口仍由 Hook 事件打开；历史回放需要后端补 agent transcript 关联。
      </div>
    );
  }

  return (
    <div className="ui-session-process-view">
      <div className="ui-session-process-note">
        <Info size={13} />
        当前为基于历史消息识别的子任务线索；可点击定位原始消息。
      </div>
      <div className="ui-session-subtask-tree">
        <div className="ui-session-subtask-root">
          <GitBranch size={14} />
          主会话
        </div>
        {model.subtaskEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            className="ui-session-subtask-node"
            onClick={() => event.messageIndex !== null && onJumpToMessage(event.messageIndex)}
          >
            <span>{event.title}</span>
            <small>{event.detail}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
