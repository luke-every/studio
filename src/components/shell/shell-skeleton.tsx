import Link from "next/link";

import { TabBar } from "./tab-bar";

/**
 * The studio's frame before its data has arrived: the wordmark, the tab bar and a grid of tiles holding their place.
 * It is the same bar and tabs the loaded studio has, so nothing moves when the real page replaces it.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[var(--z-sticky)] bg-background">
        <div className="flex h-[var(--nav-height)] items-center px-4 sm:px-6">
          <Link href="/" className="shrink-0 text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
            Test Kitchen
          </Link>
        </div>
      </header>
      <main aria-busy className="min-w-0 flex-1">
        <div className="grid w-full grid-cols-1 gap-y-8 px-5 pb-8 pt-2 sm:grid-cols-2 sm:gap-x-4 sm:px-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10">
          {[0, 1, 2].map((tile) => (
            <div key={tile} className="flex flex-col gap-4">
              <div className="pulse-soft h-80 rounded-[var(--r-tile)] bg-surface md:h-[var(--tile-height)]" />
              <div className="pulse-soft h-4 w-1/3 rounded-[var(--r-tag)] bg-surface" />
            </div>
          ))}
        </div>
      </main>
      <TabBar />
    </div>
  );
}
