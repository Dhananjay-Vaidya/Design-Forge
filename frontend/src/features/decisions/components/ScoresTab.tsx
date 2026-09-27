import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Grid3x3,
  LoaderCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button, ButtonLink } from "@/components/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import type { Alternative, Criterion, ScoreCellInput } from "@/types/decision";

import * as api from "../api";
import { decisionKeys, useAlternatives, useCriteria, useScores } from "../hooks";
import { SCORE_MAX, SCORE_MIN } from "../status";

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 700;
const cellKey = (altId: string, critId: string) => `${altId}:${critId}`;

function parseScore(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= SCORE_MIN && n <= SCORE_MAX ? n : null;
}

/** 0..1 "how good is this" after applying direction — drives the heat tint only. */
function goodness(score: number, direction: Criterion["direction"]) {
  const normalized = (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  return direction === "cost" ? 1 - normalized : normalized;
}

function DirectionIcon({ direction }: { direction: Criterion["direction"] }) {
  return direction === "benefit" ? (
    <TrendingUp className="h-3.5 w-3.5" aria-label="Higher is better" />
  ) : (
    <TrendingDown className="h-3.5 w-3.5" aria-label="Lower is better" />
  );
}

interface CellProps {
  row: number;
  col: number;
  value: string;
  criterion: Criterion;
  alternative: Alternative;
  isPending: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => void;
  className?: string;
}

function ScoreInput({
  row,
  col,
  value,
  criterion,
  alternative,
  isPending,
  onChange,
  onBlur,
  onKeyDown,
  className = "",
}: CellProps) {
  const parsed = parseScore(value);
  const invalid = value.trim() !== "" && parsed === null;
  const missing = value.trim() === "";
  const tint = parsed !== null ? 0.05 + goodness(parsed, criterion.direction) * 0.22 : 0;

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-cell={`${row}-${col}`}
      value={value}
      placeholder="–"
      aria-label={`${alternative.name} — ${criterion.name} score (${SCORE_MIN} to ${SCORE_MAX})`}
      aria-invalid={invalid || undefined}
      title={invalid ? `Enter a number from ${SCORE_MIN} to ${SCORE_MAX}` : undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => onKeyDown(e, row, col)}
      style={
        tint ? { backgroundColor: `rgb(var(--color-primary) / ${tint.toFixed(3)})` } : undefined
      }
      className={`h-11 w-16 rounded-lg border text-center font-mono text-[15px] tabular-nums transition-[border-color,box-shadow,background-color] duration-fast focus:outline-none focus:ring-4 ${
        invalid
          ? "border-danger text-danger focus:ring-danger/15"
          : missing
            ? "border-dashed border-warning/60 bg-warning/5 focus:border-primary focus:ring-primary/15"
            : "border-border-strong focus:border-primary focus:ring-primary/15"
      } ${isPending ? "ring-2 ring-primary/30" : ""} ${className}`}
    />
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-success">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        All changes saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-danger">
        <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Couldn't save
        <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onRetry}>
          Retry
        </Button>
      </span>
    );
  }
  return <span className="text-sm text-muted">Changes save automatically</span>;
}

