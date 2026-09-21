/**
 * Add a prototype from Claude Code.
 *
 * The normal way work gets into the studio: build an HTML prototype, run
 * this, commit. It copies the file into the deployment and writes the
 * registry records beside it, so the prototype and the fact of the prototype
 * arrive in the same commit — and the commit is yours, which is where
 * authorship comes from.
 *
 *   npm run proto:add -- \
 *     --file ./quiz-results.html \
 *     --name "Quiz results" \
 *     --team acquisition \
 *     [--project quiz-rework] \
 *     [--exploration editorial] \
 *     [--description "..."] \
 *     [--question "..."] \
 *     [--author "Luke"]
 *
 * Run again with the same name to save a new version of the same prototype.
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { prototypeSchema, versionSchema } from "../src/lib/registry/schema";

type Args = Record<string, string>;

function parseArgs(): Args {
  const args: Args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    args[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? "true" : (argv[i + 1] ?? "true");
  }
  return args;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Who git says you are. The commit will say the same thing. */
function gitAuthor() {
  const name = execSync("git config user.name", { encoding: "utf8" }).trim();
  let login = name;
  try {
    const email = execSync("git config user.email", { encoding: "utf8" }).trim();
    login = email.split("@")[0];
  } catch {
    // No email configured; the name will do.
  }
  return { login: slugify(login) || "someone", name: name || "Someone" };
}

const today = new Date().toISOString().slice(0, 10);
const write = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

function nextVersion(dir: string, explorationId: string) {
  if (!existsSync(dir)) return "v0.1";
  const numbers = readdirSync(dir)
    .filter((file) => file.startsWith(`${explorationId}-v`) && file.endsWith(".json"))
    .map((file) => Number(file.replace(`${explorationId}-v`, "").replace(".json", "")));
  const highest = Math.max(0, ...numbers.filter((value) => !Number.isNaN(value)));
  return `v${(highest + 0.1).toFixed(1)}`;
}

function main() {
  const args = parseArgs();
  const required = ["file", "name", "team"];
  const missing = required.filter((key) => !args[key]);
  if (missing.length > 0) {
    console.error(`Missing: ${missing.map((key) => `--${key}`).join(", ")}`);
    console.error("See the comment at the top of scripts/add-prototype.ts.");
    process.exit(1);
  }

  if (!existsSync(args.file)) {
    console.error(`No such file: ${args.file}`);
    process.exit(1);
  }

  const slug = args.slug ? slugify(args.slug) : slugify(args.name);
  const explorationId = args.exploration ? slugify(args.exploration) : "main";
  const author = args.author
    ? { login: slugify(args.author), name: args.author }
    : gitAuthor();

  const root = process.cwd();
  const servedDir = join(root, "public", "p", slug, explorationId);
  const registryDir = join(root, "registry", "prototypes", slug);
  const prototypeFile = join(registryDir, "prototype.json");

  const version = nextVersion(join(registryDir, "versions"), explorationId);
  const versionId = `${slug}-${explorationId}-${version}`;
  const url = `/p/${slug}/${explorationId}`;

  mkdirSync(servedDir, { recursive: true });
  copyFileSync(args.file, join(servedDir, "index.html"));

  const preview = {
    tint: [args.tintFrom ?? "#e8e6e1", args.tintTo ?? "#8b8880"] as [string, string],
    caption: args.name,
    url,
  };

  write(
    join(registryDir, "versions", `${explorationId}-${version}.json`),
    versionSchema.parse({
      id: versionId,
      prototypeSlug: slug,
      explorationId,
      version,
      title: args.title ?? args.name,
      summary: args.description ?? "",
      why: args.why ?? "",
      author,
      createdAt: today,
      preview,
      deployment: { url, status: "ready" },
    }),
  );

  const existing = existsSync(prototypeFile)
    ? (JSON.parse(readFileSync(prototypeFile, "utf8")) as Record<string, unknown>)
    : null;

  if (existing) {
    const explorations = (existing.explorations as { id: string }[]) ?? [];
    const known = explorations.some((exploration) => exploration.id === explorationId);

    write(prototypeFile, {
      ...existing,
      preview,
      explorations: known
        ? explorations.map((exploration) =>
            exploration.id === explorationId ? { ...exploration, preview } : exploration,
          )
        : [
            ...explorations,
            {
              id: explorationId,
              title: args.exploration ?? "Main",
              premise: args.question ?? "",
              author,
              status: "active",
              preview,
            },
          ],
      // The newest version becomes the current direction. Say so explicitly
      // rather than letting "current" quietly mean "latest".
      selected: { explorationId, versionId, by: author, at: today },
      updatedAt: today,
    });
  } else {
    write(
      prototypeFile,
      prototypeSchema.parse({
        slug,
        teamSlug: args.team,
        projectSlug: args.project ?? null,
        name: args.name,
        description: args.description ?? "",
        designQuestion: args.question ?? "",
        context: args.context ?? "",
        owner: author,
        collaborators: [],
        status: "exploring",
        tags: args.tags ? args.tags.split(",").map((tag) => tag.trim()) : [],
        preview,
        explorations: [
          {
            id: explorationId,
            title: args.exploration ?? "Main",
            premise: args.question ?? "",
            author,
            status: "selected",
            preview,
          },
        ],
        selected: { explorationId, versionId, by: author, at: today },
        created: { by: author, at: today },
        updatedAt: today,
        archived: false,
        repositoryPath: `public/p/${slug}`,
      }),
    );
  }

  console.log(`${existing ? "Saved" : "Added"} ${args.name} ${version}`);
  console.log(`  prototype  registry/prototypes/${slug}/`);
  console.log(`  files      public/p/${slug}/${explorationId}/`);
  console.log(`  preview    ${url}`);
  console.log("\nCommit and push, and it is live for everyone after the deploy.");
}

main();
