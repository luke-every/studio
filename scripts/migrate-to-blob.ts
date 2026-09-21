/**
 * Move the registry from files into Blob, once.
 *
 * Reads `registry/` and `public/p/` from this repository and writes them to
 * the store, after which the repository holds code only and nothing is
 * redeployed to add a prototype.
 *
 *   BLOB_READ_WRITE_TOKEN=... npm run registry:migrate
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { put } from "@vercel/blob";

import {
  prototypeSchema,
  teamsFileSchema,
  versionSchema,
  type PrototypeRecord,
  type VersionRecord,
} from "../src/lib/registry/schema";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Set BLOB_READ_WRITE_TOKEN first (Vercel → Storage → your Blob store).");
  process.exit(1);
}

const root = process.cwd();
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

async function main() {
  const { teams, projects } = teamsFileSchema.parse(
    await readJson(join(root, "registry", "teams.json")),
  );

  const prototypesRoot = join(root, "registry", "prototypes");
  const slugs = existsSync(prototypesRoot)
    ? (await readdir(prototypesRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  const prototypes: PrototypeRecord[] = [];
  const versions: VersionRecord[] = [];

  for (const slug of slugs) {
    const dir = join(prototypesRoot, slug);
    const prototype = prototypeSchema.parse(await readJson(join(dir, "prototype.json")));

    for (const file of (await readdir(join(dir, "versions"))).filter((n) => n.endsWith(".json"))) {
      const version = versionSchema.parse(await readJson(join(dir, "versions", file)));
      const folder = version.version.replace(".", "-");
      const html = join(root, "public", "p", slug, folder, "index.html");

      if (existsSync(html)) {
        const blob = await put(`p/${slug}/${folder}/index.html`, await readFile(html), {
          access: "public",
          contentType: "text/html; charset=utf-8",
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        version.url = blob.url;
        if (prototype.currentVersion === version.id) prototype.preview.url = blob.url;
        console.log(`  ✓ ${slug} ${version.version}`);
      } else {
        console.log(`  – ${slug} ${version.version} (no files)`);
      }

      versions.push(version);
    }

    prototypes.push(prototype);
  }

  const document = { teams, projects, prototypes, versions };
  await put("registry.json", `${JSON.stringify(document, null, 2)}\n`, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });

  console.log(
    `\nMoved ${teams.length} teams, ${projects.length} projects, ${prototypes.length} prototypes, ${versions.length} versions.`,
  );
  console.log("The repository no longer needs registry/ or public/p/.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
