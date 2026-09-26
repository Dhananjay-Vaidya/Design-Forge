import { useMutation } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
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
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
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
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold uppercase text-primary">
          {name.charAt(0)}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-64 origin-top-right animate-scale-in rounded-xl border border-border bg-surface p-1.5 shadow-lift"
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
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the main region on route change for screen-reader users (docs/07 §8).
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
      isActive ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text"
    }`;

  return (
    <div className="min-h-dvh bg-bg text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/app" aria-label="DecisionForge AI — dashboard" className="rounded-lg">
              <Logo className="max-sm:[&>span:last-child]:hidden" />
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-1">
              <NavLink to="/app" end className={navClass}>
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                Dashboard
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <ButtonLink to="/app/decisions/new" size="sm" className="mr-1 max-sm:w-9 max-sm:px-0">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">New decision</span>
            </ButtonLink>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
