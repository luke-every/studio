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
  /** Set on a reply, to the comment it answers. */
  parentId: z.string().optional(),
});

export const commentsFileSchema = z.array(commentSchema);

export type Anchor = z.infer<typeof anchorSchema>;
export type Comment = z.infer<typeof commentSchema>;
