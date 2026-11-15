import { nameOf, text } from "@/components/handoff/words";
import type { Finding } from "@/lib/handoff";
import { isFind, type Find } from "@/lib/handoff-clip";
import type { PublicHandoff } from "@/lib/handoff-public";

/** One part of a handoff: how to find it in the page, and what it is. */
export type Part = { id: string; find: Find } & { name: string; finding?: Finding; kit?: NonNullable<PublicHandoff["kit"]>[number]; file: string };

/**
 * The parts of a handed-off version that can be found in its page, in the order to prefer when two describe the same
 * element: a whole component before a part of one (a part of a component is deeper, so a tap there finds it first anyway),
 * then the kit's.
 */
export function partsOf(data: PublicHandoff): Part[] {
  const fromFindings = data.findings
    .filter((finding) => finding.rule === "components" && isFind(finding.mine.find))
    .sort((a, b) => Number(!!a.mine.element) - Number(!!b.mine.element))
    .map((finding) => ({ id: finding.id, find: finding.mine.find as Find, name: nameOf(finding), finding, file: text(finding.mine.file) || finding.where[0]?.file }));
  const fromKit = data.kit.filter((item) => item.find).map((item) => ({ id: `kit:${item.file}`, find: item.find as Find, name: item.name, kit: item, file: item.file }));
  // More specific first within one element: more classes to match.
  return [...fromFindings, ...fromKit].sort((a, b) => b.find.classes.length - a.find.classes.length);
}

