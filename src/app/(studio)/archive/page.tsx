"use client";

import { FeedGrid } from "@/components/home/feed-grid";
import { FeedTile } from "@/components/home/feed-tile";
import { useStudio } from "@/lib/data/studio-store";

/** Every archived prototype, most recently updated first. Built from the snapshot, so it stays prerendered. */
export default function ArchivePage() {
  const { prototypes, updatePrototype, isSaving } = useStudio();
  const archived = prototypes.filter((prototype) => prototype.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="w-full px-5 pb-8 pt-4 sm:px-8 sm:pb-10">
      {archived.length === 0 ? (
        <p className="py-10 text-sm text-foreground-muted">Nothing archived.</p>
      ) : (
        <FeedGrid>
          {archived.map((prototype, index) => (
            <div key={prototype.slug} className="flex min-w-0 flex-col gap-2">
              <FeedTile prototype={prototype} priority={index < 3} />
              <button
                type="button"
                disabled={isSaving(`restore:${prototype.slug}`)}
                onClick={() => updatePrototype({ slug: prototype.slug, archived: false }, [`restore:${prototype.slug}`], "Restored")}
                className="self-start px-1 text-sm text-foreground-muted hover:text-foreground disabled:opacity-50"
              >
                Unarchive
              </button>
            </div>
          ))}
        </FeedGrid>
      )}
    </div>
  );
}
