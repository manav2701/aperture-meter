#!/usr/bin/env node
// Generated from dev/src by `npm run build` in dev/. Do not edit.

// src/cli.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { argv, stdin, stdout } from "node:process";

// src/money.ts
var usd = (dollars) => BigInt(Math.round(dollars * 1e6));
function formatMoney(amount) {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const cents = (value + 5000n) / 10000n;
  if (cents === 0n && value > 0n) {
    const fraction = value.toString().padStart(6, "0").replace(/0+$/, "");
    return `${negative ? "-" : ""}$0.${fraction.slice(0, 4)}`;
  }
  const whole2 = (cents / 100n).toLocaleString("en-US");
  return `${negative ? "-" : ""}$${whole2}.${(cents % 100n).toString().padStart(2, "0")}`;
}

// src/pricing.ts
var price = (input, output) => ({
  input: usd(input),
  output: usd(output),
  cacheRead: usd(input * 0.1),
  cacheWrite: usd(input * 1.25)
});
var LIST = [
  { match: /opus-4-[5-9]|opus-[5-9]/, price: price(5, 25) },
  { match: /opus/, price: price(15, 75) },
  { match: /sonnet-[5-9]|sonnet-4-[6-9]/, price: price(3, 15) },
  { match: /sonnet/, price: price(3, 15) },
  { match: /haiku-4|haiku-[5-9]/, price: price(1, 5) },
  { match: /haiku/, price: price(0.8, 4) }
];
function priceFor(model, overrides = {}) {
  const name = model.toLowerCase();
  const own = Object.entries(overrides).find(([fragment]) => name.includes(fragment.toLowerCase()));
  if (own !== void 0) {
    const [, p] = own;
    return {
      input: usd(p.input),
      output: usd(p.output),
      cacheRead: usd(p.cacheRead ?? p.input * 0.1),
      cacheWrite: usd(p.cacheWrite ?? p.input * 1.25)
    };
  }
  return LIST.find((entry) => entry.match.test(name))?.price ?? null;
}
function costOf(tokens, p) {
  const part = (count2, perMillion) => BigInt(count2) * perMillion / 1000000n;
  return part(tokens.input, p.input) + part(tokens.output, p.output) + part(tokens.cacheRead, p.cacheRead) + part(tokens.cacheWrite, p.cacheWrite);
}

