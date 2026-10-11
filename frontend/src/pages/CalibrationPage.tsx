import {
  Flame,
  Hourglass,
  Info,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { dashboardCopy } from "@/content/dashboard";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { useCalibration } from "@/features/commitments/hooks";
import { CalculatedBadge } from "@/features/insights/components/CalculatedBadge";
import type { Calibration, CategoryCalibration, Verdict } from "@/types/commitment";

const verdictMeta: Record<
  Verdict | "not_enough_data",
  { label: string; icon: LucideIcon; className: string }
> = {
  overconfident: { label: "Overconfident", icon: TriangleAlert, className: "text-warning" },
  underconfident: { label: "Underconfident", icon: TrendingDown, className: "text-warning" },
  well_calibrated: { label: "Well calibrated", icon: ShieldCheck, className: "text-success" },
  not_enough_data: { label: "Not enough data", icon: Hourglass, className: "text-muted" },
};

const pct = (v: number | null, digits = 0) => (v === null ? "–" : `${(v * 100).toFixed(digits)}%`);

function Stat({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint: string;
  muted?: boolean;
}) {
  return (
    <div className="card p-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${muted ? "text-muted" : ""}`}
      >
        {value}
      </dd>
      <dd className="mt-1 text-xs text-muted">{hint}</dd>
    </div>
  );
}

function Reliability({ data }: { data: Calibration }) {
  return (
    <section aria-labelledby="rel-heading" className="glass rounded-2xl p-6">
      <h2 id="rel-heading" className="text-sm font-semibold">
        When you said X%, how often did it work out?
      </h2>
      <p className="mt-1 text-sm text-muted">
        If your confidence were perfectly calibrated, the two bars in each row would be the same
        length.
      </p>
      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">
          Stated confidence against how often decisions worked out
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Confidence
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Reviews
            </th>
            <th scope="col" className="py-2 pl-3 font-medium">
              Said vs worked out
            </th>
          </tr>
        </thead>
        <tbody>
          {data.buckets.map((b) => (
            <tr key={b.confidence_range} className="border-b border-border last:border-0">
              <th scope="row" className="py-3 pr-3 text-left font-mono font-normal tabular-nums">
                {b.confidence_range}%
              </th>
              <td className="px-3 py-3 text-right font-mono tabular-nums">{b.count}</td>
              <td className="w-full py-3 pl-3">
                {b.count === 0 ? (
                  <span className="text-muted">No reviews in this range</span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {(
                      [
                        ["Said", (b.avg_confidence ?? 0) / 100, "bg-ai/60"],
                        ["Worked out", b.success_rate ?? 0, "bg-primary"],
                      ] as const
                    ).map(([label, value, color]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full rounded-full ${color}`}
                            style={{ width: `${Math.round(value * 100)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-xs tabular-nums">
                          {pct(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Categories({ rows, min }: { rows: CategoryCalibration[]; min: number }) {
  return (
    <section aria-labelledby="cat-heading" className="card overflow-x-auto p-6">
      <h2 id="cat-heading" className="text-sm font-semibold">
        By kind of decision
      </h2>
      <p className="mt-1 text-sm text-muted">
        A category is only judged once it has at least {min} reviews.
      </p>
      <table className="mt-4 w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">Calibration per decision category</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Category
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Reviews
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Avg confidence
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Worked out
            </th>
            <th scope="col" className="py-2 pl-3 font-medium">
              Read
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const meta = verdictMeta[c.verdict];
            return (
              <tr key={c.category} className="border-b border-border last:border-0">
                <th scope="row" className="py-3 pr-3 text-left font-medium">
                  {c.category}
                </th>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{c.count}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {c.avg_confidence.toFixed(0)}%
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {pct(c.success_rate)}
                </td>
                <td className="py-3 pl-3">
                  <span
                    className={`inline-flex items-center gap-1.5 font-medium ${meta.className}`}
                  >
                    <meta.icon className="h-4 w-4" aria-hidden="true" />
                    {meta.label}
                  </span>
                  {c.verdict === "overconfident" || c.verdict === "underconfident" ? (
                    <span className="block text-xs text-muted">
                      {Math.abs(c.gap_points).toFixed(0)} points{" "}
                      {c.verdict === "overconfident" ? "above" : "below"} what happened
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Content({ data }: { data: Calibration }) {
  const verdict = data.verdict ? verdictMeta[data.verdict] : null;
  const early = !data.sufficient;
  return (
    <div className="flex flex-col gap-5">
      <section
        aria-labelledby="headline"
        className="glass flex items-start gap-3 rounded-2xl p-6"
        aria-live="polite"
      >
        {verdict ? (
          <verdict.icon
            className={`mt-0.5 h-5 w-5 shrink-0 ${verdict.className}`}
            aria-hidden="true"
          />
        ) : (
          <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        )}
        <div>
          <h2 id="headline" className="text-base font-semibold">
            {verdict ? verdict.label : "Still collecting"}
          </h2>
          <p className="mt-1 text-sm text-muted">{data.note}</p>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Reviews"
          value={String(data.reviews_count)}
          hint={`One per commitment · ${data.min_reviews}+ for patterns`}
        />
        <Stat
          label="Average confidence"
          value={data.avg_confidence === null ? "–" : `${data.avg_confidence.toFixed(0)}%`}
          hint="What you said, on average"
          muted={early}
        />
        <Stat
          label="Worked out"
          value={pct(data.success_rate)}
          hint={`Rated ${data.success_threshold} or more out of 5`}
          muted={early}
        />
        <Stat
          label="Brier score"
          value={data.brier_score === null ? "–" : data.brier_score.toFixed(2)}
          hint={
            data.brier_skill === null
              ? "Lower is better · 0.25 is a coin flip"
              : `Lower is better · skill ${data.brier_skill >= 0 ? "+" : ""}${(data.brier_skill * 100).toFixed(0)}% vs always guessing your hit rate`
          }
          muted={early}
        />
      </dl>

      <Reliability data={data} />
      <Categories rows={data.categories} min={3} />

      <section
        aria-labelledby="streak-heading"
        className="card flex flex-wrap items-center gap-6 p-6"
      >
        <h2 id="streak-heading" className="sr-only">
          Streaks
        </h2>
        <div className="flex items-center gap-3">
          <Flame className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <p className="font-mono text-2xl font-semibold tabular-nums">{data.streaks.current}</p>
            <p className="text-xs text-muted">Current streak</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <p className="font-mono text-2xl font-semibold tabular-nums">{data.streaks.best}</p>
            <p className="text-xs text-muted">Best streak</p>
          </div>
        </div>
        <p className="min-w-48 flex-1 text-sm text-muted">
          A streak counts consecutive decisions where you called the right side of 50%: you were at
          least 50% sure and it worked, or under 50% and it didn&apos;t.
        </p>
      </section>

      <p className="flex max-w-2xl items-start gap-2 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          These figures describe your own record, not a prediction about future decisions. With few
          reviews they move a lot. A decision &ldquo;worked out&rdquo; when you rated it{" "}
          {data.success_threshold} or more out of 5.
        </span>
      </p>
    </div>
  );
}

/** FR-016 — how well your confidence at commitment matched how things turned out. Calculated, not AI. */
export function CalibrationPage() {
  const { data, isLoading, error, refetch } = useCalibration();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="eyebrow flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Calibration
        </p>
        <h1 className="text-title font-semibold tracking-tight">How well do you know your odds?</h1>
        <p className="text-sm text-muted">{dashboardCopy.calibration.text}</p>
        <div>
          <CalculatedBadge>Calculated, not AI</CalculatedBadge>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : error || !data ? (
        <ErrorState
          title="Couldn't load your calibration"
          error={error}
          onRetry={() => refetch()}
        />
      ) : data.reviews_count === 0 ? (
        <EmptyState
          icon={Target}
          title="No outcomes recorded yet"
          description="Commit to a decision, then record how it turned out. Your first review starts this page."
          action={<ButtonLink to="/app">Open your decisions</ButtonLink>}
        />
      ) : (
        <Content data={data} />
      )}
      <p className="sr-only">
        <Link to="/app">Back to decisions</Link>
      </p>
    </div>
  );
}
