"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { people } from "./people";
import { prototypes as seedPrototypes } from "./prototypes";
import { seedProjects, summariseProject, type ProjectSummary } from "./projects";
import type { Project, Prototype } from "./types";

/**
 * The studio's working set.
 *
 * A deliberate placeholder for the data layer: projects created here live in
 * memory for the session only. It exists so the creation flow can be designed
 * and felt now, and so that swapping in the real source later is a change to
 * this file rather than to every view.
 */
type StudioContextValue = {
  projects: ProjectSummary[];
  prototypes: Prototype[];
  addProject: (input: { name: string; client: string; description: string }) => Project;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `project-${Date.now()}`;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(seedProjects);

  const addProject = useCallback<StudioContextValue["addProject"]>((input) => {
    const project: Project = {
      slug: slugify(input.name),
      name: input.name.trim(),
      client: input.client.trim() || "Every Foods",
      description: input.description.trim(),
      status: "active",
      lead: people.luke,
      members: [people.luke],
      createdAt: new Date().toISOString().slice(0, 10),
      archived: false,
    };

    setProjects((current) => [project, ...current]);
    return project;
  }, []);

  const value = useMemo<StudioContextValue>(
    () => ({
      projects: projects.map((project) => summariseProject(project, seedPrototypes)),
      prototypes: seedPrototypes,
      addProject,
    }),
    [projects, addProject],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
