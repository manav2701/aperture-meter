import { formatMoney, type Micros } from './money';
import { costOf, priceFor, type PriceOverrides } from './pricing';
import type { UsageRecord } from './transcripts';

export interface PricedRecord extends UsageRecord {
  /** What these tokens would cost at API list prices. Zero when the model has no price. */
  cost: Micros;
  priced: boolean;
}

export function priceRecords(records: readonly UsageRecord[], overrides: PriceOverrides = {}): PricedRecord[] {
  return records.map((record) => {
    const p = priceFor(record.model, overrides);
    return p === null ? { ...record, cost: 0n, priced: false } : { ...record, cost: costOf(record, p), priced: true };
  });
}

const sum = (values: readonly Micros[]): Micros => values.reduce((total, value) => total + value, 0n);
/** Everything sent to the model as input: fresh, written to the cache, or read back from it. */
const inputSide = (record: UsageRecord) => record.input + record.cacheWrite + record.cacheRead;
const percent = (part: number, whole: number): number | null => (whole === 0 ? null : Math.round((part * 100) / whole));

/** The share of input tokens that came from the cache, as a whole percent. */
export function cacheHitPercent(records: readonly UsageRecord[]): number | null {
  return percent(
    records.reduce((total, record) => total + record.cacheRead, 0),
    records.reduce((total, record) => total + inputSide(record), 0),
  );
}

export const TARGET_HIT_PERCENT = 90;

/**
 * What the input side would have cost if `TARGET_HIT_PERCENT` of it had been read from the cache
 * and the rest paid at the ordinary input price. Null when it would not be cheaper.
 */
export function cachingSavings(
  records: readonly PricedRecord[],
  overrides: PriceOverrides = {},
): { actual: Micros; withTarget: Micros; saved: Micros } | null {
  let actual = 0n;
  let withTarget = 0n;
  for (const record of records) {
    const p = priceFor(record.model, overrides);
    if (p === null) continue;
    const total = inputSide(record);
    const reads = Math.floor((total * TARGET_HIT_PERCENT) / 100);
    const now = costOf(
      { input: record.input, output: 0, cacheRead: record.cacheRead, cacheWrite: record.cacheWrite },
      p,
    );
    const better = costOf({ input: total - reads, output: 0, cacheRead: reads, cacheWrite: 0 }, p);
    actual += now;
    // A turn that already did better than the target stays as it was.
    withTarget += better < now ? better : now;
  }
  return withTarget >= actual ? null : { actual, withTarget, saved: actual - withTarget };
}

export interface Summary {
  turns: number;
  total: Micros;
  unpricedTokens: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  cacheHit: number | null;
  models: { model: string; cost: Micros; turns: number }[];
}

export function summarize(records: readonly PricedRecord[]): Summary {
  const byModel = new Map<string, { cost: Micros; turns: number }>();
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let unpricedTokens = 0;
  for (const record of records) {
    tokens.input += record.input;
    tokens.output += record.output;
    tokens.cacheRead += record.cacheRead;
    tokens.cacheWrite += record.cacheWrite;
    if (!record.priced) unpricedTokens += inputSide(record) + record.output;
    const entry = byModel.get(record.model) ?? { cost: 0n, turns: 0 };
    byModel.set(record.model, { cost: entry.cost + record.cost, turns: entry.turns + 1 });
  }
  return {
    turns: records.length,
    total: sum(records.map((record) => record.cost)),
    unpricedTokens,
    tokens,
    cacheHit: cacheHitPercent(records),
    models: [...byModel.entries()]
      .map(([model, value]) => ({ model, ...value }))
      .sort((a, b) => (b.cost > a.cost ? 1 : b.cost < a.cost ? -1 : 0)),
  };
}

const DAY = 86_400_000;

export interface WasteReport extends Summary {
  days: number;
  perDay: Micros;
  /** Output tokens per input-side token: very low means long prompts for short answers. */
  outputToInput: number | null;
  top: PricedRecord[];
  savings: { actual: Micros; withTarget: Micros; saved: Micros } | null;
  headline: string;
}

