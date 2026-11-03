import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Claude Code keeps a transcript of every session on the machine (~/.claude/projects/<project>/
 * <session>.jsonl). Each assistant reply carries the model and its token usage. This reads ONLY
 * those numbers, the time and the session id. The text of messages, tool inputs and file paths
 * are never copied out of the line, kept, or printed. Nothing here touches credentials: the
 * only directory read is `projects`.
 */

export interface UsageRecord {
  sessionId: string;
  /** The reply's id; one reply can be written to the file several times while it streams. */
  messageId: string;
  at: number;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/** Usage records from the text of one transcript file. Unreadable or unrelated lines are skipped. */
export function parseTranscript(text: string, fallbackSession = 'unknown'): UsageRecord[] {
  const latest = new Map<string, UsageRecord>();
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const row = entry as {
      type?: unknown;
      timestamp?: unknown;
      sessionId?: unknown;
      requestId?: unknown;
      message?: { id?: unknown; model?: unknown; usage?: Record<string, unknown> };
    };
    const message = row.message;
    if (row.type !== 'assistant' || message?.usage === undefined) continue;
    const model = typeof message.model === 'string' ? message.model : '';
    // Placeholder replies Claude Code writes itself were never sent to a model.
    if (model === '' || model.startsWith('<')) continue;
    const at = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : Number.NaN;
    if (!Number.isFinite(at)) continue;
    const messageId = typeof message.id === 'string' ? message.id : `${String(at)}:${model}`;
    const requestId = typeof row.requestId === 'string' ? row.requestId : '';
    // A reply is written more than once as it streams; the last write has the final counts.
    latest.set(`${messageId}:${requestId}`, {
      sessionId: typeof row.sessionId === 'string' ? row.sessionId : fallbackSession,
      messageId,
      at,
      model,
      input: whole(message.usage.input_tokens),
      output: whole(message.usage.output_tokens),
      cacheRead: whole(message.usage.cache_read_input_tokens),
      cacheWrite: whole(message.usage.cache_creation_input_tokens),
    });
  }
  return [...latest.values()];
}

export interface TranscriptFile {
  path: string;
  size: number;
  mtimeMs: number;
  session: string;
}

/** Every session transcript under `<claudeDir>/projects`, without following links. */
export function findTranscripts(claudeDir: string): TranscriptFile[] {
  const root = join(claudeDir, 'projects');
  const out: TranscriptFile[] = [];
  let projects: string[];
  try {
    projects = readdirSync(root);
  } catch {
    return out;
  }
  for (const project of projects) {
    let files: string[];
    try {
      files = readdirSync(join(root, project));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const path = join(root, project, file);
      try {
        const info = statSync(path);
        if (info.isFile()) out.push({ path, size: info.size, mtimeMs: info.mtimeMs, session: file.slice(0, -6) });
      } catch {
        // A file that vanished while we looked.
      }
    }
  }
  return out;
}

export function readTranscript(file: TranscriptFile): UsageRecord[] {
  return parseTranscript(readFileSync(file.path, 'utf8'), file.session);
}
