import { NextResponse, type NextRequest } from "next/server";

import * as registry from "@/lib/registry/write";

/**
 * Where /push lands.
 *
 * Claude Code posts a prototype here from whatever folder it was built in.
 * There is no clone, no git, and nothing deployed — the file goes to the
 * store and the studio shows it within seconds.
 *
 * Authorised with the studio password, the same word that opens the
 * interface. There are no accounts, so there is nothing else it could be,
 * and a separate token would be one more thing to lose.
 */
export async function POST(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (password) {
    const given = request.headers.get("x-studio-password")?.trim();
    if (given !== password) {
      return NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the prototype as form data." }, { status: 400 });
  }

  const file = form.get("html");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach an HTML file as `html`." }, { status: 400 });
  }
  if (file.size > 8_000_000) {
    return NextResponse.json({ error: "That file is larger than 8MB." }, { status: 413 });
  }

  const name = String(form.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "A prototype needs a `name`." }, { status: 400 });
  }

  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  try {
    const saved = await registry.saveVersion({
      name,
      slug: text("slug"),
      teamSlug: text("team"),
      projectSlug: text("project") ?? null,
      description: text("description"),
      title: text("title"),
      changes: text("changes"),
      by: text("author") ?? "Someone",
      html: await file.arrayBuffer(),
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
