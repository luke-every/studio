import { getTeams } from "@/lib/registry";

import { TeamView } from "./team-view";

/**
 * Every team is prerendered, so navigating to one is instant rather than a
 * round trip to a server that would only hand back what the browser already
 * has. `dynamicParams` keeps a team created after the last deploy working
 * until the next one.
 */
export async function generateStaticParams() {
  return (await getTeams()).map((team) => ({ slug: team.slug }));
}

export const dynamicParams = true;

export default function TeamPage() {
  return <TeamView />;
}
