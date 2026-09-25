/**
 * Install /push for this machine.
 *
 * Prototypes are built in their own folders, not in the studio, so the skill
 * lives at the user level where every Claude Code session can see it. It
 * needs the studio's address and password — it uploads over HTTP and never
 * touches this repository, so there is nothing else to point it at.
 *
 *   npm run skill:install -- --url https://studio.vercel.app --password <word>
 */
import { existsSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const home = homedir();
const configPath = join(home, ".claude", "prototype-studio.json");
const existing = existsSync(configPath)
  ? (JSON.parse(readFileSync(configPath, "utf8")) as { url?: string; password?: string })
  : {};

const config = {
  url: flag("url") ?? existing.url ?? "",
  password: flag("password") ?? existing.password ?? "",
};

const skillDir = join(home, ".claude", "skills", "push");
const sourceDir = join(process.cwd(), ".claude", "skills", "push");
mkdirSync(skillDir, { recursive: true });
copyFileSync(join(sourceDir, "SKILL.md"), join(skillDir, "SKILL.md"));
copyFileSync(join(sourceDir, "push.mjs"), join(skillDir, "push.mjs"));
rmSync(join(skillDir, "bundle.mjs"), { force: true }); // superseded by push.mjs

mkdirSync(join(home, ".claude"), { recursive: true });
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

console.log("Installed /push");
console.log(`  skill   ${skillDir}/SKILL.md`);
console.log(`  upload  ${skillDir}/push.mjs`);
console.log(`  studio  ${configPath}`);

if (!config.url || !config.password) {
  console.log("\nStill needed — run again with:");
  console.log("  npm run skill:install -- --url https://<your-studio> --password <word>");
} else {
  console.log(`\nPointing at ${config.url}. Available in every Claude Code session.`);
}
