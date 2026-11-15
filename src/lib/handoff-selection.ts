/**
 * What an engineer has picked in a handed-off version's canvas: a whole design (a frame), or a section of the code
 * that draws what they tapped in it. Either can be given to their agent as a brief of just that.
 */
export type Selection = { kind: "frame"; screenId: string } | { kind: "section"; file: string; line: number; endLine: number };

/** The target a brief is asked for, as it goes in a link: `design:<id>` or `src:<file>:<first line>-<last line>`. */
export function targetOf(selection: Selection) {
  return selection.kind === "frame" ? `design:${selection.screenId}` : `src:${selection.file}:${selection.line}-${selection.endLine}`;
}

export function parseTarget(target: string): Selection | null {
  const design = target.match(/^design:(.+)$/);
  if (design) return { kind: "frame", screenId: design[1] };
  const section = target.match(/^src:(.+):(\d+)-(\d+)$/);
  return section ? { kind: "section", file: section[1], line: Number(section[2]), endLine: Number(section[3]) } : null;
}
