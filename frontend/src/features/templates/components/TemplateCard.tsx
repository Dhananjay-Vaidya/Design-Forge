import {
  ArrowRight,
  Briefcase,
  Building2,
  GraduationCap,
  House,
  LayoutTemplate,
  type LucideIcon,
  ShoppingBag,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { SpotlightCard } from "@/components/fx/SpotlightCard";
import type { Template } from "@/types/template";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Career: Briefcase,
  Housing: House,
  Business: Building2,
  Education: GraduationCap,
  Purchase: ShoppingBag,
};

const SHADES = [
  "bg-primary",
  "bg-primary/80",
  "bg-primary/60",
  "bg-primary/45",
  "bg-primary/30",
  "bg-primary/20",
];
const PREVIEW_CRITERIA = 4;

/** Relative weights as one slim bar; the criteria list below carries the same information as text. */
function MiniWeightBar({ weights }: { weights: number[] }) {
  return (
    <div className="flex h-1.5 gap-px overflow-hidden rounded-full" aria-hidden="true">
      {weights.map((w, i) => (
        <span key={i} className={SHADES[i % SHADES.length]} style={{ flexGrow: w }} />
      ))}
    </div>
  );
}

interface TemplateCardProps {
  template: Template;
  onUse: (template: Template) => void;
  onDelete?: (template: Template) => void;
}

export function TemplateCard({ template, onUse, onDelete }: TemplateCardProps) {
  const Icon = CATEGORY_ICON[template.category] ?? LayoutTemplate;
  const shown = template.criteria.slice(0, PREVIEW_CRITERIA);
  const more = template.criteria.length - shown.length;

  return (
    <SpotlightCard className="card group flex h-full flex-col p-5 transition-[transform,box-shadow,border-color] duration-base ease-out hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary transition-transform duration-base ease-out group-hover:-rotate-6 group-hover:scale-110">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {template.kind === "mine" && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(template)}
            aria-label={`Delete template ${template.name}`}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <h3 className="mt-4 font-semibold tracking-tight">{template.name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{template.description}</p>

      <div className="mt-5">
        <MiniWeightBar weights={template.criteria.map((c) => Number(c.weight))} />
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${template.name} criteria`}>
          {shown.map((c) => {
            const Direction = c.direction === "cost" ? TrendingDown : TrendingUp;
            return (
              <li
                key={c.name}
                className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted"
              >
                <Direction className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">
                  {c.direction === "cost" ? "Lower is better: " : "Higher is better: "}
                </span>
                {c.name}
              </li>
            );
          })}
          {more > 0 && (
            <li className="inline-flex items-center rounded-md px-2 py-1 text-xs text-muted">
              +{more} more
            </li>
          )}
        </ul>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className="font-mono text-xs text-muted">{template.criteria.length} criteria</span>
        <button
          type="button"
          onClick={() => onUse(template)}
          className="pressable inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary-soft px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
        >
          Use template
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </div>
    </SpotlightCard>
  );
}
