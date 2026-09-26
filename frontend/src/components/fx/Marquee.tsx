import type { ReactNode } from "react";

/** Infinite horizontal ticker; pauses on hover. The duplicate copy is hidden from assistive tech. */
export function Marquee({ items, label }: { items: ReactNode[]; label: string }) {
  return (
    <div className="marquee overflow-hidden" role="region" aria-label={label}>
      <div className="marquee-track flex w-max gap-3">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 gap-3" aria-hidden={copy === 1 || undefined}>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
