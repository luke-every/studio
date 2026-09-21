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
import { seedFiling, seedProjects } from "./projects";
import { prototypes as seedPrototypes } from "./prototypes";
import { seedTeams, summariseTeam, type TeamSummary } from "./teams";
import type { Project, Prototype, Team } from "./types";

/**
 * The studio's working set.
 *
 * A deliberate placeholder for the data layer: teams, projects, filing and
 * open times created here live in memory for the session only. It exists so
 * the flows can be designed and felt now, and so that swapping in the real
 * source later is a change to this file rather than to every view.
 */
type StudioContextValue = {
  teams: TeamSummary[];
  projects: Project[];
  prototypes: Prototype[];
  addTeam: (input: { name: string; remit: string; description: string }) => Team;
  addProject: (input: { teamSlug: string; name: string }) => Project;
  /** File a prototype into a project, or out of every project with null. */
  filePrototype: (prototypeSlug: string, projectSlug: string | null) => void;
  /** Record that someone looked at a prototype, which is what "recent" means. */
  markOpened: (prototypeSlug: string) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function slugify(name: string, fallback: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `${fallback}-${Date.now()}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>(seedTeams);
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  // Overlays on the fixtures, rather than copies of them.
  const [filing, setFiling] = useState<Record<string, string | null>>(seedFiling);
  const [opened, setOpened] = useState<Record<string, string>>({});

  const addTeam = useCallback<StudioContextValue["addTeam"]>((input) => {
    const team: Team = {
      slug: slugify(input.name, "team"),
      name: input.name.trim(),
      remit: input.remit.trim(),
      description: input.description.trim(),
      status: "active",
      lead: people.luke,
      members: [people.luke],
      createdAt: today(),
      archived: false,
    };
    setTeams((current) => [...current, team]);
    return team;
  }, []);

  const addProject = useCallback<StudioContextValue["addProject"]>((input) => {
    const project: Project = {
      slug: slugify(input.name, "project"),
      teamSlug: input.teamSlug,
      name: input.name.trim(),
      createdAt: today(),
    };
    setProjects((current) => [...current, project]);
    return project;
  }, []);

  const filePrototype = useCallback<StudioContextValue["filePrototype"]>(
    (prototypeSlug, projectSlug) => {
      setFiling((current) => ({ ...current, [prototypeSlug]: projectSlug }));
    },
    [],
  );

  const markOpened = useCallback<StudioContextValue["markOpened"]>((prototypeSlug) => {
    setOpened((current) =>
      current[prototypeSlug] === today()
        ? current
        : { ...current, [prototypeSlug]: today() },
    );
  }, []);

  const prototypes = useMemo(
    () =>
      seedPrototypes.map((prototype) => ({
        ...prototype,
        projectSlug: filing[prototype.slug] ?? null,
        lastOpenedAt: opened[prototype.slug] ?? prototype.lastOpenedAt ?? prototype.updatedAt,
      })),
    [filing, opened],
  );

  const value = useMemo<StudioContextValue>(
    () => ({
      teams: teams.map((team) => summariseTeam(team, prototypes)),
      projects,
      prototypes,
      addTeam,
      addProject,
      filePrototype,
      markOpened,
    }),
    [teams, projects, prototypes, addTeam, addProject, filePrototype, markOpened],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
