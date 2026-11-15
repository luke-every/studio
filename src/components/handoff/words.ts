import type { Tone } from "@/components/ui/chip";
import type { Decision, DecisionAction, Finding, Handoff } from "@/lib/handoff";

/**
 * A handoff in the designer's words, and its colours: what each kind of finding, match and decision is called and
 * which tone it wears (see the tones in theme.css). The review, its queue and the package all read them from here, so
 * a state looks and reads the same everywhere.
 */

export type Candidate = Finding["candidates"][number];
export type Prop = { name: string; optional?: boolean; type?: string };
export type Choice = Pick<Decision, "action" | "candidate" | "name" | "reason">;

/** The queue's groups, in the order they are worth deciding. A kind a new rule adds goes after them, under its own name. */
export const KINDS: { kind: string; label: string; tone: Tone }[] = [
  { kind: "stand-in", label: "Stand-ins", tone: "existing" },
  { kind: "near-match", label: "Near matches", tone: "near" },
  { kind: "new-reusable", label: "New, reusable", tone: "new" },
  { kind: "feature-only", label: "Feature only", tone: "quiet" },
  { kind: "colour", label: "Colours", tone: "quiet" },
];
/** A design-system component used as it is: not a finding, but listed in the package. */
export const SYSTEM_TONE: Tone = "system";

export const ROLE: Record<string, { label: string; tone: Tone }> = {
  "stand-in": { label: "Stand-in", tone: "existing" },
  "near-match": { label: "Near match", tone: "near" },
  "new-reusable": { label: "New, reusable", tone: "new" },
  "feature-only": { label: "Feature only", tone: "quiet" },
};

export const TIER: Record<Finding["tier"], { label: string; tone: Tone }> = {
  exact: { label: "Exact", tone: "match" },
  near: { label: "Near", tone: "near" },
  none: { label: "No match", tone: "quiet" },
};

export const DECISION: Record<DecisionAction | "undecided", { label: string; tone: Tone }> = {
  undecided: { label: "To decide", tone: "quiet" },
  approve: { label: "Approved", tone: "match" },
  pick: { label: "Other match", tone: "existing" },
  add: { label: "Added to system", tone: "system" },
  exception: { label: "Ignored", tone: "exception" },
};

export const text = (value: unknown) => (typeof value === "string" ? value : "");
export const list = <T>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);
export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const baseName = (file: string) => file.split("/").pop()?.replace(/\.\w+$/, "") ?? file;

export const nameOf = (finding: Finding) => text(finding.mine.name) || text(finding.mine.value) || finding.id;

/** What one of a finding's variants is called in the prototype (A, B, PDP). */
export type VariantLabel = (id: string) => string;

/** Where a finding is, in plain words: "Border in BundleBoxCard, 2 places", "Used in BuildYourOwnBox and QuizCta". */
export function whereOf(finding: Finding) {
  if (finding.rule === "colours") {
    const uses = [...new Set(finding.where.map((place) => `${usage(place.selector)} in ${baseName(place.file)}`))];
    return `${uses.slice(0, 2).join(", ")}${uses.length > 2 ? ` and ${uses.length - 2} more` : ""}${finding.where.length > 1 ? `, ${plural(finding.where.length, "place")}` : ""}`;
  }
  const uses = list<{ file: string; count: number }>(finding.mine.uses);
  if (finding.kind === "near-match" && !finding.mine.edited) return `In ${text(finding.mine.name)}${finding.where.length > 1 ? `, ${plural(finding.where.length, "place")}` : ""}`;
  if (uses.length) return `Used in ${andList(uses.map((use) => baseName(use.file)))}`;
  if (finding.mine.entry === true) return "A page of its own";
  return "";
}

export const andList = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** What a colour is doing where it is written, from the class or property it is in. */
function usage(selector?: string) {
  const bare = (selector ?? "").split(":").pop() ?? "";
  if (/^bg-/.test(bare)) return "Background";
  if (/^text-/.test(bare)) return "Text";
  if (/^border/.test(bare)) return "Border";
  if (/^(from|via|to)-/.test(bare)) return "Gradient";
  if (/^(ring|outline)/.test(bare)) return "Outline";
  if (/^shadow/.test(bare)) return "Shadow";
  if (!bare || bare === "className" || bare === "style") return "Style";
  return sentence(bare);
}

