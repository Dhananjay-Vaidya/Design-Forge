import type { PropsWithChildren } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logoutRequest } from "@/features/auth/api";
import { useAuthStore } from "@/stores/authStore";

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clear();
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/10">
        <nav className="flex items-center gap-4">
          <Link to="/app" className="font-semibold">
            DecisionForge AI
          </Link>
          <Link to="/app" className="text-sm text-text/70 hover:text-text">
            Dashboard
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user && (
            <Button
              variant="ghost"
              onClick={() => logoutMutation.mutate()}
              isLoading={logoutMutation.isPending}
            >
              Sign out
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
