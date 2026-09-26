import { type ComponentType, Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

import { Skeleton } from "@/components/States";
import { Toaster } from "@/components/Toaster";
import { useAuthBootstrap } from "@/features/auth/useAuthBootstrap";
import { WorkspaceIndex } from "@/features/decisions/components/WorkspaceIndex";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RegisterPage } from "@/pages/RegisterPage";

import { AppShell } from "./AppShell";
import { AuthGuard } from "./AuthGuard";

/** Route-level code splitting: each page (and Recharts, via RankingTab) loads on first visit. */
function page<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] })));
}

const LandingPage = page(() => import("@/pages/LandingPage"), "LandingPage");
const DashboardPage = page(() => import("@/pages/DashboardPage"), "DashboardPage");
const NewDecisionPage = page(() => import("@/pages/NewDecisionPage"), "NewDecisionPage");
const DecisionWorkspacePage = page(() => import("@/pages/DecisionWorkspacePage"), "DecisionWorkspacePage");
const AlternativesTab = page(() => import("@/features/decisions/components/AlternativesTab"), "AlternativesTab");
const CriteriaTab = page(() => import("@/features/decisions/components/CriteriaTab"), "CriteriaTab");
const ScoresTab = page(() => import("@/features/decisions/components/ScoresTab"), "ScoresTab");
const RankingTab = page(() => import("@/features/decisions/components/RankingTab"), "RankingTab");

const pageFallback = <Skeleton className="h-72 rounded-2xl" />;

export function App() {
  useAuthBootstrap();

  return (
    <>
      <Suspense fallback={<div className="mx-auto max-w-6xl px-4 pt-28">{pageFallback}</div>}>
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
            <Route path="ranking" element={<RankingTab />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}
