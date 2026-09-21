import "server-only";

import type { Session } from "@/lib/auth/session";

import { getSettings } from "./settings";

/**
 * Writing the registry back to GitHub.
 *
 * Every change the studio makes is an ordinary commit on the repository the
 * team already uses, authored by the person who made it, using their own
 * token. There is no database and no bot account: the history of what the
 * studio believes is the history of the repository.
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

async function target() {
  const { repo, branch } = await getSettings();
  if (!repo) {
    throw new GitHubError(
      "No repository is set, so there is nowhere to save. Set one in Settings.",
    );
  }
  return { repo, branch };
}

async function call(session: Session, path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${session.token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new GitHubError("Your GitHub sign-in has expired. Sign in again in Settings.");
  }
  if (response.status === 403) {
    throw new GitHubError("Your GitHub account cannot write to this repository.");
  }
  if (response.status === 409) {
    throw new GitHubError(
      "Someone else changed this at the same moment. Try again — nothing was lost.",
    );
  }

  return response;
}

/** The current contents of a registry file, or null if it does not exist. */
export async function readFile(
  session: Session,
  path: string,
): Promise<{ text: string; sha: string } | null> {
  const { repo, branch } = await target();
  const response = await call(
    session,
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
  session: Session,
  path: string,
): Promise<{ value: T; sha: string } | null> {
  const file = await readFile(session, path);
  return file ? { value: JSON.parse(file.text) as T, sha: file.sha } : null;
}

/** Commit one file. The commit is authored by the signed-in person. */
export async function writeFile(session: Session, message: string, file: FileWrite) {
  const { repo, branch } = await target();

  const response = await call(session, `/repos/${repo}/contents/${encodeURI(file.path)}`, {
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
export async function writeBinaryFile(
  session: Session,
  message: string,
  path: string,
  bytes: ArrayBuffer,
) {
  const { repo, branch } = await target();

  const existing = await readFile(session, path).catch(() => null);
  const response = await call(session, `/repos/${repo}/contents/${encodeURI(path)}`, {
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

/** Whether the signed-in person can actually write to the configured repo. */
export async function checkAccess(session: Session) {
  const { repo, branch } = await getSettings();
  if (!repo) return { ok: false as const, reason: "No repository set." };

  const response = await call(session, `/repos/${repo}`);
  if (!response.ok) {
    return { ok: false as const, reason: `Cannot reach ${repo} (${response.status}).` };
  }

  const body = (await response.json()) as { permissions?: { push?: boolean } };
  return body.permissions?.push
    ? { ok: true as const, repo, branch }
    : { ok: false as const, reason: `You have read-only access to ${repo}.` };
}
