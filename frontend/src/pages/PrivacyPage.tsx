import { useEffect } from "react";
import { Link } from "react-router-dom";

import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { privacy } from "@/content/about";
import { site } from "@/content/site";

export function PrivacyPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Privacy | DecisionForge AI";
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-dvh">
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">{privacy.nav}</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {privacy.title}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">{privacy.lead}</p>
        <div className="mt-10">
          {privacy.sections.map((section) => (
            <section key={section.title} className="border-t border-border py-8">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-4 leading-[1.85] text-muted">{section.text}</p>
            </section>
          ))}
        </div>
        <div className="border-t border-border pt-8">
          <p className="font-medium">{privacy.contact}</p>
          <p className="mt-3 break-all text-primary">{site.contactEmail}</p>
          <Link
            to="/about#connect"
            className="mt-5 inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-primary"
          >
            {privacy.back}
          </Link>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
