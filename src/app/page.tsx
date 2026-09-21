"use client";

import { LatestStrip } from "@/components/home/latest-strip";
import { NewProjectTile } from "@/components/project/new-project";
import { ProjectCard } from "@/components/project/project-card";
import { Collection } from "@/components/ui/collection";
import { PageHeader } from "@/components/ui/page-header";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { latestPrototypes } from "@/lib/data/projects";
import { useStudio } from "@/lib/data/studio-store";
import { useViewMode } from "@/lib/use-view-mode";

/**
 * The overview.
 *
 * Two bands, deliberately unequal: a quiet strip of recent prototypes for
 * picking up where you left off, and beneath it the projects — the actual
 * structure of the studio, and the reason to be on this page.
 */
export default function HomePage() {
  const { projects, prototypes } = useStudio();
  const [mode, setMode] = useViewMode("projects");
  const recent = latestPrototypes(8, prototypes);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <LatestStrip prototypes={recent} />

      <div className="mt-12 border-t border-divider pt-8 sm:mt-14">
        <PageHeader
          title="Projects"
          description="Every piece of work we have open, and the prototypes inside it."
          actions={<ViewSwitcher mode={mode} onChange={setMode} scope="projects" />}
        />

        <div className="mt-7">
          <Collection mode={mode}>
            {projects.map((project, index) => (
              <ProjectCard
                key={project.slug}
                project={project}
                mode={mode}
                index={index}
              />
            ))}
            <NewProjectTile mode={mode} index={projects.length} />
          </Collection>
        </div>
      </div>
    </div>
  );
}
