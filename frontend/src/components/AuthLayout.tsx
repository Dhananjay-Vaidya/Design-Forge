import { Calculator, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const points = [
  { icon: Calculator, text: "Weighted scoring you can audit line by line." },
  { icon: ShieldCheck, text: "The same inputs always give the same ranking." },
  { icon: Sparkles, text: "AI is advisory only, and always labelled as such." },
];

interface AuthLayoutProps {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="DecisionForge AI — home" className="rounded-lg">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="animate-rise">
            <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-[15px] text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-border bg-surface lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div className="grid-texture absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="relative max-w-md">
          <p className="eyebrow">Decisions, made legible</p>
          <p className="mt-4 text-3xl font-semibold leading-tight tracking-tight">
            Stop going in circles. <span className="text-primary">Weigh it, score it, rank it.</span>
          </p>
          <ul className="mt-10 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-muted">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
