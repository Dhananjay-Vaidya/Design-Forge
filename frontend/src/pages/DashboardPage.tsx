import { CalendarDays, FolderOpen, Plus, Search, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { StatusChip } from "@/features/decisions/components/StatusChip";
import { useDecisions } from "@/features/decisions/hooks";
import { ACTIVE_STATUSES, COMPLETED_STATUSES } from "@/features/decisions/status";
import { daysUntil, deadlineLabel, timeAgo } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";
import type { Decision } from "@/types/decision";

type Filter = "all" | "active" | "completed" | "archived";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "In progress" },
  { value: "completed", label: "Committed" },
  { value: "archived", label: "Archived" },
];

function matchesFilter(decision: Decision, filter: Filter) {
  if (filter === "archived") return decision.status === "ARCHIVED";
  if (filter === "active") return ACTIVE_STATUSES.includes(decision.status);
  if (filter === "completed") return COMPLETED_STATUSES.includes(decision.status);
  return decision.status !== "ARCHIVED";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DecisionCard({ decision, index }: { decision: Decision; index: number }) {
  const overdue =
    decision.deadline && ACTIVE_STATUSES.includes(decision.status) && daysUntil(decision.deadline) < 0;

  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <Link
        to={`/app/decisions/${decision.id}`}
        className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-[border-color,box-shadow,transform] duration-base ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift"
      >
        <div className="flex items-start justify-between gap-3">
          <StatusChip status={decision.status} />
          <span className="whitespace-nowrap text-xs text-muted">{timeAgo(decision.updated_at)}</span>
        </div>
        <h3 className="mt-4 line-clamp-2 font-semibold leading-snug tracking-tight group-hover:text-primary">
          {decision.title}
        </h3>
        {decision.context && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{decision.context}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-5 text-xs text-muted">
          {decision.category && (
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              {decision.category}
            </span>
          )}
          {decision.deadline && (
            <span className={`inline-flex items-center gap-1.5 ${overdue ? "font-medium text-danger" : ""}`}>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {deadlineLabel(decision.deadline)}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-5 py-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error, refetch } = useDecisions();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const decisions = useMemo(() => data?.results ?? [], [data]);
  const counts = useMemo(
    () => ({
      all: decisions.filter((d) => matchesFilter(d, "all")).length,
      active: decisions.filter((d) => matchesFilter(d, "active")).length,
      completed: decisions.filter((d) => matchesFilter(d, "completed")).length,
      archived: decisions.filter((d) => matchesFilter(d, "archived")).length,
      ready: decisions.filter((d) => d.status === "SCORED").length,
    }),
    [decisions],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decisions.filter(
      (d) =>
        matchesFilter(d, filter) &&
        (!q || `${d.title} ${d.context} ${d.category}`.toLowerCase().includes(q)),
    );
  }, [decisions, filter, query]);

  const name = user?.profile.display_name || user?.email.split("@")[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted">
            {greeting()}
            {name ? `, ${name}` : ""}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your decisions</h1>
        </div>
        <ButtonLink to="/app/decisions/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New decision
        </ButtonLink>
      </div>

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[78px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading decisions">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        </>
      ) : isError ? (
        <ErrorState title="Couldn't load your decisions" error={error} onRetry={() => refetch()} />
      ) : decisions.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Frame your first decision"
          description="Name what you're deciding, list the options, choose the criteria that matter, and get a ranking you can explain."
          action={
            <ButtonLink to="/app/decisions/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create your first decision
            </ButtonLink>
          }
          className="py-16"
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Open decisions" value={counts.all} />
            <StatTile label="In progress" value={counts.active} />
            <StatTile label="Ready to rank" value={counts.ready} />
            <StatTile label="Committed" value={counts.completed} />
          </dl>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div
              role="group"
              aria-label="Filter decisions"
              className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1"
            >
              {filters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={`inline-flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors ${
                    filter === f.value ? "bg-surface-2 text-text shadow-soft" : "text-muted hover:text-text"
                  }`}
                >
                  {f.label}
                  <span className="font-mono text-xs tabular-nums text-muted">{counts[f.value]}</span>
                </button>
              ))}
            </div>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search decisions"
                aria-label="Search decisions"
                className="input-base min-h-10 pl-9 text-sm"
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches"
              description={query ? `No decisions match “${query}” in this view.` : "There are no decisions in this view yet."}
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((d, i) => (
                <DecisionCard key={d.id} decision={d} index={i} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
