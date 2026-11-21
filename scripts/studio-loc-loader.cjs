/* eslint-disable @typescript-eslint/no-require-imports */
// Put in a project by the studio (see tag-source.mjs). While the page is built in development, each element in the project's own files (under its src) is
// given `data-studio-loc`: the file, line and column it is written at. The files themselves are not changed, so what an engineer reads has none of it. The
// studio reads the mark off the element you pick, and so knows which line a change on the canvas belongs to. Production's files, which the project imports
// from outside its folder, are left alone: they have no mark, so nothing can be written to them.
const ts = require("typescript");
const { sep } = require("node:path");

// Filled in when this is put in a project: the absolute path of its src folder, and a separator.
const SRC = "__SRC__";

module.exports = function studioLoc(source) {
  const file = this.resourcePath;
  if (!file.startsWith(SRC) || file.includes(`${sep}node_modules${sep}`)) return source;
  const relative = `src/${file.slice(SRC.length).split(sep).join("/")}`;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const marks = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(sf);
      if (name !== "Fragment" && name !== "React.Fragment") {
        const at = sf.getLineAndCharacterOfPosition(node.tagName.getStart(sf));
        // After the type arguments, when it has them: <Foo<T> ...>
        const pos = node.typeArguments ? node.typeArguments.end + 1 : node.tagName.end;
        marks.push({ pos, text: ` data-studio-loc="${relative}:${at.line + 1}:${at.character + 1}"` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let out = source;
  for (const mark of marks.sort((a, b) => b.pos - a.pos)) out = out.slice(0, mark.pos) + mark.text + out.slice(mark.pos);
  return out;
};
