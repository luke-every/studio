import type { ChangeSet, FileChange } from "@/lib/registry/change-set";

/**
 * A prototype's changes as the brief an engineer, or their agent, works from (see `registry/change-set.ts` for how they are found). Plain text, so it reads the same
 * pasted into an agent, opened in the studio or fetched by link.
 */
export type BriefContext = {
  /** The studio's address, to say where the prototype and the brief can be read. */
  origin?: string;
  canvas?: string;
  /** The prototype's source on GitHub, once it has been pushed. */
  github?: string;
};

/** Only what changed is part of the work: a fork nobody has touched is not. */
export const changedForks = (set: ChangeSet) =>
  set.forks
    .map((fork) => ({ ...fork, files: fork.files.filter((file) => file.status !== "same") }))
    .filter((fork) => fork.files.length);

const fenced = (language: string, text: string) => ["```" + language, text.replace(/\n$/, ""), "```"];

function fileBlock(file: FileChange) {
  const what = file.status === "new" ? `New file${file.against ? `, ${file.against}` : ""}.` : `Changed: +${file.added} −${file.removed}, against \`${file.against}\`.`;
  return [`#### \`${file.path.replace(/^src\/components\/forks\/[^/]+\//, "")}\``, what, "", ...fenced(file.status === "new" ? "tsx" : "diff", file.text), ...(file.truncated ? ["(Cut short: the file itself has the rest.)"] : [])];
}

export function briefOf(set: ChangeSet, ctx: BriefContext = {}) {
  const forks = changedForks(set);
  const lines: string[] = [`# ${set.name}: handoff brief`, ""];
  lines.push("A prototype built to the every-website conventions (team-conventions/conventions.md), made in Studio. The changes below are against the files they were copied from, so each is a change to apply to the production file of the same component.");
  if (ctx.canvas) lines.push("", `Design, at each breakpoint: ${ctx.canvas}`);
  if (ctx.github) lines.push(`Source on GitHub: ${ctx.github}`);
  lines.push("", "## How to apply", "");
  lines.push("1. Each change names the production file it applies to. The prototype's component is a plain-prop port of it: production components take a `blok` prop (Storyblok, snake_case fields); the port takes camelCase props.");
  lines.push("2. Apply the diff's changes to the production component. If production has changed since the commit shown, merge the two and keep both.");
  lines.push("3. New components go where production's CLAUDE.md puts them (named export, a `Props` type at the top, Tailwind classes only).");
  lines.push("4. Work through *Still to do*, then run `pnpm lint` and `pnpm tsc --noEmit`. Add the tests production asks for.");
  if (set.newFiles?.length) {
    lines.push("", `## New in the prototype (${set.newFiles.length})`, "", "Components with no file at their path in production, and none by that name elsewhere in it.", "");
    lines.push(...set.newFiles.map((file) => `- \`${file.path}\` (${file.lines} lines)`));
  }
  lines.push("", `## Changes (${forks.length})`, "");
  if (!forks.length) lines.push("Nothing has been changed against production's components yet.", "");
  for (const fork of forks) {
    lines.push(`### ${fork.name}`, fork.production ? `Production file: \`${fork.production}\`. The prototype\u2019s component is a port of it, copied from \`${fork.basedOn}\`${fork.commit ? ` at ${fork.commit}` : ""}.` : `Based on \`${fork.basedOn}\`${fork.commit ? ` at ${fork.commit}` : ""}.`, "");
    for (const file of fork.files) lines.push(...fileBlock(file), "");
  }
  lines.push(`## Still to do (${set.lifts.length})`, "");
  lines.push(...(set.lifts.length ? set.lifts.map((item) => `- \`${item.file}:${item.line}\` ${item.text}`) : ["Nothing is marked as left to do."]), "");
  lines.push(`## Checks`, "");
  lines.push(...(set.checks.length ? set.checks.map((item) => `- **${item.rule}** \`${item.file}:${item.line}\`: ${item.why} (\`${item.text}\`)`) : ["Everything that was changed follows the colour, type and breakpoint rules."]), "");
  return lines.join("\n");
}

/** What to say to an agent to have it do the lift: short, since the brief has the substance. */
export function promptOf(set: ChangeSet, ctx: BriefContext = {}) {
  const where = ctx.origin ? `${ctx.origin}/api/handoff/package?slug=${set.slug}` : null;
  return [
    `Lift the changes in the prototype "${set.name}" into the every-website repo.`,
    "",
    where ? `1. Read the brief: ${where}` : "1. Read the brief below.",
    ...(ctx.github ? [`   The prototype's source is on GitHub: ${ctx.github}`] : []),
    "2. Follow it step by step, and follow this repo's CLAUDE.md.",
    "3. Work on a new branch. Run `pnpm lint` and `pnpm tsc --noEmit`, then open a pull request that says what changed and what is still to do.",
  ].join("\n");
}
