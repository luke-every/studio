"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { MotionModal } from "./motion-modal";

/**
 * MotionStepModal — a dialog that takes its decision in steps.
 *
 * It is a MotionModal with one fixed height (`--modal-steps-height`), so moving between steps never makes the dialog
 * jump; whatever a step holds beyond that scrolls inside the step (see ModalStep). The step you leave slides out to
 * the left and fades while the next slides in from the right, and going back is the same the other way round
 * (`step-in-*` / `step-out-*` in motion.css; with reduced motion they only fade). Choosing another step while one is
 * still moving simply sends it that way: nothing waits.
 *
 * `children` is one node per step, `step` the index of the one showing.
 */
export function MotionStepModal({ open, onClose, label, step, children }: { open: boolean; onClose: () => void; label: string; step: number; children: ReactNode[] }) {
  return (
    <MotionModal open={open} onClose={onClose} label={label} className="h-[var(--modal-steps-height)] !overflow-hidden">
      <MotionSteps step={step}>{children}</MotionSteps>
    </MotionModal>
  );
}

function MotionSteps({ step, children }: { step: number; children: ReactNode[] }) {
  const [shown, setShown] = useState(step);
  // The step that is on its way out, until its animation ends.
  const [leaving, setLeaving] = useState<number | null>(null);
  if (step !== shown) {
    setLeaving(shown);
    setShown(step);
  }
  const forward = leaving === null || leaving < shown;

  return (
    <div className="relative h-full">
      {leaving !== null ? (
        <div
          key={leaving}
          inert
          className={`absolute inset-0 ${forward ? "step-out-left" : "step-out-right"}`}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setLeaving(null);
          }}
        >
          {children[leaving]}
        </div>
      ) : null}
      <div key={shown} className={`absolute inset-0 ${leaving === null ? "" : forward ? "step-in-right" : "step-in-left"}`}>
        {children[shown]}
      </div>
    </div>
  );
}

/**
 * One step of a MotionStepModal: a title (and a line under it), the body, which scrolls when it is longer than the
 * dialog, and the buttons, which stay where they are. `problem` is what to fix, shown above the buttons.
 */
export function ModalStep({
  title,
  subtitle,
  problem,
  footer,
  onSubmit,
  children,
}: {
  title: string;
  subtitle?: string;
  problem?: string | null;
  footer?: ReactNode;
  onSubmit?: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit ?? ((event) => event.preventDefault())} className="flex h-full flex-col gap-5">
      <header className="shrink-0">
        <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p> : null}
      </header>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]">{children}</div>
      {problem ? (
        <p role="alert" className="shrink-0 text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      {footer ? <div className="flex shrink-0 items-center justify-end gap-2">{footer}</div> : null}
    </form>
  );
}
