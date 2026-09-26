import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

import { Skeleton } from "@/components/States";
import { Toaster } from "@/components/Toaster";
import { useAuthBootstrap } from "@/features/auth/useAuthBootstrap";
import { AlternativesTab } from "@/features/decisions/components/AlternativesTab";
import { CriteriaTab } from "@/features/decisions/components/CriteriaTab";
import { ScoresTab } from "@/features/decisions/components/ScoresTab";
import { WorkspaceIndex } from "@/features/decisions/components/WorkspaceIndex";
import { DashboardPage } from "@/pages/DashboardPage";
import { DecisionWorkspacePage } from "@/pages/DecisionWorkspacePage";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { NewDecisionPage } from "@/pages/NewDecisionPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RegisterPage } from "@/pages/RegisterPage";

import { AppShell } from "./AppShell";
import { AuthGuard } from "./AuthGuard";

// Recharts is the heaviest dependency; only load it when a ranking is actually opened.
const RankingTab = lazy(() =>
  import("@/features/decisions/components/RankingTab").then((m) => ({ default: m.RankingTab })),
);

export function App() {
  useAuthBootstrap();

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/app"
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="decisions/new" element={<NewDecisionPage />} />
          <Route path="decisions/:decisionId" element={<DecisionWorkspacePage />}>
            <Route index element={<WorkspaceIndex />} />
            <Route path="alternatives" element={<AlternativesTab />} />
            <Route path="criteria" element={<CriteriaTab />} />
            <Route path="scores" element={<ScoresTab />} />
            <Route
              path="ranking"
              element={
                <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
                  <RankingTab />
                </Suspense>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}
