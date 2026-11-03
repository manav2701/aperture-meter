---
description: Where Claude Code money is being wasted this week (cache hits, run rate, costliest turns)
argument-hint: '[days]'
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/meter.mjs" report --days *)
---

Here is the waste report for the last $ARGUMENTS days (7 if none were given), worked out on this machine:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/meter.mjs" report --days ${ARGUMENTS:-7}`

Show the report to the user as printed. Then, in two or three plain sentences, say what the biggest lever looks like (for example a low cache hit rate means long conversations are being re-read at full price, and starting a fresh session less often, or keeping the start of the conversation stable, raises it). Do not invent numbers that are not in the report.

If no report appears above, this surface cannot run local commands. Say so plainly and stop: the meter reads session files on a computer, so it works in Claude Code and in Cowork, not in a web or mobile chat. Never guess the numbers.
