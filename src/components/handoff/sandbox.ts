import type { Handoff } from "@/lib/handoff";

import type { Prop } from "./words";

/**
 * A design-system component drawn on its own, for a handoff to show beside the prototype's: a sandboxed frame (scripts
 * only, no address of its own, so it can't reach the studio) with React, Tailwind's in-browser build and the
 * prototype's own theme and fonts, running the component as the scanner compiled it (`module` on a candidate, see
 * scan.mjs) with example values for its props.
 *
 * It says what it drew, and where, by message: `{ type: "handoff:drawn", clip }`, or `{ type: "handoff:failed" }`
 * when the component can't be drawn (it throws, or draws nothing).
 */

// Exact versions, so a preview doesn't change under anyone.
const REACT = "https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js";
const REACT_DOM = "https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js";
const TAILWIND = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11/dist/index.global.js";

/** The width it is laid out at: a phone's, like the prototype it is compared with. */
export const SANDBOX_WIDTH = 390;

type Example = ["text", string] | ["number", number] | ["bool", boolean] | ["fn"] | ["list"] | ["node", string];

const capitalised = (name: string) => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** An example value for each prop it can make one for: short words, a number, the first option, off unless it opens something. */
export function examplesFor(props: Prop[]): Record<string, Example> {
  const examples: Record<string, Example> = {};
  for (const { name, type = "" } of props) {
    const t = type.trim();
    const literals = t.split("|").map((part) => part.trim());
    let example: Example | null = null;
    if (/ReactNode|ReactElement|JSX\.Element/.test(t)) example = ["node", name === "children" ? "Label" : capitalised(name)];
    else if (/=>/.test(t)) example = ["fn"];
    else if (/\[\]$|^Array</.test(t)) example = ["list"];
    else if (literals.length > 1 && literals.every((part) => /^["'].*["']$/.test(part))) example = ["text", literals[0].slice(1, -1)];
    else if (t === "string") {
      if (/href|url|link/i.test(name)) example = ["text", "#"];
      else if (/class/i.test(name)) example = null;
      else if (/value|price|amount|count|number/i.test(name)) example = ["text", "12"];
      else if (/symbol|unit/i.test(name)) example = ["text", "g"];
      else example = ["text", capitalised(name)];
    } else if (t === "number") example = ["number", 12];
    else if (t === "boolean") example = ["bool", /^(is)?(open|visible|shown?|active|selected|checked)$/i.test(name)];
    if (example) examples[name] = example;
  }
  return examples;
}

/** Safe inside a <script> or <style>: nothing in it can close the element early. */
const inScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * The frame's document. `fontBase` is where the prototype's files are served (its fonts are under it); `id` is sent
 * back with every message, so the studio knows which frame is talking.
 */
export function sandboxDocument({ module, name, props, theme, fontBase, id, width = SANDBOX_WIDTH }: { module: string; name: string; props: Prop[]; theme: Handoff["theme"]; fontBase: string; id: string; /** The width it is laid out at: a breakpoint's, where one is drawn. */ width?: number }) {
  const families = [...new Set((theme?.fonts ?? []).map((font) => font.variable))];
  const faces = (theme?.fonts ?? [])
    .map((font) => `@font-face{font-family:"hf${families.indexOf(font.variable)}";src:url(${JSON.stringify(new URL(font.file, fontBase).href)});font-weight:${Number(font.weight) || 400};font-style:${font.style === "italic" ? "italic" : "normal"};}`)
    .join("");
  const variables = families.map((variable, index) => `${variable}:"hf${index}";`).join("");
  // `@variant` at the top was early Tailwind 4's way of declaring one; the in-browser build only knows `@custom-variant`.
  const css = (theme?.css ?? "").replace(/^@variant\s/gm, "@custom-variant ");
  const data = { module, name, examples: examplesFor(props), id, width };

  return `<!doctype html><html><head><meta charset="utf-8">
<script src="${REACT}"></script><script src="${REACT_DOM}"></script><script src="${TAILWIND}"></script>
<style>${faces}:root{${variables}}html,body{margin:0;background:transparent}#root{width:${width}px;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start}</style>
<style type="text/tailwindcss">${css.replace(/<\/style/gi, "<\\/style")}</style>
</head><body><div id="root"></div><script>
(function () {
  var data = ${inScript(data)};
  var told = false;
  function tell(message) { if (told) return; told = true; message.id = data.id; parent.postMessage(message, "*"); }
  function fail() { tell({ type: "handoff:failed" }); }
  try {
    var R = window.React, D = window.ReactDOM;
    if (!R || !D) return fail();
    var h = R.createElement;
    var icon = function (props) { return h("svg", { viewBox: "0 0 24 24", width: "1em", height: "1em", className: props && props.className, "aria-hidden": true }, h("circle", { cx: 12, cy: 12, r: 8, fill: "none", stroke: "currentColor", strokeWidth: 1.5 })); };
    var icons = new Proxy({}, { get: function (_, key) { return key === "__esModule" ? false : icon; } });
    var link = R.forwardRef(function (props, ref) {
      var rest = Object.assign({}, props); delete rest.prefetch; delete rest.replace; delete rest.scroll; delete rest.shallow; delete rest.locale;
      rest.href = typeof props.href === "string" ? props.href : "#"; rest.ref = ref;
      return h("a", rest);
    });
    var image = function (props) {
      var rest = Object.assign({}, props); ["fill", "priority", "sizes", "quality", "placeholder", "blurDataURL", "loader", "unoptimized"].forEach(function (key) { delete rest[key]; });
      rest.alt = props.alt || ""; rest.src = typeof props.src === "string" ? props.src : props.src && props.src.src;
      if (props.fill) rest.style = Object.assign({ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }, props.style);
      return h("img", rest);
    };
    var cx = function () { return Array.prototype.slice.call(arguments).flat(Infinity).map(function (part) { return part && typeof part === "object" ? Object.keys(part).filter(function (key) { return part[key]; }).join(" ") : part; }).filter(Boolean).join(" "); };
    var router = { push: function () {}, replace: function () {}, back: function () {}, forward: function () {}, refresh: function () {}, prefetch: function () {} };
    var navigation = { __esModule: true, usePathname: function () { return "/"; }, useRouter: function () { return router; }, useSearchParams: function () { return new URLSearchParams(); }, useParams: function () { return {}; }, notFound: function () {}, redirect: function () {} };
    var dynamic = function (loader) {
      var Lazy = R.lazy(function () { return Promise.resolve(loader()).then(function (m) { return m && m.default ? m : { default: m }; }); });
      return function Dynamic(props) { return h(R.Suspense, { fallback: null }, h(Lazy, props)); };
    };
    var controls = { __esModule: true, useControl: function () { return undefined; }, useEmbedded: function () { return true; }, setPlace: function () {} };
    var modules = { react: R, "react-dom": D, "next/navigation": navigation, "next/dynamic": { __esModule: true, default: dynamic }, "@/lib/studio-controls": controls, "next/link": { __esModule: true, default: link }, "next/image": { __esModule: true, default: image }, "@/components/icons": icons, clsx: { __esModule: true, default: cx, clsx: cx }, classnames: cx };
    var require = function (name) { if (name in modules) return modules[name]; throw new Error("Can't draw " + name); };
    var module = { exports: {} };
    new Function("require", "exports", "module", "React", data.module)(require, module.exports, module, R);
    var Component = module.exports[data.name] || module.exports.default;
    if (typeof Component !== "function" && typeof Component !== "object") return fail();

    var props = {};
    Object.keys(data.examples).forEach(function (key) {
      var example = data.examples[key];
      props[key] = example[0] === "fn" ? function () {} : example[0] === "list" ? [] : example[1];
    });
    var children = props.children; delete props.children;

    function Boundary(p) { R.Component.call(this, p); this.state = { failed: false }; }
    Boundary.prototype = Object.create(R.Component.prototype);
    Boundary.getDerivedStateFromError = function () { return { failed: true }; };
    Boundary.prototype.componentDidCatch = fail;
    Boundary.prototype.render = function () { return this.state.failed ? null : this.props.children; };

    var root = document.getElementById("root");
    D.createRoot(root).render(h(Boundary, null, h(Component, props, children)));

    // Measured once it is drawn, styled (Tailwind writes its CSS a moment after the markup) and in its fonts.
    var measure = function () {
      var boxes = Array.prototype.slice.call(root.children).concat(Array.prototype.slice.call(document.body.children).filter(function (el) { return el !== root && el.tagName !== "SCRIPT"; }))
        .map(function (el) { return el.getBoundingClientRect(); }).filter(function (r) { return r.width > 0 && r.height > 0; });
      if (!boxes.length) return fail();
      var left = Math.min.apply(null, boxes.map(function (r) { return r.left; })), top = Math.min.apply(null, boxes.map(function (r) { return r.top; }));
      var right = Math.max.apply(null, boxes.map(function (r) { return r.right; })), bottom = Math.max.apply(null, boxes.map(function (r) { return r.bottom; }));
      tell({ type: "handoff:drawn", clip: { left: left, top: top, width: right - left, height: bottom - top, viewWidth: window.innerWidth, viewHeight: window.innerHeight } });
    };
    var fonts = function () { return document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(); };
    setTimeout(function () { fonts().then(function () { setTimeout(measure, 100); }, measure); }, 300);
  } catch (error) {
    fail();
  }
})();
</script></body></html>`;
}
