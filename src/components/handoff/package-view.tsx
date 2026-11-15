"use client";

import type { ReactNode } from "react";

import { Chip, Dot } from "@/components/ui/chip";
import { Stamp } from "@/components/ui/stamp";
import type { Finding, Handoff } from "@/lib/handoff";

import { MinePreview, type Context } from "./finding-stage";
import { cssColour, Swatch } from "./previews";
import { andList, BUILT_FROM, DECISION, decisionOf, decisionText, differencesOf, KINDS, nameOf, plural, SYSTEM_TONE, text, totalsOf } from "./words";

/**
 * The package, once signed off: what engineering builds from, laid out to look at. The same data as the file the
 * studio keeps (the findings and their decisions), which is what an engineer's agent reads.
 */

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-baseline gap-2 text-ui font-medium text-foreground">
        {title}
        <span className="font-normal text-foreground-subtle">{count}</span>
      </h3>
      {children}
    </section>
  );
}

function Card({ finding, context, priority }: { finding: Finding; context: Context; priority: number }) {
  const decision = decisionOf(finding);
  const colour = finding.rule === "colours";
  const token = finding.decision?.action === "pick" ? finding.candidates.find((item) => item.name === finding.decision?.candidate) : finding.decision?.action === "approve" ? finding.candidates[0] : undefined;
  const alpha = typeof finding.mine.alpha === "number" ? finding.mine.alpha : 1;
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-[var(--r-lg)] border border-border">
      {colour ? (
        <div className="flex h-20 gap-1 p-1">
          <Swatch hex={text(finding.mine.hex)} alpha={alpha} label={`Prototype, ${text(finding.mine.value)}`} className="h-full flex-1" />
          {token ? <Swatch hex={text(token.value)} alpha={alpha} label={token.name} className="h-full flex-1" /> : null}
        </div>
      ) : (
        <div className="h-40 bg-surface-inset">
          <MinePreview finding={finding} context={context} label={`${nameOf(finding)} in the prototype`} priority={priority} />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1.5 border-t border-divider p-3">
        <p className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-ui text-foreground">{nameOf(finding)}</span>
          <Chip tone={decision.tone}>{decision.label}</Chip>
        </p>
        <p className="text-sm text-foreground-muted">{decisionText(finding)}</p>
        {finding.kind === "stand-in" && finding.candidates[0] ? <StandInMatch finding={finding} /> : null}
      </div>
    </li>
  );
}

/** For a stand-in: which production component it is, and how its props differ: what engineering's agent builds from. */
function StandInMatch({ finding }: { finding: Finding }) {
  const candidate = finding.candidates[0];
  const path = text(candidate.source).split(":").slice(1).join(":");
  const differences = differencesOf(finding, candidate);
  return (
    <div className="flex flex-col gap-0.5 text-sm text-foreground-subtle">
      {path ? <p className="break-words">Production: {path}</p> : null}
      {differences.mine.length ? <p>Prototype {differences.mine.join(", ")}</p> : null}
      {differences.theirs.length ? <p>Production {differences.theirs.join(", ")}</p> : null}
    </div>
  );
}

const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

export function PackageView({ handoff, name, context }: { handoff: Handoff; name: string; context: Context }) {
  const ds = handoff.designSystem;
  const exceptions = handoff.findings.filter((finding) => finding.decision?.action === "exception");
  const extending = handoff.findings.filter((finding) => finding.decision?.action === "extend");
  const markedNew = handoff.findings.filter((finding) => finding.decision?.action === "new");
  const tokens = handoff.findings.filter((finding) => finding.decision?.action === "add");
  const kinds = [...KINDS, ...[...new Set(handoff.findings.map((finding) => finding.kind))].filter((kind) => !KINDS.some((item) => item.kind === kind)).map((kind) => ({ kind, label: kind }))];
  const totals = totalsOf(handoff.findings);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <header className="flex flex-col gap-3">
        <span>
          <Chip tone="match">Ready for dev</Chip>
        </span>
        <h2 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
          {name} {handoff.prototype?.version}
        </h2>
        <p className="text-ui text-foreground-muted">
          Signed off by {handoff.signOff?.by}, <Stamp iso={handoff.signOff?.at ?? handoff.scannedAt} /> · {handoff.scope.variants.map((variant) => variant.label).join(", ")} ·{" "}
          <a href={`https://github.com/${ds.repo}/tree/${ds.sha}`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
            {ds.repo.split("/").pop()} {ds.sha.slice(0, 7)}
          </a>
          {handoff.changedSince?.length ? <> · {handoff.changedSince.length} file{handoff.changedSince.length === 1 ? "" : "s"} changed since the handoff was made</> : null}
          {typeof ds.copiedFrom === "string" && ds.copiedFrom !== ds.sha ? <> · shared UI copied from {ds.copiedFrom.slice(0, 7)}</> : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {totals
            .filter((item) => item.count)
            .map((item) => (
              <Chip key={item.action} tone={DECISION[item.action].tone}>
                {item.count} {DECISION[item.action].label.toLowerCase()}
              </Chip>
            ))}
        </div>
      </header>

      {kinds.map(({ kind, label }) => {
        const findings = handoff.findings.filter((finding) => finding.kind === kind);
        return (
          <Section key={kind} title={label} count={findings.length}>
            <ul className={kind === "colour" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : grid}>
              {findings.map((finding) => (
                <Card key={finding.id} finding={finding} context={context} priority={handoff.findings.indexOf(finding)} />
              ))}
            </ul>
          </Section>
        );
      })}

      {handoff.pages?.length ? (
        <Section title="Pages" count={handoff.pages.length}>
          <ul className="flex flex-col divide-y divide-divider border-y border-divider">
            {handoff.pages.map((page) => (
              <li key={page.file} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:gap-4">
                <span className="text-ui text-foreground sm:w-56 sm:shrink-0">
                  {page.name} <span className="text-foreground-subtle">{page.variants.map((id) => context.variantLabel(id)).join(", ")}</span>
                </span>
                <span className="flex min-w-0 flex-wrap gap-1.5">
                  {page.builtFrom.map((item) => (
                    <Chip key={item.file} tone={BUILT_FROM[item.from]?.tone ?? "quiet"}>
                      {item.name}
                    </Chip>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {handoff.kit?.length ? (
        <Section title="From the kits" count={handoff.kit.length}>
          <ul className="flex flex-col divide-y divide-divider border-y border-divider">
            {handoff.kit.map((item) => (
              <li key={item.file} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-4">
                <span className="flex items-center gap-2 text-ui text-foreground sm:w-56 sm:shrink-0">
                  {item.name}
                  <Chip tone={item.kind === "stand-in" ? "existing" : "near"}>{item.kind === "stand-in" ? "Front-end version" : "Behind production"}</Chip>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 text-sm text-foreground-muted">
                  <span className="break-words">Production: {item.production ?? "not found"}</span>
                  {item.addedProps.length ? <span>The kit also takes {andList(item.addedProps.map((prop) => prop.name))}</span> : null}
                  {item.removedProps.length ? <span>Production also takes {andList(item.removedProps.map((prop) => prop.name))}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Ignored" count={exceptions.length}>
        <ul className="flex flex-col divide-y divide-divider border-y border-divider">
          {exceptions.map((finding) => (
            <li key={finding.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
              <span className="text-ui text-foreground sm:w-56 sm:shrink-0">{nameOf(finding)}</span>
              {finding.decision?.reason ? <span className="text-ui text-foreground-muted">{finding.decision.reason}</span> : null}
            </li>
          ))}
        </ul>
      </Section>

      {extending.length ? (
        <Section title="Extending production" count={extending.length}>
          <ul className="flex flex-col divide-y divide-divider border-y border-divider">
            {extending.map((finding) => {
              const candidate = finding.candidates.find((item) => item.name === finding.decision?.candidate) ?? finding.candidates[0];
              const differences = differencesOf(finding, candidate);
              return (
                <li key={finding.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-4">
                  <span className="text-ui text-foreground sm:w-56 sm:shrink-0">
                    {nameOf(finding)} <span className="text-foreground-subtle">extends {candidate?.name}</span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 text-sm text-foreground-muted">
                    {differences.mine.length ? <span>The prototype {differences.mine.join(", ")}</span> : null}
                    {differences.theirs.length ? <span>Production {differences.theirs.join(", ")}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {markedNew.length ? (
        <Section title="New components" count={markedNew.length}>
          <ul className="flex flex-wrap gap-1.5">
            {markedNew.map((finding) => (
              <li key={finding.id}>
                <Chip tone="new">{nameOf(finding)}</Chip>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {tokens.length ? (
        <Section title="New tokens" count={tokens.length}>
          <ul className="flex flex-wrap gap-1.5">
            {tokens.map((finding) => (
              <li key={finding.id}>
                <Chip tone="system">{finding.decision?.name || nameOf(finding)}</Chip>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="From the system, as it is" count={handoff.scope.designSystem.length}>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {handoff.scope.designSystem.map((item) => (
            <li key={item.file} className="flex items-center gap-1.5 text-ui text-foreground-muted">
              <Dot tone={SYSTEM_TONE} />
              {item.name}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Fixed automatically" count={handoff.fixed?.length ?? 0}>
        <ul className="flex flex-col divide-y divide-divider border-y border-divider">
          {handoff.fixed?.map((item) => (
            <li key={`${item.file}:${item.line}:${item.from}`} className="flex flex-wrap items-center gap-2 py-2.5">
              <span aria-hidden style={{ backgroundColor: cssColour(item.value.split("/")[0], Number(item.value.split("/")[1] ?? 100) / 100) }} className="size-4 shrink-0 rounded-[var(--r-xs)] border border-border" />
              <span className="text-ui text-foreground-muted">{item.value}</span>
              <span aria-hidden className="text-foreground-subtle">→</span>
              <Chip tone="match">{item.token}</Chip>
              <span className="ml-auto text-sm text-foreground-subtle">{item.file.split("/").pop()}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Exact, left as written" count={handoff.exact?.length ?? 0}>
        <ul className="flex flex-col divide-y divide-divider border-y border-divider">
          {handoff.exact?.map((item) => (
            <li key={`${item.file}:${item.line}:${item.from}`} className="flex flex-wrap items-center gap-2 py-2.5">
              {item.token ? <Chip tone="match">{item.token}</Chip> : null}
              <span className="text-ui text-foreground-muted">{item.why.charAt(0).toUpperCase() + item.why.slice(1)}</span>
              <span className="ml-auto text-sm text-foreground-subtle">{item.file.split("/").pop()}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Data and copy to wire up" count={handoff.lift.length}>
        <ul className="flex flex-col divide-y divide-divider border-y border-divider">
          {handoff.lift.map((item) => (
            <li key={`${item.file}:${item.line}`} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <span className="text-ui text-foreground-muted">{item.text.replace(/^TODO\(lift\):?\s*/, "")}</span>
              <span className="shrink-0 text-sm text-foreground-subtle">{item.file.split("/").pop()}</span>
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-sm text-foreground-subtle">
        Scanned by {handoff.scannedBy}, <Stamp iso={handoff.scannedAt} /> · {plural(handoff.scope.live.length, "file")}
      </p>
    </div>
  );
}
