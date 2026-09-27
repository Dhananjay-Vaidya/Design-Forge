import type { ReactNode } from "react";

/** Static use-case field: readable at every speed, without an endless decorative ticker. */
export function Marquee({ items, label }: { items: ReactNode[]; label: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4" role="region" aria-label={label}>
      <ul className="flex flex-wrap justify-center gap-3">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
