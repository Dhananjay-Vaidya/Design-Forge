import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { AuthGuard } from "@/app/AuthGuard";
import { useAuthStore } from "@/stores/authStore";

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/app"
          element={
            <AuthGuard>
              <div>Protected content</div>
            </AuthGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthGuard", () => {
  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: true });
  });

  it("shows a loading state while bootstrapping", () => {
    useAuthStore.setState({ isBootstrapping: true });
    renderGuard();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    useAuthStore.setState({ isBootstrapping: false, user: null });
    renderGuard();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    useAuthStore.setState({
      isBootstrapping: false,
      user: {
        id: "1",
        email: "a@example.com",
        created_at: "2026-01-01T00:00:00Z",
        profile: { display_name: "", timezone: "UTC", quota_tier: "free", preferences: {} },
      },
    });
    renderGuard();
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});
