import { useMutation } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, Plus, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { entrance } from "@/lib/motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { LabNavigation } from "@/components/LabNavigation";
import { CommandPalette } from "@/components/CommandPalette";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { logoutRequest } from "@/features/auth/api";
import { useAuthStore } from "@/stores/authStore";

function UserMenu() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clear();
      navigate("/login", { replace: true });
    },
  });

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(),
    );
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
      }
      if (e.key === "Tab") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const name = user.profile.display_name || user.email.split("@")[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-ai text-sm font-semibold uppercase text-white shadow-[0_4px_14px_-4px_rgb(var(--color-primary)/0.7)]">
          {name.charAt(0)}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong absolute right-0 top-12 z-40 w-64 origin-top-right rounded-xl p-1.5"
          >
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-danger transition-colors hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {logoutMutation.isPending ? "Signing out…" : "Sign out"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Tabs inside one decision share a key so switching tabs doesn't replay the page transition. */
function transitionKey(pathname: string) {
  return pathname.split("/").slice(0, 4).join("/");
}

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  return (
    !!node && (node.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName))
  );
}

export function AppShell() {
  const reduced = useReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();
  // Captured per render so the exiting page keeps showing its own content while it fades out.
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Move focus to the main region on route change for screen-reader users (docs/07 §8).
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  // Ctrl/⌘+K opens the palette; "n" starts a new decision (docs/07 §12) when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (
        e.key === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTypingTarget(e.target) &&
        !paletteOpen
      ) {
        navigate("/app/decisions/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, paletteOpen]);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
      isActive ? "text-text" : "text-muted hover:text-text"
    }`;

  return (
    <div className="relative isolate min-h-dvh text-text">
      <div className="fixed inset-0 -z-10">
        <AmbientBackground />
      </div>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
        <div className="glass mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 rounded-2xl px-3 sm:px-4">
          <div className="flex items-center gap-4">
            <Link to="/app" aria-label="DecisionForge AI — dashboard" className="rounded-lg">
              <Logo className="max-sm:[&>span:last-child]:hidden" />
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-1">
              <NavLink to="/app" end className={navClass}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-lg bg-surface-2"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <LayoutDashboard className="relative h-4 w-4" aria-hidden="true" />
                    <span className="relative max-sm:sr-only">Dashboard</span>
                  </>
                )}
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette (Ctrl+K)"
              className="group inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface/50 px-2.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-text max-md:w-9 max-md:justify-center max-md:px-0"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="max-md:hidden">Search</span>
              <kbd className="ml-3 rounded border border-border px-1.5 font-mono text-[10px] max-md:hidden">
                Ctrl K
              </kbd>
            </button>
            <ButtonLink
              to="/app/decisions/new"
              size="sm"
              className="max-sm:w-9 max-sm:px-0"
              title="New decision (N)"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">New decision</span>
            </ButtonLink>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-10">
        <LabNavigation />
        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={transitionKey(location.pathname)} {...entrance(!!reduced)}>
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
