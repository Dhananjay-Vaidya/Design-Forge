import { apiClient } from "@/api/client";
import type { LoginFormValues, RegisterFormValues } from "@/schemas/auth";
import type { AuthResponse, User } from "@/types/auth";

export async function registerRequest(values: RegisterFormValues): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/register", values);
  return data;
}

export async function loginRequest(values: LoginFormValues): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/login", values);
  return data;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export async function fetchCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>("/me");
  return data;
}

export async function primeCsrfCookie(): Promise<void> {
  await apiClient.get("/auth/csrf");
}

/** Silent refresh on app load: if a refresh cookie exists, this hydrates a new access token. */
export async function silentRefresh(): Promise<string | null> {
  try {
    const { data } = await apiClient.post<{ access: string }>("/auth/refresh");
    return data.access;
  } catch {
    return null;
  }
}
