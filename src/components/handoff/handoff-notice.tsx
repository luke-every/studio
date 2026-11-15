"use client";

import { Chip } from "@/components/ui/chip";

import type { HandoffStatus } from "./use-handoff-status";

/**
 * On a prototype's page: a handoff has been scanned for this version and is waiting for the designer, or is part way
 * through, or is signed off. Opens the review over the page. Nothing is drawn until there is one.
 */
export function HandoffNotice({ status, onOpen }: { status: HandoffStatus | null; onOpen: () => void }) {
  if (!status) return null;

  const decided = status.total - status.left;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex w-full items-center gap-3 rounded-[var(--r-control)] border border-border px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-ui font-medium text-foreground">Handoff</span>
        <span className="text-ui text-foreground-subtle">{status.signedBy ? `Signed off by ${status.signedBy}` : decided === 0 ? `${status.total} to decide` : `${decided} of ${status.total} decided`}</span>
      </span>
      {status.signedBy ? <Chip tone="match">Ready for dev</Chip> : decided === 0 ? <Chip tone="quiet" hollow>Ready for review</Chip> : <Chip tone="near">In review</Chip>}
    </button>
  );
}
