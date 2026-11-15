"use client";

import { useEffect, useState } from "react";

import { Chip } from "@/components/ui/chip";
import { undecided, type Handoff } from "@/lib/handoff";
import { readHandoff } from "@/lib/registry/actions";

/**
 * On a prototype's page: a handoff has been scanned for this version and is waiting for the designer, or is part way
 * through, or is signed off. Opens the review over the page. Nothing is drawn until there is one. It is read in the
 * browser (the page stays prerendered).
 */
export function HandoffNotice({ slug, versionKey, onOpen }: { slug: string; versionKey: string; onOpen: () => void }) {
  const [loaded, setLoaded] = useState<{ key: string; handoff: Handoff | null } | null>(null);

  useEffect(() => {
    let live = true;
    readHandoff(slug, versionKey).then((result) => {
      if (live) setLoaded({ key: versionKey, handoff: result.ok ? result.value : null });
    });
    return () => {
      live = false;
    };
  }, [slug, versionKey]);

  const handoff = loaded?.key === versionKey ? loaded.handoff : null;
  if (!handoff) return null;

  const total = handoff.findings.length;
  const decided = total - undecided(handoff);
  const signed = handoff.signOff;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex w-full items-center gap-3 rounded-[var(--r-control)] border border-border px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-ui font-medium text-foreground">Handoff</span>
        <span className="text-ui text-foreground-subtle">{signed ? `Signed off by ${signed.by}` : decided === 0 ? `${total} to decide` : `${decided} of ${total} decided`}</span>
      </span>
      {signed ? <Chip tone="match">Ready for dev</Chip> : decided === 0 ? <Chip tone="quiet" hollow>Ready for review</Chip> : <Chip tone="near">In review</Chip>}
    </button>
  );
}
