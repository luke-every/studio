import { notFound } from "next/navigation";

import { DesignQa } from "@/components/design-qa/design-qa";

/** Design QA: developers' branches of the website, pulled onto this machine to check and fix. Development only: the live build has no such page. */
export default function DesignQaPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignQa />;
}
