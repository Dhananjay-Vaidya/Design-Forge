import {
  ArrowRight,
  Calculator,
  Compass,
  Layers,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toPoints } from "@/lib/format";

/*
 * Illustrative example only (labelled as such in the UI). Totals are computed with the same
 * weighted-sum formula as backend/app/domain/scoring/engine.py so the preview never lies.
 */
const exampleCriteria = [
  { name: "Salary", weight: 0.4, direction: "benefit" },
  { name: "Growth", weight: 0.35, direction: "benefit" },
  { name: "Commute", weight: 0.25, direction: "cost" },
] as const;

const exampleOptions = [
  { name: "Offer B — scale-up", scores: [6, 9, 3] },
  { name: "Offer A — enterprise", scores: [8, 6, 7] },
  { name: "Offer C — agency", scores: [7, 5, 5] },
];

const exampleRanking = exampleOptions
  .map((opt) => ({
    name: opt.name,
    total: exampleCriteria.reduce((sum, crit, i) => {
      const normalized = (opt.scores[i] - 1) / 9;
      return sum + (crit.direction === "cost" ? 1 - normalized : normalized) * crit.weight;
    }, 0),
  }))
  .sort((a, b) => b.total - a.total);

const steps = [
  { icon: Compass, title: "Frame it", text: "Name the decision, the context, and when it needs to be made." },
  { icon: Layers, title: "List the options", text: "Two or more real alternatives you're choosing between." },
  { icon: SlidersHorizontal, title: "Weigh what matters", text: "Criteria with weights, and whether higher or lower is better." },
  { icon: ListChecks, title: "Score and rank", text: "Score each option 1–10 and get a ranking with a stability check." },
];

function RankingPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-3xl" aria-hidden="true" />
      <figure className="card overflow-hidden shadow-lift">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <span className="text-sm font-medium">Which job offer should I accept?</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">Example</span>
        </div>
        <div className="space-y-4 p-5">
          {exampleRanking.map((row, i) => (
            <div key={row.name}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span className="font-mono text-xs text-muted">{i + 1}</span>
                  {row.name}
                  {i === 0 && <Trophy className="h-3.5 w-3.5 text-primary" aria-label="Leader" />}
                </span>
                <span className="font-mono tabular-nums text-muted">{toPoints(row.total)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full origin-left animate-grow-x rounded-full ${i === 0 ? "bg-primary" : "bg-primary/35"}`}
                  style={{ width: `${row.total * 100}%`, animationDelay: `${200 + i * 120}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-surface-2/60 px-5 py-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Calculated, not AI
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            Leader stable
          </span>
          <span className="font-mono">
            {exampleCriteria.map((c) => `${c.name} ${Math.round(c.weight * 100)}%`).join(" · ")}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            to="/login"
            className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-text sm:inline-flex"
          >
            Sign in
          </Link>
          <ButtonLink to="/register" size="sm">
            Get started
          </ButtonLink>
        </div>
      </header>

      <main>
        <section className="relative">
          <div
            className="grid-texture absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
            aria-hidden="true"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-28 lg:pt-24">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                Deterministic by design
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                Turn a hard decision into a{" "}
                <span className="text-primary">transparent, repeatable</span> process.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Score alternatives against weighted criteria and get a deterministic ranking you can
                explain. Optionally add Gemini-powered questions, risks, and scenarios — advisory
                only, never the final word.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <ButtonLink to="/register" size="lg">
                  Start deciding
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink to="/login" size="lg" variant="secondary">
                  Sign in
                </ButtonLink>
              </div>
            </div>
            <div className="animate-rise [animation-delay:120ms]">
              <RankingPreview />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface" aria-labelledby="how-heading">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading" className="mt-3 max-w-lg text-3xl font-semibold tracking-tight">
              Four steps from “I can't decide” to a reasoned choice.
            </h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="bg-surface p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs text-muted">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-labelledby="trust-heading">
          <p className="eyebrow">Two kinds of output, never mixed</p>
          <h2 id="trust-heading" className="mt-3 max-w-xl text-3xl font-semibold tracking-tight">
            You always know which answer came from maths and which from a model.
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="card p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                Calculated
              </span>
              <h3 className="mt-5 text-lg font-semibold">The ranking</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                A weighted sum of your own scores. Identical inputs always produce the identical
                ranking, with a sensitivity check that tells you when the leader could flip.
              </p>
            </div>
            <div className="card border-ai/25 p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-ai/10 px-3 py-1 text-xs font-medium text-ai">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Advisory
              </span>
              <h3 className="mt-5 text-lg font-semibold">The AI insights</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Optional questions, risks and scenarios to challenge your thinking. Clearly marked,
                kept separate, and never able to change the ranking.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-8 py-14 text-center text-on-primary sm:px-14">
            <div
              className="absolute inset-0 opacity-15 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
              aria-hidden="true"
            />
            <h2 className="relative text-3xl font-semibold tracking-tight">Your next hard call deserves a method.</h2>
            <p className="relative mx-auto mt-3 max-w-md opacity-85">
              Create an account and frame your first decision in a couple of minutes.
            </p>
            <Link
              to="/register"
              className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-on-primary px-6 text-[15px] font-medium text-primary transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Create your account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo />
          <p>Deterministic ranking · advisory AI.</p>
        </div>
      </footer>
    </div>
  );
}
