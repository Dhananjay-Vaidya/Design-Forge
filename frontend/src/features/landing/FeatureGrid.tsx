import {
  Calculator,
  ListOrdered,
  Keyboard,
  type LucideIcon,
  MoonStar,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from "lucide-react";

import { Reveal } from "@/components/fx/Reveal";
import { SpotlightCard } from "@/components/fx/SpotlightCard";

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
  className?: string;
  accent?: "primary" | "ai";
  visual?: "breakdown" | "keys";
}

/** Every item here describes something the product actually does today. */
const FEATURES: Feature[] = [
  {
    icon: Calculator,
    title: "A ranking you can audit",
    text: "Every total is broken down into the points each criterion contributed, so you can see exactly why the leader leads.",
    className: "md:col-span-2",
    visual: "breakdown",
  },
  {
    icon: ShieldCheck,
    title: "Sensitivity check",
    text: "Flags a close call when a small change in weights or scores could flip the winner.",
  },
  {
    icon: ListOrdered,
    title: "Guided setup",
    text: "A three-step wizard takes you from the question to options and criteria, then straight to scoring.",
  },
  {
    icon: Keyboard,
    title: "Keyboard-first scoring",
    text: "Arrow keys and Enter move through the matrix. Scores save automatically as you type.",
    className: "md:col-span-2",
    visual: "keys",
  },
  {
    icon: TrendingDown,
    title: "Plain-language criteria",
    text: "Mark each criterion “higher is better” or “lower is better”. Weights normalise to 100% for you.",
  },
  {
    icon: Sparkles,
    title: "AI that stays advisory",
    text: "Optional Gemini questions and risks are labelled and kept apart. They can never change the ranking.",
    accent: "ai",
  },
  {
    icon: MoonStar,
    title: "Light and dark",
    text: "Follows your system setting, or switch any time. Motion respects reduced-motion preferences.",
  },
];

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

function KeysVisual() {
  return (
    <div className="mt-5 flex gap-1.5" aria-hidden="true">
      {["↑", "↓", "Enter"].map((k) => (
        <kbd
          key={k}
          className="rounded-md border border-border-strong bg-surface px-2 py-1 font-mono text-xs shadow-[inset_0_-2px_0_rgb(var(--color-border-strong))]"
        >
          {k}
        </kbd>
      ))}
    </div>
  );
}

export function FeatureGrid() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {FEATURES.map((f, i) => (
        <Reveal as="li" key={f.title} delay={(i % 3) * 0.06} className={f.className}>
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
            {f.visual === "keys" && <KeysVisual />}
          </SpotlightCard>
        </Reveal>
      ))}
    </ul>
  );
}
