"use client";

import { useEffect, useState } from "react";

import { DialogForm } from "@/components/ui/dialog-form";
import { previewClaudeUpdate, updateClaudeDoc } from "@/lib/registry/actions";
import type { DocChange } from "@/lib/registry/copy-docs";

type Found = {
  canUpdate: boolean;
  changed: DocChange[];
  removed: { key: string; was: string }[];
};

/**
 * Pushing the prototype's changed copy to the Claude doc: the lines whose words have changed since the doc was made or last pushed to, each with what the doc
 * says and what the prototype says now, and only the chosen ones are rewritten, in the Current English column. What the copywriter has written (Suggested
 * English, German, Status) is never touched. Lines the prototype no longer has are only mentioned. What is changed is looked up when the dialog opens.
 */
export function CopyUpdateDialog({
  slug,
  onClose,
  onDone,
}: {
  slug: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [found, setFound] = useState<Found | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let stale = false;
    void previewClaudeUpdate(slug).then((result) => {
      if (stale) return;
      if (!result.ok) return setProblem(result.error);
      setFound(result.value);
      setChosen(new Set(result.value.changed.map((change) => change.key)));
    });
    return () => {
      stale = true;
    };
  }, [slug]);

  const changed = found?.changed ?? [];
  return (
    <DialogForm
      title="Push copy to the Claude doc"
      submitLabel={`Push ${chosen.size} ${chosen.size === 1 ? "line" : "lines"}`}
      busyLabel="Starting…"
      disabled={!chosen.size}
      onClose={onClose}
      onSubmit={async () => {
        const result = await updateClaudeDoc(slug, [...chosen]);
        if (!result.ok) return result.error;
        onDone();
      }}
    >
      {!found && !problem ? (
        <p className="pulse-soft text-sm text-foreground-muted">
          Looking at what changed…
        </p>
      ) : null}
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      {found && !found.canUpdate ? (
        <p className="text-sm text-foreground-muted">
          This doc was made before pushes could be tracked. Delete it from the
          Docs menu and create it again, and from then on changes can be pushed
          to it.
        </p>
      ) : null}
      {found?.canUpdate && !changed.length ? (
        <p className="text-sm text-foreground-muted">
          The doc already says what the prototype says.
        </p>
      ) : null}
      {changed.length ? (
        <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto rounded-[var(--r-control)] border border-border [scrollbar-width:thin]">
          {changed.map((change) => (
            <li
              key={change.key}
              className="flex gap-3 border-b border-divider px-3 py-2 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={chosen.has(change.key)}
                onChange={() =>
                  setChosen((now) =>
                    now.has(change.key)
                      ? new Set([...now].filter((key) => key !== change.key))
                      : new Set(now).add(change.key),
                  )
                }
                aria-label={`Push ${change.key}`}
                className="mt-1 size-4 shrink-0 accent-[var(--selection)]"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-xs text-foreground-subtle">
                  {change.section} · {change.key}
                </p>
                <p className="text-nav text-foreground-muted">{change.was}</p>
                <p className="text-nav text-foreground">{change.now}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {found?.removed.length ? (
        <p className="text-xs text-foreground-subtle">
          {found.removed.length}{" "}
          {found.removed.length === 1 ? "line is" : "lines are"} in the doc but
          no longer in the prototype, and{" "}
          {found.removed.length === 1 ? "is" : "are"} left as{" "}
          {found.removed.length === 1 ? "it is" : "they are"}.
        </p>
      ) : null}
    </DialogForm>
  );
}
