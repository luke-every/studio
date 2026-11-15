"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { MotionModal } from "@/components/motion";
import { CloseIcon, MenuIcon } from "@/components/shell/nav-icons";
import { Chip, Dot } from "@/components/ui/chip";
import { Button, IconButton } from "@/components/ui/button";
import { applyControls, defaultValues, embedded, PREVIEW_QUERY, variantControl, type Controls } from "@/lib/controls";
import { useStudio } from "@/lib/data/studio-store";
import { withParams } from "@/lib/flow";
import { undecided, type Finding, type Handoff } from "@/lib/handoff";
import { applyHandoffDecisions, decideFinding, readHandoff, signOffHandoff, undoHandoffDecisions } from "@/lib/registry/actions";
import type { Prototype, PrototypeVersion } from "@/lib/registry/types";
import { useUser } from "@/lib/use-user";

import { ActionBar, type BarMode } from "./action-bar";
import { FindingStage, type Context } from "./finding-stage";
import { CheckStage } from "./check-stage";
import { PackageView } from "./package-view";
import { cssColour } from "./previews";
import { canAdd, decisionOf, KINDS, mainChoice, mainLabel, nameOf, planOf, text, TIER, totalsOf, type Choice } from "./words";

/**
 * A version's handoff, over its prototype: every finding in a queue, one at a time on a stage of mine beside the
 * match, each needing the designer's own decision (there is no approving them all at once; exact colours never get
 * here, /handoff fixes them in the code first). Decisions save as they are made, and the next finding waiting comes
 * up. Once all are made, Ready for dev signs it off, and from then on this is the package engineering reads.
 *
 * Read through a server action when it opens, like comments, so the prototype's page stays prerendered.
 */
/** How many findings after the one on screen have their previews loaded ahead of time, and how many just seen stay drawn. */
const LOOKAHEAD = 3;
const KEEP = 4;

