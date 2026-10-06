"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";

import { MotionModal } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";

import { Button } from "./button";

/** A text field or select, the way every dialog in the studio draws one. */
export const fieldClass =
  "w-full rounded-[var(--r-md)] border border-border bg-surface px-3 py-2 text-base text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";

/**
 * A small dialog with a form in it: a title, what it is for, the fields, and
 * Cancel and a button. `onSubmit` resolves true when it worked, and the
 * dialog closes; otherwise it stays, with what went wrong shown inside it so
 * nothing typed is lost.
 */
export function DialogForm({
  title,
  description,
  submitLabel,
  busyLabel,
  disabled,
  destructive,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  busyLabel: string;
  disabled?: boolean;
  destructive?: boolean;
  onSubmit: () => Promise<boolean>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { saving, error, dismissError } = useStudio();

  // An error from somewhere else shouldn't greet a dialog that has just opened.
  useEffect(() => dismissError, [dismissError]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onSubmit()) onClose();
  };

  return (
    <MotionModal open onClose={onClose} label={title}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-foreground-muted">{description}</p> : null}
        </div>

        {children}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={destructive ? "destructive" : "primary"} disabled={disabled || saving}>
            {saving ? busyLabel : submitLabel}
          </Button>
        </div>
      </form>
    </MotionModal>
  );
}
