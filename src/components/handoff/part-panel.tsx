"use client";

import { useEffect, useState } from "react";

import { ComponentIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { productionHas } from "@/lib/handoff-brief";
import { partsOf, type Part } from "@/lib/handoff-parts";
import type { Mark } from "@/lib/handoff";
import type { PublicHandoff } from "@/lib/handoff-public";
import { targetOf, type Selection } from "@/lib/handoff-selection";

import { BUILT_FROM, DECISION, differencesOf, list, ROLE, summaryOf, text, type BuiltFrom } from "./words";

/** Copies text that is still on its way, so the browser still counts it as a result of the press (Safari insists). */
function copy(value: Promise<string>) {
  if (typeof ClipboardItem === "undefined") return value.then((text) => navigator.clipboard.writeText(text));
  return navigator.clipboard.write([new ClipboardItem({ "text/plain": value.then((text) => new Blob([text], { type: "text/plain" })) })]);
}

/** The purple square that says a thing is a component. */
function ComponentMark() {
  return (
    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--component)] text-accent-foreground">
      <ComponentIcon className="size-3.5" />
    </span>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm text-foreground-subtle">{title}</h3>
      {children}
    </section>
  );
}

/** The part of a handoff a file belongs to: the whole component it is, or the kit's. */
function partOfFile(parts: Part[], file: string) {
  const here = parts.filter((part) => part.file === file);
  return here.find((part) => !part.finding?.mine.element) ?? here[0];
}

/** Marking what was picked as a new component (the designer's), or taking it off again. */
function MarkControl({ marked, defaultName, onAdd, onRemove }: { marked: Mark | undefined; defaultName: string; onAdd: (name: string) => Promise<void> | void; onRemove: () => Promise<void> | void }) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };
  if (marked) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          <ComponentMark />
          <span className="truncate">{marked.name}</span>
        </span>
        <Button className="h-8 px-3" loading={busy} onClick={() => void run(onRemove)}>
          Remove
        </Button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) void run(() => onAdd(name.trim()));
      }}
      className="flex flex-col gap-2"
    >
      <input
        aria-label="Component name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-8 w-full rounded-[var(--r-md)] bg-surface-inset px-2 text-ui text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
      />
      <Button type="submit" variant="primary" className="h-8 self-start px-3" loading={busy} disabled={!name.trim()}>
        Add to components
      </Button>
    </form>
  );
}

/**
 * What an engineer sees when they pick something in a handed-off version's canvas: a whole design, or the section of the
 * code that draws what they tapped. What it is and what to do about it, and a link and a brief of just that for their agent.
 * Read only.
 */
