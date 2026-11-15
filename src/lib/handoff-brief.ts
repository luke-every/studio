import { andList, differencesOf, list, text, type BuiltFrom } from "@/components/handoff/words";
import type { Finding } from "@/lib/handoff";
import { partsOf, type Part } from "@/lib/handoff-parts";
import type { PublicHandoff } from "@/lib/handoff-public";
import { targetOf, type Selection } from "@/lib/handoff-selection";

/** The most lines of code a brief carries itself: past it, the agent is pointed at the file. */
const MAX_LINES = 160;
/** The most of a design's parts listed. */
const MAX_PARTS = 25;

/** What to do about a part, in a sentence an agent can act on. */
function verdict(finding: Finding) {
  const action = finding.decision?.action;
  const candidate = finding.decision?.candidate ?? finding.candidates[0]?.name;
  if (action === "extend") return `Extend production's \`${candidate}\` with what differs. Don't build a second one.`;
  if (action === "pick" || finding.kind === "near-match") return `Use production's \`${candidate}\` instead of the prototype's version.`;
  if (finding.kind === "stand-in") return `Use production's \`${candidate}\`, not the prototype's.`;
  if (finding.kind === "new-reusable") return "A new component that could be reused, so it belongs with the shared components.";
  return "A new component, for this feature only.";
}

/** The components a piece of the prototype uses, each as an instruction: production's where it has one, a new one where it doesn't. */
function uses(items: BuiltFrom[]) {
  return ["", "## Uses components", ...items.map((item) => (item.from === "own" ? `- \`${item.name}\`: build it new (the prototype's is \`${item.importPath}\`).` : `- \`${item.name}\`: use production's (\`${item.importPath}\`), not the prototype's.`))];
}

const sourceLink = (ctx: Context, file: string) => `${ctx.origin}/p/${ctx.slug}/${ctx.folder}/_source/${file.split("/").map(encodeURIComponent).join("/")}`;
const base = (file: string) => file.split("/").pop() ?? file;

export type Context = {
  origin: string;
  slug: string;
  folder: string;
  name: string;
  version: string;
  canvas?: string;
  /** The link for another target's brief, so one brief can point at the rest. */
  briefLink: (target: string) => string;
  /** The text of a source file, if it can be read. */
  source: (file: string) => string | null;
};

function head(data: PublicHandoff, ctx: Context, title: string) {
  const lines = [`# ${title}: handoff brief`];
  lines.push(`${ctx.name} ${ctx.version}${data.signedBy ? `, handed off by ${data.signedBy}` : ""}.`);
  if (ctx.canvas) lines.push(`Where it is in the design: ${ctx.canvas}`);
  if (data.changedSince?.length) lines.push(`Note: ${data.changedSince.length} file(s) changed after the handoff was made, so check what you read against it.`);
  return lines;
}

/** Whether production already has this part, so the agent builds from its code and the prototype's own is no use to it. */
function productionHas(part: Part | undefined) {
  if (part?.kit) return true;
  const finding = part?.finding;
  if (!finding || finding.decision?.action === "extend") return false;
  return finding.decision?.action === "pick" || finding.kind === "near-match" || finding.kind === "stand-in";
}

/** The part of a handoff that a file belongs to: the whole component it is, or the kit's. */
function partOfFile(data: PublicHandoff, file: string): Part | undefined {
  const parts = partsOf(data).filter((part) => part.file === file);
  return parts.find((part) => !part.finding?.mine.element) ?? parts[0];
}

/** What a part is, as the lines of a brief. */
function aboutPart(part: Part | undefined, snippet?: string) {
  const lines: string[] = [];
  const finding = part?.finding;
  if (finding) {
    lines.push(verdict(finding));
    const candidate = finding.candidates.find((item) => item.name === finding.decision?.candidate) ?? finding.candidates[0];
    const differences = candidate ? differencesOf(finding, candidate) : null;
    if (candidate) lines.push(`Production's \`${candidate.name}\`: ${text(candidate.source).split(":").slice(1).join(":")}`);
    if (differences?.mine.length) lines.push(`- The prototype ${differences.mine.join(", ")}`);
    if (differences?.theirs.length) lines.push(`- Production ${differences.theirs.join(", ")}`);
    const builtFrom = list<BuiltFrom>(finding.mine.builtFrom).filter((item) => !snippet || snippet.includes(`<${item.name}`));
    if (builtFrom.length) lines.push(...uses(builtFrom));
  } else if (part?.kit) {
    lines.push(`Use production's \`${part.name}\`, not the prototype's.`);
    lines.push(`Production: ${part.kit.production ?? "not found"}`);
    if (part.kit.removedProps.length) lines.push(`Production also takes ${andList(part.kit.removedProps.map((prop) => prop.name))}: wire these to real data.`);
  }
  return lines;
}

