import {
  Calculator,
  ShieldCheck,
  Sparkles,
  History,
  LayoutTemplate,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/fx/Reveal";
import { Tilt } from "@/components/effects/Tilt";
import { SpotlightCard } from "@/components/fx/SpotlightCard";

import { marketing } from "@/content/marketing";

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
  className?: string;
  accent?: "primary" | "ai";
  visual?: "breakdown";
  /** Anchor for the landing tour. */
  tour?: string;
}

/** Every item here describes something the product actually does today. */
const featurePresentation: Omit<Feature, "title" | "text">[] = [
  { icon: Calculator, className: "md:col-span-2", visual: "breakdown" },
  { icon: ShieldCheck },
  { icon: Sparkles, accent: "ai", tour: "ai-advisory" },
  { icon: History, className: "md:col-span-2" },
  { icon: LayoutTemplate, tour: "templates" },
  { icon: LockKeyhole, className: "md:col-span-2" },
];
const FEATURES: Feature[] = marketing.benefits.items.map((copy, index) => ({
  ...copy,
  ...featurePresentation[index],
}));

function BreakdownVisual() {
  const rows = [
    { name: "Salary", pts: 31, w: "w-[62%]" },
    { name: "Growth", pts: 17, w: "w-[34%]" },
    { name: "Commute", pts: 10, w: "w-[20%]" },
  ];
  return (
    <div className="mt-5 space-y-2" aria-hidden="true">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-3 text-xs">
          <span className="w-16 text-muted">{r.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full origin-left animate-grow-x rounded-full bg-primary ${r.w}`}
              style={{ opacity: 1 - i * 0.25, animationDelay: `${i * 120}ms` }}
            />
          </div>
          <span className="w-8 text-right font-mono tabular-nums">{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

export function FeatureGrid() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {FEATURES.map((f, i) => (
        <Reveal
          as="li"
          key={f.title}
          delay={(i % 3) * 0.06}
          className={f.className}
          data-tour={f.tour}
        >
          <Tilt max={2} className="h-full">
            <SpotlightCard className="group h-full rounded-2xl border border-border bg-surface p-6 transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-1 hover:shadow-lift">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-base ease-out group-hover:scale-110 group-hover:-rotate-6 ${
                  f.accent === "ai" ? "bg-ai/10 text-ai" : "bg-primary-soft text-primary"
                }`}
              >
                <f.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
              {f.visual === "breakdown" && <BreakdownVisual />}
            </SpotlightCard>
          </Tilt>
        </Reveal>
      ))}
    </ul>
  );
}
