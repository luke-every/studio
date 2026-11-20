import { encodeImage } from "@/lib/image";
import { plain } from "@/lib/section-box";

/**
 * Exporting a prototype's pictures: found on the screens as they are drawn, named from what is already there (the alt text, the file,
 * the copy section they sit in), and made at the scales asked for. Nothing is named by hand. Only images: not frames, shapes or icons drawn in SVG.
 */

/** A section of the prototype's copy: its name, and every line of it with where it sits in the copy (`productPage.hero.headline`). */
export type Section = { name: string; lines: { key: string; value: string }[] };

/** A page to look in, and what the screen it is on is called (a variant, or a step of the flow); empty when it isn't on a canvas. */
export type Page = { node: ParentNode; screen: string };

export type FoundImage = {
  /** Which picture on which screen: the same file on two screens is two images, as each screen gets its folder. */
  id: string;
  /** Where it is from, as a full address: two uses of one file on a screen are one image. */
  src: string;
  /** The name it is saved under, without a scale or an extension; unique within its folder. */
  name: string;
  /** The screen it is on, and the copy section it is in, as folder names; empty when it is in none. */
  screen: string;
  section: string;
  /** The largest it is drawn at, in the page's own pixels. */
  width: number;
  height: number;
  /** The picture's own width, when the page has already read it. */
  naturalWidth?: number;
  /** How the picture fills that box when it isn't stretched to it: cropped to cover it, or fitted inside it (`object-fit`, `background-size`). */
  fit?: "cover" | "contain";
  uses: number;
};

export type Scale = 1 | 2 | 3;
export type Format = "original" | "png" | "webp" | "jpeg";
export type Made = { path: string; blob: Blob; scale: number };

const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif" };
const FORMATS = { png: "image/png", webp: "image/webp", jpeg: "image/jpeg" } as const;

