import { ArrowRight, CircleCheck, Flag, History, Trophy } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { ErrorState, Skeleton } from "@/components/States";
import { useAlternatives, useDecision, useRanking } from "@/features/decisions/hooks";
import { timeAgo, toPoints } from "@/lib/format";
import { toast } from "@/stores/toastStore";

import { useCommit, useCommitments } from "../hooks";
import { OutcomeSection } from "./OutcomeSection";

function Confidence({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="commit-confidence" className="text-sm font-medium">
        How likely is it that this works out?
      </label>
      <div className="flex items-center gap-3">
        <input
          id="commit-confidence"
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-describedby="commit-confidence-hint"
          aria-valuetext={`${value} percent`}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
        />
        <output
          htmlFor="commit-confidence"
          className="w-14 text-right font-mono text-lg tabular-nums"
        >
          {value}%
        </output>
      </div>
      <p id="commit-confidence-hint" className="text-xs text-muted">
        Be honest rather than hopeful. Later you&apos;ll see how this compares with how things
        actually went.
      </p>
    </div>
  );
}

function CommitForm({ decisionId }: { decisionId: string }) {
  const { data: alternatives = [] } = useAlternatives(decisionId);
  const { data: ranking } = useRanking(decisionId);
  const { data: commitments = [] } = useCommitments(decisionId);
  const commit = useCommit(decisionId);
  const active = commitments.find((c) => c.is_active);

  const [choice, setChoice] = useState<string>("");
  const [confidence, setConfidence] = useState(70);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string>();

  const rankById = new Map(ranking?.ranking.map((r) => [r.alternative_id, r]));
  const leaderId = ranking?.ranking[0]?.alternative_id;

  // Start from the current commitment when changing one, otherwise from the calculated leader.
  useEffect(() => {
    if (choice) return;
    const start = active?.alternative_id ?? leaderId;
    if (start) setChoice(start);
  }, [active?.alternative_id, leaderId, choice]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!choice) return setError("Choose the option you are going with.");
    setError(undefined);
    commit.mutate(
      { alternative_id: choice, confidence, rationale: rationale.trim() },
      {
        onSuccess: (c) => {
          setRationale("");
          toast.success(
            active ? "Commitment updated" : "Decision committed",
            `Saved as version ${c.snapshot_version} of this decision.`,
          );
        },
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : "Couldn't record the commitment."),
      },
    );
  };

  const chosenIsLeader = !choice || choice === leaderId;
  const chosenName = alternatives.find((a) => a.id === choice)?.name;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-5 p-6" noValidate>
      <fieldset>
        <legend className="text-sm font-semibold">
          {active ? "Change your choice" : "Which option are you going with?"}
        </legend>
        <ul className="mt-3 flex flex-col gap-2">
          {alternatives.map((a) => {
            const r = rankById.get(a.id);
            return (
              <li key={a.id}>
                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${
                    choice === a.id
                      ? "border-primary bg-primary-soft"
                      : "border-border-strong hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="commit-choice"
                    value={a.id}
                    checked={choice === a.id}
                    onChange={() => setChoice(a.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="flex-1 font-medium">{a.name}</span>
                  {r && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                      {r.rank === 1 && (
                        <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      )}
                      <span>
                        {r.rank === 1 ? "Top ranked" : `Ranked ${r.rank}`} ·{" "}
                        <span className="font-mono tabular-nums">{toPoints(r.total)}</span> pts
                      </span>
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        {!chosenIsLeader && chosenName && (
          <p className="mt-2 text-sm text-muted" role="status">
            {chosenName} isn&apos;t the top-ranked option. That&apos;s allowed. Say why in the
            rationale, since that&apos;s what you&apos;ll want to read back later.
          </p>
        )}
      </fieldset>

      <Confidence value={confidence} onChange={setConfidence} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="commit-rationale" className="text-sm font-medium">
          Why? <span className="text-xs font-normal text-muted">Optional</span>
        </label>
        <textarea
          id="commit-rationale"
          className="input-base min-h-24 resize-y py-2.5"
          maxLength={2000}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" isLoading={commit.isPending}>
          <Flag className="h-4 w-4" aria-hidden="true" />
          {active ? "Update commitment" : chosenName ? `Commit to ${chosenName}` : "Commit"}
        </Button>
      </div>
    </form>
  );
}

function ActiveCommitment({ decisionId }: { decisionId: string }) {
  const { data: commitments = [] } = useCommitments(decisionId);
  const active = commitments.find((c) => c.is_active);
  const past = commitments.filter((c) => !c.is_active);
  if (!active) return null;

  return (
    <section aria-labelledby="active-commit-heading" className="glass rounded-2xl p-6">
      <p className="eyebrow flex items-center gap-1.5">
        <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        Committed
      </p>
      <h2 id="active-commit-heading" className="mt-2 text-2xl font-semibold tracking-tight">
        {active.alternative_name}
      </h2>
      <p className="mt-2 text-sm text-muted">
        <span className="font-mono tabular-nums text-text">{active.confidence}%</span> confident ·{" "}
        {timeAgo(active.created_at)} · saved as version {active.snapshot_version}
      </p>
      {active.rationale && <p className="mt-3 max-w-prose text-sm">{active.rationale}</p>}
      {past.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary">
            <History className="h-4 w-4" aria-hidden="true" />
            Earlier commitments ({past.length})
          </summary>
          <ul className="mt-2 space-y-1.5 text-muted">
            {past.map((c) => (
              <li key={c.id}>
                {c.alternative_name} · {c.confidence}% · {timeAgo(c.created_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** FR-013 — record the final choice with confidence and rationale; then look back on it. */
export function CommitTab() {
  const { decisionId = "" } = useParams();
  const { data: decision, isLoading, error, refetch } = useDecision(decisionId);
  const { data: commitments, isLoading: loadingCommitments } = useCommitments(decisionId);

  if (isLoading || loadingCommitments) return <Skeleton className="h-64 rounded-xl" />;
  if (error || !decision || !commitments) {
    return (
      <ErrorState title="Couldn't load this decision" error={error} onRetry={() => refetch()} />
    );
  }

  const hasCommitment = commitments.some((c) => c.is_active);
  const canCommit = decision.status === "SCORED" || hasCommitment;
  // Once a review is due or recorded the commitment is what is being judged, so it stays fixed.
  const canChange = decision.status === "SCORED" || decision.status === "COMMITTED";

  if (!canCommit) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Finish scoring before you commit</h2>
        <p className="mt-1 text-sm text-muted">
          {decision.status === "DRAFT"
            ? "A decision needs at least two options, a weighted criterion and a score in every cell."
            : `A ${decision.status.toLowerCase().replace("_", " ")} decision can't be committed.`}
        </p>
        {decision.status === "DRAFT" && (
          <Link
            to="../scores"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Go to scores
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ActiveCommitment decisionId={decisionId} />
      {canChange && <CommitForm decisionId={decisionId} />}
      {hasCommitment && <OutcomeSection decisionId={decisionId} />}
    </div>
  );
}
