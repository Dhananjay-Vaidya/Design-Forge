import { ArrowRight, Calculator, Sparkles } from "lucide-react";
import { useEffect } from "react";

import { ButtonLink } from "@/components/Button";
import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { Reveal } from "@/components/fx/Reveal";
import { brand, marketing, whyContent } from "@/content/marketing";

export function WhyPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = `${whyContent.title} | DecisionForge AI`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <AmbientBackground />
      </div>
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <header className="grid gap-10 pb-16 pt-16 sm:pb-24 sm:pt-24 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          <div>
            <p className="eyebrow">{whyContent.eyebrow}</p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              {whyContent.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{whyContent.lead}</p>
            <ButtonLink to="/register" className="mt-8">
              {marketing.hero.primary}
              <ArrowRight size={16} aria-hidden="true" />
            </ButtonLink>
          </div>
          <div className="self-end border-l-2 border-primary/40 py-2 pl-6 sm:pl-8">
            <blockquote className="max-w-lg text-2xl font-medium leading-relaxed tracking-tight">
              {marketing.whyNow.quote}
            </blockquote>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted">
              {whyContent.introduction}
            </p>
          </div>
        </header>

        <div className="border-t border-border">
          {whyContent.sections.map((section, index) => (
            <Reveal
              as="section"
              key={section.title}
              className="grid gap-6 border-b border-border py-10 sm:py-14 md:grid-cols-[.65fr_1.35fr] md:gap-12"
              aria-labelledby={`why-section-${index}`}
            >
              <div>
                <span
                  className={`font-mono text-xs ${section.tone === "ai" ? "text-ai" : "text-primary"}`}
                >
                  0{index + 1}
                </span>
                <h2
                  id={`why-section-${index}`}
                  className="mt-3 text-2xl font-semibold tracking-tight"
                >
                  {section.title}
                </h2>
              </div>
              <div>
                <p className="max-w-2xl text-base leading-[1.85] text-muted">{section.text}</p>
                <p
                  className={`mt-5 text-sm font-medium ${section.tone === "ai" ? "text-ai" : "text-primary"}`}
                >
                  {section.aside}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <section className="grid gap-8 py-14 md:grid-cols-2" aria-label={marketing.outputs.title}>
          {([marketing.outputs.calculated, marketing.outputs.advisory] as const).map(
            (output, index) => {
              const Icon = index === 0 ? Calculator : Sparkles;
              return (
                <div
                  key={output.label}
                  className={`border-l-2 pl-6 ${index === 0 ? "border-primary/40" : "border-ai/40"}`}
                >
                  <p
                    className={`flex items-center gap-2 text-xs font-medium ${index === 0 ? "text-primary" : "text-ai"}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {output.label}
                  </p>
                  <h2 className="mt-3 text-xl font-semibold">{output.title}</h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{output.text}</p>
                </div>
              );
            },
          )}
        </section>

        <section className="rounded-2xl bg-primary-soft p-7 sm:p-12" aria-labelledby="why-cta">
          <p className="text-sm font-medium text-primary">{brand.principle}</p>
          <h2 id="why-cta" className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            {marketing.cta.title}
          </h2>
          <p className="mt-4 max-w-xl text-muted">{marketing.cta.text}</p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <ButtonLink to="/register">
              {marketing.cta.button}
              <ArrowRight size={16} aria-hidden="true" />
            </ButtonLink>
            <a href="/#demo" className="rounded-lg py-2 text-sm font-medium text-primary">
              {marketing.hero.secondary}
            </a>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
