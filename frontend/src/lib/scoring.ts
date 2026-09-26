/**
 * Client-side copy of the weighted-sum formula in backend/app/domain/scoring/engine.py, used ONLY
 * for the marketing page's illustrative demo. Real rankings always come from the API.
 */

export interface DemoCriterion {
  name: string;
  weight: number;
  direction: "benefit" | "cost";
}

export interface DemoOption {
  name: string;
  scores: number[];
}

export const SCORE_RANGE = { min: 1, max: 10 };
/** Same default as the engine's sensitivity_threshold (0.05 on the 0..1 scale). */
export const SENSITIVITY_THRESHOLD = 0.05;

export function rankOptions(options: DemoOption[], criteria: DemoCriterion[]) {
  const totalWeight = criteria.reduce((s, c) => s + Math.max(c.weight, 0), 0) || 1;
  const span = SCORE_RANGE.max - SCORE_RANGE.min;
  const ranked = options
    .map((opt, order) => {
      const total = criteria.reduce((sum, c, i) => {
        const normalized = (opt.scores[i] - SCORE_RANGE.min) / span;
        const good = c.direction === "cost" ? 1 - normalized : normalized;
        return sum + good * (Math.max(c.weight, 0) / totalWeight);
      }, 0);
      return { name: opt.name, total, order };
    })
    .sort((a, b) => b.total - a.total || a.order - b.order);
  const margin = ranked.length > 1 ? ranked[0].total - ranked[1].total : 1;
  return { ranked, margin, stable: margin >= SENSITIVITY_THRESHOLD };
}
