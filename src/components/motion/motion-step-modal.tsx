"use client";

import { DistortionWave, type DistortionWaveHandle } from "distortion-waves";
import { useState, type FormEvent, type ReactNode, type Ref } from "react";

import { CheckIcon, CloseIcon } from "@/components/shell/nav-icons";

import { captureWithBorders } from "@/lib/motion/wave-capture";

import { MotionModal } from "./motion-modal";

/**
 * MotionStepModal — a dialog that takes its decision in steps.
 *
 * It is a MotionModal with one height (`--modal-steps-height`), or the taller one (`--modal-steps-height-tall`) for the
 * steps listed in `tallSteps`; the dialog's height eases between them as the step changes. Whatever a step holds beyond
 * its height scrolls inside the step (see ModalStep). The step you leave slides out to
 * the left and fades while the next slides in from the right, and going back is the same the other way round
 * (`step-in-*` / `step-out-*` in motion.css; with reduced motion they only fade). Choosing another step while one is
 * still moving simply sends it that way: nothing waits.
 *
 * `children` is one node per step, `step` the index of the one showing.
 *
 * `waveRef` lets the caller send a distortion wave across the whole dialog (`play()` on it) and `onWaveFinish` hears when
 * it has passed. The wave's element takes over the dialog's padding, so the wave covers the dialog edge to edge.
 */
export function MotionStepModal({
  open,
  onClose,
  label,
  step,
  tallSteps = [],
  waveRef,
  onWaveFinish,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  step: number;
  /** The steps that need the taller dialog. */
  tallSteps?: number[];
  waveRef?: Ref<DistortionWaveHandle>;
  onWaveFinish?: () => void;
  children: ReactNode[];
}) {
  const steps = <MotionSteps step={step}>{children}</MotionSteps>;
  return (
    <MotionModal open={open} onClose={onClose} label={label} className={`${tallSteps.includes(step) ? "h-[var(--modal-steps-height-tall)]" : "h-[var(--modal-steps-height)]"} transition-[height] duration-[var(--dur-standard)] ease-[var(--curve-standard)] !overflow-hidden !rounded-[var(--r-modal-steps)] ${waveRef ? "!p-0" : ""}`}>
      {waveRef ? (
        <DistortionWave ref={waveRef} type="center" capture={captureWithBorders} onFinish={onWaveFinish} className="h-full rounded-[var(--r-modal-steps)] p-6">
          {steps}
        </DistortionWave>
      ) : (
        steps
      )}
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
            if ((event.target as HTMLElement).hasAttribute("data-step-body")) setLeaving(null);
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
 * One step of a MotionStepModal: a headline (and a line under it) at the top of the body, which scrolls when it is longer
 * than the dialog, and the buttons, which stay where they are. `problem` is what to fix, shown above the buttons.
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
      <div data-step-body className="-mx-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1 [scrollbar-width:thin]">
        <div>
          <h2 className="text-2xl font-medium tracking-[var(--tracking-tight)]">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
      {problem ? (
        <p role="alert" data-step-fixed className="shrink-0 text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      {footer ? <div data-step-fixed className="flex shrink-0 items-center justify-end gap-2">{footer}</div> : null}
    </form>
  );
}

/**
 * A step that is a piece of work being done: a badge at the top (the icon of the work, a green tick when it is done, a red
 * cross when it failed), the title below it saying what is happening now (it cross-fades as the work moves on), and a line
 * under that. The wave of a dialog with `waveRef` leaves from behind the badge (`playFromBadge`).
 */
export function StatusStep({
  icon,
  state,
  title,
  subtitle,
  problem,
  footer,
}: {
  icon: ReactNode;
  state: "working" | "done" | "failed";
  title: string;
  subtitle?: string;
  problem?: string | null;
  footer?: ReactNode;
}) {
  return (
    <form onSubmit={(event) => event.preventDefault()} className="flex h-full flex-col gap-5">
      <div data-step-body className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center">
        <span
          data-badge=""
          className={`relative grid size-16 place-items-center rounded-[var(--r-full)] transition-colors duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${
            state === "done" ? "bg-success text-success-foreground" : state === "failed" ? "bg-destructive text-destructive-foreground" : "bg-surface-inset text-foreground-subtle"
          }`}
        >
          {state === "working" ? (
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden className="spin absolute inset-0 size-full text-foreground-muted">
              <path d="M32 1a31 31 0 1 0 31 31" />
            </svg>
          ) : null}
          <span key={state} className="fade-enter grid size-6 place-items-center [&>svg]:size-6">
            {state === "done" ? <CheckIcon /> : state === "failed" ? <CloseIcon /> : icon}
          </span>
        </span>
        <div aria-live="polite">
          <h2 key={title} className="fade-enter text-2xl font-medium tracking-[var(--tracking-tight)]">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p> : null}
        </div>
      </div>
      {problem ? (
        <p role="alert" data-step-fixed className="shrink-0 text-center text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      {footer ? <div data-step-fixed className="flex shrink-0 items-center justify-end gap-2">{footer}</div> : null}
    </form>
  );
}

/** Sends the dialog's wave out from behind the badge of its `StatusStep`; from the middle of the dialog if there is none. */
export function playFromBadge(handle: DistortionWaveHandle | null) {
  const element = handle?.element;
  if (!handle || !element) return;
  const box = element.getBoundingClientRect();
  const badge = element.querySelector("[data-badge]")?.getBoundingClientRect();
  const { x, y, width, height } = badge ?? { x: box.left + box.width / 2 - 24, y: box.top + box.height / 2 - 24, width: 48, height: 48 };
  handle.play({ source: { x: x - box.left, y: y - box.top, w: width, h: height } });
}
