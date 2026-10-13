import type { ReactNode } from "react";

/** What a side panel says when there is nothing in it yet: an icon over a short line, in the middle of the space. */
export function PanelEmpty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="text-foreground-subtle [&_svg]:size-6">{icon}</span>
      <p className="max-w-[28ch] text-ui leading-[var(--leading-relaxed)] text-foreground-subtle">{children}</p>
    </div>
  );
}
