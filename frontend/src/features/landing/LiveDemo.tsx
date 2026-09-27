import {
  Calculator,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId, useMemo, useState } from "react";

import { type DemoCriterion, type DemoOption, rankOptions } from "@/lib/scoring";

const OPTIONS: DemoOption[] = [
  { name: "Offer A — enterprise", scores: [8, 6, 7, 8] },
  { name: "Offer B — scale-up", scores: [6, 9, 3, 5] },
  { name: "Offer C — agency", scores: [7, 5, 5, 6] },
];

const INITIAL: DemoCriterion[] = [
  { name: "Salary", weight: 4, direction: "benefit" },
  { name: "Growth", weight: 3, direction: "benefit" },
  { name: "Commute", weight: 2, direction: "cost" },
  { name: "Stability", weight: 2, direction: "benefit" },
];

function WeightSlider({
  criterion,
  share,
  onChange,
}: {
  criterion: DemoCriterion;
  share: number;
  onChange: (weight: number) => void;
}) {
  const id = useId();
  const Icon = criterion.direction === "benefit" ? TrendingUp : TrendingDown;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="flex items-center gap-1.5 font-medium">
          {criterion.name}
          <Icon
            className="h-3.5 w-3.5 text-muted"
            aria-label={criterion.direction === "benefit" ? "higher is better" : "lower is better"}
          />
        </label>
        <span className="font-mono text-xs tabular-nums text-muted">
          <span className="text-text">{Math.round(share * 100)}%</span> · weight {criterion.weight}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={criterion.weight}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full cursor-pointer accent-[rgb(var(--color-primary))]"
        aria-valuetext={`${criterion.name} weight ${criterion.weight}, ${Math.round(share * 100)} percent`}
      />
    </div>
  );
}

/**
 * Interactive, illustrative demo: drag weights and watch the ranking re-order. Uses the same
 * formula as the engine, so what it shows is how the real product behaves.
 */
export function LiveDemo() {
  const [criteria, setCriteria] = useState(INITIAL);
  const { ranked, margin, stable } = useMemo(() => rankOptions(OPTIONS, criteria), [criteria]);
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const allZero = totalWeight === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">What matters to you?</p>
          <button
            type="button"
            onClick={() => setCriteria(INITIAL)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
        </div>
        <div className="mt-5 space-y-5">
          {criteria.map((c, i) => (
            <WeightSlider
              key={c.name}
              criterion={c}
              share={totalWeight ? c.weight / totalWeight : 0}
              onChange={(weight) =>
                setCriteria(criteria.map((x, j) => (j === i ? { ...x, weight } : x)))
              }
            />
          ))}
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted">
          Scores are fixed for this demo (1–10 per criterion). In the app you set your own.
        </p>
      </div>

      <div className="glass rounded-2xl p-6" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Ranking</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">
            <Calculator className="h-3 w-3" aria-hidden="true" />
            Calculated live
          </span>
        </div>

        {allZero ? (
          <p className="mt-10 text-center text-sm text-muted">
            Give at least one criterion some weight.
          </p>
        ) : (
          <>
            <LayoutGroup>
              <ol className="mt-5 space-y-3">
                {ranked.map((row, i) => (
                  <motion.li
                    layout
                    key={row.name}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className={`rounded-xl border p-3.5 transition-colors ${
                      i === 0
                        ? "border-primary/40 bg-primary-soft/60"
                        : "border-border bg-surface/60"
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="font-mono text-xs text-muted">{i + 1}</span>
                        {row.name}
                        <AnimatePresence>
                          {i === 0 && (
                            <motion.span
                              initial={{ scale: 0, rotate: -30 }}
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0 }}
                              className="text-primary"
                            >
                              <Trophy className="h-3.5 w-3.5" aria-label="Leader" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      <span className="font-mono tabular-nums">{(row.total * 100).toFixed(1)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <motion.div
                        className={`h-full origin-left rounded-full ${i === 0 ? "bg-primary" : "bg-primary/40"}`}
                        animate={{ scaleX: row.total }}
                        transition={{ type: "spring", stiffness: 200, damping: 30 }}
                      />
                    </div>
                  </motion.li>
                ))}
              </ol>
            </LayoutGroup>

            <motion.div
              key={stable ? "stable" : "close"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-5 flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                stable ? "border-success/25 bg-success/5" : "border-warning/30 bg-warning/5"
              }`}
            >
              {stable ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <TriangleAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
              )}
              <p>
                <span className={`font-medium ${stable ? "text-success" : "text-warning"}`}>
                  {stable ? "Leader stable" : "Close call"}
                </span>
                <span className="text-muted">
                  {" "}
                  — ahead by{" "}
                  <span className="font-mono tabular-nums text-text">
                    {(margin * 100).toFixed(1)}
                  </span>{" "}
                  pts.{" "}
                  {stable
                    ? "Small changes wouldn't flip it."
                    : "A small shift in weights could flip the winner."}
                </span>
              </p>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
