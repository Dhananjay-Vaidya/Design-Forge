import { ArrowDownRight, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { Reveal } from "@/components/fx/Reveal";
import { about } from "@/content/about";
import { brand } from "@/content/marketing";
import { site } from "@/content/site";

export function AboutPage() {
  const { hash } = useLocation();
  useEffect(() => {
    const previous = document.title;
    document.title = "About | DecisionForge AI";
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (hash === "#connect") {
      document.getElementById("connect")?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash]);

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <AmbientBackground />
      </div>
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal className="grid gap-8 pb-16 pt-16 sm:pb-24 sm:pt-24 lg:grid-cols-[1.35fr_.65fr] lg:gap-20">
          <div>
            <p className="eyebrow">{about.hero.eyebrow}</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              {about.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{about.hero.text}</p>
            <a
              href="#connect"
              className="mt-7 inline-flex min-h-11 items-center gap-3 rounded-lg font-medium text-primary"
            >
              {about.hero.contact}
              <ArrowDownRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="self-end border-l-2 border-primary/40 py-2 pl-6">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              DecisionForge AI
            </p>
            <p className="mt-4 max-w-xs text-xl leading-relaxed">{brand.signature}</p>
          </div>
        </Reveal>

        <section
          aria-labelledby="about-story"
          className="grid gap-6 border-t border-border py-12 sm:py-16 md:grid-cols-[.65fr_1.35fr] md:gap-14"
        >
          <div>
            <p className="eyebrow">{about.story.label}</p>
            <h2 id="about-story" className="mt-3 text-2xl font-semibold tracking-tight">
              {about.story.title}
            </h2>
          </div>
          <div className="space-y-5">
            {about.story.paragraphs.map((text) => (
              <p key={text} className="max-w-2xl leading-[1.85] text-muted">
                {text}
              </p>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="about-principle"
          className="grid gap-7 rounded-2xl border border-ai/25 bg-ai-soft p-6 sm:p-10 md:grid-cols-[.65fr_1.35fr] md:gap-14"
        >
          <div>
            <p className="flex items-center gap-2 text-xs font-medium text-ai">
              <Sparkles size={15} aria-hidden="true" />
              {about.principle.label}
            </p>
            <h2 id="about-principle" className="mt-4 text-3xl font-semibold tracking-tight">
              {about.principle.title}
            </h2>
          </div>
          <div>
            <p className="max-w-2xl leading-[1.85] text-muted">{about.principle.text}</p>
            <p className="mt-5 text-sm font-medium text-ai">{about.principle.aside}</p>
          </div>
        </section>

        <div className="grid gap-10 border-b border-border py-12 sm:py-16 md:grid-cols-2 md:gap-16">
          <section aria-labelledby="about-builder">
            <p className="eyebrow">{about.builder.label}</p>
            <h2 id="about-builder" className="mt-3 text-2xl font-semibold tracking-tight">
              {about.builder.soloTitle}
            </h2>
            <p className="mt-5 leading-[1.85] text-muted">{about.builder.soloText}</p>
            {site.founderName && (
              <p className="mt-5 text-sm font-medium">
                {[site.founderName, site.founderRole, site.founderCity].filter(Boolean).join(" · ")}
              </p>
            )}
          </section>
          <section aria-labelledby="about-direction">
            <p className="eyebrow">{about.direction.label}</p>
            <h2 id="about-direction" className="mt-3 text-2xl font-semibold tracking-tight">
              {about.direction.title}
            </h2>
            <p className="mt-5 leading-[1.85] text-muted">{about.direction.text}</p>
          </section>
        </div>

        <section aria-labelledby="about-values" className="py-12 sm:py-16">
          <p className="eyebrow">{about.values.label}</p>
          <h2 id="about-values" className="mt-3 text-3xl font-semibold tracking-tight">
            {about.values.title}
          </h2>
          <div className="mt-8 grid gap-x-12 sm:grid-cols-2">
            {about.values.items.map((value, index) => (
              <div key={value.title} className="flex gap-5 border-t border-border py-6">
                <span className="pt-1 font-mono text-xs text-primary">0{index + 1}</span>
                <div>
                  <h3 className="font-semibold">{value.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{value.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="connect"
          aria-labelledby="about-connect"
          className="scroll-mt-28 border-t border-border py-12"
        >
          <p className="eyebrow">{about.contact.label}</p>
          <h2 id="about-connect" className="mt-3 text-3xl font-semibold tracking-tight">
            {about.contact.title}
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-muted">{about.contact.text}</p>
          <p className="mt-5 break-all font-medium text-primary">{site.contactEmail}</p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
