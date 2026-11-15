"use client";

import { useState } from "react";

import { CloseIcon } from "@/components/shell/nav-icons";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { partsOf, type Part } from "@/lib/handoff-parts";
import type { PublicHandoff } from "@/lib/handoff-public";
import { targetOf, type Selection } from "@/lib/handoff-selection";

import { andList, BUILT_FROM, DECISION, differencesOf, list, ROLE, summaryOf, text, type BuiltFrom } from "./words";

/** Copies text that is still on its way, so the browser still counts it as a result of the press (Safari insists). */
function copy(value: Promise<string>) {
  if (typeof ClipboardItem === "undefined") return value.then((text) => navigator.clipboard.writeText(text));
  return navigator.clipboard.write([new ClipboardItem({ "text/plain": value.then((text) => new Blob([text], { type: "text/plain" })) })]);
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

/**
 * What an engineer sees when they pick something in a handed-off version's canvas: a whole design, or the section of the
 * code that draws what they tapped. What it is and what to do about it, and a link and a brief of just that for their agent.
 * Read only.
 */
export function SelectionPanel({
  data,
  selection,
  onClose,
  briefUrl,
  variantLabel,
  bare = false,
}: {
  data: PublicHandoff;
  selection: Selection | null;
  onClose: () => void;
  /** The link that gives an agent the brief for a target. */
  briefUrl?: (target: string) => string | Promise<string>;
  variantLabel?: (id: string) => string;
  /** Inside a panel that is already a card: no card of its own. */
  bare?: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "brief" | "failed" | null>(null);
  const parts = partsOf(data);
  const section = selection?.kind === "section" ? selection : null;
  const part = section ? partOfFile(parts, section.file) : undefined;
  const finding = part?.finding;
  const decision = finding?.decision ? DECISION[finding.decision.action] : null;
  const candidate = finding ? finding.candidates.find((item) => item.name === finding.decision?.candidate) ?? finding.candidates[0] : undefined;
  const differences = finding && candidate ? differencesOf(finding, candidate) : null;
  const builtFrom = finding ? list<BuiltFrom>(finding.mine.builtFrom) : [];
  const lift = section ? data.lift.filter((item) => item.file === section.file && item.line >= section.line && item.line <= section.endLine) : [];
  const role = finding ? ROLE[finding.kind] : null;
  const inDesign = selection?.kind === "frame" ? parts.filter((item) => item.kit || item.finding?.where.some((place) => !place.variants?.length || place.variants.includes(selection.screenId))) : [];

  const title = !selection ? "Ready for dev" : selection.kind === "frame" ? `Design ${variantLabel?.(selection.screenId) ?? selection.screenId}` : `${part?.name ?? selection.file.split("/").pop()}`;

  return (
    <div className={`flex flex-col gap-4 ${bare ? "border-b border-divider p-4" : "h-full overflow-y-auto rounded-[var(--r-tile)] border border-border bg-surface-elevated p-4 shadow-floating [scrollbar-width:thin]"}`}>
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-ui font-medium text-foreground">{title}</h2>
        {selection ? (
          <IconButton label="Close" variant="ghost" size="sm" tooltipAlign="end" onClick={onClose}>
            <CloseIcon className="size-4" />
          </IconButton>
        ) : null}
      </div>

      {!selection ? (
        <p className="text-ui text-foreground-muted">Handed off by {data.signedBy}. Tap anything in a design to get its code for your agent, or a design&apos;s name for the whole design.</p>
      ) : (
        <>
          {section ? (
            <p className="break-words text-sm text-foreground-muted">
              {section.file}, lines {section.line} to {section.endLine}
            </p>
          ) : (
            <p className="text-sm text-foreground-muted">The whole design, and what it is made of.</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {role ? <Chip tone={role.tone}>{role.label}</Chip> : null}
            {part?.kit ? <Chip tone={part.kit.kind === "stand-in" ? "existing" : "near"}>{part.kit.kind === "stand-in" ? "Front-end version of production's" : "Behind production"}</Chip> : null}
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
          {part?.kit ? (
            <Row title="Production">
              <p className="break-words text-sm text-foreground-muted">{part.kit.production ?? "not found"}</p>
              {part.kit.removedProps.length ? <p className="text-sm text-foreground-muted">Production also takes {andList(part.kit.removedProps.map((prop: { name: string }) => prop.name))}</p> : null}
            </Row>
          ) : null}

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
            <Row title="Its parts">
              <ul className="flex flex-col gap-1 text-sm text-foreground-muted">
                {inDesign.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </Row>
          ) : null}

          {lift.length ? (
            <Row title="To wire up">
              <ul className="flex flex-col gap-1 text-sm text-foreground-muted">
                {lift.map((item) => (
                  <li key={`${item.file}:${item.line}`}>{item.text.replace(/^TODO\(lift\):\s*/, "")}</li>
                ))}
              </ul>
            </Row>
          ) : null}

          {data.preview ? <p className="text-sm text-foreground-subtle">The handoff isn&apos;t signed off yet. Engineers get a link and a brief once it is.</p> : null}
          {briefUrl && !data.preview ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-8 px-3"
                onClick={() => {
                  copy(Promise.resolve(briefUrl(targetOf(selection)))).then(
                    () => setCopied("link"),
                    () => setCopied("failed"),
                  );
                }}
              >
                {copied === "link" ? "Link copied" : "Copy link"}
              </Button>
              <Button
                className="h-8 px-3"
                onClick={() => {
                  copy(
                    Promise.resolve(briefUrl(targetOf(selection)))
                      .then((url) => fetch(url))
                      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("not ok")))),
                  ).then(
                    () => setCopied("brief"),
                    () => setCopied("failed"),
                  );
                }}
              >
                {copied === "brief" ? "Brief copied" : copied === "failed" ? "Couldn't copy" : "Copy brief"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
