#!/usr/bin/env node
/**
 * Run by Claude Code's hooks, in the sessions the terminal helper starts (see `terminal-server.mjs`, which loads them with
 * `claude --settings`); nowhere else.
 *
 *   prompt   as a prompt is sent: asks the helper what is selected in the prototype, and prints it, which Claude Code adds
 *            to the prompt as context. Prints nothing when nothing is selected, or was already told.
 *   stop     as Claude finishes answering: tells the helper, which stops the outline pulsing.
 *
 * Quiet and quick whatever happens: a hook that fails or hangs would hold up the prompt.
 */
const kind = process.argv[2];
const { STUDIO_SLUG: slug, STUDIO_HOOK_TOKEN: token, STUDIO_HELPER: helper } = process.env;

// The event Claude Code sends on stdin isn't needed; reading it keeps the pipe from being closed on it.
process.stdin.on("data", () => {});
process.stdin.on("error", () => {});

if (slug && token && helper && (kind === "prompt" || kind === "stop")) {
  try {
    const response = await fetch(`http://${helper}/hook/${kind}?slug=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "x-studio-hook": token },
      signal: AbortSignal.timeout(2000),
    });
    if (kind === "prompt" && response.ok) process.stdout.write(await response.text());
  } catch {}
}
process.exit(0);
