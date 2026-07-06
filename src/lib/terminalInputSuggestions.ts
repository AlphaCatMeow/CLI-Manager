import type { CommandHistoryEntry, CommandTemplate } from "./types";
import { BUILTIN_AI_COMMANDS, type BuiltinAiCommand } from "./builtinAiCommands";

export const TERMINAL_INPUT_SUGGESTION_AI_MODEL = "gpt-5.3-codex-spark";

export type TerminalInputSuggestionProvider = "local" | "ai";
export type TerminalInputSuggestionSource = "history" | "template" | "builtin" | "ai";

export interface TerminalInputSuggestion {
  id: string;
  command: string;
  suffix: string;
  source: TerminalInputSuggestionSource;
  score: number;
}

export interface TerminalInputSuggestionContext {
  input: string;
  projectId: string | null;
  cwd?: string | null;
  sessionId?: string | null;
  previousCommand?: string | null;
  history: CommandHistoryEntry[];
  templates: CommandTemplate[];
  provider: TerminalInputSuggestionProvider;
  model?: string;
}

export interface TerminalInputSuggestionOptions {
  limit?: number;
}

interface Candidate {
  id: string;
  command: string;
  source: TerminalInputSuggestionSource;
  score: number;
}

const DEFAULT_LIMIT = 1;
const MAX_COMMAND_LENGTH = 500;

const normalizeCommand = (value: string) => value.replace(/\r?\n$/u, "").trim();

export function getSafeSuggestionSuffix(input: string, command: string): string | null {
  if (!input || input.includes("\n") || input.includes("\r")) return null;
  if (!command || command.includes("\n") || command.includes("\r")) return null;
  if (command.length > MAX_COMMAND_LENGTH) return null;

  const inputLower = input.toLocaleLowerCase();
  const commandLower = command.toLocaleLowerCase();
  if (!commandLower.startsWith(inputLower) || command.length <= input.length) return null;
  return command.slice(input.length);
}

function scoreHistoryEntry(
  entry: CommandHistoryEntry,
  input: string,
  projectId: string | null,
  index: number
): Candidate | null {
  const command = normalizeCommand(entry.command);
  const suffix = getSafeSuggestionSuffix(input, command);
  if (!suffix) return null;

  const executedAt = Number(entry.executed_at);
  const agePenalty = Number.isFinite(executedAt)
    ? Math.min(20, Math.max(0, (Date.now() - executedAt) / 86_400_000))
    : 10;
  const projectBoost = projectId && entry.project_id === projectId ? 16 : entry.project_id === null ? 4 : 0;

  return {
    id: `history:${entry.id}`,
    command,
    source: "history",
    score: 100 + projectBoost - agePenalty - index * 0.2,
  };
}

function scoreTemplate(template: CommandTemplate, input: string, index: number): Candidate | null {
  const command = normalizeCommand(template.command);
  const suffix = getSafeSuggestionSuffix(input, command);
  if (!suffix) return null;

  const scopeBoost = template.session_id ? 14 : template.project_id ? 10 : 4;
  return {
    id: `template:${template.id}`,
    command,
    source: "template",
    score: 70 + scopeBoost - index * 0.1,
  };
}

function scoreBuiltinCommand(item: BuiltinAiCommand, input: string, index: number): Candidate | null {
  const command = normalizeCommand(item.command);
  const suffix = getSafeSuggestionSuffix(input, command);
  if (!suffix) return null;

  const isSlashCommand = command.startsWith("/");
  const launchBoost = item.category === "launch" ? 3 : 0;
  const toolRootBoost = command === item.tool || command.startsWith(`${item.tool} `) ? 2 : 0;
  const compactCommandBoost = Math.max(0, 4 - command.length / 80);

  return {
    id: `builtin:${item.id}`,
    command,
    source: "builtin",
    score: (isSlashCommand ? 68 : 76) + launchBoost + toolRootBoost + compactCommandBoost - index * 0.03,
  };
}

function getLocalSuggestions(
  context: TerminalInputSuggestionContext,
  options: TerminalInputSuggestionOptions
): TerminalInputSuggestion[] {
  const input = context.input;
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const candidatesByCommand = new Map<string, Candidate>();

  const push = (candidate: Candidate | null) => {
    if (!candidate) return;
    const existing = candidatesByCommand.get(candidate.command);
    if (!existing || candidate.score > existing.score) {
      candidatesByCommand.set(candidate.command, candidate);
    }
  };

  context.history.forEach((entry, index) => push(scoreHistoryEntry(entry, input, context.projectId, index)));
  context.templates.forEach((template, index) => push(scoreTemplate(template, input, index)));
  BUILTIN_AI_COMMANDS.forEach((item, index) => push(scoreBuiltinCommand(item, input, index)));

  return Array.from(candidatesByCommand.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate) => ({
      ...candidate,
      suffix: candidate.command.slice(input.length),
    }));
}

function getAiSuggestions(): TerminalInputSuggestion[] {
  return [];
}

export async function getTerminalInputSuggestions(
  context: TerminalInputSuggestionContext,
  options: TerminalInputSuggestionOptions = {}
): Promise<TerminalInputSuggestion[]> {
  if (context.provider === "ai") {
    return getAiSuggestions();
  }
  return getLocalSuggestions(context, options);
}
