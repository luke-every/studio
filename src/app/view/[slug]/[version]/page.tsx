import { FullPrototype } from "@/components/prototype/full-prototype";

/**
 * A prototype on its own, filling the window: where "Open in a new tab" goes
 * when the wireframe view is on, so it stays a wireframe there. Nothing is
 * read from the registry, so it needs no more than the prototype's address.
 */
export default async function ViewPage({ params }: { params: Promise<{ slug: string; version: string }> }) {
  const { slug, version } = await params;
  return <FullPrototype slug={slug} version={version} />;
}
