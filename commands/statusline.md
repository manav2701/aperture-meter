---
description: Show the running session cost in Claude Code's status bar
disable-model-invocation: true
---

Help the user turn on the live cost display. Plugins cannot change Claude Code's settings by themselves, so tell them exactly what to add to `~/.claude/settings.json` (create the file if it does not exist, and keep anything already in it):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/meter.mjs\" statusline"
  }
}
```

Replace `${CLAUDE_PLUGIN_ROOT}` with the real folder of this plugin before they paste it. You can find it by running `echo "${CLAUDE_PLUGIN_ROOT}"`. Offer to make the edit for them, and only do it if they say yes. The status bar then shows something like `$4.50 this session · 62% cached`, updated as they work.
