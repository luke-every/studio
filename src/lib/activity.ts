/** One thing that happened in the studio that somebody may want to hear about: a comment, a reply, or a like. */
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
  /** Somebody liked a comment of the reader's, rather than leaving one. `text` is the comment liked. */
  like?: boolean;
  /** Who it is for, when it is for one person (a like): only they see it. Everyone else sees what has no one in particular. */
  to?: string;
  /** The comment to open: the thread the comment or reply belongs to. Absent on the oldest entries. */
  comment?: string;
};
