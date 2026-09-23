import { useAuthStore } from "@/stores/authStore";

/**
 * Placeholder for Phase 1 (M1 walking skeleton — reach a protected UI after login).
 * Full dashboard (active/completed/pending-review lists + calibration card) lands in
 * Phase 4 (DF-S-020, FR-015/016) once decisions/outcomes exist.
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-text/70">
        Signed in as <span className="font-medium">{user?.email}</span>. Decision management
        arrives in Phase 2.
      </p>
    </div>
  );
}
