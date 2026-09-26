import {
  Archive,
  Calculator,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";

import type { DecisionStatus } from "@/types/decision";

export type StatusTone = "neutral" | "primary" | "success" | "warning";

/** Status is always shown as icon + text, never colour alone (docs/07 §8). */
export const statusMeta: Record<DecisionStatus, { label: string; icon: LucideIcon; tone: StatusTone }> = {
  DRAFT: { label: "Draft", icon: CircleDashed, tone: "neutral" },
  SCORED: { label: "Ready to rank", icon: Calculator, tone: "primary" },
  COMMITTED: { label: "Committed", icon: CircleCheck, tone: "success" },
  UNDER_REVIEW: { label: "Review due", icon: CalendarClock, tone: "warning" },
  REVIEWED: { label: "Reviewed", icon: ShieldCheck, tone: "success" },
  ARCHIVED: { label: "Archived", icon: Archive, tone: "neutral" },
};

export const ACTIVE_STATUSES: DecisionStatus[] = ["DRAFT", "SCORED"];
export const COMPLETED_STATUSES: DecisionStatus[] = ["COMMITTED", "UNDER_REVIEW", "REVIEWED"];

/** Mirrors backend settings.score_min / score_max (backend/app/core/config.py). */
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
