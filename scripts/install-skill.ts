/**
 * Install /push for this machine.
 *
 * Prototypes are built in their own folders, not in the studio, so the skill
 * has to live at the user level where every Claude Code session can see it —
 * and it has to be told where the studio is, since it cannot infer that from
 * a directory it is not in.
 *
 *   npm run skill:install
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const studio = process.cwd();
const home = homedir();

const skillDir = join(home, ".claude", "skills", "push");
mkdirSync(skillDir, { recursive: true });
copyFileSync(join(studio, ".claude", "skills", "push", "SKILL.md"), join(skillDir, "SKILL.md"));

const configPath = join(home, ".claude", "prototype-studio.json");
writeFileSync(configPath, `${JSON.stringify({ path: studio }, null, 2)}\n`);

console.log("Installed /push");
console.log(`  skill   ${skillDir}/SKILL.md`);
console.log(`  studio  ${configPath} → ${studio}`);
console.log("\nIt is now available in every Claude Code session, in any folder.");
console.log("Run this again after pulling changes to the skill.");
