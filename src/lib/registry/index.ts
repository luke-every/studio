import "server-only";

import { readRegistry } from "./read";
import type {
  Person,
  Project,
  Prototype,
  PrototypeVersion,
  RegistrySnapshot,
  Team,
} from "./types";

/** The registry's public read API. Nothing above this knows where data lives. */

export async function getRegistrySnapshot(): Promise<RegistrySnapshot> {
  return readRegistry();
}

export async function getPeople(): Promise<Person[]> {
  return (await getRegistrySnapshot()).people;
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

/** Every saved version of a prototype, newest first. */
export async function getPrototypeHistory(slug: string): Promise<PrototypeVersion[]> {
  return (await getPrototype(slug))?.versions ?? [];
}
