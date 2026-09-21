import { notFound } from "next/navigation";

import { PrototypeDetail } from "@/components/prototype/prototype-detail";
import { getExploration, getPrototype, prototypes } from "@/lib/data/prototypes";

export function generateStaticParams() {
  return prototypes.map((prototype) => ({ slug: prototype.slug }));
}

export default async function PrototypePage({ params }: PageProps<"/prototypes/[slug]">) {
  const { slug } = await params;
  const prototype = getPrototype(slug);
  if (!prototype) notFound();

  const exploration = getExploration(prototype);
  if (!exploration) notFound();

  return <PrototypeDetail prototype={prototype} exploration={exploration} />;
}
