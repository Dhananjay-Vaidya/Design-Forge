import { useEffect } from "react";

import { useAuthStore } from "@/stores/authStore";

import { fetchCurrentUser, primeCsrfCookie, silentRefresh } from "./api";

/**
 * Runs once on app load: seeds the CSRF cookie, then attempts a silent refresh using the
 * httpOnly refresh cookie (if present) so a returning user doesn't have to log in again.
 */
export function useAuthBootstrap() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await primeCsrfCookie().catch(() => undefined);
      const access = await silentRefresh();
      if (!access) {
        if (!cancelled) setBootstrapped();
        return;
      }
      useAuthStore.getState().setAccessToken(access);
      try {
        const user = await fetchCurrentUser();
        if (!cancelled) setAuth(user, access);
      } catch {
        if (!cancelled) useAuthStore.getState().clear();
      } finally {
        if (!cancelled) setBootstrapped();
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isBootstrapping };
}
