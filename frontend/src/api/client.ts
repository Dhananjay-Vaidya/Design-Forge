import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "@/stores/authStore";
import type { ApiErrorEnvelope } from "@/types/api";
import { isApiErrorEnvelope } from "@/types/api";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api/v1";

/**
 * Single typed HTTP client. `withCredentials` is required so the httpOnly refresh
 * cookie is sent to /auth/refresh and /auth/logout (ADR-0001). CSRF cookie/header
 * names must match backend settings (config/settings/base.py CSRF_COOKIE_NAME/CSRF_HEADER_NAME).
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  xsrfCookieName: "df_csrftoken",
  xsrfHeaderName: "X-CSRFToken",
  // The SPA (:5173) and API (:8000) are different origins; since axios 1.6 the CSRF header is only
  // attached cross-origin when this is set. Without it the silent refresh on page load gets a 403
  // and every reload signs the user out. Safe: this client only ever talks to API_BASE_URL.
  withXSRFToken: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

export class ApiError extends Error {
  code: string;
  fields?: Record<string, string[]>;
  retryAfterSeconds?: number;
  requestId?: string;
  status?: number;

  constructor(body: ApiErrorEnvelope["error"], status?: number) {
    super(body.message);
    this.code = body.code;
    this.fields = body.fields;
    this.retryAfterSeconds = body.retry_after_seconds;
    this.requestId = body.request_id;
    this.status = status;
  }
}

let refreshPromise: Promise<string | null> | null = null;

/** Shared single-flight refresh; also used by the streaming AI chat, which bypasses axios. */
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post<{ access: string }>("/auth/refresh")
      .then((res) => res.data.access)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthEndpoint = original?.url?.includes("/auth/");

    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      const newAccess = await refreshAccessToken();
      if (newAccess) {
        useAuthStore.getState().setAccessToken(newAccess);
        original.headers.set("Authorization", `Bearer ${newAccess}`);
        return apiClient(original);
      }
      useAuthStore.getState().clear();
    }

    if (isApiErrorEnvelope(error.response?.data)) {
      throw new ApiError(error.response!.data.error, error.response?.status);
    }
    throw error;
  },
);
