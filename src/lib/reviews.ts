import { z } from "zod";

/**
 * Review requests: a deliberate ask for one person (or several) to look at one
 * version and answer. Kept one file per prototype, beside the comments. A
 * request is pinned to the version it was made on, which is immutable, so it
 * stays true after newer versions are pushed.
 *
 * Not to be confused with `lib/review.ts`, the signed links a phone's QR code
 * carries so it can leave comments.
 */
/** One setup of the prototype to look at (see `setupOf`): its query, empty for the baseline, and how it was called when it was asked about. */
export const variantSchema = z.object({ setup: z.string().max(500), label: z.string().min(1).max(120) });

export const reviewSchema = z.object({
  id: z.string().min(1),
  /** Dotted, as comments are filed: v0.2. */
  version: z.string().regex(/^v\d+\.\d+(?:\.\d+)?$/),
  /** What the designer wants looked at. */
  message: z.string().max(2000),
  /** The variations asked about. None means the prototype as it opens. */
  variants: z.array(variantSchema).max(20).optional(),
  /** The day an answer is wanted by, as YYYY-MM-DD. */
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Whether by lunch or by the end of that day. Reviews made before this was asked are end of day. */
  dueBy: z.enum(["lunch", "eod"]).optional(),
  /** Who asked. */
  by: z.string().min(1),
  at: z.string(),
  reviewers: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        /** The first time they opened it. */
        openedAt: z.string().optional(),
        /** When they sent their review. Once set, it is theirs to leave and no longer to change. */
        doneAt: z.string().optional(),
        verdict: z.enum(["approved", "changes"]).optional(),
        /** Their overall answer, in their own words. */
        response: z.string().max(4000).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const VERDICTS = { approved: "Approved", changes: "Changes needed" } as const;

export const reviewsFileSchema = z.array(reviewSchema);

export type Review = z.infer<typeof reviewSchema>;

export type DueBy = NonNullable<Review["dueBy"]>;

/** What a review page knows from the start: the request as it was made, which never changes. Where each person has got to is read fresh. */
export type ReviewRequest = Pick<Review, "id" | "by" | "message" | "due" | "dueBy" | "variants"> & { reviewers: string[] };

/** The hour (in the reader's own time) that lunch and the end of the day stand for. */
const DUE_HOUR: Record<DueBy, number> = { lunch: 12, eod: 17 };

/** A due day as it is said: "Wed 26 Nov, EOD". */
export function dueLabel(due: string, by: DueBy = "eod") {
  const day = new Date(`${due}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${by === "lunch" ? "lunch" : "EOD"}`;
}

/** Whether the time asked for has gone by. */
export function pastDue(due: string, by: DueBy = "eod", now = new Date()) {
  return new Date(`${due}T${String(DUE_HOUR[by]).padStart(2, "0")}:00:00`) < now;
}

/**
 * The two quick choices for when an answer is wanted: the end of the next working day, and of the one after. End of today
 * isn't a fair ask. From a Friday, that is Monday and Tuesday. It is called "Tomorrow" only when it is.
 */
export function dueOptions(now = new Date()) {
  const day = (date: Date) => date.toLocaleDateString("en-CA");
  const nextWorking = (from: Date) => {
    const date = new Date(from);
    do date.setDate(date.getDate() + 1);
    while (date.getDay() === 0 || date.getDay() === 6);
    return date;
  };
  const first = nextWorking(now);
  const second = nextWorking(first);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekday = (date: Date) => date.toLocaleDateString("en-GB", { weekday: "long" });
  return [
    { date: day(first), label: `${day(first) === day(tomorrow) ? "Tomorrow" : weekday(first)} EOD` },
    { date: day(second), label: `${weekday(second)} EOD` },
  ];
}

/**
 * Which of the asked-about variations a prototype's address is in: the one whose setup it contains, the most specific if it
 * contains several, else the baseline if one was asked about. A comment's setup and the address are both such queries.
 */
export function variantOf(variants: Review["variants"], query: string | undefined) {
  const have = new URLSearchParams(query);
  const contains = (setup: string) => [...new URLSearchParams(setup)].every(([key, value]) => have.get(key) === value);
  const size = (setup: string) => new URLSearchParams(setup).size;
  return (variants ?? []).filter((one) => one.setup && contains(one.setup)).sort((a, b) => size(b.setup) - size(a.setup))[0] ?? (variants ?? []).find((one) => !one.setup);
}
