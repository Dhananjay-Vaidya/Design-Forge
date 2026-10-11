import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ButtonLink } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Magnetic } from "@/components/effects/Magnetic";
import { brand, marketing } from "@/content/marketing";
import { about, privacy } from "@/content/about";

export function MarketingHeader() {
  const { pathname } = useLocation();
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
        <nav aria-label={marketing.nav.label} className="hidden items-center gap-1 xl:flex">
          {marketing.nav.sections.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2/70 hover:text-text"
            >
              {label}
            </a>
          ))}
          <Link
            to="/why"
            aria-current={pathname === "/why" ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2/70 hover:text-text"
          >
            {marketing.nav.why}
          </Link>
          <Link
            to="/about"
            aria-current={pathname === "/about" ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2/70 hover:text-text"
          >
            {about.nav}
          </Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            to="/login"
            className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-text sm:inline-flex"
          >
            {marketing.nav.signIn}
          </Link>
          <Magnetic max={3}>
            <ButtonLink to="/register" size="sm" className="min-h-11">
              {marketing.nav.start}
            </ButtonLink>
          </Magnetic>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const { pathname } = useLocation();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
        <Link to="/" aria-label="DecisionForge AI home">
          <Logo />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5">
          <Link
            to="/why"
            aria-current={pathname === "/why" ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-lg hover:text-primary"
          >
            {marketing.nav.why}
          </Link>
          <Link
            to="/about"
            aria-current={pathname === "/about" ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-lg hover:text-primary"
          >
            {about.nav}
          </Link>
          <Link
            to="/privacy"
            aria-current={pathname === "/privacy" ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-lg hover:text-primary"
          >
            {privacy.nav}
          </Link>
        </nav>
        <p className="text-xs">{brand.signature}</p>
      </div>
    </footer>
  );
}