/** What a background says it draws: the address inside `url(...)`, or nothing for a gradient. */
const backgroundOf = (value: string) => value.match(/url\((['"]?)(.*?)\1\)/)?.[2] ?? "";
/** The largest picture a `srcset` offers ("a.jpg 640w, b.jpg 1280w", or 1x and 2x); empty when it offers none. */
const largestOf = (srcset: string) =>
  srcset
    .split(/,\s+/)
    .map((candidate) => candidate.trim().split(/\s+/))
    .filter(([address]) => address)
    .sort((a, b) => (parseFloat(b[1] ?? "") || 1) - (parseFloat(a[1] ?? "") || 1))[0]?.[0] ?? "";
/** A file's own name in an address: the last part of it that has an extension (an image service adds `/m/600x600` after it), else the last part. */
const fileOf = (address: URL) => {
  const parts = address.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  return (parts.findLast((part) => /\.[a-z0-9]{2,5}$/i.test(part)) ?? parts.at(-1) ?? "").replace(/\.[a-z0-9]+$/i, "");
};
/** The parts of a page that are a place without any copy of their own, by their tag. */
const LANDMARKS: Record<string, string> = { header: "header", footer: "footer", nav: "navigation" };
/** "mealsHeadline" as "meals headline"; a place in a list counted from one. */
const partWords = (part: string) => (/^\d+$/.test(part) ? String(Number(part) + 1) : part.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));

/** The folder a picture is saved in, inside the export's own: its screen, then its section. */
export const folderOf = (image: Pick<FoundImage, "screen" | "section">) => [image.screen, image.section].filter(Boolean).join("/");

/**
 * Every picture on the given pages (a loaded document, or a copy's shadow root), once each per screen, with where it is and how large it is drawn.
 *
 * Its section is read from the copy around it, not from where it is on the screen: the nearest element holding it that also holds lines of the copy
 * says, by whose lines they are. Where those lines are of several sections (the page's header, its footer, the page as a whole) it has no
 * section rather than a guess, unless it is in the page's header or footer, which it is then named for. A section whose lines are spread over separate parts of the page (a hero's words and the meals heading
 * under it, both written under `hero`) is a folder for each part, the first under the section's own name and the rest named for the line that begins them.
 */
export function findImages(pages: Page[], sections: Section[]): FoundImage[] {
  // Every line of the copy, by its words: the sections it is in, and what part of each (the name under the section's own, as `mealsHeadline` is under `productPage.hero`).
  const lines = new Map<string, { section: number; part: string }[]>();
  sections.forEach((section, index) => {
    const keys = section.lines.map((line) => line.key.split("."));
    let depth = 0;
    while (keys.length && depth < Math.min(...keys.map((key) => key.length)) - 1 && keys.every((key) => key[depth] === keys[0][depth])) depth++;
    for (const line of section.lines) {
      // One word ("Protein", "Excellent") is said in too many places on a page to tell which section it is.
      const words = plain(line.value);
      if (words.includes(" ")) lines.set(words, [...(lines.get(words) ?? []), { section: index, part: line.key.split(".")[depth] ?? "" }]);
    }
  });
  const longLines = [...lines.keys()].filter((words) => words.length >= 12);
  // A copy holding several pages (a product page and a landing page) says the same words in each: the page's own is the one most of its lines are from.
  const pageOf = (section: number) => sections[section].lines[0]?.key.split(".")[0] ?? "";

  const found = new Map<string, FoundImage & { stem: string }>();
  for (const { node: root, screen: screenName } of pages) {
    const screen = slug(screenName);
    const doc = (root as Node).ownerDocument ?? (root as Document);
    const view = doc.defaultView;

    // The copy as this page shows it: each piece of text that is a line (or holds a long one), with whose it is. Text that isn't drawn is left out.
    const marks: { node: Text; sections: { section: number; part: string }[] }[] = [];
    const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName) || !parent.getClientRects().length) continue;
      const text = plain(node.textContent ?? "");
      const words = lines.has(text) ? text : longLines.filter((line) => text.includes(line)).sort((a, b) => b.length - a.length)[0];
      if (words) marks.push({ node: node as Text, sections: lines.get(words)! });
    }
    const pageCount = new Map<string, number>();
    for (const mark of marks) for (const name of new Set(mark.sections.map((one) => pageOf(one.section)))) pageCount.set(name, (pageCount.get(name) ?? 0) + 1);
    const ownPage = [...pageCount].sort((a, b) => b[1] - a[1])[0]?.[0];
    // Each piece of text as one section's: of this page's copy where it is in both, and of none where it is still in two.
    const owned = marks.flatMap(({ node, sections: candidates }) => {
      const own = candidates.some((one) => pageOf(one.section) === ownPage) ? candidates.filter((one) => pageOf(one.section) === ownPage) : candidates;
      if (new Set(own.map((one) => one.section)).size !== 1) return [];
      return [{ node, section: own[0].section, part: own.length === 1 ? own[0].part : "" }];
    });

    /** The nearest element holding `element` that holds lines as well, and whose they are: one section's, or none when they are of several. */
    const homeOf = (element: Element) => {
      // Not the page as a whole: it holds everything, so it says nothing.
      for (let at: Element | null = element; at && at !== doc.body && at !== doc.documentElement && at !== root; at = at.parentElement) {
        const inside = owned.filter((one) => at!.contains(one.node));
        if (!inside.length) continue;
        const ownInside = inside.some((one) => pageOf(one.section) === ownPage) ? inside.filter((one) => pageOf(one.section) === ownPage) : inside;
        return ownInside.every((one) => one.section === ownInside[0].section) ? { element: at, section: ownInside[0].section } : null;
      }
      return null;
    };

    const onPage: { image: FoundImage & { stem: string }; home: { element: Element; section: number } | null }[] = [];
    for (const element of root.querySelectorAll<HTMLElement>("*")) {
      // By its tag, not `instanceof`: an element in a screen's frame belongs to that frame's own window, and is never an instance of this one's classes.
      const image = element.localName === "img" ? (element as HTMLImageElement) : null;
      // The largest file the page offers for it, not only the one this screen's density picked: an export at 2× wants the most there is.
      let source = image ? largestOf(image.getAttribute("srcset") ?? "") || image.currentSrc || image.src : backgroundOf(view?.getComputedStyle(element).backgroundImage ?? "");
      // Not drawn, or a pixel that counts visits rather than shows anything.
      if (!source || source.startsWith("data:") || element.offsetWidth < 4 || element.offsetHeight < 4) continue;
      // A picture whose file is missing draws nothing, so there is nothing to export.
      if (image?.complete && !image.naturalWidth) continue;
      let address: URL;
      try {
        address = new URL(source, doc.baseURI);
        // Next's image optimiser hands out its own address for a file: the file itself is what is exported, under its own name.
        const inner = address.pathname.endsWith("/_next/image") ? address.searchParams.get("url") : null;
        if (inner) address = new URL(inner, address);
        source = address.href;
      } catch {
        continue;
      }
      const id = `${screen}|${source}`;
      const before = found.get(id);
      if (before) {
        before.uses++;
        if (element.offsetWidth > before.width) Object.assign(before, { width: element.offsetWidth, height: element.offsetHeight });
        continue;
      }
      const stem = slug(image?.alt ?? "") || slug(fileOf(address)) || "image";
      const style = view?.getComputedStyle(element);
      const fitted = image ? style?.objectFit : style?.backgroundSize;
      const fit = fitted === "cover" || fitted === "contain" ? (fitted as "cover" | "contain") : undefined;
      const one = { id, src: source, stem, name: stem, screen, section: "", width: element.offsetWidth, height: element.offsetHeight, naturalWidth: image?.naturalWidth || undefined, fit, uses: 1 };
      found.set(id, one);
      // No section's words around it: the page's header or footer is still a place (its logo, its payment marks), where it is in one.
      const home = homeOf(element);
      if (!home) one.section = LANDMARKS[element.closest("header, footer, nav")?.localName ?? ""] ?? "";
      onPage.push({ image: one, home });
    }

    // One part of the page per section and place: a picture whose element sits inside another's of the same section (an icon in a row of the
    // section that also holds its photograph) is in that one's part. Each part is named for the first line in it whose part of the section is known.
    const parts = onPage.flatMap(({ home }) => (home ? [home] : []));
    const outermost = (home: { element: Element; section: number }) => parts.filter((one) => one.section === home.section && one.element.contains(home.element)).reduce((best, one) => (one.element.contains(best.element) ? one : best), home).element;
    const partNames = new Map<number, string[]>();
    const named = new Map<Element, string>();
    for (const { image, home } of onPage) {
      if (!home) continue;
      const element = outermost(home);
      if (!named.has(element)) {
        const part = owned.find((one) => one.section === home.section && one.part && element.contains(one.node))?.part ?? "";
        const seen = partNames.get(home.section) ?? [];
        if (!seen.includes(part)) seen.push(part);
        partNames.set(home.section, seen);
        // The first part of a section found on the page has the section's name; another is told apart by the line it begins with.
        named.set(element, slug(seen.indexOf(part) === 0 ? sections[home.section].name : `${sections[home.section].name} ${partWords(part)}`));
      }
      image.section = named.get(element)!;
    }
  }
  // Two pictures that would be named alike are told apart by a number, in the order they were found.
  const taken = new Set<string>();
  return [...found.values()].map(({ stem, ...one }) => {
    let name = stem;
    for (let count = 2; taken.has(`${folderOf(one)}/${name}`); count++) name = `${stem}-${count}`;
    taken.add(`${folderOf(one)}/${name}`);
    return { ...one, name };
  });
}

