"use client";

import type { ReactNode } from "react";

import { Chip, Dot } from "@/components/ui/chip";
import type { Finding, Handoff } from "@/lib/handoff";
import { isFind } from "@/lib/handoff-clip";

import { MatchPreview, ModulePreview, PageClip, Swatch } from "./previews";
import { BUILT_FROM, colourDistance, decisionOf, differencesOf, list, nameOf, STATUS, statusOf, summaryOf, text, TIER, whereOf, type BuiltFrom, type Candidate, type Prop } from "./words";

/** What a preview needs from the prototype: its page for a finding's variants, its theme, where its files are. */
export type Context = {
  pageFor: (variants?: string[]) => string | null;
  theme: Handoff["theme"];
  fontBase: string;
  variantLabel: (id: string) => string;
  /** The components a finding is built from, compiled to draw, by file. */
  modules?: Record<string, string>;
};

/** The chips that say what a finding is: its kind (or, for a colour, nothing more), how close its match is, and the decision. */
export function FindingChips({ finding }: { finding: Finding }) {
  const status = statusOf(finding);
  const decision = decisionOf(finding);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {status ? <Chip tone={status.tone}>{status.label}</Chip> : null}
      {finding.rule === "colours" ? <Chip tone={TIER[finding.tier].tone}>{TIER[finding.tier].label}</Chip> : null}
      {/* What was decided, unless it only says the label again: "New" on something that is new. */}
      {finding.decision && !(finding.decision.action === "new" && status === STATUS.new) ? (
        <Chip tone={decision.tone}>{decision.label}</Chip>
      ) : null}
    </span>
  );
}

/** One side of the stage: a label over the thing itself. */
function Side({ label, children, tall = true }: { label: ReactNode; children: ReactNode; tall?: boolean }) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-2">
      <figcaption className="flex items-center gap-1.5 text-sm text-foreground-muted">{label}</figcaption>
      <div className={`overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface-inset ${tall ? "h-72 lg:h-96" : "h-40"}`}>{children}</div>
    </figure>
  );
}

/** The prototype's own, as the prototype draws it. */
export function MinePreview({ finding, context, label, priority }: { finding: Finding; context: Context; label: string; priority: number }) {
  if (finding.rule === "colours") {
    return <Swatch hex={text(finding.mine.hex)} alpha={typeof finding.mine.alpha === "number" ? finding.mine.alpha : 1} label={label} />;
  }
  const find = finding.mine.find;
  const page = context.pageFor(finding.where[0]?.variants);
  const props = list<Prop>(finding.mine.props);
  // Where the page doesn't show it (a sheet or drawer that opens on a tap), the component is drawn on its own.
  const alone = <ModulePreview key={finding.id} code={text(finding.mine.module)} name={text(finding.mine.name)} props={props} theme={context.theme} fontBase={context.fontBase} label={label} priority={priority} />;
  return isFind(find) && page ? <PageClip key={`${page}|${finding.id}`} src={page} find={find} label={label} fallback={alone} priority={priority} /> : alone;
}

/** A match: a token's swatch, or the component drawn. */
export function MatchView({ finding, candidate, context, label, priority }: { finding: Finding; candidate: Candidate; context: Context; label: string; priority: number }) {
  if (finding.rule === "colours") {
    return <Swatch hex={text(candidate.value) || text(finding.mine.hex)} alpha={typeof finding.mine.alpha === "number" ? finding.mine.alpha : 1} label={label} />;
  }
  return <MatchPreview key={candidate.name} candidate={candidate} theme={context.theme} fontBase={context.fontBase} label={label} priority={priority} />;
}

