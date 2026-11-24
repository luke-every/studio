/**
 * A component's props as plain data, for drawing a copy of it somewhere else with what it has now (a fork on the canvas). Props are not all data:
 *
 *  - a function becomes `{ $fn: true }`, and the copy is given one that does nothing;
 *  - an element (what `children` is, or a prop holding markup) becomes a description of it, `{ $el, props, children }`: the component or tag, and what it was given,
 *    which the copy builds again;
 *  - a date becomes `{ $date }`;
 *  - anything that is not data (an instance of a class, a DOM node, a map) is left out, as is a cycle, and everything past a size that would not travel.
 *
 * `data-studio-loc`, the mark put on elements while the page is built, is never part of it.
 */
export type Plain = null | boolean | number | string | Plain[] | { [key: string]: Plain };

const ELEMENTS = [Symbol.for("react.element"), Symbol.for("react.transitional.element")];
const LAZY = Symbol.for("react.lazy");
const FRAGMENT = Symbol.for("react.fragment");
const DEPTH = 10;
/** About as much as is worth sending: past it, what remains is left out. */
const LIMIT = 300_000;

type Typed = { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } };

/** What a component or tag is called, as a description names it; null for what can't be named. */
export function nameOfType(type: unknown): string | null {
  if (typeof type === "string") return type;
  if (type === FRAGMENT) return "Fragment";
  if (typeof type === "function" || (typeof type === "object" && type)) {
    const named = type as Typed;
    return named.displayName || named.name || named.render?.name || named.type?.name || null;
  }
  return null;
}

export function plainOf(value: unknown, state = { size: 0 }, depth = 0, seen = new Set<unknown>()): Plain | undefined {
  if (state.size > LIMIT || depth > DEPTH) return undefined;
  if (value === null) return null;
  switch (typeof value) {
    case "string": {
      // The page marks each line of its copy file with invisible characters (see `edit-dom.ts`), so a change to the words can be written to that line. A copy drawn
      // from what was captured is not that line: the marks are left behind, or an edit of its words would be taken for an edit of the original's.
      const clean = value.replace(/\u2060[\u200c\u200d]{16}\u2060/g, "");
      state.size += clean.length + 2;
      return clean;
    }
    case "number":
      state.size += 8;
      return Number.isFinite(value) ? value : null;
    case "boolean":
      state.size += 5;
      return value;
    case "function":
      state.size += 12;
      return { $fn: true };
    case "object":
      break;
    default:
      return undefined;
  }
  const object = value as Record<string | symbol, unknown>;
  if (seen.has(object)) return undefined;
  if (object instanceof Date) return Number.isNaN(object.getTime()) ? null : { $date: object.toISOString() };
  seen.add(object);
  try {
    if (ELEMENTS.includes(object.$$typeof as symbol)) {
      const name = nameOfType(object.type);
      if (!name) return undefined;
      const { children, ...rest } = (object.props ?? {}) as Record<string, unknown>;
      const props = plainProps(rest, state, depth + 1, seen);
      const inside = children === undefined ? undefined : plainOf(children, state, depth + 1, seen);
      state.size += name.length + 16;
      return { $el: name, props, ...(inside === undefined ? {} : { children: inside }) };
    }
    // Markup that a server component made reaches the page as a lazy element. Once it has arrived, what it holds is read; one still on its way is left out.
    if (object.$$typeof === LAZY) {
      try {
        const init = object._init as ((payload: unknown) => unknown) | undefined;
        return init ? plainOf(init(object._payload), state, depth + 1, seen) : undefined;
      } catch {
        return undefined;
      }
    }
    // Any other React object (a memo, a context, a portal) is not data either.
    if (typeof object.$$typeof === "symbol") return undefined;
    if (Array.isArray(object)) {
      const list: Plain[] = [];
      for (const item of object) {
        if (state.size > LIMIT) break;
        const plain = plainOf(item, state, depth + 1, seen);
        // A hole in a list would move what follows, so what can't be said is a null in its place.
        list.push(plain === undefined ? null : plain);
      }
      return list;
    }
    // Only plain objects: an instance of a class, a map or a DOM node is not data.
    const proto = Object.getPrototypeOf(object);
    if (proto !== Object.prototype && proto !== null) return undefined;
    return plainProps(object, state, depth + 1, seen);
  } finally {
    seen.delete(object);
  }
}

/** An object's own properties as plain data, without the mark the page is built with and what React keeps on an element. */
function plainProps(props: Record<string | symbol, unknown>, state: { size: number }, depth: number, seen: Set<unknown>) {
  const out: { [key: string]: Plain } = {};
  for (const key of Object.keys(props)) {
    if (key === "data-studio-loc" || key === "key" || key === "ref") continue;
    const plain = plainOf(props[key], state, depth, seen);
    if (plain !== undefined) out[key] = plain;
  }
  return out;
}
