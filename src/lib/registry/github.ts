import "server-only";

/**
 * The content repository.
 *
 * A prototype's own files — never the registry, which stays on Blob — live
 * as one commit per version in a dedicated GitHub repository, written
 * through the Git Data API rather than a local `git` checkout: a blob per
 * file, one tree, one commit, move the branch ref. No clone, no working
 * tree, and nothing here ever touches this application's own repository or
 * its deploy pipeline — a prototype push must never rebuild the studio.
 *
 * A version is checked for existence before it's written and never
 * replaced, the same guarantee the store gave before — except the history
 * this leaves behind is real, inspectable git history rather than a
 * nominal one.
 */

const API = "https://api.github.com";

type Config = { token: string; owner: string; name: string; branch: string };

function config(): Config | null {
  const token = process.env.STUDIO_GITHUB_TOKEN?.trim();
  const repo = process.env.STUDIO_CONTENT_REPO?.trim();
  const branch = process.env.STUDIO_CONTENT_BRANCH?.trim() || "main";
  if (!token || !repo) return null;

  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;

  return { token, owner, name, branch };
}

export function isContentRepoConfigured() {
  return config() !== null;
}

function requireConfig(): Config {
  const cfg = config();
  if (!cfg) {
    throw new Error(
      "No content repository is connected. Set STUDIO_GITHUB_TOKEN and STUDIO_CONTENT_REPO in Vercel.",
    );
  }
  return cfg;
}

/** Where a version's files sit inside the content repository. */
export function versionPrefix(slug: string, version: string) {
  return `p/${slug}/${version.replace(".", "-")}`;
}

function rawEntryUrl(cfg: Config, commitSha: string, prefix: string) {
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.name}/${commitSha}/${prefix}/index.html`;
}

/**
 * The content repository, for /push to commit to directly.
 *
 * A Vercel Function can't take a request body over 4.5MB, so a prototype's
 * files never pass through the studio on their way in: /push writes them to
 * GitHub itself and the studio only records the version afterwards. Handed
 * out behind the studio password, which already authorises writing a
 * prototype — the token is scoped to the content repository and nothing
 * else, so it grants nothing that password didn't.
 */
export function contentRepoAccess() {
  const cfg = requireConfig();
  return { token: cfg.token, owner: cfg.owner, repo: cfg.name, branch: cfg.branch };
}

/**
 * With no repository connected, `next dev` serves a version's files from
 * `.local/p/<slug>/<version>/` — the same folder layout, on this machine.
 */
async function readLocalFile(slug: string, versionSegment: string, path: string[]) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const file = join(process.cwd(), ".local", "p", slug, versionSegment, ...(path.length ? path : ["index.html"]));
  const bytes = await readFile(file).catch(() => null);
  return bytes ? new Response(new Uint8Array(bytes)) : null;
}

/**
 * One file of a pushed version, straight from the content repository.
 *
 * Read by its path on the branch rather than through the registry. A
 * prototype is often a hundred files and a video is dozens of range
 * requests; looking each one up in the registry first cost two Blob
 * operations per file, which rate-limited some of them and then exhausted
 * the store entirely. Versions are never replaced, so the branch path
 * always holds exactly what was pushed — nothing needs looking up.
 *
 * Authenticated, which gives the higher rate limit and means the content
 * repository can be private. Returns null when the file isn't there, so a
 * version from before the move to GitHub can still be found another way.
 */
export async function fetchPrototypeFile(
  slug: string,
  versionSegment: string,
  path: string[],
  range: string | null,
): Promise<Response | null> {
  if (!/^[a-z0-9-]+$/.test(slug) || !/^v\d+-\d+$/.test(versionSegment)) return null;
  if (path.some((segment) => !segment || segment === "." || segment === "..")) return null;

  const cfg = config();
  if (!cfg) return process.env.NODE_ENV === "production" ? null : readLocalFile(slug, versionSegment, path);

  const file = (path.length ? path : ["index.html"]).map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://raw.githubusercontent.com/${cfg.owner}/${cfg.name}/${cfg.branch}/p/${slug}/${versionSegment}/${file}`,
    {
      headers: { authorization: `Bearer ${cfg.token}`, ...(range ? { range } : {}) },
      cache: "no-store",
    },
  );
  return response.ok ? response : null;
}

/**
 * Confirm a commit /push made really holds this version, before the
 * registry points at it. The registry never records a version whose files
 * aren't there.
 */
