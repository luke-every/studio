import "server-only";

import { githubToken, repoConfig } from "@/lib/config";

/**
 * Writing the registry back to GitHub.
 *
 * Every change made in the app is an ordinary commit on the repository the
 * team already uses. There is no database: the history of what the studio
 * believes is the history of the repository.
 *
 * One token does this, set once in Vercel. Work committed from Claude Code
 * does not come through here at all — that is pushed by whoever made it,
 * under their own account, which is where real authorship comes from.
 *
 * Reads do not come through here — they come from the registry files in the
 * deployed bundle, which is faster and has no rate limit. The cost is that a
 * change is visible to everyone once Vercel has finished redeploying, which
 * for changes as rare as these is a fair trade.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {}

type FileWrite = {
  path: string;
  /** The new contents. */
  content: string;
  /** Required when replacing a file, absent when creating one. */
  sha?: string;
};

function target() {
  const { repo, branch } = repoConfig();
  if (!repo) {
    throw new GitHubError(
      "No repository is set, so there is nowhere to save. Set REGISTRY_REPO in Vercel.",
    );
  }
  return { repo, branch };
}

function token() {
  const value = githubToken();
  if (!value) {
    throw new GitHubError(
      "The studio has no GitHub token, so it cannot save. Add GITHUB_TOKEN in Vercel.",
    );
  }
  return value;
}

async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new GitHubError(
      "GitHub rejected the studio's token. It may have expired — replace GITHUB_TOKEN in Vercel.",
    );
  }
  if (response.status === 403) {
    throw new GitHubError(
      "The studio's token cannot write to this repository. It needs Contents: read and write.",
    );
  }
  if (response.status === 409) {
    throw new GitHubError(
      "Someone else changed this at the same moment. Try again — nothing was lost.",
    );
  }

  return response;
}

/** The current contents of a registry file, or null if it does not exist. */
export async function readFile(path: string): Promise<{ text: string; sha: string } | null> {
  const { repo, branch } = target();
  const response = await call(
    `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GitHubError(`Could not read ${path}: ${response.statusText}`);
  }

  const body = (await response.json()) as { content: string; sha: string };
  return { text: Buffer.from(body.content, "base64").toString("utf8"), sha: body.sha };
}

export async function readJsonFile<T>(
  path: string,
): Promise<{ value: T; sha: string } | null> {
  const file = await readFile(path);
  return file ? { value: JSON.parse(file.text) as T, sha: file.sha } : null;
}

/** Commit one file. */
export async function writeFile(message: string, file: FileWrite) {
  const { repo, branch } = target();

  const response = await call(`/repos/${repo}/contents/${encodeURI(file.path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      branch,
      content: Buffer.from(file.content, "utf8").toString("base64"),
      ...(file.sha ? { sha: file.sha } : {}),
    }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new GitHubError(detail?.message ?? `Could not save ${file.path}.`);
  }
}

/** Commit a binary file, such as an uploaded preview image. */
export async function writeBinaryFile(message: string, path: string, bytes: ArrayBuffer) {
  const { repo, branch } = target();

  const existing = await readFile(path).catch(() => null);
  const response = await call(`/repos/${repo}/contents/${encodeURI(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      branch,
      content: Buffer.from(bytes).toString("base64"),
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new GitHubError(detail?.message ?? `Could not upload ${path}.`);
  }
}

/**
 * Who the studio's token belongs to.
 *
 * Used to attribute changes made in the app that nobody is asked to sign —
 * creating a team, filing a prototype — so those still carry a real name
 * rather than "the system". Fetched once per process.
 */
let owner: Promise<{ login: string; name: string }> | null = null;

export function tokenOwner() {
  owner ??= (async () => {
    const response = await call("/user");
    if (!response.ok) return { login: "studio", name: "Prototype Studio" };
    const profile = (await response.json()) as { login?: string; name?: string | null };
    return {
      login: profile.login ?? "studio",
      name: profile.name?.trim() || profile.login || "Prototype Studio",
    };
  })();
  return owner;
}

/** Whether the studio's token can actually write to the configured repo. */
export async function checkAccess() {
  const { repo, branch } = repoConfig();
  if (!repo) return { ok: false as const, reason: "No repository set." };
  if (!githubToken()) return { ok: false as const, reason: "No token set." };

  const response = await call(`/repos/${repo}`);
  if (!response.ok) {
    return { ok: false as const, reason: `Cannot reach ${repo} (${response.status}).` };
  }

  const body = (await response.json()) as { permissions?: { push?: boolean } };
  return body.permissions?.push
    ? { ok: true as const, repo, branch }
    : { ok: false as const, reason: `The token has read-only access to ${repo}.` };
}
