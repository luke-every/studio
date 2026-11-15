"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { fieldClass } from "@/components/ui/dialog-form";
import { Stamp } from "@/components/ui/stamp";
import type { Finding } from "@/lib/handoff";

import { canAdd, decisionOf, proposedName, mainChoice, mainLabel, type Choice } from "./words";

export type BarMode = "choose" | "add";

/** A key, shown quietly on the button it presses. */
const Key = ({ children }: { children: ReactNode }) => <kbd className="font-sans text-xs font-normal opacity-60">{children}</kbd>;

/**
 * The bar under a finding, which never scrolls away: where it is in the queue, and the decision. Each action has a key
 * (see `onKey` in the modal). Adding to the system asks for a name, here in the bar. Ignoring asks for nothing.
 */
export function ActionBar({
  finding,
  shown,
  mode,
  onMode,
  onDecide,
  onOther,
  index,
  total,
  onStep,
  busy,
  canDecide,
}: {
  finding: Finding;
  shown: number;
  mode: BarMode;
  onMode: (mode: BarMode) => void;
  onDecide: (choice: Choice | null) => void;
  onOther: () => void;
  index: number;
  total: number;
  onStep: (by: 1 | -1) => void;
  busy: boolean;
  canDecide: boolean;
}) {
  const [name, setName] = useState(proposedName(finding));
  const mainText = mainLabel(finding, shown);
  const decision = finding.decision ? decisionOf(finding) : null;
  // The match on show is the one decided on already: pressing it again changes nothing.
  const chosen = mainChoice(finding, shown);
  const same = finding.decision?.action === chosen.action && (chosen.action !== "pick" || finding.decision?.candidate === chosen.candidate);
  const off = busy || !canDecide;
  // Keys typed into a field are the field's; Escape there puts the bar back rather than closing the review.
  const fieldKeys = (submit: () => void) => (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      onMode("choose");
    }
  };
  const addIt = () => name.trim() && onDecide({ action: "add", name: name.trim() });

  return (
    <footer className="flex shrink-0 flex-col border-t border-divider bg-surface-elevated">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1">
          <IconButton label="Previous (←)" variant="ghost" tooltipSide="above" tooltipAlign="start" aria-keyshortcuts="ArrowLeft" onClick={() => onStep(-1)}>
            <ChevronDownIcon className="size-4 rotate-90" />
          </IconButton>
          <p className="min-w-16 text-center text-ui tabular-nums text-foreground-muted" aria-live="polite">
            {index + 1} of {total}
          </p>
          <IconButton label="Next (→)" variant="ghost" tooltipSide="above" aria-keyshortcuts="ArrowRight" onClick={() => onStep(1)}>
            <ChevronDownIcon className="size-4 -rotate-90" />
          </IconButton>
        </div>

        {mode === "add" ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <input
              autoFocus
              aria-label="Its name in the system"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={fieldKeys(addIt)}
              placeholder="Name in the system"
              className={`${fieldClass} h-10 min-w-0 flex-1 py-0 text-ui sm:max-w-xs`}
            />
            <Button onClick={() => onMode("choose")}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={off || !name.trim()} onClick={addIt}>
              Add
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {decision ? (
              <span className="mr-auto flex min-w-0 items-center gap-2 text-sm text-foreground-subtle">
                <Chip tone={decision.tone}>{decision.label}</Chip>
                <span className="truncate max-sm:hidden">
                  {finding.decision?.by}, <Stamp iso={finding.decision!.at} relative />
                </span>
                <button type="button" disabled={off} onClick={() => onDecide(null)} className="text-foreground-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40">
                  Undo
                </button>
              </span>
            ) : !canDecide ? (
              <span className="mr-auto text-sm text-foreground-subtle">Choose who you are, top right, to decide</span>
            ) : null}
            <Button disabled={off} aria-keyshortcuts="i" onClick={() => onDecide({ action: "exception" })}>
              Ignore <Key>I</Key>
            </Button>
            {canAdd(finding) ? (
              <Button disabled={off} aria-keyshortcuts="s" onClick={() => onMode("add")}>
                Add to the system <Key>S</Key>
              </Button>
            ) : null}
            {finding.candidates.length > 1 ? (
              <Button disabled={busy} aria-keyshortcuts="d" onClick={onOther}>
                Other match <Key>D</Key>
              </Button>
            ) : null}
            {mainText ? (
              <Button variant="primary" disabled={off || same} loading={busy} aria-keyshortcuts="a" onClick={() => onDecide(chosen)}>
                {mainText} <Key>A</Key>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </footer>
  );
}
