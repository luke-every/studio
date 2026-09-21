import "server-only";

/**
 * Everything the studio needs to run, all of it set once in Vercel.
 *
 * There are no user accounts and no per-person credentials. One token does
 * the app's writing, one password opens the door, and the repository is
 * detected from the deployment. Settings reports what is missing; it does
 * not configure anything, because there is nothing here worth a form.
 */

export function githubToken(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || null;
}

export function studioPassword(): string | null {
  return process.env.STUDIO_PASSWORD?.trim() || null;
}

/**
 * Where the registry is written. On Vercel this answers itself — the
 * deployment already knows which repository it came from.
 */
export function repoConfig() {
  const explicit = process.env.REGISTRY_REPO?.trim();
  const detected =
    process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : null;

  return {
    repo: explicit ?? detected,
    branch: process.env.REGISTRY_BRANCH?.trim() ?? process.env.VERCEL_GIT_COMMIT_REF ?? "main",
    source: explicit ? ("environment" as const) : detected ? ("vercel" as const) : ("unset" as const),
  };
}
