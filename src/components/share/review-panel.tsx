"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ReviewState } from "@/components/prototype/review-state";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { Stamp } from "@/components/ui/stamp";
import { defaultProfile } from "@/lib/avatars";
import { finishReview, listReviews, openReview } from "@/lib/registry/actions";
import { dueLabel, pastDue, variantOf, VERDICTS, type Review, type ReviewRequest } from "@/lib/reviews";
import { useUser } from "@/lib/use-user";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The overall answer is kept on this device as it is written, so a closed tab or a slow decision doesn't lose it. Comments are saved as they are left. */
type Draft = { response: string; verdict: keyof typeof VERDICTS | null };
const draftKey = (id: string, name: string) => `studio.review-draft.${id}.${name.toLowerCase()}`;
function readDraft(key: string): Draft {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as Draft | null;
    if (stored && typeof stored.response === "string") return { response: stored.response, verdict: stored.verdict === "approved" || stored.verdict === "changes" ? stored.verdict : null };
  } catch {
    // Blocked or unreadable storage: it starts empty.
  }
  return { response: "", verdict: null };
}
function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Blocked storage: the draft lasts until the dialog is closed.
  }
}

/**
 * Everything a reviewer needs beside the prototype, and nothing else: what they were asked and by when, the variations they were
 * asked to look at, and a way to send the review. Opening it as one of the people asked is what marks the request opened.
 */
export function ReviewPanel({ slug, title, versionLabel, request, current, onSetup }: { slug: string; title: string; versionLabel: string; request: ReviewRequest; /** The query of the prototype as it is shown now. */ current: string; /** Shows the prototype in a setup (its query; empty for the baseline). */ onSetup: (setup: string) => void }) {
  const { ready, name, people, choose, add } = useUser();
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const result = await listReviews(slug);
    if (result.ok) setReview(result.value.find((item) => item.id === request.id) ?? null);
  }, [slug, request.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first look, from the store
    void load();
  }, [load]);

  const mine = review && name ? review.reviewers.find((one) => same(one.name, name)) : undefined;
  const needsOpening = !!mine && !mine.openedAt;
  useEffect(() => {
    if (!name || !needsOpening) return;
    void openReview({ slug, id: request.id, name }).then(() => load());
  }, [name, needsOpening, slug, request.id, load]);

  // Nobody signs in, so who is reviewing is picked from the people who were asked.
  const pick = (who: string) => {
    const existing = people.find((person) => same(person.name, who));
    if (existing) choose(existing.name);
    else add(defaultProfile(who));
  };

  const variants = request.variants ?? [];
  const onNow = variantOf(variants, current);
  const overdue = !!request.due && !mine?.doneAt && pastDue(request.due, request.dueBy);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">{title}</h1>
        <span className="shrink-0 text-ui text-foreground-subtle">{versionLabel}</span>
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--r-control)] border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar name={request.by} className="size-6" />
            <span className="truncate text-base font-medium">{request.by}</span>
          </span>
          {request.due ? (
            <span className={`shrink-0 text-sm ${overdue ? "text-tone-exception" : "text-foreground-muted"}`}>
              {overdue ? "Overdue · " : "Due "}
              {dueLabel(request.due, request.dueBy)}
            </span>
          ) : null}
        </div>
        {request.message ? <p className="whitespace-pre-wrap text-base">{request.message}</p> : <p className="text-base text-foreground-muted">Asked for a review.</p>}
      </div>

      {variants.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground-muted">Look at</p>
          <div role="group" aria-label="Variations to review" className="flex flex-wrap gap-1.5">
            {variants.map((one) => (
              <button
                key={one.setup || "baseline"}
                type="button"
                aria-pressed={one === onNow}
                onClick={() => onSetup(one.setup)}
                className={`rounded-[var(--r-full)] border px-3 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-[var(--control-hover)] focus-visible:border-border-strong focus-visible:outline-none ${one === onNow ? "border-border-strong text-foreground" : "border-border text-foreground-muted"}`}
              >
                {one.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!ready || review === undefined ? null : review === null ? (
        <p role="alert" className="text-sm text-destructive">
          This review isn&rsquo;t here any more.
        </p>
      ) : mine?.doneAt ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <ReviewState person={mine} />
            <span className="text-sm text-foreground-muted">
              Submitted <Stamp iso={mine.doneAt} relative />
            </span>
          </div>
          {mine.response ? <p className="whitespace-pre-wrap text-base">{mine.response}</p> : null}
        </div>
      ) : mine && name ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" onClick={() => setSubmitting(true)}>
            Submit review
          </Button>
          <p className="text-sm text-foreground-muted">Comments you leave are saved as you go.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="mb-1 text-sm font-medium">Who are you?</p>
          {request.reviewers.map((who) => (
            <button key={who} type="button" onClick={() => pick(who)} className="flex items-center gap-2.5 rounded-[var(--r-control)] px-2.5 py-1.5 text-left text-nav hover:bg-surface-hover">
              <UserAvatar name={who} className="size-6" />
              {who}
            </button>
          ))}
        </div>
      )}

      {submitting && name
        ? createPortal(
            <SubmitDialog
              id={request.id}
              name={name}
              onClose={() => setSubmitting(false)}
              onSend={async (response, verdict) => {
                const result = await finishReview({ slug, id: request.id, name, response, verdict });
                if (!result.ok) return result.error;
                writeDraft(draftKey(request.id, name), null);
                await load();
                return null;
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

/** The overall response and a verdict. Sending is final; what is typed is kept until then. */
function SubmitDialog({ id, name, onClose, onSend }: { id: string; name: string; onClose: () => void; onSend: (response: string, verdict: string) => Promise<string | null> }) {
  const key = draftKey(id, name);
  const [draft, setDraft] = useState<Draft>(() => readDraft(key));
  const change = (next: Draft) => {
    setDraft(next);
    writeDraft(key, next);
  };

  return (
    <DialogForm title="Submit your review" submitLabel="Submit review" busyLabel="Submitting" disabled={!draft.response.trim() || !draft.verdict} onClose={onClose} onSubmit={() => onSend(draft.response, draft.verdict ?? "")}>
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Overall response
          <textarea value={draft.response} onChange={(event) => change({ ...draft, response: event.target.value })} rows={5} maxLength={4000} autoFocus className={`${fieldClass} resize-none font-normal`} />
        </label>
        <div role="radiogroup" aria-label="Verdict" className="flex gap-2">
          {(Object.keys(VERDICTS) as (keyof typeof VERDICTS)[]).map((one) => (
            <button
              key={one}
              type="button"
              role="radio"
              aria-checked={draft.verdict === one}
              onClick={() => change({ ...draft, verdict: one })}
              className={`flex-1 rounded-[var(--r-md)] border px-3 py-2 text-base transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-[var(--control-hover)] focus-visible:border-border-strong focus-visible:outline-none ${draft.verdict === one ? "border-border-strong" : "border-border"}`}
            >
              {VERDICTS[one]}
            </button>
          ))}
        </div>
      </div>
    </DialogForm>
  );
}
