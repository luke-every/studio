import Link from "next/link";

import { PreviewSurface } from "@/components/ui/preview-surface";
import { formatUpdated } from "@/lib/format";
import type { Prototype } from "@/lib/data/types";

/**
 * Recent work, as a shortcut rather than a destination.
 *
 * Deliberately lower in the hierarchy than the teams below it: small screens,
 * muted labels, no heading competing with the main area. It scrolls sideways
 * so it takes one band of the page and no more — the answer to "what was I
 * just looking at", not "what are we working on".
 */
export function LatestStrip({ prototypes }: { prototypes: Prototype[] }) {
  if (prototypes.length === 0) return null;

  return (
    <section aria-labelledby="latest-heading" className="min-w-0">
      <h2 id="latest-heading" className="text-eyebrow">
        Recently touched
      </h2>

      {/* Bleeds to the edges so the row reads as continuing off-screen. */}
      <div className="-mx-5 mt-3 overflow-x-auto px-5 pb-3 sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max items-start gap-4">
          {prototypes.map((prototype) => (
            <li key={prototype.slug} className="w-[4.75rem] shrink-0">
              <Link href={`/prototypes/${prototype.slug}`} className="group flex flex-col gap-2">
                <PreviewSurface
                  preview={prototype.preview}
                  size="sm"
                  className="w-full opacity-85 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground-muted transition-colors duration-[var(--dur-fast)] group-hover:text-foreground">
                    {prototype.name}
                  </p>
                  <p className="truncate text-2xs text-foreground-subtle">
                    {formatUpdated(prototype.updatedAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
