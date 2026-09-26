import {
  ArrowRight,
  Calculator,
  Compass,
  Layers,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  Trophy,
} from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { Marquee } from "@/components/fx/Marquee";
import { Reveal } from "@/components/fx/Reveal";
import { Faq } from "@/features/landing/Faq";
import { FeatureGrid } from "@/features/landing/FeatureGrid";
import { LiveDemo } from "@/features/landing/LiveDemo";
import { rankOptions } from "@/lib/scoring";

const EASE = [0.16, 1, 0.3, 1] as const;

/* Illustrative example only (labelled "Example" in the UI); computed with the engine's formula. */
const preview = rankOptions(
  [
    { name: "Offer B — scale-up", scores: [6, 9, 3] },
    { name: "Offer A — enterprise", scores: [8, 6, 7] },
    { name: "Offer C — agency", scores: [7, 5, 5] },
  ],
  [
    { name: "Salary", weight: 40, direction: "benefit" },
    { name: "Growth", weight: 35, direction: "benefit" },
    { name: "Commute", weight: 25, direction: "cost" },
  ],
);

const steps = [
  { icon: Compass, title: "Frame it", text: "Name the decision, the context, and when it needs to be made." },
  { icon: Layers, title: "List the options", text: "Two or more real alternatives you're choosing between." },
  { icon: SlidersHorizontal, title: "Weigh what matters", text: "Criteria with weights, and whether higher or lower is better." },
  { icon: ListChecks, title: "Score and rank", text: "Score each option 1–10 and get a ranking with a stability check." },
];

/** Example questions people weigh up; shown as a ticker of use cases, not as customer claims. */
const USE_CASES = [
  "Which job offer should I accept?",
  "Rent or buy?",
  "Which university fits best?",
  "Build it or buy it?",
  "Which laptop is worth it?",
  "Which city should we move to?",
  "Which candidate should we hire?",
  "Which cloud provider?",
  "Which supplier should we sign with?",
  "Which feature ships first?",
];

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div
        className={`mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl px-3 transition-all duration-base ease-out sm:px-4 ${
          scrolled ? "glass" : "border border-transparent"
        }`}
      >
        <Link to="/" aria-label="DecisionForge AI — home" className="rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {[
            ["#how", "How it works"],
            ["#demo", "Live demo"],
            ["#features", "Features"],
            ["#faq", "FAQ"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2/70 hover:text-text"
            >
              {label}
            </a>
          ))}
        </nav>
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
      </div>
    </header>
  );
}

