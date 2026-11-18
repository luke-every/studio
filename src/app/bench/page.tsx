import { notFound } from "next/navigation";

import { BenchClient } from "./bench-client";

/** A measuring bench for the canvas: development only, so it never exists in a deployment. */
export default function BenchPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BenchClient />;
}
