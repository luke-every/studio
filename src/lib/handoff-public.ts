import type { Finding, Handoff } from "@/lib/handoff";
import type { SourceEl } from "@/lib/handoff-clip";

/**
 * What an engineer with only a share link is given of a handoff: the parts and what they are, none of the heavy
 * parts (compiled code to draw, source snippets, props lists) and nothing about who reviewed what beyond the sign-off.
 * Only a handoff that has been signed off (marked Ready for dev) is given at all.
 */
/** A component the designer decided is new, or extends production's: drawn on the canvas, so unlike the rest it comes with its compiled code. */
export type PublicComponent = { id: string; name: string; action: "new" | "extend"; /** What it extends, for one that does. */ extends?: string; module: string; props: { name: string; optional?: boolean; type?: string }[] };

export type PublicHandoff = {
  ready: boolean;
  /** Not signed off yet: given only to the designer, who sees what engineers will, but whose link and brief don't open until it is. */
  preview?: boolean;
  signedBy?: string;
  signedAt?: string;
  variants: string[];
  findings: Finding[];
  kit: NonNullable<Handoff["kit"]>;
  pages: NonNullable<Handoff["pages"]>;
  lift: Handoff["lift"];
  /** Each live file's role, and which live files it imports: for working out what a part pulls in. */
  files: Record<string, string>;
  graph: Record<string, string[]>;
  /** What an element picked in the page is matched to, to say which lines of which file draw it. */
  elements: SourceEl[];
  changedSince?: string[];
  designSystem?: { repo: string; sha: string };
  /** The new and extended components, for the frame beside the flow, and the prototype's look to draw them in. */
  components: PublicComponent[];
  theme?: Handoff["theme"];
};

/**
 * The new and the extended components: what engineering has something to build for. New is what the designer called
 * new, or what the scanner found no production match for (new and reusable, or for one feature) and nobody has decided
 * otherwise; extended is what they chose to extend production's component with. Each component once.
 */
function componentsOf(handoff: Handoff): PublicComponent[] {
  const seen = new Set<string>();
  return handoff.findings.flatMap((finding) => {
    const action = finding.decision?.action;
    const code = finding.mine.module;
    const fresh = action === "new" || (!action && (finding.kind === "new-reusable" || finding.kind === "feature-only"));
    if (finding.rule !== "components" || (!fresh && action !== "extend") || typeof code !== "string" || !code) return [];
    const name = typeof finding.mine.name === "string" ? finding.mine.name : finding.id;
    if (seen.has(name)) return [];
    seen.add(name);
    const props = Array.isArray(finding.mine.props) ? (finding.mine.props as PublicComponent["props"]) : [];
    return [{ id: finding.id, name, action: fresh ? "new" : "extend", extends: fresh ? undefined : finding.decision?.candidate, module: code, props }];
  });
}

const without = <T extends Record<string, unknown>>(record: T, keys: string[]) => Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key))) as T;

export function publicHandoff(handoff: Handoff | null, { preview = false }: { preview?: boolean } = {}): PublicHandoff {
  if (!handoff || (!handoff.signOff && !preview)) return { ready: false, variants: [], findings: [], kit: [], pages: [], lift: [], files: {}, graph: {}, elements: [], components: [] };
  const lean = (record: Record<string, unknown>) => {
    const rest = without(record, ["code", "module", "props", "modules"]);
    if (Array.isArray(rest.builtFrom)) rest.builtFrom = rest.builtFrom.map((item) => without(item as Record<string, unknown>, ["props"]));
    return rest;
  };
  return {
    ready: true,
    preview: !handoff.signOff || undefined,
    signedBy: handoff.signOff?.by,
    signedAt: handoff.signOff?.at,
    variants: handoff.scope.variants.map((variant) => variant.id),
    findings: handoff.findings.map((finding) => ({ ...finding, mine: lean(finding.mine), candidates: finding.candidates.map((candidate) => lean(candidate) as Finding["candidates"][number]) })),
    kit: handoff.kit ?? [],
    pages: (handoff.pages ?? []).map((page) => ({ ...page, builtFrom: page.builtFrom.map((item) => without(item as Record<string, unknown>, ["props"]) as typeof item) })),
    lift: handoff.lift,
    files: Object.fromEntries(handoff.scope.live.map((item) => [item.file, item.role ?? ""])),
    graph: handoff.scope.graph ?? {},
    // The prototype's own elements, line by line; and the kit's components as wholes (their file is production's to use, not to read line by line).
    elements: [
      ...Object.entries(handoff.scope.elements ?? {}).flatMap(([file, rows]) => rows.map(([line, endLine, tag, classes, words]) => ({ file, line, endLine, find: { tag, classes: classes ? classes.split(" ") : [], ...(words ? { text: words } : {}) } }))),
      ...(handoff.kit ?? []).flatMap((item) => (item.find ? [{ file: item.file, line: 1, endLine: 9999, find: item.find }] : [])),
    ],
    changedSince: handoff.changedSince,
    designSystem: { repo: handoff.designSystem.repo, sha: handoff.designSystem.sha },
    components: componentsOf(handoff),
    theme: handoff.theme,
  };
}
