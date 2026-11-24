"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { RequestReviewDialog } from "@/components/prototype/request-review-dialog";
import { ReviewCards, useReviews } from "@/components/prototype/review-list";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";

/** One prototype's review requests, newest first: what was asked, of whom, and where each person has got to. */
export function ReviewsView() {
  const { slug } = useParams<{ slug: string }>();
  const { prototypes } = useStudio();
  const prototype = prototypes.find((one) => one.slug === slug);
  const [asking, setAsking] = useState(false);
  const { reviews, left, problem, reload } = useReviews(slug, { comments: true });

  if (!prototype) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pb-12 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-md font-medium tracking-[var(--tracking-tight)]">Reviews</h1>
        {reviews?.length ? (
          <Button variant="primary" onClick={() => setAsking(true)}>
            Request review
          </Button>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : reviews === null ? (
        <p className="text-sm text-foreground-muted">Loading</p>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-foreground-muted">Ask someone to look at a version and answer by a date.</p>
          <Button variant="primary" onClick={() => setAsking(true)}>
            Request review
          </Button>
        </div>
      ) : (
        <ReviewCards slug={slug} reviews={reviews} left={left} />
      )}

      {asking ? (
        <RequestReviewDialog
          prototype={prototype}
          version={prototype.current.version}
          onClose={() => {
            setAsking(false);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}