/** The last `days` days of use, and where it was wasted. */
export function wasteReport(
  records: readonly PricedRecord[],
  now: number,
  options: { days?: number; overrides?: PriceOverrides } = {},
): WasteReport {
  const days = options.days ?? 7;
  const inWindow = records.filter((record) => record.at > now - days * DAY && record.at <= now);
  const summary = summarize(inWindow);
  const inputTokens = summary.tokens.input + summary.tokens.cacheRead + summary.tokens.cacheWrite;
  const savings = cachingSavings(inWindow, options.overrides);
  const hit = summary.cacheHit;
  let headline: string;
  if (inputTokens < 100_000) headline = 'Not enough use in this period yet for a useful report.';
  else if (hit !== null && hit >= TARGET_HIT_PERCENT)
    headline = `${String(hit)}% of your input came from the cache. That is already very good.`;
  else if (savings !== null && savings.saved >= 1_000_000n)
    headline = `${String(hit ?? 0)}% cache hits over ${String(days)} days. At ${String(TARGET_HIT_PERCENT)}% you would have spent ${formatMoney(savings.withTarget)} on input instead of ${formatMoney(savings.actual)}.`;
  else headline = `${String(hit ?? 0)}% of your input came from the cache over ${String(days)} days.`;
  return {
    ...summary,
    days,
    perDay: summary.total / BigInt(days),
    outputToInput: inputTokens === 0 ? null : Math.round((summary.tokens.output / inputTokens) * 1000) / 1000,
    top: [...inWindow].sort((a, b) => (b.cost > a.cost ? 1 : b.cost < a.cost ? -1 : 0)).slice(0, 5),
    savings,
    headline,
  };
}

const short = (model: string) => model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
const count = (value: number) => value.toLocaleString('en-US');
const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ');

export function renderReport(report: WasteReport): string {
  const lines = [
    `Claude Code, last ${String(report.days)} days (what this would cost at API prices)`,
    '',
    report.headline,
    '',
    `Total:        ${formatMoney(report.total)}   (${formatMoney(report.perDay)} a day)`,
    `Turns:        ${count(report.turns)}`,
    `Cache hits:   ${report.cacheHit === null ? 'n/a' : `${String(report.cacheHit)}%`} of input tokens`,
    `Answers:      ${report.outputToInput === null ? 'n/a' : `${String(report.outputToInput)} output tokens per input token`}`,
  ];
  if (report.models.length > 0) {
    lines.push('', 'By model:');
    for (const model of report.models.slice(0, 5))
      lines.push(
        `  ${short(model.model).padEnd(28)} ${formatMoney(model.cost).padStart(10)}  ${count(model.turns)} turns`,
      );
  }
  if (report.top.length > 0) {
    lines.push('', 'Most expensive turns:');
    for (const turn of report.top)
      lines.push(
        `  ${when(turn.at)}  ${short(turn.model).padEnd(22)} ${formatMoney(turn.cost).padStart(9)}  in ${count(turn.input + turn.cacheWrite)} + cached ${count(turn.cacheRead)}, out ${count(turn.output)}`,
      );
  }
  if (report.unpricedTokens > 0)
    lines.push(
      '',
      `${count(report.unpricedTokens)} tokens are on models with no known price and are not counted. Add prices in prices.json (see the README).`,
    );
  lines.push(
    '',
    'Everything above was worked out on this machine from your local session files. Nothing was sent anywhere.',
  );
  return lines.join('\n');
}

export function renderSession(summary: Summary, sessionId: string): string {
  const lines = [
    `This session (${sessionId.slice(0, 8)}): about ${formatMoney(summary.total)} at API prices`,
    `${count(summary.turns)} turns · cache hits ${summary.cacheHit === null ? 'n/a' : `${String(summary.cacheHit)}%`} · ` +
      `in ${count(summary.tokens.input + summary.tokens.cacheWrite)}, cached ${count(summary.tokens.cacheRead)}, out ${count(summary.tokens.output)}`,
  ];
  for (const model of summary.models.slice(0, 3)) lines.push(`  ${short(model.model)}: ${formatMoney(model.cost)}`);
  if (summary.unpricedTokens > 0)
    lines.push(`${count(summary.unpricedTokens)} tokens on unpriced models are not counted.`);
  lines.push('A subscription is not billed this way; read this as what the same use would cost through the API.');
  return lines.join('\n');
}

/** One short line for Claude Code's status bar. */
export function renderStatusline(summary: Summary): string {
  const hit = summary.cacheHit === null ? '' : ` · ${String(summary.cacheHit)}% cached`;
  return `${formatMoney(summary.total)} this session${hit}`;
}
