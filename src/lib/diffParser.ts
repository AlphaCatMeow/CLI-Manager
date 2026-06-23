import type { HistoryMessage } from "./types";

export interface ParsedDiffBlock {
  id: string;
  filePath: string;
  patch: string;
  messageIndex: number;
  timestamp: string | null;
}

export interface DiffMessageInput {
  content: string;
  timestamp: string | null;
  messageIndex: number;
}

export function isDiffCandidate(content: string): boolean {
  return (
    content.includes("diff --git") ||
    content.includes("*** Begin Patch") ||
    content.includes("@@") ||
    content.includes("+++")
  );
}

function extractFilePath(diffText: string): string {
  const applyPatchHeader = diffText.match(/^\*\*\* (?:Update|Add|Delete) File:\s+([^\r\n]+)/m);
  if (applyPatchHeader) return applyPatchHeader[1].trim();

  const gitHeader = diffText.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (gitHeader) return gitHeader[2];

  const plusHeader = diffText.match(/^\+\+\+\s+(?:b\/)?([^\r\n]+)/m);
  if (plusHeader) return plusHeader[1];

  return "unknown-file";
}

function splitApplyPatchBlocks(content: string): string[] {
  const segments: string[] = [];
  const byEnvelope = content.match(/\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/g);
  if (!byEnvelope) return segments;

  for (const patch of byEnvelope) {
    const fileParts = patch
      .split(/(?=^\*\*\* (?:Update|Add|Delete) File:\s+)/m)
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && /^\*\*\* (?:Update|Add|Delete) File:\s+/m.test(item));
    if (fileParts.length > 0) {
      segments.push(...fileParts);
    } else {
      segments.push(patch.trim());
    }
  }
  return segments;
}

function splitDiffBlocks(content: string): string[] {
  const chunks: string[] = [];
  const fenced = /```(?:diff|patch)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let rawContent = "";

  while ((match = fenced.exec(content)) !== null) {
    rawContent += content.slice(cursor, match.index);
    cursor = fenced.lastIndex;
    const body = match[1]?.trim();
    if (body) chunks.push(body);
  }
  rawContent += content.slice(cursor);

  if (rawContent.includes("*** Begin Patch")) {
    chunks.push(...splitApplyPatchBlocks(rawContent));
  }

  if (rawContent.includes("diff --git")) {
    chunks.push(rawContent);
  } else if (rawContent.includes("@@") && rawContent.includes("+++")) {
    chunks.push(rawContent);
  }

  const blocks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.includes("diff --git")) {
      const parts = chunk
        .split(/(?=^diff --git )/m)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      blocks.push(...parts);
      continue;
    }
    blocks.push(chunk.trim());
  }

  return blocks.filter((item) => {
    const isUnified = item.includes("@@") && (item.includes("+++ ") || item.includes("diff --git"));
    const isApplyPatch = /^\*\*\* (?:Update|Add|Delete) File:\s+/m.test(item);
    return isUnified || isApplyPatch;
  });
}

export function parseDiffBlocks(messages: DiffMessageInput[]): ParsedDiffBlock[] {
  const result: ParsedDiffBlock[] = [];
  messages.forEach((msg) => {
    const content = msg.content?.trim();
    if (!content) return;
    const blocks = splitDiffBlocks(content);
    blocks.forEach((patch, seq) => {
      result.push({
        id: `${msg.messageIndex}-${seq}`,
        filePath: extractFilePath(patch),
        patch,
        messageIndex: msg.messageIndex,
        timestamp: msg.timestamp ?? null,
      });
    });
  });
  return result;
}

export function parseDiffBlocksFromMessages(messages: HistoryMessage[]): ParsedDiffBlock[] {
  return parseDiffBlocks(
    messages.flatMap((message, index) =>
      isDiffCandidate(message.content)
        ? [{ content: message.content, timestamp: message.timestamp ?? null, messageIndex: index }]
        : []
    )
  );
}
