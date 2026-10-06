import { NextResponse, type NextRequest } from "next/server";

import * as registry from "@/lib/registry/write";

/**
 * Where /push lands.
 *
 * Claude Code saves a prototype from whatever folder it was built in, in
 * two steps. /api/push/start says which version it will be; the skill then
 * commits the folder to the content repository itself — at its real
 * relative paths, as one commit — and posts the commit and the notes here.
 * This checks the commit holds the version and records it. Nothing is
 * deployed, and the studio shows it within seconds.
 *
 * Only notes pass through here, never files, so a prototype's size is
 * bounded by GitHub (100MB a file) rather than by a Vercel Function's 4.5MB
 * request limit.
 *
 * Authorised with the studio password, the same word that opens the
 * interface. There are no accounts, so there is nothing else it could be.
 */
export async function POST(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (password && request.headers.get("x-studio-password")?.trim() !== password) {
    return NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json(
      { error: "Send the version as JSON. If this is an old /push, reinstall it: npm run skill:install" },
      { status: 400 },
    );
  }

  const text = (key: string) => {
    const value = body[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  const name = text("name");
  const version = text("version");
  const commit = text("commit");
  if (!name || !version || !commit) {
    return NextResponse.json({ error: "A push needs a `name`, `version` and `commit`." }, { status: 400 });
  }

  try {
    const saved = await registry.recordPushedVersion({
      name,
      version,
      commit,
      slug: text("slug"),
      teamSlug: text("team"),
      projectSlug: text("project") ?? null,
      description: text("description"),
      title: text("title"),
      changes: text("changes"),
      figmaUrl: text("figma"),
      notionUrl: text("notion"),
      by: text("author") ?? "Someone",
    });

    return NextResponse.json({
      ok: true,
      ...saved,
      studio: new URL(`/prototypes/${saved.slug}`, request.nextUrl.origin).toString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Saving failed." },
      { status: 400 },
    );
  }
}
