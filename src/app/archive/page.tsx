"use client";

import { PrototypeTile } from "@/components/prototype/prototype-tile";
import { Collection } from "@/components/ui/collection";
import { PageHeader } from "@/components/ui/page-header";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { useStudio } from "@/lib/data/studio-store";
import { useViewMode } from "@/lib/use-view-mode";

export default function ArchivePage() {
  const { prototypes } = useStudio();
  const [mode, setMode] = useViewMode("prototypes");
  const archived = prototypes.filter((prototype) => prototype.archived);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        title="Archive"
        description="Work we stopped for a reason. The reason is usually the useful part."
        actions={
          archived.length > 0 ? (
            <ViewSwitcher mode={mode} onChange={setMode} scope="prototypes" />
          ) : null
        }
      />

      <div className="mt-7">
        {archived.length > 0 ? (
          <Collection mode={mode}>
            {archived.map((prototype) => (
              <PrototypeTile key={prototype.slug} prototype={prototype} mode={mode} />
            ))}
          </Collection>
        ) : (
          <p className="max-w-[40ch] py-10 text-sm text-foreground-muted">
            Nothing archived yet. Everything we have started is still open.
          </p>
        )}
      </div>
    </div>
  );
}