// src/report.ts
function priceRecords(records, overrides = {}) {
  return records.map((record) => {
    const p = priceFor(record.model, overrides);
    return p === null ? { ...record, cost: 0n, priced: false } : { ...record, cost: costOf(record, p), priced: true };
  });
}
var sum = (values) => values.reduce((total, value) => total + value, 0n);
var inputSide = (record) => record.input + record.cacheWrite + record.cacheRead;
var percent = (part, whole2) => whole2 === 0 ? null : Math.round(part * 100 / whole2);
function cacheHitPercent(records) {
  return percent(
    records.reduce((total, record) => total + record.cacheRead, 0),
    records.reduce((total, record) => total + inputSide(record), 0)
  );
}
var TARGET_HIT_PERCENT = 90;
function cachingSavings(records, overrides = {}) {
  let actual = 0n;
  let withTarget = 0n;
  for (const record of records) {
    const p = priceFor(record.model, overrides);
    if (p === null) continue;
    const total = inputSide(record);
    const reads = Math.floor(total * TARGET_HIT_PERCENT / 100);
    const now = costOf(
      { input: record.input, output: 0, cacheRead: record.cacheRead, cacheWrite: record.cacheWrite },
      p
    );
    const better = costOf({ input: total - reads, output: 0, cacheRead: reads, cacheWrite: 0 }, p);
    actual += now;
    withTarget += better < now ? better : now;
  }
  return withTarget >= actual ? null : { actual, withTarget, saved: actual - withTarget };
}
function summarize(records) {
  const byModel = /* @__PURE__ */ new Map();
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
    models: [...byModel.entries()].map(([model, value]) => ({ model, ...value })).sort((a, b) => b.cost > a.cost ? 1 : b.cost < a.cost ? -1 : 0)
  };
}
var DAY = 864e5;
function wasteReport(records, now, options = {}) {
  const days = options.days ?? 7;
  const inWindow = records.filter((record) => record.at > now - days * DAY && record.at <= now);
  const summary = summarize(inWindow);
  const inputTokens = summary.tokens.input + summary.tokens.cacheRead + summary.tokens.cacheWrite;
  const savings = cachingSavings(inWindow, options.overrides);
  const hit = summary.cacheHit;
  let headline;
  if (inputTokens < 1e5) headline = "Not enough use in this period yet for a useful report.";
  else if (hit !== null && hit >= TARGET_HIT_PERCENT)
    headline = `${String(hit)}% of your input came from the cache. That is already very good.`;
  else if (savings !== null && savings.saved >= 1000000n)
    headline = `${String(hit ?? 0)}% cache hits over ${String(days)} days. At ${String(TARGET_HIT_PERCENT)}% you would have spent ${formatMoney(savings.withTarget)} on input instead of ${formatMoney(savings.actual)}.`;
  else headline = `${String(hit ?? 0)}% of your input came from the cache over ${String(days)} days.`;
  return {
    ...summary,
    days,
    perDay: summary.total / BigInt(days),
    outputToInput: inputTokens === 0 ? null : Math.round(summary.tokens.output / inputTokens * 1e3) / 1e3,
    top: [...inWindow].sort((a, b) => b.cost > a.cost ? 1 : b.cost < a.cost ? -1 : 0).slice(0, 5),
    savings,
    headline
  };
}
var short = (model) => model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
var count = (value) => value.toLocaleString("en-US");
var when = (at) => new Date(at).toISOString().slice(0, 16).replace("T", " ");
function renderReport(report) {
  const lines = [
    `Claude Code, last ${String(report.days)} days (what this would cost at API prices)`,
    "",
    report.headline,
    "",
    `Total:        ${formatMoney(report.total)}   (${formatMoney(report.perDay)} a day)`,
    `Turns:        ${count(report.turns)}`,
    `Cache hits:   ${report.cacheHit === null ? "n/a" : `${String(report.cacheHit)}%`} of input tokens`,
    `Answers:      ${report.outputToInput === null ? "n/a" : `${String(report.outputToInput)} output tokens per input token`}`
  ];
  if (report.models.length > 0) {
    lines.push("", "By model:");
    for (const model of report.models.slice(0, 5))
      lines.push(
        `  ${short(model.model).padEnd(28)} ${formatMoney(model.cost).padStart(10)}  ${count(model.turns)} turns`
      );
  }
  if (report.top.length > 0) {
    lines.push("", "Most expensive turns:");
    for (const turn of report.top)
      lines.push(
        `  ${when(turn.at)}  ${short(turn.model).padEnd(22)} ${formatMoney(turn.cost).padStart(9)}  in ${count(turn.input + turn.cacheWrite)} + cached ${count(turn.cacheRead)}, out ${count(turn.output)}`
      );
  }
  if (report.unpricedTokens > 0)
    lines.push(
      "",
      `${count(report.unpricedTokens)} tokens are on models with no known price and are not counted. Add prices in prices.json (see the README).`
    );
  lines.push(
    "",
    "Everything above was worked out on this machine from your local session files. Nothing was sent anywhere."
  );
  return lines.join("\n");
}
function renderSession(summary, sessionId) {
  const lines = [
    `This session (${sessionId.slice(0, 8)}): about ${formatMoney(summary.total)} at API prices`,
    `${count(summary.turns)} turns \xB7 cache hits ${summary.cacheHit === null ? "n/a" : `${String(summary.cacheHit)}%`} \xB7 in ${count(summary.tokens.input + summary.tokens.cacheWrite)}, cached ${count(summary.tokens.cacheRead)}, out ${count(summary.tokens.output)}`
  ];
  for (const model of summary.models.slice(0, 3)) lines.push(`  ${short(model.model)}: ${formatMoney(model.cost)}`);
  if (summary.unpricedTokens > 0)
    lines.push(`${count(summary.unpricedTokens)} tokens on unpriced models are not counted.`);
  lines.push("A subscription is not billed this way; read this as what the same use would cost through the API.");
  return lines.join("\n");
}
function renderStatusline(summary) {
  const hit = summary.cacheHit === null ? "" : ` \xB7 ${String(summary.cacheHit)}% cached`;
  return `${formatMoney(summary.total)} this session${hit}`;
}

