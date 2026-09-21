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
import { seedTeams, summariseTeam, type TeamSummary } from "./teams";
import type { Prototype, Team } from "./types";

/**
 * The studio's working set.
 *
 * A deliberate placeholder for the data layer: teams created here live in
 * memory for the session only. It exists so the creation flow can be designed
 * and felt now, and so that swapping in the real source later is a change to
 * this file rather than to every view.
 */
type StudioContextValue = {
  teams: TeamSummary[];
  prototypes: Prototype[];
  addTeam: (input: { name: string; remit: string; description: string }) => Team;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `team-${Date.now()}`;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>(seedTeams);

  const addTeam = useCallback<StudioContextValue["addTeam"]>((input) => {
    const team: Team = {
      slug: slugify(input.name),
      name: input.name.trim(),
      remit: input.remit.trim(),
      description: input.description.trim(),
      status: "active",
      lead: people.luke,
      members: [people.luke],
      createdAt: new Date().toISOString().slice(0, 10),
      archived: false,
    };

    setTeams((current) => [...current, team]);
    return team;
  }, []);

  const value = useMemo<StudioContextValue>(
    () => ({
      teams: teams.map((team) => summariseTeam(team, seedPrototypes)),
      prototypes: seedPrototypes,
      addTeam,
    }),
    [teams, addTeam],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
