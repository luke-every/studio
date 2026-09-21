import "server-only";

import { getStore } from "./get-store";
import type { Person, Project, Prototype, PrototypeVersion, RegistrySnapshot, Team } from "./types";

/**
 * The registry's public read API.
 *
 * Async throughout, and deliberately ignorant of where the data lives —
 * files locally, Supabase when it is configured. Nothing above this layer
 * knows the difference.
 */

export async function getRegistrySnapshot(): Promise<RegistrySnapshot> {
  return getStore().read();
}

/** Whether changes made in the interface will outlive the session. */
export function isWritable(): boolean {
  return getStore().writable;
}

export async function getUsers(): Promise<Person[]> {
  return (await getRegistrySnapshot()).users;
}

export async function getTeams(): Promise<Team[]> {
  return (await getRegistrySnapshot()).teams;
}

export async function getTeam(slug: string): Promise<Team | undefined> {
  return (await getTeams()).find((team) => team.slug === slug);
}

export async function getProjects(teamSlug?: string): Promise<Project[]> {
  const projects = (await getRegistrySnapshot()).projects;
  return teamSlug ? projects.filter((project) => project.teamSlug === teamSlug) : projects;
}

export async function getPrototypes(): Promise<Prototype[]> {
  return (await getRegistrySnapshot()).prototypes;
}

export async function getPrototype(slug: string): Promise<Prototype | undefined> {
  return (await getPrototypes()).find((prototype) => prototype.slug === slug);
}

/** Every saved version of a prototype, across all its explorations. */
export async function getPrototypeHistory(slug: string): Promise<PrototypeVersion[]> {
  const prototype = await getPrototype(slug);
  if (!prototype) return [];
  return prototype.explorations
    .flatMap((exploration) => exploration.versions)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The team's current direction — not the latest work. */
export async function getSelected(slug: string) {
  return (await getPrototype(slug))?.selected;
}
