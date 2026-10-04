import {
  ArrowRight,
  GitCompare,
  History,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { timeAgo } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import type { SnapshotDiff, SnapshotSummary } from "@/types/insights";

import { useCompare, useCreateSnapshot, useSnapshots } from "../hooks";
import { CalculatedBadge } from "./CalculatedBadge";

const versionLabel = (v: SnapshotSummary) => `v${v.version}${v.label ? ` — ${v.label}` : ""}`;

function Arrow() {
  return <ArrowRight className="mx-1 inline h-3 w-3 text-muted" aria-label="to" />;
}

function Moves({ diff }: { diff: SnapshotDiff }) {
  if (!diff.ranking.moves.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Rank and points per option, before and after</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Option
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Rank
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Points
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {diff.ranking.moves.map((m) => {
            const delta = m.points_delta ?? 0;
            const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
            const tone = delta > 0 ? "text-success" : delta < 0 ? "text-warning" : "text-muted";
            return (
              <tr key={m.alternative_id} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {m.name}
                </th>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {m.rank_before ?? "–"}
                  <Arrow />
                  {m.rank_after ?? "–"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {m.points_before?.toFixed(1) ?? "–"}
                  <Arrow />
                  {m.points_after?.toFixed(1) ?? "–"}
                </td>
                <td className="py-2 pl-3 text-right">
                  <span className={`inline-flex items-center gap-1 font-mono tabular-nums ${tone}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {m.points_delta === null ? "n/a" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DiffView({ diff }: { diff: SnapshotDiff }) {
  return (
    <div className="mt-5 flex flex-col gap-5" aria-live="polite">
      <ul className="space-y-1 text-sm font-medium">
        {diff.summary.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <GitCompare className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>
      <Moves diff={diff} />
      {diff.criteria.length > 0 && (
        <section>
          <h3 className="eyebrow">Criteria</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {diff.criteria.map((c) => (
              <li key={c.criterion_id}>
                <strong>{c.name}</strong>
                {c.kind !== "changed" && ` — ${c.kind}`}
                {c.changes.map((ch) => ` — ${ch.field}: ${ch.before} → ${ch.after}`).join("")}
                {c.share_before !== null &&
                  c.share_after !== null &&
                  Math.abs(c.share_before - c.share_after) > 0.05 && (
                    <span className="text-muted">
                      {" "}
                      (share {c.share_before.toFixed(0)}% → {c.share_after.toFixed(0)}%)
                    </span>
                  )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.alternatives.length > 0 && (
        <section>
          <h3 className="eyebrow">Options</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {diff.alternatives.map((a) => (
              <li key={a.alternative_id} className="flex items-center gap-2">
                {a.kind === "added" ? (
                  <Plus className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                ) : (
                  <Minus className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                )}
                {a.kind === "renamed"
                  ? `${a.before_name} renamed to ${a.name}`
                  : `${a.name} ${a.kind}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.scores.length > 0 && (
        <section>
          <h3 className="eyebrow">Scores</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {diff.scores.map((s) => (
              <li key={`${s.alternative_id}-${s.criterion_id}`}>
                {s.alternative} on {s.criterion}:{" "}
                <span className="font-mono tabular-nums">
                  {s.before} → {s.after}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.decision_changes.length > 0 && (
        <section>
          <h3 className="eyebrow">Details</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {diff.decision_changes.map((c) => (
              <li key={c.field}>
                {c.field}: {c.before ?? "empty"} → {c.after ?? "empty"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** FX-04 — immutable saved versions and a diff between any two (or against the live decision). */
export function VersionsTab() {
  const { decisionId = "" } = useParams();
  const { data: snaps, isLoading, error, refetch } = useSnapshots(decisionId);
  const create = useCreateSnapshot(decisionId);
  const [name, setName] = useState("");
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | "current">("current");

  const effectiveFrom = from ?? snaps?.[0]?.version ?? null;
  const diff = useCompare(decisionId, effectiveFrom, to);

  const save = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(name.trim(), {
      onSuccess: (s) => {
        setName("");
        setFrom(null);
        toast.success(`Saved version ${s.version}`, "Saved versions can't be edited later.");
      },
      onError: (err) =>
        toast.error("Couldn't save the version", err instanceof ApiError ? err.message : undefined),
    });
  };

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (error || !snaps) {
    return <ErrorState title="Couldn't load versions" error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <CalculatedBadge>Saved copies · compared by calculation</CalculatedBadge>
      </div>

      <form onSubmit={save} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Save the current state as a version
          <input
            className="input-base"
            value={name}
            maxLength={120}
            placeholder="Optional label, e.g. Before talking to the team"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button type="submit" isLoading={create.isPending}>
          <History className="h-4 w-4" aria-hidden="true" />
          Save version
        </Button>
      </form>

      {snaps.length === 0 ? (
        <EmptyState
          icon={History}
          title="No saved versions yet"
          description="Save a version before you change weights or scores, then compare to see exactly what moved the result."
        />
      ) : (
        <>
          <section aria-labelledby="versions-heading" className="card p-5">
            <h2 id="versions-heading" className="text-sm font-semibold">
              Saved versions
            </h2>
            <ol className="mt-3 divide-y divide-border text-sm">
              {snaps.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-medium">
                    v{s.version}
                    {s.label && <span className="font-normal"> — {s.label}</span>}
                  </span>
                  <span className="text-muted">
                    {s.complete && s.leader
                      ? `${s.leader} led · ${s.leader_points?.toFixed(1)} pts`
                      : "No ranking yet"}{" "}
                    · {timeAgo(s.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="compare-heading" className="glass rounded-2xl p-6">
            <h2 id="compare-heading" className="text-sm font-semibold">
              Compare
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 text-sm font-medium">
                <label id="cmp-from" htmlFor="cmp-from-select">
                  From
                </label>
                <select
                  id="cmp-from-select"
                  aria-labelledby="cmp-from"
                  className="input-base"
                  value={effectiveFrom ?? ""}
                  onChange={(e) => setFrom(Number(e.target.value))}
                >
                  {snaps.map((s) => (
                    <option key={s.id} value={s.version}>
                      {versionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 text-sm font-medium">
                <label id="cmp-to" htmlFor="cmp-to-select">
                  To
                </label>
                <select
                  id="cmp-to-select"
                  aria-labelledby="cmp-to"
                  className="input-base"
                  value={String(to)}
                  onChange={(e) =>
                    setTo(e.target.value === "current" ? "current" : Number(e.target.value))
                  }
                >
                  <option value="current">Current (live)</option>
                  {snaps.map((s) => (
                    <option key={s.id} value={s.version}>
                      {versionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {effectiveFrom === to && (
              <p className="mt-4 text-sm text-muted">Pick two different versions to compare.</p>
            )}
            {diff.isLoading && effectiveFrom !== to && (
              <Skeleton className="mt-4 h-32 rounded-xl" />
            )}
            {diff.isError && (
              <div className="mt-4">
                <ErrorState
                  title="Couldn't compare these versions"
                  error={diff.error}
                  onRetry={() => diff.refetch()}
                />
              </div>
            )}
            {diff.data && <DiffView diff={diff.data} />}
          </section>
        </>
      )}
    </div>
  );
}
