"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { MotionModal } from "@/components/motion";

import { Button } from "./button";

/** A text field or select, the way every dialog in the studio draws one. */
export const fieldClass =
  "w-full rounded-[var(--r-md)] border border-border bg-surface px-3 py-2 text-base text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";

/**
 * A small dialog with a form in it: a title, what it is for, the fields, and
 * Cancel and a button.
 *
 * Pressing the button doesn't hold anything up. `onSubmit` checks what was
 * typed and returns what's wrong with it, if anything, which is shown here
 * and keeps the dialog open; otherwise the dialog closes at once and the
 * save carries on behind it — the button that caused it shows it's working,
 * and a toast says when it's done.
 */
export function DialogForm({
  title,
  description,
  submitLabel,
  disabled,
  destructive,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  disabled?: boolean;
  destructive?: boolean;
  onSubmit: () => string | null | void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = onSubmit();
    if (found) return setProblem(found);
    onClose();
  };

  return (
    <MotionModal open onClose={onClose} label={title}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-foreground-muted">{description}</p> : null}
        </div>

        {children}

        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={destructive ? "destructive" : "primary"} disabled={disabled}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </MotionModal>
  );
}
