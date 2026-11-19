/**
 * The tables of a Claude doc as the doc connector gives it (an XML of paragraphs, tables, rows and cells), read down to their lines of cells, with no model in
 * between; `rowsFromTable` (see `copy-import.ts`) takes them from there, as it does a paste of the doc. A section is the heading above its table.
 */
export type DocTable = { section: string; lines: string[][] };
type Node = { tag: string; attrs: string; children: (Node | string)[] };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|apos);|&#(\d+);/g, (entity, code) => (code ? String.fromCodePoint(Number(code)) : ENTITIES[entity]));

function parse(xml: string): Node {
  const root: Node = { tag: "", attrs: "", children: [] };
  const stack = [root];
  for (const found of xml.matchAll(/<(\/?)([A-Za-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g)) {
    const [, closing, tag, attrs, selfClosed, text] = found;
    const top = stack[stack.length - 1];
    if (text !== undefined) top.children.push(decode(text));
    else if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      const node: Node = { tag, attrs, children: [] };
      top.children.push(node);
      if (!selfClosed) stack.push(node);
    }
  }
  return root;
}

/** The words in a node: the pieces of a paragraph run on as they are, and the paragraphs in a cell (or any other node) are told apart by a space. */
const textOf = (node: Node | string): string => (typeof node === "string" ? node : node.children.map(textOf).join(node.tag === "cell" || node.tag === "doc" ? " " : ""));
const clean = (text: string) => text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** Every table in `xml`, in order. Several pieces of one document (a long one is given in parts) are read one after another. */
export function tablesFromDocXml(...pieces: string[]): DocTable[] {
  const tables: DocTable[] = [];
  for (const piece of pieces) {
    let section = "";
    const walk = (node: Node) => {
      for (const child of node.children) {
        if (typeof child === "string") continue;
        if (child.tag === "paragraph" && /heading=/.test(child.attrs)) section = clean(textOf(child)).replace(/^\d+\.\s*/, "");
        else if (child.tag === "table") {
          const lines = child.children.filter((one): one is Node => typeof one !== "string" && one.tag === "row").map((row) => row.children.filter((one): one is Node => typeof one !== "string" && one.tag === "cell").map((cell) => clean(textOf(cell))));
          tables.push({ section, lines });
        } else walk(child);
      }
    };
    walk(parse(piece));
  }
  return tables;
}
