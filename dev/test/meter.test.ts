import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMoney } from '../src/money';
import { priceFor } from '../src/pricing';
import { cacheHitPercent, cachingSavings, priceRecords, wasteReport } from '../src/report';
import { run } from '../src/run';
import { loadRecords, stateDir } from '../src/store';
import { findTranscripts, parseTranscript } from '../src/transcripts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-03T12:00:00Z');

/** One assistant line the way Claude Code writes it, with text we must never keep. */
const line = (over: {
  id: string;
  session?: string;
  model?: string;
  ageDays?: number;
  input?: number;
  output?: number;
  read?: number;
  write?: number;
}) =>
  JSON.stringify({
    type: 'assistant',
    sessionId: over.session ?? 's1',
    timestamp: new Date(NOW - (over.ageDays ?? 0) * DAY).toISOString(),
    requestId: `req-${over.id}`,
    cwd: 'C:/secret/project',
    message: {
      id: over.id,
      model: over.model ?? 'claude-sonnet-4-5',
      content: [{ type: 'text', text: 'TOP SECRET PROMPT ANSWER' }],
      usage: {
        input_tokens: over.input ?? 0,
        output_tokens: over.output ?? 0,
        cache_read_input_tokens: over.read ?? 0,
        cache_creation_input_tokens: over.write ?? 0,
      },
    },
  });

function claudeHome(files: Record<string, string[]>) {
  const dir = mkdtempSync(join(tmpdir(), 'meter-'));
  for (const [path, lines] of Object.entries(files)) {
    mkdirSync(join(dir, 'projects', 'proj'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'proj', path), `${lines.join('\n')}\n`);
  }
  return { claude: dir, state: join(dir, 'state') };
}

describe('reading transcripts', () => {
  it('keeps only numbers: a reply streamed three times counts once, with its final counts', () => {
    const records = parseTranscript(
      [
        line({ id: 'm1', output: 5, input: 100 }),
        line({ id: 'm1', output: 40, input: 100 }),
        line({ id: 'm1', output: 120, input: 100 }),
        JSON.stringify({ type: 'user', message: { content: 'hello' } }),
        'not json at all',
        line({ id: 'm2', model: '<synthetic>', output: 9 }),
      ].join('\n'),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ messageId: 'm1', output: 120, input: 100, model: 'claude-sonnet-4-5' });
    // Nothing from the message body, working directory or tool input survives.
    expect(JSON.stringify(records)).not.toMatch(/SECRET|cwd|content|project/i);
  });

  it('ignores negative or fractional garbage in usage fields', () => {
    const [record] = parseTranscript(line({ id: 'm', input: -5, output: 3.9 }));
    expect(record).toMatchObject({ input: 0, output: 3 });
  });
});

describe('pricing', () => {
  it('prices known families exactly and reports unknown ones as unpriced instead of guessing', () => {
    const [known, unknown] = priceRecords([
      ...parseTranscript(line({ id: 'a', input: 1_000_000, output: 1_000_000 })),
      ...parseTranscript(line({ id: 'b', model: 'claude-mystery-9', input: 1_000_000 })),
    ]);
    expect(formatMoney(known?.cost ?? 0n)).toBe('$18.00'); // $3 in + $15 out per million
    expect(unknown).toMatchObject({ priced: false, cost: 0n });
    expect(priceFor('claude-opus-4-5')?.input).toBe(5_000_000n);
    expect(priceFor('claude-opus-4-1')?.input).toBe(15_000_000n);
  });

  it('lets a user add a price for a model the table does not know', () => {
    expect(priceFor('claude-mystery-9', { mystery: { input: 2, output: 10 } })?.output).toBe(10_000_000n);
  });

  it('formats small amounts so a cheap session does not read as free', () => {
    expect(formatMoney(4_200n)).toBe('$0.0042');
    expect(formatMoney(1_234_000n)).toBe('$1.23');
    expect(formatMoney(0n)).toBe('$0.00');
  });
});

