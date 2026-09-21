import { notFound } from "next/navigation";

import { PrototypeDetail } from "@/components/prototype/prototype-detail";
import { getPrototype, getPrototypes } from "@/lib/registry";

export async function generateStaticParams() {
  return (await getPrototypes()).map((prototype) => ({ slug: prototype.slug }));
}

export default async function PrototypePage({ params }: PageProps<"/prototypes/[slug]">) {
  const { slug } = await params;
  const prototype = await getPrototype(slug);
  if (!prototype) notFound();

  return <PrototypeDetail prototype={prototype} />;
}
