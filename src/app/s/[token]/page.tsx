import type { Viewport } from "next";
import { notFound } from "next/navigation";

import { SharedPrototype } from "@/components/share/shared-prototype";
import { getPrototype } from "@/lib/registry";
import { versionSegment } from "@/lib/registry/version";
import { mintReviewToken } from "@/lib/review";
import { collaborators } from "@/lib/registry/select";
import { readShareToken } from "@/lib/share";

/**
 * One version of a prototype, shared with somebody who doesn't have the
 * password. Outside the studio and its door: no nav, nothing to change, and
 * nothing else in the studio reachable from here.
 */
async function shared(token: string) {
  const named = readShareToken(token);
  if (!named) return null;
  const prototype = await getPrototype(named.slug);
  const version = prototype?.versions.find((item) => item.key === named.key);
  return prototype && version?.url ? { prototype, version } : null;
}

/** Lets the prototype run edge to edge on a phone, under Safari's bars, as it does when opened directly. */
export const viewport: Viewport = { colorScheme: "light dark", viewportFit: "cover" };

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const found = await shared((await params).token);
  return { title: found ? `${found.prototype.name} ${found.version.version}` : "Test Kitchen", robots: { index: false } };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const found = await shared((await params).token);
  if (!found) notFound();
  const { prototype, version } = found;

  return (
    <SharedPrototype
      name={prototype.name}
      description={prototype.description}
      people={collaborators(prototype)}
      updatedAt={prototype.updatedAt}
      version={{ label: version.version, url: version.url! }}
      slug={prototype.slug}
      versionKey={version.key}
      token={(await params).token}
      // What lets somebody with the link leave a comment on this version, and nothing else.
      review={mintReviewToken(prototype.slug, versionSegment(version.key), { forever: true })}
    />
  );
}
