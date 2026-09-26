import type { DecisionStatus } from "@/types/decision";

import { type StatusTone, statusMeta } from "../status";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-2 text-muted ring-border",
  primary: "bg-primary-soft text-primary ring-primary/20",
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-warning ring-warning/25",
};

export function StatusChip({ status }: { status: DecisionStatus }) {
  const { label, icon: Icon, tone } = statusMeta[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
