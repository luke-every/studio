"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ModalStep, MotionModal, MotionStepModal } from "@/components/motion";
import {
  CloseIcon,
  DocumentIcon,
  ImportIcon,
} from "@/components/shell/nav-icons";
import { Button, IconButton } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { fieldClass } from "@/components/ui/dialog-form";
import {
  parseCopyPaste,
  type PastedRow,
  type Review,
  type ReviewItem,
  type ReviewKind,
} from "@/lib/copy-import";
import {
  applyCopyImport,
  previewCopyImport,
  pullCopyFromDoc,
} from "@/lib/registry/actions";

/** What each kind of row is called, in the order the review lists them. */
const GROUPS: { title: string; kinds: ReviewKind[] }[] = [
  { title: "To apply", kinds: ["ready", "conflict", "placeholders"] },
  { title: "Needs a look", kinds: ["nocopy", "unknown"] },
  { title: "Waiting for approval", kinds: ["waiting"] },
  { title: "Already in the prototype", kinds: ["already"] },
];
/** Rows that can be taken, and which of them are ticked to start with: only those with nothing wrong. */
const TAKEN: ReviewKind[] = ["ready", "conflict", "placeholders"];

/** The words of `text` that aren't in `against`, marked: what changed, at a glance. */
function Marked({ text, against }: { text: string; against: string }) {
  const known = new Set(against.split(/\s+/));
  return (
    <>
      {text.split(/(\s+)/).map((part, index) =>
        /^\s+$/.test(part) || known.has(part) ? (
          part
        ) : (
          <mark
            key={index}
            className="rounded-[var(--r-xs)] bg-[var(--selection-muted)] text-foreground"
          >
            {part}
          </mark>
        ),
      )}
    </>
  );
}

/**
 * Taking a copy document back into the prototype, either pulled from the Claude doc (the studio reads its tables itself) or pasted from it. Its table is read down to its rows; each is weighed against the words in
 * the prototype's `copy.ts` and listed with what is wrong with it, if anything. Only rows whose status says Approved, and that have new copy, can be
 * taken, and nothing is written until Apply, and then only the lines still ticked.
 */