/** Each component a finding is built from, drawn, so what it is made of can be seen and not only listed. */
function BuiltFromTiles({ items, context, priority }: { items: BuiltFrom[]; context: Context; priority: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
      {items.map((item) => (
        <li key={item.file} className="flex min-w-0 flex-col gap-1.5">
          <div className="h-32 overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface-inset">
            <ModulePreview code={context.modules?.[item.file] ?? ""} name={item.name} props={item.props ?? []} theme={context.theme} fontBase={context.fontBase} label={`${item.name}, as the prototype has it`} priority={priority} />
          </div>
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground-muted">
            <Dot tone={BUILT_FROM[item.from]?.tone ?? "quiet"} />
            <span className="truncate">{item.name}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Words({ who, items }: { who: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <p className="text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
      <span className="text-foreground">{who}:</span> {items.join(", ")}
    </p>
  );
}

/**
 * One finding, to decide: what it is, mine beside the match as they are drawn, how they differ in words, and the other
 * matches to choose from when there are some. `shown` is the match on show, which the decision applies to.
 */
export function FindingStage({ finding, shown, onShow, context, priority }: { finding: Finding; shown: number; onShow: (index: number) => void; context: Context; /** 0 on screen, then 1, 2, 3 by how soon it will be reached: which previews load first (see `preview-queue.ts`). */ priority: number }) {
  const candidate = finding.candidates[shown];
  const colour = finding.rule === "colours";
  const differences = differencesOf(finding, candidate);
  const variants = [...new Set(finding.where.flatMap((place) => place.variants ?? []))].map(context.variantLabel);
  const where = whereOf(finding);
  const builtFrom = list<BuiltFrom>(finding.mine.builtFrom);

  return (
    <article aria-labelledby="finding-name" className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <FindingChips finding={finding} />
        <h2 id="finding-name" className="break-words text-xl font-medium tracking-[var(--tracking-tight)] text-foreground">
          {nameOf(finding)}
        </h2>
        <p className="text-ui text-foreground-muted">
          {[summaryOf(finding), where, variants.length ? variants.join(", ") : ""].filter(Boolean).join(" · ")}
        </p>
        {builtFrom.length ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <h3 className="text-sm text-foreground-subtle">Built from</h3>
            <ul className="flex flex-col gap-1">
              {builtFrom.map((item) => (
                <li key={item.file} className="flex flex-wrap items-center gap-x-2 text-sm text-foreground-muted">
                  <Chip tone={BUILT_FROM[item.from]?.tone ?? "quiet"}>{item.name}</Chip>
                  <span>{BUILT_FROM[item.from]?.label ?? item.from}</span>
                  <span className="text-foreground-subtle">· {item.importPath}</span>
                </li>
              ))}
            </ul>
            <BuiltFromTiles items={builtFrom} context={context} priority={priority + 2} />
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Side label={colour ? `Prototype, ${text(finding.mine.value)}` : "Prototype"}>
          <MinePreview finding={finding} context={context} label={`${nameOf(finding)} in the prototype`} priority={priority} />
        </Side>
        {candidate ? (
          <Side
            label={
              <>
                <Dot tone={finding.kind === "stand-in" ? "existing" : "system"} />
                {colour ? `Production · ${candidate.name}, ${text(candidate.value)}` : `Production · ${candidate.name}`}
              </>
            }
          >
            <MatchView finding={finding} candidate={candidate} context={context} label={`${candidate.name}${colour ? "" : " from the system"}`} priority={priority} />
          </Side>
        ) : null}
      </div>

      {colour && candidate ? <p className="text-sm text-foreground-muted">{colourDistance(candidate)}</p> : null}
      {differences.mine.length || differences.theirs.length || differences.note ? (
        <div className="flex flex-col gap-1">
          <Words who="Prototype" items={differences.mine} />
          <Words who="Production" items={differences.theirs} />
          {differences.note ? <p className="text-sm text-foreground-subtle">{differences.note}</p> : null}
        </div>
      ) : null}

      {finding.kind === "new-reusable" && list<{ file: string }>(finding.mine.duplicates).length ? (
        <p className="text-sm text-foreground-muted">
          Looks like {list<{ file: string }>(finding.mine.duplicates).map((item) => item.file.split("/").pop()?.replace(/\.\w+$/, "")).join(", ")}
        </p>
      ) : null}

      {finding.candidates.length > 1 ? (
        <section aria-label="Matches" className="flex flex-col gap-2">
          <h3 className="text-sm text-foreground-muted">Matches</h3>
          <div role="radiogroup" aria-label="The match on show" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {finding.candidates.map((item, index) => (
              <button
                key={item.name}
                type="button"
                role="radio"
                aria-checked={index === shown}
                onClick={() => onShow(index)}
                className={`flex min-w-0 flex-col gap-2 rounded-[var(--r-lg)] border p-2 text-left ${index === shown ? "border-border-strong bg-surface-hover" : "border-border hover:bg-surface-hover"}`}
              >
                <span className="block h-24 overflow-hidden rounded-[var(--r-md)] bg-surface-inset">
                  <MatchView finding={finding} candidate={item} context={context} label={item.name} priority={priority + 1} />
                </span>
                <span className="flex min-w-0 items-center justify-between gap-2 px-1 text-sm">
                  <span className="truncate text-foreground">{item.name}</span>
                  <span className="shrink-0 text-foreground-subtle">{colour ? text(item.value) : `${Math.round(item.score * 100)}%`}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
