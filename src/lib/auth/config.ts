/**
 * What the studio needs before anyone can sign in.
 *
 * Two values, set once in Vercel. They cannot be configured from inside the
 * app for the obvious reason: the app cannot authenticate you before it
 * knows how to authenticate anyone. Everything else is configurable in
 * Settings, which also reports exactly which of these is missing.
 */
export type AuthConfig = {
  clientId: string;
  clientSecret: string;
};

export function readAuthConfig(): AuthConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isAuthConfigured() {
  return readAuthConfig() !== null;
}

/**
 * Where the registry is written.
 *
 * Defaults to this repository on Vercel, where the owner and name are
 * provided automatically, so in the normal case there is nothing to set.
 */
export function readRepoConfig() {
  const explicit = process.env.REGISTRY_REPO;
  const fromVercel =
    process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : null;

  const repo = explicit ?? fromVercel;
  const branch = process.env.REGISTRY_BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? "main";

  return { repo, branch, source: explicit ? "environment" : fromVercel ? "vercel" : "unset" } as const;
}