export function HandoffModal({ prototype, version, controls, onClose }: { prototype: Prototype; version: PrototypeVersion; controls: Controls | null; onClose: () => void }) {
  const { notify } = useStudio();
  const { name } = useUser();
  const key = version.key;
  const label = `${prototype.name} ${version.live ? "Live" : version.version}`;

  const [loaded, setLoaded] = useState<{ key: string; handoff: Handoff | null; error?: string } | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [shown, setShown] = useState<{ id: string; index: number }>({ id: "", index: 0 });
  const [mode, setMode] = useState<{ id: string; mode: BarMode }>({ id: "", mode: "choose" });
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [stage, setStage] = useState<"review" | "check">("review");
  // The findings that have been on screen lately: their previews stay drawn, so coming back to one is instant.
  const [kept, setKept] = useState<{ last: string; ids: string[] }>({ last: "", ids: [] });
  const [queueOpen, setQueueOpen] = useState(false);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    readHandoff(prototype.slug, key).then((result) => {
      if (live) setLoaded(result.ok ? { key, handoff: result.value } : { key, handoff: null, error: result.error });
    });
    return () => {
      live = false;
    };
  }, [prototype.slug, key]);

  const handoff = loaded?.key === key ? loaded.handoff : null;

  // The queue, grouped, in order: what "next" means.
  const groups = useMemo(() => {
    if (!handoff) return [];
    const kinds = [...KINDS, ...[...new Set(handoff.findings.map((finding) => finding.kind))].filter((kind) => !KINDS.some((item) => item.kind === kind)).map((kind) => ({ kind, label: kind, tone: "quiet" as const }))];
    return kinds.map((group) => ({ ...group, findings: handoff.findings.filter((finding) => finding.kind === group.kind) })).filter((group) => group.findings.length);
  }, [handoff]);
  const ordered = groups.flatMap((group) => group.findings);
  const current = ordered.find((finding) => finding.id === currentId) ?? ordered.find((finding) => !finding.decision) ?? ordered[0];
  const at = current ? ordered.indexOf(current) : 0;
  const shownIndex = current && shown.id === current.id ? shown.index : 0;
  const barMode = current && mode.id === current.id ? mode.mode : "choose";

  // The page a finding is in: the version's own, with the prototype's variant switched to one the finding is in.
  const context: Context = useMemo(() => {
    const base = version.url;
    const control = variantControl(controls);
    return {
      theme: handoff?.theme,
      fontBase: typeof window === "undefined" || !base ? "" : `${window.location.origin}${base}/`,
      variantLabel: (id: string) => handoff?.scope.variants.find((variant) => variant.id === id)?.label ?? id,
      pageFor: (variants?: string[]) => {
        if (!base) return null;
        const id = variants?.find((value) => control?.options.some((option) => option.value === value));
        const page = embedded(applyControls(base, controls, { ...defaultValues(controls), ...(control && id ? { [control.id]: id } : {}) }));
        return version.live ? page : withParams(page, Object.fromEntries(new URLSearchParams(PREVIEW_QUERY)));
      },
    };
  }, [version.url, version.live, controls, handoff]);

  if (current && kept.last !== current.id) setKept({ last: current.id, ids: [...kept.ids.filter((id) => id !== current.id), current.id].slice(-KEEP) });

  // What is drawn: the one on screen, the next few (loading in the background, nearest first) and those just seen.
  const ahead = new Set(ordered.slice(at + 1, at + 1 + LOOKAHEAD).map((finding) => finding.id));
  const drawn = current ? ordered.filter((finding) => finding.id === current.id || ahead.has(finding.id) || kept.ids.includes(finding.id)) : [];

  const show = (finding: Finding | undefined) => {
    if (!finding) return;
    setCurrentId(finding.id);
    setQueueOpen(false);
    main.current?.scrollTo({ top: 0 });
  };
  const step = (by: 1 | -1) => show(ordered[(at + by + ordered.length) % ordered.length]);

  const decide = async (finding: Finding, choice: Choice | null) => {
    if (!handoff) return;
    setBusy(true);
    const result = await decideFinding({ slug: prototype.slug, key, id: finding.id, decision: choice, by: name });
    setBusy(false);
    if (!result.ok) return notify(result.error, true);
    setLoaded({ key, handoff: result.value });
    setMode({ id: "", mode: "choose" });
    if (!choice) return;
    // On to the next one still waiting, after this one, else from the top.
    const waiting = (item: Finding) => item.id !== finding.id && !result.value.findings.find((saved) => saved.id === item.id)?.decision;
    show(ordered.slice(at + 1).find(waiting) ?? ordered.find(waiting));
  };

  const signOff = async () => {
    setBusy(true);
    const result = await signOffHandoff({ slug: prototype.slug, key, by: name });
    setBusy(false);
    if (!result.ok) return notify(result.error, true);
    setLoaded({ key, handoff: result.value });
    notify("Ready for dev");
  };

  const apply = async () => {
    setBusy(true);
    setApplying(true);
    const result = await applyHandoffDecisions({ slug: prototype.slug, key, by: name });
    setApplying(false);
    setBusy(false);
    if (!result.ok) return notify(result.error, true);
    setLoaded({ key, handoff: result.value.handoff });
    const { summary } = result.value;
    notify(summary.changed.length ? `Changed ${summary.changed.length}` : "Nothing to change in the code");
  };

  // On to the check: what the decisions say is done in the prototype's code first, so the page shown is the result.
  const check = async () => {
    setStage("check");
    if (handoff && planOf(handoff).change.length) await apply();
  };

  const undo = async () => {
    setBusy(true);
    const result = await undoHandoffDecisions({ slug: prototype.slug, key, by: name });
    setBusy(false);
    if (!result.ok) return notify(result.error, true);
    setLoaded({ key, handoff: result.value });
    notify("Put back as it was");
  };

  const other = () => current && setShown({ id: current.id, index: (shownIndex + 1) % current.candidates.length });

  // The bar's keys, anywhere in the review but a field. Every other key stays here too, so the prototype behind
  // (C to comment, F for full screen) doesn't act on it; Escape and Tab go on to the modal's own handling.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") return;
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (!current || handoff?.signOff || event.metaKey || event.ctrlKey || event.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const can = !busy && !!name;
    const press = (run: () => void) => {
      event.preventDefault();
      run();
    };
    switch (event.key.toLowerCase()) {
      case "arrowleft":
        return press(() => step(-1));
      case "arrowright":
        return press(() => step(1));
      case "a":
        if (can && mainLabel(current, shownIndex)) press(() => void decide(current, mainChoice(current, shownIndex)));
        return;
      case "d":
        if (current.candidates.length > 1) press(other);
        return;
      case "s":
        if (can && canAdd(current)) press(() => setMode({ id: current.id, mode: "add" }));
        return;
      case "i":
        if (can) press(() => void decide(current, { action: "exception" }));
        return;
    }
  };

  const total = handoff?.findings.length ?? 0;
  const left = handoff ? undecided(handoff) : 0;
  const counts = totalsOf(handoff?.findings ?? []);
  const reviewing = !!handoff && !handoff.signOff && !!current;

  return (
    <MotionModal open onClose={onClose} label={`Handoff, ${label}`} fill onKeyDown={onKey}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-divider px-3 sm:px-5">
        {reviewing ? (
          <IconButton label="All findings" variant="ghost" size="sm" tooltipAlign="start" aria-expanded={queueOpen} onClick={() => setQueueOpen((open) => !open)} className="lg:hidden">
            <MenuIcon className="size-4" />
          </IconButton>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate text-ui font-medium text-foreground">
          Handoff <span className="font-normal text-foreground-muted">{label}</span>
        </h2>
        {handoff?.signOff ? (
          <Chip tone="match">Ready for dev</Chip>
        ) : handoff && total ? (
          <div className="flex items-center gap-3">
            <p className="text-sm tabular-nums text-foreground-muted">
              {total - left} of {total}
            </p>
            <div role="progressbar" aria-label="Decided" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total - left} className="h-1 w-24 overflow-hidden rounded-[var(--r-full)] bg-surface-inset max-sm:hidden sm:w-40">
              <div style={{ width: `${((total - left) / total) * 100}%` }} className="h-full bg-foreground" />
            </div>
          </div>
        ) : null}
        {handoff && !handoff.signOff ? (
          stage === "review" ? (
            <Button variant={left === 0 ? "primary" : "secondary"} className="h-8 px-3" disabled={busy} onClick={() => void check()}>
              Check the result
            </Button>
          ) : null
        ) : null}
        <IconButton label="Close" variant="ghost" size="sm" tooltipAlign="end" onClick={onClose}>
          <CloseIcon className="size-4" />
        </IconButton>
      </header>

      {!loaded || loaded.key !== key ? (
        <div aria-busy className="flex-1" />
      ) : !handoff ? (
        <div className="grid flex-1 place-items-center p-8">
          <div className="flex max-w-sm flex-col items-center gap-1 text-center">
            <p className="text-ui font-medium text-foreground">Nothing handed off for {version.live ? "Live" : version.version}</p>
            <p className="text-ui text-foreground-muted">{loaded.error ?? "Run /handoff in Claude Code, in the prototype's folder."}</p>
          </div>
        </div>
      ) : handoff.signOff ? (
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-width:thin] sm:p-8">
          <PackageView handoff={handoff} name={prototype.name} context={context} />
        </main>
      ) : stage === "check" ? (
        <CheckStage handoff={handoff} context={context} busy={busy} applying={applying} canDecide={!!name} onUndo={() => void undo()} onBack={() => setStage("review")} onHandOff={() => void signOff()} />
      ) : !current ? (
        <div className="grid flex-1 place-items-center p-8">
          <p className="text-ui text-foreground-muted">Nothing to decide</p>
        </div>
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1">
            <nav
              aria-label="Findings"
              className={`${queueOpen ? "absolute inset-0 z-[var(--z-raised)] bg-surface-elevated" : "max-lg:hidden"} w-full shrink-0 overflow-y-auto overscroll-contain border-r border-divider p-2 [scrollbar-width:thin] lg:static lg:w-[var(--handoff-queue-width)]`}
            >
              {groups.map((group) => (
                <section key={group.kind} className="pb-2">
                  <h3 className="flex items-center justify-between px-2 pb-1 pt-2 text-sm text-foreground-subtle">
                    <span className="flex items-center gap-1.5">
                      <Dot tone={group.tone} />
                      {group.label}
                    </span>
                    <span className="tabular-nums">
                      {group.findings.filter((finding) => finding.decision).length}/{group.findings.length}
                    </span>
                  </h3>
                  <ul>
                    {group.findings.map((finding) => {
                      const decision = decisionOf(finding);
                      const on = finding.id === current.id;
                      return (
                        <li key={finding.id}>
                          <button
                            type="button"
                            aria-current={on ? "true" : undefined}
                            onClick={() => show(finding)}
                            className={`flex w-full items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 text-left text-ui ${on ? "bg-surface-pressed text-foreground" : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"}`}
                          >
                            <Dot tone={decision.tone} hollow={!finding.decision} />
                            <span className="sr-only">{decision.label}, </span>
                            {finding.rule === "colours" ? (
                              <span aria-hidden style={{ backgroundColor: cssColour(text(finding.mine.hex), typeof finding.mine.alpha === "number" ? finding.mine.alpha : 1) }} className="size-3 shrink-0 rounded-[var(--r-xs)] border border-border" />
                            ) : null}
                            <span className="min-w-0 flex-1 truncate">{nameOf(finding)}</span>
                            {finding.tier !== "none" ? <span className={`shrink-0 text-xs ${finding.tier === "exact" ? "text-tone-match" : "text-tone-near"}`}>{TIER[finding.tier].label}</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </nav>

            <main ref={main} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-width:thin] sm:p-8">
              <div className="relative">
                {drawn.map((finding) => {
                  const on = finding.id === current.id;
                  return (
                    // The same element whether on screen or waiting, so a preview that is ready is not drawn again when its turn comes.
                    <div key={finding.id} inert={!on} className={on ? "relative" : "pointer-events-none invisible absolute inset-x-0 top-0"}>
                      <FindingStage
                        finding={finding}
                        shown={on ? shownIndex : 0}
                        onShow={(index) => setShown({ id: finding.id, index })}
                        context={context}
                        priority={on ? 0 : ahead.has(finding.id) ? ordered.indexOf(finding) - at : LOOKAHEAD + 1}
                      />
                    </div>
                  );
                })}
              </div>
            </main>
          </div>

          <ActionBar
            key={`${current.id}|${current.decision?.at ?? ""}`}
            finding={current}
            shown={shownIndex}
            mode={barMode}
            onMode={(next) => setMode({ id: current.id, mode: next })}
            onDecide={(choice) => void decide(current, choice)}
            onOther={other}
            index={at}
            total={ordered.length}
            onStep={step}
            busy={busy}
            canDecide={!!name}
          />
        </>
      )}
    </MotionModal>
  );
}
