import { notFound } from "next/navigation";

import { SharedPrototype } from "@/components/share/shared-prototype";
import { getPrototype } from "@/lib/registry";
import { versionSegment } from "@/lib/registry/version";
import { mintReviewToken } from "@/lib/review";
import { collaborators } from "@/lib/registry/select";
import { resolveShareToken } from "@/lib/share";
import { contentRepoUrl } from "@/lib/registry/github";
import { readSharedDocLinks } from "@/lib/registry/copy-docs";

/**
 * A prototype (its latest version, or the one version the link was pinned to), shared with somebody who doesn't have the
 * password. Outside the studio and its door: no nav, nothing to change, and
 * nothing else in the studio reachable from here.
 */
async function shared(token: string) {
  const named = await resolveShareToken(token);
  if (!named) return null;
  const prototype = await getPrototype(named.slug);
  const version = prototype?.versions.find((item) => item.key === named.key);
  return prototype && version?.url ? { prototype, version, dev: named.dev } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const found = await shared((await params).token);
  return { title: found ? `${found.prototype.name} ${found.version.version}` : "Studio", robots: { index: false } };
}

/** What there is to open from the Docs menu; a link that isn't there is left out. The GitHub one goes straight to the app's source when it has one, for an engineer picking it up. */
async function docLinks(prototype: NonNullable<Awaited<ReturnType<typeof shared>>>["prototype"], version: NonNullable<Awaited<ReturnType<typeof shared>>>["version"]) {
  const repo = contentRepoUrl();
  const copy = await readSharedDocLinks(prototype.slug);
  return {
    figma: prototype.figmaUrl || undefined,
    notion: prototype.notionUrl || undefined,
    claude: copy.claude,
    notionCopy: copy.notion,
    github: repo ? `${repo}/p/${prototype.slug}/${versionSegment(version.key)}${version.source ? "/_source" : ""}` : undefined,
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const found = await shared((await params).token);
  if (!found) notFound();
  const { prototype, version, dev } = found;

  return (
    <SharedPrototype
      name={prototype.name}
      description={prototype.description}
      people={collaborators(prototype)}
      updatedAt={prototype.updatedAt}
      version={{ label: version.version, url: version.url!, readyForDev: !!version.readyForDev }}
      slug={prototype.slug}
      versionKey={version.key}
      docs={await docLinks(prototype, version)}
      token={(await params).token}
      dev={dev}
      // What lets somebody with the link leave a comment on this version, and nothing else.
      review={mintReviewToken(prototype.slug, versionSegment(version.key), { forever: true })}
    />
  );
}