/** `storyText` or `BACKGROUND` as words: "Story text", "Background". */
function sentence(name: string) {
  const words = (name === name.toUpperCase() ? name.toLowerCase() : name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The headline under a finding's name: what it is in relation to the system. */
export function summaryOf(finding: Finding) {
  const match = finding.candidates[0]?.name;
  switch (finding.kind) {
    case "near-match":
      return finding.mine.edited ? `An edited copy of the system's ${match}` : `Rebuilds ${match}`;
    case "stand-in":
      return `Stands in for production's ${match}`;
    case "new-reusable":
      return "Could join the system";
    case "feature-only":
      return "Only for this feature";
    case "colour":
      return finding.tier === "exact" ? `The same as ${match}` : finding.tier === "near" ? `Close to ${match}` : "No token is close";
    default:
      return text(finding.proposed.summary);
  }
}

/** What the main action does for the match on show: the proposal for the first, picking it for any other. */
export function mainLabel(finding: Finding, shown: number) {
  const candidate = finding.candidates[shown];
  if (shown > 0 || (finding.rule === "colours" && finding.tier === "none")) return candidate ? `Use ${candidate.name}` : null;
  switch (finding.kind) {
    case "near-match":
      return finding.mine.edited ? "Use production instead" : `Use ${candidate?.name}`;
    case "stand-in":
      return "Matches production";
    case "new-reusable":
      return "Add to the system";
    case "feature-only":
      return "Keep with the feature";
    case "colour":
      return `Use ${candidate?.name}`;
    default:
      return "Approve";
  }
}

/** The decision the main action makes for the match on show. */
export function mainChoice(finding: Finding, shown: number): Choice {
  return shown > 0 || (finding.rule === "colours" && finding.tier === "none") ? { action: "pick", candidate: finding.candidates[shown]?.name } : { action: "approve" };
}

/** Whether a separate "Add to the system" makes sense: not where approving already adds it. */
export const canAdd = (finding: Finding) => finding.kind !== "new-reusable";

/** The name a component or colour would join the system under. */
export const proposedName = (finding: Finding) => text(finding.proposed.add) || (finding.rule === "colours" ? "" : text(finding.mine.name));

/** How a decision reads once it is made. */
export function decisionText(finding: Finding) {
  const decision = finding.decision;
  if (!decision) return "";
  if (decision.action === "pick") return `Use ${decision.candidate}`;
  if (decision.action === "add") return `Add to the system as ${decision.name}`;
  if (decision.action === "exception") return decision.reason ?? "Ignored";
  return mainLabel(finding, 0) ?? "Approved";
}

export const decisionOf = (finding: Finding) => DECISION[finding.decision?.action ?? "undecided"];

/** How many findings went each way, for the totals. */
export const totalsOf = (findings: Finding[]) =>
  (["approve", "pick", "add", "exception"] as const).map((action) => ({ action, count: findings.filter((finding) => finding.decision?.action === action).length }));

// --- Differences, in words ---

const SIDES: Record<string, string> = { "": "", x: "side ", y: "top and bottom ", t: "top ", b: "bottom ", l: "left ", r: "right ", s: "start ", e: "end " };
const SIZES: Record<string, string> = { w: "width", h: "height", "min-w": "min width", "min-h": "min height", "max-w": "max width", "max-h": "max height", size: "size" };
const WEIGHTS: Record<string, string> = { thin: "thin", light: "light", normal: "regular", medium: "medium", semibold: "semibold", bold: "bold" };
const PREFIXES: Record<string, string> = { sm: "small screens", md: "tablets", lg: "desktop", xl: "wide screens", hover: "hover", focus: "focus", active: "press", dark: "dark mode" };
const LAYOUT: Record<string, string> = {
  flex: "in a row",
  "flex-col": "stacked",
  "flex-col-reverse": "stacked, reversed",
  "flex-row-reverse": "in a row, reversed",
  "flex-wrap": "wraps",
  "flex-1": "fills the space",
  grid: "a grid",
  "items-center": "centred across",
  "items-start": "aligned to the start",
  "items-end": "aligned to the end",
  "items-stretch": "stretched",
  "justify-center": "centred",
  "justify-between": "spread out",
  "justify-end": "pushed to the end",
  "text-center": "centred text",
  "text-left": "left-aligned text",
  "text-right": "right-aligned text",
  uppercase: "capitals",
  italic: "italic",
  underline: "underlined",
  "overflow-hidden": "clipped",
  fixed: "fixed in place",
  absolute: "placed over",
  relative: "",
  "inset-0": "fills its frame",
  "border-dashed": "dashed border",
  shadow: "a shadow",
  truncate: "cut off with an ellipsis",
};

/** A spacing value in pixels: Tailwind's 4px step, or what is written in brackets. */
function px(value: string) {
  if (value === "px") return "1px";
  if (/^-?[\d.]+$/.test(value)) return `${parseFloat(value) * 4}px`;
  if (value.startsWith("[")) return value.slice(1, -1);
  if (value === "full") return "full";
  return value;
}
function colour(value: string) {
  const [name, alpha] = value.replace(/^\[|\]$/g, "").split("/");
  return `${name.replace(/-/g, " ")}${alpha ? ` at ${alpha}%` : ""}`;
}

/** One utility class in a designer's words: "rounded 14px", "padding 12px", "dark at 6% background". */
export function describeClass(cls: string): string {
  const parts = cls.split(":");
  const base = parts.pop() ?? "";
  const when = parts.map((part) => PREFIXES[part] ?? part).filter(Boolean);
  const said = describeBase(base);
  return said && when.length ? `${said} on ${when.join(", ")}` : said;
}

function describeBase(cls: string): string {
  if (cls in LAYOUT) return LAYOUT[cls];
  let m: RegExpMatchArray | null;
  if ((m = cls.match(/^rounded(?:-(.+))?$/))) return m[1] === "full" ? "fully rounded" : m[1] === "none" ? "square corners" : `rounded ${m[1] ? px(m[1]).replace(/^(\d+)px$/, "$1px") : ""}`.trim();
  if ((m = cls.match(/^(-?)([pm])([xytblrse]?)-(.+)$/))) return `${SIDES[m[3]]}${m[2] === "p" ? "padding" : "margin"} ${m[1]}${px(m[4])}`;
  if ((m = cls.match(/^gap(?:-([xy]))?-(.+)$/))) return `${m[1] === "x" ? "column " : m[1] === "y" ? "row " : ""}gap ${px(m[2])}`;
  if ((m = cls.match(/^(min-w|min-h|max-w|max-h|w|h|size)-(.+)$/))) return `${SIZES[m[1]]} ${px(m[2])}`;
  if ((m = cls.match(/^text-(xs|sm|base|lg|xl|\dxl)$/))) return `${m[1]} text`;
  if ((m = cls.match(/^text-\[(\d[^\]]*)\]$/))) return `${m[1]} text`;
  if ((m = cls.match(/^text-(.+)$/))) return `${colour(m[1])} text`;
  if ((m = cls.match(/^bg-(.+)$/))) return `${colour(m[1])} background`;
  if ((m = cls.match(/^border(?:-([xytblr]))?(?:-(\d+))?$/))) return `${m[2] ?? 1}px ${m[1] ? SIDES[m[1]] : ""}border`;
  if ((m = cls.match(/^border-(.+)$/))) return `${colour(m[1])} border`;
  if ((m = cls.match(/^font-(.+)$/))) return m[1] in WEIGHTS ? `${WEIGHTS[m[1]]} weight` : `${m[1]} font`;
  if ((m = cls.match(/^leading-(.+)$/))) return `line height ${px(m[1])}`;
  if ((m = cls.match(/^tracking-(.+)$/))) return `letter spacing ${m[1].replace(/^\[|\]$/g, "")}`;
  if ((m = cls.match(/^opacity-(\d+)$/))) return `${m[1]}% opacity`;
  if ((m = cls.match(/^grid-cols-(\d+)$/))) return `${m[1]} columns`;
  if ((m = cls.match(/^z-(.+)$/))) return `layer ${m[1]}`;
  return cls.replace(/[[\]]/g, "").replace(/[-_/]+/g, " ");
}

/** The look of one side, in words, from the classes only it has. */
const look = (classes: string[]) => classes.map(describeClass).filter(Boolean);

/** How mine and a match differ, as two short lists of words. Empty when nothing can be said. */
export function differencesOf(finding: Finding, candidate: Candidate | undefined): { mine: string[]; theirs: string[]; note?: string } {
  if (!candidate) return { mine: [], theirs: [] };
  if (finding.kind === "stand-in") {
    const added = list<Prop>(finding.mine.addedProps).map((prop) => prop.name);
    const removed = list<Prop>(finding.mine.removedProps).map((prop) => prop.name);
    return {
      mine: added.length ? [`also takes ${andList(added)}`] : [],
      theirs: removed.length ? [`also takes ${andList(removed)}`] : [],
      note: `${Math.round(candidate.score * 100)}% the same as production's`,
    };
  }
  if (finding.mine.edited) return { mine: [], theirs: [], note: `${Math.round(candidate.score * 100)}% the same as production's` };
  const mine = list<string>(finding.mine.classes);
  const theirs = list<string>(candidate.classes);
  if (!mine.length && !theirs.length) return { mine: [], theirs: [] };
  const parts = (candidate.differences ?? []).find((line) => /elements? here/.test(line))?.replace(/elements?/g, (word) => (word === "element" ? "part" : "parts"));
  return { mine: look(mine.filter((cls) => !theirs.includes(cls))), theirs: look(theirs.filter((cls) => !mine.includes(cls))), note: parts };
}

/** How far apart two colours are, in words. */
export function colourDistance(candidate: Candidate) {
  const delta = parseFloat((candidate.differences?.[0] ?? "").replace(/^ΔE\s*/, ""));
  if (Number.isNaN(delta)) return "The same colour";
  return `${delta < 2 ? "Barely different" : delta <= 6 ? "A shade apart" : "Different"} (ΔE ${delta.toFixed(1)})`;
}

/** A prop's type, the way a designer would put it. */
export function typeInWords(type = "") {
  const t = type.trim();
  if (/ReactNode|ReactElement|JSX\.Element/.test(t)) return "content";
  if (/=>/.test(t)) return "an action";
  if (/\[\]$|^Array</.test(t)) return "a list";
  const literals = t.split("|").map((part) => part.trim());
  if (literals.length > 1 && literals.every((part) => /^["'].*["']$/.test(part))) return literals.map((part) => part.slice(1, -1)).join(" / ");
  if (t === "string") return "text";
  if (t === "number") return "a number";
  if (t === "boolean") return "on or off";
  return "data";
}

/**
 * What pressing Apply would do, by the decisions made so far: a colour swapped for its token or a copy replaced with the
 * design system's (changes the code, in a file the prototype wrote), a hand-built part swapped for a component (left for
 * Claude Code), nothing to change in the code (ignored, added to the system, stand-ins), and what isn't decided yet.
 * The scanner does the same sorting, for real (`applyDecisions`).
 */
export function planOf(handoff: Handoff) {
  const own = new Set(handoff.scope.live.filter((item) => item.role === "new" || item.role === "supporting").map((item) => item.file));
  const plan = { change: [] as Finding[], manual: [] as Finding[], nothing: [] as Finding[], waiting: [] as Finding[] };
  for (const finding of handoff.findings) {
    const decision = finding.decision;
    if (!decision) plan.waiting.push(finding);
    else if (decision.action === "exception" || decision.action === "add") plan.nothing.push(finding);
    else if (finding.rule === "colours") {
      const token = decision.action === "pick" ? decision.candidate : text(finding.proposed.use);
      (token && finding.where.some((place) => own.has(place.file)) ? plan.change : plan.nothing).push(finding);
    } else if (finding.kind === "near-match") (finding.mine.edited ? plan.change : plan.manual).push(finding);

    else plan.nothing.push(finding);
  }
  return plan;
}
