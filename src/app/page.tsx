import { MotionList } from "@/components/motion";
import { PrototypeRow } from "@/components/prototype/prototype-row";
import { prototypes } from "@/lib/data/prototypes";

/**
 * The hub, in its foundation form: the editorial list only.
 *
 * Filters, search, the grid/list switcher and the command menu arrive in the
 * hub stage — the point of this version is that the architecture underneath
 * (tokens, theme, motion, shared elements) is already carrying it.
 */
export default function HubPage() {
  const active = prototypes.filter((prototype) => !prototype.archived);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-12 sm:px-8 sm:py-16">
      <div className="max-w-[46ch]">
        <p className="text-eyebrow">Prototype Studio</p>
        <h1 className="mt-3 font-serif text-2xl leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-foreground">
          Explore what we&rsquo;re making.
        </h1>
        <p className="mt-4 text-md leading-[var(--leading-relaxed)] text-foreground-muted">
          Work in progress, with the thinking attached. Open anything.
        </p>
      </div>

      <MotionList className="mt-12 flex flex-col gap-2 sm:mt-16">
        {active.map((prototype, index) => (
          <PrototypeRow key={prototype.slug} prototype={prototype} index={index} />
        ))}
      </MotionList>
    </div>
  );
}
