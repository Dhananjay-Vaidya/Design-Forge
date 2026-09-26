import { Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";

import type { Direction } from "@/types/decision";

interface DirectionToggleProps {
  value: Direction;
  onChange: (value: Direction) => void;
  label?: string;
  size?: "sm" | "md";
}

/** Plain-language wording for benefit/cost (docs/07 §5 criteria editor). */
export function DirectionToggle({ value, onChange, label = "Direction", size = "md" }: DirectionToggleProps) {
  const options: { value: Direction; text: string; icon: typeof TrendingUp }[] = [
    { value: "benefit", text: "Higher is better", icon: TrendingUp },
    { value: "cost", text: "Lower is better", icon: TrendingDown },
  ];
  const height = size === "sm" ? "h-8 text-xs" : "h-9 text-sm";

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map(({ value: v, text, icon: Icon }) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(v)}
            className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 font-medium transition-colors ${height} ${
              selected ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {text}
          </button>
        );
      })}
    </div>
  );
}

interface WeightStepperProps {
  value: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  label: string;
  invalid?: boolean;
}

/** Weight must be > 0 (CriterionCreateRequest.weight gt=0); steppers move in whole points. */
export function WeightStepper({ value, onChange, onCommit, label, invalid }: WeightStepperProps) {
  const numeric = Number(value);
  const step = (delta: number) => {
    const base = Number.isFinite(numeric) ? numeric : 1;
    const next = Math.max(1, Math.round(base) + delta);
    onChange(String(next));
    onCommit?.(String(next));
  };

  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!(numeric > 1)}
        aria-label={`Decrease ${label}`}
        className="flex h-full w-8 cursor-pointer items-center justify-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit?.(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && onCommit?.(e.currentTarget.value)}
        className={`h-full w-12 border-x border-border bg-transparent text-center font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40 ${
          invalid ? "text-danger" : ""
        }`}
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={`Increase ${label}`}
        className="flex h-full w-8 cursor-pointer items-center justify-center rounded-r-lg text-muted hover:bg-surface-2 hover:text-text"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const SEGMENT_SHADES = ["bg-primary", "bg-primary/70", "bg-primary/50", "bg-primary/35", "bg-primary/25"];

interface WeightBarProps {
  items: { key: string; name: string; weight: number }[];
}

/** Live "weights normalise to 100%" helper (BR-004). */
export function WeightBar({ items }: WeightBarProps) {
  const total = items.reduce((sum, i) => sum + (i.weight > 0 ? i.weight : 0), 0);
  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {items.map((item, i) => (
          <div
            key={item.key}
            className={`${SEGMENT_SHADES[i % SEGMENT_SHADES.length]} transition-[flex-grow] duration-base ease-out first:rounded-l-full last:rounded-r-full`}
            style={{ flexGrow: Math.max(item.weight, 0) }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted" aria-label="Normalised weights">
        {items.map((item, i) => (
          <li key={item.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${SEGMENT_SHADES[i % SEGMENT_SHADES.length]}`} aria-hidden="true" />
            {item.name}
            <span className="font-mono tabular-nums text-text">{Math.round((Math.max(item.weight, 0) / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
