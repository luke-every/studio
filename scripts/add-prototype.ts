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
 *     [--description "what the prototype is"] \
 *     [--title "headline for this version"] \
 *     [--changes "what is new or different"] \
 *     [--author "Luke"]
 *
 * Run again with the same name to save the next version. Each version keeps
 * its own copy of the files, so older ones stay viewable.
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

function nextVersion(dir: string) {
  if (!existsSync(dir)) return "v0.1";
  const numbers = readdirSync(dir)
    .filter((file) => file.startsWith("v") && file.endsWith(".json"))
    .map((file) => Number(file.replace(/^v/, "").replace(".json", "")));
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
  const author = args.author ? { login: slugify(args.author), name: args.author } : gitAuthor();

  const root = process.cwd();
  const registryDir = join(root, "registry", "prototypes", slug);
  const prototypeFile = join(registryDir, "prototype.json");

  const version = nextVersion(join(registryDir, "versions"));
  const versionId = `${slug}-${version}`;
  // Each version keeps its own copy, which is what makes going back through
  // the history real rather than nominal.
  const folder = version.replace(".", "-");
  const url = `/p/${slug}/${folder}`;

  const servedDir = join(root, "public", "p", slug, folder);
  mkdirSync(servedDir, { recursive: true });
  copyFileSync(args.file, join(servedDir, "index.html"));

  write(
    join(registryDir, "versions", `${version}.json`),
    versionSchema.parse({
      id: versionId,
      prototypeSlug: slug,
      version,
      title: args.title ?? (version === "v0.1" ? "First version" : args.name),
      changes: args.changes ?? "",
      author,
      createdAt: today,
      url,
    }),
  );

  const preview = {
    tint: [args.tintFrom ?? "#e8e6e1", args.tintTo ?? "#8b8880"] as [string, string],
    caption: args.name,
    url,
  };

  const existing = existsSync(prototypeFile)
    ? (JSON.parse(readFileSync(prototypeFile, "utf8")) as Record<string, unknown>)
    : null;

  write(
    prototypeFile,
    existing
      ? {
          ...existing,
          ...(args.description ? { description: args.description } : {}),
          preview,
          currentVersion: versionId,
          updatedAt: today,
        }
      : prototypeSchema.parse({
          slug,
          teamSlug: args.team,
          projectSlug: args.project ?? null,
          name: args.name,
          description: args.description ?? "",
          owner: author,
          preview,
          currentVersion: versionId,
          created: { by: author, at: today },
          updatedAt: today,
          archived: false,
          repositoryPath: `public/p/${slug}`,
        }),
  );

  console.log(`${existing ? "Saved" : "Added"} ${args.name} ${version}`);
  console.log(`  prototype  registry/prototypes/${slug}/`);
  console.log(`  files      public/p/${slug}/${folder}/`);
  console.log(`  preview    ${url}`);
  console.log("\nCommit and push, and it is live for everyone after the deploy.");
}

main();
