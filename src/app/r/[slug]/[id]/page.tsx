import { notFound } from "next/navigation";

import { SharedPrototype } from "@/components/share/shared-prototype";
import { getPrototype } from "@/lib/registry";
import { readReviews } from "@/lib/registry/reviews";
import { collaborators } from "@/lib/registry/select";
import { versionSegment } from "@/lib/registry/version";
import { mintReviewToken } from "@/lib/review";
import { mintShareToken } from "@/lib/share";

/**
 * A review request, for the person asked: the version it was made on, with what they were asked and a way to answer, and none of
 * the studio around it. It is the share view in review mode, so it is behind the studio's door like the rest but has no nav.
 * Made when it is asked for, since requests are made after the build.
 */
export const dynamic = "force-dynamic";

async function find(slug: string, id: string) {
  try {
    const prototype = await getPrototype(slug);
    const review = (await readReviews(slug)).find((item) => item.id === id);
    const version = review && prototype?.versions.find((item) => !item.live && !item.blank && item.version === review.version);
    return prototype && review && version?.url ? { prototype, review, version } : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const found = await find(slug, id);
  return { title: found ? `Review · ${found.prototype.name} ${found.version.version}` : "Studio", robots: { index: false } };
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const found = await find(slug, id);
  if (!found) notFound();
  const { prototype, review, version } = found;

  return (
    <SharedPrototype
      name={prototype.name}
      description={prototype.description}
      people={collaborators(prototype)}
      updatedAt={prototype.updatedAt}
      version={{ label: version.version, url: version.url!, readyForDev: !!version.readyForDev }}
      slug={prototype.slug}
      versionKey={version.key}
      docs={{}}
      // What lets comments be read and written on this one version, and nothing else.
      token={mintShareToken(prototype.slug, version.key)}
      review={mintReviewToken(prototype.slug, versionSegment(version.key), { forever: true })}
      request={{ id: review.id, by: review.by, message: review.message, due: review.due, dueBy: review.dueBy, variants: review.variants, reviewers: review.reviewers.map((one) => one.name) }}
    />
  );
}
