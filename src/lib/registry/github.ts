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
  const cfg = config();
  if (!cfg) {
    throw new Error(
      "No content repository is connected. Set STUDIO_GITHUB_TOKEN and STUDIO_CONTENT_REPO in Vercel.",
    );
  }

  const prefix = `p/${slug}/${version.replace(".", "-")}`;

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

  return {
    entryUrl: `https://raw.githubusercontent.com/${cfg.owner}/${cfg.name}/${commit.sha as string}/${prefix}/index.html`,
  };
}
