/**
 * Registry check.
 *
 * The same validation the application runs at load, available on its own so
 * a bad edit can be caught before it reaches a build. It reports and exits
 * non-zero; it never repairs anything.
 */
import { loadRegistry } from "../src/lib/registry/load";

async function main() {
  try {
    const data = await loadRegistry();
    const explorations = data.prototypes.reduce(
      (total, prototype) => total + prototype.explorations.length,
      0,
    );

    console.log("Registry");
    console.log(`  ✓ ${data.teams.length} teams, ${data.projects.length} projects`);
    console.log(`  ✓ ${data.prototypes.length} prototypes, ${explorations} explorations`);
    console.log(`  ✓ ${data.versions.length} versions`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
