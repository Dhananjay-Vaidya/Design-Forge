import { Route, Routes } from "react-router-dom";

import { useAuthBootstrap } from "@/features/auth/useAuthBootstrap";
import { DashboardPage } from "@/pages/DashboardPage";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RegisterPage } from "@/pages/RegisterPage";

import { AppShell } from "./AppShell";
import { AuthGuard } from "./AuthGuard";

export function App() {
  useAuthBootstrap();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <AuthGuard>
            <AppShell>
              <DashboardPage />
            </AppShell>
          </AuthGuard>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
