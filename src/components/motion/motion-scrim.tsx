/**
 * The shared backdrop behind any layer that takes over the screen. One
 * component so modals, sheets and focus mode dim the page identically: dimmed,
 * blurred 4px behind, and fading in with the blur.
 *
 * `continuing` is for a layer that takes over from another that is leaving in
 * the same moment: the backdrop is already there, so it stays as it is rather
 * than fading in again, which would flicker. `leaving` fades it back out.
 */
export function MotionScrim({ onClick, continuing, leaving }: { onClick?: () => void; continuing?: boolean; leaving?: boolean }) {
  const motion = leaving ? "layer-scrim-out " : continuing ? "" : "layer-scrim ";
  return <div aria-hidden onClick={leaving ? undefined : onClick} className={`${motion}absolute inset-0 bg-scrim backdrop-blur-[4px]`} />;
}
