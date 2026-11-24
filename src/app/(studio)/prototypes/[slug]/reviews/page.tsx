import { getPrototypes } from "@/lib/registry";

import { ReviewsView } from "./reviews-view";

export async function generateStaticParams() {
  return (await getPrototypes()).map((prototype) => ({ slug: prototype.slug }));
}

/** A prototype pushed after the last build still opens: its page is made on first visit. */
export const dynamicParams = true;

export default function ReviewsPage() {
  return <ReviewsView />;
}
