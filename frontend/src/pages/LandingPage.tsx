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
import { motion } from "motion/react";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { MarketingHeader, MarketingFooter } from "@/components/MarketingChrome";
import { marketing } from "@/content/marketing";
import { Magnetic } from "@/components/effects/Magnetic";
import { Tilt } from "@/components/effects/Tilt";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { Marquee } from "@/components/fx/Marquee";
import { Reveal } from "@/components/fx/Reveal";
import { Faq } from "@/features/landing/Faq";
import { FeatureGrid } from "@/features/landing/FeatureGrid";
import { HomeDrafter } from "@/features/landing/HomeDrafter";
import { HeroSynapse } from "@/features/landing/hero/HeroSynapse";
import { LiveDemo } from "@/features/landing/LiveDemo";
import { DecisionNetwork } from "@/features/landing/DecisionNetwork";
import { preloadTour, useTour } from "@/features/tour";
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

const stepIcons = [Compass, ListChecks, SlidersHorizontal, Layers];
const steps = marketing.how.steps.map((step, index) => ({ ...step, icon: stepIcons[index] }));

function FloatingChip({
  className,
  delay,
  children,
}: {
  className: string;
  delay: string;
  children: ReactNode;
}) {
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
        <TrendingDown className="h-3.5 w-3.5 text-primary" /> {marketing.example.commute}
      </FloatingChip>
      <FloatingChip className="-right-6 -top-5 z-10 lg:-right-8" delay="1.5s">
        <ShieldCheck className="h-3.5 w-3.5 text-success" /> {marketing.example.stable}
      </FloatingChip>
      <FloatingChip className="-bottom-5 right-10 z-10" delay="3s">
        <Sparkles className="h-3.5 w-3.5 text-ai" /> {marketing.example.advisory}
      </FloatingChip>

      <Tilt max={2.5}>
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
              <span className="ml-2 text-sm font-medium">{marketing.example.question}</span>
            </div>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
              {marketing.example.label}
            </span>
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
                  <span className="font-mono tabular-nums text-muted">
                    {(row.total * 100).toFixed(1)}
                  </span>
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
              {marketing.example.calculated}
            </span>
            <span className="font-mono">{marketing.example.weights}</span>
          </figcaption>
        </motion.figure>
      </Tilt>
    </div>
  );
}

