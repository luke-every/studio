"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { CheckMark } from "@/components/ui/check-mark";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { ModalStep, MotionStepModal } from "@/components/motion";
import { fieldClass } from "@/components/ui/dialog-form";
import { Stamp } from "@/components/ui/stamp";
import { finishReviewAs, openReviewAs, reviewStateAs } from "@/lib/registry/actions";
import { dueLabel, pastDue, variantOf, type Review, type ReviewRequest } from "@/lib/reviews";

/** What is kept on this device while a review is being done, so a closed tab or a slow afternoon doesn't lose it. Comments are saved as they are left. */
const lookedKey = (id: string, name: string) => `studio.review-looked.${id}.${name.toLowerCase()}`;
const draftKey = (id: string, name: string) => `studio.review-draft.${id}.${name.toLowerCase()}`;

function read<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (valid(stored)) return stored;
  } catch {
    // Blocked or unreadable storage: it starts empty.
  }
  return fallback;
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: it lasts until the page is left.
  }
}
const isList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const isText = (value: unknown): value is string => typeof value === "string";

/** Where the person the link is for has got to: theirs alone, never anybody else's. */
type Mine = Pick<Review["reviewers"][number], "openedAt" | "doneAt" | "verdict" | "response">;

/**
 * Everything a reviewer needs beside the prototype, and nothing else: what they were asked and by when, the variations they were
 * asked to look at as a list to work through, and a way to finish. Nobody signs in: the link's key says who this is, and opening it
 * is what marks the request opened. Once sent, it is a thank-you.
 */
export function ReviewPanel({ slug, title, versionLabel, request, reviewer, current, onSetup }: { slug: string; title: string; versionLabel: string; request: ReviewRequest; /** Who the link is for, and the key that is theirs alone. */ reviewer: { name: string; key: string }; /** The query of the prototype as it is shown now. */ current: string; /** Shows the prototype in a setup (its query; empty for the baseline). */ onSetup: (setup: string) => void }) {
  const [mine, setMine] = useState<Mine | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  // The variations ticked off as looked at, by their setup.
  const [looked, setLooked] = useState<string[]>(() => (typeof window === "undefined" ? [] : read(lookedKey(request.id, reviewer.name), [], isList)));

  const load = useCallback(async () => {
    const result = await reviewStateAs(slug, request.id, reviewer.key);
    setMine(result.ok ? result.value : null);
  }, [slug, request.id, reviewer.key]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first look, from the store
    void load();
  }, [load]);

  const needsOpening = mine !== undefined && mine !== null && !mine.openedAt;
  useEffect(() => {
    if (!needsOpening) return;
    void openReviewAs(slug, request.id, reviewer.key).then(() => load());
  }, [needsOpening, slug, request.id, reviewer.key, load]);

  const variants = request.variants ?? [];
  const onNow = variantOf(variants, current);
  const overdue = !!request.due && !mine?.doneAt && pastDue(request.due, request.dueBy);
  const tick = (setup: string) => {
    const next = looked.includes(setup) ? looked.filter((one) => one !== setup) : [...looked, setup];
    setLooked(next);
    write(lookedKey(request.id, reviewer.name), next);
  };

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

      {mine === undefined ? null : mine === null ? (
        <p role="alert" className="text-sm text-destructive">
          This review isn&rsquo;t here any more.
        </p>
      ) : mine.doneAt ? (
        // Sent: the tick, then it says so, and when.
        <div className="flex flex-col gap-3 rounded-[var(--r-control)] border border-border p-4">
          <CheckMark on solid className="size-8" />
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium">Submitted</h2>
            <p className="text-sm text-foreground-muted">
              <Stamp iso={mine.doneAt} />
            </p>
          </div>
        </div>
      ) : (
        <>
          {variants.length ? (
            // A list to work through: tick each off once looked at; tapping the name shows it.
            <div className="flex flex-col rounded-[var(--r-control)] border border-border">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <h2 className="text-sm font-medium">To review</h2>
                <span className="text-sm text-foreground-muted">
                  {variants.filter((one) => looked.includes(one.setup)).length} of {variants.length}
                </span>
              </div>
              <ul role="group" aria-label="Variations to review" className="flex flex-col divide-y divide-border border-t border-border">
                {variants.map((one) => {
                  const done = looked.includes(one.setup);
                  const here = one === onNow;
                  return (
                    <li key={one.setup || "baseline"} className={`flex items-center gap-1 px-2 transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${here ? "bg-surface-hover" : ""}`}>
                      <button type="button" role="checkbox" aria-checked={done} aria-label={`Looked at ${one.label}`} onClick={() => tick(one.setup)} className="grid size-9 shrink-0 place-items-center rounded-[var(--r-control)] hover:bg-[var(--control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                        <CheckMark on={done} className="size-5" />
                      </button>
                      <button type="button" aria-pressed={here} onClick={() => onSetup(one.setup)} className={`min-w-0 flex-1 break-words rounded-[var(--r-control)] py-2 pr-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${done ? "text-foreground-muted" : "text-foreground"}`}>
                        {one.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button variant="primary" className="w-full" onClick={() => setSubmitting(true)}>
              Review and submit
            </Button>
            <p className="text-sm text-foreground-muted">Comments you leave are saved as you go.</p>
          </div>
        </>
      )}

      {submitting
        ? createPortal(
            <SubmitDialog
              id={request.id}
              name={reviewer.name}
              onClose={() => setSubmitting(false)}
              onSend={async (response) => {
                const result = await finishReviewAs(slug, request.id, reviewer.key, response);
                if (!result.ok) return result.error;
                write(draftKey(request.id, reviewer.name), null);
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

/**
 * The way out of a review, in two steps: an overall response, if they have one to give, and send; then a thank-you. Sending is
 * final; what is typed is kept until then.
 */
function SubmitDialog({ id, name, onClose, onSend }: { id: string; name: string; onClose: () => void; onSend: (response: string) => Promise<string | null> }) {
  const key = draftKey(id, name);
  const [step, setStep] = useState(0);
  const [response, setResponse] = useState(() => read(key, "", isText));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const change = (next: string) => {
    setResponse(next);
    write(key, next);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const found = await onSend(response);
    setBusy(false);
    if (found) return setProblem(found);
    setStep(1);
  };

  const respond = (
    <ModalStep
      title="Review and submit"
      problem={problem}
      onSubmit={send}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="min-w-40" loading={busy}>
            {busy ? "Submitting" : "Submit review"}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          Overall response <span className="font-normal text-foreground-muted">Optional</span>
        </span>
        <textarea value={response} onChange={(event) => change(event.target.value)} rows={5} maxLength={4000} autoFocus placeholder="Anything you want to add" className={`${fieldClass} resize-none font-normal`} />
      </label>
    </ModalStep>
  );

  const thanks = (
    <ModalStep
      title="Thank you"
      subtitle="Your review has been submitted."
      footer={
        <Button variant="primary" className="min-w-40" onClick={onClose}>
          Done
        </Button>
      }
    >
      <CheckMark on solid className="size-10" />
    </ModalStep>
  );

  return (
    <MotionStepModal open onClose={onClose} label="Review and submit" step={step} formSteps={[0]}>
      {[respond, thanks]}
    </MotionStepModal>
  );
}
