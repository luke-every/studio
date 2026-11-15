"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { markChanged } from "@/components/prototype/frame-page";
import { Button } from "@/components/ui/button";
import { Chip, Dot } from "@/components/ui/chip";
import type { Handoff } from "@/lib/handoff";
import type { Find } from "@/lib/handoff-clip";

import type { Context } from "./finding-stage";
import { nameOf, planOf } from "./words";

/** The widths engineering reviews at. */
const WIDTHS = [393, 768, 1440] as const;

const tab = "h-8 rounded-[var(--r-md)] px-3 text-ui text-foreground-muted aria-selected:bg-surface-pressed aria-selected:text-foreground hover:text-foreground";

function Tabs<T extends string | number>({ label, items, value, onChange }: { label: string; items: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-[var(--r-control)] border border-border bg-surface p-0.5">
      {items.map((item) => (
        <button key={String(item.value)} type="button" role="tab" aria-selected={item.value === value} onClick={() => onChange(item.value)} className={tab}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** The prototype as it is now, at one of the review widths, scaled to the room there is. */
function Prototype({ src, width, reload, finds, marks, applied }: { src: string; width: number; reload: number; finds: Find[]; marks: boolean; applied: string }) {
  const room = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // What was changed is outlined in the page, in the studio's own colour for the system, while the toggle is on.
  const mark = () => {
    if (!frame.current) return;
    const colour = getComputedStyle(document.documentElement).getPropertyValue("--tone-system").trim();
    markChanged(frame.current, finds, marks && colour ? colour : null);
  };
  const key = JSON.stringify(finds);
  useEffect(mark, [marks, key, src, width, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = room.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = box ? Math.min(1, box.width / width) : 1;
  return (
    <div ref={room} className="relative size-full overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface-inset">
      {box ? (
        <div style={{ width: width * scale, height: box.height }} className="relative mx-auto overflow-hidden bg-surface">
          <iframe
            ref={frame}
            key={`${src}|${reload}|${applied}`}
            src={src}
            onLoad={mark}
            title="The prototype with the changes"
            style={{ width, height: box.height / scale, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            className="absolute left-0 top-0 block max-w-none border-0"
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The step before committing: the decisions are made in the prototype's code as this opens (they can be undone), and the
 * prototype itself is shown as it is now, so the result is looked at before anything is final. What isn't decided stays
 * as it is. Committing is the only way on.
 */
export function CheckStage({
  handoff,
  context,
  busy,
  applying,
  canDecide,
  onUndo,
  onBack,
  onHandOff,
}: {
  handoff: Handoff;
  context: Context;
  busy: boolean;
  applying: boolean;
  canDecide: boolean;
  onUndo: () => void;
  onBack: () => void;
  onHandOff: () => void;
}) {
  const plan = planOf(handoff);
  const variants = handoff.scope.variants;
  const [variant, setVariant] = useState(variants[0]?.id ?? "");
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(393);
  const [reload, setReload] = useState(0);
  const [marks, setMarks] = useState(true);
  const applied = handoff.applied;
  const finds = (applied?.changed ?? []).flatMap((item) => (item.find ? [item.find as Find] : []));
  const src = context.pageFor([variant]);
  const rows: { tone: "match" | "near" | "quiet"; label: string; count: number; hollow?: boolean }[] = [
    { tone: "match", label: "Change the code", count: plan.change.length },
    { tone: "near", label: "For Claude Code", count: plan.manual.length },
    { tone: "quiet", label: "Recorded, no code change", count: plan.nothing.length },
    { tone: "quiet", label: "Not decided, stays as it is", count: plan.waiting.length, hollow: true },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto overscroll-contain border-b border-divider p-5 [scrollbar-width:thin] lg:w-[var(--handoff-queue-width)] lg:border-b-0 lg:border-r">
          <ul className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-ui text-foreground-muted">
                <Dot tone={row.tone} hollow={row.hollow} />
                <span className="flex-1">{row.label}</span>
                <span className="tabular-nums text-foreground">{row.count}</span>
              </li>
            ))}
          </ul>

          {applying ? <p className="text-ui text-foreground-muted" aria-live="polite">Making the changes…</p> : null}
          {applied && !applying ? (
            <button type="button" disabled={busy} onClick={onUndo} className="self-start text-sm text-foreground-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40">
              Undo what was changed
            </button>
          ) : null}

          {applied ? (
            <section aria-label="What was changed" className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm text-foreground-subtle">
                <Chip tone="match">Changed {applied.changed.length}</Chip>
              </h3>
              <ul className="flex flex-col gap-1.5 text-sm text-foreground-muted">
                {applied.changed.map((item, index) => (
                  <li key={`${item.file}:${item.line}:${index}`}>
                    {item.what} <span className="text-foreground-subtle">in {item.file.split("/").pop()?.replace(/\.\w+$/, "")}</span>
                  </li>
                ))}
              </ul>
              {applied.errors.length ? <p className="text-sm text-tone-exception">The change broke something the code checks found: {applied.errors[0]}</p> : null}
              {applied.left.length ? <p className="text-sm text-foreground-subtle">{applied.left.length} could not be changed by a script.</p> : null}
            </section>
          ) : null}

          {plan.manual.length ? (
            <section aria-label="For Claude Code" className="flex flex-col gap-1.5">
              <h3 className="text-sm text-foreground-subtle">For Claude Code</h3>
              <p className="text-sm text-foreground-subtle">These need a hand-built part swapped for a component, which a script can&apos;t do. Nothing in the prototype has changed for them yet.</p>
              <ul className="flex flex-col gap-1 text-sm text-foreground-muted">
                {plan.manual.map((finding) => (
                  <li key={finding.id}>{nameOf(finding)}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {variants.length > 1 ? <Tabs label="Design" items={variants.map((item) => ({ value: item.id, label: item.label }))} value={variant} onChange={setVariant} /> : null}
            <Tabs label="Width" items={WIDTHS.map((item) => ({ value: item, label: String(item) }))} value={width} onChange={setWidth} />
            <label className={`flex items-center gap-2 text-ui text-foreground-muted ${finds.length ? "" : "opacity-50"}`} title={finds.length ? undefined : "Nothing has been changed in the code yet"}>
              <input type="checkbox" checked={marks && finds.length > 0} disabled={!finds.length} onChange={(event) => setMarks(event.target.checked)} className="peer sr-only" />
              <span aria-hidden className="grid size-4 place-items-center rounded-[var(--r-sm)] border border-border bg-surface peer-checked:border-transparent peer-checked:bg-tone-system peer-focus-visible:ring-1 peer-focus-visible:ring-[var(--focus-ring)]" />
              Outline what changed
            </label>
            <button type="button" onClick={() => setReload((count) => count + 1)} className="ml-auto text-sm text-foreground-muted underline-offset-2 hover:text-foreground hover:underline">
              Reload
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {src ? <Prototype src={src} width={width} reload={reload} finds={finds} marks={marks} applied={applied?.at ?? ""} /> : <p className="grid size-full place-items-center text-ui text-foreground-subtle">No page to show</p>}
          </div>
        </section>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-divider bg-surface-elevated px-4 py-3 sm:px-5">
        <Button onClick={onBack}>Back to review</Button>
        <p className="min-w-0 flex-1 text-right text-sm text-foreground-subtle max-sm:hidden">
          {plan.waiting.length ? `${plan.waiting.length} not decided stay as they are` : "Everything is decided"}
        </p>
        <Button variant="primary" loading={busy && !applying} disabled={busy || !canDecide} onClick={onHandOff}>
          Commit handoff
        </Button>
      </footer>
    </div>
  );
}