/** docs/07 §5 — scoring matrix (FR-006, BR-005, AC-004) with debounced autosave. */
export function ScoresTab() {
  const { decisionId = "" } = useParams();
  const qc = useQueryClient();
  const alternativesQuery = useAlternatives(decisionId);
  const criteriaQuery = useCriteria(decisionId);
  const scoresQuery = useScores(decisionId);

  const alternatives = useMemo(() => alternativesQuery.data ?? [], [alternativesQuery.data]);
  const criteria = useMemo(
    () => (criteriaQuery.data ?? []).filter((c) => c.is_active),
    [criteriaQuery.data],
  );

  const server = useMemo(() => {
    const map = new Map<string, { score: number; rationale: string }>();
    for (const s of scoresQuery.data ?? []) {
      map.set(cellKey(s.alternative, s.criterion), {
        score: Number(s.score),
        rationale: s.rationale,
      });
    }
    return map;
  }, [scoresQuery.data]);

  // Only cells the user has touched live here; everything else renders from the server copy.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  const pendingCells = useCallback(
    (source: Record<string, string>): (ScoreCellInput & { raw: string })[] =>
      Object.entries(source).flatMap(([key, raw]) => {
        const score = parseScore(raw);
        const current = server.get(key);
        if (score === null || current?.score === score) return [];
        const [alternative_id, criterion_id] = key.split(":");
        return [{ alternative_id, criterion_id, score, rationale: current?.rationale ?? "", raw }];
      }),
    [server],
  );

  const save = useCallback(
    async (source: Record<string, string>) => {
      const cells = pendingCells(source);
      if (cells.length === 0) return;
      setSaveState("saving");
      try {
        await api.putScores(
          decisionId,
          cells.map(({ alternative_id, criterion_id, score, rationale }) => ({
            alternative_id,
            criterion_id,
            score,
            rationale,
          })),
        );
        await Promise.all([
          qc.invalidateQueries({ queryKey: decisionKeys.detail(decisionId) }),
          qc.invalidateQueries({ queryKey: decisionKeys.list() }),
        ]);
        // Drop drafts that are now persisted, unless the user typed something newer meanwhile.
        setDraft((prev) => {
          const next = { ...prev };
          for (const cell of cells) {
            const key = cellKey(cell.alternative_id, cell.criterion_id);
            if (next[key] === cell.raw) delete next[key];
          }
          return next;
        });
        setSaveState("saved");
        setLastError(null);
      } catch (error) {
        setSaveState("error");
        setLastError(
          error instanceof ApiError ? error.message : "Check your connection and try again.",
        );
      }
    },
    [decisionId, pendingCells, qc],
  );

  useEffect(() => {
    if (pendingCells(draft).length === 0) return;
    const timer = setTimeout(() => void save(draft), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, pendingCells, save]);

  // Flush anything still pending when the tab unmounts, and warn before closing the page.
  const latest = useRef({ draft, save, pendingCells });
  latest.current = { draft, save, pendingCells };
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current.pendingCells(latest.current.draft).length > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void latest.current.save(latest.current.draft);
    };
  }, []);

  const valueFor = (altId: string, critId: string) => {
    const key = cellKey(altId, critId);
    if (key in draft) return draft[key];
    const s = server.get(key);
    return s ? String(s.score) : "";
  };

  const setCell = (altId: string, critId: string, value: string) =>
    setDraft((prev) => ({ ...prev, [cellKey(altId, critId)]: value.replace(",", ".") }));

  // An emptied cell can't be deleted through the API — restore the saved value on blur.
  const restoreIfEmpty = (altId: string, critId: string) => {
    const key = cellKey(altId, critId);
    if (draft[key]?.trim() === "" && server.has(key)) {
      setDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const rows = alternatives.length;
    const moves: Record<string, [number, number]> = {
      ArrowDown: [row + 1, col],
      Enter: row + 1 < rows ? [row + 1, col] : [0, col + 1],
      ArrowUp: [row - 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
    };
    const target = moves[e.key];
    if (!target) return;
    e.preventDefault();
    const scope = e.currentTarget.closest("[data-matrix]");
    scope?.querySelector<HTMLInputElement>(`[data-cell="${target[0]}-${target[1]}"]`)?.focus();
  };

  const isLoading = alternativesQuery.isLoading || criteriaQuery.isLoading || scoresQuery.isLoading;
  const loadError = alternativesQuery.error ?? criteriaQuery.error ?? scoresQuery.error;

  if (isLoading) return <Skeleton className="h-72 rounded-xl" />;
  if (loadError) {
    return (
      <ErrorState
        error={loadError}
        onRetry={() => {
          void alternativesQuery.refetch();
          void criteriaQuery.refetch();
          void scoresQuery.refetch();
        }}
      />
    );
  }

  if (alternatives.length === 0 || criteria.length === 0) {
    const missingOptions = alternatives.length === 0;
    return (
      <EmptyState
        icon={Grid3x3}
        title={missingOptions ? "Add options first" : "Add criteria first"}
        description={
          missingOptions
            ? "The matrix scores each option against each criterion, so it needs options to show."
            : "Scores are given per criterion. Add (or switch on) at least one criterion."
        }
        action={
          <ButtonLink to={missingOptions ? "../alternatives" : "../criteria"} variant="secondary">
            {missingOptions ? "Go to options" : "Go to criteria"}
          </ButtonLink>
        }
      />
    );
  }

  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight), 0);
  const total = alternatives.length * criteria.length;
  const filled = alternatives.reduce(
    (count, a) => count + criteria.filter((c) => parseScore(valueFor(a.id, c.id)) !== null).length,
    0,
  );
  const complete = filled === total;
  const cellProps = (alt: Alternative, crit: Criterion, row: number, col: number) => ({
    row,
    col,
    alternative: alt,
    criterion: crit,
    value: valueFor(alt.id, crit.id),
    isPending:
      cellKey(alt.id, crit.id) in draft &&
      pendingCells({ [cellKey(alt.id, crit.id)]: draft[cellKey(alt.id, crit.id)] }).length > 0,
    onChange: (v: string) => setCell(alt.id, crit.id, v),
    onBlur: () => restoreIfEmpty(alt.id, crit.id),
    onKeyDown,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Scores</h2>
          <p className="text-sm text-muted">
            Rate each option from {SCORE_MIN} (worst) to {SCORE_MAX} (best) on each criterion. Use ↑
            ↓ or Enter to move.
          </p>
        </div>
        <div aria-live="polite">
          <SaveIndicator state={saveState} onRetry={() => void save(draft)} />
        </div>
      </div>
      {saveState === "error" && lastError && (
        <p role="alert" className="text-sm text-danger">
          {lastError}
        </p>
      )}

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-4">
          <span className="whitespace-nowrap font-mono text-sm tabular-nums">
            <span className="font-semibold">{filled}</span>
            <span className="text-muted"> / {total} filled</span>
          </span>
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Scores filled"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={filled}
          >
            <div
              className={`h-full origin-left rounded-full transition-transform duration-base ease-out ${complete ? "bg-success" : "bg-primary"}`}
              style={{ transform: `scaleX(${filled / total})` }}
            />
          </div>
        </div>
        {complete ? (
          <ButtonLink to="../ranking" size="sm">
            See ranking
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </ButtonLink>
        ) : (
          <span className="text-sm text-muted">
            {total - filled} left — dashed cells need a score
          </span>
        )}
      </div>

      {/* Desktop / tablet: a real table with header associations (docs/07 §8). */}
      <div data-matrix className="card hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Score matrix: options by criteria</caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface px-5 py-3 text-left font-medium text-muted"
              >
                Option
              </th>
              {criteria.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="min-w-[112px] px-3 py-3 text-center align-bottom font-medium"
                >
                  <span className="block truncate">{c.name}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-muted">
                    <DirectionIcon direction={c.direction} />
                    <span className="font-mono tabular-nums">
                      {totalWeight > 0 ? Math.round((Number(c.weight) / totalWeight) * 100) : 0}%
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alternatives.map((alt, row) => (
              <tr key={alt.id} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[240px] bg-surface px-5 py-3 text-left font-medium"
                >
                  <span className="block truncate">{alt.name}</span>
                </th>
                {criteria.map((crit, col) => (
                  <td key={crit.id} className="px-3 py-2.5 text-center">
                    <ScoreInput {...cellProps(alt, crit, row, col)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per option keeps touch targets ≥ 44px (docs/07 §13). */}
      <div data-matrix className="flex flex-col gap-3 md:hidden">
        {alternatives.map((alt, row) => (
          <section key={alt.id} className="card p-4" aria-label={alt.name}>
            <h3 className="font-medium">{alt.name}</h3>
            <ul className="mt-3 divide-y divide-border">
              {criteria.map((crit, col) => (
                <li key={crit.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span className="text-muted">
                      <DirectionIcon direction={crit.direction} />
                    </span>
                    <span className="truncate">{crit.name}</span>
                  </span>
                  <ScoreInput {...cellProps(alt, crit, row, col)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
