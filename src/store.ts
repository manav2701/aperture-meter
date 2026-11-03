import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PriceOverrides } from './pricing';
import { findTranscripts, readTranscript, type UsageRecord } from './transcripts';

/*
 * A small local cache so a status line that runs every few seconds does not re-read gigabytes of
 * transcripts. It holds the same numbers the parser already extracted (token counts, model, time,
 * session id) and nothing else: no message text. It lives in this user's own config folder and is
 * only ever read and written here. This package contains no network code at all.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Where Claude Code keeps its files (honours CLAUDE_CONFIG_DIR, as Claude Code does). */
export function claudeDir(env: Env = process.env): string {
  return env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
}

/** This tool's own folder, in the place each operating system expects per-user settings. */
export function stateDir(env: Env = process.env, platform: string = process.platform): string {
  if (env.APERTURE_METER_DIR !== undefined) return env.APERTURE_METER_DIR;
  if (platform === 'win32') return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'aperture-meter');
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'aperture-meter');
}

interface CacheFile {
  version: 1;
  files: Record<string, { size: number; mtimeMs: number; records: UsageRecord[] }>;
}

function loadCache(path: string): CacheFile {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CacheFile>;
    if (parsed.version === 1 && parsed.files !== undefined) return parsed as CacheFile;
  } catch {
    // No cache yet, or an unreadable one: start again.
  }
  return { version: 1, files: {} };
}

/** Every usage record on this machine, re-reading only the transcripts that changed. */
export function loadRecords(claude: string, state: string): UsageRecord[] {
  const cachePath = join(state, 'cache.json');
  const cache = loadCache(cachePath);
  const files = findTranscripts(claude);
  const next: CacheFile = { version: 1, files: {} };
  let changed = Object.keys(cache.files).length !== files.length;
  for (const file of files) {
    const known = cache.files[file.path];
    if (known?.size === file.size && known.mtimeMs === file.mtimeMs) {
      next.files[file.path] = known;
      continue;
    }
    changed = true;
    try {
      next.files[file.path] = { size: file.size, mtimeMs: file.mtimeMs, records: readTranscript(file) };
    } catch {
      // A file being written or removed right now: skip it this time.
    }
  }
  if (changed) {
    try {
      mkdirSync(state, { recursive: true });
      const temp = `${cachePath}.${String(process.pid)}.tmp`;
      writeFileSync(temp, JSON.stringify(next));
      renameSync(temp, cachePath);
    } catch {
      // The cache is an optimisation; failing to write it must not stop the report.
    }
  }
  return Object.values(next.files).flatMap((entry) => entry.records);
}

/** The user's own prices from prices.json, if they made one. Anything malformed is ignored. */
export function loadOverrides(state: string): PriceOverrides {
  try {
    const parsed = JSON.parse(readFileSync(join(state, 'prices.json'), 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: PriceOverrides = {};
    for (const [fragment, value] of Object.entries(parsed)) {
      const v = value as { input?: unknown; output?: unknown; cacheRead?: unknown; cacheWrite?: unknown };
      if (typeof v.input === 'number' && typeof v.output === 'number' && v.input >= 0 && v.output >= 0)
        out[fragment] = {
          input: v.input,
          output: v.output,
          ...(typeof v.cacheRead === 'number' ? { cacheRead: v.cacheRead } : {}),
          ...(typeof v.cacheWrite === 'number' ? { cacheWrite: v.cacheWrite } : {}),
        };
    }
    return out;
  } catch {
    return {};
  }
}
