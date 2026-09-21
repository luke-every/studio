"use client";

import { PrototypeTile } from "@/components/prototype/prototype-tile";
import { Collection } from "@/components/ui/collection";
import { PageHeader } from "@/components/ui/page-header";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { latestPrototypes } from "@/lib/data/teams";
import { useStudio } from "@/lib/data/studio-store";
import { useViewMode } from "@/lib/use-view-mode";

export default function AllPrototypesPage() {
  const { prototypes } = useStudio();
  const [mode, setMode] = useViewMode("prototypes");
  const all = latestPrototypes(Number.POSITIVE_INFINITY, prototypes);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        title="All prototypes"
        description="Everything across every project, newest first."
        actions={<ViewSwitcher mode={mode} onChange={setMode} scope="prototypes" />}
      />

      <div className="mt-7">
        <Collection mode={mode}>
          {all.map((prototype) => (
            <PrototypeTile key={prototype.slug} prototype={prototype} mode={mode} />
          ))}
        </Collection>
      </div>
    </div>
  );
}
