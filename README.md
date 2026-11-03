# Aperture Meter

A free Claude Code plugin that shows what your usage is costing you and where it is wasted. **No account, no gateway, no key.** Everything is worked out on your machine.

```text
/aperture-meter:cost       what this session has cost so far
/aperture-meter:waste 7    the last 7 days: cache hits, run rate, costliest turns
/aperture-meter:statusline put the running cost in the status bar
/aperture-meter:connect    optional: link to a company Aperture workspace
```

A typical headline from the report:

> 31% cache hits over 7 days. At 90% you would have spent $41 on input instead of $128.

## Install

In a terminal:

```bash
claude plugin marketplace add manav2701/aperture-meter
claude plugin install aperture-meter@aperture-meter
```

Or inside Claude Code:

```text
/plugin marketplace add manav2701/aperture-meter
/plugin install aperture-meter@aperture-meter
```

Restart the session (or run `/reload-plugins`) and the commands appear. Needs Node 20 or newer, which Claude Code already requires.

### Show the cost in the status bar

Run `/aperture-meter:statusline` for the exact line to add, or put this in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<path to the plugin>/bin/meter.mjs\" statusline"
  }
}
```

## What it reads, and what it never does

- It reads **only token counts, the model name, a timestamp and the session id** from Claude Code's own session files in `~/.claude/projects`. It does not read, copy, keep or print the text of your messages, tool inputs, file paths or anything else in those files.
- It never reads your Claude login or any credential, and it never sits between you and Claude. It works the same on Pro, Max, Team and API plans, because it only looks at a log after the fact. The only folder it opens under `~/.claude` is `projects`; `~/.claude/.credentials.json` and everything else there are never opened, and a test proves it.
- Each command pre-approves one exact command, `node <plugin>/bin/meter.mjs`, and nothing else.
- It contains **no network code**. A test in this repo (`test/meter.test.ts`) fails if any is added, and you can read the whole source in `src/`.
- It keeps a small cache of those numbers in your own config folder (`%APPDATA%\aperture-meter` on Windows, `~/.config/aperture-meter` elsewhere) so the status bar stays fast. Delete the folder at any time.

## Reading the numbers

The cost is **what the same use would cost at Anthropic's API list prices**. A subscription is not billed per token, so on a plan treat it as a measure of how heavy your use is, not as a bill. Models the built-in price table does not know are counted as "unpriced" instead of guessed. To add or correct a price, create `prices.json` in the config folder, in dollars per million tokens:

```json
{ "opus-4-6": { "input": 5, "output": 25 } }
```

The key is any part of the model name. Cache reads default to a tenth of the input price and cache writes to 1.25 times it; add `cacheRead` and `cacheWrite` to override.

## Where this fits

This is the free, local half of [Aperture](https://getaperture.org), which governs AI spend for teams. If your company runs Aperture, `/aperture-meter:connect` explains how to also report usage to its workspace. That step is separate and optional; the meter is complete without it.

## Development

The plugin is the repository root: `.claude-plugin/`, `commands/` and `bin/meter.mjs`. The readable TypeScript source, its tests and the build live in `dev/`, so that installing the plugin never installs a dependency.

```bash
cd dev
npm install
npm test            # unit tests, including the "no network code" check
npm run typecheck
npm run build       # rebuilds ../bin/meter.mjs, the single file the plugin runs
node make-icon.mjs  # redraws ../.claude-plugin/icon.png from plain arithmetic
```

`bin/meter.mjs` is committed so the plugin runs with nothing but Node. It is bundled, not minified, and CI fails if it does not match `dev/src`.

## Licence

MIT. See [LICENSE](LICENSE).
