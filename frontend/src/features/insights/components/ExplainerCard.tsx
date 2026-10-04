import { MessageSquareText } from "lucide-react";

import { Skeleton } from "@/components/States";

import { useExplanation } from "../hooks";
import { CalculatedBadge } from "./CalculatedBadge";

/** FX-05 — "why this ranks first", written from templates over the ranking. Secondary to the ranking itself. */
export function ExplainerCard({ decisionId }: { decisionId: string }) {
  const { data, isLoading, error } = useExplanation(decisionId);

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (error || !data) return null; // the ranking above already explains why nothing can be shown

  return (
    <section aria-labelledby="explain-heading" className="glass rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="explain-heading" className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareText className="h-4 w-4 text-primary" aria-hidden="true" />
          Why this ranks first
        </h2>
        <CalculatedBadge>Calculated · template text</CalculatedBadge>
      </div>
      <p className="mt-3 text-base font-medium">{data.headline}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="eyebrow">Biggest contributors</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {data.drivers.map((d) => (
              <li key={d.criterion} className="flex justify-between gap-3">
                <span>
                  {d.criterion}{" "}
                  <span className="text-muted">({d.share_percent.toFixed(0)}% weight)</span>
                </span>
                <span className="font-mono tabular-nums text-muted">{d.points.toFixed(1)} pts</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 text-sm">
          {data.ahead_on.length > 0 && (
            <p>
              <span className="font-medium">Ahead on: </span>
              {data.ahead_on.map((e) => `${e.criterion} (+${e.points.toFixed(1)})`).join(", ")}
            </p>
          )}
          {data.behind_on.length > 0 && (
            <p>
              <span className="font-medium">Behind on: </span>
              {data.behind_on.map((e) => `${e.criterion} (${e.points.toFixed(1)})`).join(", ")}
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">{data.stability}</p>
      <p className="mt-1 text-sm text-muted">{data.flip_hint}</p>
    </section>
  );
}
