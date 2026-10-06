"use client";

import { notFound, useParams } from "next/navigation";

import { PrototypeDetail } from "@/components/prototype/prototype-detail";
import { useStudio } from "@/lib/data/studio-store";

/**
 * A prototype, looked up in the snapshot the layout already loaded — the
 * same way a team page is — so opening one costs no fetch of its own.
 */
export function PrototypeView() {
  const params = useParams<{ slug: string }>();
  const { prototypes } = useStudio();

  const prototype = prototypes.find((candidate) => candidate.slug === params.slug);
  // A deleted prototype is hidden, not gone, but nobody should land on it.
  if (!prototype || prototype.archived) notFound();

  return <PrototypeDetail prototype={prototype} />;
}
