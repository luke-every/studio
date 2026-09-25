import { NextResponse, type NextRequest } from "next/server";

import * as registry from "@/lib/registry/write";

/**
 * Where /push lands.
 *
 * Claude Code posts a prototype here from whatever folder it was built in.
 * There is no clone, no git, and nothing deployed — the files go to the
 * store and the studio shows them within seconds.
 *
 * A prototype needn't be one file — the whole folder is sent under the
 * field name `file`, the entry named `index.html`, and committed to the
 * content repository at the same relative paths it had locally.
 *
 * Authorised with the studio password, the same word that opens the
 * interface. There are no accounts, so there is nothing else it could be,
 * and a separate token would be one more thing to lose.
 */
const MAX_TOTAL_BYTES = 15_000_000;

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

  const files = form.getAll("file").filter((value): value is File => value instanceof File);
  const entry = files.find((file) => file.name === "index.html");
  if (!entry) {
    return NextResponse.json(
      { error: "Attach the prototype as `file`, with the entry named `index.html`." },
      { status: 400 },
    );
  }

  const assets = files.filter((file) => file !== entry);
  for (const asset of assets) {
    if (!asset.name || asset.name.startsWith("/") || asset.name.split("/").includes("..")) {
      return NextResponse.json({ error: `Bad file path "${asset.name}".` }, { status: 400 });
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes === 0) {
    return NextResponse.json({ error: "That prototype is empty." }, { status: 400 });
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "That prototype is larger than 15MB." }, { status: 413 });
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
      html: await entry.arrayBuffer(),
      assets: await Promise.all(
        assets.map(async (asset) => ({ path: asset.name, content: await asset.arrayBuffer() })),
      ),
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
