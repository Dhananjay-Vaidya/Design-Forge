import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { LogoMark } from "@/components/Logo";
import { useAuthStore } from "@/stores/authStore";

export function AuthGuard({ children }: PropsWithChildren) {
  const user = useAuthStore((s) => s.user);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-4"
        role="status"
        aria-live="polite"
      >
        <LogoMark className="h-10 w-10 animate-pulse" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}
