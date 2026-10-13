/** One thing that happened in the studio that somebody may want to hear about: a comment, or a reply. */
export type Activity = {
  id: string;
  at: string;
  /** Who left it. */
  author: string;
  slug: string;
  /** Dotted, as comments are filed: v0.2. */
  version: string;
  prototype: string;
  text: string;
  reply: boolean;
  /** The comment to open: the thread the comment or reply belongs to. Absent on the oldest entries. */
  comment?: string;
};
