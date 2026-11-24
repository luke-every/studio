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
 * the studio around it. It is the share view in review mode. The link carries a key that is theirs alone, which says who they are:
 * nobody signs in and there is no password. Made when it is asked for, since requests are made after the build.
 */
export const dynamic = "force-dynamic";

async function find(slug: string, id: string, key: string | undefined) {
  try {
    const prototype = await getPrototype(slug);
    const review = (await readReviews(slug)).find((item) => item.id === id);
    const reviewer = key ? review?.reviewers.find((one) => one.key === key) : undefined;
    const version = review && prototype?.versions.find((item) => !item.live && !item.blank && item.version === review.version);
    return prototype && review && reviewer && version?.url ? { prototype, review, reviewer, version } : null;
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ k?: string; s?: string }> };

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const found = await find(slug, id, (await searchParams).k);
  return { title: found ? `Review · ${found.prototype.name} ${found.version.version}` : "Studio", robots: { index: false } };
}

export default async function ReviewPage({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const { k: key, s: start } = await searchParams;
  const found = await find(slug, id, key);
  if (!found || !key) notFound();
  const { prototype, review, reviewer, version } = found;

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
      request={{ id: review.id, by: review.by, message: review.message, due: review.due, dueBy: review.dueBy, variants: review.variants }}
      reviewer={{ name: reviewer.name, key }}
      // Opened from the QR code on a computer: the screen it was on, as the prototype's own query.
      start={typeof start === "string" ? start.slice(0, 500) : undefined}
    />
  );
}
