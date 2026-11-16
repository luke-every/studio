import { z } from "zod";

/**
 * A handoff: what one version of a prototype hands to engineering.
 *
 * /handoff scans the prototype's folder on the designer's machine and saves the findings beside the version
 * (`handoff/<slug>/<version>.json`, see docs/registry.md). The designer decides each finding in the studio; once every
 * one is decided they sign it off, and the same file is the package an engineer (or their agent) reads. There is no
 * separate manifest: the findings plus their decisions are the package.
 *
 * Every rule writes the same finding shape, so a new rule adds findings and a preview, never a new screen. The rule's
 * own detail lives in `mine`, `candidates[]` and `proposed`, which are kept as the scanner wrote them.
 */

export const DECISION_ACTIONS = ["approve", "pick", "add", "exception", "extend", "new"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export const decisionSchema = z.object({
  /** approve: make the proposed change. pick: use `candidate` instead. add: add a colour as a token called `name`. exception (shown as Ignore): leave it out, `reason` optional. extend: use production's `candidate` and add what differs. new: a new component, not production's. */
  action: z.enum(DECISION_ACTIONS),
  candidate: z.string().max(200).optional(),
  name: z.string().max(80).optional(),
  reason: z.string().max(1000).optional(),
  by: z.string().max(80),
  at: z.string(),
});
export type Decision = z.infer<typeof decisionSchema>;

const where = z.object({
  file: z.string().max(500),
  line: z.number().int().min(0),
  selector: z.string().max(500).optional(),
  variants: z.array(z.string().max(80)).max(50).optional(),
});

const candidate = z
  .object({
    name: z.string().max(200),
    source: z.string().max(500),
    score: z.number(),
    differences: z.array(z.string().max(2000)).max(100).optional(),
  })
  .loose();

export const findingSchema = z.object({
  id: z.string().min(1).max(500),
  rule: z.string().max(40),
  kind: z.string().max(40),
  where: z.array(where).min(1).max(500),
  mine: z.record(z.string(), z.unknown()),
  candidates: z.array(candidate).max(20),
  tier: z.enum(["exact", "near", "none"]),
  proposed: z.object({ summary: z.string().max(2000) }).loose(),
  decision: decisionSchema.nullable(),
});
export type Finding = z.infer<typeof findingSchema>;

/**
 * A component the designer marked as new: a section of the prototype's own code, picked on the canvas, that engineering
 * has something to build. `find` is how to recognise it in the running page, and `screen` the design it was picked in,
 * so the canvas can draw it from there.
 */
export const markSchema = z.object({
  id: z.string().max(600),
  name: z.string().min(1).max(120),
  file: z.string().max(500),
  line: z.number().int(),
  endLine: z.number().int(),
  find: z.object({ tag: z.string().max(40).optional(), classes: z.array(z.string().max(200)).max(60), text: z.string().max(200).optional(), component: z.string().max(120).optional() }),
  screen: z.string().max(80),
  by: z.string().max(80),
  at: z.string(),
});
export type Mark = z.infer<typeof markSchema>;

export const handoffSchema = z.object({
  schema: z.literal(1),
  prototype: z.object({ slug: z.string(), version: z.string() }).nullable(),
  scannedAt: z.string(),
  scannedBy: z.string().max(80),
  designSystem: z
    .object({ repo: z.string().max(200), ref: z.string().max(200), sha: z.string().max(80), source: z.enum(["github", "local"]) })
    .loose(),
  scope: z.object({
    variants: z.array(z.object({ id: z.string().max(80), label: z.string().max(200), entries: z.array(z.string().max(500)).max(50) })).min(1).max(50),
    live: z.array(z.object({ file: z.string().max(500), role: z.string().max(40).optional(), variants: z.array(z.string().max(80)) })).max(5000),
    hashes: z.record(z.string(), z.string().max(80)).optional(),
    graph: z.record(z.string(), z.array(z.string().max(500)).max(500)).optional(),
    /** By file: [line, last line, tag, classes, first words] of each element the prototype's own components draw. */
    elements: z.record(z.string(), z.array(z.tuple([z.number(), z.number(), z.string(), z.string(), z.string()])).max(600)).optional(),
    dropped: z.array(z.string().max(500)).max(5000),
    designSystem: z.array(z.object({ name: z.string().max(200), file: z.string().max(500), usedBy: z.array(z.string().max(500)) })).max(1000),
  }),
  findings: z.array(findingSchema).max(2000),
  lift: z.array(z.object({ file: z.string().max(500), line: z.number().int(), text: z.string().max(2000) })).max(2000),
  /** Each variant's page, and what it is built from: where the design is put together, so not something to decide on. */
  pages: z
    .array(z.object({ file: z.string().max(500), name: z.string().max(200), variants: z.array(z.string().max(80)).max(50), builtFrom: z.array(z.object({ name: z.string().max(200), file: z.string().max(500), from: z.string().max(40), count: z.number().int(), importPath: z.string().max(500) }).loose()).max(50) }))
    .max(200)
    .optional(),
  /** The live files that are not as they were when this was scanned, as of the /push that carried it here: the handoff may no longer describe them. */
  changedSince: z.array(z.string().max(500)).max(2000).optional(),
  /** The components the designer marked as new, for the frame beside the flow. Kept through a scan. */
  marks: z.array(markSchema).max(200).optional(),
  /** The components a finding is "Built from", compiled to draw, by file: kept once however many findings use them. */
  modules: z.record(z.string(), z.string().max(250000)).optional(),
  /** What came with the prototype from the starter, a kit or a template, untouched: not reviewed, listed for engineering with how it differs from production's. */
  kit: z
    .array(
      z.object({
        name: z.string().max(200),
        file: z.string().max(500),
        production: z.string().max(500).optional(),
        kind: z.enum(["stand-in", "behind"]),
        similarity: z.number().optional(),
        addedProps: z.array(z.object({ name: z.string().max(200) }).loose()).max(100),
        removedProps: z.array(z.object({ name: z.string().max(200) }).loose()).max(100),
        find: z.object({ tag: z.string().max(40).optional(), classes: z.array(z.string().max(200)).max(60), text: z.string().max(200).optional() }).optional(),
      }),
    )
    .max(500)
    .optional(),
  /** Exact colours /handoff swapped for their token in the prototype's own files before the review (see scan.mjs `scanAndFix`). */
  fixed: z.array(z.object({ file: z.string().max(500), line: z.number().int(), from: z.string().max(500), to: z.string().max(500), value: z.string().max(80), token: z.string().max(200) })).max(2000).optional(),
  /** Exact colours it left as written, and why (in a file copied from production, not a colour class): engineering's to swap. */
  exact: z.array(z.object({ file: z.string().max(500), line: z.number().int(), from: z.string().max(500), token: z.string().max(200).optional(), why: z.string().max(200) })).max(2000).optional(),
  /** The prototype's look (its globals.css and local fonts), for drawing a design-system component beside its own. Older scans have none. */
  theme: z
    .object({
      css: z.string().max(100000),
      fonts: z.array(z.object({ variable: z.string().max(80), file: z.string().max(300), weight: z.string().max(10), style: z.string().max(20) })).max(40),
    })
    .optional(),
  /** What was last done to the prototype's code from the decisions, and where the files it replaced were copied first (see scan.mjs `applyDecisions`). */
  applied: z
    .object({
      at: z.string(),
      by: z.string().max(80),
      backup: z.string().max(1000),
      changed: z.array(z.object({ file: z.string().max(500), line: z.number().int(), what: z.string().max(500), find: z.object({ tag: z.string().max(40).optional(), classes: z.array(z.string().max(200)).max(60), text: z.string().max(200).optional(), component: z.string().max(120).optional() }).optional() })).max(2000),
      manual: z.array(z.object({ file: z.string().max(500).optional(), name: z.string().max(200).optional(), what: z.string().max(2000).optional() })).max(2000),
      left: z.array(z.object({ file: z.string().max(500), line: z.number().int(), from: z.string().max(500).optional(), why: z.string().max(300) })).max(2000),
      errors: z.array(z.string().max(500)).max(20),
    })
    .nullable()
    .optional(),
  /** `left`: how many findings were still undecided when it was signed off. They stay as they are. */
  signOff: z.object({ by: z.string().max(80), at: z.string(), left: z.number().int().optional() }).nullable(),
});
export type Handoff = z.infer<typeof handoffSchema>;

/** What a decision needs beyond its action: a candidate to pick, a name to add, a reason for an exception. Null when it is complete. */
export function decisionProblem(finding: Finding, decision: Pick<Decision, "action" | "candidate" | "name" | "reason">) {
  if (decision.action === "pick" && !finding.candidates.some((item) => item.name === decision.candidate)) return "Choose one of the matches.";
  if (decision.action === "add" && !decision.name?.trim()) return "Give it a name for the system.";
  return null;
}

export const undecided = (handoff: Handoff) => handoff.findings.filter((finding) => !finding.decision).length;