/** A screen of the prototype, by name, and the address that opens it (as the canvas opens it). */
export type ScreenToRead = { name: string; src: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One page's pictures, read from its own window: scrolled through a screen at a time, so what a page draws as it is reached is drawn, then back to
 * the top, let settle, and read. Here for a frame this page can look into, and inside a live page for one it can't (see `comment-bridge.ts`).
 */
export async function readPage(view: Window, screen: string, sections: Section[], height: number) {
  const doc = view.document;
  await doc.fonts?.ready;
  for (let top = 0; top < doc.documentElement.scrollHeight; top += height) {
    view.scrollTo({ top, behavior: "instant" });
    await wait(120);
  }
  view.scrollTo({ top: 0, behavior: "instant" });
  await wait(1000);
  return findImages([{ node: doc, screen }], sections);
}

/**
 * A live version's page, on its own dev server, is on another address, so this page can't look into its frame. It is asked instead, as comments and
 * edits ask it: the page loads the studio's bridge when the studio says so (its `studio-comments.ts`) and answers with what `readPage` finds there.
 * Null when it never answers (a prototype without the helper), or once `stop` is called.
 */
function askPage(frame: HTMLIFrameElement, screen: string, sections: Section[], height: number) {
  const id = `images-${Math.random().toString(36).slice(2)}`;
  let stop = () => {};
  const answer = new Promise<FoundImage[] | null>((resolve) => {
    let asked = false;
    const finish = (value: FoundImage[] | null) => {
      window.removeEventListener("message", hear);
      window.clearTimeout(timer);
      resolve(value);
    };
    const hear = (event: MessageEvent) => {
      const page = frame.contentWindow;
      if (!page || event.source !== page) return;
      const type = event.data?.type;
      if (type === "studio:comments:here") page.postMessage({ type: "studio:comments:load" }, event.origin);
      else if (type === "studio:comments:ready" && !asked) {
        asked = true;
        page.postMessage({ type: "studio:comments:ask", what: "images", id, screen, sections, height }, event.origin);
      } else if (type === "studio:comments:answer" && event.data.id === id) finish(Array.isArray(event.data.value) ? event.data.value : null);
    };
    window.addEventListener("message", hear);
    // Long enough for a dev server to build the page the first time it is asked for, and for the page to be scrolled through.
    const timer = window.setTimeout(() => finish(null), 60000);
    stop = () => finish(null);
  });
  return { answer, stop };
}

/**
 * Every picture on every screen of the prototype, whichever of them are on screen: each screen is opened in an unseen frame the device's size (a few at a
 * time) and read (see `readPage`), from here when the frame is on this address and by the page itself when it is a live version's (see `askPage`). A screen
 * that answers neither way is counted, not read. One screen alone is not given a folder of its own; with several, each is named for its screen, told apart
 * by a number when two are named alike.
 */
export async function findAllImages(screens: ScreenToRead[], sections: Section[], device: { width: number; height: number }, onProgress?: (done: number, total: number) => void): Promise<{ images: FoundImage[]; unreadable: number }> {
  const names = new Map<string, number>();
  const labelled = screens.map((one) => {
    const base = slug(one.name) || "screen";
    const count = (names.get(base) ?? 0) + 1;
    names.set(base, count);
    return { ...one, label: screens.length === 1 ? "" : count === 1 ? one.name : `${one.name} ${count}` };
  });
  const found: FoundImage[][] = labelled.map(() => []);
  let unreadable = 0;
  let done = 0;
  let next = 0;
  const work = async () => {
    for (let index = next++; index < labelled.length; index = next++) {
      const frame = document.createElement("iframe");
      // The device's own size, so a page sized by the screen (a hero of 100vh) is drawn as it is on the phone; in the window but unseen, as a frame
      // off it never loads its lazy pictures, nor sees what is scrolled to.
      frame.style.cssText = `position:fixed;left:0;top:0;width:${device.width}px;height:${device.height}px;border:0;opacity:0;pointer-events:none;z-index:-1`;
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      // Listening before the page loads: a live page says it is there as soon as it runs.
      const asked = askPage(frame, labelled[index].label, sections, device.height);
      document.body.appendChild(frame);
      try {
        const loaded = await new Promise<boolean>((resolve) => {
          const timer = window.setTimeout(() => resolve(false), 20000);
          frame.onload = () => {
            window.clearTimeout(timer);
            resolve(true);
          };
          frame.src = labelled[index].src;
        });
        let doc: Document | null = null;
        try {
          doc = frame.contentDocument;
        } catch {}
        const images = !loaded ? null : doc?.body && frame.contentWindow ? await readPage(frame.contentWindow, labelled[index].label, sections, device.height) : await asked.answer;
        if (images) found[index] = images;
        else unreadable++;
      } catch {
        unreadable++;
      } finally {
        asked.stop();
        frame.remove();
        onProgress?.(++done, labelled.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, labelled.length) }, work));
  return { images: found.flat(), unreadable };
}

/**
 * One picture at each scale, exactly as many pixels across as it is drawn at times the scale: made smaller when the file has more than that, and scaled up
 * when it has fewer (a 1× file asked for at 2×). Its own file is kept when it has exactly that and no other format is asked for. A vector, an animation, or
 * a file the browser can't read is saved once, as it is.
 */
export async function makeImage(image: FoundImage, scales: Scale[], format: Format): Promise<Made[]> {
  // Straight from where it is when that host lets this page read it; through the studio when it doesn't (see the export route's GET).
  const direct = await fetch(image.src).catch(() => null);
  const response = direct?.ok ? direct : await fetch(`/api/export-images?src=${encodeURIComponent(image.src)}`);
  if (!response.ok) throw new Error(`Couldn't read ${image.name}.`);
  const original = await response.blob();
  const type = original.type || "image/png";
  const asIs = (scale: number, blob: Blob = original): Made => ({ path: `${folderOf(image) ? `${folderOf(image)}/` : ""}${image.name}${scale === 1 ? "" : `@${scale}x`}.${EXTENSIONS[blob.type || type] ?? "png"}`, blob, scale });
  if (/^image\/(svg\+xml|gif)$/.test(type)) return [{ ...asIs(1), path: `${folderOf(image) ? `${folderOf(image)}/` : ""}${image.name}.${EXTENSIONS[type]}` }];
  const bitmap = await createImageBitmap(original).catch(() => null);
  if (!bitmap) return [asIs(1)];
  const [width, height] = [bitmap.width, bitmap.height];
  bitmap.close();
  const made: Made[] = [];
  for (const scale of scales) {
    // As wide as the file is drawn: the box's width, unless it is cropped to cover the box or fitted inside it, when the box's other side may set it.
    const [across, down] = [image.width / width, image.height / height];
    const wanted = Math.round(width * (image.fit === "cover" ? Math.max(across, down) : image.fit === "contain" ? Math.min(across, down) : across) * scale);
    // Exactly the size for this scale: the file itself when it already is, otherwise made at that size (smaller or larger).
    if (wanted === width && format === "original") made.push(asIs(scale));
    else made.push(await recode(asIs(scale), original, format, Math.round(Math.max(width, height) * (wanted / width))));
  }
  return made;

  async function recode(base: Made, source: Blob, to: Format, maxSide: number): Promise<Made> {
    const as = to === "original" ? (type === "image/jpeg" || type === "image/webp" ? type : "image/png") : FORMATS[to];
    const { blob } = await encodeImage(source, { maxSide, enlarge: true, maxBytes: Infinity, type: as as (typeof FORMATS)[keyof typeof FORMATS], quality: 0.92 });
    return { ...base, blob, path: base.path.replace(/\.[a-z0-9]+$/i, `.${EXTENSIONS[blob.type] ?? "png"}`) };
  }
}
