"use client";

import { useState, type ReactNode } from "react";

import { PanelButton, PanelTitle, Section } from "@/components/prototype/edit-fields";
import { CheckIcon, CopyIcon, SparkleIcon } from "@/components/shell/nav-icons";
import { toHex } from "@/lib/edit-dom";
import type { Part } from "@/lib/edit-part";

/**
 * Dev: what an engineer needs to know about the element that is picked, and nothing to change. Where it is written and the classes it has, split by the width they
 * apply at; then its size, spacing, type and look as values, with the design system's token for a colour. Every value copies as it is.
 */

/** A value, the way it is written, that copies when it is pressed. */
function Value({ label, value, hint, copy }: { label: string; value: string; hint?: string; copy?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label.toLowerCase()}`}
      onClick={() =>
        void navigator.clipboard.writeText(copy ?? value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          },
          () => {},
        )
      }
      className="-mx-2 flex items-baseline justify-between gap-4 rounded-[var(--r-control)] px-2 py-1 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
    >
      <span className="shrink-0 text-xs text-foreground-muted">{label}</span>
      <span className="min-w-0 select-text break-words text-right text-sm text-foreground">
        {copied ? "Copied" : value}
        {hint && !copied ? <span className="ml-1.5 text-xs text-foreground-muted">{hint}</span> : null}
      </span>
    </button>
  );
}

/** Copies everything in a section at once. */
function CopyAll({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <PanelButton
      label={copied ? "Copied" : label}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          },
          () => {},
        )
      }
    >
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
    </PanelButton>
  );
}

const px = (value: string | undefined) => (value && /^-?[\d.]+px$/.test(value) ? `${Math.round(parseFloat(value) * 100) / 100}px` : (value ?? ""));
/** A length in steps of the spacing scale (4px a step), when it is on it. */
const step = (value: string | undefined) => {
  const n = value && /^-?[\d.]+px$/.test(value) ? parseFloat(value) / 4 : NaN;
  return Number.isFinite(n) && n * 2 === Math.round(n * 2) && n !== 0 ? `${n}` : null;
};
const sides = (part: Part, kind: "padding" | "margin") => (["top", "right", "bottom", "left"] as const).map((side) => part.css[`${kind}-${side}`] ?? "0px");
/** Four sides written as CSS does: one value when they are all the same, two when top and bottom match and left and right do. */
function shorthand(values: string[]) {
  const [top, right, bottom, left] = values.map(px);
  if (top === right && right === bottom && bottom === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  return `${top} ${right} ${bottom} ${left}`;
}

/** A colour as the design system names it: its token (with opacity where it has some), and the value it is. */
function colourOf(part: Part, value: string | undefined): { text: string; hint?: string } | null {
  if (!value || value === "transparent" || /rgba?\(0,\s*0,\s*0,\s*0\)/.test(value)) return null;
  const hex = toHex(value);
  const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(value)?.[1];
  const token = part.tokens.colours.find((one) => one.value.toLowerCase() === hex)?.name;
  const level = alpha !== undefined && parseFloat(alpha) < 1 ? `/${Math.round(parseFloat(alpha) * 100)}` : "";
  return token ? { text: `${token}${level}`, hint: hex } : { text: hex, hint: "not a token" };
}

/** The classes, by the width each applies from: the base (mobile) ones, `md:` from 768, `lg:` from 1024, and the rest (states, other widths). */
function groupsOf(classes: string | undefined) {
  const groups = { base: [] as string[], md: [] as string[], lg: [] as string[], other: [] as string[] };
  for (const name of (classes ?? "").split(/\s+/).filter(Boolean)) {
    if (name.startsWith("lg:") && !name.slice(3).includes(":")) groups.lg.push(name.slice(3));
    else if (name.startsWith("md:") && !name.slice(3).includes(":")) groups.md.push(name.slice(3));
    else if (name.includes(":")) groups.other.push(name);
    else groups.base.push(name);
  }
  return groups;
}

/**
 * Copies a link to this element's code, for an engineer's agent to open: the element, its imports, and where the rest is. The panel's first action, so it is a full-width
 * button under the element's name, in the Dev green (a shade darker than the tint, so the words read on it).
 */
function AgentLink({ loc, make }: { loc: string; make: (loc: string) => Promise<string> }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "failed">("idle");
  const label = state === "busy" ? "Making the link…" : state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy, try again" : "Copy link for agent";
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={() => {
        setState("busy");
        // The clipboard is handed a promise of the link, made while the tap is still the tap: Safari only lets a page write it straight from one.
        const link = make(loc);
        const copied =
          typeof ClipboardItem === "undefined"
            ? link.then((url) => navigator.clipboard.writeText(url))
            : navigator.clipboard.write([new ClipboardItem({ "text/plain": link.then((url) => new Blob([url], { type: "text/plain" })) })]);
        copied.then(() => setState("copied"), () => setState("failed")).finally(() => window.setTimeout(() => setState("idle"), 1600));
      }}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-[var(--r-control)] bg-[var(--dev-muted)] px-3 text-sm font-medium text-[color-mix(in_oklab,var(--dev)_72%,var(--foreground))] transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-[var(--dev-highlight)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
    >
      {state === "copied" ? <CheckIcon className="size-4" /> : <SparkleIcon className="size-4" />}
      <span aria-live="polite">{label}</span>
    </button>
  );
}

export function DevProperties({ part, agentLink }: { part: Part | null; agentLink?: (loc: string) => Promise<string> }) {
  if (!part) {
    return (
      <div className="flex flex-col gap-1 p-4">
        <p className="text-sm font-medium text-foreground">Nothing picked</p>
        <p className="text-sm text-foreground-muted">Tap an element on the canvas, or a layer, to see its code.</p>
      </div>
    );
  }
  const css = part.css;
  const groups = groupsOf(part.classes);
  const flex = /flex|grid/.test(css.display ?? "");
  const family = (css["font-family"] ?? "").split(",")[0]?.replace(/["']/g, "").trim();
  const fill = colourOf(part, css["background-color"]);
  const colour = colourOf(part, css.color);
  const border = parseFloat(css["border-top-width"] ?? "0") > 0 ? colourOf(part, css["border-top-color"]) : null;
  const corners = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"].map((one) => px(css[one] ?? "0px"));
  const radius = corners.every((one) => one === corners[0]) ? corners[0] : corners.join(" ");
  const padding = sides(part, "padding");
  const margin = sides(part, "margin");
  const scale = (values: string[]) => (values.every((one) => step(one) !== null) ? values.map((one) => step(one)).join(" · ") : undefined);
  const props = part.component ? Object.entries(part.component.props) : [];
  const row = (label: string, value: string | undefined, hint?: string): ReactNode => (value ? <Value key={label} label={label} value={value} hint={hint} /> : null);

  return (
    <div className="flex min-h-full flex-col">
      <PanelTitle name={`<${part.tag}>`} note={part.component ? part.component.name : part.inside ? `in ${part.inside}` : undefined} component={!!part.component}>
        {part.loc && agentLink ? <AgentLink loc={part.loc} make={agentLink} /> : null}
      </PanelTitle>

      {part.loc || part.classes ? (
        <Section
          title="Code"
          action={
            <>
              {part.classes ? <CopyAll text={part.classes} label="Copy all classes" /> : null}
            </>
          }
        >
          {part.loc ? <Value label="Source" value={part.loc.replace(/^src\//, "")} /> : null}
          {part.classes ? (
            <>
              {groups.base.length ? <Value label="Mobile" value={groups.base.join(" ")} /> : null}
              {groups.md.length ? <Value label="md · 768+" value={groups.md.join(" ")} copy={groups.md.map((one) => `md:${one}`).join(" ")} /> : null}
              {groups.lg.length ? <Value label="lg · 1024+" value={groups.lg.join(" ")} copy={groups.lg.map((one) => `lg:${one}`).join(" ")} /> : null}
              {groups.other.length ? <Value label="Other" value={groups.other.join(" ")} /> : null}
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="Layout">
        {row("Size", `${px(css.width)} × ${px(css.height)}`)}
        {row("Display", css.display)}
        {flex ? row("Direction", css["flex-direction"]) : null}
        {flex ? row("Gap", css["column-gap"] === css["row-gap"] ? px(css["column-gap"]) : `${px(css["row-gap"])} ${px(css["column-gap"])}`, step(css["column-gap"]) ? `(${step(css["column-gap"])})` : undefined) : null}
        {flex ? row("Align", css["align-items"]) : null}
        {flex ? row("Justify", css["justify-content"]) : null}
        {css.position && css.position !== "static" ? row("Position", css.position) : null}
      </Section>

      <Section title="Spacing">
        {row("Padding", shorthand(padding), scale(padding) ? `(${scale(padding)})` : undefined)}
        {row("Margin", shorthand(margin), scale(margin) ? `(${scale(margin)})` : undefined)}
      </Section>

      {part.text ? (
        <Section title="Typography">
          {row("Family", family)}
          {row("Size", `${px(css["font-size"])} / ${px(css["line-height"])}`)}
          {row("Tracking", px(css["letter-spacing"]))}
          {row("Weight", css["font-weight"])}
          {row("Align", css["text-align"])}
          {colour ? row("Colour", colour.text, colour.hint) : null}
        </Section>
      ) : null}

      <Section title="Appearance">
        {fill ? row("Fill", fill.text, fill.hint) : row("Fill", "None")}
        {border ? row("Border", `${px(css["border-top-width"])} ${css["border-top-style"]} ${border.text}`, border.hint) : null}
        {row("Radius", radius)}
        {css.opacity && css.opacity !== "1" ? row("Opacity", css.opacity) : null}
        {css["box-shadow"] && css["box-shadow"] !== "none" ? row("Shadow", css["box-shadow"]) : null}
      </Section>

      {part.component ? (
        <Section title={part.component.name} action={props.length ? <CopyAll text={props.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")} label="Copy props" /> : undefined}>
          {props.length ? props.map(([key, value]) => <Value key={key} label={key} value={String(value)} />) : <p className="text-sm text-foreground-muted">No props set.</p>}
        </Section>
      ) : null}

      {part.text ? (
        <Section title="Content">
          <Value label="Text" value={part.text.length > 240 ? `${part.text.slice(0, 240)}…` : part.text} copy={part.text} />
        </Section>
      ) : null}
    </div>
  );
}
