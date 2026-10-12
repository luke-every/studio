/**
 * How a prototype's document is set up when the studio shows it in a phone.
 *
 * A phone has overlay scrollbars: they take no room, so nothing shifts when a
 * modal locks the page's scroll. A desktop browser's classic scrollbar does
 * take room, and Safari draws one inside the preview, so a prototype that
 * locks scroll (overflow: hidden on the page) grows by the scrollbar's width
 * and its content jumps sideways. The preview has no scrollbar to give back,
 * so there is nothing for the prototype to compensate for either. It still
 * scrolls; it just doesn't draw the bar.
 *
 * Works because the studio serves prototypes from its own origin.
 */

const STYLE_ID = "studio-embed";

/** Put the embed styles in a prototype's document. Returns the undo. */
export function applyEmbed(doc: Document) {
  if (!doc.head || doc.getElementById(STYLE_ID)) return () => {};
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = "html { scrollbar-width: none; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }";
  doc.head.appendChild(style);
  return () => style.remove();
}