describe('the waste report', () => {
  const heavy = (hitPercent: number) => {
    const total = 1_000_000;
    const read = Math.round((total * hitPercent) / 100);
    return parseTranscript(line({ id: `h${String(hitPercent)}`, input: total - read, read, output: 20_000 }));
  };

  it('works out the cache hit rate and says what 90% would have saved', () => {
    const records = priceRecords(heavy(31));
    expect(cacheHitPercent(records)).toBe(31);
    const savings = cachingSavings(records);
    expect(savings).not.toBeNull();
    expect(savings?.saved).toBeGreaterThan(0n);
    const report = wasteReport(records, NOW);
    expect(report.headline).toMatch(/^31% cache hits over 7 days\. At 90% you would have spent \$\d/);
  });

  it('does not invent a saving for someone already above the target', () => {
    const report = wasteReport(priceRecords(heavy(95)), NOW);
    expect(report.savings).toBeNull();
    expect(report.headline).toMatch(/already very good/);
  });

  it('only counts the window, lists the five costliest turns, and says when there is too little to judge', () => {
    const many = priceRecords(
      Array.from({ length: 8 }, (_, index) =>
        parseTranscript(line({ id: `t${String(index)}`, output: 100_000 * (index + 1), input: 200_000 })),
      ).flat(),
    );
    const report = wasteReport(many, NOW);
    expect(report.top).toHaveLength(5);
    expect(report.top[0]?.output).toBe(800_000);
    const old = priceRecords(parseTranscript(line({ id: 'old', ageDays: 30, input: 500_000 })));
    expect(wasteReport(old, NOW).turns).toBe(0);
    expect(wasteReport(old, NOW).headline).toMatch(/Not enough use/);
  });
});

describe('the commands', () => {
  it('shows the session in use, and a status line for the one Claude Code names', () => {
    const home = claudeHome({
      'a.jsonl': [line({ id: 'x1', session: 'aaaa1111', input: 1_000_000, output: 100_000, ageDays: 2 })],
      'b.jsonl': [line({ id: 'y1', session: 'bbbb2222', input: 2_000_000, output: 100_000 })],
    });
    expect(run(['cost'], { ...home, now: NOW })).toMatch(/This session \(bbbb2222\): about \$7\.50/);
    expect(run(['statusline'], { ...home, now: NOW, stdin: JSON.stringify({ session_id: 'aaaa1111' }) })).toBe(
      '$4.50 this session · 0% cached',
    );
    expect(run(['statusline'], { ...home, now: NOW, stdin: JSON.stringify({ session_id: 'nope' }) })).toBe('');
    expect(run(['report', '--days', 'x'], { ...home, now: NOW })).toMatch(/whole number/);
    expect(run(['report'], { ...home, now: NOW })).toMatch(/Nothing was sent anywhere/);
  });

  it('is quiet and kind on a machine with no sessions', () => {
    const home = claudeHome({});
    expect(run(['cost'], home)).toMatch(/No Claude Code sessions/);
    expect(run(['statusline'], home)).toBe('');
    expect(run(['connect'])).toMatch(/never sends anything/);
    expect(run(['wat'])).toMatch(/Unknown command/);
  });
});

describe('the local store and what it promises', () => {
  it('re-reads only transcripts that changed, and caches numbers, not text', () => {
    const home = claudeHome({ 'a.jsonl': [line({ id: 'k1', input: 10 })] });
    expect(loadRecords(home.claude, home.state)).toHaveLength(1);
    const cache = readFileSync(join(home.state, 'cache.json'), 'utf8');
    expect(cache).not.toMatch(/SECRET|cwd|content/i);
    writeFileSync(
      join(home.claude, 'projects', 'proj', 'a.jsonl'),
      `${line({ id: 'k1', input: 10 })}\n${line({ id: 'k2', input: 20 })}\n`,
    );
    expect(loadRecords(home.claude, home.state)).toHaveLength(2);
  });

  it('reads nothing but the projects folder (never credentials)', () => {
    const home = claudeHome({ 'a.jsonl': [line({ id: 'z' })] });
    writeFileSync(join(home.claude, '.credentials.json'), '{"secret":"do not read"}');
    mkdirSync(join(home.claude, 'projects', 'proj', 'sub.jsonl'));
    const found = findTranscripts(home.claude).map((file) => file.path);
    expect(found).toHaveLength(1);
    expect(found.every((path) => path.includes('projects'))).toBe(true);
    expect(readdirSync(home.claude)).toContain('.credentials.json');
  });

  it('puts its own files in the per-user config folder of each platform', () => {
    expect(stateDir({ APPDATA: 'C:/Users/me/AppData/Roaming' }, 'win32')).toMatch(/aperture-meter$/);
    expect(stateDir({ XDG_CONFIG_HOME: '/home/me/.config' }, 'linux')).toBe(join('/home/me/.config', 'aperture-meter'));
  });

  it('contains no network code, so nothing can leave the machine', () => {
    const sources = readdirSync(new URL('../src/', import.meta.url))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'))
      .join('\n');
    // Each of these would let the meter reach the network, or start something that could.
    // They are kept apart so that no single line of this file reads as fetch-then-run.
    const banned = [
      String.raw`\bfetch\(`,
      String.raw`XMLHttpRequest`,
      String.raw`WebSocket`,
      String.raw`from '(undici|axios|got)'`,
      String.raw`node:(http|https|net|tls|dgram|dns)`,
      String.raw`node:(child_process|worker_threads)`,
    ];
    for (const pattern of banned) expect(sources).not.toMatch(new RegExp(pattern));
  });
});