export function CopyImportDialog({
  slug,
  canPull,
  onClose,
}: {
  slug: string;
  /** There is a Claude doc to pull from. */
  canPull: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<
    "choose" | "pulling" | "paste" | "review" | "done"
  >("choose");
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{
    applied: number;
    skipped: { key: string; why: string }[];
  } | null>(null);

  const read = async (pastedHtml: string, pastedText: string) => {
    setProblem(null);
    const rows: PastedRow[] = parseCopyPaste(pastedHtml, pastedText);
    if (!rows.length)
      return setProblem(
        "There is no table with a Key and a Suggested English column in that.",
      );
    await review_(rows);
  };

  /** Pulled from the doc: its tables are read for us, and then weighed as a paste is. */
  const pull = async () => {
    setProblem(null);
    setPhase("pulling");
    const pulled = await pullCopyFromDoc(slug);
    if (!pulled.ok) {
      setProblem(pulled.error);
      return setPhase("choose");
    }
    await review_(pulled.value);
  };

  const review_ = async (rows: PastedRow[]) => {
    setReading(true);
    const found = await previewCopyImport(slug, rows);
    setReading(false);
    if (!found.ok) {
      setProblem(found.error);
      return setPhase((now) => (now === "pulling" ? "choose" : now));
    }
    setReview(found.value);
    setTicked(
      new Set(
        found.value.items
          .filter((item) => item.kind === "ready")
          .map((item) => item.key),
      ),
    );
    setPhase("review");
  };

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items:
          review?.items.filter((item) => group.kinds.includes(item.kind)) ?? [],
      })).filter((group) => group.items.length),
    [review],
  );
  const taking =
    review?.items.filter(
      (item) => TAKEN.includes(item.kind) && ticked.has(item.key),
    ) ?? [];
  const count = (kind: ReviewKind) =>
    review?.items.filter((item) => item.kind === kind).length ?? 0;
  // Most of the keys not being in this prototype means the table is some other prototype's.
  const another =
    !!review && review.total >= 4 && review.unknown / review.total > 0.5;

  const apply = async () => {
    setApplying(true);
    setProblem(null);
    const done = await applyCopyImport(
      slug,
      taking.map((item) => ({
        key: item.key,
        before: item.before,
        after: item.next,
      })),
    );
    setApplying(false);
    if (!done.ok) return setProblem(done.error);
    setResult({
      applied: done.value.applied.length,
      skipped: done.value.skipped,
    });
    setPhase("done");
  };

  const row = (item: ReviewItem) => {
    const takeable = TAKEN.includes(item.kind);
    return (
      <li
        key={item.key}
        className="flex gap-3 border-b border-divider px-4 py-3 last:border-b-0"
      >
        {takeable ? (
          <input
            type="checkbox"
            checked={ticked.has(item.key)}
            onChange={() =>
              setTicked((now) =>
                now.has(item.key)
                  ? new Set([...now].filter((key) => key !== item.key))
                  : new Set(now).add(item.key),
              )
            }
            aria-label={`Apply ${item.key}`}
            className="mt-1 size-4 shrink-0 accent-[var(--selection)]"
          />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-xs text-foreground-subtle">{item.key}</p>
          {item.before ? (
            <p className="text-nav text-foreground-muted">{item.before}</p>
          ) : null}
          {item.next ? (
            <p className="text-nav text-foreground">
              <Marked text={item.next} against={item.before} />
            </p>
          ) : null}
          {item.warnings.map((warning) => (
            <p key={warning} className="text-xs text-destructive">
              {warning}
            </p>
          ))}
        </div>
      </li>
    );
  };

  // Which way in: a short dialog of its own, as when a prototype or a project is made, which hands over to the place to work once one is chosen.
  const choosing = phase === "choose" || phase === "pulling";
  return createPortal(
    <>
    <MotionStepModal open={choosing} onClose={onClose} label="Update copy" step={0} successor>
      {[
        <ModalStep key="choose" title="Update copy" problem={problem} footer={<Button onClick={onClose}>Cancel</Button>}>
          <ChoiceCards
            options={[
              { label: "Paste copy", about: "From the doc's table", icon: <ImportIcon className="size-6" />, disabled: phase === "pulling", onClick: () => setPhase("paste") },
              {
                label: phase === "pulling" ? "Reading the doc…" : "Pull from the doc",
                about: "Read it from Claude",
                icon: <DocumentIcon className="size-6" />,
                disabled: !canPull || phase === "pulling",
                title: canPull ? undefined : "There is no Claude doc to pull from.",
                onClick: () => void pull(),
              },
            ]}
          />
        </ModalStep>,
      ]}
    </MotionStepModal>
    <MotionModal open={!choosing} onClose={onClose} label="Update copy" fill continuing className="sm:!h-[60vh] sm:!max-w-[60vw]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-divider px-4 py-3">
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">
            Update copy
          </h2>
          <IconButton
            variant="ghost"
            label="Close"
            tooltipAlign="end"
            onClick={onClose}
          >
            <CloseIcon />
          </IconButton>
        </div>

        {phase === "paste" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onPaste={(event) => {
                // A table copied out of a document comes with its structure; that is kept, and what shows in the box is its text.
                const pastedHtml = event.clipboardData.getData("text/html");
                const pastedText = event.clipboardData.getData("text/plain");
                setHtml(pastedHtml);
                setText(pastedText);
                event.preventDefault();
                void read(pastedHtml, pastedText);
              }}
              placeholder="Paste the doc here"
              aria-label="Paste the doc here"
              autoFocus
              className={`${fieldClass} min-h-0 flex-1 resize-none`}
            />
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                loading={reading}
                disabled={!text.trim()}
                onClick={() => void read(html, text)}
              >
                {reading ? "Reading…" : "Read"}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "review" && review ? (
          <>
            <div className="flex shrink-0 flex-col gap-1 border-b border-divider px-4 py-3 text-sm">
              <p className="text-foreground">
                {taking.length} to apply · {count("waiting")} waiting for
                approval · {count("nocopy")} approved with no new copy ·{" "}
                {review.unknown} not found · {review.noChange} unchanged
              </p>
              {another ? (
                <p className="text-destructive">
                  Most of these keys aren&rsquo;t in this prototype. Is this
                  another prototype&rsquo;s doc?
                </p>
              ) : null}
              {!grouped.some((group) => group.kinds.includes("ready")) &&
              !taking.length ? (
                <p className="text-destructive">
                  Nothing is ready to apply:{" "}
                  {count("waiting")
                    ? `${count("waiting")} lines have new copy but aren't approved`
                    : "no line has new copy that is approved"}
                  {count("nocopy")
                    ? `, and ${count("nocopy")} are approved with no new copy`
                    : ""}
                  .
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
              {grouped.map((group) => (
                <section key={group.title}>
                  <h3 className="sticky top-0 z-[1] border-b border-divider bg-surface-elevated px-4 py-2 text-eyebrow">
                    {group.title} · {group.items.length}
                  </h3>
                  <ul>{group.items.map(row)}</ul>
                </section>
              ))}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-divider p-4">
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => (setPhase("choose"), setReview(null))}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  loading={applying}
                  disabled={!taking.length}
                  onClick={() => void apply()}
                >
                  {applying
                    ? "Applying…"
                    : `Apply ${taking.length} ${taking.length === 1 ? "change" : "changes"}`}
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {phase === "done" && result ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <p className="text-sm text-foreground">
              {result.applied} {result.applied === 1 ? "line" : "lines"} changed
              in copy.ts.
            </p>
            {result.skipped.map((one) => (
              <p key={one.key} className="text-sm text-destructive">
                {one.key}: {one.why}
              </p>
            ))}
            <div className="mt-auto flex justify-end">
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </MotionModal>
    </>,
    document.body,
  );
}
