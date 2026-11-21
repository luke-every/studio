/**
 * Style changes, as the classes an engineer would write for them (team-conventions: conventions.md). Pure, so it can be tried on its own.
 *
 *  - Spacing and sizes are the Tailwind scale (`gap-6`), arbitrary only off it (`gap-[22px]`).
 *  - Colour is the design system's tokens (`bg-dark`, `border-light-grey-2`, `bg-dark/10`), never a hex value; a colour that is not a token is not written.
 *  - Type size, line-height and letter-spacing go together: letter-spacing is always −2% of the size.
 *  - Mobile-first: a change made on a frame as wide as the desktop breakpoint is an `lg:` class, on one as wide as the middle breakpoint an `md:` class, and on any
 *    narrower the base class, so a change on one width is not a change on the others. `sm:` and `xl:` are never written.
 */

export type Colour = { name: string; value: string };
export type Context = { colours: Colour[]; /** The width of the frame the change was made on. */ at?: number };

/** The widths from which `lg:` applies. */
export const DESKTOP = 1024;
/** The widths from which `md:` applies. */
export const TABLET = 768;

/** The class prefix for a change made on a frame this wide: none for the base (mobile) class. */
export const variantAt = (width?: number) => (width === undefined ? "" : width >= DESKTOP ? "lg:" : width >= TABLET ? "md:" : "");
/** The narrowest frame a change made on a frame this wide shows on: what it is written for applies from there up. */
export const showsFrom = (width?: number) => (width === undefined ? 0 : width >= DESKTOP ? DESKTOP : width >= TABLET ? TABLET : 0);

type Rule = { drop: (name: string) => boolean; add: string[] };
type Made = Rule | { why: string };

const SIDES = { top: "t", right: "r", bottom: "b", left: "l" } as const;
const SIZE_NAMES: Record<number, string> = { 12: "xs", 14: "sm", 16: "base", 18: "lg", 20: "xl", 24: "2xl", 30: "3xl", 36: "4xl", 48: "5xl", 60: "6xl" };
const RADIUS_NAMES: Record<number, string> = { 2: "xs", 4: "sm", 6: "md", 8: "lg", 12: "xl", 16: "2xl", 24: "3xl", 32: "4xl" };
const WEIGHTS: Record<string, string> = { "100": "thin", "200": "extralight", "300": "light", "400": "normal", "500": "medium", "600": "semibold", "700": "bold", "800": "extrabold", "900": "black" };

