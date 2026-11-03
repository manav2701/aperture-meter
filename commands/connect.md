---
description: Optional: send this usage to your company's Aperture workspace
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/meter.mjs" connect)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/meter.mjs" connect`

Explain the steps above in plain words. The meter itself never sends anything; connecting is a separate, optional tool that needs a telemetry token from the user's Aperture workspace. If they do not use Aperture at work, there is nothing to do here.
