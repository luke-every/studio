---
name: handoffpush
description: Send the handoff made on this machine to the studio's latest pushed version, without pushing the prototype again, so engineers can open it there. Use when the user types /handoffpush, or asks to push or publish just the handoff, or to update the handoff on the latest version.
---

# /handoffpush

Engineers open the studio, not your machine. `/handoff` and the review happen locally on the Live version; this sends that handoff (its decisions and sign-off) to the studio's latest pushed version. It doesn't push the prototype's code: use /push for that.

## Run it

```
node ~/.claude/skills/handoffpush/handoffpush.mjs --dir /absolute/path/to/the/prototype --name "<its name in the studio>"
```

`--version v1.3` sends it to a particular pushed version instead of the latest. It needs a handoff to exist (run /handoff first, and review it in the studio) and the prototype to have been pushed at least once.

## Tell the designer

One or two lines from what it printed: which version it went to and whether it was signed off. If it says files changed since the handoff was made, or since the last push, say so plainly: the handoff may describe code the pushed version doesn't have, so they should /push too (or run /handoff again). Don't push, scan or change anything yourself.

## Never

- Never run git. Never change the prototype's code.
- If it stops, tell the designer what it said in a line and ask what they want to do.