/**
 * A brief for what an engineer picked, for their agent: for a section, the lines of the app's source that draw it and
 * what they are part of; for a whole design, what it is made of and where to ask for each part. Short by design.
 */
export function briefOf(data: PublicHandoff, selection: Selection, ctx: Context): string | null {
  if (selection.kind === "frame") {
    const variants = data.variants.includes(selection.screenId) || selection.screenId === "main" ? selection.screenId : null;
    const page = data.pages.find((item) => item.variants.includes(selection.screenId)) ?? data.pages[0];
    const lines = head(data, ctx, `Design ${selection.screenId}`);
    lines.push("", "## What this is", `The whole design${variants ? "" : " (the prototype's one design)"}. It is put together in ${page ? `\`${page.file}\`: ${sourceLink(ctx, page.file)}` : "the prototype's page file"}.`);
    if (page?.builtFrom.length) lines.push(...uses(page.builtFrom));
    const inDesign = partsOf(data).filter((part) => part.finding?.where.some((place) => !place.variants?.length || place.variants.includes(selection.screenId)) || part.kit);
    const named = [...new Map(inDesign.map((part) => [part.file, part])).values()].slice(0, MAX_PARTS);
    if (named.length) {
      lines.push("", "## Its parts, and what to do with each");
      for (const part of named) {
        const what = part.finding ? verdict(part.finding) : part.kit ? `Use production's component (${part.kit.production ?? "not found"}).` : "";
        lines.push(`- \`${part.name}\`: ${what} Brief: ${ctx.briefLink(`src:${part.file}:1-9999`)}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  // A section of the code.
  const { file, line, endLine } = selection;
  const part = partOfFile(data, file);
  const full = ctx.source(file);
  const rows = full?.split("\n");
  const last = rows ? Math.min(endLine, rows.length) : endLine;
  const snippet = rows ? rows.slice(line - 1, Math.min(last, line - 1 + MAX_LINES)).join("\n") : null;
  const whole = line <= 1 && endLine >= 9999;
  const title = `${part?.name ?? base(file)}${whole ? "" : `, lines ${line} to ${last}`}`;
  const lines = head(data, ctx, title);
  const production = productionHas(part);
  if (!production) lines.push("", "## Where", `\`${file}\`${whole ? "" : `, lines ${line} to ${last}`}: ${sourceLink(ctx, file)}`);
  lines.push("", "## What to do", ...(aboutPart(part, snippet ?? undefined).length ? aboutPart(part, snippet ?? undefined) : ["Build what this code draws, using production's components where the prototype uses them."]));
  // Production's own code is the source for what it has, so the prototype's version of it is not sent.
  if (!production && snippet) {
    const fence = "```";
    lines.push("", `## The code${rows && last - line + 1 > MAX_LINES ? ` (the first ${MAX_LINES} lines; the file has the rest)` : ""}`, `${fence}tsx`, snippet, fence);
  } else if (!production) lines.push("", "The source couldn't be read here: open the file at the link above.");

  const colours = data.findings.filter((item) => item.rule === "colours" && item.decision && item.decision.action !== "exception" && item.where.some((place) => place.file === file && place.line >= line && place.line <= last));
  if (colours.length) {
    lines.push("", "## Colours");
    for (const item of colours) {
      const token = item.decision?.action === "add" ? item.decision.name : item.decision?.action === "pick" ? item.decision.candidate : item.candidates[0]?.name;
      lines.push(`- ${text(item.mine.value)} → ${item.decision?.action === "add" ? `new token \`${token}\`` : `\`${token}\``}`);
    }
  }
  const lift = data.lift.filter((item) => item.file === file && item.line >= line && item.line <= last);
  if (lift.length) {
    lines.push("", "## To wire up");
    for (const item of lift) lines.push(`- line ${item.line}: ${item.text.replace(/^TODO\(lift\):\s*/, "")}`);
  }
  lines.push("", "Everything else in the prototype is out of scope for this section.");
  return `${lines.join("\n")}\n`;
}

export { targetOf };
