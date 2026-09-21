import { MotionList } from "@/components/motion";
import { PrototypeRow } from "@/components/prototype/prototype-row";
import { prototypes } from "@/lib/data/prototypes";

export default function ArchivePage() {
  const archived = prototypes.filter((prototype) => prototype.archived);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-12 sm:px-8 sm:py-16">
      <div className="max-w-[46ch]">
        <p className="text-eyebrow">Archive</p>
        <h1 className="mt-3 font-serif text-2xl leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-foreground">
          Put down, not thrown away.
        </h1>
        <p className="mt-4 text-md leading-[var(--leading-relaxed)] text-foreground-muted">
          Work we stopped for a reason. The reason is usually the useful part.
        </p>
      </div>

      <MotionList className="mt-12 flex flex-col gap-2 sm:mt-16">
        {archived.map((prototype, index) => (
          <PrototypeRow key={prototype.slug} prototype={prototype} index={index} />
        ))}
      </MotionList>
    </div>
  );
}
