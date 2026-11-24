"use client";

/**
 * A choice's mark: a ring, and once chosen a disc with a tick drawn in it (`tick-draw`, which plays as it appears). `solid` is for
 * a mark over a picture, where the disc is the accent and the tick is light; otherwise it is the reverse, for a filled button.
 */
export function CheckMark({ on, solid = false, className = "size-4" }: { on: boolean; solid?: boolean; className?: string }) {
  if (!on) return <span aria-hidden className={`shrink-0 rounded-[var(--r-full)] border border-border-strong ${solid ? "bg-surface" : ""} ${className}`} />;
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-[var(--r-full)] ${solid ? "bg-accent text-accent-foreground" : "bg-accent-foreground text-accent"} ${className}`}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3/4">
        <path d="M4.5 8.25 7 10.75l4.5-5" pathLength={1} className="tick-draw" />
      </svg>
    </span>
  );
}
