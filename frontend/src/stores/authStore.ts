import { create } from "zustand";

import type { User } from "@/types/auth";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isBootstrapping: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string | null) => void;
  setBootstrapped: () => void;
  clear: () => void;
}

/**
 * Access token lives only in memory (never localStorage/sessionStorage) per ADR-0001
 * (docs/architecture-decision-records/0001-auth-token-storage.md) to reduce XSS blast radius.
 * The refresh token is an httpOnly cookie the browser handles; this store never sees it.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isBootstrapping: true,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setBootstrapped: () => set({ isBootstrapping: false }),
  clear: () => set({ user: null, accessToken: null }),
}));