const clean = (number: number) => String(Math.round(number * 100) / 100);
/** Text that can sit inside `[...]` in a class. */
const arbitrary = (text: string) => {
  const value = text.trim().replace(/\s+/g, "_");
  return /^[^[\]{};<>'"`\\]+$/.test(value) ? value : null;
};

type Length = { px: number } | { keyword: string } | { percent: number } | null;
/** A length as the panel and the page say it: pixels, rem, a step of the spacing scale, a percentage, or a keyword. */
function lengthOf(text: string): Length {
  const value = text.trim();
  const scale = /^calc\(\s*var\(--spacing\)\s*\*\s*(-?[\d.]+)\s*\)$/.exec(value);
  if (scale) return { px: parseFloat(scale[1]) * 4 };
  const px = /^(-?[\d.]+)px$/.exec(value);
  if (px) return { px: parseFloat(px[1]) };
  const rem = /^(-?[\d.]+)rem$/.exec(value);
  if (rem) return { px: parseFloat(rem[1]) * 16 };
  if (/^-?0$/.test(value)) return { px: 0 };
  const percent = /^(-?[\d.]+)%$/.exec(value);
  if (percent) return { percent: parseFloat(percent[1]) };
  return /^[a-z-]+$/.test(value) ? { keyword: value } : null;
}

/** Pixels on the spacing scale (4px a step, halves allowed) as the step, else null. */
const step = (px: number) => (Math.abs(px) % 2 === 0 ? clean(Math.abs(px) / 4) : null);

/** `prefix` and a length: on the scale where it is, else arbitrary. */
function spaced(prefix: string, value: string, family: RegExp, { negative = false, words = {} as Record<string, string> } = {}): Made {
  const length = lengthOf(value);
  if (!length) return { why: `${value} isn't a length the studio can write.` };
  const drop = (name: string) => family.test(name);
  if ("keyword" in length) return words[length.keyword] ? { drop, add: [`${prefix}-${words[length.keyword]}`] } : { why: `${value} isn't a length the studio can write.` };
  if ("percent" in length) {
    const fractions: Record<number, string> = { 50: "1/2", 100: "full" };
    return { drop, add: [`${prefix}-${fractions[length.percent] ?? `[${clean(length.percent)}%]`}`] };
  }
  const sign = negative && length.px < 0 ? "-" : "";
  const at = step(length.px);
  return { drop, add: [at !== null ? `${sign}${prefix}-${at}` : `${sign}${prefix}-[${clean(Math.abs(length.px))}px]`] };
}

function parseColour(text: string): { r: number; g: number; b: number; a: number } | null {
  const value = text.trim().toLowerCase();
  const hex = /^#([\da-f]{3,8})$/.exec(value);
  if (hex) {
    const h = hex[1].length === 3 || hex[1].length === 4 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return { r: Math.round(+fn[1]), g: Math.round(+fn[2]), b: Math.round(+fn[3]), a: alpha };
  }
  return null;
}

/** A colour as a token class: `bg-dark`, `bg-dark/10`. Only the design system's colours are written. */
function coloured(prefix: string, value: string, family: (name: string) => boolean, ctx: Context): Made {
  const drop = (name: string) => family(name);
  const text = value.trim();
  const named = /^var\(--color-([\w-]+)\)$/.exec(text);
  if (named) return ctx.colours.some((token) => token.name === named[1]) || !ctx.colours.length ? { drop, add: [`${prefix}-${named[1]}`] } : { why: `${named[1]} isn't one of the design system's colours.` };
  if (text === "transparent") return { drop, add: [`${prefix}-transparent`] };
  if (text.toLowerCase() === "currentcolor") return { drop, add: [`${prefix}-current`] };
  const colour = parseColour(text);
  if (!colour) return { why: `${text} isn't a colour the studio can write.` };
  if (colour.a === 0) return { drop, add: [`${prefix}-transparent`] };
  const token = ctx.colours.find((one) => {
    const other = parseColour(one.value);
    return other && other.r === colour.r && other.g === colour.g && other.b === colour.b;
  });
  if (!token) return { why: "That colour isn't one of the design system's colours, and prototypes use its tokens only. Pick one from the tokens." };
  return { drop, add: [colour.a < 1 ? `${prefix}-${token.name}/${Math.round(colour.a * 100)}` : `${prefix}-${token.name}`] };
}

const NOT_TEXT_COLOUR = /^text-(xs|sm|base|lg|xl|\dxl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\[\d)/;
const NOT_BG_COLOUR = /^bg-(gradient|none$|cover$|contain$|center$|top$|bottom$|left$|right$|repeat|no-repeat$|fixed$|local$|scroll$|clip|origin|blend|linear|radial|conic|\[url|\[length|\[position)/;
const BORDER_NOT_COLOUR = /^border(-(0|2|4|8|x|y|t|r|b|l|s|e)(-\d+)?|-(solid|dashed|dotted|double|hidden|none|collapse|separate|spacing.*)|-\[\d.*)?$/;

/** What one property is as classes. `null` for nothing to write (a property let go of is handled before this). */
function made(property: string, value: string, ctx: Context): Made {
  const side = /^(padding|margin)-(top|right|bottom|left)$/.exec(property);
  if (side) {
    const key = `${side[1] === "padding" ? "p" : "m"}${SIDES[side[2] as keyof typeof SIDES]}`;
    return spaced(key, value, new RegExp(`^-?${key}-`), { negative: side[1] === "margin", words: { auto: "auto" } });
  }
  switch (property) {
    case "gap":
      return spaced("gap", value, /^gap-(?![xy]-)/);
    case "row-gap":
      return spaced("gap-y", value, /^gap-y-/);
    case "column-gap":
      return spaced("gap-x", value, /^gap-x-/);
    case "padding":
      return spaced("p", value, /^p[xytrbl]?-/);
    case "margin":
      return spaced("m", value, /^-?m[xytrbl]?-/, { negative: true, words: { auto: "auto" } });
    case "width":
      return spaced("w", value, /^w-/, { words: { auto: "auto", "fit-content": "fit", "max-content": "max", "min-content": "min" } });
    case "height":
      return spaced("h", value, /^h-/, { words: { auto: "auto", "fit-content": "fit", "max-content": "max", "min-content": "min" } });
    case "min-width":
      return spaced("min-w", value, /^min-w-/, { words: { auto: "auto" } });
    case "max-width":
      return spaced("max-w", value, /^max-w-/, { words: { none: "none" } });
    case "min-height":
      return spaced("min-h", value, /^min-h-/, { words: { auto: "auto" } });
    case "max-height":
      return spaced("max-h", value, /^max-h-/, { words: { none: "none" } });
    case "border-radius": {
      const drop = (name: string) => /^rounded(-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\[.*\]))?$/.test(name);
      const token = /^var\(--radius-([\w-]+)\)$/.exec(value.trim());
      if (token) return { drop, add: [`rounded-${token[1]}`] };
      const length = lengthOf(value);
      if (!length || !("px" in length)) return { why: `${value} isn't a radius the studio can write.` };
      if (length.px === 0) return { drop, add: ["rounded-none"] };
      if (length.px >= 9999) return { drop, add: ["rounded-full"] };
      return { drop, add: [RADIUS_NAMES[length.px] ? `rounded-${RADIUS_NAMES[length.px]}` : `rounded-[${clean(length.px)}px]`] };
    }
    case "opacity": {
      const level = parseFloat(value);
      return Number.isFinite(level) ? { drop: (name) => /^opacity-/.test(name), add: [`opacity-${Math.round(level * 100)}`] } : { why: `${value} isn't an opacity.` };
    }
    case "font-size": {
      const length = lengthOf(value);
      if (!length || !("px" in length) || length.px <= 0) return { why: `${value} isn't a type size the studio can write.` };
      // Letter-spacing is −2% of the size, whatever the size is.
      return {
        drop: (name) => /^text-(xs|sm|base|lg|xl|\dxl|\[\d[^\]]*\])$/.test(name) || /^tracking-/.test(name),
        add: [SIZE_NAMES[length.px] ? `text-${SIZE_NAMES[length.px]}` : `text-[${clean(length.px)}px]`, `tracking-[${clean(-0.02 * length.px)}px]`],
      };
    }
    case "line-height": {
      const length = lengthOf(value);
      if (length && "px" in length) return { drop: (name) => /^leading-/.test(name), add: [`leading-[${clean(length.px)}px]`] };
      return /^[\d.]+$/.test(value.trim()) ? { drop: (name) => /^leading-/.test(name), add: [`leading-[${clean(parseFloat(value))}]`] } : { why: `${value} isn't a line height the studio can write.` };
    }
    case "letter-spacing": {
      const length = lengthOf(value);
      return length && "px" in length ? { drop: (name) => /^tracking-/.test(name), add: [`tracking-[${clean(length.px)}px]`] } : { why: `${value} isn't a letter spacing the studio can write.` };
    }
    case "font-weight":
      return WEIGHTS[value.trim()] ? { drop: (name) => /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])$/.test(name), add: [`font-${WEIGHTS[value.trim()]}`] } : { why: `${value} isn't a weight the studio can write.` };
    case "font-family": {
      const drop = (name: string) => /^font-(sans|serif|mono|book|book-italic)$/.test(name);
      if (/marist/i.test(value)) return { drop, add: [/italic/i.test(value) ? "font-book-italic" : "font-book"] };
      if (/diatype/i.test(value)) return { drop, add: ["font-sans"] };
      return { why: "Only the design system's two fonts are written." };
    }
    case "color":
      return coloured("text", value, (name) => /^text-/.test(name) && !NOT_TEXT_COLOUR.test(name), ctx);
    case "background-color":
      return coloured("bg", value, (name) => /^bg-/.test(name) && !NOT_BG_COLOUR.test(name), ctx);
    case "border-color":
      return coloured("border", value, (name) => /^border-/.test(name) && !BORDER_NOT_COLOUR.test(name), ctx);
    case "border": {
      const dropWidth = (name: string) => /^border(-(0|2|4|8|\[\d[^\]]*\]))?$/.test(name);
      const dropStyle = (name: string) => /^border-(solid|dashed|dotted|double|hidden|none)$/.test(name);
      const dropColour = (name: string) => /^border-/.test(name) && !BORDER_NOT_COLOUR.test(name);
      const drop = (name: string) => dropWidth(name) || dropStyle(name) || dropColour(name);
      if (value.trim() === "none" || /^0(px)?\b/.test(value.trim())) return { drop, add: ["border-0"] };
      const parts = /^([\d.]+)px\s+(solid|dashed|dotted|double)\s+(.+)$/.exec(value.trim());
      if (!parts) return { why: `${value} isn't a border the studio can write.` };
      const width = parseFloat(parts[1]);
      const colour = coloured("border", parts[3], dropColour, ctx);
      if ("why" in colour) return colour;
      return { drop, add: [width === 1 ? "border" : [2, 4, 8].includes(width) ? `border-${width}` : `border-[${clean(width)}px]`, ...(parts[2] === "solid" ? [] : [`border-${parts[2]}`]), ...colour.add] };
    }
    case "box-shadow": {
      const drop = (name: string) => /^shadow(-(none|2xs|xs|sm|md|lg|xl|2xl|\[.*\]))?$/.test(name);
      if (value.trim() === "none") return { drop, add: ["shadow-none"] };
      const text = arbitrary(value);
      return text ? { drop, add: [`shadow-[${text}]`] } : { why: "That shadow can't be written as a class." };
    }
    case "filter":
    case "backdrop-filter": {
      const back = property === "backdrop-filter";
      const drop = (name: string) => new RegExp(`^${back ? "backdrop-" : ""}blur(-|$)`).test(name);
      if (value.trim() === "none") return { drop, add: [] };
      const blur = /^blur\(([\d.]+)px\)$/.exec(value.trim());
      return blur ? { drop, add: [`${back ? "backdrop-" : ""}blur-[${blur[1]}px]`] } : { why: `${value} isn't a blur the studio can write.` };
    }
    case "text-align":
      return /^(left|center|right|justify)$/.test(value.trim()) ? { drop: (name) => /^text-(left|center|right|justify|start|end)$/.test(name), add: [`text-${value.trim()}`] } : { why: `${value} isn't an alignment the studio can write.` };
    case "flex-direction": {
      const named: Record<string, string> = { row: "flex-row", column: "flex-col", "row-reverse": "flex-row-reverse", "column-reverse": "flex-col-reverse" };
      return named[value.trim()] ? { drop: (name) => /^flex-(row|col)(-reverse)?$/.test(name), add: [named[value.trim()]] } : { why: `${value} isn't a direction the studio can write.` };
    }
    case "align-items": {
      const named: Record<string, string> = { "flex-start": "items-start", start: "items-start", center: "items-center", "flex-end": "items-end", end: "items-end", stretch: "items-stretch", baseline: "items-baseline" };
      return named[value.trim()] ? { drop: (name) => /^items-/.test(name), add: [named[value.trim()]] } : { why: `${value} isn't an alignment the studio can write.` };
    }
    case "justify-content": {
      const named: Record<string, string> = { "flex-start": "justify-start", start: "justify-start", center: "justify-center", "flex-end": "justify-end", end: "justify-end", "space-between": "justify-between", "space-around": "justify-around", "space-evenly": "justify-evenly" };
      return named[value.trim()] ? { drop: (name) => /^justify-(start|end|center|between|around|evenly|stretch|normal)$/.test(name), add: [named[value.trim()]] } : { why: `${value} isn't a spacing the studio can write.` };
    }
    case "display": {
      const named: Record<string, string> = { flex: "flex", grid: "grid", block: "block", "inline-flex": "inline-flex", "inline-block": "inline-block", none: "hidden" };
      return named[value.trim()] ? { drop: (name) => /^(flex|grid|block|inline|inline-block|inline-flex|inline-grid|hidden|contents)$/.test(name), add: [named[value.trim()]] } : { why: `${value} isn't a display the studio can write.` };
    }
    default:
      return { why: `${property} isn't one the studio writes to code yet.` };
  }
}

/** A class split into what comes before the class itself (`lg:`, `hover:`) and its name. */
const split = (text: string) => {
  const at = text.lastIndexOf(":");
  return { variant: text.slice(0, at + 1), name: text.slice(at + 1) };
};

/** Takes out of one piece of a class list the classes `drop` names (with this variant in front), keeping its spacing at the ends. */
function without(piece: string, variant: string, drop: (name: string) => boolean, last: boolean) {
  const lead = /^\s*/.exec(piece)![0];
  const trail = /\s*$/.exec(piece)![0];
  const kept = piece.split(/\s+/).filter((text) => {
    if (!text) return false;
    const { variant: given, name } = split(text);
    return given !== variant || !drop(name);
  });
  // A piece with nothing left still keeps one space, where it sat between a `${...}` and what follows; the last has nothing after it.
  return kept.length ? lead + kept.join(" ") + trail : last || !(lead || trail) ? "" : " ";
}

/**
 * The class list after the changes. It comes in pieces because a `className` written as a template literal has static text between its `${...}`: only the
 * static text is changed, and what is added goes at the start, in the first piece. A value that is empty is the property let go of: its classes go.
 */
export function restyle(pieces: string[], css: Record<string, string>, ctx: Context): { pieces: string[] } | { why: string } {
  const variant = variantAt(ctx.at);
  // The panel sets both gaps at once: that is one class, `gap`.
  const entries = { ...css };
  if (entries["column-gap"] !== undefined && entries["column-gap"] === entries["row-gap"]) {
    entries.gap = entries["column-gap"];
    delete entries["column-gap"];
    delete entries["row-gap"];
  }
  let list = [...pieces];
  for (const [property, value] of Object.entries(entries)) {
    const released = !value.trim() || (/gap$/.test(property) && value.trim() === "normal");
    const rule = released ? made(property, property === "opacity" ? "1" : "0px", ctx) : made(property, value, ctx);
    if ("why" in rule) {
      if (released) continue;
      return rule;
    }
    const already = rule.add.length > 0 && rule.add.every((cls) => list.some((piece) => piece.split(/\s+/).includes(variant + cls)));
    if (already) continue;
    list = list.map((piece, index) => without(piece, variant, rule.drop, list.length > 1 && index === list.length - 1));
    if (released) continue;
    const add = rule.add.map((cls) => variant + cls).join(" ");
    if (!add) continue;
    const first = list[0].trim();
    list[0] = list.length === 1 ? (first ? `${first} ${add}` : add) : `${first ? `${first} ` : ""}${add} `;
  }
  return { pieces: list.length === 1 ? [list[0].trim().replace(/\s+/g, " ")] : list };
}
