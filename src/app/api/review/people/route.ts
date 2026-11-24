import { NextResponse, type NextRequest } from "next/server";

import { checkReviewToken } from "@/lib/review";
import { readDirectory } from "@/lib/registry/directory";
import { slackMembers } from "@/lib/registry/slack";

/**
 * Finding yourself, for somebody commenting on a share link who hasn't said who they are. They have no password and no cookie; what
 * they have is the link's review token, good for one version. It answers a search, not a list: nothing for fewer than two letters
 * and six people at most, so it is for picking a name out and not for reading the workspace. People come from Slack when it is
 * connected, else from the studio's own.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  if (!checkReviewToken(query.get("token"), query.get("slug") ?? "", query.get("version") ?? "")) {
    return NextResponse.json({ error: "This link has run out." }, { status: 401 });
  }
  const wanted = (query.get("q") ?? "").trim().toLowerCase();
  if (wanted.length < 2) return NextResponse.json({ people: [] });

  const everyone = await slackMembers()
    .then((members) => members.map(({ name, image }) => ({ name, image })))
    .catch(async () => (await readDirectory().catch(() => [])).map(({ name, image }) => ({ name, image })));
  return NextResponse.json({ people: everyone.filter((person) => person.name.toLowerCase().includes(wanted)).slice(0, 6) });
}
