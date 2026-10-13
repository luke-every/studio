import { z } from "zod";

/**
 * Comments on a prototype.
 *
 * A comment belongs to one version, because versions are immutable and an
 * element path only means something against the files it was made on. It is
 * pinned to the element that was clicked, as a fraction of that element's box,
 * so it keeps its place at any zoom or device size. If the element isn't on
 * screen (another step of a flow, say) the pin isn't either; the comment stays
 * in the list. The page-wide fraction is only for a click on the bare page.
 */

export const anchorSchema = z.object({
  /** Where inside the prototype it was left: the frame's path and query, so a flow screen reopens. */
  screen: z.string().max(500),
  /** The element clicked, as `selectorFor` writes it. Null when the click was on the bare page. */
  selector: z.string().max(1000).nullable(),
  /** The start of that element's text, so a step that reuses the same markup position isn't mistaken for it. */
  text: z.string().max(80).optional(),
  /** What the page was saying when it was left (see `pageKey`): the step of a flow, which the address alone doesn't tell apart. */
  page: z.string().max(80).optional(),
  /** Which screen of the prototype's flow it was left on, when it has one: opening it goes straight there. */
  flowScreen: z.string().max(80).optional(),
  /** The point inside that element, 0 to 1 across and down. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /** The same point as a fraction of the whole page, used when no element was clicked. */
  fx: z.number().min(0).max(1),
  fy: z.number().min(0).max(1),
});

export const commentSchema = z.object({
  id: z.string().min(1),
  /** Counts up within the version: the "#3" people say out loud. */
  n: z.number().int().positive(),
  author: z.object({ login: z.string().min(1), name: z.string().min(1) }),
  at: z.string(),
  text: z.string().min(1).max(2000),
  anchor: anchorSchema,
  /** A comment is resolved, never deleted. */
  resolvedAt: z.string().optional(),
  /** The setup it was left on: the query of the prototype's address (a control's choice, a studio variant), none for the version as it is. */
  variant: z.string().optional(),
  /** The names of the people who liked it. */
  likes: z.array(z.string()).optional(),
  /** Set on a reply, to the comment it answers. */
  parentId: z.string().optional(),
});

export const commentsFileSchema = z.array(commentSchema);

export type Anchor = z.infer<typeof anchorSchema>;
export type Comment = z.infer<typeof commentSchema>;

/**
 * The comments given, as a prompt to paste into Claude Code, written to be
 * edited: one numbered item each, with where it was left, then a space at the
 * end for anything the reviewers didn't say. Which comments is the caller's
 * choice, so nothing is filtered here.
 *
 * A prototype with variants gets its comments grouped by the variant they were
 * left on, and the prompt says that each group is for that variant alone, so
 * Claude doesn't carry a point over to the baseline or to its neighbours
 * unless it is told to.
 */
export function reviewPrompt(
  title: string,
  comments: Comment[],
  replies: Record<string, Comment[]>,
  /** A setup in words, when the prototype has variants. */
  setupLabel?: (setup?: string) => string | null,
) {
  const item = (comment: Comment) => {
    const { anchor } = comment;
    const lines = [`${comment.n}. ${comment.text.trim()}`, `   - From: ${comment.author.name}`];
    if (anchor.text) lines.push(`   - On: "${anchor.text}"`);
    if (anchor.selector) lines.push(`   - Element: ${anchor.selector}`);
    if (anchor.screen) lines.push(`   - Screen: ${anchor.screen}`);
    for (const reply of replies[comment.id] ?? []) lines.push(`   - Reply from ${reply.author.name}: ${reply.text.trim()}`);
    return lines.join("\n");
  };

  const groups = new Map<string, Comment[]>();
  for (const comment of comments) groups.set(comment.variant ?? "", [...(groups.get(comment.variant ?? "") ?? []), comment]);
  const scoped = [...groups.keys()].some((setup) => setupLabel?.(setup || undefined));

  if (!scoped) {
    return [
      `We reviewed ${title} and left this feedback. Change the prototype to address each point, and ask me if anything is unclear.`,
      "",
      "## Feedback",
      "",
      comments.map(item).join("\n\n"),
      "",
      "## Also",
      "",
      "",
    ].join("\n");
  }

  const sections = [...groups].map(([setup, list]) => {
    const label = setupLabel?.(setup || undefined) ?? "Baseline";
    const heading = setup ? `## Variant: ${label} (?${setup})` : "## Baseline (no variant selected)";
    return `${heading}\n\n${list.map(item).join("\n\n")}`;
  });

  return [
    `We reviewed ${title} and left this feedback, grouped by the variant it was left on.`,
    "",
    "Each group applies to the variant in its heading and to nothing else. Change only that variant's code. Leave the baseline and every other variant exactly as they are, and don't carry a point over to another variant even if it looks like it would fit. The only exception is anything I say otherwise under Also. Ask me if anything is unclear.",
    "",
    sections.join("\n\n"),
    "",
    "## Also (this overrides the above)",
    "",
    "",
  ].join("\n");
}
