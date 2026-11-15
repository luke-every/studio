import { notFound } from "next/navigation";

import { StorybookPanel } from "@/components/storybook/storybook-panel";

/** The local Storybook, framed in the studio. Development only: the live build has no such page. */
export default function StorybookPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <StorybookPanel />;
}