function FloatingChip({ className, delay, children }: { className: string; delay: string; children: ReactNode }) {
  return (
    <div
      className={`glass float-y absolute hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium sm:flex ${className}`}
      style={{ animationDelay: delay }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

function RankingPreview() {
  return (
    <div className="relative">
      <FloatingChip className="-top-5 left-6 z-10" delay="0s">
        <TrendingDown className="h-3.5 w-3.5 text-primary" /> Commute · lower is better
      </FloatingChip>
      <FloatingChip className="-right-6 -top-5 z-10 lg:-right-8" delay="1.5s">
        <ShieldCheck className="h-3.5 w-3.5 text-success" /> Leader stable
      </FloatingChip>
      <FloatingChip className="-bottom-5 right-10 z-10" delay="3s">
        <Sparkles className="h-3.5 w-3.5 text-ai" /> AI stays advisory
      </FloatingChip>

      <motion.figure
        initial={{ opacity: 0, y: 24, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
        style={{ transformPerspective: 1200 }}
        className="glass-strong overflow-hidden rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex gap-1" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            </span>
            <span className="ml-2 text-sm font-medium">Which job offer should I accept?</span>
          </div>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">Example</span>
        </div>
        <div className="space-y-4 p-5">
          {preview.ranked.map((row, i) => (
            <div key={row.name}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span className="font-mono text-xs text-muted">{i + 1}</span>
                  {row.name}
                  {i === 0 && <Trophy className="h-3.5 w-3.5 text-primary" aria-label="Leader" />}
                </span>
                <span className="font-mono tabular-nums text-muted">{(row.total * 100).toFixed(1)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full origin-left animate-grow-x rounded-full ${
                    i === 0 ? "bg-gradient-to-r from-primary to-primary/70" : "bg-primary/35"
                  }`}
                  style={{ width: `${row.total * 100}%`, animationDelay: `${500 + i * 140}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 bg-surface-2/50 px-5 py-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Calculated, not AI
          </span>
          <span className="font-mono">Salary 40% · Growth 35% · Commute 25%</span>
        </figcaption>
      </motion.figure>
    </div>
  );
}

function Hero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 60]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0.3]);

  return (
    <section className="relative isolate">
      <AmbientBackground variant="hero" />
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-32 lg:pt-24">
        <motion.div style={{ y, opacity }}>
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Deterministic by design
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="mt-6 text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.6rem]"
          >
            Turn a hard decision into a <span className="text-gradient">transparent, repeatable</span> process.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-muted"
          >
            Score alternatives against weighted criteria and get a deterministic ranking you can explain.
            Optionally add Gemini-powered questions, risks, and scenarios — advisory only, never the final word.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <ButtonLink to="/register" size="lg" className="group shadow-[0_8px_30px_-8px_rgb(var(--color-primary)/0.6)]">
              Start deciding
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </ButtonLink>
            <a
              href="#demo"
              className="glass inline-flex h-12 items-center gap-2 rounded-lg px-5 text-[15px] font-medium transition-transform hover:-translate-y-0.5"
            >
              Try the live demo
            </a>
          </motion.div>
        </motion.div>
        <RankingPreview />
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, text, id }: { eyebrow: string; title: string; text?: string; id: string }) {
  return (
    <Reveal className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {text && <p className="mt-3 text-lg leading-relaxed text-muted">{text}</p>}
    </Reveal>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <Header />
      <main>
        <Hero />

        <section aria-label="Example decisions" className="border-y border-border/70 bg-surface/40 py-5 backdrop-blur-sm">
          <Marquee
            label="Example decisions"
            items={USE_CASES.map((q) => (
              <span className="glass inline-flex whitespace-nowrap rounded-full px-4 py-1.5 text-sm text-muted">{q}</span>
            ))}
          />
        </section>

        <section id="how" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-24 sm:px-6" aria-labelledby="how-heading">
          <SectionHeading id="how-heading" eyebrow="How it works" title="Four steps from “I can't decide” to a reasoned choice." />
          <ol className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <motion.span
              aria-hidden="true"
              className="absolute left-0 right-0 top-5 hidden h-px origin-left bg-gradient-to-r from-primary/60 via-primary/30 to-transparent lg:block"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: EASE }}
            />
            {steps.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={i * 0.1} className="relative">
                <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-[0_6px_20px_-6px_rgb(var(--color-primary)/0.7)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-5 font-mono text-xs text-muted">Step 0{i + 1}</p>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="demo" className="relative isolate scroll-mt-24 py-24" aria-labelledby="demo-heading">
          <AmbientBackground />
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              id="demo-heading"
              eyebrow="Live demo"
              title="Drag the weights. Watch the answer move."
              text="Same formula as the real engine. Notice how the stability check reacts when two offers get close."
            />
            <Reveal className="mt-12" delay={0.1}>
              <LiveDemo />
            </Reveal>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-24 sm:px-6" aria-labelledby="features-heading">
          <SectionHeading
            id="features-heading"
            eyebrow="Features"
            title="Built for decisions you'll want to explain later."
          />
          <div className="mt-12">
            <FeatureGrid />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-labelledby="trust-heading">
          <SectionHeading
            id="trust-heading"
            eyebrow="Two kinds of output, never mixed"
            title="You always know which answer came from maths and which from a model."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <Reveal className="card p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                Calculated
              </span>
              <h3 className="mt-5 text-lg font-semibold">The ranking</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                A weighted sum of your own scores. Identical inputs always produce the identical ranking, with a
                sensitivity check that tells you when the leader could flip.
              </p>
            </Reveal>
            <Reveal delay={0.08} className="card border-ai/25 p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-ai/10 px-3 py-1 text-xs font-medium text-ai">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Advisory
              </span>
              <h3 className="mt-5 text-lg font-semibold">The AI insights</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Optional questions, risks and scenarios to challenge your thinking. Clearly marked, kept separate,
                and never able to change the ranking.
              </p>
            </Reveal>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 mx-auto max-w-3xl px-4 pb-24 sm:px-6" aria-labelledby="faq-heading">
          <SectionHeading id="faq-heading" eyebrow="FAQ" title="Questions, answered." />
          <Reveal className="mt-10">
            <Faq />
          </Reveal>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-on-primary sm:px-14">
              <div
                aria-hidden="true"
                className="aurora-blob aurora-a"
                style={{ width: "28rem", height: "28rem", left: "-8rem", top: "-12rem", background: "rgb(var(--aurora-2))", opacity: 0.35 }}
              />
              <div
                className="absolute inset-0 opacity-15 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
                aria-hidden="true"
              />
              <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Your next hard call deserves a method.</h2>
              <p className="relative mx-auto mt-3 max-w-md opacity-85">
                Create an account and frame your first decision in a couple of minutes.
              </p>
              <Link
                to="/register"
                className="group relative mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-on-primary px-6 text-[15px] font-medium text-primary transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Create your account
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
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
