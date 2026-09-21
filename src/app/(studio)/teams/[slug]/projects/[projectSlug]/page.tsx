import { getProjects } from "@/lib/registry";

import { ProjectView } from "./project-view";

export async function generateStaticParams() {
  return (await getProjects()).map((project) => ({
    slug: project.teamSlug,
    projectSlug: project.slug,
  }));
}

export const dynamicParams = true;

export default function ProjectPage() {
  return <ProjectView />;
}
