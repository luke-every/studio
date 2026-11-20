/** Who Claude's replies are from, on a live version (see `registry/claude-runs.ts`). Its own file so a page that only draws the name doesn't load the comment schemas (and zod) with it. */
export const CLAUDE_AUTHOR = { login: "claude", name: "Claude" };
