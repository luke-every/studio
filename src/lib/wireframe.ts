/**
 * Wireframe view: a presentation-layer pass over a prototype's own document.
 *
 * The prototype is untouched and stays fully designed. While the view is on,
 * a stylesheet is added to its document that keeps layout, spacing,
 * hierarchy and every interaction exactly as they are, and takes the
 * decoration away: shadows, gradients and imagery. A picture becomes a grey
 * block with an icon in the middle; video, canvas and icons are flattened to
 * the same grey. Colour is removed by the frame, which greys the whole
 * prototype (see `WIREFRAME_FRAME_FILTER`).
 *
 * Works because the studio serves prototypes from its own origin.
 */

const STYLE_ID = "studio-wireframe";
const IMAGE_MARK = "data-studio-wireframe-image";

/** What the frame applies to the iframe element itself: colour out, nothing else. */
export const WIREFRAME_FRAME_FILTER = "grayscale(1)";

/** How light a colour is, 0 to 1, so a flattened picture can match a token exactly. */
function lightness(color: string) {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0.7;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

/** An image-sized grey block with a picture icon in the middle, as an SVG data url. */
function placeholder(fill: string, mark: string, stretch: boolean) {
  const icon = `<g transform="translate(-12 -12)" fill="none" stroke="${mark}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="1.5"/><path d="m21 15-4.5-4.5L5 21"/></g>`;
  const svg = stretch
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="100%" height="100%" fill="${fill}"/><svg x="50%" y="50%" overflow="visible">${icon}</svg></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${icon.replace(' transform="translate(-12 -12)"', "")}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function sheet(line: string, image: string) {
  // A picture is swapped for a grey block with an icon on it. Video and
  // canvas can't be swapped, so they are flattened to the same grey.
  return `
*, *::before, *::after {
  box-shadow: none !important;
  text-shadow: none !important;
  background-image: none !important;
  border-color: ${line} !important;
}
img, input[type="image"] {
  content: ${placeholder(image, line, true)} !important;
  object-fit: fill !important;
}
video, canvas, svg, object, embed {
  filter: brightness(0) invert(${lightness(image).toFixed(3)}) !important;
}
[${IMAGE_MARK}], [${IMAGE_MARK}="before"]::before, [${IMAGE_MARK}="after"]::after {
  background-color: ${image} !important;
  background-image: ${placeholder(image, line, false)} !important;
  background-repeat: no-repeat !important;
  background-position: center !important;
  background-size: 2rem !important;
}`;
}

/**
 * The elements that paint a picture as a background (or in a ::before or
 * ::after), so they can be given the image grey. Looked at with the
 * wireframe sheet switched off, since that sheet removes the very thing
 * being looked for; nothing is painted in between.
 */
function markBackgroundImages(doc: Document, roots: ParentNode[], style: HTMLStyleElement) {
  const view = doc.defaultView;
  if (!view) return;
  style.disabled = true;
  for (const root of roots) {
    const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
    for (const element of elements) {
      const has = (pseudo?: string) => view.getComputedStyle(element, pseudo).backgroundImage.includes("url(");
      if (has()) element.setAttribute(IMAGE_MARK, "");
      else if (has("::before")) element.setAttribute(IMAGE_MARK, "before");
      else if (has("::after")) element.setAttribute(IMAGE_MARK, "after");
    }
  }
  style.disabled = false;
}

/**
 * Puts a prototype's document into the wireframe view, or leaves it alone
 * when `on` is false. Returns the undo, which also stops watching.
 */
export function applyWireframe(doc: Document, on: boolean) {
  if (!on || !doc.head || !doc.documentElement) return () => {};

  const tokens = getComputedStyle(document.documentElement);
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = sheet(
    tokens.getPropertyValue("--wireframe-line").trim(),
    tokens.getPropertyValue("--wireframe-image").trim(),
  );
  doc.head.appendChild(style);
  markBackgroundImages(doc, [doc.documentElement], style);

  // Screens that render later (a quiz moving to its next step) are marked too.
  // Only elements being added are watched, never style or class changes, so
  // an animating prototype costs nothing extra.
  const view = doc.defaultView;
  let added: Element[] = [];
  let pending = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element && node !== style) added.push(node);
    }
    if (!view || pending || !added.length) return;
    pending = view.requestAnimationFrame(() => {
      pending = 0;
      const roots = added;
      added = [];
      markBackgroundImages(doc, roots, style);
    });
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    if (pending) view?.cancelAnimationFrame(pending);
    style.remove();
    for (const element of doc.querySelectorAll(`[${IMAGE_MARK}]`)) element.removeAttribute(IMAGE_MARK);
  };
}
