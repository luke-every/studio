const families = ["ember", "orchid", "cocoa", "tide"] as const;

/** Grain: fractal noise, blended over the colour so it reads as paper, not plastic. */
const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1.4 -.2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** A small, fast, seedable generator — the same slug always paints the same orb. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A project's thumbnail: a soft field of blurred colour with grain, in a landscape frame.
 *
 * `isolate` and the transform make the frame its own compositing layer, so
 * the rounded corners clip the blurred layer inside it — without them Safari
 * lets the blur spill past the corners.
 *
 * Painted from the project's slug, so it is stable without being stored and
 * different from its neighbours without anyone choosing it. One family of
 * colours per orb keeps each one cohesive; the shared palette keeps the set so.
 */
export function ProjectOrb({ seed, className }: { seed: string; className?: string }) {
  const random = seeded(seed);
  const family = families[Math.floor(random() * families.length)];
  // Walk the four colours in a shuffled order so neighbouring blobs differ.
  // Fisher–Yates rather than sort(() => random() - 0.5): that comparator is
  // inconsistent, so engines (Node on the server, Safari in the browser)
  // order the result differently and the page would hydrate to another orb.
  const order = [1, 2, 3, 4];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let next = 0;
  const colour = () => `var(--orb-${family}-${order[next++ % 4]})`;

  const blobs = Array.from({ length: 6 }, () => {
    const x = Math.round(random() * 100);
    const y = Math.round(random() * 100);
    const reach = 32 + Math.round(random() * 30);
    return `radial-gradient(circle at ${x}% ${y}%, ${colour()} 0%, transparent ${reach}%)`;
  });

  return (
    <div
      aria-hidden
      className={`relative isolate aspect-[5/3] overflow-hidden rounded-[var(--r-thumb)] [transform:translateZ(0)] shadow-[inset_0_0_0_1px_var(--border)] ${className ?? ""}`}
    >
      <div
        className="absolute -inset-[10%] blur-md"
        style={{ backgroundImage: blobs.join(","), backgroundColor: `var(--orb-${family}-2)` }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 22%, var(--orb-light), transparent 48%), radial-gradient(circle at 72% 88%, var(--orb-shade), transparent 58%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-50 mix-blend-overlay"
        style={{ backgroundImage: grain, backgroundSize: "10rem" }}
      />
    </div>
  );
}
