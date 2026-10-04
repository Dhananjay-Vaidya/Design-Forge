import { Calculator } from "lucide-react";

/** Teal = calculated by the deterministic engine. Never used for anything AI-generated. */
export function CalculatedBadge({ children = "Calculated, not AI" }: { children?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
      <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}
