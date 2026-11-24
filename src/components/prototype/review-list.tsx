"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { UserAvatar } from "@/components/shell/user-avatar";
import { Stamp } from "@/components/ui/stamp";
import { KIND_LABEL, type Comment } from "@/lib/comments";
import { listComments, listReviews } from "@/lib/registry/actions";
import { dueLabel, pastDue, variantOf, VERDICTS, type Review } from "@/lib/reviews";

/**
 * A prototype's review requests, read from the store: newest first, and, when asked, the comments that were left for each (by
 * review id). Read when it becomes `active` and whenever the window is come back to, which is when somebody has probably finished.
 */
export function useReviews(slug: string, { active = true, comments = false }: { active?: boolean; comments?: boolean } = {}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [left, setLeft] = useState<Record<string, Comment[]>>({});

  const load = useCallback(async () => {
    const result = await listReviews(slug);
    if (!result.ok) return setProblem(result.error);
    setProblem(null);
    setReviews(result.value);
    if (!comments) return;
    // The comments live with their version, so each version asked about is read once.
    const found: Record<string, Comment[]> = {};
    await Promise.all(
      [...new Set(result.value.map((review) => review.version))].map(async (version) => {
        const read = await listComments(slug, version);
        if (!read.ok) return;
        for (const comment of read.value) if (comment.review && !comment.parentId) (found[comment.review] ??= []).push(comment);
      }),
    );
    setLeft(found);
  }, [slug, comments]);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first look, from the store
    void load();
    const again = () => document.visibilityState === "visible" && void load();
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [active, load]);

  return { reviews, left, problem, reload: load };
}

/** Each request in full: what was asked, of whom, and where each person has got to, with what they said and what they commented. */
export function ReviewCards({ slug, reviews, left }: { slug: string; reviews: Review[]; left: Record<string, Comment[]> }) {
  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((review) => {
        const done = review.reviewers.filter((one) => one.doneAt).length;
        return (
          <li key={review.id} className="flex flex-col gap-3 rounded-[var(--r-md)] border border-border p-4">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-3 text-base">
                <Link href={`/prototypes/${slug}?v=${review.version}&comments=1`} className="font-medium hover:underline">
                  {review.version}
                </Link>
                <span className="text-sm text-foreground-muted">
                  {done} of {review.reviewers.length} in
                </span>
              </div>
              <p className="text-sm text-foreground-muted">
                Asked by {review.by} · <Stamp iso={review.at} relative />
                {review.due ? ` · Due ${dueLabel(review.due, review.dueBy)}` : ""}
              </p>
            </div>
            {review.message ? <p className="whitespace-pre-wrap text-base">{review.message}</p> : null}
            {review.variants?.length ? <p className="text-sm text-foreground-muted">Look at: {review.variants.map((one) => one.label).join(" · ")}</p> : null}
            <ul className="flex flex-col divide-y divide-border border-t border-border">
              {review.reviewers.map((person) => {
                const comments = (left[review.id] ?? []).filter((comment) => comment.author.name.toLowerCase() === person.name.toLowerCase());
                const overdue = !!review.due && pastDue(review.due, review.dueBy) && !person.doneAt;
                return (
                  <li key={person.name} className="flex flex-col gap-2 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <UserAvatar name={person.name} className="size-6" />
                        <span className="truncate text-base">{person.name}</span>
                      </span>
                      <span className="shrink-0 text-sm text-foreground-muted">
                        {person.doneAt ? (
                          <>
                            {person.verdict ? VERDICTS[person.verdict] : "Submitted"} · <Stamp iso={person.doneAt} relative />
                          </>
                        ) : (
                          <>
                            {overdue ? <span className="text-destructive">Overdue · </span> : null}
                            {person.openedAt ? (
                              <>
                                Opened <Stamp iso={person.openedAt} relative />
                              </>
                            ) : (
                              "Sent"
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    {person.response ? <p className="whitespace-pre-wrap pl-[2.125rem] text-base">{person.response}</p> : null}
                    {comments.length ? (
                      <ul className="flex flex-col gap-1 pl-[2.125rem]">
                        {comments.map((comment) => (
                          <li key={comment.id}>
                            <Link href={`/prototypes/${slug}?v=${review.version}&comment=${comment.id}`} className="line-clamp-2 text-sm text-foreground-muted hover:text-foreground">
                              #{comment.n} {comment.kind ? `${KIND_LABEL[comment.kind]} · ` : ""}{review.variants?.length ? `${variantOf(review.variants, comment.variant)?.label ?? "Baseline"} · ` : ""}
                              {comment.text}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