// src/store.ts
import { mkdirSync, readFileSync as readFileSync2, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// src/transcripts.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
var whole = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
function parseTranscript(text2, fallbackSession = "unknown") {
  const latest = /* @__PURE__ */ new Map();
  for (const line of text2.split("\n")) {
    if (!line.includes('"usage"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const row = entry;
    const message = row.message;
    if (row.type !== "assistant" || message?.usage === void 0) continue;
    const model = typeof message.model === "string" ? message.model : "";
    if (model === "" || model.startsWith("<")) continue;
    const at = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : Number.NaN;
    if (!Number.isFinite(at)) continue;
    const messageId = typeof message.id === "string" ? message.id : `${String(at)}:${model}`;
    const requestId = typeof row.requestId === "string" ? row.requestId : "";
    latest.set(`${messageId}:${requestId}`, {
      sessionId: typeof row.sessionId === "string" ? row.sessionId : fallbackSession,
      messageId,
      at,
      model,
      input: whole(message.usage.input_tokens),
      output: whole(message.usage.output_tokens),
      cacheRead: whole(message.usage.cache_read_input_tokens),
      cacheWrite: whole(message.usage.cache_creation_input_tokens)
    });
  }
  return [...latest.values()];
}
function findTranscripts(claudeDir2) {
  const root = join(claudeDir2, "projects");
  const out = [];
  let projects;
  try {
    projects = readdirSync(root);
  } catch {
    return out;
  }
  for (const project of projects) {
    let files;
    try {
      files = readdirSync(join(root, project));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const path = join(root, project, file);
      try {
        const info = statSync(path);
        if (info.isFile()) out.push({ path, size: info.size, mtimeMs: info.mtimeMs, session: file.slice(0, -6) });
      } catch {
      }
    }
  }
  return out;
}
function readTranscript(file) {
  return parseTranscript(readFileSync(file.path, "utf8"), file.session);
}

// src/store.ts
function claudeDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR ?? join2(homedir(), ".claude");
}
function stateDir(env = process.env, platform = process.platform) {
  if (env.APERTURE_METER_DIR !== void 0) return env.APERTURE_METER_DIR;
  if (platform === "win32") return join2(env.APPDATA ?? join2(homedir(), "AppData", "Roaming"), "aperture-meter");
  return join2(env.XDG_CONFIG_HOME ?? join2(homedir(), ".config"), "aperture-meter");
}
function loadCache(path) {
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    if (parsed.version === 1 && parsed.files !== void 0) return parsed;
  } catch {
  }
  return { version: 1, files: {} };
}
function loadRecords(claude, state) {
  const cachePath = join2(state, "cache.json");
  const cache = loadCache(cachePath);
  const files = findTranscripts(claude);
  const next = { version: 1, files: {} };
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
    }
  }
  if (changed) {
    try {
      mkdirSync(state, { recursive: true });
      const temp = `${cachePath}.${String(process.pid)}.tmp`;
      writeFileSync(temp, JSON.stringify(next));
      renameSync(temp, cachePath);
    } catch {
    }
  }
  return Object.values(next.files).flatMap((entry) => entry.records);
}
function loadOverrides(state) {
  try {
    const parsed = JSON.parse(readFileSync2(join2(state, "prices.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    const out = {};
    for (const [fragment, value] of Object.entries(parsed)) {
      const v = value;
      if (typeof v.input === "number" && typeof v.output === "number" && v.input >= 0 && v.output >= 0)
        out[fragment] = {
          input: v.input,
          output: v.output,
          ...typeof v.cacheRead === "number" ? { cacheRead: v.cacheRead } : {},
          ...typeof v.cacheWrite === "number" ? { cacheWrite: v.cacheWrite } : {}
        };
    }
    return out;
  } catch {
    return {};
  }
}

// src/run.ts
var HELP = `aperture-meter: what Claude Code is costing you, and where it is wasted. Free, local, no account.

  cost [--session <id>]   what this session has cost (default: the one in use now)
  report [--days <n>]     the last n days (default 7): cache hits, run rate, costliest turns
  statusline              one line for Claude Code's status bar (reads its JSON from stdin)
  connect                 how to send this data to an Aperture workspace (optional)

It reads token counts from Claude Code's local session files and never reads message text,
credentials, or the network.`;
var CONNECT = `This tool never sends anything anywhere. If your company runs Aperture and you want your
usage to appear in its Seats and Inventory pages, that is a separate, optional step:

  1. In your Aperture workspace open "My AI tools", then "Connect Claude Code".
  2. Follow the steps shown there. They show exactly what will change before anything is changed.

If you do not use Aperture at work, there is nothing to do here: the meter is complete on its own.`;
var flag = (args, name) => {
  const at = args.indexOf(name);
  return at < 0 ? void 0 : args[at + 1];
};
function run(args, options = {}) {
  const [command = "help", ...rest] = args;
  if (command === "help" || command === "--help" || command === "-h") return HELP;
  if (command === "connect") return CONNECT;
  const claude = options.claude ?? claudeDir();
  const state = options.state ?? stateDir();
  const now = options.now ?? Date.now();
  const overrides = loadOverrides(state);
  const priced = priceRecords(loadRecords(claude, state), overrides);
  if (command === "report") {
    const days = Number(flag(rest, "--days") ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 365) return "Use --days with a whole number from 1 to 365.";
    if (priced.length === 0) return "No Claude Code sessions were found on this machine yet.";
    return renderReport(wasteReport(priced, now, { days, overrides }));
  }
  if (command === "cost" || command === "statusline") {
    let sessionId = flag(rest, "--session");
    if (command === "statusline" && options.stdin !== void 0) {
      try {
        const given = JSON.parse(options.stdin).session_id;
        if (typeof given === "string") sessionId = given;
      } catch {
      }
    }
    if (priced.length === 0)
      return command === "statusline" ? "" : "No Claude Code sessions were found on this machine yet.";
    const latest = [...priced].sort((a, b) => b.at - a.at)[0];
    const id = sessionId ?? latest?.sessionId ?? "";
    const summary = summarize(priced.filter((record) => record.sessionId === id));
    if (summary.turns === 0) return command === "statusline" ? "" : `No usage recorded for session ${id}.`;
    return command === "statusline" ? renderStatusline(summary) : renderSession(summary, id);
  }
  return `Unknown command "${command}".

${HELP}`;
}

// src/cli.ts
var piped = !stdin.isTTY && argv[2] === "statusline" ? readFileSync3(0, "utf8") : void 0;
var text = run(argv.slice(2), piped === void 0 ? {} : { stdin: piped });
stdout.write(text === "" ? "" : `${text}
`);
