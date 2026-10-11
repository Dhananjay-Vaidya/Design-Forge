import { ArrowRight, Compass, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button, ButtonLink } from "@/components/Button";
import { about } from "@/content/about";
import { preloadTour } from "@/features/tour";

export function OnboardingPaths() {
  const navigate = useNavigate();
  const copy = about.onboarding;

  function focusContact() {
    document.getElementById("connect")?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    (document.getElementById("contact-name") ?? document.getElementById("contact-receipt"))?.focus({
      preventScroll: true,
    });
  }

  return (
    <section aria-labelledby="about-next" className="border-t border-border pt-12 sm:pt-16">
      <p className="eyebrow">{copy.label}</p>
      <h2 id="about-next" className="mt-3 text-3xl font-semibold tracking-tight">
        {copy.title}
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="flex flex-col rounded-2xl border border-primary/25 bg-primary-soft p-6">
          <h3 className="text-xl font-semibold">{copy.start.title}</h3>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{copy.start.text}</p>
          <ButtonLink to="/register" className="mt-6 min-h-11 self-start">
            {copy.start.action}
            <ArrowRight size={16} aria-hidden="true" />
          </ButtonLink>
        </article>
        <article className="flex flex-col rounded-2xl border border-border p-6">
          <h3 className="text-xl font-semibold">{copy.tour.title}</h3>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{copy.tour.text}</p>
          <Button
            variant="secondary"
            className="mt-6 min-h-11 self-start"
            onMouseEnter={() => void preloadTour()}
            onFocus={() => void preloadTour()}
            onClick={() => navigate("/?tour=landing")}
          >
            {copy.tour.action}
            <Compass size={16} aria-hidden="true" />
          </Button>
        </article>
        <article className="flex flex-col rounded-2xl border border-border p-6">
          <h3 className="text-xl font-semibold">{copy.talk.title}</h3>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{copy.talk.text}</p>
          <Button variant="secondary" className="mt-6 min-h-11 self-start" onClick={focusContact}>
            {copy.talk.action}
            <MessageSquare size={16} aria-hidden="true" />
          </Button>
        </article>
      </div>
    </section>
  );
}
