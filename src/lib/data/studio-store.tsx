"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useCurrentUser } from "@/lib/current-user";
import { summariseTeam, type OpenTimes, type TeamSummary } from "@/lib/registry/select";
import type { Project, Prototype, RegistrySnapshot, Team } from "@/lib/registry/types";

/**
 * The studio's working set.
 *
 * Reads come from the registry, handed in by the server as a snapshot.
 * Writes — a new team, a new project, filing a prototype, opening one — are
 * applied on top of that snapshot for this session only, because the Hub
 * runs on Vercel and cannot write to its own filesystem. Making them stick
 * is the next step, and it happens behind this store: every mutation here
 * is already attributed to the current user and shaped the way a persisted
 * write will be.
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
  /** Per-person open times. Never written to the registry. */
  opened: OpenTimes;
  /** True while a change exists only in this browser. */
  hasUnsavedChanges: boolean;
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

export function StudioProvider({
  snapshot,
  children,
}: {
  snapshot: RegistrySnapshot;
  children: ReactNode;
}) {
  const { user } = useCurrentUser();

  const [teams, setTeams] = useState<Team[]>(snapshot.teams);
  const [projects, setProjects] = useState<Project[]>(snapshot.projects);
  // Overlays on the registry rather than copies of it.
  const [filing, setFiling] = useState<Record<string, string | null>>({});
  const [opened, setOpened] = useState<OpenTimes>({});

  const addTeam = useCallback<StudioContextValue["addTeam"]>(
    (input) => {
      const team: Team = {
        slug: slugify(input.name, "team"),
        name: input.name.trim(),
        remit: input.remit.trim(),
        description: input.description.trim(),
        status: "active",
        lead: user,
        members: [user],
        createdBy: user,
        createdAt: today(),
        archived: false,
      };
      setTeams((current) => [...current, team]);
      return team;
    },
    [user],
  );

  const addProject = useCallback<StudioContextValue["addProject"]>(
    (input) => {
      const project: Project = {
        slug: slugify(input.name, "project"),
        teamSlug: input.teamSlug,
        name: input.name.trim(),
        createdBy: user,
        createdAt: today(),
      };
      setProjects((current) => [...current, project]);
      return project;
    },
    [user],
  );

  const filePrototype = useCallback<StudioContextValue["filePrototype"]>(
    (prototypeSlug, projectSlug) => {
      setFiling((current) => ({ ...current, [prototypeSlug]: projectSlug }));
    },
    [],
  );

  const markOpened = useCallback<StudioContextValue["markOpened"]>((prototypeSlug) => {
    setOpened((current) =>
      current[prototypeSlug] === today() ? current : { ...current, [prototypeSlug]: today() },
    );
  }, []);

  const prototypes = useMemo(
    () =>
      snapshot.prototypes.map((prototype) =>
        prototype.slug in filing
          ? { ...prototype, projectSlug: filing[prototype.slug] }
          : prototype,
      ),
    [snapshot.prototypes, filing],
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
      opened,
      hasUnsavedChanges:
        teams.length !== snapshot.teams.length ||
        projects.length !== snapshot.projects.length ||
        Object.keys(filing).length > 0,
    }),
    [
      teams,
      projects,
      prototypes,
      addTeam,
      addProject,
      filePrototype,
      markOpened,
      opened,
      filing,
      snapshot.teams.length,
      snapshot.projects.length,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