export function SelectionPanel({
  data,
  selection,
  briefUrl,
  onSelect,
  variantLabel,
  marks,
  bare = false,
}: {
  data: PublicHandoff;
  selection: Selection | null;
  onClose?: () => void;
  /** Picks a part from the list of what a design is made of. */
  onSelect?: (selection: Selection) => void;
  /** The link an agent fetches to get the brief for just a target. */
  briefUrl?: (target: string) => string | Promise<string>;
  variantLabel?: (id: string) => string;
  /** The designer's: what is picked on the canvas can be marked as a new component. Without it the panel only reads. */
  marks?: { onMark: (input: Pick<Mark, "name" | "file" | "line" | "endLine" | "find" | "screen">) => Promise<void> | void; onUnmark: (id: string) => Promise<void> | void };
  /** Inside a panel that is already a card: no card of its own. */
  bare?: boolean;
}) {
  const [copied, setCopied] = useState<"copying" | "copied" | "failed" | null>(null);
  // The answer to a press shows for a moment, then the button is itself again.
  useEffect(() => {
    if (copied !== "copied" && copied !== "failed") return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const parts = partsOf(data);
  const section = selection?.kind === "section" ? selection : null;
  const part = section ? partOfFile(parts, section.file) : undefined;
  const finding = part?.finding;
  const decision = finding?.decision ? DECISION[finding.decision.action] : null;
  const candidate = finding ? finding.candidates.find((item) => item.name === finding.decision?.candidate) ?? finding.candidates[0] : undefined;
  const differences = finding && candidate ? differencesOf(finding, candidate) : null;
  const builtFrom = finding ? list<BuiltFrom>(finding.mine.builtFrom) : [];
  const role = finding ? ROLE[finding.kind] : null;
  // Production has it: which one it is, and nothing about how the prototype's differs.
  const matched = productionHas(part);
  const inDesign =
    selection?.kind === "frame"
      ? [
          ...data.pages.filter((item) => item.variants.includes(selection.screenId)),
          ...parts.filter((item) => item.kit || item.finding?.where.some((place) => !place.variants?.length || place.variants.includes(selection.screenId))),
        ].filter((item, index, all) => all.findIndex((other) => other.file === item.file) === index)
      : [];

  // The prototype's own component, picked as a whole: its file is one of the handed-off ones and the pick spans everything drawn in it.
  const rows = section ? data.elements.filter((item) => item.file === section.file) : [];
  const wholeOwn = !!section && !!data.files[section.file] && rows.length > 0 && section.line <= Math.min(...rows.map((item) => item.line)) && section.endLine >= Math.max(...rows.map((item) => item.endLine));
  const isComponent = !!part || wholeOwn;
  // What was picked on the canvas, by the section of code that draws it: the one thing that can be marked.
  const markable = marks && section?.screenId ? rows.find((item) => item.line === section.line && item.endLine === section.endLine) : undefined;
  const marked = section ? data.marks.find((item) => item.id === `${section.file}:${section.line}`) : undefined;
  const title = !selection ? "Ready for dev" : selection.kind === "frame" ? (variantLabel?.(selection.screenId) ?? selection.screenId) : (part?.name ?? selection.file.split("/").pop()?.replace(/\.[jt]sx?$/, ""));

  return (
    <div className={`flex flex-col gap-4 ${bare ? "border-b border-divider p-4" : "h-full overflow-y-auto rounded-[var(--r-tile)] border border-border bg-surface-elevated p-4 shadow-floating [scrollbar-width:thin]"}`}>
      {title ? (
        <h2 className="flex items-center gap-2 text-ui font-medium text-foreground">
          {isComponent ? <ComponentMark /> : null}
          {title}
        </h2>
      ) : null}

      {!selection ? (
        <p className="text-ui text-foreground-muted">Handed off by {data.signedBy}. Tap anything in a design to get its code for your agent, or a design&apos;s name for the whole design.</p>
      ) : (
        <>
          {section && !part?.kit ? (
            <p className="break-words text-sm text-foreground-muted">
              {section.file}
              {section.line <= 1 && section.endLine >= 9999 ? "" : `, lines ${section.line} to ${section.endLine}`}
            </p>
          ) : null}
          {markable && section?.screenId ? (
            <MarkControl
              key={`${section.file}:${section.line}`}
              marked={marked}
              defaultName={part?.name ?? section.file.split("/").pop()?.replace(/\.[jt]sx?$/, "") ?? ""}
              onAdd={(name) => marks!.onMark({ name, file: section.file, line: section.line, endLine: section.endLine, find: markable.find, screen: section.screenId! })}
              onRemove={() => marks!.onUnmark(`${section.file}:${section.line}`)}
            />
          ) : null}
          {matched ? (
            <>
              <div>
                <Chip tone="system">Matched to production</Chip>
              </div>
              <p className="break-words text-sm text-foreground-muted">{part?.kit ? part.kit.production ?? "not found" : candidate ? text(candidate.source).split(":").slice(1).join(":") : null}</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {role ? <Chip tone={role.tone}>{role.label}</Chip> : null}
                {decision ? <Chip tone={decision.tone}>{decision.label}</Chip> : null}
              </div>
              {finding ? <p className="text-ui text-foreground-muted">{summaryOf(finding)}</p> : null}
              {candidate ? (
                <Row title="Production">
                  <p className="break-words text-sm text-foreground-muted">
                    {candidate.name} · {text(candidate.source).split(":").slice(1).join(":")}
                  </p>
                  {differences?.mine.length ? <p className="text-sm text-foreground-muted">The prototype {differences.mine.join(", ")}</p> : null}
                  {differences?.theirs.length ? <p className="text-sm text-foreground-muted">Production {differences.theirs.join(", ")}</p> : null}
                </Row>
              ) : null}
            </>
          )}

          {builtFrom.length ? (
            <Row title="Built from">
              <ul className="flex flex-col gap-1">
                {builtFrom.map((item) => (
                  <li key={item.file} className="flex flex-wrap items-center gap-x-2 text-sm text-foreground-muted">
                    <Chip tone={BUILT_FROM[item.from]?.tone ?? "quiet"}>{item.name}</Chip>
                    <span>{BUILT_FROM[item.from]?.label ?? item.from}</span>
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}

          {inDesign.length ? (
            <ul className="flex flex-col gap-1 text-ui">
              {inDesign.map((item) => (
                <li key={item.file}>
                  <button type="button" onClick={() => onSelect?.({ kind: "section", file: item.file, line: 1, endLine: 9999 })} className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-[var(--r-sm)] px-1.5 py-1 text-left text-[var(--component)] hover:bg-[var(--component-muted)]">
                    <ComponentMark />
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {data.preview ? <p className="text-sm text-foreground-subtle">The handoff isn&apos;t signed off yet. Engineers get a link and a brief once it is.</p> : null}
          {briefUrl && !data.preview && !productionHas(part) ? (
            <Button
              className="h-8 self-start px-3"
              loading={copied === "copying"}
              onClick={() => {
                setCopied("copying");
                copy(Promise.resolve(briefUrl(targetOf(selection)))).then(
                  () => setCopied("copied"),
                  () => setCopied("failed"),
                );
              }}
            >
              {copied === "copying" ? "Copying" : copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy link"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
