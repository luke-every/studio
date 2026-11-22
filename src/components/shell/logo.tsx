/* eslint-disable @next/next/no-img-element */
/** The studio's mark: the every-studio.svg tile. */
export function Logo({ className = "" }: { className?: string }) {
  return <img src="/every-studio.svg" alt="Studio" className={`size-8 shrink-0 rounded-[var(--r-md)] ${className}`} />;
}