export async function verifyPrototypeVersion(
  slug: string,
  version: string,
  commitSha: string,
): Promise<{ entryUrl: string }> {
  const cfg = requireConfig();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error("That isn't a commit.");
  }

  const prefix = versionPrefix(slug, version);
  const found = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.name}/contents/${prefix}/index.html?ref=${commitSha}`,
    { headers: { authorization: `Bearer ${cfg.token}`, accept: "application/vnd.github+json" } },
  );
  if (!found.ok) {
    throw new Error(`Commit ${commitSha.slice(0, 7)} has no ${prefix}/index.html.`);
  }

  return { entryUrl: rawEntryUrl(cfg, commitSha, prefix) };
}

async function api(path: string, cfg: Config, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub ${init.method ?? "GET"} ${path} failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }
  return response.json();
}

/**
 * A file at the root of the content repository, as text. Null when it isn't
 * there yet. Read through the contents API so it is never a stale CDN copy.
 */
export async function readRepoFile(path: string): Promise<string | null> {
  const cfg = requireConfig();
  const response = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.name}/contents/${path}?ref=${cfg.branch}`,
    // No `cache` option, on purpose. Next doesn't cache a fetch by default, so
    // this is read fresh whenever a page is generated — but `cache: "no-store"`
    // would also opt every page that reads the registry out of prerendering,
    // and turn each navigation into a server round trip.
    { headers: { authorization: `Bearer ${cfg.token}`, accept: "application/vnd.github.raw+json" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`);
  return response.text();
}

/**
 * Create or replace one file with one commit. Replacing needs the sha of the
 * file being replaced; if somebody else's write landed in between, GitHub
 * refuses with a conflict, which surfaces as an error rather than a silent
 * overwrite.
 */
export async function writeRepoFile(path: string, content: string, message: string) {
  const cfg = requireConfig();
  const url = `/repos/${cfg.owner}/${cfg.name}/contents/${path}`;

  const current = await fetch(`${API}${url}?ref=${cfg.branch}`, {
    headers: { authorization: `Bearer ${cfg.token}`, accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!current.ok && current.status !== 404) {
    throw new Error(`Could not read ${path} (${current.status}).`);
  }
  const sha = current.ok ? ((await current.json()).sha as string) : undefined;

  await api(url, cfg, {
    method: "PUT",
    body: JSON.stringify({ message, content: toBase64(content), branch: cfg.branch, sha }),
  });
}

function toBase64(content: ArrayBuffer | string): string {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
  return Buffer.from(bytes).toString("base64");
}

/**
 * Commit every file of one version in a single commit. Returns the raw URL
 * the entry (`index.html`) is served from; sibling files are reached by
 * substituting the path in that same URL — nothing else needs to know the
 * commit this landed in.
 */
export async function commitPrototypeVersion(
  slug: string,
  version: string,
  files: { path: string; content: ArrayBuffer | string }[],
): Promise<{ entryUrl: string }> {
  const cfg = requireConfig();
  const prefix = versionPrefix(slug, version);

  const existing = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.name}/contents/${prefix}/index.html?ref=${cfg.branch}`,
    { headers: { authorization: `Bearer ${cfg.token}`, accept: "application/vnd.github+json" } },
  );
  if (existing.ok) {
    throw new Error(`${version} of ${slug} already exists. Versions are never replaced.`);
  }

  const ref = await api(`/repos/${cfg.owner}/${cfg.name}/git/ref/heads/${cfg.branch}`, cfg);
  const baseCommitSha = ref.object.sha as string;
  const baseCommit = await api(`/repos/${cfg.owner}/${cfg.name}/git/commits/${baseCommitSha}`, cfg);
  const baseTreeSha = baseCommit.tree.sha as string;

  const tree = await Promise.all(
    files.map(async (file) => {
      const blob = await api(`/repos/${cfg.owner}/${cfg.name}/git/blobs`, cfg, {
        method: "POST",
        body: JSON.stringify({ content: toBase64(file.content), encoding: "base64" }),
      });
      return { path: `${prefix}/${file.path}`, mode: "100644", type: "blob", sha: blob.sha as string };
    }),
  );

  const newTree = await api(`/repos/${cfg.owner}/${cfg.name}/git/trees`, cfg, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });

  const commit = await api(`/repos/${cfg.owner}/${cfg.name}/git/commits`, cfg, {
    method: "POST",
    body: JSON.stringify({
      message: `Push ${slug} ${version}`,
      tree: newTree.sha,
      parents: [baseCommitSha],
    }),
  });

  await api(`/repos/${cfg.owner}/${cfg.name}/git/refs/heads/${cfg.branch}`, cfg, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return { entryUrl: rawEntryUrl(cfg, commit.sha as string, prefix) };
}
