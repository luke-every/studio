import { PrototypeView } from "./prototype-view";
import { getPrototypes } from "@/lib/registry";

export async function generateStaticParams() {
  return (await getPrototypes()).map((prototype) => ({ slug: prototype.slug }));
}

/** A prototype pushed after the last build still opens: its page is made on first visit. */
export const dynamicParams = true;

export default function PrototypePage() {
  return <PrototypeView />;
}
