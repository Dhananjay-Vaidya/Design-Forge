import {
  ArrowRight,
  Calculator,
  CircleAlert,
  Grid3x3,
  Layers,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { ErrorState, Skeleton } from "@/components/States";
import { timeAgo, toPoints } from "@/lib/format";
import { useTokenColor } from "@/lib/useTokenColor";
import type { Criterion, Ranking } from "@/types/decision";

import { useCriteria, useRanking } from "../hooks";

const FIELD_LINKS: Record<string, { to: string; label: string; icon: typeof Layers }> = {
  alternatives: { to: "../alternatives", label: "Options", icon: Layers },
  criteria: { to: "../criteria", label: "Criteria", icon: SlidersHorizontal },
  scores: { to: "../scores", label: "Scores", icon: Grid3x3 },
};

/** AC-002/AC-004 — the API explains exactly what's missing; surface it with a way to fix each item. */
function NotReady({ fields }: { fields: Record<string, string[]> }) {
  return (
    <div className="card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
          <CircleAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">Not ready to rank yet</h2>
          <p className="mt-1 text-sm text-muted">Finish these and the ranking will calculate instantly.</p>
          <ul className="mt-5 flex flex-col gap-3">
            {Object.entries(fields).map(([field, messages]) => {
              const link = FIELD_LINKS[field];
              const shown = messages.slice(0, 4);
              return (
                <li key={field} className="rounded-lg border border-border bg-bg/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      {link && <link.icon className="h-4 w-4 text-muted" aria-hidden="true" />}
                      {link?.label ?? field}
                    </span>
                    {link && (
                      <Link to={link.to} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        Fix
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {shown.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                    {messages.length > shown.length && <li>…and {messages.length - shown.length} more.</li>}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RankingChart({ ranking }: { ranking: Ranking["ranking"] }) {
  const primary = useTokenColor("primary");
  const muted = useTokenColor("muted");
  const surface2 = useTokenColor("surface-2");
  const data = ranking.map((r) => ({ name: r.name, points: Number(toPoints(r.total)) }));
  const summary = ranking.map((r) => `${r.rank}. ${r.name}: ${toPoints(r.total)} points`).join("; ");

  return (
    <div role="img" aria-label={`Ranking chart. ${summary}`} style={{ height: Math.max(160, data.length * 52 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap={10}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fill: muted, fontSize: 13 }}
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: surface2 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-lift">
                  <p className="font-medium">{payload[0].payload.name}</p>
                  <p className="font-mono tabular-nums text-muted">{Number(payload[0].value).toFixed(1)} / 100</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="points" radius={[0, 6, 6, 0]} animationDuration={600} isAnimationActive={!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={primary} fillOpacity={i === 0 ? 1 : 0.4} />
            ))}
            <LabelList
              dataKey="points"
              position="right"
              formatter={(v: number) => v.toFixed(1)}
              style={{ fill: muted, fontSize: 12, fontFamily: "Geist Mono Variable, monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownTable({ ranking, criteria }: { ranking: Ranking; criteria: Criterion[] }) {
  const order = Object.keys(ranking.weights_normalized);
  const byId = new Map(criteria.map((c) => [c.id, c]));

  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="px-5 pt-4 text-left">
          <span className="block font-semibold">Score breakdown</span>
          <span className="block text-xs font-normal text-muted">
            Points each criterion contributed to the total (out of 100). Weights shown under each criterion.
          </span>
        </caption>
        <thead>
          <tr className="border-b border-border text-muted">
            <th scope="col" className="w-12 px-5 py-3 text-left font-medium">#</th>
            <th scope="col" className="px-3 py-3 text-left font-medium">Option</th>
            {order.map((id) => (
              <th key={id} scope="col" className="px-3 py-3 text-right font-medium">
                <span className="block text-text">{byId.get(id)?.name ?? "Criterion"}</span>
                <span className="font-mono text-xs font-normal tabular-nums">
                  {Math.round(Number(ranking.weights_normalized[id]) * 100)}%
                </span>
              </th>
            ))}
            <th scope="col" className="px-5 py-3 text-right font-medium text-text">Total</th>
          </tr>
        </thead>
        <tbody>
          {ranking.ranking.map((r) => (
            <tr key={r.alternative_id} className={`border-b border-border last:border-0 ${r.rank === 1 ? "bg-primary-soft/50" : ""}`}>
              <td className="px-5 py-3 font-mono tabular-nums text-muted">{r.rank}</td>
              <th scope="row" className="px-3 py-3 text-left font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {r.name}
                  {r.rank === 1 && <Trophy className="h-3.5 w-3.5 text-primary" aria-label="Leader" />}
                </span>
              </th>
              {order.map((id) => (
                <td key={id} className="px-3 py-3 text-right font-mono tabular-nums text-muted">
                  {toPoints(r.breakdown[id] ?? 0)}
                </td>
              ))}
              <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums">{toPoints(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** docs/07 §5 — ranking results + sensitivity (FR-007/008). Always labelled as calculated, not AI. */
export function RankingTab() {
  const { decisionId = "" } = useParams();
  const { data: ranking, isLoading, isFetching, error, refetch } = useRanking(decisionId);
  const { data: criteria = [] } = useCriteria(decisionId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 400 && error.fields) {
    return <NotReady fields={error.fields} />;
  }
  if (error || !ranking) return <ErrorState title="Couldn't calculate the ranking" error={error} onRetry={() => refetch()} />;

  const [leader, runnerUp] = ranking.ranking;
  const margin = runnerUp ? toPoints(Number(leader.total) - Number(runnerUp.total)) : null;
  const stable = ranking.sensitivity.leader_stable;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
          <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
          Calculated, not AI · <span className="font-mono">{ranking.calculation_method}</span>
        </span>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>Computed {timeAgo(ranking.computed_at)}</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            Recalculate
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="leader-heading" className="card relative overflow-hidden p-6">
          <div className="grid-texture absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom_left,black,transparent_60%)]" aria-hidden="true" />
          <div className="relative">
            <p className="eyebrow flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Leading option
            </p>
            <h2 id="leader-heading" className="mt-3 text-2xl font-semibold tracking-tight">
              {leader.name}
            </h2>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-primary">
                {toPoints(leader.total)}
              </span>
              <span className="text-sm text-muted">/ 100</span>
            </p>
            {margin !== null && (
              <p className="mt-1 text-sm text-muted">
                Ahead of <span className="text-text">{runnerUp.name}</span> by{" "}
                <span className="font-mono tabular-nums text-text">{margin}</span> pts
              </p>
            )}
            <div
              className={`mt-6 flex items-start gap-3 rounded-lg border p-3.5 ${
                stable ? "border-success/25 bg-success/5" : "border-warning/30 bg-warning/5"
              }`}
            >
              {stable ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              )}
              <div className="text-sm">
                <p className={`font-medium ${stable ? "text-success" : "text-warning"}`}>
                  {stable ? "Leader stable" : "Close call — leader may change"}
                </p>
                <p className="mt-0.5 text-muted">
                  {stable
                    ? "Small changes to weights or scores wouldn't change the winner."
                    : "Small shifts in weights or scores could flip the result. Revisit your closest scores before committing."}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="chart-heading" className="card p-6">
          <h2 id="chart-heading" className="text-sm font-semibold">
            All options
          </h2>
          <p className="mb-4 text-xs text-muted">Weighted total out of 100</p>
          <RankingChart ranking={ranking.ranking} />
        </section>
      </div>

      <BreakdownTable ranking={ranking} criteria={criteria} />
    </div>
  );
}
