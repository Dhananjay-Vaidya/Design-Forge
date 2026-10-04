import { LoaderCircle, Sparkles } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { useAiStatus } from "../hooks";

/** Violet = AI draft / advisory. Used for every AI surface so it never reads as calculated. */
export function AiBadge({ children = "AI draft · Advisory" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ai/10 px-2.5 py-1 text-xs font-medium text-ai">
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

interface AiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: "solid" | "quiet";
}

export function AiButton({
  isLoading,
  variant = "solid",
  className = "",
  children,
  disabled,
  type,
  ...props
}: AiButtonProps) {
  const look =
    variant === "solid"
      ? "bg-ai text-on-ai shadow-soft hover:bg-ai/90"
      : "border border-ai/40 text-ai hover:bg-ai/10";
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex h-10 shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-fast focus-visible:outline-ai active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${look} ${className}`}
      {...props}
    >
      {isLoading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** AX-INF-8: "7 of 20 AI actions left today", with the reset time when it runs out. */
export function AiBudgetMeter() {
  const { data } = useAiStatus();
  if (!data || !data.enabled) return null;
  const { remaining_today: left, daily_limit: limit } = data;
  const out = left <= 0;
  return (
    <div
      className="flex min-w-48 flex-col gap-1.5 text-xs"
      role="meter"
      aria-label="AI actions left today"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={left}
      aria-valuetext={`${left} of ${limit} AI actions left today`}
    >
      <span className={out ? "font-medium text-warning" : "text-muted"}>
        <span className="font-mono tabular-nums">{left}</span> of{" "}
        <span className="font-mono tabular-nums">{limit}</span> AI actions left today
        {out && " · resets at midnight UTC"}
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span
          className={`block h-full rounded-full ${out ? "bg-warning" : "bg-ai/70"}`}
          style={{ width: `${limit > 0 ? Math.round((left / limit) * 100) : 0}%` }}
        />
      </span>
    </div>
  );
}
