import type { ReactNode } from "react";

/**
 * A state, as a small coloured chip or a dot: the one place colour says something (see the tones in theme.css). The
 * rest of a screen stays near-monochrome around it.
 */
export type Tone = "match" | "near" | "system" | "existing" | "new" | "exception" | "quiet";

// Written out whole, so Tailwind sees every class.
const CHIP: Record<Tone, string> = {
  match: "bg-tone-match-muted text-tone-match",
  near: "bg-tone-near-muted text-tone-near",
  system: "bg-tone-system-muted text-tone-system",
  existing: "bg-tone-existing-muted text-tone-existing",
  new: "bg-tone-new-muted text-tone-new",
  exception: "bg-tone-exception-muted text-tone-exception",
  quiet: "bg-tone-quiet-muted text-tone-quiet",
};
const DOT: Record<Tone, string> = {
  match: "bg-tone-match",
  near: "bg-tone-near",
  system: "bg-tone-system",
  existing: "bg-tone-existing",
  new: "bg-tone-new",
  exception: "bg-tone-exception",
  quiet: "bg-tone-quiet",
};

/** A dot in a tone; `hollow` for something still to do (a ring, no fill). */
export function Dot({ tone, hollow, className }: { tone: Tone; hollow?: boolean; className?: string }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-[var(--r-full)] ${hollow ? "border border-border-strong" : DOT[tone]} ${className ?? ""}`} />;
}

export function Chip({ tone, children, hollow, icon }: { tone: Tone; children: ReactNode; hollow?: boolean; /** Drawn in place of the dot, in the tone's colour. */ icon?: ReactNode }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] px-2 text-xs font-medium ${hollow ? "border border-border text-foreground-muted" : CHIP[tone]}`}>
      {icon ?? <Dot tone={tone} hollow={hollow} className="!size-1.5" />}
      {children}
    </span>
  );
}
