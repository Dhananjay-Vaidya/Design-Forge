import {
  ArrowRight,
  Layers,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { ErrorState, Skeleton } from "@/components/States";
import type { Sensitivity, TornadoBar } from "@/types/insights";

import { useSensitivity } from "../hooks";
import { CalculatedBadge } from "./CalculatedBadge";
import { ExplainerCard } from "./ExplainerCard";

function Margin({ value }: { value: number }) {
  return (
    <span className={`font-mono tabular-nums ${value < 0 ? "text-warning" : ""}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
    </span>
  );
}

function Tornado({ bars, low, high }: { bars: TornadoBar[]; low: number; high: number }) {
  const max = Math.max(
    1,
    ...bars.flatMap((b) => [Math.abs(b.low_margin_points), Math.abs(b.high_margin_points)]),
  );
  const width = (v: number) => `${Math.min(100, (Math.abs(v) / max) * 100)}%`;
  return (
    <ul className="mt-4 flex flex-col gap-4" aria-label="Leader's margin when each weight changes">
      {bars.map((b) => (
        <li key={b.criterion_id} className="rounded-lg border border-border bg-bg/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {b.name}{" "}
              <span className="font-normal text-muted">({b.share_percent.toFixed(0)}% weight)</span>
            </span>
            {b.flips ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Can change the leader
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Leader holds
              </span>
            )}
          </div>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            {(
              [
                [`Weight ×${low}`, b.low_margin_points, b.low_leader],
                [`Weight ×${high}`, b.high_margin_points, b.high_leader],
              ] as const
            ).map(([label, margin, leader]) => (
              <div key={label}>
                <dt className="flex flex-wrap justify-between gap-x-3 text-muted">
                  <span>{label}</span>
                  <span>
                    {leader} leads · margin <Margin value={margin} />
                  </span>
                </dt>
                <dd className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${margin < 0 ? "bg-warning" : "bg-primary"}`}
                    style={{ width: width(margin) }}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Flips({ data }: { data: Sensitivity }) {
  const none = data.weight_flips.length === 0 && data.score_flips.length === 0;
  return (
    <section aria-labelledby="flip-heading" className="card p-6">
      <h2 id="flip-heading" className="text-sm font-semibold">
        Smallest changes that would flip the leader
      </h2>
      {none ? (
        <p className="mt-3 text-sm text-muted">
          No single weight or score change within the scale would change the leader.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="eyebrow">Weights</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {data.weight_flips.map((f) => (
                <li key={f.criterion_id}>
                  {f.direction === "increase" ? "Raise" : "Lower"} <strong>{f.name}</strong> from{" "}
                  <span className="font-mono tabular-nums">
                    {f.current_share_percent.toFixed(0)}%
                  </span>{" "}
                  to{" "}
                  <span className="font-mono tabular-nums">{f.flip_share_percent.toFixed(0)}%</span>{" "}
                  of the total and <strong>{f.challenger_name}</strong> takes the lead.
                </li>
              ))}
              {data.weight_flips.length === 0 && (
                <li className="text-muted">No weight change alone flips it.</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="eyebrow">Scores</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {data.score_flips.map((f) => (
                <li key={`${f.alternative_id}-${f.criterion_id}`}>
                  {f.feasible ? (
                    <>
                      {f.alternative_name} on <strong>{f.criterion_name}</strong>:{" "}
                      {f.role === "leader_down" ? "down" : "up"} from{" "}
                      <span className="font-mono tabular-nums">{f.current_score}</span> to at least{" "}
                      <span className="font-mono tabular-nums">{f.flip_score}</span> (
                      {f.role === "leader_down" ? "−" : "+"}
                      {f.delta}) changes the leader.
                    </>
                  ) : (
                    <span className="text-muted">
                      {f.alternative_name} on {f.criterion_name}: no score on the scale would change
                      the leader.
                    </span>
                  )}
                </li>
              ))}
              {data.score_flips.length === 0 && (
                <li className="text-muted">No single score change flips it.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/** FX-03 — "What would change the answer?" Everything here is calculated by re-running the real engine. */
export function SensitivityTab() {
  const { decisionId = "" } = useParams();
  const { data, isLoading, isFetching, error, refetch } = useSensitivity(decisionId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 400) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Finish scoring to explore what-ifs</h2>
        <p className="mt-1 text-sm text-muted">
          The what-if analysis needs at least two options, a weighted criterion and a score in every
          cell.
        </p>
        <ul className="mt-4 flex flex-wrap gap-4 text-sm font-medium text-primary">
          <li>
            <Link to="../alternatives" className="inline-flex items-center gap-1 hover:underline">
              <Layers className="h-4 w-4" aria-hidden="true" />
              Options
            </Link>
          </li>
          <li>
            <Link to="../criteria" className="inline-flex items-center gap-1 hover:underline">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Criteria
            </Link>
          </li>
          <li>
            <Link to="../scores" className="inline-flex items-center gap-1 hover:underline">
              Scores
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </div>
    );
  }
  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't run the what-if analysis"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CalculatedBadge>Calculated, not AI · re-runs the ranking engine</CalculatedBadge>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Recalculate
        </Button>
      </div>

      <section aria-labelledby="whatif-heading" className="glass rounded-2xl p-6">
        <h2 id="whatif-heading" className="text-sm font-semibold">
          How sensitive is {data.leader.name}&apos;s lead?
        </h2>
        <p className="mt-1 text-sm text-muted">
          {data.leader.name} leads {data.runner_up.name} by{" "}
          <span className="font-mono tabular-nums text-text">{data.margin_points.toFixed(1)}</span>{" "}
          points. Each bar shows that margin if one weight were scaled ×{data.tornado_low_factor} or
          ×{data.tornado_high_factor}.
        </p>
        <Tornado
          bars={data.tornado}
          low={data.tornado_low_factor}
          high={data.tornado_high_factor}
        />
      </section>

      <Flips data={data} />
      <ExplainerCard decisionId={decisionId} />
    </div>
  );
}
