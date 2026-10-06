/**
 * The shared backdrop behind any layer that takes over the screen. One
 * component so modals, sheets and focus mode dim the page identically: dimmed,
 * blurred 4px behind, and fading in with the blur.
 */
export function MotionScrim({ onClick }: { onClick?: () => void }) {
  return <div aria-hidden onClick={onClick} className="layer-scrim absolute inset-0 bg-scrim backdrop-blur-[4px]" />;
}