function Hero() {
  const { startTour } = useTour();
  return (
    <section className="relative isolate">
      <AmbientBackground variant="hero" />
      <HeroSynapse />
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-32 lg:pt-24">
        <motion.div>
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
            {marketing.hero.eyebrow}
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="mt-6 text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.6rem]"
          >
            {marketing.hero.headline}
            <br />
            <span className="text-primary">{marketing.hero.emphasis}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-muted"
          >
            {marketing.hero.text}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Magnetic>
              <ButtonLink to="/register" size="lg" className="group shadow-glow-primary">
                {marketing.hero.primary}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </ButtonLink>
            </Magnetic>
            {/* Opt-in guided tour; without JS the link still jumps to the demo section. */}
            <a
              href="#demo"
              aria-haspopup="dialog"
              onClick={(e) => {
                e.preventDefault();
                startTour("landing");
              }}
              onPointerEnter={preloadTour}
              onFocus={preloadTour}
              className="glass inline-flex h-12 items-center gap-2 rounded-lg px-5 text-[15px] font-medium transition-transform hover:-translate-y-0.5"
            >
              {marketing.hero.secondary}
            </a>
          </motion.div>
          <p className="mt-5 max-w-lg text-xs leading-relaxed text-muted">
            {marketing.hero.reassurance}
          </p>
        </motion.div>
        <div className="min-w-0">
          <DecisionNetwork />
          <RankingPreview />
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
  id,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  id: string;
}) {
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
      <MarketingHeader />
      <main>
        <Hero />

        <section
          aria-label="Example decisions"
          className="border-y border-border/70 bg-surface/40 py-5 backdrop-blur-sm"
        >
          <Marquee
            label="Example decisions"
            items={marketing.useCases.map((q) => (
              <span className="glass inline-flex whitespace-nowrap rounded-full px-4 py-1.5 text-sm text-muted">
                {q}
              </span>
            ))}
          />
        </section>

        <section
          className="mx-auto grid max-w-6xl gap-12 px-4 pt-24 sm:px-6 lg:grid-cols-[1.15fr_1fr]"
          aria-labelledby="problem-heading"
        >
          <SectionHeading
            id="problem-heading"
            eyebrow={marketing.problem.eyebrow}
            title={marketing.problem.title}
            text={marketing.problem.text}
          />
          <Reveal delay={0.08} className="border-l-2 border-primary/40 pl-6 lg:mt-10">
            <p className="eyebrow">{marketing.whyNow.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{marketing.whyNow.title}</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">{marketing.whyNow.text}</p>
            <Link
              to="/why"
              className="mt-6 inline-flex items-center gap-2 rounded-lg py-2 text-sm font-medium text-primary"
            >
              {marketing.whyNow.link}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Reveal>
        </section>

        <section
          id="draft"
          className="scroll-mt-24 mx-auto max-w-5xl px-4 pt-24 sm:px-6"
          aria-labelledby="draft-heading"
        >
          <SectionHeading
            id="draft-heading"
            eyebrow={marketing.drafter.eyebrow}
            title={marketing.drafter.title}
            text={marketing.drafter.text}
          />
          <Reveal className="mt-10" delay={0.05} data-tour="drafter">
            <HomeDrafter />
          </Reveal>
        </section>

        <section
          id="how"
          className="scroll-mt-24 mx-auto max-w-6xl px-4 py-24 sm:px-6"
          aria-labelledby="how-heading"
        >
          <SectionHeading
            id="how-heading"
            eyebrow={marketing.how.eyebrow}
            title={marketing.how.title}
          />
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
                <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-glow-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-5 font-mono text-xs text-muted">
                  {marketing.how.stepLabel} 0{i + 1}
                </p>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section
          id="demo"
          className="relative isolate scroll-mt-24 py-24"
          aria-labelledby="demo-heading"
        >
          <AmbientBackground />
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              id="demo-heading"
              eyebrow={marketing.demo.eyebrow}
              title={marketing.demo.title}
              text={marketing.demo.text}
            />
            <Reveal className="mt-12" delay={0.1}>
              <LiveDemo />
            </Reveal>
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-24 mx-auto max-w-6xl px-4 py-24 sm:px-6"
          aria-labelledby="features-heading"
        >
          <SectionHeading
            id="features-heading"
            eyebrow={marketing.benefits.eyebrow}
            title={marketing.benefits.title}
          />
          <div className="mt-12">
            <FeatureGrid />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-labelledby="trust-heading">
          <SectionHeading
            id="trust-heading"
            eyebrow={marketing.outputs.eyebrow}
            title={marketing.outputs.title}
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <Reveal className="card p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                {marketing.outputs.calculated.label}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{marketing.outputs.calculated.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {marketing.outputs.calculated.text}
              </p>
            </Reveal>
            <Reveal delay={0.08} className="card border-ai/25 p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-ai/10 px-3 py-1 text-xs font-medium text-ai">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {marketing.outputs.advisory.label}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{marketing.outputs.advisory.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {marketing.outputs.advisory.text}
              </p>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-labelledby="method-heading">
          <Reveal className="border-y border-border py-12 sm:py-16">
            <h2
              id="method-heading"
              className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              {marketing.differentiator.title}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
              {marketing.differentiator.text}
            </p>
          </Reveal>
          <div className="mt-12 grid gap-8 md:grid-cols-[.7fr_1.3fr]">
            <div>
              <p className="eyebrow">{marketing.privacy.eyebrow}</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                {marketing.privacy.title}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">{marketing.privacy.text}</p>
          </div>
          {/* TODO: real testimonials. Publish only verified quotes with permission. */}
        </section>

        <section
          id="faq"
          className="scroll-mt-24 mx-auto max-w-3xl px-4 pb-24 sm:px-6"
          aria-labelledby="faq-heading"
        >
          <SectionHeading
            id="faq-heading"
            eyebrow={marketing.faq.eyebrow}
            title={marketing.faq.title}
          />
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
                style={{
                  width: "28rem",
                  height: "28rem",
                  left: "-8rem",
                  top: "-12rem",
                  background: "rgb(var(--aurora-2))",
                  opacity: 0.35,
                }}
              />
              <div
                className="absolute inset-0 opacity-15 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
                aria-hidden="true"
              />
              <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
                {marketing.cta.title}
              </h2>
              <p className="relative mx-auto mt-3 max-w-md opacity-85">{marketing.cta.text}</p>
              <Link
                to="/register"
                className="group relative mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-on-primary px-6 text-[15px] font-medium text-primary transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                {marketing.cta.button}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
